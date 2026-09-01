-- TLX-268 / ADR-59 — Notification de la discussion de séance.
--
-- Le fil de séance (TLX-118) était livré sans canal d'alerte : une question d'athlète ne
-- prévenait pas le coach, une réponse de coach ne prévenait pas l'athlète. Mesuré sur appareil
-- (QA-04.7) : 0 notification émise dans les deux sens, sonde vérifiée par témoin positif.
--
-- Aucune table, aucune colonne : seul le CHECK de `notifications.type` s'étend, exactement comme
-- ADR-46 (`group_announcement`) puis ADR-50 (`group_reply`). Additif et réversible.
--
-- ⚠️ À appliquer AVANT le déploiement du code qui émet le type : sans ce CHECK élargi, l'écriture
-- de l'entrée de feed échouerait sur la contrainte et le job serait rejoué en boucle.
ALTER TABLE "notifications" DROP CONSTRAINT "ck_notification_type";
ALTER TABLE "notifications" ADD CONSTRAINT "ck_notification_type"
    CHECK ("type" IN ('session_assigned', 'performance_feedback', 'group_update', 'performance_submitted', 'group_announcement', 'group_kudos', 'group_reply', 'session_comment'));
