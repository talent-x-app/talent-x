-- TLX-185 / ADR-48 (Palier 2) / ADR-49 — Kudos de participation entre coéquipiers.
-- Un encouragement 👏 d'un athlète (giver) sur la présence CONFIRMÉE d'une affectation de
-- coéquipier (attendance='going'), togglable, un par personne (UNIQUE). Ne porte JAMAIS sur la
-- performance (ADR-08/21). L'API n'expose que l'agrégat + les auteurs minimisés (ADR-37).
-- Visibilité de présence pair-à-pair actée en TX-DPIA-007 §5.6.
CREATE TABLE "participation_kudos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assignment_id" UUID NOT NULL,
    "giver_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "participation_kudos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "participation_kudos" ADD CONSTRAINT "participation_kudos_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "session_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "participation_kudos" ADD CONSTRAINT "participation_kudos_giver_id_fkey"
    FOREIGN KEY ("giver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un kudos par personne et par affectation (togglable). Sert aussi d'idempotence au PUT.
CREATE UNIQUE INDEX "uq_participation_kudos" ON "participation_kudos"("assignment_id", "giver_id");
CREATE INDEX "ix_participation_kudos_assignment" ON "participation_kudos"("assignment_id");

-- Nouveau type de notification `group_kudos` (ADR-49) : étend le CHECK existant (migration additive).
ALTER TABLE "notifications" DROP CONSTRAINT "ck_notification_type";
ALTER TABLE "notifications" ADD CONSTRAINT "ck_notification_type"
    CHECK ("type" IN ('session_assigned', 'performance_feedback', 'group_update', 'performance_submitted', 'group_announcement', 'group_kudos'));
