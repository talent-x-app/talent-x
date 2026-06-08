import { toUserMessage } from './error-message';

describe('toUserMessage (TLX-010)', () => {
  it('traite une erreur réseau (sans status) comme un problème de connexion', () => {
    expect(toUserMessage(new Error('Network request failed'))).toEqual({
      title: 'Connexion impossible',
      description: 'Vérifiez votre connexion internet et réessayez.',
    });
  });

  it('mappe 401 sur une session expirée', () => {
    expect(toUserMessage({ status: 401 }).title).toBe('Session expirée');
  });

  it('mappe 403 et reprend le message de l’API si présent', () => {
    expect(toUserMessage({ status: 403, data: { message: 'Réservé aux coachs' } })).toEqual({
      title: 'Accès refusé',
      description: 'Réservé aux coachs',
    });
  });

  it('fournit un repli pour 403 sans message d’API', () => {
    expect(toUserMessage({ status: 403 }).description).toBe(
      "Vous n'avez pas les droits pour cette action.",
    );
  });

  it('mappe 422 sur une saisie invalide', () => {
    expect(toUserMessage({ status: 422 }).title).toBe('Saisie invalide');
  });

  it('mappe les 5xx sur une erreur serveur générique (sans fuite technique)', () => {
    const msg = toUserMessage({ status: 503, data: { message: 'stack trace interne' } });
    expect(msg.title).toBe('Erreur serveur');
    expect(msg.description).not.toContain('stack');
  });

  it('ignore un message d’API non-string', () => {
    expect(toUserMessage({ status: 404, data: { message: 42 } }).description).toBeUndefined();
  });
});
