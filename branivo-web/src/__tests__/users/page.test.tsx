/**
 * Component tests for the Users Management Page.
 * Tests user list rendering, role badges, and modal interactions.
 */
import '@testing-library/jest-dom';
import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsersPage from '@/app/[locale]/(broker)/users/page';

const mockUsers = [
  {
    id: 'user-1',
    tenantId: 'tenant-uuid',
    email: 'admin@example.com',
    role: 'broker_admin' as const,
    twoFaEnabled: true,
    createdAt: '2026-01-15T10:00:00Z',
  },
  {
    id: 'user-2',
    tenantId: 'tenant-uuid',
    email: 'agent@example.com',
    role: 'broker_agent' as const,
    twoFaEnabled: false,
    createdAt: '2026-02-01T08:00:00Z',
  },
];

global.fetch = jest.fn();

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('UsersPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders user list on successful fetch', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockUsers,
    });

    renderWithQuery(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      expect(screen.getByText('agent@example.com')).toBeInTheDocument();
    });
  });

  it('displays role badges with correct labels', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockUsers,
    });

    renderWithQuery(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('Администратор')).toBeInTheDocument();
      expect(screen.getByText('Брокер агент')).toBeInTheDocument();
    });
  });

  it('shows error when fetch fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Forbidden' }),
    });

    renderWithQuery(<UsersPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/грешка при зареждане/i),
      ).toBeInTheDocument();
    });
  });

  it('opens CreateUserModal when "Добави потребител" is clicked', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockUsers,
    });

    renderWithQuery(<UsersPage />);

    await waitFor(() => screen.getByText('admin@example.com'));

    fireEvent.click(screen.getByText('+ Добави потребител'));

    expect(screen.getByText('Добавяне на потребител')).toBeInTheDocument();
  });

  it('opens ChangeRoleModal when "Смяна на роля" is clicked', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockUsers,
    });

    renderWithQuery(<UsersPage />);

    await waitFor(() => screen.getByText('admin@example.com'));

    const changeRoleButtons = screen.getAllByText('Смяна на роля');
    fireEvent.click(changeRoleButtons[0]);

    // Modal heading is an h2
    expect(screen.getByRole('heading', { name: 'Смяна на роля' })).toBeInTheDocument();
  });

  it('shows empty state when no users', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    renderWithQuery(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('Няма потребители')).toBeInTheDocument();
    });
  });
});
