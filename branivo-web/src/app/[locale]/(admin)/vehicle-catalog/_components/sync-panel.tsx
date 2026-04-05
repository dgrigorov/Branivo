'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal, RefreshCw, Download, X, ChevronDown } from 'lucide-react';
import { type SyncRun, type SyncProgressEvent } from './types';

interface Props {
  syncStatus: SyncRun | null | undefined;
  onStartSync: () => void;
  onImportOnly: () => void;
  syncPending: boolean;
  importPending: boolean;
  syncRunId: string | null;
}

function logColor(line: string): string {
  if (line.startsWith('✅') || line.startsWith('✓')) return 'text-emerald-400';
  if (line.startsWith('❌')) return 'text-red-400';
  if (line.startsWith('▶')) return 'text-amber-400';
  if (line.includes('[brand]') || line.includes('[model]')) return 'text-blue-400';
  if (line.includes('[stderr]')) return 'text-red-400/70';
  return 'text-gray-400';
}

function StatusBadge({ status }: { status: SyncRun['status'] | undefined }) {
  const styleMap: Record<string, string> = {
    done:      'bg-emerald-50 text-emerald-700 border-emerald-200',
    failed:    'bg-red-50 text-red-700 border-red-200',
    scraping:  'bg-amber-50 text-amber-700 border-amber-200',
    importing: 'bg-blue-50 text-blue-700 border-blue-200',
    pending:   'bg-gray-100 text-gray-500 border-gray-200',
  };
  const labels: Record<string, string> = {
    done: 'Готово', failed: 'Грешка', scraping: 'Скрейпване…', importing: 'Импорт…', pending: 'Чака',
  };
  if (!status) return null;
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${styleMap[status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
      {labels[status] ?? status}
    </span>
  );
}

export function SyncPanel({
  syncStatus, onStartSync, onImportOnly, syncPending, importPending, syncRunId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (!syncRunId || !open) return;
    setLogs([]);
    const es = new EventSource(`/api/v1/admin/vehicle-catalog/sync/progress?runId=${syncRunId}`);
    es.onmessage = (e: MessageEvent<string>) => {
      const ev = JSON.parse(e.data) as SyncProgressEvent;
      if (ev.type === 'log' && ev.line) setLogs((p) => [...p, ev.line as string]);
      if (ev.type === 'done') es.close();
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [syncRunId, open]);

  const handleStartSync = () => { setLogs([]); onStartSync(); setOpen(true); };
  const handleImport = () => { setLogs([]); onImportOnly(); setOpen(true); };

  const isRunning = ['pending', 'scraping', 'importing'].includes(syncStatus?.status ?? '');
  const lastSync = syncStatus?.completedAt
    ? new Date(syncStatus.completedAt).toLocaleDateString('bg-BG', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : null;

  const visibleLogs = logs.length > 0 ? logs : (syncStatus?.logLines ?? []);

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
      {/* Toggle header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <Terminal className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-700">Синхронизация — autodata24</span>
          {syncStatus && <StatusBadge status={syncStatus.status} />}
          {syncStatus?.totalImported != null && (
            <span className="text-xs text-gray-400">
              {syncStatus.totalImported.toLocaleString()} импортирани
            </span>
          )}
          {lastSync && <span className="text-xs text-gray-300">{lastSync}</span>}
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {/* Action buttons */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            <button
              onClick={handleStartSync}
              disabled={syncPending || isRunning}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-400 text-white text-xs font-semibold hover:bg-amber-500 disabled:opacity-40 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncPending ? 'animate-spin' : ''}`} />
              Пълна синхронизация
            </button>
            <button
              onClick={handleImport}
              disabled={importPending || isRunning}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              Само импорт (JSON → DB)
            </button>
            {visibleLogs.length > 0 && (
              <button onClick={() => setLogs([])} className="ml-auto text-gray-300 hover:text-gray-500 transition-colors">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Terminal log (intentionally dark for readability) */}
          {visibleLogs.length > 0 && (
            <div className="h-56 overflow-y-auto bg-gray-900 p-4 font-mono text-[11px] space-y-0.5 rounded-b-2xl">
              {visibleLogs.map((line, i) => (
                <div key={i} className={logColor(line)}>{line}</div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
