import { normalizePem, parsePushConfig, validatePushEnv, type EnvGetter } from './push-config';

const APNS = {
  APNS_KEY_ID: 'KID123',
  APNS_TEAM_ID: 'TEAM123',
  APNS_BUNDLE_ID: 'com.talentx.app',
  APNS_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
};
const FCM = {
  FCM_PROJECT_ID: 'talentx-prod',
  FCM_CLIENT_EMAIL: 'svc@talentx.iam.gserviceaccount.com',
  FCM_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nxyz\\n-----END PRIVATE KEY-----',
};

const getter =
  (env: Record<string, string>): EnvGetter =>
  (key) =>
    env[key];

describe('push-config (TLX-107)', () => {
  describe('validatePushEnv (tout-ou-rien)', () => {
    it('aucun credential → aucune erreur', () => {
      expect(validatePushEnv(getter({}))).toEqual([]);
    });

    it('APNs complet → aucune erreur', () => {
      expect(validatePushEnv(getter(APNS))).toEqual([]);
    });

    it('APNs partiel → erreur listant les champs manquants', () => {
      const { APNS_PRIVATE_KEY: _omit, ...partial } = APNS;
      const errors = validatePushEnv(getter(partial));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/APNs incomplète/);
      expect(errors[0]).toMatch(/APNS_PRIVATE_KEY/);
    });

    it('FCM partiel → erreur dédiée', () => {
      const { FCM_PROJECT_ID: _omit, ...partial } = FCM;
      const errors = validatePushEnv(getter(partial));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/FCM incomplète/);
      expect(errors[0]).toMatch(/FCM_PROJECT_ID/);
    });

    it('valeur vide compte comme absente (partiel)', () => {
      const errors = validatePushEnv(getter({ ...APNS, APNS_BUNDLE_ID: '   ' }));
      expect(errors[0]).toMatch(/APNS_BUNDLE_ID/);
    });
  });

  describe('parsePushConfig', () => {
    it('résout APNs + FCM quand les deux sont complets', () => {
      const cfg = parsePushConfig(getter({ ...APNS, ...FCM, APNS_PRODUCTION: 'true' }));
      expect(cfg.apns).toMatchObject({
        keyId: 'KID123',
        teamId: 'TEAM123',
        bundleId: 'com.talentx.app',
        production: true,
      });
      expect(cfg.fcm).toMatchObject({ projectId: 'talentx-prod' });
    });

    it('APNS_PRODUCTION absent → sandbox (false)', () => {
      expect(parsePushConfig(getter(APNS)).apns?.production).toBe(false);
    });

    it('restaure les sauts de ligne échappés des clés PEM', () => {
      const cfg = parsePushConfig(getter(APNS));
      expect(cfg.apns?.privateKey).toContain('\n');
      expect(cfg.apns?.privateKey).not.toContain('\\n');
    });

    it('groupe partiel → traité comme absent (null)', () => {
      const { FCM_PRIVATE_KEY: _omit, ...partial } = FCM;
      expect(parsePushConfig(getter(partial)).fcm).toBeNull();
    });
  });

  describe('normalizePem', () => {
    it('remplace \\n littéral par de vrais sauts de ligne et trim', () => {
      expect(normalizePem('  a\\nb\\nc  ')).toBe('a\nb\nc');
    });
  });
});
