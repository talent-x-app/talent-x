## ADR-50 — Mur Palier 3 : fil de réponses sous annonce + modération

- **Statut :** Accepté (2026-06-23 — réouverture d'ADR-46 validée explicitement ; exécute ADR-48 §Palier 3 / TLX-186)
- **Date :** 2026-06-23
- **Réf. :** ADR-48 §Palier 3 · ADR-46 (exclusion chat groupe — **réouverture**) · ADR-45 (patron d'agrégat) ·
  ADR-37 §4 (identité minimisée) · ADR-08/21 (frontière santé/perf) · ADR-15 (purge à l'effacement) ·
  ADR-22/23 (notifications) · TX-DPIA-007 §5.7 · `talent-x-openapi.yaml` · Mockup `mockups/group-wall.html`

**Contexte.** ADR-46 a **explicitement écarté** le fil bidirectionnel (« chat de groupe ») du MVP pour
trois raisons assumées : **modération**, **charge**, **RGPD pair-à-pair**. ADR-48 a confirmé que rouvrir
cette décision suppose, **avant toute ligne de code**, de cadrer scope + modération + RGPD (un ADR
d'exécution par palier). La réouverture a été **validée explicitement** (CLAUDE.md §7). Le blocage AIPD
qui pesait sur les paliers nominatifs est **levé** : la visibilité d'identité pair-à-pair est actée en
TX-DPIA-007 §5.5/5.6 (TLX-150, livré). Le seul coût réellement structurant restant est donc la
**modération** — ce qui justifie que ce palier soit le dernier.

**Décision.**

**D1 — Objet & scope (réponses sous une annonce).** Fil court rattaché à `group_announcements`, **pas**
réutilisation de `comments` (option B écartée — `comments` est scopé séance/perf et porte la grammaire
FeedbackThread ; les mélanger brouillerait deux objets, cf. ADR-46 §Alternatives). Nouvelle table
`announcement_replies(id, announcement_id FK, author_id FK, body, created_at, deleted_at, deleted_by_id)`.
Corps **texte seul ≤ 500 caractères** (fil court ≠ annonce ≤ 1000). Pas d'édition (supprimer + republier,
cohérent ADR-46). Tri **chronologique croissant** (lecture d'un fil). Soft-delete (`deleted_at`) +
`deleted_by_id` pour **tracer** un retrait auteur vs un retrait de modération coach.

**D2 — RBAC.** Lire **et** écrire = **coach propriétaire OU membre actif** du groupe (même garde fine que
les réactions ADR-48, pas de `@Roles` au contrôleur : 404 anti-énumération hors périmètre). Le fil est
**bidirectionnel** : coach et athlètes y répondent à égalité (≠ annonce, descendante).

**D3 — Modération (non négociable).**
- **Suppression** (soft) : l'**auteur** de sa propre réponse **OU** le **coach propriétaire** (propriétaire
  éditorial du groupe). `deleted_by_id` distingue les deux.
- **Signalement** : tout membre/coach (≠ auteur) signale une réponse — table
  `announcement_reply_reports(reply_id, reporter_id, reason, created_at)`, **unique** `(reply_id, reporter_id)`
  (idempotent), `reason` borné (enum serveur : `spam` · `abuse` · `offensive` · `other`).
- **Masquage automatique anti-abus** : au-delà de `REPLY_REPORTS_HIDE_THRESHOLD` (défaut **3**) signalements
  **distincts**, la réponse est **masquée aux non-coachs** (`hidden: true` dans le contrat, corps remplacé)
  en attendant la revue du coach, qui la voit **avec le compteur** (`reportCount`) pour trancher. Mesure
  concrète, déterministe et testable, sans tâche planifiée.
- **Anti-spam (rate-limit applicatif)** : plafond `REPLY_MAX_PER_ANNOUNCEMENT_PER_AUTHOR` (défaut **30**)
  → 422 `REPLY_RATE_LIMITED`. Pas de dépendance à un throttler global (absent du socle) ; borne
  déterministe par `count` (cohérent avec le style des gardes 422 du Palier 2).
- **Blocage d'un membre** (bannir du fil) : **différé** hors de ce palier — le couple
  *masquage-sur-signalement* + *suppression coach* couvre le besoin de modération MVP. Un blocage durable
  relèverait d'une capacité « gestion de membre » transverse (futur ticket).

**D4 — RGPD (contenu rédigé par des pairs).** Le contenu est **édité par l'utilisateur** (≠ annonce du
coach) : Talent-X reste **sous-traitant technique**, le coach **responsable éditorial** du groupe (pouvoir
de suppression). **Conservation** = vie de l'annonce porteuse. **Purge à l'effacement de compte
(ADR-15)** : FK `author_id`/`reporter_id` **`ON DELETE CASCADE`** vers `users` → au purge dur du compte,
réponses et signalements de la personne disparaissent. Tant que le compte est seulement **soft-deleted**
(anonymisation différée), l'identité de l'auteur n'est **pas exposée** dans le fil : un auteur au compte
clos est présenté **« Membre »** (mêmes règles de minimisation que le roster ADR-37 — auteur filtré sur
`deletedAt: null`). Documenté en **TX-DPIA-007 §5.7**.

**D5 — Notification (anti-bruit).** À la publication d'une réponse, on notifie **uniquement l'auteur de
l'annonce** (le plus souvent le coach) — **nouveau type `group_reply`**, gardé par la préférence
**`groupUpdates`** existante (pas de nouvelle colonne), contenu générique `resourceId = groupId` (ADR-10)
→ tap = ouvrir le hub. **Pas** de fan-out à tout le groupe ni aux autres répondeurs (le risque de bruit de
notifications est explicitement surveillé, ADR-48 §Conséquences). On ne se notifie pas soi-même.

**Invariants transverses (rappel ADR-48).** Frontière **santé/perf intacte** (ADR-08/21) : un fil porte du
texte libre sur une **annonce**, jamais une perf/charge/record. Réutilisation infra (annonces ADR-46,
notifications ADR-22/23, identité minimisée ADR-37). **Zéro valeur en dur** : longueur, seuil de masquage
et plafond anti-spam via `.env` ; `reason` borné par enum serveur (miroir CHECK base) ; libellés/icônes via
tokens DS côté front.

**Conséquences.**
- **Positives :** ferme la trajectoire ADR-48 (hub → Mur social complet) ; modération **native** dès la
  livraison (pas de dette) ; réutilisation massive (aucune nouvelle pile) ; chaque garde est défendable et
  réversible (désactiver le fil → on retombe au Palier 2 sans régression).
- **Négatives / coûts :** deux tables (`announcement_replies`, `announcement_reply_reports`) + un type de
  notif (CHECK étendu, migration additive) ; le masquage sur seuil est une heuristique simple (pas de file
  de modération dédiée) ; blocage de membre différé.

**Alternatives considérées.**
- **Réutiliser `comments` (scopé séance, FeedbackThread TLX-118).** Écartée (D1) : objets et scopes
  différents (séance/perf vs annonce de groupe) ; les fusionner brouillerait la grammaire.
- **Fan-out de la réponse à tout le groupe.** Écartée (D5) : bruit de notifications ; le canal social du
  fil n'a pas vocation à pousser autant qu'une annonce.
- **File de modération + workflow de revue dédié.** Hors MVP : le masquage sur seuil + suppression coach
  suffit ; une vraie file relèverait d'un outillage admin ultérieur.
- **Blocage durable d'un membre au Palier 3.** Différé : capacité transverse de gestion de membre, hors du
  périmètre « fil de discussion ».
