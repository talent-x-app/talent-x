-- R1 / ADR-55 — Notifications in-app nominatives (push générique préservé).
-- Ajoute l'acteur de l'événement à la notification : on stocke l'IDENTIFIANT (FK vers users),
-- jamais le nom — le prénom est résolu au read time pour le feed in-app. Colonne nullable,
-- additive, sans backfill : les anciennes lignes (et les types sans acteur) restent génériques
-- via le repli côté client. SET NULL si le compte de l'acteur est purgé (ADR-15).

ALTER TABLE "notifications" ADD COLUMN "actor_id" UUID;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
