-- Migration initiale Talent-X (TLX-012)
-- Dérivée de docs/Talent-X_06_Modele_de_donnees.md (TX-DATA-006), Annexe A.
-- Structure de base générée par Prisma, enrichie des contraintes que Prisma
-- ne sait pas exprimer : CHECK (énumérations & invariants), index uniques
-- PARTIELS (soft-delete), fonction + triggers set_updated_at.

-- ─────────────────────────── Extensions & fonctions ────────────────────────────
-- gen_random_uuid() est natif sur PostgreSQL >= 13 ; pgcrypto par sécurité.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Mise à jour automatique de updated_at sur les entités mutables.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ───────────────────────────────── Tables ──────────────────────────────────────

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "sport" TEXT,
    "bio" TEXT,
    "photo_url" TEXT,
    "birth_date" DATE,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_secret" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_users_role" CHECK ("role" IN ('coach', 'athlete'))
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "text_version" TEXT NOT NULL,
    "granted_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_consents_type" CHECK ("type" IN ('data_processing', 'coach_access', 'marketing'))
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_device_platform" CHECK ("platform" IN ('apns', 'fcm'))
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "coach_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "invite_code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_athlete_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "coach_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "group_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "coach_athlete_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_link_source" CHECK ("source" IN ('group', 'direct')),
    CONSTRAINT "chk_link_distinct" CHECK ("coach_id" <> "athlete_id"),
    CONSTRAINT "chk_link_group" CHECK (
        ("source" = 'group'  AND "group_id" IS NOT NULL) OR
        ("source" = 'direct' AND "group_id" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "coach_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduled_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "exercises" JSONB NOT NULL DEFAULT '{"items": []}',
    "exercises_schema_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_sessions_status" CHECK ("status" IN ('draft', 'published', 'archived'))
);

-- CreateTable
CREATE TABLE "session_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "session_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_assignment_status" CHECK ("status" IN ('assigned', 'in_progress', 'completed', 'skipped'))
);

-- CreateTable
CREATE TABLE "performances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assignment_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "results" JSONB NOT NULL DEFAULT '{"items": []}',
    "results_schema_version" INTEGER NOT NULL DEFAULT 1,
    "rpe" SMALLINT,
    "notes" TEXT,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_perf_rpe" CHECK ("rpe" IS NULL OR ("rpe" BETWEEN 1 AND 10))
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id" UUID NOT NULL,
    "session_id" UUID,
    "performance_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_comment_one_target" CHECK (
        ("session_id" IS NOT NULL)::int + ("performance_id" IS NOT NULL)::int = 1
    )
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────── Index simples ─────────────────────────────────

-- CreateIndex
CREATE INDEX "ix_consents_user_type" ON "consents"("user_id", "type");

-- CreateIndex
CREATE INDEX "ix_refresh_user" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "ix_refresh_family" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "ix_device_user" ON "device_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "groups_invite_code_key" ON "groups"("invite_code");

-- CreateIndex
CREATE INDEX "ix_group_members_athlete" ON "group_members"("athlete_id");

-- CreateIndex
CREATE INDEX "ix_sessions_date" ON "sessions"("scheduled_date");

-- CreateIndex
CREATE INDEX "ix_assignment_athlete" ON "session_assignments"("athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "performances_assignment_id_key" ON "performances"("assignment_id");

-- CreateIndex
CREATE INDEX "ix_perf_athlete" ON "performances"("athlete_id");

-- CreateIndex
CREATE INDEX "ix_comments_session" ON "comments"("session_id");

-- CreateIndex
CREATE INDEX "ix_comments_performance" ON "comments"("performance_id");

-- CreateIndex
CREATE INDEX "ix_audit_actor" ON "audit_log"("actor_id");

-- CreateIndex
CREATE INDEX "ix_audit_entity" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "ix_audit_created" ON "audit_log"("created_at");

-- ──────────────────── Index uniques PARTIELS (soft-delete) ──────────────────────
-- Non exprimables en Prisma : garantissent l'unicité uniquement sur les lignes actives.

CREATE UNIQUE INDEX "ux_users_email" ON "users" (lower("email")) WHERE "deleted_at" IS NULL;

CREATE INDEX "ix_groups_coach" ON "groups" ("coach_id") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "ux_group_member_active" ON "group_members" ("group_id", "athlete_id") WHERE "left_at" IS NULL;

CREATE UNIQUE INDEX "ux_link_active" ON "coach_athlete_links" ("coach_id", "athlete_id", "source") WHERE "ended_at" IS NULL;

CREATE INDEX "ix_link_athlete" ON "coach_athlete_links" ("athlete_id") WHERE "ended_at" IS NULL;

CREATE UNIQUE INDEX "ux_assignment_active" ON "session_assignments" ("session_id", "athlete_id") WHERE "deleted_at" IS NULL;

-- ───────────────────────────── Clés étrangères ─────────────────────────────────

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_athlete_links" ADD CONSTRAINT "coach_athlete_links_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_athlete_links" ADD CONSTRAINT "coach_athlete_links_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_athlete_links" ADD CONSTRAINT "coach_athlete_links_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_assignments" ADD CONSTRAINT "session_assignments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_assignments" ADD CONSTRAINT "session_assignments_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performances" ADD CONSTRAINT "performances_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "session_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performances" ADD CONSTRAINT "performances_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_performance_id_fkey" FOREIGN KEY ("performance_id") REFERENCES "performances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────── Triggers set_updated_at (entités mutables) ─────────────

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_groups_updated BEFORE UPDATE ON "groups"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sessions_updated BEFORE UPDATE ON "sessions"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_assignment_updated BEFORE UPDATE ON "session_assignments"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_perf_updated BEFORE UPDATE ON "performances"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_comments_updated BEFORE UPDATE ON "comments"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
