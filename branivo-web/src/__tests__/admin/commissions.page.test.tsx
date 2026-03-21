/**
 * Component tests for Admin Commissions page (Commission Matrix).
 * Tests table rendering, inline edit flow, empty state, and error state.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CommissionsPage from '@/app/[locale]/(admin)/commissions/page';

const INSURER_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const mockEntries = [
  {
    insurerId: INSURER_UUID,
    insurerName: 'Allianz Bulgaria',
    productType: 'GO',
    ratePct: 0.05,
    updatedAt: '2026-01-15T10:00:00.000Z',
  },
  {
    insurerId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    insurerName: 'Generali',
    productType: 'KASKO',
    ratePct: 0.045,
    updatedAt: '2026-01-16T12:00:00.000Z',
  },
];

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CommissionsPage — table rendering', () => {
  it('renders commission entries after loading', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockEntries, meta: { timestamp: '' } }),
    }) as jest.Mock;

    renderWithQuery(<CommissionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Allianz Bulgaria')).toBeInTheDocument();
    });

    expect(screen.getByText('Generali')).toBeInTheDocument();
    expect(screen.getByText('5.00%')).toBeInTheDocument();
    expect(screen.getByText('4.50%')).toBeInTheDocument();
    expect(screen.getByText('GO')).toBeInTheDocument();
    expect(screen.getByText('KASKO')).toBeInTheDocument();
  });

  it('renders column headers correctly', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockEntries, meta: { timestamp: '' } }),
    }) as jest.Mock;

    renderWithQuery(<CommissionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Allianz Bulgaria')).toBeInTheDocument();
    });

    expect(screen.getByText('Застраховател')).toBeInTheDocument();
    expect(screen.getByText('Продукт')).toBeInTheDocument();
    expect(screen.getByText('Ставка %')).toBeInTheDocument();
    expect(screen.getByText('Последна промяна')).toBeInTheDocument();
    expect(screen.getByText('Действие')).toBeInTheDocument();
  });
});

describe('CommissionsPage — empty state', () => {
  it('shows empty state message when no entries exist', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], meta: { timestamp: '' } }),
    }) as jest.Mock;

    renderWithQuery(<CommissionsPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Няма конфигурирани комисионни ставки'),
      ).toBeInTheDocument();
    });
  });
});

describe('CommissionsPage — error state', () => {
  it('shows error message when fetch fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    }) as jest.Mock;

    renderWithQuery(<CommissionsPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Грешка при зареждане на комисионната матрица'),
      ).toBeInTheDocument();
    });
  });
});

describe('CommissionsPage — inline edit flow', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (String(url).includes('/commissions') && !String(url).includes(INSURER_UUID)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: mockEntries, meta: { timestamp: '' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { ...mockEntries[0], ratePct: 0.06 },
            meta: { timestamp: '' },
          }),
      });
    }) as jest.Mock;
  });

  it('enters edit mode when clicking "Редактирай"', async () => {
    renderWithQuery(<CommissionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Allianz Bulgaria')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole('button', { name: 'Редактирай' });
    fireEvent.click(editButtons[0]);

    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Запази' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отказ' })).toBeInTheDocument();
  });

  it('pre-fills input with current rate percentage', async () => {
    renderWithQuery(<CommissionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Allianz Bulgaria')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole('button', { name: 'Редактирай' });
    fireEvent.click(editButtons[0]);

    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('5.00');
  });

  it('cancels edit mode when clicking "Отказ"', async () => {
    renderWithQuery(<CommissionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Allianz Bulgaria')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole('button', { name: 'Редактирай' });
    fireEvent.click(editButtons[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Отказ' }));

    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByText('5.00%')).toBeInTheDocument();
  });

  it('calls PUT API with correct ratePct on save', async () => {
    renderWithQuery(<CommissionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Allianz Bulgaria')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole('button', { name: 'Редактирай' });
    fireEvent.click(editButtons[0]);

    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '6' } });

    fireEvent.click(screen.getByRole('button', { name: 'Запази' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/commissions/${INSURER_UUID}/GO`),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ productType: 'GO', ratePct: 0.06 }),
        }),
      );
    });
  });

  it('does not call PUT for invalid ratePct (>100)', async () => {
    renderWithQuery(<CommissionsPage />);

    await waitFor(() => {
      expect(screen.getByText('Allianz Bulgaria')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole('button', { name: 'Редактирай' });
    fireEvent.click(editButtons[0]);

    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '150' } });

    fireEvent.click(screen.getByRole('button', { name: 'Запази' }));

    expect(global.fetch).toHaveBeenCalledTimes(1); // only the initial GET
  });
});
