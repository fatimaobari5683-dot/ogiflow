import { DocumentReviewActions } from '@/components/documents/DocumentReviewActions';
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_CLASSES,
  DOCUMENT_REJECTION_REASON_LABELS,
} from '@/components/documents/document-labels';
import clsx from 'clsx';

export interface DocumentListItem {
  id: string;
  type: string;
  status: string;
  documentNumber: string | null;
  expiresAt: Date | string | null;
  rejectionReasonCode?: string | null;
  rejectionReason: string | null;
  fileName: string;
  createdAt: Date | string;
}

export function DocumentList({ documents, showReviewActions = false }: { documents: DocumentListItem[]; showReviewActions?: boolean }) {
  if (documents.length === 0) {
    return <p className="py-4 text-center text-sm text-ink-muted">Aucun document envoyé.</p>;
  }

  const now = Date.now();

  return (
    <ul className="divide-y divide-hairline">
      {documents.map((doc) => {
        const expiresAt = doc.expiresAt ? new Date(doc.expiresAt) : null;
        const isExpired = doc.status === 'VERIFIED' && expiresAt && expiresAt.getTime() <= now;
        const displayStatus = isExpired ? 'EXPIRED' : doc.status;

        return (
          <li key={doc.id} className="flex items-start justify-between gap-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink-primary">{DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}</span>
                <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', DOCUMENT_STATUS_CLASSES[displayStatus])}>
                  {DOCUMENT_STATUS_LABELS[displayStatus]}
                </span>
              </div>
              <div className="mt-1 text-xs text-ink-muted">
                {doc.documentNumber ? `N° ${doc.documentNumber} · ` : ''}
                {expiresAt ? `expire le ${expiresAt.toLocaleDateString('fr-FR')} · ` : ''}
                envoyé le {new Date(doc.createdAt).toLocaleDateString('fr-FR')}
              </div>
              {doc.status === 'REJECTED' && doc.rejectionReason && (
                <div className="mt-1 text-xs text-status-critical">
                  Motif : {doc.rejectionReasonCode ? `${DOCUMENT_REJECTION_REASON_LABELS[doc.rejectionReasonCode] ?? doc.rejectionReasonCode} — ` : ''}
                  {doc.rejectionReason}
                </div>
              )}
              <a
                href={`/api/v1/documents/${doc.id}/file`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs text-brand-600 hover:underline"
              >
                Voir le fichier →
              </a>
            </div>
            {showReviewActions && (doc.status === 'UPLOADED' || doc.status === 'UNDER_REVIEW') && (
              <DocumentReviewActions documentId={doc.id} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
