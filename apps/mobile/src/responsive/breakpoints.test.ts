import {
  BREAKPOINT_EXPANDED,
  BREAKPOINT_MEDIUM,
  CONTENT_MAX_WIDTH,
  breakpointForWidth,
  contentMaxWidthForWidth,
} from './breakpoints';

describe('breakpoints (TLX-123)', () => {
  describe('breakpointForWidth', () => {
    it('classe la largeur en compact / medium / expanded', () => {
      expect(breakpointForWidth(375)).toBe('compact');
      expect(breakpointForWidth(BREAKPOINT_MEDIUM - 1)).toBe('compact');
      expect(breakpointForWidth(BREAKPOINT_MEDIUM)).toBe('medium');
      expect(breakpointForWidth(800)).toBe('medium');
      expect(breakpointForWidth(BREAKPOINT_EXPANDED - 1)).toBe('medium');
      expect(breakpointForWidth(BREAKPOINT_EXPANDED)).toBe('expanded');
      expect(breakpointForWidth(1440)).toBe('expanded');
    });
  });

  describe('contentMaxWidthForWidth', () => {
    it('libre sur téléphone, bornée dès le seuil tablette', () => {
      expect(contentMaxWidthForWidth(375)).toBeUndefined();
      expect(contentMaxWidthForWidth(BREAKPOINT_MEDIUM - 1)).toBeUndefined();
      expect(contentMaxWidthForWidth(BREAKPOINT_MEDIUM)).toBe(CONTENT_MAX_WIDTH);
      expect(contentMaxWidthForWidth(1440)).toBe(CONTENT_MAX_WIDTH);
    });
  });
});
