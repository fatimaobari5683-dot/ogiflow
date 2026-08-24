'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Vue d\'ensemble' },
  { href: '/dashboard/control-tower', label: 'Control Tower' },
  { href: '/dashboard/onboarding', label: 'Inscriptions' },
  { href: '/dashboard/documents', label: 'Documents' },
  { href: '/dashboard/orders', label: 'Commandes' },
  { href: '/dashboard/suppliers', label: 'Fournisseurs' },
  { href: '/dashboard/drivers', label: 'Livreurs' },
  { href: '/dashboard/customers', label: 'Clients' },
  { href: '/dashboard/promotions', label: 'Codes promo' },
  { href: '/dashboard/settlements', label: 'Versements' },
  { href: '/dashboard/support', label: 'Support' },
  { href: '/account', label: 'Mon compte' },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const isActive = item.href === '/dashboard' ? pathname === item.href : pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-secondary hover:bg-slate-100 hover:text-ink-primary'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
