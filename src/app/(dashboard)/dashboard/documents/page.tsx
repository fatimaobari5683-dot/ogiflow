import Link from 'next/link';
import { listPendingDocuments, listExpiringDocuments, listExpiredDocuments } from '@/modules/documents/documents.service';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { DocumentReviewActions } from '@/components/documents/DocumentReviewActions';
import { DOCUMENT_TYPE_LABELS } from '@/components/documents/document-labels';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const [pending, expiring, expired] = await Promise.all([
    listPendingDocuments(),
    listExpiringDocuments(30),
    listExpiredDocuments(),
  ]);

  const ownerHref = (ownerType: string, ownerId: string) =>
    ownerType === 'DRIVER' ? `/dashboard/drivers/${ownerId}` : `/dashboard/suppliers/${ownerId}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Documents</h1>
        <p className="text-sm text-ink-secondary">Pièces justificatives des livreurs et fournisseurs — vérification et suivi des expirations.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <StatTile label="En attente de revue" value={pending.length} />
        </Card>
        <Card>
          <StatTile label="Expirent sous 30 jours" value={expiring.length} />
        </Card>
        <Card>
          <StatTile label="Déjà expirés" value={expired.length} />
        </Card>
      </div>

      <Card>
        <CardHeader title={`À vérifier (${pending.length})`} />
        {pending.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-muted">Rien à vérifier pour le moment.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {pending.map((doc) => (
              <li key={doc.id} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <div className="font-medium text-ink-primary">{DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}</div>
                  <Link href={ownerHref(doc.ownerType, doc.ownerId)} className="text-sm text-brand-600 hover:underline">
                    {doc.ownerLabel}
                  </Link>
                  <div className="mt-1 text-xs text-ink-muted">
                    envoyé le {new Date(doc.createdAt).toLocaleDateString('fr-FR')}
                    {doc.expiresAt ? ` · expire le ${new Date(doc.expiresAt).toLocaleDateString('fr-FR')}` : ''}
                  </div>
                  <a href={`/api/v1/documents/${doc.id}/file`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-brand-600 hover:underline">
                    Voir le fichier →
                  </a>
                </div>
                <DocumentReviewActions documentId={doc.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={`Expirent bientôt (${expiring.length})`} />
        {expiring.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-muted">Aucun document ne va expirer sous 30 jours.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {expiring.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between py-3">
                <div>
                  <span className="font-medium text-ink-primary">{DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}</span>{' '}
                  <Link href={ownerHref(doc.ownerType, doc.ownerId)} className="text-sm text-brand-600 hover:underline">
                    {doc.ownerLabel}
                  </Link>
                </div>
                <span className="rounded-full bg-status-warning/15 px-2.5 py-1 text-xs font-medium text-[#8a5a00]">
                  expire le {new Date(doc.expiresAt!).toLocaleDateString('fr-FR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={`Expirés (${expired.length})`} />
        {expired.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-muted">Aucun document expiré.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {expired.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between py-3">
                <div>
                  <span className="font-medium text-ink-primary">{DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}</span>{' '}
                  <Link href={ownerHref(doc.ownerType, doc.ownerId)} className="text-sm text-brand-600 hover:underline">
                    {doc.ownerLabel}
                  </Link>
                </div>
                <span className="rounded-full bg-status-critical/10 px-2.5 py-1 text-xs font-medium text-status-critical">
                  expiré le {new Date(doc.expiresAt!).toLocaleDateString('fr-FR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
