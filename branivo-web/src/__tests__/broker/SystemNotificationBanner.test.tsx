/**
 * Component tests for SystemNotificationBanner.
 * Tests rendering of info/critical notifications, dismiss button visibility,
 * and dismiss API call with banner hide behavior.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SystemNotificationBanner from '@/app/[locale]/(broker)/components/system-notification-banner';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('SystemNotificationBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders info notification', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'notif-001',
            type: 'info',
            message: 'Platform update available.',
            dismissible: true,
          },
        ]),
    });

    renderWithQuery(<SystemNotificationBanner />);

    await waitFor(() => {
      expect(screen.getByText('Platform update available.')).toBeInTheDocument();
    });
  });

  it('renders critical notification without dismiss button', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'notif-002',
            type: 'critical',
            message: 'Critical system outage.',
            dismissible: false,
          },
        ]),
    });

    renderWithQuery(<SystemNotificationBanner />);

    await waitFor(() => {
      expect(screen.getByText('Critical system outage.')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull();
  });

  it('dismiss button calls API and hides banner', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'notif-003',
              type: 'info',
              message: 'Dismissible info.',
              dismissible: true,
            },
          ]),
      })
      .mockResolvedValueOnce({ ok: true }) // dismiss POST
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]), // refetch after dismiss
      });

    renderWithQuery(<SystemNotificationBanner />);

    await waitFor(() => {
      expect(screen.getByText('Dismissible info.')).toBeInTheDocument();
    });

    const dismissButton = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(dismissButton);

    await waitFor(() => {
      expect(screen.queryByText('Dismissible info.')).not.toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/admin/notifications/notif-003/dismiss'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('renders nothing when no active notifications', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const { container } = renderWithQuery(<SystemNotificationBanner />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('restores notification when dismiss API fails', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'notif-004',
              type: 'info',
              message: 'Rollback test.',
              dismissible: true,
            },
          ]),
      })
      .mockResolvedValueOnce({ ok: false }); // dismiss POST fails

    renderWithQuery(<SystemNotificationBanner />);

    await waitFor(() => {
      expect(screen.getByText('Rollback test.')).toBeInTheDocument();
    });

    const dismissButton = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(dismissButton);

    // After failed dismiss, notification should reappear
    await waitFor(() => {
      expect(screen.getByText('Rollback test.')).toBeInTheDocument();
    });
  });
});
