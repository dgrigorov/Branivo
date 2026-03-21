import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PolicyWalletPage from '@/app/[locale]/(client)/wallet/page';

const mockPolicies = [
  {
    id: 'policy-id-1',
    policyNumber: 'TEST-001',
    status: 'active',
    premiumAmount: 500,
    currency: 'BGN',
    coverageStartDate: '2026-01-01',
    coverageEndDate: '2026-12-31',
  },
  {
    id: 'policy-id-2',
    policyNumber: 'TEST-002',
    status: 'active',
    premiumAmount: 300,
    currency: 'BGN',
  },
];

const mockDocumentUrls = {
  policyPdfUrl: 'https://s3.example.com/policy.pdf?signed=1',
  greenCardUrl: 'https://s3.example.com/green-card.pdf?signed=2',
  expiresAt: new Date(Date.now() + 900_000).toISOString(),
};

describe('PolicyWalletPage', () => {
  const localStorageMock: Record<string, string> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock['client_token'] = 'test-jwt-token';
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => localStorageMock[key] ?? null,
        setItem: (key: string, value: string) => {
          localStorageMock[key] = value;
        },
      },
      writable: true,
    });
    window.open = jest.fn();
  });

  it('renders policy list after loading', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockPolicies }),
    } as Response);

    render(<PolicyWalletPage />);

    await waitFor(() => {
      expect(screen.getByText('TEST-001')).toBeInTheDocument();
      expect(screen.getByText('TEST-002')).toBeInTheDocument();
    });
  });

  it('renders download buttons for each policy', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockPolicies }),
    } as Response);

    render(<PolicyWalletPage />);

    await waitFor(() => {
      const policyButtons = screen.getAllByText('Изтегли Полица');
      const greenCardButtons = screen.getAllByText('Изтегли Зелена карта');
      expect(policyButtons).toHaveLength(2);
      expect(greenCardButtons).toHaveLength(2);
    });
  });

  it('shows empty state when no policies', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    } as Response);

    render(<PolicyWalletPage />);

    await waitFor(() => {
      expect(screen.getByText('Нямате активни полици.')).toBeInTheDocument();
    });
  });

  it('opens policy PDF in new tab when download button is clicked', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [mockPolicies[0]] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockDocumentUrls),
      } as Response);

    render(<PolicyWalletPage />);

    await waitFor(() => {
      expect(screen.getByText('TEST-001')).toBeInTheDocument();
    });

    const downloadButton = screen.getByText('Изтегли Полица');
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith(
        mockDocumentUrls.policyPdfUrl,
        '_blank',
      );
    });
  });

  it('shows error message when API call fails', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
    } as Response);

    render(<PolicyWalletPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
