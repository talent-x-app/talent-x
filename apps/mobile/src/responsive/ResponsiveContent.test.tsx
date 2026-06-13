import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

const mockUseWindowDimensions = jest.fn();
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockUseWindowDimensions(),
}));

import { ResponsiveContent } from './ResponsiveContent';

function maxWidthOf(testID: string): number | undefined {
  const flat = StyleSheet.flatten(screen.getByTestId(testID).props.style) as { maxWidth?: number };
  return flat.maxWidth;
}

describe('ResponsiveContent (TLX-123)', () => {
  it('borne la largeur sur grand écran', () => {
    mockUseWindowDimensions.mockReturnValue({ width: 1280, height: 800, scale: 1, fontScale: 1 });
    render(
      <ResponsiveContent testID="rc">
        <Text>contenu</Text>
      </ResponsiveContent>,
    );
    expect(maxWidthOf('rc')).toBe(960);
  });

  it('pleine largeur sur téléphone (aucune borne)', () => {
    mockUseWindowDimensions.mockReturnValue({ width: 375, height: 812, scale: 2, fontScale: 1 });
    render(
      <ResponsiveContent testID="rc">
        <Text>contenu</Text>
      </ResponsiveContent>,
    );
    expect(maxWidthOf('rc')).toBeUndefined();
  });
});
