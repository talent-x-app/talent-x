-- TLX-184 / ADR-48 (Palier 1) — Réactions emoji agrégées aux annonces de groupe.
-- Jeu d'emoji BORNÉ côté serveur (CHECK), un emoji par (annonce, utilisateur) togglable
-- (UNIQUE). L'API n'expose que des compteurs agrégés + les réactions propres de l'appelant
-- (patron d'agrégat ADR-45) — jamais l'identité d'un tiers. Pas de suppression soft :
-- retirer une réaction = DELETE.
CREATE TABLE "announcement_reactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "announcement_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "announcement_reactions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "announcement_reactions" ADD CONSTRAINT "announcement_reactions_announcement_id_fkey"
    FOREIGN KEY ("announcement_id") REFERENCES "group_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_reactions" ADD CONSTRAINT "announcement_reactions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Jeu d'emoji borné (enum applicatif ANNOUNCEMENT_REACTION_EMOJIS). Évolutif via remplacement
-- du CHECK, jamais de valeur libre (cohérent « zéro valeur en dur »).
ALTER TABLE "announcement_reactions" ADD CONSTRAINT "ck_announcement_reaction_emoji"
    CHECK ("emoji" IN ('❤️', '🔥', '👏', '💪', '😮'));

-- Un emoji par personne et par annonce (togglable). Sert aussi d'idempotence au PUT.
CREATE UNIQUE INDEX "uq_announcement_reaction" ON "announcement_reactions"("announcement_id", "user_id", "emoji");
CREATE INDEX "ix_announcement_reaction_announcement" ON "announcement_reactions"("announcement_id");
