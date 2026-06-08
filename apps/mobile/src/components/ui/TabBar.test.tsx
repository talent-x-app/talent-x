import '@testing-library/react-native/extend-expect';
import { type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { TabBar, type TabBarItem } from './TabBar';

const wrap = (children: ReactNode) => <ThemeProvider>{children}</ThemeProvider>;

const items: TabBarItem[] = [
  { key: 'home', label: 'Accueil' },
  { key: 'sessions', label: 'Séances' },
  { key: 'profile', label: 'Profil' },
];

describe('TabBar (TLX-006)', () => {
  it('affiche tous les onglets', () => {
    render(wrap(<TabBar items={items} activeKey="home" onChange={() => {}} />));
    expect(screen.getByText('Accueil')).toBeOnTheScreen();
    expect(screen.getByText('Séances')).toBeOnTheScreen();
    expect(screen.getByText('Profil')).toBeOnTheScreen();
  });

  it('notifie le changement d’onglet', () => {
    const onChange = jest.fn();
    render(wrap(<TabBar items={items} activeKey="home" onChange={onChange} />));
    fireEvent.press(screen.getByLabelText('Séances'));
    expect(onChange).toHaveBeenCalledWith('sessions');
  });

  it('marque l’onglet actif comme sélectionné', () => {
    render(wrap(<TabBar items={items} activeKey="sessions" onChange={() => {}} />));
    expect(screen.getByLabelText('Séances')).toBeSelected();
  });
});
