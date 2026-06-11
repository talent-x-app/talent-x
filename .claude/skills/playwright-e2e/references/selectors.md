# Catalogue des `testID` par écran

`react-native-web` rend `testID="x"` en `data-testid="x"` → cibler avec
`page.getByTestId('x')`. Ci-dessous les `testID` réels au moment de la rédaction
(2026-06-11) ; **toujours vérifier dans le composant courant** avant de s'y fier
(les écrans évoluent). Si un élément à cibler n'a pas de `testID`, l'ajouter dans le
composant plutôt que de viser par texte/CSS.

Convention : les listes utilisent des `testID` **dynamiques** suffixés par l'id de
l'entité, ex. `coach-dashboard-athlete-${athlete.id}`, à reconstruire côté test avec
l'id renvoyé par le seed.

## Auth — `app/(auth)/login.tsx`, `register.tsx`

| testID                                     | élément              |
| ------------------------------------------ | -------------------- |
| `login-email`                              | champ email          |
| `login-password`                           | champ mot de passe   |
| `login-submit`                             | bouton connexion     |
| `register-firstName` / `register-lastName` | prénom / nom         |
| `register-email` / `register-password`     | email / mot de passe |
| `register-submit`                          | bouton inscription   |

## Dashboard coach — `src/dashboard/CoachDashboardScreen.tsx`

| testID                                          | élément                   |
| ----------------------------------------------- | ------------------------- |
| `coach-dashboard-loading` / `-error` / `-retry` | états de chargement       |
| `coach-dashboard-subtitle`                      | sous-titre                |
| `coach-dashboard-new-session`                   | CTA nouvelle séance       |
| `coach-dashboard-kpi-toreview` / `-kpi-today`   | cartes KPI                |
| `coach-dashboard-empty`                         | état vide                 |
| `coach-dashboard-manage-groups`                 | lien gestion groupes      |
| `coach-dashboard-athlete-${id}`                 | carte athlète (dynamique) |

## Builder de séance — `src/coach/SessionBuilderScreen.tsx`

| testID                                                               | élément               |
| -------------------------------------------------------------------- | --------------------- |
| `session-builder-loading` / `-error` / `-retry` / `-back` / `-title` | chrome de l'écran     |
| `session-field-title` / `-description` / `-date`                     | champs de base        |
| `session-status-draft` / `-published`                                | choix de statut       |
| `session-add-block`                                                  | ajouter un bloc       |
| `session-builder-validation`                                         | message de validation |
| `session-save`                                                       | enregistrer           |
| `session-assign`                                                     | assigner              |

## Brief de séance — `src/athlete/brief-ui.tsx`

| testID                                                 | élément                   |
| ------------------------------------------------------ | ------------------------- |
| `brief-metrics`                                        | conteneur métriques       |
| `brief-metric-duration` / `-exercises` / `-difficulty` | métriques individuelles   |
| `brief-athlete-intent`                                 | intention athlète         |
| `brief-success-stop` / `brief-success` / `brief-stop`  | bloc « réussite / arrêt » |

## Détail séance athlète — `src/athlete/SessionDetailScreen.tsx`

| testID               | élément                  |
| -------------------- | ------------------------ |
| `submit-performance` | soumettre la performance |

> Pour découvrir les `testID` d'un autre écran :
> `grep -rn "testID=" apps/mobile/src/<dossier>` (ou l'outil Grep).
