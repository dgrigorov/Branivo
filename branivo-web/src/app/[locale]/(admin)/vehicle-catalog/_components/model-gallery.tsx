'use client';

import { useEffect, useState } from 'react';
import { webFetch } from '@/lib/web-fetch';
import { Car, ExternalLink, X, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';

interface Props {
  modelId: string;
  makeName: string;
  modelName: string;
}

export function ModelGallery({ modelId, makeName, modelName }: Props) {
  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [mainErr, setMainErr] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    setImages([]);
    setCurrent(0);
    setMainErr(false);
    setIsLoading(true);
    const controller = new AbortController();
    void webFetch<{ images: string[]; sourceUrl?: string }>(
      `/api/v1/admin/vehicle-catalog/models/${modelId}/images` +
        `?makeSlug=${encodeURIComponent(makeName)}&modelSlug=${encodeURIComponent(modelName)}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (data.images?.length) setImages(data.images);
        if (data.sourceUrl) setSourceUrl(data.sourceUrl);
      })
      .catch(() => { /* ignore abort / network errors */ })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, [modelId, makeName, modelName]);

  const total = images.length;
  const prev = () => { setCurrent((i) => (i - 1 + total) % total); setMainErr(false); };
  const next = () => { setCurrent((i) => (i + 1) % total); setMainErr(false); };
  const select = (i: number) => { setCurrent(i); setMainErr(false); };

  // Keyboard navigation for lightbox — use functional setCurrent to avoid stale closures
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setCurrent((i) => (i + 1) % total);
        setMainErr(false);
      } else if (e.key === 'ArrowLeft') {
        setCurrent((i) => (i - 1 + total) % total);
        setMainErr(false);
      } else if (e.key === 'Escape') {
        setLightboxOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, total]);

  if (isLoading) {
    return (
      <div className="flex gap-3 h-96">
        <div className="flex-1 rounded-2xl bg-gray-100 animate-pulse" />
        <div className="w-28 flex flex-col gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-1 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (total === 0) return null;

  return (
    <>
      {/* Gallery layout: main image left + thumbnail column right */}
      <div className="flex gap-3 h-96">

        {/* Main image */}
        <div
          className="relative flex-1 rounded-2xl overflow-hidden bg-gray-100 cursor-zoom-in group"
          onClick={() => setLightboxOpen(true)}
        >
          {!mainErr ? (
            <>
              {/* Blurred background — same image scaled up, fills gray letterbox areas */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={`bg-${images[current]}`}
                src={images[current]}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-60"
                loading="lazy"
                decoding="async"
              />
              {/* Main image on top — full car visible */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={images[current]}
                src={images[current]}
                alt={`${makeName} ${modelName} — фото ${current + 1}`}
                className="relative w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                loading="lazy"
                decoding="async"
                onError={() => setMainErr(true)}
              />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Car className="h-12 w-12 text-gray-300" />
            </div>
          )}

          {/* Zoom hint overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors rounded-2xl" />
          <div className="absolute bottom-2 right-2 h-7 w-7 rounded-full bg-white/80 border border-gray-200 shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <ZoomIn className="h-3.5 w-3.5 text-gray-600" />
          </div>

          {/* Counter badge */}
          {total > 1 && (
            <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/40 text-white backdrop-blur-sm">
              {current + 1} / {total}
            </span>
          )}
        </div>

        {/* Thumbnail column — scrollable, fixed height matches container */}
        {total > 1 && (
          <div className="w-28 flex-shrink-0 flex flex-col gap-1.5 overflow-y-auto pr-0.5" style={{ scrollbarWidth: 'thin' }}>
            {images.map((url, i) => (
              <button
                key={url}
                onClick={() => select(i)}
                className={`flex-shrink-0 w-full h-20 rounded-xl overflow-hidden border-2 transition-all ${
                  i === current
                    ? 'border-amber-400 ring-1 ring-amber-400/30 opacity-100'
                    : 'border-transparent opacity-50 hover:opacity-80 hover:border-gray-200'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Attribution */}
      <p className="text-[10px] text-gray-300 flex items-center gap-1 mt-2">
        Снимки:{' '}
        <a
          href={sourceUrl ?? 'https://www.autodata24.com'}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-500 transition-colors flex items-center gap-0.5"
        >
          autodata24.com <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </p>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Close */}
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Prev */}
          {total > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); prev(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          {/* Image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={images[current]}
            src={images[current]}
            alt={`${makeName} ${modelName} — фото ${current + 1}`}
            className="max-h-[88vh] max-w-[85vw] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            loading="eager"
            decoding="async"
          />

          {/* Next */}
          {total > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          {/* Counter */}
          {total > 1 && (
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs font-medium px-3 py-1 rounded-full bg-white/10 text-white/80 border border-white/10 backdrop-blur-sm">
              {current + 1} / {total}
            </span>
          )}
        </div>
      )}
    </>
  );
}
