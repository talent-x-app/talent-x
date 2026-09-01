import type { NotificationType } from '@talent-x/api-client';
import {
  NOTIFICATION_PRESENTATIONS,
  formatRelativeDate,
  notificationDescription,
  notificationHref,
  notificationQueryKeys,
} from './notification-ui';

describe('notification-ui (TLX-111, ADR-23)', () => {
  describe('notificationHref', () => {
    it('athlète : séance affectée et feedback → détail de séance (affectation)', () => {
      expect(notificationHref('athlete', 'session_assigned', 'asg-1')).toEqual({
        pathname: '/(athlete)/session/[id]',
        params: { id: 'asg-1' },
      });
      expect(notificationHref('athlete', 'performance_feedback', 'asg-2')).toEqual({
        pathname: '/(athlete)/session/[id]',
        params: { id: 'asg-2' },
      });
    });

    it('coach : performance soumise → revue (affectation) (TLX-139)', () => {
      expect(notificationHref('coach', 'performance_submitted', 'asg-9')).toEqual({
        pathname: '/(coach)/review/[id]',
        params: { id: 'asg-9' },
      });
    });

    it('coach : adhésion groupe → liste des athlètes', () => {
      expect(notificationHref('coach', 'group_update', 'g-1')).toEqual({
        pathname: '/(coach)/athletes',
      });
    });

    it('types non navigables pour le rôle → null', () => {
      expect(notificationHref('coach', 'session_assigned', 'asg-1')).toBeNull();
      expect(notificationHref('athlete', 'group_update', 'g-1')).toBeNull();
      // L'athlète ne reçoit jamais performance_submitted (signal coach).
      expect(notificationHref('athlete', 'performance_submitted', 'asg-1')).toBeNull();
    });
  });

  // TLX-235 : un cas par type. Chaque clé est confrontée à celle qu'utilise réellement
  // l'écran consommateur — la piste du ticket était un point de départ, et elle s'est
  // révélée insuffisante pour `performance_feedback` (cf. ci-dessous).
  describe('notificationQueryKeys', () => {
    it('session_assigned : la liste des séances (accueil, Séances, calendrier)', () => {
      expect(notificationQueryKeys('session_assigned', 'asg-1')).toEqual([['assignments']]);
    });

    it('performance_feedback : l’affectation ET les fils de commentaires', () => {
      // Le fil vit sous `['performance', <perfId>, 'comments']` alors que la notification
      // porte l'id de l'AFFECTATION : sans le second préfixe, le commentaire annoncé
      // n'apparaîtrait jamais — on rafraîchirait tout sauf lui.
      expect(notificationQueryKeys('performance_feedback', 'asg-2')).toEqual([
        ['assignment', 'asg-2'],
        ['performance'],
      ]);
    });

    it('performance_submitted : revue coach + agrégats qui la comptent', () => {
      expect(notificationQueryKeys('performance_submitted', 'asg-9')).toEqual([
        ['assignment', 'asg-9'],
        ['coach', 'dashboard'],
        ['assignments'],
        ['coach', 'assignments', 'completed'],
      ]);
    });

    it('group_update : préfixe des groupes (liste + détail + membres) ET tableau de bord coach', () => {
      // Mesuré sur appareil le 19/08 : sur un seul `group_update`, l'écran « Groupes » se
      // mettait à jour tout seul pendant que l'écran « Athlètes » exigeait encore un
      // rafraîchissement manuel. Une adhésion fait entrer l'athlète dans
      // `GET /coach/dashboard` — le préfixe `['groups']` ne l'atteint pas.
      expect(notificationQueryKeys('group_update', 'g-1')).toEqual([
        ['groups'],
        ['coach', 'dashboard'],
      ]);
    });

    it('group_announcement : annonces du groupe visé', () => {
      expect(notificationQueryKeys('group_announcement', 'g-1')).toEqual([
        ['groups', 'g-1', 'announcements'],
      ]);
    });

    it('group_kudos : l’affectation (les 👏 sont sous son préfixe)', () => {
      expect(notificationQueryKeys('group_kudos', 'asg-3')).toEqual([['assignment', 'asg-3']]);
    });

    /**
     * TLX-266 — ce que cette suite ne peut pas prouver, et le filet qui reste.
     *
     * Ces fonctions sont **pures** : elles reçoivent le `resourceId` qu'on leur donne et ne
     * peuvent pas savoir ce que le serveur émet réellement. C'est précisément ce qui a permis
     * au défaut de vivre : le test se donnait `'asg-3'` pendant que `kudos.service.ts` envoyait
     * un `sessionId`. La garde sur la valeur émise est côté API (`kudos.service.spec.ts`).
     *
     * Ce qui se vérifie ici, c'est la **cohérence des deux fonctions entre elles** : tout type
     * dont le tap ouvre `session/[id]` — une route qui consomme une affectation — doit produire
     * une clé d'invalidation `['assignment', id]`. Les deux avaient été écrites sur deux
     * croyances différentes du même identifiant, et rien ne les confrontait.
     */
    it('les types qui ouvrent `session/[id]` ET invalident le détail visent le même identifiant', () => {
      // `session_assigned` est volontairement hors liste : il n'invalide que `['assignments']`
      // (la séance arrive dans la liste, son détail n'est pas monté), donc il n'utilise pas
      // `resourceId` dans sa clé et n'a rien à confronter.
      const types: NotificationType[] = ['performance_feedback', 'group_kudos'];

      for (const type of types) {
        expect(notificationHref('athlete', type, 'asg-9')).toEqual({
          pathname: '/(athlete)/session/[id]',
          params: { id: 'asg-9' },
        });
        // La route consomme une affectation ; la clé du détail doit porter le même `asg-9`.
        expect(notificationQueryKeys(type, 'asg-9')).toContainEqual(['assignment', 'asg-9']);
      }
    });

    /**
     * TLX-268 / ADR-59 §D3 — les deux routes s'appellent `session/[id]` et **ne prennent pas la
     * même chose** : celle du coach consomme une séance, celle de l'athlète une affectation.
     * L'émetteur donne à chacun la ressource que son écran sait ouvrir ; ici on vérifie que le
     * routage suit bien le rôle, sans quoi on rejouerait TLX-266 sous un autre type.
     */
    it('session_comment : le coach ouvre sa séance, l’athlète son affectation', () => {
      expect(notificationHref('coach', 'session_comment', 's-1')).toEqual({
        pathname: '/(coach)/session/[id]',
        params: { id: 's-1' },
      });
      expect(notificationHref('athlete', 'session_comment', 'asg-1')).toEqual({
        pathname: '/(athlete)/session/[id]',
        params: { id: 'asg-1' },
      });
    });

    it('session_comment : invalide le détail ET le préfixe des fils de séance', () => {
      // Le fil vit sous `['session', <sessionId>, 'comments']` et l'athlète ne reçoit que son
      // affectation : viser le fil précis demanderait une requête, d'où le préfixe racine —
      // même raisonnement que `performance_feedback` avec `['performance']`.
      const keys = notificationQueryKeys('session_comment', 'asg-1');

      expect(keys).toContainEqual(['assignment', 'asg-1']);
      expect(keys).toContainEqual(['session']);
    });

    it('group_reply : préfixe des annonces — couvre le fil ET le compteur de réponses', () => {
      // `resourceId` est le GROUPE, jamais l'annonce : viser le fil précis est impossible
      // sans requête, le préfixe est donc la clé la plus fine disponible.
      expect(notificationQueryKeys('group_reply', 'g-7')).toEqual([
        ['groups', 'g-7', 'announcements'],
      ]);
    });

    it('n’invalide jamais la racine du cache (garde-fou anti « trop large »)', () => {
      const types = [
        'session_assigned',
        'performance_feedback',
        'performance_submitted',
        'group_update',
        'group_announcement',
        'group_kudos',
        'group_reply',
      ] as const;
      for (const type of types) {
        const keys = notificationQueryKeys(type, 'r-1');
        expect(keys.length).toBeGreaterThan(0);
        for (const key of keys) expect(key.length).toBeGreaterThan(0);
      }
    });
  });

  describe('NOTIFICATION_PRESENTATIONS', () => {
    it('performance_submitted : libellé coach « Performance à revoir » (TLX-139)', () => {
      expect(NOTIFICATION_PRESENTATIONS.performance_submitted).toEqual({
        icon: 'check-circle',
        title: 'Performance à revoir',
        description: 'Un athlète a soumis une performance.',
      });
    });
  });

  describe('notificationDescription (ADR-55)', () => {
    it('sans acteur : repli sur la description générique du type', () => {
      expect(notificationDescription('group_update')).toBe(
        NOTIFICATION_PRESENTATIONS.group_update.description,
      );
      expect(notificationDescription('performance_submitted', undefined)).toBe(
        NOTIFICATION_PRESENTATIONS.performance_submitted.description,
      );
    });

    it('avec acteur : phrase nominative par type', () => {
      expect(notificationDescription('group_update', 'Léa')).toBe('Léa a rejoint votre groupe.');
      expect(notificationDescription('performance_submitted', 'Tom')).toBe(
        'Tom a soumis une performance.',
      );
      expect(notificationDescription('performance_feedback', 'Marc')).toBe(
        'Marc a commenté ta performance.',
      );
      expect(notificationDescription('session_assigned', 'Marc')).toBe(
        'Marc t’a affecté une séance.',
      );
      expect(notificationDescription('group_announcement', 'Marc')).toBe(
        'Marc a publié une annonce.',
      );
      expect(notificationDescription('group_reply', 'Léa')).toBe('Léa a répondu à ton annonce.');
      expect(notificationDescription('group_kudos', 'Léa')).toContain('Léa');
    });
  });

  describe('formatRelativeDate', () => {
    const now = new Date('2026-06-10T12:00:00.000Z');

    it.each([
      ['2026-06-10T11:59:40.000Z', 'à l’instant'],
      ['2026-06-10T11:15:00.000Z', 'il y a 45 min'],
      ['2026-06-10T07:00:00.000Z', 'il y a 5 h'],
      ['2026-06-09T08:00:00.000Z', 'hier'],
      ['2026-06-07T08:00:00.000Z', 'il y a 3 j'],
    ])('%s → %s', (iso, expected) => {
      expect(formatRelativeDate(iso, now)).toBe(expected);
    });

    it('au-delà d’une semaine → date courte', () => {
      expect(formatRelativeDate('2026-06-01T08:00:00.000Z', now)).toMatch(/1 juin/);
    });
  });
});
