import { validateEnv } from './env.validation';

const base = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://talentx:talentx@localhost:5432/talentx?schema=public',
};

describe('validateEnv', () => {
  it('retourne une config typée pour un environnement valide', () => {
    expect(validateEnv(base)).toEqual({
      NODE_ENV: 'test',
      PORT: 3000,
      DATABASE_URL: base.DATABASE_URL,
      CONSENT_TEXT_VERSION: '2026-01',
    });
  });

  it('applique la version de consentement par défaut, surchargeable', () => {
    expect(validateEnv(base).CONSENT_TEXT_VERSION).toBe('2026-01');
    expect(validateEnv({ ...base, CONSENT_TEXT_VERSION: '2027-03' }).CONSENT_TEXT_VERSION).toBe(
      '2027-03',
    );
  });

  it('applique les valeurs par défaut (NODE_ENV=development, PORT=3000)', () => {
    const cfg = validateEnv({ DATABASE_URL: base.DATABASE_URL });
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.PORT).toBe(3000);
  });

  it('inclut REDIS_URL quand valide', () => {
    const cfg = validateEnv({ ...base, REDIS_URL: 'redis://localhost:6379' });
    expect(cfg.REDIS_URL).toBe('redis://localhost:6379');
  });

  it('échoue si DATABASE_URL est absent', () => {
    expect(() => validateEnv({ NODE_ENV: 'test' })).toThrow(/DATABASE_URL est requis/);
  });

  it('échoue si DATABASE_URL n’est pas une URL postgresql', () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: 'mysql://x' })).toThrow(/URL postgresql/);
  });

  it('échoue si PORT n’est pas un entier valide', () => {
    expect(() => validateEnv({ ...base, PORT: 'abc' })).toThrow(/PORT doit être un entier/);
  });

  it('échoue si NODE_ENV est inconnu', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'preprod' })).toThrow(/NODE_ENV doit être/);
  });

  it('échoue si REDIS_URL est défini mais invalide', () => {
    expect(() => validateEnv({ ...base, REDIS_URL: 'http://x' })).toThrow(/REDIS_URL/);
  });

  it('n’exige pas JWT_PRIVATE_KEY en dev/test (clé éphémère possible)', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'development' })).not.toThrow();
  });

  it('exige JWT_PRIVATE_KEY en production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /JWT_PRIVATE_KEY est requis en production/,
    );
  });

  it('exige JWT_PRIVATE_KEY en staging', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'staging' })).toThrow(
      /JWT_PRIVATE_KEY est requis/,
    );
  });

  it('rejette une JWT_PRIVATE_KEY qui n’est pas un PEM', () => {
    expect(() => validateEnv({ ...base, JWT_PRIVATE_KEY: 'secret-en-dur' })).toThrow(
      /JWT_PRIVATE_KEY doit être une clé PEM/,
    );
  });

  it('passe through les variables JWT quand présentes et bien formées', () => {
    const cfg = validateEnv({
      ...base,
      JWT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
      JWT_KEY_ID: 'k-1',
      JWT_ADDITIONAL_PUBLIC_KEYS: '[]',
    });
    expect(cfg.JWT_KEY_ID).toBe('k-1');
    expect(cfg.JWT_ADDITIONAL_PUBLIC_KEYS).toBe('[]');
    expect(cfg.JWT_PRIVATE_KEY).toContain('BEGIN PRIVATE KEY');
  });
});
