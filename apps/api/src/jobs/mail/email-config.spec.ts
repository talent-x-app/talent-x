import { parseEmailConfig, validateEmailEnv, type EnvGetter } from './email-config';

const FULL = {
  BREVO_API_KEY: 'xkeysib-abc',
  EMAIL_FROM_ADDRESS: 'no-reply@talent-x.example',
  EMAIL_FROM_NAME: 'Talent-X Prod',
};

const getter =
  (env: Record<string, string>): EnvGetter =>
  (key) =>
    env[key];

describe('email-config (TLX-128)', () => {
  describe('validateEmailEnv (tout-ou-rien)', () => {
    it('aucun credential → aucune erreur', () => {
      expect(validateEmailEnv(getter({}))).toEqual([]);
    });

    it('credentials requis complets → aucune erreur', () => {
      expect(validateEmailEnv(getter(FULL))).toEqual([]);
    });

    it('EMAIL_FROM_NAME seul ne déclenche pas (optionnel)', () => {
      expect(validateEmailEnv(getter({ EMAIL_FROM_NAME: 'X' }))).toEqual([]);
    });

    it('groupe partiel → erreur listant les champs manquants', () => {
      const errors = validateEmailEnv(getter({ BREVO_API_KEY: 'k' }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/email \(Brevo\) incomplète/);
      expect(errors[0]).toMatch(/EMAIL_FROM_ADDRESS/);
    });

    it('valeur vide compte comme absente (partiel)', () => {
      const errors = validateEmailEnv(getter({ BREVO_API_KEY: 'k', EMAIL_FROM_ADDRESS: '   ' }));
      expect(errors[0]).toMatch(/EMAIL_FROM_ADDRESS/);
    });
  });

  describe('parseEmailConfig', () => {
    it('résout les credentials complets (trim)', () => {
      const cfg = parseEmailConfig(getter({ ...FULL, BREVO_API_KEY: '  xkeysib-abc  ' }));
      expect(cfg).toEqual({
        apiKey: 'xkeysib-abc',
        fromAddress: 'no-reply@talent-x.example',
        fromName: 'Talent-X Prod',
      });
    });

    it('EMAIL_FROM_NAME absent → nom par défaut Talent-X', () => {
      const { EMAIL_FROM_NAME: _omit, ...required } = FULL;
      expect(parseEmailConfig(getter(required))?.fromName).toBe('Talent-X');
    });

    it('groupe partiel → null (retombe sur le logging)', () => {
      expect(parseEmailConfig(getter({ BREVO_API_KEY: 'k' }))).toBeNull();
      expect(parseEmailConfig(getter({}))).toBeNull();
    });
  });
});
