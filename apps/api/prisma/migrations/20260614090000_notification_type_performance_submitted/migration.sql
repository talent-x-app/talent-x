-- TLX-140 (corrige TLX-139) — Étend la contrainte de type des notifications au nouveau
-- type `performance_submitted`. La migration 20260613110000 a ajouté la colonne de
-- préférence du type mais n'a pas élargi `ck_notification_type` : le worker échouait à
-- persister la notif in-app (violation de check 23514). Découvert en vérification live.
-- Expand-only (ADR-12) : on remplace la contrainte par sa version élargie, aucune donnée existante invalidée.
ALTER TABLE "notifications" DROP CONSTRAINT "ck_notification_type";
ALTER TABLE "notifications"
    ADD CONSTRAINT "ck_notification_type" CHECK ("type" IN ('session_assigned', 'performance_feedback', 'group_update', 'performance_submitted'));
