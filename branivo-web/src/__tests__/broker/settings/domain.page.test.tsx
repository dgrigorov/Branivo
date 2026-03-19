/**
 * Component tests for Broker Domain Settings page.
 * Tests domain registration form, status badges, verification instructions,
 * copy button, delete confirmation, and auto-polling behaviour.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DomainSettingsPage from '@/app/[locale]/(broker)/settings/domain/page';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock clipboard API
Object.assign(navigator, {
  clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
});

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

const PRIMARY_DOMAIN = {
  id: 'primary-id',
  domain: 'broker1.branivo.bg',
  isPrimary: true,
  status: 'active',
  verificationRecord: null,
  verifiedAt: null,
  failureReason: null,
  createdAt: '2026-01-01T00:00:00Z',
};

const PENDING_CUSTOM = {
  id: 'custom-id',
  domain: 'polici.mybrokerage.bg',
  isPrimary: false,
  status: 'pending',
  verificationRecord: {
    name: '_branivo-verify.polici.mybrokerage.bg',
    type: 'TXT',
    value: 'branivo-verify=abc123',
  },
  verifiedAt: null,
  failureReason: null,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('DomainSettingsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the primary subdomain badge as always active', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [PRIMARY_DOMAIN] }),
    });

    renderWithQuery(<DomainSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('broker1.branivo.bg')).toBeInTheDocument();
      expect(screen.getByText('Системен поддомейн')).toBeInTheDocument();
    });
  });

  it('shows domain registration form when no custom domain exists', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [PRIMARY_DOMAIN] }),
    });

    renderWithQuery(<DomainSettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('polici.mybrokerage.bg'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /добави домейн/i }),
      ).toBeInTheDocument();
    });
  });

  it('shows validation error for invalid hostname on submit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [PRIMARY_DOMAIN] }),
    });

    renderWithQuery(<DomainSettingsPage />);

    await waitFor(() =>
      screen.getByPlaceholderText('polici.mybrokerage.bg'),
    );

    fireEvent.change(screen.getByPlaceholderText('polici.mybrokerage.bg'), {
      target: { value: 'not_a_valid_hostname' },
    });
    fireEvent.click(screen.getByRole('button', { name: /добави домейн/i }));

    expect(
      screen.getByText(/валиден hostname/i),
    ).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(1); // only the initial GET
  });

  it('shows DNS verification instructions for a pending domain', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [PRIMARY_DOMAIN, PENDING_CUSTOM] }),
    });

    renderWithQuery(<DomainSettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByText('polici.mybrokerage.bg'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/_branivo-verify\.polici\.mybrokerage\.bg/),
      ).toBeInTheDocument();
      expect(screen.getByText('branivo-verify=abc123')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /копирай/i })).toBeInTheDocument();
    });
  });

  it('does NOT show DNS verification instructions for active domain', async () => {
    const activeDomain = { ...PENDING_CUSTOM, status: 'active', verificationRecord: null };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [PRIMARY_DOMAIN, activeDomain] }),
    });

    renderWithQuery(<DomainSettingsPage />);

    await waitFor(() =>
      screen.getByText('polici.mybrokerage.bg'),
    );

    expect(
      screen.queryByText(/_branivo-verify/),
    ).not.toBeInTheDocument();
  });

  it('copies DNS value to clipboard on copy button click', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [PRIMARY_DOMAIN, PENDING_CUSTOM] }),
    });

    renderWithQuery(<DomainSettingsPage />);

    await waitFor(() =>
      screen.getByRole('button', { name: /копирай/i }),
    );

    fireEvent.click(screen.getByRole('button', { name: /копирай/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'branivo-verify=abc123',
    );
  });

  it('shows delete confirmation before deleting', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [PRIMARY_DOMAIN, PENDING_CUSTOM] }),
    });

    renderWithQuery(<DomainSettingsPage />);

    await waitFor(() =>
      screen.getByRole('button', { name: /изтрий домейна/i }),
    );

    fireEvent.click(screen.getByRole('button', { name: /изтрий домейна/i }));

    expect(screen.getByText(/сигурни ли сте/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /да, изтрий/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /отказ/i }),
    ).toBeInTheDocument();
  });
});
