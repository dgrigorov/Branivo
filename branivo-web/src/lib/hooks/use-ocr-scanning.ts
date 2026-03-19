import { useCallback, useRef, useState } from 'react';

export type OcrJobStatus = 'processing' | 'completed' | 'failed';
export type OcrProvider = 'google_vision' | 'aws_textract';

export interface OcrField {
  value: string | null;
  confidence: number;
  auto_filled: boolean;
}

export interface OcrScanResult {
  jobId: string;
  status: OcrJobStatus;
  provider?: OcrProvider;
  fields?: Record<string, OcrField>;
  avgConfidence?: number;
}

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_DURATION_MS = 35_000;

export function useOcrScanning() {
  const [status, setStatus] = useState<OcrJobStatus | null>(null);
  const [result, setResult] = useState<OcrScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(
    async (jobId: string): Promise<void> => {
      pollStartRef.current = Date.now();

      pollIntervalRef.current = setInterval(async () => {
        if (Date.now() - pollStartRef.current > MAX_POLL_DURATION_MS) {
          stopPolling();
          setStatus('failed');
          setError('OCR обработката отне твърде дълго. Моля, опитайте отново.');
          setIsLoading(false);
          return;
        }

        try {
          const res = await fetch(`/api/v1/ocr/status/${jobId}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          const data: OcrScanResult = await res.json();

          if (data.status === 'completed') {
            stopPolling();
            setStatus('completed');
            setResult(data);
            setIsLoading(false);
          } else if (data.status === 'failed') {
            stopPolling();
            setStatus('failed');
            setError('OCR анализът е неуспешен. Моля, попълнете ръчно.');
            setIsLoading(false);
          }
        } catch {
          // transient network error — continue polling
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling],
  );

  const scan = useCallback(
    async (images: File[], sessionToken: string): Promise<OcrScanResult | null> => {
      setIsLoading(true);
      setError(null);
      setStatus(null);
      setResult(null);

      const formData = new FormData();
      images.forEach((img) => formData.append('images', img));

      try {
        const res = await fetch('/api/v1/ocr/scan', {
          method: 'POST',
          headers: { 'X-Session-Token': sessionToken },
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? `HTTP ${res.status}`);
        }

        const data: OcrScanResult = await res.json();

        if (data.status === 'completed') {
          setStatus('completed');
          setResult(data);
          setIsLoading(false);
          return data;
        }

        // processing — start polling
        setStatus('processing');
        void pollStatus(data.jobId);
        return null;
      } catch (err) {
        setStatus('failed');
        setError(err instanceof Error ? err.message : 'Грешка при OCR сканиране.');
        setIsLoading(false);
        return null;
      }
    },
    [pollStatus],
  );

  return { scan, status, result, error, isLoading, stopPolling };
}
