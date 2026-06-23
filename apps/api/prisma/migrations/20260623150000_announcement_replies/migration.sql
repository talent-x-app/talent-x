-- TLX-186 / ADR-50 (Mur Palier 3) — Fil de réponses sous annonce + modération.
-- Rouvre l'exclusion d'ADR-46 (chat différé) sous une couche de modération native.
-- Deux tables : les réponses (fil bidirectionnel, soft-delete tracé) et les signalements
-- (modération communautaire, masquage automatique sur seuil côté service). Contenu rédigé par
-- un pair → purgé à l'effacement du compte via FK ON DELETE CASCADE (ADR-15).

-- Réponses à une annonce. Corps texte seul borné (≤ 500). deleted_by_id = acteur du retrait
-- (auteur ou coach propriétaire = modération) ; SET NULL si ce compte est purgé.
CREATE TABLE "announcement_replies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "announcement_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by_id" UUID,
    CONSTRAINT "announcement_replies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_announcement_reply_body" CHECK (char_length("body") BETWEEN 1 AND 500)
);

ALTER TABLE "announcement_replies" ADD CONSTRAINT "announcement_replies_announcement_id_fkey"
    FOREIGN KEY ("announcement_id") REFERENCES "group_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_replies" ADD CONSTRAINT "announcement_replies_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_replies" ADD CONSTRAINT "announcement_replies_deleted_by_id_fkey"
    FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ix_announcement_reply_announcement" ON "announcement_replies" ("announcement_id");

-- Signalements d'une réponse. Une ligne par (réponse, signaleur) — unique = idempotence.
-- reason borné par CHECK (miroir de l'enum serveur). Le masquage sur seuil est calculé côté
-- service (COUNT distinct), pas matérialisé ici.
CREATE TABLE "announcement_reply_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reply_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "announcement_reply_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_announcement_reply_report_reason"
        CHECK ("reason" IN ('spam', 'abuse', 'offensive', 'other'))
);

ALTER TABLE "announcement_reply_reports" ADD CONSTRAINT "announcement_reply_reports_reply_id_fkey"
    FOREIGN KEY ("reply_id") REFERENCES "announcement_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_reply_reports" ADD CONSTRAINT "announcement_reply_reports_reporter_id_fkey"
    FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "uq_announcement_reply_report" ON "announcement_reply_reports" ("reply_id", "reporter_id");
CREATE INDEX "ix_announcement_reply_report_reply" ON "announcement_reply_reports" ("reply_id");

-- Nouveau type de notification `group_reply` (ADR-50 §D5) : étend le CHECK existant (additif).
ALTER TABLE "notifications" DROP CONSTRAINT "ck_notification_type";
ALTER TABLE "notifications" ADD CONSTRAINT "ck_notification_type"
    CHECK ("type" IN ('session_assigned', 'performance_feedback', 'group_update', 'performance_submitted', 'group_announcement', 'group_kudos', 'group_reply'));
