-- TLX-111 / ADR-23 — Notifications in-app (historique par destinataire).
-- Migration expand-only (ADR-12) : nouvelle table, aucune rupture.
-- Contenu minimal (type + ressource, ADR-10) ; dedupe_key = jobId BullMQ (idempotence).
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "resource_id" UUID NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_notification_type" CHECK ("type" IN ('session_assigned', 'performance_feedback', 'group_update'))
);

CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");
CREATE INDEX "ix_notifications_user_created" ON "notifications"("user_id", "created_at" DESC);
-- Index partiel non-lus : le badge (unreadCount) est la requête la plus fréquente.
CREATE INDEX "ix_notifications_user_unread" ON "notifications"("user_id") WHERE "read_at" IS NULL;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
