import { checkBuildEnv } from './check-build-env';

/**
 * Chaque cas rouge correspond à une panne réellement rencontrée pendant la mise sur appareil
 * (TLX-84) — pas à une liste théorique de validations.
 */
describe('checkBuildEnv', () => {
  const LAN = 'http://172.20.10.2:3000/api/v1';
  const PROD = 'https://api.talent-x.example/api/v1';

  describe('profils exemptés', () => {
    // Un dev client ne bundle pas le JS de l'app : il le charge depuis Metro, qui lit le `.env`
    // local. Exiger la variable ici serait un faux positif à chaque build de dev client.
    it('development : ignoré même sans URL', () => {
      const result = checkBuildEnv({ profile: 'development', apiUrl: undefined });

      expect(result).toMatchObject({ ok: true, skipped: true });
    });

    it('hors build EAS (aucun profil) : ignoré', () => {
      expect(checkBuildEnv({ profile: undefined, apiUrl: undefined })).toMatchObject({
        ok: true,
        skipped: true,
      });
    });
  });

  describe('profils qui figent la configuration', () => {
    it.each(['preview', 'production'])('%s : URL conforme acceptée', (profile) => {
      expect(checkBuildEnv({ profile, apiUrl: PROD })).toEqual({ ok: true });
    });

    // État créé par le nettoyage des variables EAS : plus rien ne fournit d'URL.
    it.each(['preview', 'production'])('%s : URL absente refusée', (profile) => {
      const result = checkBuildEnv({ profile, apiUrl: undefined });

      expect(result.ok).toBe(false);
      expect((result as { message: string }).message).toMatch(/vide/);
    });

    it('chaîne d’espaces traitée comme absente', () => {
      expect(checkBuildEnv({ profile: 'preview', apiUrl: '   ' }).ok).toBe(false);
    });

    // Le cas qui coûte le plus cher : les variables EAS pointaient un backend d'une itération
    // antérieure, toujours en ligne, servant `/api` sans `/v1`. L'app démarrait et renvoyait 404.
    it('préfixe /api/v1 manquant refusé, même sur une URL par ailleurs valide', () => {
      const result = checkBuildEnv({
        profile: 'preview',
        apiUrl: 'https://backend-talent-x.onrender.com/api',
      });

      expect(result.ok).toBe(false);
      expect((result as { message: string }).message).toMatch(/api\/v1/);
    });

    it('barre oblique finale tolérée', () => {
      expect(checkBuildEnv({ profile: 'preview', apiUrl: `${PROD}/` })).toEqual({ ok: true });
    });

    it('URL malformée refusée', () => {
      const result = checkBuildEnv({ profile: 'preview', apiUrl: 'pas-une-url/api/v1' });

      expect(result.ok).toBe(false);
      expect((result as { message: string }).message).toMatch(/valide/);
    });
  });

  describe('HTTP en clair', () => {
    // Toléré en preview : c'est ainsi qu'on teste un build autonome contre l'API du poste de dev.
    it('preview : HTTP accepté (test contre une API LAN)', () => {
      expect(checkBuildEnv({ profile: 'preview', apiUrl: LAN })).toEqual({ ok: true });
    });

    // Refusé en production : le contournement ATS/cleartext ne doit pas partir en store.
    it('production : HTTP refusé', () => {
      const result = checkBuildEnv({ profile: 'production', apiUrl: LAN });

      expect(result.ok).toBe(false);
      expect((result as { message: string }).message).toMatch(/store/);
    });
  });
});
