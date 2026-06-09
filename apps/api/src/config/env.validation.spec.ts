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
      EXPORT_ARCHIVE_TTL_HOURS: 24,
      EXPORT_URL_TTL_SECONDS: 86400,
      ACCOUNT_PURGE_RETENTION_DAYS: 30,
      CONSENT_TEXT_VERSION: '2026-01',
    });
  });

  it('applique la rétention de purge par défaut (30 j) et la surcharge', () => {
    expect(validateEnv(base).ACCOUNT_PURGE_RETENTION_DAYS).toBe(30);
    expect(
      validateEnv({ ...base, ACCOUNT_PURGE_RETENTION_DAYS: '7' }).ACCOUNT_PURGE_RETENTION_DAYS,
    ).toBe(7);
  });

  it('rejette une rétention de purge non entière ou ≤ 0', () => {
    expect(() => validateEnv({ ...base, ACCOUNT_PURGE_RETENTION_DAYS: '0' })).toThrow(
      /ACCOUNT_PURGE_RETENTION_DAYS/,
    );
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

  // --- Redis / S3 / durées d'export (TLX-035) ---

  const prodReady = {
    ...base,
    NODE_ENV: 'production',
    JWT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
    REDIS_URL: 'redis://localhost:6379',
    S3_ENDPOINT: 'https://s3.gra.io.cloud.ovh.net',
    S3_REGION: 'gra',
    S3_BUCKET: 'talentx-exports',
    S3_ACCESS_KEY_ID: 'ak',
    S3_SECRET_ACCESS_KEY: 'sk',
  };

  it('exige REDIS_URL en production', () => {
    const { REDIS_URL: _omit, ...withoutRedis } = prodReady;
    expect(() => validateEnv(withoutRedis)).toThrow(/REDIS_URL est requis en production/);
  });

  it('exige la config S3 complète en production', () => {
    const { S3_BUCKET: _omit, ...withoutBucket } = prodReady;
    expect(() => validateEnv(withoutBucket)).toThrow(/S3_BUCKET/);
  });

  it('accepte une config production complète et passe through S3', () => {
    const cfg = validateEnv(prodReady);
    expect(cfg.S3_BUCKET).toBe('talentx-exports');
    expect(cfg.S3_ENDPOINT).toBe('https://s3.gra.io.cloud.ovh.net');
  });

  it('n’exige ni Redis ni S3 en dev/test', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'development' })).not.toThrow();
  });

  it('rejette un S3_ENDPOINT non http(s)', () => {
    expect(() => validateEnv({ ...base, S3_ENDPOINT: 'ftp://x' })).toThrow(/S3_ENDPOINT/);
  });

  it('applique les durées d’export par défaut et les surcharge', () => {
    expect(validateEnv(base).EXPORT_ARCHIVE_TTL_HOURS).toBe(24);
    expect(validateEnv(base).EXPORT_URL_TTL_SECONDS).toBe(86400);
    const cfg = validateEnv({
      ...base,
      EXPORT_ARCHIVE_TTL_HOURS: '48',
      EXPORT_URL_TTL_SECONDS: '600',
    });
    expect(cfg.EXPORT_ARCHIVE_TTL_HOURS).toBe(48);
    expect(cfg.EXPORT_URL_TTL_SECONDS).toBe(600);
  });

  it('rejette une durée d’export non entière', () => {
    expect(() => validateEnv({ ...base, EXPORT_ARCHIVE_TTL_HOURS: '0' })).toThrow(
      /EXPORT_ARCHIVE_TTL_HOURS/,
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
