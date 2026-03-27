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
    coverageStartDate: '2024-01-01',
    coverageEndDate: '2024-12-31',
  },
];

const mockDocumentUrls = {
  policyPdfUrl: 'https://s3.example.com/policy.pdf?signed=1',
  greenCardUrl: 'https://s3.example.com/green-card.pdf?signed=2',
  expiresAt: new Date(Date.now() + 900_000).toISOString(),
};

const mockShipment = {
  shipmentId: 'shipment-id-1',
  provider: 'speedy',
  trackingNumber: 'SPEEDY-ABC123',
  estimatedDeliveryDate: '2026-03-25',
  status: 'dispatched',
  createdAt: '2026-03-22T10:00:00.000Z',
};

/** Returns a 404 Response mock for shipment endpoint */
const notFoundResponse = (): Response =>
  ({ ok: false, status: 404, json: () => Promise.resolve(null) }) as Response;

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
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockPolicies }),
      } as Response)
      .mockResolvedValue(notFoundResponse()); // shipment fetches

    render(<PolicyWalletPage />);

    await waitFor(() => {
      expect(screen.getByText('TEST-001')).toBeInTheDocument();
      expect(screen.queryByText('TEST-002')).not.toBeInTheDocument();
    });
  });

  it('renders download buttons for each policy', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockPolicies }),
      } as Response)
      .mockResolvedValue(notFoundResponse());

    render(<PolicyWalletPage />);

    await waitFor(() => {
      const policyButtons = screen.getAllByText('Изтегли Полица');
      const greenCardButtons = screen.getAllByText('Изтегли Зелена карта');
      expect(policyButtons).toHaveLength(1);
      expect(greenCardButtons).toHaveLength(1);
    });

    fireEvent.click(screen.getByText('Изтекли (1)'));

    await waitFor(() => {
      expect(screen.getByText('TEST-002')).toBeInTheDocument();
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

  it('separates active and expired policies in the right tabs', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockPolicies }),
      } as Response)
      .mockResolvedValue(notFoundResponse());

    render(<PolicyWalletPage />);

    await waitFor(() => {
      expect(screen.getByText('TEST-001')).toBeInTheDocument();
      expect(screen.queryByText('TEST-002')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Изтекли (1)'));

    await waitFor(() => {
      expect(screen.getByText('TEST-002')).toBeInTheDocument();
      expect(screen.queryByText('TEST-001')).not.toBeInTheDocument();
    });
  });

  it('opens policy PDF in new tab when download button is clicked', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [mockPolicies[0]] }),
      } as Response)
      .mockResolvedValueOnce(notFoundResponse()) // shipment fetch
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

  it('renders shipment tracking info when shipment exists', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [mockPolicies[0]] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockShipment),
      } as Response);

    render(<PolicyWalletPage />);

    await waitFor(() => {
      expect(screen.getByTestId('shipment-tracking')).toBeInTheDocument();
      expect(screen.getByText('SPEEDY-ABC123')).toBeInTheDocument();
      expect(screen.getByText('2026-03-25')).toBeInTheDocument();
    });
  });

  it('shows manual handling message when provider is manual', async () => {
    const manualShipment = { ...mockShipment, provider: 'manual', trackingNumber: null };

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [mockPolicies[0]] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(manualShipment),
      } as Response);

    render(<PolicyWalletPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Доставката ще бъде обработена ръчно от брокера.'),
      ).toBeInTheDocument();
    });
  });
});
