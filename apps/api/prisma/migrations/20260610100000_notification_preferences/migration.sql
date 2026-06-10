-- TLX-110 / ADR-22 — Préférences de notification (1:1 users).
-- Migration expand-only (ADR-12) : nouvelle table, aucune rupture.
-- Absence de ligne = défauts (tout à true sauf marketing, opt-in RGPD).
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "session_assigned" BOOLEAN NOT NULL DEFAULT true,
    "performance_feedback" BOOLEAN NOT NULL DEFAULT true,
    "group_updates" BOOLEAN NOT NULL DEFAULT true,
    "marketing" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Trigger set_updated_at (même mécanique que les autres tables, cf. migration init).
CREATE TRIGGER "set_updated_at_notification_preferences"
    BEFORE UPDATE ON "notification_preferences"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
