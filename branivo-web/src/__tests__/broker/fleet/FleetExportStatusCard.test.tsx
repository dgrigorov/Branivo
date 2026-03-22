import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FleetExportStatusCard } from '@/components/fleet/FleetExportStatusCard';
import type { FleetPdfFailedItem } from '@/components/fleet/FleetExportStatusCard';

const EXPORT_ID = 'cccccccc-0000-0000-0000-000000000003';

const defaultProps = {
  exportId: EXPORT_ID,
  totalCount: 3,
  completedCount: 0,
  failedCount: 0,
  failedPolicyIds: [] as FleetPdfFailedItem[],
  onDownload: jest.fn(),
  onRetry: jest.fn(),
};

describe('FleetExportStatusCard', () => {
  afterEach(() => jest.clearAllMocks());

  it('shows progress bar during processing status', () => {
    render(
      <FleetExportStatusCard
        {...defaultProps}
        status="processing"
        completedCount={1}
        failedCount={0}
      />,
    );

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
    // 1 out of 3 = ~33%
    expect(progressBar).toHaveAttribute('aria-valuenow', '33.33333333333333');
    expect(screen.getByText(/Генериране/)).toBeInTheDocument();
  });

  it('download button is disabled when status is processing', () => {
    render(
      <FleetExportStatusCard
        {...defaultProps}
        status="processing"
      />,
    );

    const downloadBtn = screen.queryByText(/Изтегли ZIP/);
    expect(downloadBtn).not.toBeInTheDocument();
  });

  it('download button is enabled when status is completed', () => {
    render(
      <FleetExportStatusCard
        {...defaultProps}
        status="completed"
        completedCount={3}
        isDownloading={false}
      />,
    );

    const downloadBtn = screen.getByText('Изтегли ZIP архив');
    expect(downloadBtn).toBeInTheDocument();
    expect(downloadBtn).not.toBeDisabled();
  });

  it('download button is enabled when status is partial', () => {
    render(
      <FleetExportStatusCard
        {...defaultProps}
        status="partial"
        completedCount={2}
        failedCount={1}
        failedPolicyIds={[{ policyId: 'p1', error: 'timeout' }]}
        isDownloading={false}
      />,
    );

    expect(screen.getByText('Изтегли ZIP архив')).toBeInTheDocument();
  });

  it('failed list is shown only when failedCount > 0', () => {
    const { rerender } = render(
      <FleetExportStatusCard
        {...defaultProps}
        status="completed"
        completedCount={3}
        failedCount={0}
        failedPolicyIds={[]}
      />,
    );

    expect(screen.queryByText(/Неуспешни документи/)).not.toBeInTheDocument();

    rerender(
      <FleetExportStatusCard
        {...defaultProps}
        status="partial"
        completedCount={2}
        failedCount={1}
        failedPolicyIds={[{ policyId: 'dddddddd-0000-0000-0000-000000000004', error: 'timeout' }]}
      />,
    );

    expect(screen.getByText(/Неуспешни документи \(1\)/)).toBeInTheDocument();
  });

  it('retry button is present and calls onRetry with failed policyIds', () => {
    const onRetry = jest.fn();
    const failedItems: FleetPdfFailedItem[] = [
      { policyId: 'dddddddd-0000-0000-0000-000000000004', error: 'PDF timeout' },
    ];

    render(
      <FleetExportStatusCard
        {...defaultProps}
        status="partial"
        completedCount={2}
        failedCount={1}
        failedPolicyIds={failedItems}
        onRetry={onRetry}
      />,
    );

    const retryBtn = screen.getByText('Повтори неуспешните');
    fireEvent.click(retryBtn);

    expect(onRetry).toHaveBeenCalledWith(['dddddddd-0000-0000-0000-000000000004']);
  });
});
