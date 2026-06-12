-- TLX-108 / ADR-31 — Cycle de vie des affectations : motif de skip.
-- Migration expand-only (ADR-12) : nouvelle colonne nullable, aucune rupture.
-- Renseignée quand status -> 'skipped' (motif d'indisponibilité), remise à NULL
-- au retour 'assigned'. Les statuts 'in_progress'/'skipped' sont déjà admis par
-- le CHECK de `status` (migration init) → aucune modification de l'enum de statut.
ALTER TABLE "session_assignments" ADD COLUMN "skip_reason" TEXT;

ALTER TABLE "session_assignments" ADD CONSTRAINT "chk_session_assignments_skip_reason"
    CHECK ("skip_reason" IS NULL OR "skip_reason" IN ('injury', 'absence', 'weather', 'other'));
