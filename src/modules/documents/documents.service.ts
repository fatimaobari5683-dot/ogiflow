import { nanoid } from 'nanoid';
import path from 'path';
import { prisma } from '@/infrastructure/database/client';
import { getDocumentStorage } from '@/infrastructure/storage/document-storage';
import { queueAndSendNotification } from '@/modules/notifications/notifications.service';
import type { DocumentOwnerType, DocumentType, DocumentRejectionReason, Document } from '@prisma/client';

/**
 * Résout le User propriétaire réel d'un Document — nécessaire car
 * `Document.ownerId` pointe vers un Driver.id ou Supplier.id (relation
 * polymorphe, voir schema.prisma), jamais directement vers users.id.
 */
async function getOwnerUserId(ownerType: DocumentOwnerType, ownerId: string): Promise<string | null> {
  if (ownerType === 'DRIVER') {
    const driver = await prisma.driver.findUnique({ where: { id: ownerId }, select: { userId: true } });
    return driver?.userId ?? null;
  }
  const supplier = await prisma.supplier.findUnique({ where: { id: ownerId }, select: { userId: true } });
  return supplier?.userId ?? null;
}

export class DocumentError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 409) {
    super(message);
    this.name = 'DocumentError';
    this.statusCode = statusCode;
  }
}

/**
 * Périmètre V1 (voir schema.prisma) : le strict nécessaire pour un livreur
 * indépendant avec véhicule personnel, et un fournisseur simple — pas les
 * paliers BASIC/VERIFIED/BUSINESS_VERIFIED décrits dans les recommandations
 * soumises. `computeEligibility` et `getIneligibleOwnerIds` traitent cette
 * liste comme "tout ce qui est obligatoire pour être opérationnel".
 */
export const DOCUMENT_TYPES_BY_OWNER: Record<DocumentOwnerType, DocumentType[]> = {
  DRIVER: ['CIN', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'VEHICLE_INSURANCE'],
  SUPPLIER: ['COMPANY_REGISTRATION'],
};

function assertTypeAllowedForOwner(ownerType: DocumentOwnerType, type: DocumentType): void {
  if (!DOCUMENT_TYPES_BY_OWNER[ownerType].includes(type)) {
    throw new DocumentError(
      `Le type de document "${type}" ne s'applique pas à un ${ownerType === 'DRIVER' ? 'livreur' : 'fournisseur'}.`,
      422
    );
  }
}

export interface UploadDocumentInput {
  ownerType: DocumentOwnerType;
  ownerId: string;
  type: DocumentType;
  documentNumber?: string;
  issuedAt?: Date;
  expiresAt?: Date;
  file: { buffer: Buffer; fileName: string; mimeType: string };
}

/**
 * Un nouvel upload pour un (ownerType, ownerId, type) déjà VERIFIED ou en
 * attente ne remplace jamais silencieusement l'historique : chaque upload
 * est une nouvelle ligne. `computeEligibility` ne considère que le plus
 * récent VERIFIED de chaque type — un ancien document rejeté ou remplacé
 * reste consultable dans l'historique sans fausser l'éligibilité actuelle.
 */
export async function uploadDocument(input: UploadDocumentInput): Promise<Document> {
  assertTypeAllowedForOwner(input.ownerType, input.type);

  const ext = path.extname(input.file.fileName) || '';
  const key = `${input.ownerType.toLowerCase()}/${input.ownerId}/${input.type}-${nanoid(10)}${ext}`;
  await getDocumentStorage().save(key, input.file.buffer);

  return prisma.document.create({
    data: {
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      type: input.type,
      documentNumber: input.documentNumber,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      fileKey: key,
      fileName: input.file.fileName,
      mimeType: input.file.mimeType,
      status: 'UPLOADED',
    },
  });
}

export async function listDocumentsForOwner(ownerType: DocumentOwnerType, ownerId: string) {
  return prisma.document.findMany({ where: { ownerType, ownerId }, orderBy: { createdAt: 'desc' } });
}

export async function getDocumentFile(documentId: string): Promise<{ document: Document; buffer: Buffer }> {
  const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  const buffer = await getDocumentStorage().read(document.fileKey);
  return { document, buffer };
}

export async function verifyDocument(documentId: string, actorId: string): Promise<Document> {
  const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  if (document.status === 'VERIFIED') {
    throw new DocumentError('Ce document est déjà vérifié.');
  }

  const [updated] = await prisma.$transaction([
    prisma.document.update({
      where: { id: documentId },
      data: { status: 'VERIFIED', verifiedById: actorId, verifiedAt: new Date(), rejectionReasonCode: null, rejectionReason: null },
    }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: 'DOCUMENT_VERIFIED',
        entityType: 'Document',
        entityId: documentId,
        beforeState: { status: document.status },
        afterState: { status: 'VERIFIED' },
      },
    }),
  ]);

  // Pas besoin de "réactiver" quoi que ce soit explicitement (section 18 —
  // "ne pas attendre une action manuelle") : l'éligibilité est calculée à la
  // lecture (computeEligibility/getIneligibleOwnerIds), jamais mise en cache
  // en base — un livreur redevient donc automatiquement sélectionnable par
  // le dispatch dès ce document vérifié, sans étape supplémentaire.
  const ownerUserId = await getOwnerUserId(document.ownerType, document.ownerId);
  if (ownerUserId) {
    await queueAndSendNotification({
      recipient: { userId: ownerUserId },
      channel: 'PUSH',
      event: 'DOCUMENT_VERIFIED',
      payload: { documentId, type: document.type },
    }).catch(() => {});
  }

  return updated;
}

export async function rejectDocument(
  documentId: string,
  actorId: string,
  reasonCode: DocumentRejectionReason,
  reason: string
): Promise<Document> {
  const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  if (document.status === 'REJECTED') {
    throw new DocumentError('Ce document est déjà refusé.');
  }

  const [updated] = await prisma.$transaction([
    prisma.document.update({
      where: { id: documentId },
      data: { status: 'REJECTED', rejectionReasonCode: reasonCode, rejectionReason: reason, verifiedById: actorId, verifiedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        actorId,
        action: 'DOCUMENT_REJECTED',
        entityType: 'Document',
        entityId: documentId,
        beforeState: { status: document.status },
        afterState: { status: 'REJECTED', reasonCode, reason },
      },
    }),
  ]);

  // Un document refusé ne touche jamais Driver.status/Supplier.status — le
  // compte reste ACTIVE, seule l'éligibilité (calculée séparément) en est
  // affectée. Voir tests/integration/documents.test.ts pour le test de
  // régression qui garantit cette séparation dans le temps.
  const ownerUserId = await getOwnerUserId(document.ownerType, document.ownerId);
  if (ownerUserId) {
    await queueAndSendNotification({
      recipient: { userId: ownerUserId },
      channel: 'PUSH',
      event: 'DOCUMENT_REJECTED',
      payload: { documentId, type: document.type, reasonCode, reason },
    }).catch(() => {});
  }

  return updated;
}

/**
 * Les documents obligatoires dont la tentative la plus récente a été
 * refusée — "Actions requises" côté partenaire (section 13 des recommandations
 * soumises). Si un document plus récent existe pour le même type (déjà
 * remplacé, en attente de revue ou vérifié), l'ancien refus reste dans
 * l'historique mais ne réapparaît plus ici : ce n'est plus une action en
 * attente du partenaire.
 */
export async function getActionRequiredDocuments(ownerType: DocumentOwnerType, ownerId: string): Promise<Document[]> {
  const required = DOCUMENT_TYPES_BY_OWNER[ownerType];
  if (required.length === 0) return [];

  const docs = await prisma.document.findMany({
    where: { ownerType, ownerId, type: { in: required } },
    orderBy: { createdAt: 'desc' },
  });

  const latestByType = new Map<DocumentType, Document>();
  for (const doc of docs) {
    if (!latestByType.has(doc.type)) latestByType.set(doc.type, doc);
  }

  return [...latestByType.values()].filter((doc) => doc.status === 'REJECTED');
}

export interface EligibilityResult {
  eligible: boolean;
  missingTypes: DocumentType[];
  expiredTypes: DocumentType[];
}

/**
 * Un document VERIFIED dont la date d'expiration est dépassée ne compte
 * plus — c'est la distinction "document fourni ≠ partenaire validé" : le
 * statut du document seul (VERIFIED) ne suffit jamais, il faut aussi être
 * dans la fenêtre de validité au moment de la vérification.
 */
export async function computeEligibility(ownerType: DocumentOwnerType, ownerId: string): Promise<EligibilityResult> {
  const required = DOCUMENT_TYPES_BY_OWNER[ownerType];
  if (required.length === 0) return { eligible: true, missingTypes: [], expiredTypes: [] };

  const docs = await prisma.document.findMany({
    where: { ownerType, ownerId, type: { in: required }, status: 'VERIFIED' },
    orderBy: { createdAt: 'desc' },
  });

  const now = new Date();
  const seenTypes = new Set<DocumentType>();
  const expiredTypes: DocumentType[] = [];

  for (const doc of docs) {
    if (seenTypes.has(doc.type)) continue; // le plus récent VERIFIED de ce type prime (tri desc)
    seenTypes.add(doc.type);
    if (doc.expiresAt && doc.expiresAt <= now) expiredTypes.push(doc.type);
  }

  const missingTypes = required.filter((t) => !seenTypes.has(t));

  return { eligible: missingTypes.length === 0 && expiredTypes.length === 0, missingTypes, expiredTypes };
}

export interface MissingTypesBreakdown {
  pendingReviewTypes: DocumentType[];
  trulyMissingTypes: DocumentType[];
}

/**
 * `computeEligibility` ne distingue pas, parmi les `missingTypes` qu'elle
 * renvoie, "jamais fourni" de "envoyé mais pas encore VERIFIED" — les deux
 * bloquent l'éligibilité de la même façon, donc la distinction n'a pas de
 * sens pour ELLE. Mais elle en a un pour l'affichage : sans cette fonction,
 * la page documents affichait "Manquant" pour un document que le
 * livreur/fournisseur venait tout juste d'envoyer, ce qui laissait croire
 * que son envoi n'avait pas fonctionné (bug trouvé en vérifiant en direct).
 * `documents` doit être trié du plus récent au plus ancien (garanti par
 * `listDocumentsForOwner`).
 */
export function classifyMissingTypes(missingTypes: DocumentType[], documents: Document[]): MissingTypesBreakdown {
  const mostRecentByType = new Map<DocumentType, Document>();
  for (const doc of documents) {
    if (!mostRecentByType.has(doc.type)) mostRecentByType.set(doc.type, doc);
  }

  const pendingReviewTypes = missingTypes.filter((t) => mostRecentByType.get(t)?.status === 'UPLOADED');
  const trulyMissingTypes = missingTypes.filter((t) => !pendingReviewTypes.includes(t));

  return { pendingReviewTypes, trulyMissingTypes };
}

/**
 * Version batchée de computeEligibility pour un usage sur un pool de
 * candidats (ex: filtrer les livreurs éligibles au dispatch) — une seule
 * requête au lieu d'un aller-retour par livreur.
 */
export async function getIneligibleOwnerIds(ownerType: DocumentOwnerType, ownerIds: string[]): Promise<Set<string>> {
  const required = DOCUMENT_TYPES_BY_OWNER[ownerType];
  if (required.length === 0 || ownerIds.length === 0) return new Set();

  const docs = await prisma.document.findMany({
    where: { ownerType, ownerId: { in: ownerIds }, type: { in: required }, status: 'VERIFIED' },
  });

  const now = new Date();
  const validTypesByOwner = new Map<string, Set<DocumentType>>();
  for (const doc of docs) {
    if (doc.expiresAt && doc.expiresAt <= now) continue;
    const set = validTypesByOwner.get(doc.ownerId) ?? new Set<DocumentType>();
    set.add(doc.type);
    validTypesByOwner.set(doc.ownerId, set);
  }

  const ineligible = new Set<string>();
  for (const ownerId of ownerIds) {
    const validTypes = validTypesByOwner.get(ownerId);
    const hasAllRequired = required.every((t) => validTypes?.has(t));
    if (!hasAllRequired) ineligible.add(ownerId);
  }
  return ineligible;
}

interface OwnerLabeled {
  ownerType: DocumentOwnerType;
  ownerId: string;
}

async function enrichWithOwnerLabel<T extends OwnerLabeled>(docs: T[]): Promise<(T & { ownerLabel: string })[]> {
  const driverIds = docs.filter((d) => d.ownerType === 'DRIVER').map((d) => d.ownerId);
  const supplierIds = docs.filter((d) => d.ownerType === 'SUPPLIER').map((d) => d.ownerId);

  const [drivers, suppliers] = await Promise.all([
    driverIds.length
      ? prisma.driver.findMany({
          where: { id: { in: driverIds } },
          select: { id: true, driverCode: true, user: { select: { firstName: true, lastName: true } } },
        })
      : Promise.resolve([]),
    supplierIds.length
      ? prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, companyName: true } })
      : Promise.resolve([]),
  ]);

  const driverById = new Map(drivers.map((d) => [d.id, d]));
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  return docs.map((doc) => {
    if (doc.ownerType === 'DRIVER') {
      const driver = driverById.get(doc.ownerId);
      return { ...doc, ownerLabel: driver ? `${driver.user.firstName} ${driver.user.lastName} (${driver.driverCode})` : 'Livreur introuvable' };
    }
    const supplier = supplierById.get(doc.ownerId);
    return { ...doc, ownerLabel: supplier ? supplier.companyName : 'Fournisseur introuvable' };
  });
}

export async function listPendingDocuments() {
  const docs = await prisma.document.findMany({
    where: { status: { in: ['UPLOADED', 'UNDER_REVIEW'] } },
    orderBy: { createdAt: 'asc' },
  });
  return enrichWithOwnerLabel(docs);
}

export async function listExpiringDocuments(daysAhead = 30) {
  const now = new Date();
  const horizon = new Date(now.getTime() + daysAhead * 86_400_000);
  const docs = await prisma.document.findMany({
    where: { status: 'VERIFIED', expiresAt: { gte: now, lte: horizon } },
    orderBy: { expiresAt: 'asc' },
  });
  return enrichWithOwnerLabel(docs);
}

export async function listExpiredDocuments() {
  const docs = await prisma.document.findMany({
    where: { status: 'VERIFIED', expiresAt: { lt: new Date() } },
    orderBy: { expiresAt: 'asc' },
  });
  return enrichWithOwnerLabel(docs);
}
