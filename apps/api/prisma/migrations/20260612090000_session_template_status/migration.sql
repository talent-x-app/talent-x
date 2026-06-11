-- ADR-29 — Modèles de séance (bibliothèque C-10).
-- Migration expand-only (ADR-12) : on élargit la contrainte de statut des séances pour
-- admettre la valeur `template` (modèle réutilisable, non daté, non assignable). Aucune
-- donnée existante n'est touchée (les statuts actuels restent valides) ; pas de rupture.
ALTER TABLE "sessions" DROP CONSTRAINT "chk_sessions_status";
ALTER TABLE "sessions" ADD CONSTRAINT "chk_sessions_status"
    CHECK ("status" IN ('draft', 'published', 'archived', 'template'));
