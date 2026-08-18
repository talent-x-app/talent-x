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
      THROTTLE_ENABLED: false,
      THROTTLE_TTL_SECONDS: 60,
      THROTTLE_LIMIT: 300,
      THROTTLE_STRICT_TTL_SECONDS: 900,
      THROTTLE_STRICT_LIMIT: 10,
      TRUST_PROXY_HOPS: 0,
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
    APP_PUBLIC_URL: 'https://app.talent-x.example',
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

  it('exige APP_PUBLIC_URL en production et le passe through (TLX-104)', () => {
    const { APP_PUBLIC_URL: _omit, ...withoutAppUrl } = prodReady;
    expect(() => validateEnv(withoutAppUrl)).toThrow(/APP_PUBLIC_URL est requis en production/);
    expect(validateEnv(prodReady).APP_PUBLIC_URL).toBe('https://app.talent-x.example');
  });

  it('rejette un APP_PUBLIC_URL non http(s)', () => {
    expect(() => validateEnv({ ...base, APP_PUBLIC_URL: 'ftp://x' })).toThrow(/APP_PUBLIC_URL/);
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

  // --- Credentials push APNs/FCM (TLX-107) ---

  const apnsEnv = {
    APNS_KEY_ID: 'KID123',
    APNS_TEAM_ID: 'TEAM123',
    APNS_BUNDLE_ID: 'com.talentx.app',
    APNS_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
  };

  it('n’exige aucun credential push (optionnels partout)', () => {
    expect(() => validateEnv(base)).not.toThrow();
  });

  it('passe through les credentials push quand le groupe est complet', () => {
    const cfg = validateEnv({ ...base, ...apnsEnv, APNS_PRODUCTION: 'true' });
    expect(cfg.APNS_KEY_ID).toBe('KID123');
    expect(cfg.APNS_BUNDLE_ID).toBe('com.talentx.app');
    expect(cfg.APNS_PRODUCTION).toBe('true');
  });

  it('rejette une config APNs partielle (tout-ou-rien)', () => {
    const { APNS_BUNDLE_ID: _omit, ...partial } = apnsEnv;
    expect(() => validateEnv({ ...base, ...partial })).toThrow(/APNs incomplète/);
  });

  // --- Credentials email Brevo (TLX-128) ---

  const emailEnv = {
    BREVO_API_KEY: 'xkeysib-abc',
    EMAIL_FROM_ADDRESS: 'no-reply@talent-x.example',
  };

  it('n’exige aucun credential email (optionnels partout)', () => {
    expect(() => validateEnv(base)).not.toThrow();
  });

  it('passe through les credentials email quand le groupe est complet', () => {
    const cfg = validateEnv({ ...base, ...emailEnv, EMAIL_FROM_NAME: 'Talent-X' });
    expect(cfg.BREVO_API_KEY).toBe('xkeysib-abc');
    expect(cfg.EMAIL_FROM_ADDRESS).toBe('no-reply@talent-x.example');
    expect(cfg.EMAIL_FROM_NAME).toBe('Talent-X');
  });

  it('rejette une config email partielle (tout-ou-rien)', () => {
    expect(() => validateEnv({ ...base, BREVO_API_KEY: 'k' })).toThrow(
      /email \(Brevo\) incomplète/,
    );
  });

  // --- Rate limiting (TLX-233) ---

  it('désactive le throttling par défaut en dev/test, l’active en prod-like', () => {
    expect(validateEnv(base).THROTTLE_ENABLED).toBe(false);
    expect(validateEnv({ ...base, NODE_ENV: 'development' }).THROTTLE_ENABLED).toBe(false);
    expect(validateEnv(prodReady).THROTTLE_ENABLED).toBe(true);
    expect(validateEnv({ ...prodReady, NODE_ENV: 'staging' }).THROTTLE_ENABLED).toBe(true);
  });

  it('permet de surcharger THROTTLE_ENABLED dans les deux sens', () => {
    expect(validateEnv({ ...base, THROTTLE_ENABLED: 'true' }).THROTTLE_ENABLED).toBe(true);
    expect(validateEnv({ ...prodReady, THROTTLE_ENABLED: 'false' }).THROTTLE_ENABLED).toBe(false);
  });

  it('rejette un THROTTLE_ENABLED qui n’est ni true ni false', () => {
    expect(() => validateEnv({ ...base, THROTTLE_ENABLED: 'yes' })).toThrow(/THROTTLE_ENABLED/);
  });

  it('applique les seuils de throttling par défaut et les surcharge', () => {
    const cfg = validateEnv(base);
    expect(cfg.THROTTLE_TTL_SECONDS).toBe(60);
    expect(cfg.THROTTLE_LIMIT).toBe(300);
    expect(cfg.THROTTLE_STRICT_TTL_SECONDS).toBe(900);
    expect(cfg.THROTTLE_STRICT_LIMIT).toBe(10);
    const overridden = validateEnv({
      ...base,
      THROTTLE_TTL_SECONDS: '30',
      THROTTLE_LIMIT: '50',
      THROTTLE_STRICT_TTL_SECONDS: '120',
      THROTTLE_STRICT_LIMIT: '3',
    });
    expect(overridden.THROTTLE_TTL_SECONDS).toBe(30);
    expect(overridden.THROTTLE_LIMIT).toBe(50);
    expect(overridden.THROTTLE_STRICT_TTL_SECONDS).toBe(120);
    expect(overridden.THROTTLE_STRICT_LIMIT).toBe(3);
  });

  it('rejette un seuil de throttling non entier ou ≤ 0', () => {
    expect(() => validateEnv({ ...base, THROTTLE_LIMIT: '0' })).toThrow(/THROTTLE_LIMIT/);
    expect(() => validateEnv({ ...base, THROTTLE_STRICT_TTL_SECONDS: 'abc' })).toThrow(
      /THROTTLE_STRICT_TTL_SECONDS/,
    );
  });

  it('TRUST_PROXY_HOPS : défaut 0 en dev/test, 1 en prod-like, surchargeable', () => {
    expect(validateEnv(base).TRUST_PROXY_HOPS).toBe(0);
    expect(validateEnv(prodReady).TRUST_PROXY_HOPS).toBe(1);
    expect(validateEnv({ ...prodReady, TRUST_PROXY_HOPS: '2' }).TRUST_PROXY_HOPS).toBe(2);
    expect(validateEnv({ ...prodReady, TRUST_PROXY_HOPS: '0' }).TRUST_PROXY_HOPS).toBe(0);
  });

  it('rejette un TRUST_PROXY_HOPS négatif ou non entier', () => {
    expect(() => validateEnv({ ...base, TRUST_PROXY_HOPS: '-1' })).toThrow(/TRUST_PROXY_HOPS/);
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
