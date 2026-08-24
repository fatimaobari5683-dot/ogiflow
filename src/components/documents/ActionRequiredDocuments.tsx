import { DOCUMENT_TYPE_LABELS, DOCUMENT_REJECTION_REASON_LABELS } from '@/components/documents/document-labels';

export interface ActionRequiredDocument {
  id: string;
  type: string;
  rejectionReasonCode: string | null;
  rejectionReason: string | null;
}

/**
 * Le partenaire ne voit jamais "EligibilityDecision = false / BLOCKING" —
 * juste un message simple par document à corriger, avec le motif exact
 * donné par l'administrateur (voir documents.service.ts, section 12 des
 * recommandations soumises : "l'application affiche un message simple").
 */
export function ActionRequiredDocuments({ documents }: { documents: ActionRequiredDocument[] }) {
  if (documents.length === 0) return null;

  return (
    <div className="rounded-lg border border-status-critical/30 bg-status-critical/5 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-status-critical">
        <span aria-hidden>🔴</span> Actions requises ({documents.length})
      </h2>
      <ul className="mt-3 space-y-3">
        {documents.map((doc) => (
          <li key={doc.id} className="rounded-md bg-surface p-3">
            <div className="font-medium text-ink-primary">{DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}</div>
            <div className="mt-1 text-sm text-status-critical">
              {doc.rejectionReasonCode ? `${DOCUMENT_REJECTION_REASON_LABELS[doc.rejectionReasonCode] ?? doc.rejectionReasonCode}` : 'Document refusé'}
              {doc.rejectionReason ? ` — ${doc.rejectionReason}` : ''}
            </div>
            <p className="mt-1 text-xs text-ink-muted">Envoyez un nouveau document ci-dessous pour remplacer celui-ci.</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
