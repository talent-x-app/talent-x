# Contexte — API (NestJS)
- Endpoints conformes à `../../docs/talent-x-openapi.yaml` (source de vérité)
- Auth JWT RS256 + refresh rotatif ; RBAC + ownership + consentement
- Accès données via Prisma (`prisma/schema.prisma`, dérivé de `../../docs/Talent-X_06_Modele_de_donnees.md`)
- Toutes les routes sont préfixées `/api/v1` ; dev via `nest start --watch` (DI = decorators metadata)
- Tests : unitaires + intégration sur chaque endpoint
