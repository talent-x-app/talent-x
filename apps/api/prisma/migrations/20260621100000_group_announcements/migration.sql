-- TLX-173 / ADR-46 — Annonces de groupe (canal descendant coach → membres).
-- Table dédiée (≠ comments, scopé séance) ; suppression soft (deleted_at).
CREATE TABLE "group_announcements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "group_announcements_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "group_announcements" ADD CONSTRAINT "group_announcements_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_announcements" ADD CONSTRAINT "group_announcements_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ix_group_announcement_group" ON "group_announcements"("group_id");

-- Nouveau type de notification `group_announcement` (ADR-46) : étend le CHECK existant
-- (additif, même schéma que la migration `performance_submitted`). Gardé par la préférence
-- `groupUpdates` existante → aucune nouvelle colonne de préférence.
ALTER TABLE "notifications" DROP CONSTRAINT "ck_notification_type";
ALTER TABLE "notifications" ADD CONSTRAINT "ck_notification_type"
    CHECK ("type" IN ('session_assigned', 'performance_feedback', 'group_update', 'performance_submitted', 'group_announcement'));
