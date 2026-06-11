-- ADR-28 — Couche éditoriale « brief » de séance (double lecture coach/athlète).
-- Migration expand-only (ADR-12) : colonne JSONB nullable, aucune rupture, zéro
-- migration de données (séances existantes : brief NULL = sans brief).
ALTER TABLE "sessions" ADD COLUMN "brief" JSONB;
