import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hache en Argon2id puis vérifie le bon mot de passe', async () => {
    const hash = await service.hash('SecureP@ss123');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('SecureP@ss123');
    await expect(service.verify(hash, 'SecureP@ss123')).resolves.toBe(true);
  });

  it('rejette un mauvais mot de passe', async () => {
    const hash = await service.hash('SecureP@ss123');
    await expect(service.verify(hash, 'mauvais')).resolves.toBe(false);
  });

  it('retourne false (sans lever) sur un hash invalide', async () => {
    await expect(service.verify('pas-un-hash', 'x')).resolves.toBe(false);
  });
});
