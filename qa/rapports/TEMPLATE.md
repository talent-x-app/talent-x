# Rapport de campagne — AAAA-MM-JJ — <portée>

> Copier ce fichier en `qa/rapports/AAAA-MM-JJ-<portée>.md`. Un rapport dit ce qui a
> été **mesuré**, avec quoi, et ce qu'on en conclut — jamais un « ça marche » nu.

## Contexte

|                      |                                                   |
| -------------------- | ------------------------------------------------- |
| Commit déployé (API) | `sha` — CI verte : oui/non                        |
| Build mobile         | profil, SHA EAS, date d'expiration                |
| Appareils            | modèle + OS                                       |
| Comptes QA           | alias utilisés (jamais d'adresse inventée)        |
| Préflight QA-08.1    | ✅ / ❌ (un préflight rouge invalide la campagne) |

## Résultats par scénario

| Scénario | Verdict                            | Preuve (SQL/log/HTTP) | Commentaire |
| -------- | ---------------------------------- | --------------------- | ----------- |
| QA-0x.y  | ✅ / ❌ / ⚠️ partiel / ⏭ non joué |                       |             |

Verdicts : ✅ conforme · ❌ défaut (ticket obligatoire) · ⚠️ partiel (dire ce qui
manque) · ⏭ non joué (dire pourquoi).

## Défauts ouverts pendant la campagne

| Ticket  | Sévérité                   | Scénario | Résumé |
| ------- | -------------------------- | -------- | ------ |
| TLX-xxx | bloquant / majeur / mineur | QA-0x.y  |        |

## Vérifié vs supposé

Deux listes distinctes — c'est la colonne vertébrale du rapport :

- **Mesuré** : …
- **Supposé / déduit** (et ce qu'il faudrait pour le mesurer) : …

## Écarts du registre (§7 du plan) touchés par cette campagne

| Ligne du registre | Confirmé / Résolu / Aggravé |
| ----------------- | --------------------------- |

## Suites à donner

- [ ] …
