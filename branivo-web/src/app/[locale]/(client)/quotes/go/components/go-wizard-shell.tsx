'use client';

import React from 'react';
import { StepProgress } from './step-progress';
import type { WizardStep } from '../hooks/use-wizard-state';

interface GoWizardShellProps {
  currentStep: WizardStep;
  onBack: () => void;
  children: React.ReactNode;
  sidebar?: React.ReactNode;
}

export function GoWizardShell({ currentStep, onBack, children, sidebar }: GoWizardShellProps) {
  return (
    <div className="flex min-h-full flex-col">
      {/* Gradient header */}
      <header
        className="flex items-center justify-between px-4 py-3"
        style={{ background: 'linear-gradient(to right, var(--color-primary, #2563eb), var(--color-accent, #3b82f6))' }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-semibold uppercase tracking-wider text-white/90 hover:text-white"
          aria-label="Назад"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Назад
        </button>

        <span className="text-sm font-bold uppercase tracking-widest text-white">
          Гражданска отговорност
        </span>

        <div className="w-16" aria-hidden="true" />
      </header>

      {/* Content area */}
      <div className="flex flex-1 items-start justify-center gap-6 px-4 py-8 lg:px-8">
        {/* Main card */}
        <div className="w-full max-w-xl">
          <div className="rounded-2xl bg-white p-6 shadow-lg md:p-8">
            <div className="mb-4 flex justify-end">
              <StepProgress current={currentStep} />
            </div>
            {children}
          </div>
        </div>

        {/* Optional sidebar (step 3 only, desktop) */}
        {sidebar && (
          <aside className="hidden w-64 shrink-0 lg:block">
            {sidebar}
          </aside>
        )}
      </div>
    </div>
  );
}
