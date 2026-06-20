-- TLX-173 / ADR-43 §1 — Présence déclarée (RSVP), axe ORTHOGONAL au cycle d'exécution (status, ADR-31).
-- Migration expand-only (ADR-12) : deux colonnes nullables, aucune rupture.
--   attendance        : intention de présence déclarée AVANT la séance ('going'|'not_going'|'maybe').
--                       NULL = sans réponse (défaut). N'entre PAS dans l'assiduité (fondée sur status).
--   attendance_reason : motif d'absence, requis ssi attendance='not_going' (réutilise SkipReason).
ALTER TABLE "session_assignments" ADD COLUMN "attendance" TEXT;
ALTER TABLE "session_assignments" ADD COLUMN "attendance_reason" TEXT;

ALTER TABLE "session_assignments" ADD CONSTRAINT "chk_session_assignments_attendance"
    CHECK ("attendance" IS NULL OR "attendance" IN ('going', 'not_going', 'maybe'));

ALTER TABLE "session_assignments" ADD CONSTRAINT "chk_session_assignments_attendance_reason"
    CHECK ("attendance_reason" IS NULL OR "attendance_reason" IN ('injury', 'absence', 'weather', 'other'));
