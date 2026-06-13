-- TLX-139 / ADR-22 (extension) — Notifier le coach d'une performance à revoir.
-- Migration expand-only (ADR-12) : nouvelle colonne avec défaut, aucune rupture.
-- Garde de préférence du nouveau type `performance_submitted` (défaut true, comme
-- les autres signaux fonctionnels) — lue par le worker (NotificationProcessor).
ALTER TABLE "notification_preferences"
    ADD COLUMN "performance_submitted" BOOLEAN NOT NULL DEFAULT true;
