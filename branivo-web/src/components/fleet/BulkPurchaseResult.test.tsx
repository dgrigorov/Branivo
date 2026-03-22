import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkPurchaseResult } from './BulkPurchaseResult';
import type { BulkPurchaseResultProps } from './BulkPurchaseResult';

const allSucceeded: BulkPurchaseResultProps = {
  succeeded: [
    {
      vehicleId: 'fv-1',
      quoteId: 'q-1',
      clientSecret: 'pi_secret_1',
      paymentId: 'pi_123',
    },
  ],
  failed: [],
  summary: { total: 1, succeeded: 1, failed: 0 },
};

const allFailed: BulkPurchaseResultProps = {
  succeeded: [],
  failed: [
    {
      vehicleId: 'fv-2',
      quoteId: 'q-2',
      error: 'Quote is not available for purchase',
    },
  ],
  summary: { total: 1, succeeded: 0, failed: 1 },
};

const partialSuccess: BulkPurchaseResultProps = {
  succeeded: [
    {
      vehicleId: 'fv-1',
      quoteId: 'q-1',
      clientSecret: 'pi_secret_1',
      paymentId: 'pi_123',
    },
  ],
  failed: [
    {
      vehicleId: 'fv-2',
      quoteId: 'q-2',
      error: 'Stripe unavailable',
    },
  ],
  summary: { total: 2, succeeded: 1, failed: 1 },
};

describe('BulkPurchaseResult', () => {
  it('shows success heading when all purchases succeeded', () => {
    render(<BulkPurchaseResult {...allSucceeded} />);
    expect(
      screen.getByText('✅ Всички полици са закупени'),
    ).toBeInTheDocument();
    expect(screen.getByText('Успешни: 1 / 1')).toBeInTheDocument();
  });

  it('shows failed heading when all purchases failed', () => {
    render(<BulkPurchaseResult {...allFailed} />);
    expect(
      screen.getByText('❌ Закупуването е неуспешно'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Неуспешни: 1/)).toBeInTheDocument();
  });

  it('shows partial heading when some purchases failed', () => {
    render(<BulkPurchaseResult {...partialSuccess} />);
    expect(
      screen.getByText('⚠️ Частично успешно закупуване'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Успешни: 1 \/ 2/)).toBeInTheDocument();
  });

  it('lists failed items with error message', () => {
    render(<BulkPurchaseResult {...allFailed} />);
    expect(
      screen.getByText(/Quote is not available for purchase/),
    ).toBeInTheDocument();
  });

  it('lists succeeded items with payment id', () => {
    render(<BulkPurchaseResult {...allSucceeded} />);
    expect(screen.getByText(/pi_123/)).toBeInTheDocument();
  });

  it('has role=status for accessibility', () => {
    render(<BulkPurchaseResult {...allSucceeded} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows retry button when onRetry is provided and there are failed items', () => {
    const onRetry = jest.fn();
    render(<BulkPurchaseResult {...allFailed} onRetry={onRetry} />);
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledWith(allFailed.failed);
  });

  it('does not show retry button when onRetry is not provided', () => {
    render(<BulkPurchaseResult {...allFailed} />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('does not show retry button when all purchases succeeded', () => {
    const onRetry = jest.fn();
    render(<BulkPurchaseResult {...allSucceeded} onRetry={onRetry} />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });
});
