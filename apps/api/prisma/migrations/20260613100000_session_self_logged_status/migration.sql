-- ADR-36 — Journal d'entraînement : séance libre auto-créée par l'athlète.
-- Migration expand-only (ADR-12) : on élargit la contrainte de statut des séances pour
-- admettre la valeur `self_logged` (séance libre, coach_id = athleteId). Aucune donnée
-- existante n'est touchée (les statuts actuels restent valides) ; pas de rupture.
ALTER TABLE "sessions" DROP CONSTRAINT "chk_sessions_status";
ALTER TABLE "sessions" ADD CONSTRAINT "chk_sessions_status"
    CHECK ("status" IN ('draft', 'published', 'archived', 'template', 'self_logged'));
