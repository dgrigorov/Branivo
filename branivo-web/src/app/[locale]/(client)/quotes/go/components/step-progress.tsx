'use client';

import { WIZARD_STEPS, type WizardStep } from '../hooks/use-wizard-state';

interface StepProgressProps {
  current: WizardStep;
}

export function StepProgress({ current }: StepProgressProps) {
  const currentIdx = WIZARD_STEPS.indexOf(current);

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Прогрес на wizard-а">
      {WIZARD_STEPS.map((step, idx) => {
        const isActive = idx === currentIdx;
        const isDone = idx < currentIdx;

        return (
          <span
            key={step}
            role="img"
            aria-label={`Стъпка ${idx + 1} от ${WIZARD_STEPS.length}${isActive ? ' (текуща)' : isDone ? ' (завършена)' : ''}`}
            aria-current={isActive ? 'step' : undefined}
            className={[
              'block rounded-full transition-all duration-300',
              isActive ? 'h-2.5 w-6 bg-[var(--color-primary,#2563eb)]' :
              isDone   ? 'h-2 w-2 bg-[var(--color-primary,#2563eb)] opacity-60' :
                         'h-2 w-2 bg-gray-300',
            ].join(' ')}
          />
        );
      })}
    </div>
  );
}
