# ADR-57 — Destination du lien de réinitialisation : site public minimal

- **Statut :** Accepté (2026-08-19, validé)
- **Date :** 2026-08-19
- **Réf. :** TLX-234, TLX-104 (rouvert), TLX-77, TX-SEC-003 §11, scénario QA-01.5, `store/checklist-publication.md`

**Contexte.**

La campagne de qualification (QA-01.5) a déroulé le parcours de réinitialisation de mot
de passe de bout en bout pour la première fois : il est **impraticable**. Le backend est
pourtant complet et mesuré conforme — `202` neutre anti-énumération, jeton haché à usage
unique expirant à 1 h, email réellement délivré. Mais deux maillons clients manquent :
l'application n'offre **aucun** point d'entrée (zéro occurrence de `forgotPassword` ou
`reset-password` dans `apps/mobile`, alors que la maquette O-02 prévoit le lien), et le
lien de l'email se construit sur `APP_PUBLIC_URL`, qui vaut l'hôte de l'**API** — un clic
renvoie un `404` JSON brut.

Trois forces cadrent la décision.

**(1) La récupération doit fonctionner sans l'application.** C'est un parcours de
secours : l'utilisateur a pu changer de téléphone, réinstaller, ou ouvrir son mail depuis
un ordinateur. Toute solution qui suppose l'app installée sur l'appareil qui ouvre le
lien échoue précisément sur ceux qui en ont besoin.

**(2) Aucun site public n'existe.** Vérifié : `talent-x.app`, `www.talent-x.app` et
`staging.talent-x.app` ne résolvent pas. Seuls `staging-api` et `staging-storage` sont
servis.

**(3) Un site public est de toute façon requis pour publier.**
`store/checklist-publication.md` porte une case non cochée : « Politique de
confidentialité hébergée en URL publique (exigée par les deux stores) ». TLX-77 est
bloqué dessus.

**Décision.**

Servir le lien depuis un **site public statique minimal**, hébergé sur le domaine
principal par le **Nginx déjà déployé**, exposant `/reset-password`, `/privacy` et
`/support`. `APP_PUBLIC_URL` cesse de désigner l'hôte de l'API pour pointer ce site
(`https://talent-x.app` en production, `https://staging.talent-x.app` en staging). Les
écrans de **demande** de réinitialisation restent dans l'application (lien « Mot de passe
oublié ? » sur O-02, conforme à la maquette). Les **App Links / Universal Links** sont
explicitement différés.

**Conséquences.**

- Positives :
  - le parcours fonctionne pour tout le monde, y compris sans l'app installée et depuis
    un ordinateur ;
  - **une seule infrastructure résout deux problèmes** — la récupération de compte et le
    bloquant de publication de TLX-77 ;
  - le lien inspire confiance : `talent-x.app/reset-password` se lit comme légitime, là
    où `api.talent-x.app/reset-password` déclenche l'instinct anti-hameçonnage ;
  - hébergement **chez nous, en UE**, cohérent avec la posture OVHcloud du projet — servir
    sa propre politique de confidentialité depuis un tiers hors UE serait contradictoire ;
  - coût réel faible : un enregistrement DNS, un `server` block, le certificat certbot
    étendu, quelques fichiers statiques versionnés et revus comme le reste du code.
- Négatives :
  - une seconde surface d'interface à maintenir, distincte des écrans de l'app (mitigé en
    consommant les tokens du design system, `design/tokens.css`) ;
  - la page appelant l'API depuis une autre origine, il faut **ajouter cette origine à la
    configuration CORS** — trivial, mais c'est l'oubli classique qui coûte une heure au
    test ;
  - deux noms de domaine de plus à gérer (apex production, `staging.`) et à renouveler.

**Contraintes de sécurité attachées à la décision.**

Le jeton transite en **paramètre d'URL** : il atterrit donc dans l'historique du
navigateur et dans les journaux d'accès. La page doit le lire puis **nettoyer l'URL**, et
le site ne doit embarquer **aucun script tiers ni analytics** (Nginx pose déjà
`Referrer-Policy: no-referrer`, à conserver). L'écran de demande, côté app, doit afficher
un message **neutre** (« si un compte existe pour cette adresse… ») : le `202`
anti-énumération du serveur ne vaut rien si l'interface, elle, révèle l'existence du
compte.

**Alternatives considérées.**

- **Lien profond seul (`talentx://reset-password?token=…`)** — rejeté : de nombreux
  clients mail ne rendent pas les schémas personnalisés cliquables, et le lien ne fait
  rien si l'app n'est pas installée. Inutilisable comme socle d'un parcours de secours.
- **Déployer le build web Expo** (`expo export -p web`) — rejeté : techniquement viable
  (les E2E tournent déjà sur cette cible), mais cela exposerait **toute l'application** au
  public pour servir un écran, ouvrant un canal produit que personne n'a décidé, avec ses
  implications de support, de sécurité et de RGPD. Le web reste ici un véhicule de test,
  pas un produit.
- **Servir la page depuis l'API** (contrôleur NestJS renvoyant du HTML) — l'option la
  moins chère : aucun DNS, aucun Nginx, `APP_PUBLIC_URL` inchangé, pas de CORS. Rejetée
  parce qu'elle mélange une préoccupation d'interface dans une API REST, garde le lien sur
  un sous-domaine `api.` peu rassurant, et surtout **ne fait rien pour TLX-77** : le site
  public serait à payer plus tard de toute façon.
- **Hébergeur statique tiers** (Netlify, Vercel, Cloudflare Pages) — rejeté : plus rapide
  à mettre en place, mais introduit un sous-traitant hors UE pour servir la politique de
  confidentialité elle-même, en contradiction avec TX-SEC-003.
- **App Links / Universal Links** — **différés**, non rejetés. Meilleure expérience quand
  l'app est installée, mais exigent la publication de fichiers d'association de domaine et
  la configuration des deux plateformes. La page web reste le repli obligatoire : ce
  travail n'est jamais perdu.

