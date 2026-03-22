/**
 * Component tests for Admin Insurer API Monitor page.
 * Tests dashboard rendering, disable/enable actions, and confirm modal.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminInsurersPage from '@/app/[locale]/(admin)/insurers/page';

const mockInsurerStatus = [
  {
    insurerId: 'ins-uuid-1',
    insurerName: 'Allianz Bulgaria',
    insurerCode: 'allianz',
    circuitState: 'closed' as const,
    errorRate5min: 0.5,
    avgLatencyMs: 120,
    totalCalls5min: 10,
    isManuallyDisabled: false,
    disabledReason: null,
  },
  {
    insurerId: 'ins-uuid-2',
    insurerName: 'Generali Bulgaria',
    insurerCode: 'generali',
    circuitState: 'open' as const,
    errorRate5min: 5.2,
    avgLatencyMs: 2000,
    totalCalls5min: 25,
    isManuallyDisabled: true,
    disabledReason: 'API деградация',
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

  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (String(url).includes('/api/v1/admin/insurers/monitor')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockInsurerStatus),
      });
    }
    if (String(url).includes('/disable')) {
      return Promise.resolve({ ok: true, status: 204 });
    }
    if (String(url).includes('/enable')) {
      return Promise.resolve({ ok: true, status: 204 });
    }
    return Promise.reject(new Error(`Unmocked URL: ${String(url)}`));
  });
});

describe('AdminInsurersPage', () => {
  it('показва loading state', () => {
    renderWithQuery(<AdminInsurersPage />);
    expect(screen.getByText('Зареждане...')).toBeInTheDocument();
  });

  it('показва insurers в таблица след зареждане', async () => {
    renderWithQuery(<AdminInsurersPage />);
    await waitFor(() =>
      expect(screen.getByText('Allianz Bulgaria')).toBeInTheDocument(),
    );
    expect(screen.getByText('Generali Bulgaria')).toBeInTheDocument();
    expect(screen.getByText('allianz')).toBeInTheDocument();
    expect(screen.getByText('generali')).toBeInTheDocument();
  });

  it('показва circuit state badges правилно', async () => {
    renderWithQuery(<AdminInsurersPage />);
    await waitFor(() =>
      expect(screen.getByText('Allianz Bulgaria')).toBeInTheDocument(),
    );
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('оцветява error rate > 1% в червено', async () => {
    renderWithQuery(<AdminInsurersPage />);
    await waitFor(() =>
      expect(screen.getByText('5.20%')).toBeInTheDocument(),
    );
    const highErrorCell = screen.getByText('5.20%');
    expect(highErrorCell).toHaveClass('text-red-600');
  });

  it('показва Деактивирай за активни insurers', async () => {
    renderWithQuery(<AdminInsurersPage />);
    await waitFor(() =>
      expect(screen.getByText('Allianz Bulgaria')).toBeInTheDocument(),
    );
    expect(screen.getByText('Деактивирай')).toBeInTheDocument();
  });

  it('показва Активирай за деактивирани insurers', async () => {
    renderWithQuery(<AdminInsurersPage />);
    await waitFor(() =>
      expect(screen.getByText('Generali Bulgaria')).toBeInTheDocument(),
    );
    expect(screen.getByText('Активирай')).toBeInTheDocument();
  });

  it('отваря confirm modal при натискане на Деактивирай', async () => {
    renderWithQuery(<AdminInsurersPage />);
    await waitFor(() =>
      expect(screen.getByText('Деактивирай')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText('Деактивирай'));

    expect(
      screen.getByText('Деактивирай застраховател'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Сигурни ли сте/),
    ).toBeInTheDocument();
  });

  it('потвърди деактивиране изпраща POST заявка', async () => {
    renderWithQuery(<AdminInsurersPage />);
    await waitFor(() =>
      expect(screen.getByText('Деактивирай')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText('Деактивирай'));

    const reasonInput = screen.getByPlaceholderText(
      /напр. API деградация/,
    );
    fireEvent.change(reasonInput, { target: { value: 'High error rate' } });

    fireEvent.click(screen.getByText('Потвърди деактивиране'));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/disable'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('затваря modal при Отказ', async () => {
    renderWithQuery(<AdminInsurersPage />);
    await waitFor(() =>
      expect(screen.getByText('Деактивирай')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText('Деактивирай'));
    expect(
      screen.getByText('Деактивирай застраховател'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Отказ'));
    expect(
      screen.queryByText('Деактивирай застраховател'),
    ).not.toBeInTheDocument();
  });

  it('изпраща POST за активиране при Активирай', async () => {
    renderWithQuery(<AdminInsurersPage />);
    await waitFor(() =>
      expect(screen.getByText('Активирай')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText('Активирай'));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/enable'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('показва грешка при неуспешно зареждане', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Server error' }),
    });

    renderWithQuery(<AdminInsurersPage />);

    await waitFor(() =>
      expect(
        screen.getByText('Грешка при зареждане на застрахователи'),
      ).toBeInTheDocument(),
    );
  });

  it('не показва api_key_enc в изхода', async () => {
    renderWithQuery(<AdminInsurersPage />);
    await waitFor(() =>
      expect(screen.getByText('Allianz Bulgaria')).toBeInTheDocument(),
    );

    expect(screen.queryByText(/api_key_enc/)).not.toBeInTheDocument();
  });
});
