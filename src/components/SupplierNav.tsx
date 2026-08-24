'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const NAV_ITEMS = [
  { href: '/supplier', label: "Vue d'ensemble" },
  { href: '/supplier/orders', label: 'Commandes' },
  { href: '/supplier/products', label: 'Produits' },
  { href: '/supplier/documents', label: 'Documents' },
  { href: '/supplier/settlements', label: 'Versements' },
  { href: '/supplier/support', label: 'Aide' },
  { href: '/account', label: 'Mon compte' },
];

export function SupplierNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const isActive = item.href === '/supplier' ? pathname === item.href : pathname?.startsWith(item.href);
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
