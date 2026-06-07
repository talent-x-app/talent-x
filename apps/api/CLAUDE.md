# Contexte — API (NestJS)
- Endpoints conformes à `../../docs/openapi.yaml` (source de vérité)
- Auth JWT RS256 + refresh rotatif ; RBAC + ownership + consentement
- Accès données via Prisma (`prisma/schema.prisma`, dérivé de docs/data-model.md)
- Tests : unitaires + intégration sur chaque endpoint
