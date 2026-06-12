-- TLX-104 / TX-SEC-003 §11 — Jetons de réinitialisation de mot de passe.
-- Migration expand-only (ADR-12) : nouvelle table, aucune rupture.
-- Token opaque à usage unique et expirant ; seul le SHA-256 est persisté
-- (le jeton en clair ne vit que dans l'email). `used_at` = consommation.
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- Recherche par empreinte (lookup au reset) ; unicité = pas deux jetons de même hash.
CREATE UNIQUE INDEX "ux_password_reset_token_hash" ON "password_reset_tokens" ("token_hash");
CREATE INDEX "ix_password_reset_user" ON "password_reset_tokens" ("user_id");

ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
