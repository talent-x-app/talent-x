-- TLX-109 / ADR-30 — Assignation d'une séance à un groupe.
-- Migration expand-only (ADR-12) : une nouvelle table + une colonne nullable de
-- provenance sur session_assignments. Aucune donnée existante touchée.

-- Affectation de groupe (intention durable) : le fan-out matérialise une
-- SessionAssignment par membre actif, taguée via group_assignment_id.
CREATE TABLE "group_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "due_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "group_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ix_group_assignments_group" ON "group_assignments"("group_id") WHERE "deleted_at" IS NULL;
CREATE INDEX "ix_group_assignments_session" ON "group_assignments"("session_id") WHERE "deleted_at" IS NULL;
-- Idempotence : une affectation de groupe active au plus par couple (séance, groupe).
CREATE UNIQUE INDEX "ux_group_assignment_active" ON "group_assignments" ("session_id", "group_id") WHERE "deleted_at" IS NULL;

ALTER TABLE "group_assignments" ADD CONSTRAINT "group_assignments_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_assignments" ADD CONSTRAINT "group_assignments_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TRIGGER trg_group_assignments_updated BEFORE UPDATE ON "group_assignments"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Provenance sur les affectations individuelles : NULL = affectation directe ;
-- sinon issue d'une affectation de groupe. ON DELETE SET NULL = supprimer
-- l'affectation de groupe ne supprime pas l'historique d'exécution de l'athlète.
ALTER TABLE "session_assignments" ADD COLUMN "group_assignment_id" UUID;
CREATE INDEX "ix_assignment_group_assignment" ON "session_assignments"("group_assignment_id");
ALTER TABLE "session_assignments" ADD CONSTRAINT "session_assignments_group_assignment_id_fkey"
    FOREIGN KEY ("group_assignment_id") REFERENCES "group_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
