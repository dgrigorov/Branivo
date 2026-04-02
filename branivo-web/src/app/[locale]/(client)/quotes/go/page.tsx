'use client';

import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { Suspense } from 'react';
import { useWizardState, type WizardStep } from './hooks/use-wizard-state';
import { GoWizardShell } from './components/go-wizard-shell';
import { StepVehicle } from './components/step-vehicle';
import { StepDetails } from './components/step-details';
import { StepOffers } from './components/step-offers';
import { StepDates } from './components/step-dates';
import { StepOwner } from './components/step-owner';
import { StepContact } from './components/step-contact';
import { SocialProofSidebar } from './components/social-proof-sidebar';
import type { SelectedOffer } from './hooks/use-wizard-state';

const STEP_ORDER: WizardStep[] = ['vehicle', 'details', 'offers', 'dates', 'owner', 'contact'];

function isValidStep(s: string | null): s is WizardStep {
  return STEP_ORDER.includes(s as WizardStep);
}

function GoWizardInner() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const { data, update } = useWizardState();

  const rawStep = searchParams.get('step');
  const step: WizardStep = isValidStep(rawStep) ? rawStep : 'vehicle';

  function navigate(target: WizardStep) {
    router.push(`/${params.locale}/quotes/go?step=${target}`);
  }

  function goNext() {
    const idx = STEP_ORDER.indexOf(step);
    const next = STEP_ORDER[idx + 1];
    if (next) {
      navigate(next);
    } else {
      router.push(`/${params.locale}/quotes/go/payment`);
    }
  }

  function goBack() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx <= 0) {
      router.push(`/${params.locale}/quotes`);
    } else {
      const prev = STEP_ORDER[idx - 1];
      if (prev) navigate(prev);
    }
  }

  function handleOfferSelect(offer: SelectedOffer) {
    update('selectedOffer', offer);
    navigate('dates');
  }

  const sidebar = step === 'offers' ? <SocialProofSidebar /> : undefined;

  return (
    <GoWizardShell currentStep={step} onBack={goBack} sidebar={sidebar}>
      {step === 'vehicle' && (
        <StepVehicle data={data.vehicle} onChange={(v) => update('vehicle', v)} onNext={goNext} />
      )}
      {step === 'details' && (
        <StepDetails data={data.details} onChange={(v) => update('details', v)} onNext={goNext} />
      )}
      {step === 'offers' && (
        <StepOffers onSelect={handleOfferSelect} />
      )}
      {step === 'dates' && (
        <StepDates data={data.dates} onChange={(v) => update('dates', v)} onNext={goNext} />
      )}
      {step === 'owner' && (
        <StepOwner data={data.owner} onChange={(v) => update('owner', v)} onNext={goNext} />
      )}
      {step === 'contact' && (
        <StepContact data={data.contact} onChange={(v) => update('contact', v)} onNext={goNext} />
      )}
    </GoWizardShell>
  );
}

export default function GoQuotePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-12 text-gray-400">Зареждане...</div>}>
      <GoWizardInner />
    </Suspense>
  );
}
