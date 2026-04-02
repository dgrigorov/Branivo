'use client';

interface PillOption {
  label: string;
  value: string;
}

interface PillToggleProps {
  name: string;
  options: readonly [PillOption, PillOption];
  value: string;
  onChange: (value: string) => void;
}

export function PillToggle({ name, options, value, onChange }: PillToggleProps) {
  return (
    <div role="radiogroup" aria-label={name} className="flex gap-2">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={[
              'flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium transition-all',
              selected
                ? 'border-2 border-[var(--color-primary,#2563eb)] bg-blue-50 text-[var(--color-primary,#2563eb)] font-semibold'
                : 'border border-gray-300 text-gray-500 hover:border-gray-400',
            ].join(' ')}
          >
            {selected && <span aria-hidden="true">✓</span>}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
