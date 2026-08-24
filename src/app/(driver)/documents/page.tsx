import { requirePageUser } from '@/shared/http/page-auth';
import { getDriverByUserId } from '@/modules/drivers/drivers.service';
import {
  listDocumentsForOwner,
  computeEligibility,
  getActionRequiredDocuments,
  classifyMissingTypes,
  DOCUMENT_TYPES_BY_OWNER,
} from '@/modules/documents/documents.service';
import { DocumentUploadForm } from '@/components/documents/DocumentUploadForm';
import { DocumentList } from '@/components/documents/DocumentList';
import { ActionRequiredDocuments } from '@/components/documents/ActionRequiredDocuments';
import { DOCUMENT_TYPE_LABELS } from '@/components/documents/document-labels';

export const dynamic = 'force-dynamic';

export default async function DriverDocumentsPage() {
  const user = await requirePageUser(['DRIVER']);
  const driver = await getDriverByUserId(user.id);
  if (!driver) return null;

  const [documents, eligibility, actionRequired] = await Promise.all([
    listDocumentsForOwner('DRIVER', driver.id),
    computeEligibility('DRIVER', driver.id),
    getActionRequiredDocuments('DRIVER', driver.id),
  ]);

  const { pendingReviewTypes, trulyMissingTypes } = classifyMissingTypes(eligibility.missingTypes, documents);
  const needsAction = trulyMissingTypes.length > 0 || eligibility.expiredTypes.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink-primary">Mes documents</h1>
        <p className="text-sm text-ink-secondary">
          {eligibility.eligible
            ? 'Tous vos documents obligatoires sont à jour.'
            : needsAction
              ? 'Des documents sont manquants ou expirés — vous risquez de ne plus recevoir de missions tant que ce n\'est pas régularisé.'
              : 'Vos documents envoyés sont en attente de vérification par un opérateur.'}
        </p>
      </div>

      <ActionRequiredDocuments documents={actionRequired} />

      {(trulyMissingTypes.length > 0 || eligibility.expiredTypes.length > 0) && (
        <div className="space-y-1 rounded-md bg-status-warning/15 px-3 py-2 text-sm text-[#8a5a00]">
          {trulyMissingTypes.length > 0 && (
            <div>Manquants : {trulyMissingTypes.map((t) => DOCUMENT_TYPE_LABELS[t] ?? t).join(', ')}</div>
          )}
          {eligibility.expiredTypes.length > 0 && (
            <div>Expirés : {eligibility.expiredTypes.map((t) => DOCUMENT_TYPE_LABELS[t] ?? t).join(', ')}</div>
          )}
        </div>
      )}

      {pendingReviewTypes.length > 0 && (
        <div className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700">
          En attente de vérification : {pendingReviewTypes.map((t) => DOCUMENT_TYPE_LABELS[t] ?? t).join(', ')}
        </div>
      )}

      <DocumentUploadForm ownerType="DRIVER" ownerId={driver.id} requiredTypes={DOCUMENT_TYPES_BY_OWNER.DRIVER} />

      <div className="rounded-lg border border-hairline bg-surface p-4">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-ink-muted">Historique</h2>
        <DocumentList documents={documents} />
      </div>
    </div>
  );
}
