## ADR-44 — Recentrage de l'IA athlète : surface « Séances » unique (liste/calendrier), hub de groupe mince, onglet « Groupe » (amende ADR-43)

- **Statut :** Accepté (2026-06-21, validé d'office)
- **Date :** 2026-06-21
- **Amende :** ADR-43 §4 (le fil/calendrier du hub de groupe athlète).
- **Réf. :** ADR-43 (hub de groupe athlète), ADR-26 (`GET /groups/mine`), ADR-30 (provenance de groupe = Lot 2), ADR-37 (coéquipiers), ADR-24 (compétitions au calendrier) · écrans A-01 (accueil), A-02 (`AthleteSessionsScreen`), A-08 (`AthleteCalendarScreen` + `CalendarView`), TLX-173.

**Contexte.** Test utilisateur du hub (TLX-173) : l'athlète voit ses séances à **trois endroits** —
onglet **Séances** (A-02, liste), onglet **Calendrier** (A-08, calendrier + compétitions) et **dans
le groupe** (le hub re-listait un fil + un calendrier). Le fil du hub est une **copie** des onglets du
haut : en Lot 1, faute de provenance de groupe (ADR-30), il ne peut même pas se restreindre au groupe
→ il affiche exactement les mêmes données. De plus, l'accès au groupe passe par **Profil → Mon
groupe**, peu découvrable.

Cause de fond : **asymétrie de centre de gravité**. L'athlète est **centré séances** (1–2 groupes, un
coach ; le groupe sert surtout à voir *qui* et *les infos*). Le coach est **centré groupe** (le groupe
est son unité de pilotage). Dupliquer un fil/calendrier *dans* le groupe côté athlète va contre son
modèle mental et l'IA existante.

**Décision.**

### 1. Le hub de groupe athlète devient « mince »
On **retire** les volets **Séances** et **Calendrier** du hub athlète (ADR-43 §4, Lot 1). Le hub ne
garde que **Coéquipiers** (ADR-37) et **Infos** (méta + quitter). Le fil de séances n'a **qu'un seul
foyer** (onglet Séances). Conséquence : les composants de fil/calendrier introduits par TLX-173 Phase A
(`GroupSessionsTab`, `GroupCalendarTab`, ligne/hero dédiés, détail lecture seule `GroupSessionDetail`)
sont **retirés** — l'app réutilise A-02/A-08 (proven, et A-08 porte déjà les compétitions, ADR-24).

### 2. Surface « Séances » unique : bascule Liste ⇄ Calendrier
Les onglets **Séances** (A-02) et **Calendrier** (A-08) **fusionnent** en **un seul onglet
« Séances »** doté d'une bascule **Liste ⇄ Calendrier** (`SegmentedTabs`, rôle tab). Les deux vues
**réutilisent les écrans existants** (`AthleteSessionsScreen`, `AthleteCalendarScreen`) — zéro
ré-implémentation de calendrier, zéro régression compétitions. Le `Calendrier` disparaît de la tab bar
(toujours routable, et atteint par la bascule ou le raccourci d'accueil). **Lot 2** : un filtre « par
groupe » s'ajoutera **ici** (provenance ADR-30), jamais un écran séparé.

### 3. Onglet « Groupe » direct (sort de Profil)
Le groupe devient un **onglet de premier niveau** (résout la découvrabilité). L'emplacement est libéré
par la fusion §2 → tab bar : **Accueil · Séances · Progression · Groupe · Profil**. L'onglet Groupe
résout `GET /groups/mine` : 0 groupe → CTA « rejoindre » ; 1 → le hub directement ; N → liste → hub.
**Profil** perd la carte « Mon groupe ».

### 4. Un seul détail de séance, présence incluse
Le détail athlète reste l'écran unique **`session/[id]`** (`SessionDetailScreen`, consultation +
saisie de perf, A-03/A-04). Il **accueille le contrôle de présence** (RSVP, ADR-43 §1, Phase B) — qui
vivait dans le détail lecture-seule du hub, désormais supprimé. La carte « next-up » n'est pas
dupliquée : l'**Accueil** (A-01, section « À faire », plus proche échéance d'abord) en tient lieu.

### 5. Dérivation discipline (ADR-43 §2/§3) conservée
La dérivation **discipline / perf attendue** (`session-discipline`, `discipline-ui`) reste — elle
alimente désormais un **tag de discipline sur la ligne de séance** (`AssignmentListItem`, partagée
A-01/A-02), au lieu des pastilles du hub retiré. Les **pastilles de discipline au calendrier** sont
**différées** (suivi) : `CalendarView` (A-08) ne les porte pas encore.

### 6. Action destructive confirmée
« Quitter le groupe » exige désormais une **confirmation** (modale) avant `leaveGroup` — un tap unique
sur une action irréversible était trop fragile (constat de test).

**Conséquences.**

- **Positives :** une seule source pour les séances (fin de la triple redondance) ; groupe découvrable
  (onglet) ; détail unique (présence + perf au même endroit) ; aucune régression compétitions (A-08
  réutilisé) ; surface de tab bar inchangée (5 onglets). La dérivation discipline survit, visible sur
  la ligne de séance.
- **Négatives / coûts :** retrait de code Phase A de TLX-173 (fil/calendrier/détail du hub) — assumé,
  c'était la redondance pointée ; les **pastilles discipline au calendrier** et le **next-up enrichi**
  sont reportés ; un futur athlète multi-groupes verra, en Lot 1, le **même** fil quel que soit le
  groupe (le scope par groupe = Lot 2, filtre dans la surface Séances unique).

**Alternatives considérées.**

- **Garder le hub group-scoped avec son fil** (ADR-43 §4 inchangé). Écarté : c'est la redondance
  constatée ; non scopable en Lot 1 ; va contre le modèle « athlète centré séances ».
- **Fusionner sur les composants TLX-173** (mes fil/calendrier) plutôt que A-02/A-08. Écarté : ferait
  perdre l'intégration **compétitions** d'A-08 (ADR-24) et imposerait de re-prouver la parité ; A-02/
  A-08 sont éprouvés. La richesse (pastilles, next-up) est reportée en additif sur l'existant.
- **Onglet Groupe en plus des 5 (6 onglets).** Écarté : tab bar surchargée sur mobile ; la fusion §2
  libère proprement l'emplacement.
- **Laisser « Quitter » sans confirmation.** Écarté : action irréversible déclenchée par accident en
  test.
