import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LogiFlow — Delivery Management & Logistics OS',
  description: 'Plateforme d\'orchestration des livraisons : fournisseurs, livreurs, clients.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
