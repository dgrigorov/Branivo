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
  return 'text-white/60';
}

function StatusBadge({ status }: { status: SyncRun['status'] | undefined }) {
  const styleMap: Record<string, string> = {
    done: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    failed: 'bg-red-500/15 text-red-400 border-red-500/30',
    scraping: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    importing: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    pending: 'bg-white/8 text-white/50 border-white/15',
  };
  const labels: Record<string, string> = {
    done: 'Готово', failed: 'Грешка', scraping: 'Скрейпване…', importing: 'Импорт…', pending: 'Чака',
  };
  if (!status) return null;
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${styleMap[status] ?? 'bg-white/8 text-white/40 border-white/10'}`}>
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
    <div className="border border-white/8 rounded-2xl overflow-hidden bg-white/2">
      {/* Toggle header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/3 transition-colors"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <Terminal className="h-4 w-4 text-white/40 flex-shrink-0" />
          <span className="text-sm font-medium text-white/70">Синхронизация — autodata24</span>
          {syncStatus && <StatusBadge status={syncStatus.status} />}
          {syncStatus?.totalImported != null && (
            <span className="text-xs text-white/30">
              {syncStatus.totalImported.toLocaleString()} импортирани
            </span>
          )}
          {lastSync && <span className="text-xs text-white/25">{lastSync}</span>}
        </div>
        <ChevronDown className={`h-4 w-4 text-white/30 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-white/8">
          {/* Action buttons */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
            <button
              onClick={handleStartSync}
              disabled={syncPending || isRunning}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-semibold hover:bg-amber-400 disabled:opacity-40 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncPending ? 'animate-spin' : ''}`} />
              Пълна синхронизация
            </button>
            <button
              onClick={handleImport}
              disabled={importPending || isRunning}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/8 border border-white/15 text-white/70 text-xs font-medium hover:bg-white/12 disabled:opacity-40 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Само импорт (JSON → DB)
            </button>
            {visibleLogs.length > 0 && (
              <button onClick={() => setLogs([])} className="ml-auto text-white/25 hover:text-white/50 transition-colors">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Terminal log */}
          {visibleLogs.length > 0 && (
            <div className="h-56 overflow-y-auto bg-black/50 p-4 font-mono text-[11px] space-y-0.5">
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
