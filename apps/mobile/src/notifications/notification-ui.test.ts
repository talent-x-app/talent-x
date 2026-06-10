import { formatRelativeDate, notificationHref } from './notification-ui';

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

    it('coach : adhésion groupe → liste des athlètes', () => {
      expect(notificationHref('coach', 'group_update', 'g-1')).toEqual({
        pathname: '/(coach)/athletes',
      });
    });

    it('types non navigables pour le rôle → null', () => {
      expect(notificationHref('coach', 'session_assigned', 'asg-1')).toBeNull();
      expect(notificationHref('athlete', 'group_update', 'g-1')).toBeNull();
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
