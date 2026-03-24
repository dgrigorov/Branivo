'use client';

import Link from 'next/link';
import { useState } from 'react';

const LOCALE = 'bg';

const sections = [
  {
    label: 'AUTH',
    color: 'bg-slate-500',
    pages: [
      { label: 'Login (Broker)', href: '/login' },
      { label: 'Forgot Password', href: '/forgot-password' },
      { label: 'Reset Password', href: '/reset-password' },
      { label: 'Onboarding', href: `/${LOCALE}/onboarding` },
    ],
  },
  {
    label: 'CLIENT',
    color: 'bg-emerald-600',
    pages: [
      { label: 'Vehicles (МПС)', href: `/${LOCALE}/vehicles` },
      { label: 'Quotes (Оферти)', href: `/${LOCALE}/quotes` },
      { label: 'Payment (Плащане)', href: `/${LOCALE}/quotes/payment` },
      { label: 'Payment Success', href: `/${LOCALE}/quotes/payment/success` },
      { label: 'Wallet (Портфейл)', href: `/${LOCALE}/wallet` },
    ],
  },
  {
    label: 'BROKER',
    color: 'bg-blue-600',
    pages: [
      { label: 'Users (Потребители)', href: `/${LOCALE}/users` },
      { label: 'Branding (Брандиране)', href: `/${LOCALE}/branding` },
      { label: 'Domain Settings', href: `/${LOCALE}/settings/domain` },
      { label: 'Feature Flags', href: `/${LOCALE}/settings/features` },
      { label: 'Billing (Биллинг)', href: `/${LOCALE}/billing` },
      { label: 'Fleet Dashboard', href: `/${LOCALE}/fleet` },
      { label: 'Fleet Bulk Quotes', href: `/${LOCALE}/fleet/bulk-quotes` },
      { label: 'Fleet Driver View', href: `/${LOCALE}/fleet/driver` },
    ],
  },
  {
    label: 'SUPER ADMIN',
    color: 'bg-purple-600',
    pages: [
      { label: 'Tenants (Тенанти)', href: `/${LOCALE}/tenants` },
      { label: 'Tenant Detail', href: `/${LOCALE}/tenants/demo-tenant-id` },
      { label: 'Insurers (Застрахователи)', href: `/${LOCALE}/insurers` },
      { label: 'Commission Matrix', href: `/${LOCALE}/commissions` },
      { label: 'Billing Runs', href: `/${LOCALE}/billing-runs` },
      { label: 'OCR Analytics', href: `/${LOCALE}/ocr-analytics` },
      { label: 'System Notifications', href: `/${LOCALE}/notifications` },
    ],
  },
];

export function DevSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-4 left-0 z-[9999] flex items-end">
      {open && (
        <div className="ml-0 flex h-[90vh] w-64 flex-col overflow-hidden rounded-r-xl border border-l-0 border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-800 px-3 py-2">
            <span className="text-xs font-bold tracking-widest text-white">
              DEV · UAT NAV
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-white"
              aria-label="Close sidebar"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {sections.map((section) => (
              <div key={section.label}>
                <div
                  className={`px-3 py-1.5 text-[10px] font-bold tracking-widest text-white ${section.color}`}
                >
                  {section.label}
                </div>
                <ul>
                  {section.pages.map((page) => (
                    <li key={page.href}>
                      <Link
                        href={page.href}
                        className="block px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                      >
                        {page.label}
                        <span className="ml-1 text-[10px] text-slate-400">
                          {page.href}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-6 items-center justify-center rounded-r-lg bg-slate-800 text-xs text-white shadow-lg hover:bg-slate-700"
        aria-label="Toggle dev navigation"
        title="DEV Navigation"
      >
        {open ? '◂' : '▸'}
      </button>
    </div>
  );
}
