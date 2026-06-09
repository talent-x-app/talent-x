-- TLX-041 / ADR-16 — Révocation du code d'invitation de groupe.
-- Migration expand-only (ADR-12) : ajout d'une colonne nullable, sans rupture.
-- `invite_code` reste NOT NULL, UNIQUE (TX-DATA-006 §5.1) ; la révocation est
-- portée par cet horodatage (NULL = code actif). L'API masque le code révoqué.
ALTER TABLE "groups" ADD COLUMN "invite_code_revoked_at" TIMESTAMPTZ(6);
