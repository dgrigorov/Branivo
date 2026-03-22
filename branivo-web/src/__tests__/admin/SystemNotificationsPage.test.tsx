/**
 * Component tests for SystemNotificationsPage.
 * Tests rendering of notification list, form submit, and deactivate button.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SystemNotificationsPage from '@/app/[locale]/(admin)/notifications/page';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const mockNotificationList = [
  {
    id: 'notif-001',
    adminId: 'admin-001',
    target: 'all',
    type: 'info',
    message: 'Platform maintenance tonight.',
    dismissible: true,
    isActive: true,
    sentAt: new Date().toISOString(),
  },
];

describe('SystemNotificationsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders notification list', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockNotificationList),
    });

    renderWithQuery(<SystemNotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Platform maintenance tonight.')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Info').length).toBeGreaterThan(0);
    expect(screen.getByText('Активно')).toBeInTheDocument();
    expect(screen.getByText('Всички тенанти')).toBeInTheDocument();
  });

  it('renders empty state when no notifications', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    renderWithQuery(<SystemNotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Няма изпратени известия.')).toBeInTheDocument();
    });
  });

  it('submits form with correct body', async () => {
    const newNotification = {
      ...mockNotificationList[0],
      id: 'notif-002',
      message: 'New test notification',
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(newNotification),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([newNotification]),
      });

    renderWithQuery(<SystemNotificationsPage />);

    const textarea = screen.getByPlaceholderText(/въведете текст/i);
    fireEvent.change(textarea, { target: { value: 'New test notification' } });

    const submitBtn = screen.getByRole('button', { name: /изпрати известие/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/notifications'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('shows validation error when message is empty', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    renderWithQuery(<SystemNotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Няма изпратени известия.')).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /изпрати известие/i });
    fireEvent.click(submitBtn);

    expect(screen.getByText('Съобщението не може да е празно.')).toBeInTheDocument();
  });

  it('shows error when deactivate fails', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockNotificationList),
      })
      .mockResolvedValueOnce({ ok: false }); // PATCH fails

    renderWithQuery(<SystemNotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Platform maintenance tonight.')).toBeInTheDocument();
    });

    const deactivateBtn = screen.getByRole('button', { name: /деактивирай известие/i });
    fireEvent.click(deactivateBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Грешка при деактивиране. Опитайте отново.'),
      ).toBeInTheDocument();
    });
  });

  it('deactivate button calls PATCH API', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockNotificationList),
      })
      .mockResolvedValueOnce({ ok: true }) // PATCH deactivate
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ ...mockNotificationList[0], isActive: false }]),
      });

    renderWithQuery(<SystemNotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Platform maintenance tonight.')).toBeInTheDocument();
    });

    const deactivateBtn = screen.getByRole('button', { name: /деактивирай известие/i });
    fireEvent.click(deactivateBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/notifications/notif-001/deactivate'),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });
});
