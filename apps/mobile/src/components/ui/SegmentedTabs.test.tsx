import { type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { SegmentedTabs, type SegmentedTabItem } from './SegmentedTabs';

const wrap = (children: ReactNode) => <ThemeProvider>{children}</ThemeProvider>;

const items: SegmentedTabItem[] = [
  { key: 'sessions', label: 'Séances', badge: true },
  { key: 'calendar', label: 'Calendrier' },
  { key: 'teammates', label: 'Coéquipiers' },
  { key: 'info', label: 'Infos' },
];

describe('SegmentedTabs', () => {
  it('affiche tous les onglets', () => {
    render(wrap(<SegmentedTabs items={items} activeKey="sessions" onChange={() => {}} />));
    for (const i of items) expect(screen.getByText(i.label)).toBeOnTheScreen();
  });

  it('notifie le changement et marque l’actif comme sélectionné (rôle tab)', () => {
    const onChange = jest.fn();
    render(wrap(<SegmentedTabs items={items} activeKey="sessions" onChange={onChange} />));
    expect(screen.getByLabelText('Séances')).toBeSelected();
    fireEvent.press(screen.getByLabelText('Calendrier'));
    expect(onChange).toHaveBeenCalledWith('calendar');
  });

  it('rend la pastille de notification quand demandée', () => {
    render(
      wrap(
        <SegmentedTabs testID="hub-tabs" items={items} activeKey="sessions" onChange={() => {}} />,
      ),
    );
    expect(screen.getByTestId('hub-tabs-sessions-badge')).toBeOnTheScreen();
    expect(screen.queryByTestId('hub-tabs-calendar-badge')).toBeNull();
  });
});
