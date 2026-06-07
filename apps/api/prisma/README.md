# Prisma — schéma & migrations Talent-X

Source de vérité du modèle : `docs/Talent-X_06_Modele_de_donnees.md` (TX-DATA-006).

## ⚠️ Objets gérés hors du datamodel Prisma

Le `schema.prisma` ne peut PAS exprimer certains objets présents dans la base.
Ils sont écrits à la main dans la migration initiale
(`migrations/20260607000000_init/migration.sql`) :

- **Index uniques PARTIELS** (soft-delete) : `ux_users_email` (sur `lower(email)`
  où `deleted_at IS NULL`), `ux_group_member_active`, `ux_link_active`,
  `ux_assignment_active`, ainsi que les index partiels `ix_groups_coach`,
  `ix_sessions_coach`, `ix_link_athlete`.
- **Contraintes CHECK** : énumérations (`role`, `status`, `platform`, `source`),
  `rpe BETWEEN 1 AND 10`, `chk_link_distinct`, `chk_link_group`,
  `chk_comment_one_target`.
- **Fonction + triggers** `set_updated_at`.

## Politique de migration : `migrate deploy`, JAMAIS `migrate dev`

`prisma migrate dev` compare le `schema.prisma` à une _shadow DB_ et génère des
migrations correctives. Comme les objets ci-dessus n'existent pas dans le
datamodel, **`migrate dev` chercherait à les SUPPRIMER** (drift) — on perdrait
les garanties d'unicité et d'intégrité.

➡️ Appliquer les migrations uniquement avec :

```bash
cd apps/api && pnpm prisma migrate deploy
```

Pour faire évoluer le schéma : éditer `schema.prisma`, générer le squelette de
migration (`prisma migrate diff --from-... --to-schema-datamodel ... --script`),
puis **réintégrer à la main** les objets hors-datamodel ci-dessus dans le
`migration.sql` avant de committer. Ne pas exécuter `migrate dev` sur une base
qui doit conserver ces objets.

La base dev (rôle/base `talentx`) est provisionnée en TLX-004 ; le seed en TLX-014.
