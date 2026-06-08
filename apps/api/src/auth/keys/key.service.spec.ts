import { Logger } from '@nestjs/common';
import { generateKeyPairPem } from './jwt-keys.config';
import { KeyService } from './key.service';

/**
 * `KeyService` lit la configuration depuis `process.env`. On l'isole en
 * sauvegardant/restaurant les variables autour de chaque cas.
 */
const key = generateKeyPairPem();

describe('KeyService (TLX-020)', () => {
  const ENV_KEYS = ['NODE_ENV', 'JWT_PRIVATE_KEY', 'JWT_KEY_ID', 'JWT_ADDITIONAL_PUBLIC_KEYS'];
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('expose la clé active et son kid après initialisation', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_PRIVATE_KEY = key.privateKey;
    process.env.JWT_KEY_ID = 'k-test';

    const service = new KeyService();
    service.onModuleInit();

    expect(service.algorithm).toBe('RS256');
    expect(service.getActiveKid()).toBe('k-test');
    expect(service.getSigningKey().privateKey.asymmetricKeyType).toBe('rsa');
    expect(service.getVerificationKey('k-test')).toBeDefined();
    expect(service.getVerificationKey('inconnu')).toBeUndefined();
    expect(service.listVerificationKids()).toContain('k-test');
  });

  it('génère une clé éphémère en dev sans configuration et journalise un avertissement', () => {
    process.env.NODE_ENV = 'development';
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();

    const service = new KeyService();
    service.onModuleInit();

    expect(service.getActiveKid()).toBeTruthy();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('éphémère'));
    jest.restoreAllMocks();
  });

  it('lève une erreur si une méthode est appelée avant onModuleInit', () => {
    expect(() => new KeyService().getSigningKey()).toThrow(/non initialisé/);
  });
});
