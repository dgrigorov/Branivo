'use client';

import { useEffect, useRef } from 'react';
import { Activity, ExternalLink, RefreshCw, Server } from 'lucide-react';

const QUEUES = [
  { name: 'pdf-generation', label: 'PDF генериране', desc: 'Асинхронно генериране на полици и документи' },
  { name: 'notifications', label: 'Нотификации', desc: 'Push, Email и SMS нотификации' },
  { name: 'logistics', label: 'Логистика', desc: 'Speedy / Econt пратки' },
  { name: 'ocr-processing', label: 'OCR обработка', desc: 'Google Vision + AWS Textract задачи' },
  { name: 'webhook-processing', label: 'Stripe Webhooks', desc: 'Обработка на Stripe payment events' },
  { name: 'billing', label: 'Фактуриране', desc: 'Месечни фактури към брокери' },
  { name: 'data-export', label: 'Data Export', desc: 'GDPR и аналитичен експорт' },
  { name: 'vehicle-catalog-sync', label: 'Автокаталог синк', desc: 'autodata24.com скрейпване и импорт' },
];

export default function QueuesPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Bull Board is mounted at /queue-board on the API server
    if (iframeRef.current) {
      iframeRef.current.src = 'http://localhost:3000/queue-board';
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Queue Monitor</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {QUEUES.length} активни опашки · само за super_admin
              </p>
            </div>
          </div>
          <a
            href="http://localhost:3000/queue-board"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" />
            Отвори в нов таб
          </a>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Queue list */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUEUES.map((q) => (
            <div key={q.name} className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                  <Server className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{q.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-tight">{q.desc}</p>
                  <code className="mt-1 inline-block text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                    {q.name}
                  </code>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bull Board iframe */}
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <RefreshCw className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">Bull Board UI</span>
            <span className="ml-auto text-xs text-slate-400">http://localhost:3000/queue-board</span>
          </div>
          <iframe
            ref={iframeRef}
            title="Bull Board"
            className="w-full"
            style={{ height: 'calc(100vh - 320px)', minHeight: '500px', border: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}
