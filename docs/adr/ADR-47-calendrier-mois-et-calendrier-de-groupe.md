## ADR-47 — Vue calendrier **mensuelle** + **calendrier de groupe** scopé au coach (amende ADR-44)

- **Statut :** Accepté (2026-06-22, validé d'office)
- **Amende :** ADR-44 §1 (hub de groupe « mince », sans calendrier) et §2 (calendrier unifié).
- **Réf. :** ADR-43 (séances/discipline dérivée), ADR-44 (recentrage IA), ADR-36 (séance libre `self_logged`), ADR-30 (provenance de groupe = Lot 2), ADR-26 (coach du groupe), A-08 (`AthleteCalendarScreen`/`CalendarView`), TLX-173.

**Contexte.** Deux manques relevés en test :
1. Le calendrier (A-08, `CalendarView`) n'affiche qu'une **vue semaine** — pas de **vue mois**.
2. Le hub de groupe (mince depuis ADR-44) n'a **pas de calendrier**. Or **les séances du groupe ≠
   les séances de l'athlète** : un athlète peut créer ses **séances libres** (`self_logged`, ADR-36,
   `session.coachId = athleteId`). Le calendrier global de l'onglet Séances mélange les deux ; il
   manque une vue **« calendrier du groupe »**.

ADR-44 avait retiré le calendrier du hub car, sans provenance de groupe (Lot 2, ADR-30), il aurait
**dupliqué** le calendrier global. **Nouvel angle** : on peut scoper « les séances du groupe » **sans
Lot 2**, par le **coach du groupe** — `session.coachId === group.coach.id` (ADR-26). Cela exclut
naturellement les séances libres de l'athlète (`coachId = athleteId`) et les séances d'un autre coach.

**Décision.**

### 1. Composant `SessionsCalendar` réutilisable, avec vue **Mois ⇄ Semaine**
Nouveau composant présentationnel (helpers purs `calendar-grid.ts`) : grille **mensuelle** (défaut)
ou bande **hebdomadaire**, pastilles de discipline **dérivées** (ADR-43 §2), sélection d'un jour →
ses séances (ligne `AssignmentListItem`). Piloté par une **liste d'affectations** fournie par
l'appelant. Remplace le `CalendarView` semaine-seule pour la vue calendrier.

### 2. Le calendrier de l'onglet Séances passe en mois
La vue « Calendrier » de l'onglet Séances (ADR-44 §2) utilise `SessionsCalendar` sur **toutes** les
séances de l'athlète (vue personnelle complète). Le lien **« Mes compétitions »** est conservé ; les
compétitions **en tant qu'entrées du calendrier** (A-08) sont **différées** (suivi) — la vue mois
prime pour le MVP.

### 3. Nouveau calendrier **dans le hub de groupe**, scopé au coach
Onglet **« Calendrier »** réintroduit dans le hub athlète : `SessionsCalendar` alimenté par les
affectations de l'athlète **filtrées** `session.coachId === group.coach.id` → uniquement les séances
**programmées par le coach de ce groupe**, **hors séances libres** de l'athlète. Hub : **Annonces ·
Calendrier · Coéquipiers · Infos**. Aucun changement de contrat (filtrage client sur le `coachId`
déjà embarqué dans `session`).

**Conséquences.**

- **Positives :** vue **mois** disponible partout ; le hub regagne un calendrier **utile et distinct**
  (séances du coach, pas les séances perso), **sans** dépendre du Lot 2 ; un seul composant calendrier
  partagé (cohérence, pastilles discipline). Réutilise les helpers purs supprimés en ADR-44 (rien de
  perdu).
- **Négatives / coûts :** le scope « groupe » reste une **approximation par coach** (une séance
  affectée individuellement par le même coach apparaît aussi — indistinguable sans Lot 2 ; acceptable,
  le besoin est d'exclure les séances *self-logged*) ; compétitions retirées de la grille (lien
  conservé) ; léger recoupement entre le calendrier perso (Séances) et celui du groupe pour un
  athlète mono-coach (assumé : l'un filtre les séances libres, l'autre non).

**Alternatives considérées.**

- **Ajouter une vue mois à `CalendarView`** (A-08) plutôt qu'un nouveau composant. Écarté : la grille
  mensuelle + pastilles existait déjà (ADR-43, supprimée ADR-44) — la réutiliser est plus simple et
  cohérent ; A-08 reste pour le coach si besoin.
- **Scoper le calendrier de groupe par provenance `group_assignment_id` (Lot 2).** Écarté du MVP :
  pas disponible ; le filtre par coach répond au besoin (exclure les séances libres) sans contrat.
- **Garder le hub sans calendrier (ADR-44).** Écarté : le test produit montre le besoin réel d'un
  calendrier *du groupe* distinct des séances perso.
