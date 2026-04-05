'use client';

import { useEffect, useRef, useState } from 'react';
import { SelectField } from '@/components/ui/select-field';
import { useMutation, useQueryClient } from '@tanstack/react-query';

// ─── Constants ───────────────────────────────────────────────────────────────

const APPROVED_FONTS = [
  'Inter',
  'Roboto',
  'Lato',
  'Poppins',
  'Open Sans',
] as const;

type ApprovedFont = (typeof APPROVED_FONTS)[number];

const FONT_GOOGLE_URLS: Record<ApprovedFont, string> = {
  Inter: 'https://fonts.googleapis.com/css2?family=Inter&display=swap',
  Roboto: 'https://fonts.googleapis.com/css2?family=Roboto&display=swap',
  Lato: 'https://fonts.googleapis.com/css2?family=Lato&display=swap',
  Poppins: 'https://fonts.googleapis.com/css2?family=Poppins&display=swap',
  'Open Sans':
    'https://fonts.googleapis.com/css2?family=Open+Sans&display=swap',
};

// ─── WCAG AA helper (client-side) ─────────────────────────────────────────────

function hexToLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number): number =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(hex: string): number {
  const L2 = hexToLuminance(hex);
  return (1 + 0.05) / (L2 + 0.05);
}

function isWcagAA(hex: string): boolean {
  return contrastRatio(hex) >= 4.5;
}

// ─── Logo upload helper ────────────────────────────────────────────────────

function isValidLogoFile(file: File): boolean {
  return file.type === 'image/png' || file.type === 'image/svg+xml';
}

// ─── API call ─────────────────────────────────────────────────────────────────

async function saveBranding(formData: FormData): Promise<void> {
  const res = await fetch('/api/v1/tenants/branding', {
    method: 'PUT',
    credentials: 'include',
    body: formData,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Грешка при запазване на брандирането');
  }
}

// ─── Color input component ─────────────────────────────────────────────────

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const passes = isWcagAA(value);
  const ratio = contrastRatio(value).toFixed(2);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded border border-gray-300 p-1"
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange(v);
          }}
          maxLength={7}
          className="w-28 rounded border border-gray-300 px-2 py-1 font-mono text-sm"
          aria-label={`${label} hex value`}
        />
        <span
          className={`text-xs font-medium ${passes ? 'text-green-600' : 'text-red-600'}`}
          aria-live="polite"
        >
          {passes ? `✓ ${ratio}:1 AA` : `✗ ${ratio}:1 — не отговаря WCAG AA`}
        </span>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BrandingPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [primaryColor, setPrimaryColor] = useState('#1A56DB');
  const [secondaryColor, setSecondaryColor] = useState('#003366');
  const [brandFont, setBrandFont] = useState<ApprovedFont>('Inter');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Revoke object URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    };
  }, [logoPreviewUrl]);

  // Load selected Google Font
  const fontUrl = FONT_GOOGLE_URLS[brandFont];

  const isValid =
    primaryColor.length === 7 &&
    isWcagAA(primaryColor) &&
    secondaryColor.length === 7 &&
    isWcagAA(secondaryColor);

  const { mutate, isPending, error } = useMutation({
    mutationFn: saveBranding,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant', 'config'] });
      setSuccessMsg('Брандирането е запазено успешно!');
      setTimeout(() => setSuccessMsg(null), 4000);
    },
  });

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isValidLogoFile(file)) {
      setLogoError('Само PNG и SVG файлове са разрешени.');
      return;
    }
    setLogoError(null);
    setLogoFile(file);
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setLogoPreviewUrl(URL.createObjectURL(file));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    const formData = new FormData();
    formData.append('primaryColor', primaryColor);
    formData.append('secondaryColor', secondaryColor);
    formData.append('brandFont', brandFont);
    if (logoFile) formData.append('logo', logoFile);

    mutate(formData);
  }

  return (
    <>
      {/* Load selected Google Font */}
      <link rel="stylesheet" href={fontUrl} />

      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">
          Брандиране на портала
        </h1>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Logo upload */}
          <section aria-labelledby="logo-section">
            <h2 id="logo-section" className="mb-3 text-lg font-semibold text-gray-800">
              Лого
            </h2>
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-6 hover:border-blue-400"
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              aria-label="Качи лого — PNG или SVG"
            >
              {logoPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoPreviewUrl}
                  alt="Преглед на логото"
                  className="max-h-24 max-w-xs object-contain"
                />
              ) : (
                <p className="text-sm text-gray-500">
                  Кликнете или плъзнете PNG / SVG файл тук
                </p>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/svg+xml"
              onChange={handleLogoChange}
              className="hidden"
              aria-label="Избери лого файл"
            />
            {logoError && (
              <p className="mt-1 text-sm text-red-600" role="alert">
                {logoError}
              </p>
            )}
          </section>

          {/* Colors */}
          <section aria-labelledby="colors-section">
            <h2 id="colors-section" className="mb-3 text-lg font-semibold text-gray-800">
              Цветове
            </h2>
            <div className="space-y-4">
              <ColorInput
                label="Основен цвят"
                value={primaryColor}
                onChange={setPrimaryColor}
              />
              <ColorInput
                label="Вторичен цвят"
                value={secondaryColor}
                onChange={setSecondaryColor}
              />
            </div>
            {!isValid && (
              <p className="mt-2 text-sm text-red-600" role="alert">
                Единият или и двата цвята не отговарят на WCAG AA стандарта
                (минимум 4.5:1 контраст). Промените не могат да бъдат
                публикувани.
              </p>
            )}
          </section>

          {/* Font */}
          <section aria-labelledby="font-section">
            <h2 id="font-section" className="mb-3 text-lg font-semibold text-gray-800">
              Шрифт
            </h2>
            <SelectField
              value={brandFont}
              onChange={(e) => setBrandFont(e.target.value as ApprovedFont)}
              aria-label="Избери шрифт"
              style={{ fontFamily: brandFont }}
            >
              {APPROVED_FONTS.map((font) => (
                <option key={font} value={font} style={{ fontFamily: font }}>
                  {font}
                </option>
              ))}
            </SelectField>
            <p
              className="mt-2 text-base text-gray-600"
              style={{ fontFamily: brandFont }}
            >
              Примерен текст: Застраховка за вашия автомобил.
            </p>
          </section>

          {/* Preview */}
          <section aria-labelledby="preview-section">
            <h2 id="preview-section" className="mb-3 text-lg font-semibold text-gray-800">
              Преглед
            </h2>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              {showPreview ? 'Скрий preview' : 'Покажи preview'}
            </button>

            {showPreview && (
              <div
                className="mt-4 rounded-lg border p-6"
                style={{ fontFamily: brandFont, borderColor: primaryColor }}
                aria-label="Preглед на брандирания портал"
              >
                <div
                  className="mb-4 rounded px-4 py-2 text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <strong>Заглавие на портала</strong>
                </div>
                {logoPreviewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoPreviewUrl}
                    alt="Лого preview"
                    className="mb-3 max-h-12 object-contain"
                  />
                )}
                <p className="text-gray-700">
                  Примерен текст на quote flow страница.
                </p>
                <button
                  type="button"
                  className="mt-3 rounded px-4 py-2 text-white text-sm"
                  style={{ backgroundColor: secondaryColor }}
                >
                  Вземи оферта
                </button>
              </div>
            )}
          </section>

          {/* Submit */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={!isValid || isPending}
              className="rounded bg-blue-600 px-6 py-2 text-white text-sm font-medium hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-disabled={!isValid}
            >
              {isPending ? 'Запазване...' : 'Запази брандирането'}
            </button>

            {successMsg && (
              <p className="text-sm text-green-600" role="status" aria-live="polite">
                {successMsg}
              </p>
            )}

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {(error as Error).message}
              </p>
            )}
          </div>
        </form>
      </div>
    </>
  );
}
