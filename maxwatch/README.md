# maxwatch — veille TGV Max Jeune à 0 €

Toutes les ~15 min, un workflow GitHub Actions interroge l'Open Data SNCF
(dataset `tgvmax`, mis à jour **une fois par jour** par la SNCF), détecte les
**nouvelles** places Max Jeune sur les trajets configurés, et envoie une
notification push sur ton téléphone via [ntfy](https://ntfy.sh).

Une place qui disparaît puis réapparaît (annulation d'une résa) redéclenche
une alerte : c'est voulu.

## Mise en route (tout se fait depuis le téléphone)

1. **Installer ntfy** : app « ntfy » sur le Play Store / App Store.
2. **Choisir un topic secret** : dans l'app, « + » → s'abonner à un topic avec
   un nom long et imprévisible, ex. `maxwatch-idrissa-k7f2p9qx3w`.
   ⚠️ Le topic est le seul « mot de passe » : quiconque le connaît peut lire
   tes notifs. Ne le mets jamais dans le code.
3. **Créer le secret GitHub** : sur github.com (navigateur mobile, « version
   ordinateur » si besoin) → repo → **Settings** → **Secrets and variables**
   → **Actions** → **New repository secret** :
   - Name : `NTFY_TOPIC`
   - Secret : le nom du topic choisi en 2.
4. **Merger la branche dans `main`** : le cron GitHub ne tourne que sur la
   branche par défaut. Ouvrir la PR de la branche
   `claude/tgv-max-jeune-monitor-4pxos5` et la merger.
5. **Tester** : onglet **Actions** → workflow **maxwatch** → **Run workflow**
   (laisser dry-run décoché). Le premier run notifie tout ce qui est
   actuellement dispo (état initial vide) — c'est normal, une seule notif
   groupée.
6. C'est tout. Le cron prend le relais (toutes les 15 à 30 min en pratique,
   les crons GitHub sont « best effort »).

## Modifier les trajets / jours / horaires

Éditer la section `PARAMÈTRES` en haut de [`maxwatch.py`](./maxwatch.py)
directement dans l'éditeur web GitHub (icône crayon). L'orthographe des gares
doit être EXACTEMENT celle de l'Open Data — la liste complète s'obtient en
lançant le workflow **maxwatch-discovery** dans l'onglet Actions (tant qu'il
existe) ou via :
`https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax/records?select=origine&group_by=origine&limit=100`

## Fichiers

- `maxwatch.py` — le script (Python 3.12, dépendance unique : `requests`).
- `state.json` — l'état : les dispos vues au dernier run, committé
  automatiquement par le workflow. Ne contient que ce qui est ENCORE
  disponible, pour que les réapparitions re-notifient.
- `../.github/workflows/maxwatch.yml` — le cron.

## Points d'attention

- **Visibilité du repo** : `state.json` révèle les trajets surveillés. Si le
  repo est public, penser à le passer en privé (Settings → General → Change
  visibility).
- GitHub **désactive les crons après ~60 jours sans activité** sur le repo et
  envoie un mail avant. Les commits de `state.json` comptent comme activité,
  donc ça ne devrait arriver que si aucune dispo ne bouge pendant 60 jours.
- L'Open Data n'est rafraîchi qu'**une fois par jour** : ce système rate les
  places qui se libèrent en cours de journée (annulations). Une vraie source
  temps réel nécessiterait l'API non documentée du simulateur
  maxjeune-tgvinoui.sncf — non vérifiée à ce jour, donc non implémentée.
