'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCurrentUser, type UserRole } from '@/lib/hooks/use-current-user';
import { useTenantView } from '@/lib/context/tenant-view-context';

// ─── Icons ──────────────────────────────────────────────────────────────────

function Ico({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'size-5 shrink-0'}
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  login:     'M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9',
  key:       'M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25z',
  lock:      'M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z',
  rocket:    'M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.82m5.84-2.56a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.82m2.56-5.84a14.98 14.98 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z',
  car:       'M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12',
  chart:     'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125z',
  card:      'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5z',
  check:     'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  wallet:    'M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18-3H3m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6m18 0V5.25A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25V6',
  users:     'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0z',
  palette:   'M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42',
  globe:     'M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418',
  toggle:    'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25zM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25z',
  currency:  'M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  truck:     'M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12',
  clipboard: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z',
  person:    'M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  building:  'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
  shield:    'M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  percent:   'M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941',
  calendar:  'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H18v-.008zm0 2.25h.008v.008H18V15z',
  search:    'M15.75 15.75 19.5 19.5m-4.5-4.5A7.5 7.5 0 1 0 4.5 4.5a7.5 7.5 0 0 0 10.5 10.5z',
  bell:      'M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0',
  chevronL:  'M15.75 19.5 8.25 12l7.5-7.5',
  chevronR:  'M8.25 4.5l7.5 7.5-7.5 7.5',
  grid:      'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25zM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25z',
} as const;

// ─── Nav Structure ───────────────────────────────────────────────────────────

interface NavChild {
  label: string;
  href: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: keyof typeof ICONS;
  allowedRoles?: UserRole[];
  children?: readonly NavChild[];
}

interface NavSection {
  id: string;
  label?: string;
  items: NavItem[];
  allowedRoles: UserRole[];
}

const BROKER_ROLES: UserRole[] = ['broker_admin', 'broker_agent', 'fleet_admin', 'fleet_viewer'];
const CLIENT_ROLES: UserRole[] = ['client', 'end_client', 'driver'];
const SUPER_ADMIN_ROLES: UserRole[] = ['super_admin', 'admin'];

const SECTIONS: NavSection[] = [
  {
    id: 'auth',
    allowedRoles: [],
    items: [
      { label: 'Login (Broker)',     href: '/login',              icon: 'login' },
      { label: 'Forgot Password',    href: '/forgot-password',    icon: 'key' },
      { label: 'Reset Password',     href: '/reset-password',     icon: 'lock' },
      { label: 'Onboarding',         href: '/bg/onboarding',      icon: 'rocket' },
    ],
  },
  {
    id: 'client-insurance',
    label: 'ЗАСТРАХОВАНЕ',
    allowedRoles: CLIENT_ROLES,
    items: [
      { label: 'МПС',                href: '/bg/vehicles',                  icon: 'car' },
      {
        label: 'Оферти',
        href: '/bg/quotes',
        icon: 'chart',
        children: [
          { label: 'GO Застраховка', href: '/bg/quotes/go' },
        ],
      },
      { label: 'Портфейл',           href: '/bg/wallet',                    icon: 'wallet' },
    ],
  },
  {
    id: 'client-payments',
    label: 'ПЛАЩАНИЯ',
    allowedRoles: CLIENT_ROLES,
    items: [
      { label: 'Плащане',            href: '/bg/quotes/payment',            icon: 'card' },
      { label: 'Успешно плащане',    href: '/bg/quotes/payment/success',    icon: 'check' },
    ],
  },
  {
    id: 'broker-fleet',
    label: 'ФЛОТ',
    allowedRoles: BROKER_ROLES,
    items: [
      { label: 'Fleet',              href: '/bg/fleet',               icon: 'truck' },
      { label: 'Fleet Bulk Quotes',  href: '/bg/fleet/bulk-quotes',   icon: 'clipboard' },
      { label: 'Fleet Driver',       href: '/bg/fleet/driver',        icon: 'person' },
    ],
  },
  {
    id: 'broker-settings',
    label: 'НАСТРОЙКИ',
    allowedRoles: BROKER_ROLES,
    items: [
      { label: 'Брандиране',         href: '/bg/branding',            icon: 'palette' },
      { label: 'Домейн',             href: '/bg/settings/domain',     icon: 'globe' },
      { label: 'Feature Flags',      href: '/bg/settings/features',   icon: 'toggle' },
      { label: 'Биллинг',            href: '/bg/billing',             icon: 'currency' },
    ],
  },
  {
    id: 'admin-platform',
    label: 'ПЛАТФОРМА',
    allowedRoles: SUPER_ADMIN_ROLES,
    items: [
      { label: 'Тенанти',            href: '/bg/tenants',             icon: 'building' },
      { label: 'Потребители',        href: '/bg/users',               icon: 'users',    allowedRoles: ['super_admin'] },
      { label: 'Застрахователи',     href: '/bg/insurers',            icon: 'shield' },
      { label: 'API Партньори',      href: '/bg/insurers/partners',   icon: 'key',      allowedRoles: ['super_admin'] },
    ],
  },
  {
    id: 'admin-catalog',
    label: 'КАТАЛОГ',
    allowedRoles: SUPER_ADMIN_ROLES,
    items: [
      { label: 'Автомобили',         href: '/bg/vehicle-catalog',     icon: 'car' },
    ],
  },
  {
    id: 'admin-finance',
    label: 'ФИНАНСИ',
    allowedRoles: SUPER_ADMIN_ROLES,
    items: [
      { label: 'Комисиони',          href: '/bg/commissions',         icon: 'percent',  allowedRoles: ['super_admin'] },
      { label: 'Billing Runs',       href: '/bg/billing-runs',        icon: 'calendar', allowedRoles: ['super_admin'] },
    ],
  },
  {
    id: 'admin-analytics',
    label: 'АНАЛИТИКА',
    allowedRoles: SUPER_ADMIN_ROLES,
    items: [
      { label: 'OCR Analytics',      href: '/bg/ocr-analytics',       icon: 'search' },
      { label: 'Известия',           href: '/bg/notifications',       icon: 'bell' },
    ],
  },
];

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin:  'Супер Админ',
  admin:        'Администратор',
  broker_admin: 'Брокер Админ',
  broker_agent: 'Брокер Агент',
  fleet_admin:  'Fleet Админ',
  fleet_viewer: 'Fleet Viewer',
  client:       'Клиент',
  end_client:   'Краен Клиент',
  driver:       'Шофьор',
};

// ─── Component ───────────────────────────────────────────────────────────────

function isSectionVisible(section: NavSection, role: UserRole | null): boolean {
  if (section.allowedRoles.length === 0) return true;
  if (!role) return false;
  if (role === 'super_admin') return true;
  return (section.allowedRoles as string[]).includes(role);
}

function isItemVisible(item: NavItem, role: UserRole | null): boolean {
  if (!item.allowedRoles || item.allowedRoles.length === 0) return true;
  if (!role) return false;
  return (item.allowedRoles as string[]).includes(role);
}

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { role } = useCurrentUser();
  const { tenantView, clearTenantView } = useTenantView();
  const isSuperAdmin = role === 'super_admin' || role === 'admin';

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('branivo-sidebar-collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('branivo-sidebar-collapsed', String(next));
      return next;
    });
  }

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  }

  const w = mounted ? (collapsed ? 'w-16' : 'w-64') : 'w-64';
  const isCollapsed = mounted && collapsed;

  const visibleSections = SECTIONS.filter((s) => isSectionVisible(s, role));

  return (
    <aside
      className={`${w} relative flex shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200`}
      style={{ minHeight: '100dvh' }}
    >
      {/* Floating toggle button — always on right edge */}
      <button
        onClick={toggle}
        title={isCollapsed ? 'Разгъни' : 'Свий'}
        className="absolute -right-3 top-[38px] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm hover:border-slate-300 hover:text-slate-600"
      >
        <Ico
          d={isCollapsed ? ICONS.chevronR : ICONS.chevronL}
          className="size-3.5"
        />
      </button>

      {/* Logo */}
      <div className="flex h-14 items-center border-b border-slate-200 px-4">
        {!isCollapsed ? (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
              </svg>
            </div>
            <span className="text-base font-bold text-slate-800 tracking-tight">Branivo</span>
          </div>
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white mx-auto">
            <span className="text-sm font-bold">B</span>
          </div>
        )}
      </div>

      {/* Entity card — role badge / tenant switcher */}
      {role && (
        <div className={`border-b border-slate-200 ${isCollapsed ? 'px-2 py-3' : 'p-3'}`}>
          {isCollapsed ? (
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg mx-auto ${
                tenantView && isSuperAdmin ? 'bg-blue-100' : 'bg-slate-100'
              }`}
              title={
                tenantView && isSuperAdmin
                  ? `Преглед: ${tenantView.tenantName}`
                  : (ROLE_LABELS[role] ?? role)
              }
            >
              <Ico
                d={ICONS.building}
                className={`size-4 ${tenantView && isSuperAdmin ? 'text-blue-600' : 'text-slate-600'}`}
              />
            </div>
          ) : isSuperAdmin ? (
            <div className="flex items-center gap-1">
              <Link
                href="/bg/tenants"
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 transition-colors hover:bg-slate-50"
                title="Управление на тенанти"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    tenantView ? 'bg-blue-100' : 'bg-slate-100'
                  }`}
                >
                  <Ico
                    d={ICONS.building}
                    className={`size-5 ${tenantView ? 'text-blue-600' : 'text-slate-600'}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {tenantView ? tenantView.tenantName : 'Branivo Platform'}
                  </p>
                  <p
                    className={`truncate text-xs font-medium ${
                      tenantView ? 'text-blue-600' : 'text-slate-500'
                    }`}
                  >
                    {tenantView ? 'Преглед като брокер' : (ROLE_LABELS[role] ?? role)}
                  </p>
                </div>
              </Link>
              {tenantView && (
                <button
                  onClick={clearTenantView}
                  title="Изчисти преглед"
                  className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-500"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3.5"
                  >
                    <path d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                <Ico d={ICONS.building} className="size-5 text-slate-600" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">Branivo Platform</p>
                <p className="truncate text-xs text-slate-500">{ROLE_LABELS[role] ?? role}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        {visibleSections.map((section, sectionIndex) => {
          const visibleItems = section.items.filter((item) => isItemVisible(item, role));
          if (visibleItems.length === 0) return null;

          const prevSection = visibleSections[sectionIndex - 1];
          const showDivider = sectionIndex > 0 && prevSection !== undefined;

          return (
            <div key={section.id}>
              {showDivider && !isCollapsed && (
                <div className="mx-3 my-2 border-t border-slate-100" />
              )}
              {showDivider && isCollapsed && (
                <div className="mx-auto my-2 h-px w-8 bg-slate-100" />
              )}

              {/* Section label */}
              {section.label && !isCollapsed && (
                <p className="mb-1 mt-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  {section.label}
                </p>
              )}

              {/* Items */}
              {visibleItems.map((item) => {
                const active = isActive(item.href);
                const childActive = item.children?.some((c) => isActive(c.href)) ?? false;
                const parentActive = active || childActive;
                return (
                  <div key={item.href}>
                    <Link
                      href={item.href}
                      title={isCollapsed ? item.label : undefined}
                      className={[
                        'mx-2 my-0.5 flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                        parentActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                        isCollapsed ? 'justify-center' : '',
                      ].join(' ')}
                    >
                      <Ico
                        d={ICONS[item.icon]}
                        className={`size-[18px] shrink-0 ${parentActive ? 'text-blue-600' : 'text-slate-400'}`}
                      />
                      {!isCollapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </Link>
                    {/* Submenu children — only when sidebar is expanded */}
                    {!isCollapsed && item.children?.map((child) => {
                      const childIsActive = isActive(child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={[
                            'mx-2 my-0.5 flex items-center gap-2 rounded-lg py-1.5 pl-9 pr-2.5 text-xs font-medium transition-colors',
                            childIsActive
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
                          ].join(' ')}
                        >
                          <span className="h-1 w-1 shrink-0 rounded-full bg-current opacity-60" aria-hidden="true" />
                          <span className="truncate">{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </nav>

    </aside>
  );
}
