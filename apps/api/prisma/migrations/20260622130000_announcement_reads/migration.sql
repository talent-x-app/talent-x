-- TLX-184 / ADR-48 (Palier 1) — Accusé de lecture agrégé des annonces de groupe.
-- Une ligne par (annonce, membre) ayant lu. L'API n'expose que l'agrégat readCount/memberCount
-- (« 9/12 ont lu ») — JAMAIS la liste des lecteurs (patron d'agrégat ADR-45). Idempotent côté
-- service (PK composite = clé d'upsert). Pas de soft-delete.
CREATE TABLE "announcement_reads" (
    "announcement_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("announcement_id", "user_id")
);

ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_fkey"
    FOREIGN KEY ("announcement_id") REFERENCES "group_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
