import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { OcrWizard } from '@/app/[locale]/(client)/vehicles/components/ocr-wizard';

// Mock the hook
jest.mock('@/lib/hooks/use-ocr-scanning', () => ({
  useOcrScanning: jest.fn(),
}));

import { useOcrScanning } from '@/lib/hooks/use-ocr-scanning';

const mockOnComplete = jest.fn();
const mockOnManualEntry = jest.fn();

const defaultHookValue = {
  scan: jest.fn().mockResolvedValue(null),
  status: null,
  result: null,
  error: null,
  isLoading: false,
  stopPolling: jest.fn(),
};

describe('OcrWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useOcrScanning as jest.Mock).mockReturnValue(defaultHookValue);
  });

  it('renders camera guide with correct aria-label', () => {
    render(
      <OcrWizard
        sessionToken="test-session"
        onComplete={mockOnComplete}
        onManualEntry={mockOnManualEntry}
      />,
    );

    const guide = screen.getByRole('img');
    expect(guide).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Свидетелство за регистрация'),
    );
  });

  it('shows low confidence warning for fields below 0.85', () => {
    (useOcrScanning as jest.Mock).mockReturnValue({
      ...defaultHookValue,
      status: 'completed',
      result: {
        jobId: 'job-123',
        status: 'completed',
        fields: {
          license_plate: { value: 'СА1234АА', confidence: 0.5, auto_filled: false },
          vin: { value: 'WVWZZZ3BZ3E123456', confidence: 0.95, auto_filled: true },
        },
      },
    });

    render(
      <OcrWizard
        sessionToken="test-session"
        onComplete={mockOnComplete}
        onManualEntry={mockOnManualEntry}
      />,
    );

    // Low confidence field should show warning icon
    const warning = screen.getByTitle('Моля, проверете тази информация');
    expect(warning).toBeInTheDocument();
  });

  it('shows manual form on OCR failure', () => {
    (useOcrScanning as jest.Mock).mockReturnValue({
      ...defaultHookValue,
      status: 'failed',
      error: 'OCR failed',
    });

    render(
      <OcrWizard
        sessionToken="test-session"
        onComplete={mockOnComplete}
        onManualEntry={mockOnManualEntry}
      />,
    );

    expect(
      screen.getByText(/Не успяхме да разчетем документа/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Попълни ръчно/ }),
    ).toBeInTheDocument();
  });

  it('shows loading state during processing', () => {
    (useOcrScanning as jest.Mock).mockReturnValue({
      ...defaultHookValue,
      status: 'processing',
      isLoading: true,
    });

    render(
      <OcrWizard
        sessionToken="test-session"
        onComplete={mockOnComplete}
        onManualEntry={mockOnManualEntry}
      />,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/Обработваме документа/)).toBeInTheDocument();
  });

  it('calls onManualEntry when manual button is clicked', () => {
    render(
      <OcrWizard
        sessionToken="test-session"
        onComplete={mockOnComplete}
        onManualEntry={mockOnManualEntry}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Въведи ръчно/ }));
    expect(mockOnManualEntry).toHaveBeenCalledTimes(1);
  });

  it('renders without animations when prefers-reduced-motion is active', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockReturnValue({
        matches: true, // prefers-reduced-motion
        media: '(prefers-reduced-motion: reduce)',
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }),
    });

    (useOcrScanning as jest.Mock).mockReturnValue({
      ...defaultHookValue,
      status: 'processing',
      isLoading: true,
    });

    render(
      <OcrWizard
        sessionToken="test-session"
        onComplete={mockOnComplete}
        onManualEntry={mockOnManualEntry}
      />,
    );

    // No animate-spin class (reduced motion replacement)
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).not.toBeInTheDocument();
  });
});
