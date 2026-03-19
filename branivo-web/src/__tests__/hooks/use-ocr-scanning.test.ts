import { renderHook, act, waitFor } from '@testing-library/react';
import { useOcrScanning, OcrScanResult } from '@/lib/hooks/use-ocr-scanning';

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.useFakeTimers();

const SESSION_TOKEN = 'anon-session-test';
const JOB_ID = 'ocr-job-abc-123';

const mockImages = [
  new File(['img1'], 'part1.jpg', { type: 'image/jpeg' }),
  new File(['img2'], 'part2.jpg', { type: 'image/jpeg' }),
];

describe('useOcrScanning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.runAllTimers();
  });

  it('returns completed status on successful vision scan', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jobId: JOB_ID,
        status: 'completed',
        provider: 'google_vision',
        fields: {
          license_plate: { value: 'СА1234АА', confidence: 0.95, auto_filled: true },
        },
        avgConfidence: 0.95,
      }),
    });

    const { result } = renderHook(() => useOcrScanning());

    let scanResult: OcrScanResult | null | undefined;
    await act(async () => {
      scanResult = await result.current.scan(mockImages, SESSION_TOKEN);
    });

    expect(result.current.status).toBe('completed');
    expect(scanResult).not.toBeNull();
    expect((scanResult as OcrScanResult).jobId).toBe(JOB_ID);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/ocr/scan',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Session-Token': SESSION_TOKEN }),
      }),
    );
  });

  it('starts polling when status is processing (textract fallback)', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobId: JOB_ID, status: 'processing' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobId: JOB_ID, status: 'processing' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobId: JOB_ID,
          status: 'completed',
          provider: 'aws_textract',
          fields: {},
        }),
      });

    const { result } = renderHook(() => useOcrScanning());

    act(() => {
      void result.current.scan(mockImages, SESSION_TOKEN);
    });

    await waitFor(() => expect(result.current.status).toBe('processing'));

    // Advance timers to trigger polling
    await act(async () => {
      jest.advanceTimersByTime(6000);
    });

    await waitFor(() => expect(result.current.status).toBe('completed'));
  });

  it('sets failed status on polling timeout (35 seconds)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jobId: JOB_ID, status: 'processing' }),
    });

    const { result } = renderHook(() => useOcrScanning());

    act(() => {
      void result.current.scan(mockImages, SESSION_TOKEN);
    });

    await waitFor(() => expect(result.current.status).toBe('processing'));

    await act(async () => {
      jest.advanceTimersByTime(36000);
    });

    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.error).toContain('дълго');
  });

  it('sets failed status when scan API returns an error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Internal Server Error' }),
    });

    const { result } = renderHook(() => useOcrScanning());

    await act(async () => {
      await result.current.scan(mockImages, SESSION_TOKEN);
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBeTruthy();
  });
});
