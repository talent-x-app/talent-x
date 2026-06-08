-- Migration export_jobs (TLX-035) — socle jobs asynchrones RGPD.
-- Dérivée de docs/Talent-X_06_Modele_de_donnees.md §12.1 et de l'ADR-13.
-- Ajoute la table d'état des exports RGPD (flux POST→jobId→GET). La suppression
-- de compte ne crée PAS de table de jobs (soft-delete + purge planifiée, §12).
-- Réutilise la fonction set_updated_at() créée par la migration initiale.

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "object_key" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_export_jobs_status" CHECK ("status" IN ('pending', 'processing', 'ready', 'failed', 'expired'))
);

-- CreateIndex
CREATE INDEX "ix_export_jobs_user_status" ON "export_jobs"("user_id", "status");

-- Index unique PARTIEL : un seul export actif (pending|processing) par utilisateur.
-- Non exprimable en Prisma (idempotence / anti-abus, cf. ADR-13 §1).
CREATE UNIQUE INDEX "ux_export_jobs_active_user" ON "export_jobs" ("user_id") WHERE "status" IN ('pending', 'processing');

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Trigger set_updated_at (entité mutable).
CREATE TRIGGER trg_export_jobs_updated BEFORE UPDATE ON "export_jobs"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
