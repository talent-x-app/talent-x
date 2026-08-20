# Rapport de campagne — 2026-08-20 — QA-03 (parcours athlète, complet)

Sixième session. **Les dix scénarios de QA-03 ont été déroulés de bout en bout sur
appareil réel**, avec le compte `+qa-a3` (« Zoe QA »).

Le parcours fonctionne. Ce qui l'entoure l'est moins : **neuf défauts ouverts**, dont
aucun ne casse le chemin nominal et plusieurs sont irréversibles pour l'athlète. Trois
attendus de mes propres fiches se sont révélés faux, et **`main` est rouge depuis la
veille sans que personne l'ait vu** — moi le premier.

## Contexte

|              |                                                                                 |
| ------------ | ------------------------------------------------------------------------------- |
| Appareil     | Android S20 FE — athlète `+qa-a3` (`ae451bdf`)                                  |
| Groupe       | « Qa-02 renommé » `f256330f`, coach `+qa-coach` (`99caef46`)                    |
| `main`       | `ce067d9` au début, `c82c6c6` après fusion du lot 4                             |
| Suite mobile | 119 suites, **1121 tests** verts — mais **couverture en échec**, voir §CI       |
| Staging      | 7 conteneurs, inchangé ; aucun redéploiement (tous les correctifs sont mobiles) |

## Résultats par scénario

| Scénario                                 | Verdict     | Preuve                                                                       |
| ---------------------------------------- | ----------- | ---------------------------------------------------------------------------- |
| QA-03.1 — premier lancement connecté     | ✅          | carte « Rejoins ton coach », zone sûre respectée                             |
| QA-03.2 — code invalide puis **scan QR** | ✅          | code prérempli après scan, adhésion confirmée                                |
| QA-03.3 — liste ⇄ calendrier, pastilles  | ✅          | disciplines dérivées des blocs                                               |
| QA-03.4 — RSVP et agrégat de présence    | ✅          | **orthogonalité ADR-43/31 prouvée** : `maybe / null / assigned`              |
| QA-03.5 — saisie puis correction de perf | ✅ + ❌     | 6 lignes honorées, correction tracée dans `audit_log` — **TLX-223 confirmé** |
| QA-03.6 — progression                    | ✅ + ❌     | graphes lisibles — **TLX-244** : le compteur de marques compte des jours     |
| QA-03.7 — records                        | ✅ + ❌     | record manuel en base, `performance_id` NULL — **TLX-243**                   |
| QA-03.8 — séance libre                   | ✅ + ❌❌❌ | chaîne ADR-36 intacte, cloisonnement prouvé — **TLX-246/247/248/249**        |
| QA-03.9 — profil et avatar               | ✅ + ❌❌   | cycle complet mesuré à la seconde — **TLX-250/251**                          |
| QA-03.10 — quitter puis re-rejoindre     | ✅          | `left_at` posé, ligne conservée, lien coach clos puis rouvert                |

## Ce que ce déroulé a établi de plus utile

### Un « rien trouvé » ne vaut que s'il est accompagné d'un témoin positif

Le cloisonnement ADR-51 §D3 — le coach ne voit pas l'entraînement libre de son athlète —
a été vérifié en cherchant les marques **au centième** dans le corps brut de cinq
lectures coach. Aucune ne les contient. Mais ce résultat n'aurait rien valu seul : la
**même sonde**, passée sur le compte de l'athlète, y trouve 7.9, 7.5, 7.48 et les deux
identifiants de séance. La sonde sait détecter une fuite ; son silence côté coach est
donc une mesure, pas un artefact.

**La démonstration par l'absurde est venue dans la foulée.** J'ai voulu vérifier qu'un
athlète sorti du groupe ne voit plus les séances du coach : sondé `+qa-athlete2`, listes
vides, conclusion apparente immédiate. Sauf qu'il **n'a jamais eu la moindre
affectation** — 0 ligne en base, vérifié après coup. Un vide qui ne prouvait rien. La
question reste ouverte, et c'est le seul résultat de cette session que je n'ai pas su
établir.

### Un correctif a refermé un ticket qu'il ne visait pas

TLX-243 a posé une carte de rattrapage de record sur le détail de séance. Or le serveur
joint les candidats à **chaque lecture** d'une performance, y compris celle d'une séance
libre — mesuré sur les deux séances de la session :

```
GET /assignments/f546da5b-…/performance → recordCandidates: [7.9  sur sprint:60m]
GET /assignments/c464e830-…/performance → recordCandidates: [7.48 sur sprint:60m]
```

**TLX-246, ouvert le matin en priorité haute, est donc largement refermé l'après-midi
par un correctif écrit pour autre chose.** Il est passé en priorité basse : il ne reste
que l'absence de proposition _sur le moment_. Sans cette vérification, quelqu'un aurait
reconstruit un chemin qui fonctionne déjà.

### Les gestes destructifs du produit sont mal cadrés, et c'est un motif

Trois défauts ouverts cette semaine disent la même chose sous trois formes :

- **TLX-245** — la confirmation de suppression d'une séance restait armée et visait la suivante ;
- **TLX-250** — la suppression de la photo de profil est immédiate et définitive, dans un formulaire qui affiche « Annuler » juste en dessous ;
- **TLX-253** — l'athlète **ne peut pas** supprimer sa séance libre, alors qu'ADR-36 §5 le prescrit.

Deux suppressions trop faciles, une impossible. Aucune ne demande confirmation là où il
le faudrait. Le patron de confirmation inline existe pourtant (ADR-44 §6) et sert déjà
pour quitter un groupe — un geste bien moins définitif que perdre une photo.

### Deux ADR se contredisent, et c'est le texte périmé qui décrit une fuite

ADR-36 §3 annonce que le coach voit les marques libres sous consentement. ADR-51 §D3
borne toute lecture coach aux séances dont il est l'auteur — ce qui exclut le libre. Le
code applique le second. Mais ADR-51 ne cite pas ADR-36 et n'annonce pas qu'il l'amende,
alors que le journal marque habituellement ces reprises.

**Un développeur qui lit ADR-36 §3 aujourd'hui ouvrira la vue coach aux séances libres en
croyant corriger un défaut.** Le propriétaire a tranché le 20/08 : le coach ne voit pas
l'entraînement libre, même consenti. C'est donc le texte qu'on corrige (TLX-248).

## Trois corrections de la campagne elle-même

**Ma fiche QA-03.9 exigeait un avatar côté coach que le contrat ne porte pas.**
`GroupMember.athlete` référence `UserSummary` — id, prénom, nom, discipline, **sans
`photoUrl`** — et les écrans coach rendent des initiales, jamais une image. Seule la vue
pair-à-pair `GroupTeammate` porte un `avatarUrl` (ADR-37). L'asymétrie est au contrat :
un athlète voit la photo de ses coéquipiers, son coach ne la voit jamais. **L'API est
conforme ; c'est mon attendu qui ne l'était pas.** Fiche corrigée. Le propriétaire a
depuis demandé l'inverse — d'où TLX-252, qui amende ADR-37 plutôt que de « réparer » un
défaut inexistant.

**Ma fiche QA-03.8 demandait `select self_logged from sessions`.** Il n'y a pas de
colonne : `self_logged` est une **valeur de statut** (ADR-36 §1, migration expand-only).
Sans relecture, la preuve aurait été introuvable et le scénario déclaré bloqué.

**J'ai annoncé « suite verte » sur une vérification incomplète, deux fois.** `pnpm
--filter @talent-x/mobile test` ne lance pas la couverture ; le CI lance `test:cov`. Ce
n'est qu'en voyant le job rouge que j'ai regardé. La commande de vérification avant
fusion est `test:cov`, pas `test`.

## Le CI, et ce qu'il apprend

**`main` est rouge depuis la fusion du lot 3, la veille** — pas depuis le lot 4.

| Run  | Commit                      | État            |
| ---- | --------------------------- | --------------- |
| #260 | `7062bca` (19/08 17:09)     | ✅ dernier vert |
| #261 | `ce067d9` — fusion du lot 3 | ❌              |
| #262 | `c82c6c6` — fusion du lot 4 | ❌              |

Aucun test ne casse. C'est la porte de couverture : **branches 79,86 % pour un seuil à
80 %, soit huit branches manquantes.** Les pires contributeurs sont tous antérieurs — les
six cartes d'effort totalisent plus de 300 branches non couvertes. Le fichier neuf de
TLX-243 en manque trois.

Le constat qui compte est ailleurs : **trois des quatre métriques tiennent à moins d'un
point de leur seuil** (statements +0,66 · functions +0,21 · lines +1,48). La porte allait
basculer sur la prochaine modification, quelle qu'elle soit. C'est une dette arrivée à
échéance, pas un accident de lot. TLX-254 — **et surtout pas en baissant le seuil.**

## Vérifié vs supposé

**Mesuré** — les trois maillons de chaque séance libre en base (séance `self_logged`,
affectation `completed`, performance) ; les quatre marques du multi-séries, distinctes et
non écrasées ; les cinq lectures coach avec témoin positif ; la réponse 201 portant
`recordCandidates` ; le 403 sur `DELETE /sessions/{id}` par un athlète propriétaire ; le
cycle avatar complet dans les logs nginx (`POST 201` → `PUT 200` → `HEAD 200` →
`PUT 200` → `GET 200, 27 460 octets` → `DELETE 204`) ; `photo_url` NULL et bucket vide
après suppression ; `left_at`, la seconde ligne d'adhésion, et le lien coach clos puis
rouvert ; la couverture de branches sur `coverage-final.json`.

**Supposé / déduit** — rien dans ce rapport n'est déduit sans être dit. Les observations
d'écran viennent de l'utilisateur et sont systématiquement corrélées à une ligne en base
ou à une trace serveur.

**Non établi** — un athlète sorti du groupe voit-il encore les séances du coach ? La
sonde n'avait pas de témoin. À rejouer.

## Défauts ouverts à l'issue de QA-03

| Ticket      | Sév.   | Objet                                                          |
| ----------- | ------ | -------------------------------------------------------------- |
| **TLX-254** | High   | CI rouge — 8 branches de couverture manquantes                 |
| **TLX-243** | High   | record détecté non confirmé — **corrigé, à rejouer**           |
| TLX-223     | Medium | `attemptsPerBar` ignoré — **arbitré : la saisie doit le lire** |
| TLX-248     | Medium | ADR-36 §3 périmé — **arbitré : `docs/` seulement**             |
| TLX-249     | Medium | séance libre : déplacer vers Séances, l'y étiqueter            |
| TLX-250     | Medium | photo de profil : suppression immédiate sous un « Annuler »    |
| TLX-252     | Medium | photo visible coach ⇄ athlète — amender ADR-37                 |
| TLX-253     | Medium | l'athlète ne peut pas supprimer sa séance libre                |
| TLX-244     | Low    | compteur de marques — **corrigé, à rejouer**                   |
| TLX-246     | Low    | proposition de record immédiate en séance libre                |
| TLX-247     | Low    | exemple « 1500 » sur toutes les épreuves chronométrées         |
| TLX-251     | Low    | avatars dans un bucket nommé `talentx-exports`                 |

## Suites à donner

- [ ] **TLX-254 d'abord** : `main` est rouge, la publication de l'image GHCR est sautée.
- [ ] **Bascule du téléphone en coach = rejeu de TLX-242.** Ne pas la faire distraitement :
      c'est une déconnexion suivie d'une connexion sur un autre compte, exactement le
      scénario du ticket. Surveiller une bannière d'erreur — la session de correction a
      signalé des 401 silencieux par conception après le `clear()`.
- [ ] **QA-02.2 à QA-02.7**, débloqués depuis TLX-238.
- [ ] **Rejeu de TLX-245** : la manip qui compte est d'ouvrir une séance **déjà visitée**,
      pas une neuve — le défaut n'existe que si la suivante est en cache.
- [ ] **Regarder les états de chargement et la position de défilement** après ADR-58 :
      changer de ressource repasse par le chargement si elle n'est pas en cache. Signalé
      par la session de correction, se juge à l'œil.
- [ ] **Rejeu de TLX-235** (liste des athlètes) et de TLX-243/TLX-244.
- [ ] **Question non tranchée** : un athlète sorti du groupe voit-il encore les séances du
      coach ? À jouer sur `+qa-a3` pendant que le téléphone est en coach.
