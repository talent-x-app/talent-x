#!/usr/bin/env python3
"""maxwatch — veille des places TGV Max Jeune à 0 € (Open Data SNCF, dataset tgvmax).

Interroge l'API Opendatasoft v2.1 de la SNCF, filtre selon les paramètres
ci-dessous, compare avec l'état précédent (state.json) et envoie une
notification ntfy pour chaque NOUVELLE disponibilité.

Usage :
    python maxwatch.py            # run normal (notifie + met à jour state.json)
    python maxwatch.py --dry-run  # affiche ce qui serait notifié, ne touche à rien
"""

import json
import os
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

# ============================================================================
# PARAMÈTRES — n'édite que cette section (éditable depuis l'éditeur web GitHub)
# ============================================================================

# Trajets surveillés : (gare de départ, gare d'arrivée).
# ⚠️ Orthographe EXACTE des gares dans l'Open Data SNCF (vérifiée par appel réel
# le 2026-07-14). Quelques valeurs utiles :
#   "PARIS (intramuros)"      "LYON (intramuros)"     "LYON ST EXUPERY TGV."
#   "MARSEILLE ST CHARLES"    "BORDEAUX ST JEAN"      "LILLE (intramuros)"
#   "NANTES"  "RENNES"  "MONTPELLIER SAINT ROCH"      "AIX EN PROVENCE TGV"
# Pour la liste complète : run "maxwatch-discovery" dans l'onglet Actions.
TRAJETS = [
    ("PARIS (intramuros)", "NANCY"),
    ("NANCY", "PARIS (intramuros)"),
]

# Jours de départ surveillés, en toutes lettres et en minuscules.
# Valeurs possibles : "lundi" "mardi" "mercredi" "jeudi" "vendredi" "samedi" "dimanche"
# Liste vide [] = tous les jours.
JOURS = ["vendredi", "samedi", "dimanche"]

# Créneau horaire de départ, format "HH:MM" (heure locale France). None = pas de borne.
HEURE_MIN = "16:00"  # ex. "16:00" → uniquement les départs à partir de 16h00
HEURE_MAX = None     # ex. "21:00" → uniquement les départs jusqu'à 21h00

# Horizon de recherche en jours (la SNCF n'ouvre pas les ventes Max au-delà de ~30 j).
HORIZON_JOURS = 30

# ============================================================================
# Fin des paramètres — ne rien éditer sous cette ligne
# ============================================================================

API_URL = "https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax/records"
NTFY_URL = "https://ntfy.sh/{topic}"
STATE_FILE = Path(__file__).parent / "state.json"
PAGE_SIZE = 100
TIMEOUT = 30
RETRIES = 3

JOURS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]


def log(msg: str) -> None:
    print(msg, flush=True)


def fetch_route(session: requests.Session, origine: str, destination: str,
                date_min: date, date_max: date) -> list[dict]:
    """Récupère toutes les dispos Max Jeune (od_happy_card = OUI) d'un trajet.

    Lève requests.RequestException après épuisement des retries.
    """
    where = (
        f'origine = "{origine}" AND destination = "{destination}" '
        f'AND od_happy_card = "OUI" '
        f"AND date >= date'{date_min.isoformat()}' AND date <= date'{date_max.isoformat()}'"
    )
    records: list[dict] = []
    offset = 0
    while True:
        params = {
            "where": where,
            "order_by": "date, heure_depart",
            "limit": PAGE_SIZE,
            "offset": offset,
        }
        last_err: Exception | None = None
        for attempt in range(RETRIES):
            try:
                resp = session.get(API_URL, params=params, timeout=TIMEOUT)
                resp.raise_for_status()
                break
            except requests.RequestException as exc:
                last_err = exc
                wait = 2 ** attempt
                log(f"  ! erreur réseau ({exc.__class__.__name__}), retry dans {wait}s")
                time.sleep(wait)
        else:
            raise requests.RequestException(f"échec après {RETRIES} tentatives: {last_err}")

        results = resp.json().get("results", [])
        records.extend(results)
        if len(results) < PAGE_SIZE:
            return records
        offset += PAGE_SIZE


def jour_francais(d: date) -> str:
    return JOURS_FR[d.weekday()]


def garder(record: dict) -> bool:
    """Applique les filtres jours + créneau horaire."""
    d = date.fromisoformat(record["date"])
    if JOURS and jour_francais(d) not in JOURS:
        return False
    hd = record.get("heure_depart") or ""
    if HEURE_MIN and hd < HEURE_MIN:
        return False
    if HEURE_MAX and hd > HEURE_MAX:
        return False
    return True


def cle(record: dict) -> str:
    return (f"{record['date']} {record['heure_depart']} "
            f"train {record['train_no']} {record['origine']} > {record['destination']}")


def charger_etat() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            log(f"! state.json illisible ({exc}), repart de zéro")
    return {"disponibles": {}}


def notifier(nouvelles: list[dict]) -> bool:
    """Envoie UNE notification ntfy listant les nouvelles dispos. True si OK."""
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic:
        log("! WARNING : variable NTFY_TOPIC absente — aucune notification envoyée. "
            "Ajoute le secret NTFY_TOPIC dans les réglages GitHub Actions du repo.")
        return False

    lignes = []
    for r in nouvelles[:20]:
        d = date.fromisoformat(r["date"])
        lignes.append(f"{jour_francais(d)[:3]} {d.strftime('%d/%m')} {r['heure_depart']} "
                      f"{r['origine']} > {r['destination']} (train {r['train_no']})")
    if len(nouvelles) > 20:
        lignes.append(f"... et {len(nouvelles) - 20} autres")
    corps = "\n".join(lignes)

    n = len(nouvelles)
    titre = f"{n} place{'s' if n > 1 else ''} TGV Max Jeune a 0 EUR"
    try:
        resp = requests.post(
            NTFY_URL.format(topic=topic),
            data=corps.encode("utf-8"),
            headers={
                "Title": titre,
                "Priority": "urgent",
                "Tags": "steam_locomotive",
                "Click": "https://www.sncf-connect.com/",
            },
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        log(f"→ notification ntfy envoyée ({n} nouvelle(s) dispo(s))")
        return True
    except requests.RequestException as exc:
        log(f"! WARNING : envoi ntfy échoué ({exc}) — l'état n'est pas mis à jour, "
            "les dispos seront re-signalées au prochain run.")
        return False


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    aujourd_hui = datetime.now(ZoneInfo("Europe/Paris")).date()
    date_max = aujourd_hui + timedelta(days=HORIZON_JOURS)

    log(f"maxwatch — {aujourd_hui} → {date_max}"
        f"{' [DRY-RUN]' if dry_run else ''}")
    log(f"trajets : {', '.join(f'{o} > {d}' for o, d in TRAJETS)}")
    log(f"jours : {JOURS or 'tous'} | créneau : {HEURE_MIN or '--'} → {HEURE_MAX or '--'}\n")

    etat = charger_etat()
    anciennes: dict = etat.get("disponibles", {})

    session = requests.Session()
    session.headers["User-Agent"] = "maxwatch/1.0 (veille perso TGV Max; github actions)"

    courantes: dict = {}
    trajets_en_echec: list[tuple[str, str]] = []

    for origine, destination in TRAJETS:
        try:
            records = fetch_route(session, origine, destination, aujourd_hui, date_max)
        except requests.RequestException as exc:
            log(f"! trajet {origine} > {destination} : API injoignable ({exc}) — "
                "on conserve l'état précédent pour ce trajet")
            trajets_en_echec.append((origine, destination))
            continue
        gardes = [r for r in records if garder(r)]
        log(f"{origine} > {destination} : {len(records)} dispo(s) Max, "
            f"{len(gardes)} après filtres")
        for r in gardes:
            courantes[cle(r)] = {
                "date": r["date"],
                "jour": jour_francais(date.fromisoformat(r["date"])),
                "heure_depart": r["heure_depart"],
                "heure_arrivee": r.get("heure_arrivee"),
                "train_no": r["train_no"],
                "origine": r["origine"],
                "destination": r["destination"],
            }

    # Trajet injoignable ce run : on reporte tel quel son état précédent, pour ne
    # pas générer de fausses "réapparitions" au run suivant.
    for k, v in anciennes.items():
        if any(v["origine"] == o and v["destination"] == d for o, d in trajets_en_echec):
            courantes.setdefault(k, v)

    nouvelles_cles = [k for k in courantes if k not in anciennes]
    disparues = [k for k in anciennes if k not in courantes]
    nouvelles = [courantes[k] for k in sorted(nouvelles_cles)]

    log(f"\nbilan : {len(courantes)} dispo(s) actuelle(s), "
        f"{len(nouvelles)} nouvelle(s), {len(disparues)} disparue(s)")
    for k in sorted(nouvelles_cles):
        log(f"  + {k}")
    for k in sorted(disparues):
        log(f"  - {k}")

    if dry_run:
        log("\n[DRY-RUN] aucune notification envoyée, state.json non modifié")
        return 0

    if nouvelles:
        if not notifier(nouvelles):
            # Pas de notif partie → on ne "consomme" pas ces dispos : state inchangé.
            return 0

    nouveau_etat = {
        "maj": datetime.now(ZoneInfo("Europe/Paris")).isoformat(timespec="seconds"),
        "disponibles": courantes,
    }
    STATE_FILE.write_text(json.dumps(nouveau_etat, ensure_ascii=False, indent=2) + "\n",
                          encoding="utf-8")
    log("state.json mis à jour")
    return 0


if __name__ == "__main__":
    sys.exit(main())
