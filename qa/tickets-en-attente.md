# Tickets établis mais non créés dans Linear

**Le workspace Linear a atteint la limite d'issues de son plan gratuit** (constaté le
2026-08-21, à la création de ce qui aurait été TLX-272). Les défauts ci-dessous sont
**établis et prouvés** au même standard que les tickets créés — ils ne sont pas moins
sûrs, seulement sans numéro.

À créer tels quels dès que la limite est levée, puis à retirer d'ici. En attendant, le
lot de correctifs les référence par leur titre.

**Convention inchangée** : statut `Backlog`, label `qa-campagne`.

---

## 1. « Accès de mon coach » affiche OFF alors que le coach a un accès complet

**Priorité : Urgent · Labels : `qa-campagne`, `rgpd`, `frontend`**

**Trouvé sur appareil réel pendant QA-06.2 (2026-08-21, staging, `main` `7f59131`), compte
`+qa-a3` (Zoe).** Signalé par le propriétaire, qui allait révoquer l'accès :

> accès de mon coach était déjà désactivé, je viens de l'activer

**Il n'était pas désactivé.** Au même moment, sonde sur le compte du coach — **six accès
sur six ouverts** :

```
200  progression athlète
200  stats athlète
200  records athlète
200  lecture de la perf
200  fil de commentaires
200  tableau de bord  → coachAccessGranted=true, load=présente
```

L'athlète lit « accès coach : désactivé » sur le seul écran du produit dédié à cette
question, pendant que son coach lit ses performances, sa progression, ses records et sa
charge d'entraînement.

### Ce n'est pas un cas limite : c'est l'état par défaut de tout athlète

État de `consents` **avant** le geste — une seule ligne, accordée et **scopée** :

| granted | coach_id    | granted_at          |
| ------- | ----------- | ------------------- |
| `t`     | `99caef46…` | 2026-08-19 18:06:36 |

L'interrupteur mono-coach lit ceci :

```ts
// PrivacySection.tsx:124-126
const grantedFor = (type: ConsentType): boolean =>
  consents.data?.data?.find((c) => c.type === type && c.coachId == null)?.granted ?? false;
```

**`c.coachId == null`** — il ne regarde que les lignes **non scopées**. Il n'en trouve
aucune, tombe sur `?? false`, et affiche OFF.

Or c'est l'adhésion elle-même qui dépose le consentement scopé :

```ts
// groups.service.ts:268 — ADR-51 §D2 (TLX-187)
// le geste d'adhésion vaut consentement coach_access à CE coach
```

**Donc tout athlète ayant rejoint un groupe par code — c'est-à-dire tous — voit OFF alors
qu'il a consenti.** Le seul athlète qui verrait ON est celui qui possède une ligne globale,
que rien dans le parcours nominal ne crée.

Le commentaire juste au-dessus l'annonce pourtant : « en mono-coach, l'interrupteur global
suffit (aucun changement) ». Il ne suffit pas — parce que la donnée que le parcours produit
n'est pas globale.

### Le sens de l'erreur est le mauvais

Un affichage qui montrerait ON à tort ferait paniquer. Celui-ci montre **OFF à tort**, ce
qui est plus grave et plus silencieux :

- l'athlète qui **vérifie** conclut que son coach n'a rien, et s'en va rassuré ;
- l'athlète qui **veut révoquer** voit que c'est déjà fait, ne touche à rien, et **repart en
  croyant l'accès coupé alors qu'il est ouvert.**

C'est exactement ce qui s'est produit ici : le geste demandé par le scénario était une
révocation, et l'écran a fait croire qu'elle était sans objet.

### Ce qui n'est PAS en cause — vérifié, pour éviter un sur-diagnostic

**La garde serveur est correcte.** `ConsentGate.hasActiveConsent` prend la ligne **la plus
récente** parmi les scopées à ce coach et les globales :

```ts
// consent.gate.ts:33-44
...(coachId != null ? { OR: [{ coachId }, { coachId: null }] } : { coachId: null }),
orderBy: { createdAt: 'desc' },
```

Une décision globale plus récente l'emporte, dans les deux sens — conforme à ce
qu'annonce son propre commentaire. **L'écriture fonctionne aussi** : basculer l'interrupteur
crée bien une ligne, et comme elle est la plus récente, elle prime.

J'ai vérifié ce point précisément parce que l'hypothèse inverse — un interrupteur
inopérant, la ligne scopée survivant à une révocation globale — aurait fait de ce ticket un
bloquant de sécurité. **Ce n'est pas le cas. Le contrôle marche quand on s'en sert ; c'est
l'état affiché qui ment.**

### Effet de bord du contournement

Le geste de « réactivation » a créé une **seconde** ligne, cette fois globale :

| granted | coach_id    | granted_at          |
| ------- | ----------- | ------------------- |
| `t`     | `99caef46…` | 2026-08-19 18:06:36 |
| `t`     | _(null)_    | 2026-08-21 15:13:56 |

Inoffensif en mono-coach. **À examiner en multi-coach** : un consentement global déposé par
méprise s'applique à _tous_ les coachs, présents et futurs, tant qu'aucune ligne plus
récente ne le contredit. L'athlète croyait n'autoriser qu'un coach. Ce n'est pas mesuré ici
— c'est une lecture du code de la garde, à confirmer.

### Correctif

`grantedFor` ne peut pas rester la source de vérité de l'interrupteur mono-coach. **Le
client doit appliquer la même règle de résolution que le serveur** : la ligne applicable la
plus récente parmi scopée-à-ce-coach et globale — c'est-à-dire `coachAccessFor(coachId)`,
qui existe **déjà dans le même fichier** (l.128-130) et n'est utilisée que dans la branche
multi-coach.

En mono-coach, l'unique coach est connu (`coaches[0]`, déjà calculé l.115-119). Le
correctif tient probablement en une ligne : router l'interrupteur `coach_access` vers
`coachAccessFor(coaches[0].id)` dès qu'un coach existe, et n'écrire une ligne globale que
s'il n'y en a aucun.

**Se poser la question de l'écriture aussi** : en mono-coach, la bascule devrait-elle écrire
une ligne **scopée** plutôt que globale ? Le geste de l'athlète vise son coach, pas une
politique générale. Écrire scopé rendrait lecture et écriture symétriques et supprimerait
l'effet de bord ci-dessus. À trancher.

### Le test qui compte

Un athlète dont le **seul** consentement `coach_access` est **scopé** doit voir
l'interrupteur sur **ON**. C'est le cas produit par l'adhésion, donc le cas de tous les
utilisateurs — et c'est exactement celui qu'aucun test ne couvre aujourd'hui : les tests
existants construisent des lignes globales, qui sont précisément celles que le parcours réel
ne crée jamais.

Ajouter le cas symétrique : ligne scopée `granted=false` plus récente qu'une globale
`granted=true` → OFF.

### DoD

L'interrupteur reflète l'accès réel du coach, vérifiable en confrontant l'écran à une sonde
sur les portes coach. La lecture client applique la même règle de résolution que
`ConsentGate`. Un test couvre le cas « consentement uniquement scopé ».

**Réf. :** `apps/mobile/src/profile/PrivacySection.tsx:113-130` (`grantedFor`,
`coachAccessFor`, `multiCoach`) · `apps/api/src/common/authorization/consent.gate.ts:33-44` ·
`apps/api/src/groups/groups.service.ts:268,306-320` · ADR-51 §D2/§D2a (consentement scopé
déposé par l'adhésion) · TX-SEC-003 · scénario QA-06.2
