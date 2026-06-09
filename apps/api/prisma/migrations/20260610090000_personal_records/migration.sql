-- TLX-076 / ADR-20 — Records personnels matérialisés (TX-DATA-006 §5.7).
-- Migration expand-only (ADR-12) : nouvelle table, aucune rupture.
CREATE TABLE "personal_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "athlete_id" UUID NOT NULL,
    "event_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" DECIMAL NOT NULL,
    "unit" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "achieved_at" DATE NOT NULL,
    "performance_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_record_value" CHECK ("value" >= 0),
    CONSTRAINT "ck_record_unit" CHECK ("unit" IN ('s', 'm')),
    CONSTRAINT "ck_record_direction" CHECK ("direction" IN ('min', 'max'))
);

CREATE UNIQUE INDEX "ux_record_athlete_event" ON "personal_records"("athlete_id", "event_key");

ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_athlete_id_fkey"
    FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_performance_id_fkey"
    FOREIGN KEY ("performance_id") REFERENCES "performances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
