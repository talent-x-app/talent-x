import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';
import { Share } from 'react-native';

const mockGetGroup = jest.fn();
const mockListGroupMembers = jest.fn();
const mockManageInviteCode = jest.fn();
const mockRemoveGroupMember = jest.fn();
const mockUpdateGroup = jest.fn();
const mockDeleteGroup = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getGroup: (...a: unknown[]) => mockGetGroup(...a),
  listGroupMembers: (...a: unknown[]) => mockListGroupMembers(...a),
  manageInviteCode: (...a: unknown[]) => mockManageInviteCode(...a),
  removeGroupMember: (...a: unknown[]) => mockRemoveGroupMember(...a),
  updateGroup: (...a: unknown[]) => mockUpdateGroup(...a),
  deleteGroup: (...a: unknown[]) => mockDeleteGroup(...a),
  InviteCodeActionAction: { regenerate: 'regenerate', revoke: 'revoke' },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow, dismiss: jest.fn() }),
  toUserMessage: () => ({ title: 'Erreur', description: undefined }),
}));

import { CoachGroupDetailScreen } from './CoachGroupDetailScreen';

function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

const GROUP = {
  id: 'g-1',
  coachId: 'me',
  name: 'Sprint élite',
  description: 'Bloc vitesse',
  inviteCode: 'ABCD2345',
  memberCount: 1,
};
const MEMBERS = [
  {
    athleteId: 'a-1',
    groupId: 'g-1',
    athlete: { firstName: 'Moussa', lastName: 'Traoré', sport: '100m' },
  },
];

beforeEach(() => jest.clearAllMocks());

describe('CoachGroupDetailScreen (TLX-87)', () => {
  function mountOk() {
    mockGetGroup.mockResolvedValue({ status: 200, data: GROUP });
    mockListGroupMembers.mockResolvedValue({ status: 200, data: { data: MEMBERS } });
    render(<CoachGroupDetailScreen groupId="g-1" />, { wrapper: Wrapper });
  }

  it('rend le groupe, le code d’invitation et les membres', async () => {
    mountOk();
    await waitFor(() => expect(screen.getByTestId('group-detail-name')).toBeOnTheScreen());
    expect(screen.getByText('Sprint élite')).toBeOnTheScreen();
    expect(screen.getByTestId('group-invite-code')).toHaveTextContent('ABCD2345');
    await waitFor(() => expect(screen.getByTestId('group-member-a-1')).toBeOnTheScreen());
    expect(screen.getByText('Moussa Traoré')).toBeOnTheScreen();
  });

  it('édite le nom du groupe', async () => {
    mountOk();
    mockUpdateGroup.mockResolvedValue({ status: 200, data: { ...GROUP, name: 'Sprint A' } });

    await waitFor(() => expect(screen.getByTestId('group-detail-edit')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('group-detail-edit'));
    fireEvent.changeText(screen.getByTestId('group-edit-name'), 'Sprint A');
    fireEvent.press(screen.getByTestId('group-edit-save'));

    await waitFor(() =>
      expect(mockUpdateGroup).toHaveBeenCalledWith('g-1', {
        name: 'Sprint A',
        description: 'Bloc vitesse',
      }),
    );
  });

  it('régénère le code d’invitation', async () => {
    mountOk();
    mockManageInviteCode.mockResolvedValue({ status: 200, data: { inviteCode: 'WXYZ9876' } });

    await waitFor(() => expect(screen.getByTestId('group-invite-regenerate')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('group-invite-regenerate'));
    await waitFor(() =>
      expect(mockManageInviteCode).toHaveBeenCalledWith('g-1', { action: 'regenerate' }),
    );
  });

  it('partage le code d’invitation', async () => {
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    mountOk();

    await waitFor(() => expect(screen.getByTestId('group-invite-share')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('group-invite-share'));
    await waitFor(() =>
      expect(shareSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('ABCD2345') }),
      ),
    );
    shareSpy.mockRestore();
  });

  it('retire un membre', async () => {
    mountOk();
    mockRemoveGroupMember.mockResolvedValue({ status: 204 });

    await waitFor(() => expect(screen.getByTestId('group-member-remove-a-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('group-member-remove-a-1'));
    await waitFor(() => expect(mockRemoveGroupMember).toHaveBeenCalledWith('g-1', 'a-1'));
  });

  it('supprime le groupe puis revient en arrière', async () => {
    mountOk();
    mockDeleteGroup.mockResolvedValue({ status: 204 });

    await waitFor(() => expect(screen.getByTestId('group-delete')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('group-delete'));
    await waitFor(() => expect(mockDeleteGroup).toHaveBeenCalledWith('g-1'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('état erreur + réessai', async () => {
    mockGetGroup.mockResolvedValueOnce({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    mockListGroupMembers.mockResolvedValue({ status: 200, data: { data: [] } });
    render(<CoachGroupDetailScreen groupId="g-1" />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('group-detail-error')).toBeOnTheScreen());

    mockGetGroup.mockResolvedValueOnce({ status: 200, data: GROUP });
    fireEvent.press(screen.getByTestId('group-detail-retry'));
    await waitFor(() => expect(screen.getByTestId('group-detail-name')).toBeOnTheScreen());
  });
});
