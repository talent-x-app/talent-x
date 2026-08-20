# ADR-58 — États locaux des écrans d'onglet masqués : remontage par `key` de route

- **Statut :** Proposé (2026-08-20, à valider)
- **Date :** 2026-08-20
- **Réf. :** TLX-239 (inventaire), TLX-236, TLX-245, TLX-238, TLX-93, TLX-161, TLX-077, scénarios QA-02/QA-03

**Contexte.**

Les écrans hors barre d'onglets sont déclarés `Tabs.Screen … options={{ href: null }}`.
React Navigation les monte à la première visite et **ne les démonte jamais**. Deux
conséquences que le code suppose fausses un peu partout :

- `useState(valeurInitiale)` n'est évalué **qu'une fois**, à la première visite de l'app ;
- changer le paramètre de route **ne remonte pas** l'écran : une seule instance sert toutes
  les ressources, et l'état de l'une fuit vers la suivante.

La campagne de qualification a produit trois manifestations en trois jours. **TLX-236** :
le mode de saisie d'une séance contaminait les suivantes, mesuré sur appareil. **TLX-239** :
la bascule vue coach/athlète faisait de même, et — cas non anticipé, trouvé en lisant —
l'athlète ouvrait son formulaire pré-rempli avec le **RPE et les notes de la séance
précédente**, qu'il pouvait soumettre sans les avoir écrits. Ce n'est plus de l'ergonomie :
c'est une donnée fausse attribuée à quelqu'un. **TLX-245** : une confirmation de suppression
ouverte puis abandonnée se rouvrait sur la séance suivante, `deleteSession` visant l'`id`
courant — un état rémanent qui arme une action **destructrice** sur la mauvaise cible.

Deux faits rendent la décision nécessaire, et ils sortent de l'inventaire demandé par TLX-239.

**(1) Treize routes paramétrées, une seule protégée.** `(coach)/assign/[id]` porte un
`key={id}` posé au fichier de route, documenté avec exactement le raisonnement ci-dessus
(TLX-93). Les douze autres n'ont rien. Les états rémanents décrivant la ressource affichée
qu'on y trouve aujourd'hui :

| Route | État rémanent | Effet observable |
| --- | --- | --- |
| `(coach)/assign/[id]` | *(protégé par `key`)* | — |
| `(athlete)/session/[id]` | `mode`, `view`, `rpe`, `notes` | corrigés un par un (TLX-236, TLX-239) |
| `(coach)/session/[id]` | `confirming` (suppression) | corrigé par `key` local (TLX-245) |
| `(coach)/session/[id]/edit` | `title`, `description`, `scheduledDate`, `status`, `nodes`, `brief`, `error` | réhydratés par un effet **sauf `error`** ; formulaire de la séance précédente affiché en attendant |
| `(coach)/competition/[id]` | `name`, `discipline`, `location`, `startDate`, `endDate`, `description`, `status`, `error` | même schéma |
| `(coach)/competition/[id]/engage` | `selected`, `eventLabel`, `confirmedNames` | **le récapitulatif d'engagement d'une compétition s'affiche sur la suivante** — exactement ce que le `key` de `assign/[id]` a déjà corrigé une fois |
| `(coach)/group/[id]`, `(athlete)/group/[id]` | `tab` | l'onglet ouvert sur un groupe s'applique au suivant |
| `(athlete)/perf/[id]` | `confirmed` (candidats record) | marques déjà validées masquées sur une autre perf |
| `(coach)/athlete/[id]`, `(coach)/review/[id]`, `(athlete)/competition/[id]`, `(coach)/session/assistant/[discipline]` | aucun | — |

**(2) Trois remèdes différents coexistent déjà**, appliqués au cas par cas, sans règle :
`key={id}` au fichier de route (`assign/[id]`), remise à zéro par `useFocusEffect`
(`SessionBuilderScreen` en création), et remise à zéro **pendant le rendu** via une ref sur
l'`id` précédent (`SessionDetailScreen`). Le défaut n'est donc pas qu'on ignore la solution :
c'est qu'aucune n'est la règle, et que chaque nouvel écran repart de zéro.

Corriger état par état ne tient pas à l'échelle. Chaque correction demande d'identifier le
bon état, d'écrire la remise à zéro, et un test qui change le paramètre de route **sans
remonter** le composant — un patron qu'aucun test n'appliquait spontanément, ce qui est
précisément pourquoi Jest n'a jamais rien vu. Et chaque `useState` ajouté demain rouvre le
problème en silence.

**Correction d'une prémisse.** TLX-239 avançait que le remontage coûterait « la perte de
tout état local — y compris la restauration de brouillon hors ligne (TLX-077) ». Vérification
faite, **ce coût n'existe pas** : le brouillon est persisté sur l'appareil (`deviceStore`) et
rechargé par un effet indexé sur `[id]`. Un remontage le relit. Ce qui serait réellement
perdu tient aux 600 ms de frappe non encore auto-sauvegardées — et uniquement au moment où
l'on change de ressource, c'est-à-dire quand la perte est le comportement voulu.

**Décision.**

Faire du **remontage par `key` dérivée du paramètre de route la règle par défaut** de toute
route paramétrée, posée **au fichier de route** et non dans l'écran :

```tsx
export default function SessionDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionDetailScreen key={id} />;
}
```

Le fichier de route est le bon endroit : il connaît le paramètre, il est minuscule, et la
règle y est vérifiable d'un coup d'œil sur treize fichiers — là où l'audit des `useState`
demande de lire treize écrans.

Une route peut s'en exempter, à deux conditions : que l'état doive **réellement** survivre au
changement de ressource, et que le fichier de route porte un commentaire disant lequel et
pourquoi. Aucun écran ne remplit cette condition aujourd'hui.

Les remises à zéro par ref déjà en place (TLX-236, TLX-239) restent en l'état : elles sont
correctes, testées, et les retirer dans le même mouvement mêlerait deux changements. Elles
deviennent redondantes, pas fausses — à retirer lors d'un passage ultérieur, si on le décide.

**Conséquences.**

- Positives : la classe entière de défauts disparaît, y compris pour les écrans que
  personne n'a encore ouverts deux fois de suite ; tout `useState` ajouté demain est couvert
  sans y penser ; la règle est vérifiable par lecture de treize petits fichiers ; les états
  rémanents restants du tableau ci-dessus sont corrigés d'un coup, sans treize correctifs et
  treize tests.
- Négatives : le changement de paramètre coûte un remontage complet — effets rejoués,
  position de défilement perdue, état d'ouverture des sections réinitialisé. Les données
  viennent du cache TanStack, donc **sans requête réseau supplémentaire**, mais l'écran
  repasse par ses états de chargement si la ressource n'est pas en cache. La règle est une
  convention : rien ne l'impose mécaniquement, un nouveau fichier de route peut l'oublier —
  d'où l'ajout d'une ligne à la revue de code plutôt qu'une confiance dans la discipline.

**Alternatives considérées.**

- **Statu quo — remise à zéro état par état.** Écartée : c'est ce qui a produit trois tickets
  en trois jours, chacun trouvé par hasard ou par lecture, jamais par le typage ni par les
  tests. Le coût par cas est élevé (identifier l'état, écrire la remise à zéro, écrire un test
  au patron inhabituel) et le défaut se rouvre à chaque `useState` ajouté.
- **`useFocusEffect` de remise à zéro**, patron de `SessionBuilderScreen`. Écartée comme règle
  générale : un effet s'exécute **après la peinture**, donc la ressource suivante s'ouvre sur
  un éclair de l'état précédent. Acceptable pour un formulaire de création, pas pour une
  confirmation de suppression.
- **Remise à zéro pendant le rendu via une ref**, patron de TLX-236. Correcte et sans éclair,
  mais elle reste **par état** : elle ne protège que ce qu'on a pensé à énumérer, et c'est
  exactement ainsi que `rpe` et `notes` ont échappé à TLX-236 pour n'être trouvés que dans
  TLX-239. Conservée comme exception documentée, pas comme règle.
- **Sortir ces écrans des onglets masqués pour une vraie pile de navigation.** C'est le
  correctif de fond : une pile démonte ses écrans, le problème n'existerait pas. Écartée
  **ici** parce qu'elle touche toute la structure de navigation des deux rôles, avec un risque
  de régression sans commune mesure avec le défaut traité, et qu'elle mérite son propre ADR si
  elle est un jour envisagée.
