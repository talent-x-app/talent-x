-- TLX-101 / ADR-24 — Compétitions & engagements d'athlètes.
-- Migration expand-only (ADR-12) : deux nouvelles tables, aucune rupture.

CREATE TABLE "competitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "coach_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "discipline" TEXT,
    "location" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_competition_status" CHECK ("status" IN ('draft', 'published', 'cancelled')),
    CONSTRAINT "ck_competition_dates" CHECK ("end_date" IS NULL OR "end_date" >= "start_date")
);

CREATE TABLE "competition_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "competition_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "event_label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'engaged',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "competition_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_entry_status" CHECK ("status" IN ('engaged', 'confirmed', 'withdrawn'))
);

-- Index : date pour le calendrier, partiels (soft-delete) pour le scope coach et l'idempotence.
CREATE INDEX "ix_competitions_date" ON "competitions"("start_date");
CREATE INDEX "ix_competitions_coach" ON "competitions"("coach_id") WHERE "deleted_at" IS NULL;
CREATE INDEX "ix_entry_athlete" ON "competition_entries"("athlete_id");
-- Idempotence de l'engagement : un athlète actif au plus par compétition.
CREATE UNIQUE INDEX "ux_entry_active" ON "competition_entries" ("competition_id", "athlete_id") WHERE "deleted_at" IS NULL;

-- Clés étrangères.
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_coach_id_fkey"
    FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_competition_id_fkey"
    FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_athlete_id_fkey"
    FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Triggers set_updated_at (entités mutables).
CREATE TRIGGER trg_competitions_updated BEFORE UPDATE ON "competitions"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_entry_updated BEFORE UPDATE ON "competition_entries"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
