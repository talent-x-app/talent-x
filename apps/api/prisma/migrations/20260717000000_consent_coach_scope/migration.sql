-- TLX-187 (ADR-51 §D2a) — consentement coach_access scopé au coach.
-- Additive et rétrocompatible : coach_id NULL = consentement global historique.
-- L'état courant pour (user, type, coach) = dernière ligne dont coach_id est ce
-- coach OU NULL (une ligne globale plus récente l'emporte, dans les deux sens).
ALTER TABLE "consents"
  ADD COLUMN "coach_id" UUID REFERENCES "users"("id") ON DELETE CASCADE;

CREATE INDEX "ix_consents_user_type_coach" ON "consents" ("user_id", "type", "coach_id");
