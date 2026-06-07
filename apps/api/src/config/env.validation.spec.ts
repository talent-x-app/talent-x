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
    });
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
});
