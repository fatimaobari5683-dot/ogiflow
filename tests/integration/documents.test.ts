import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, resetDatabase } from '../db';
import { createDriver, createSupplier, createUser } from '../factories';
import {
  uploadDocument,
  verifyDocument,
  rejectDocument,
  computeEligibility,
  getIneligibleOwnerIds,
  getActionRequiredDocuments,
  listPendingDocuments,
  listExpiringDocuments,
  listExpiredDocuments,
  listDocumentsForOwner,
  classifyMissingTypes,
  DocumentError,
} from '@/modules/documents/documents.service';

beforeEach(resetDatabase);

function fakeFile(name = 'piece.pdf') {
  return { buffer: Buffer.from('contenu de test'), fileName: name, mimeType: 'application/pdf' };
}

describe('uploadDocument', () => {
  it('refuse un type de document non applicable au type de propriétaire', async () => {
    const { driver } = await createDriver({ withDocuments: false });
    await expect(
      uploadDocument({ ownerType: 'DRIVER', ownerId: driver.id, type: 'COMPANY_REGISTRATION', file: fakeFile() })
    ).rejects.toThrow(DocumentError);
  });

  it('crée un document UPLOADED et persiste le fichier récupérable', async () => {
    const { driver } = await createDriver({ withDocuments: false });
    const doc = await uploadDocument({ ownerType: 'DRIVER', ownerId: driver.id, type: 'CIN', file: fakeFile('cin.pdf') });

    expect(doc.status).toBe('UPLOADED');
    expect(doc.fileName).toBe('cin.pdf');

    const stored = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(stored.ownerId).toBe(driver.id);
  });
});

describe('verifyDocument / rejectDocument', () => {
  it('vérifier écrit verifiedById/verifiedAt et un audit log', async () => {
    const { driver } = await createDriver({ withDocuments: false });
    const doc = await uploadDocument({ ownerType: 'DRIVER', ownerId: driver.id, type: 'CIN', file: fakeFile() });
    const manager = await createUser('LOGISTICS_MANAGER');

    const updated = await verifyDocument(doc.id, manager.id);
    expect(updated.status).toBe('VERIFIED');
    expect(updated.verifiedById).toBe(manager.id);

    const audit = await prisma.auditLog.findFirst({ where: { entityId: doc.id, action: 'DOCUMENT_VERIFIED' } });
    expect(audit).not.toBeNull();
  });

  it('refuse de vérifier deux fois le même document', async () => {
    const { driver } = await createDriver({ withDocuments: false });
    const doc = await uploadDocument({ ownerType: 'DRIVER', ownerId: driver.id, type: 'CIN', file: fakeFile() });
    const manager = await createUser('LOGISTICS_MANAGER');
    await verifyDocument(doc.id, manager.id);

    await expect(verifyDocument(doc.id, manager.id)).rejects.toThrow(DocumentError);
  });

  it('refuser stocke le motif', async () => {
    const { driver } = await createDriver({ withDocuments: false });
    const doc = await uploadDocument({ ownerType: 'DRIVER', ownerId: driver.id, type: 'CIN', file: fakeFile() });
    const manager = await createUser('LOGISTICS_MANAGER');

    const updated = await rejectDocument(doc.id, manager.id, 'ILLEGIBLE', 'Photo illisible');
    expect(updated.status).toBe('REJECTED');
    expect(updated.rejectionReasonCode).toBe('ILLEGIBLE');
    expect(updated.rejectionReason).toBe('Photo illisible');
  });

  it("refuser un document notifie le propriétaire réel (résolution ownerId → userId)", async () => {
    const { driver } = await createDriver({ withDocuments: false });
    const doc = await uploadDocument({ ownerType: 'DRIVER', ownerId: driver.id, type: 'CIN', file: fakeFile() });
    const manager = await createUser('LOGISTICS_MANAGER');

    await rejectDocument(doc.id, manager.id, 'ILLEGIBLE', 'Photo illisible');

    const notification = await prisma.notification.findFirst({ where: { userId: driver.userId, event: 'DOCUMENT_REJECTED' } });
    expect(notification).not.toBeNull();
    expect((notification?.payload as Record<string, unknown>)?.reasonCode).toBe('ILLEGIBLE');
  });

  it('vérifier un document notifie aussi le propriétaire', async () => {
    const { supplier } = await createSupplier({ withDocuments: false });
    const doc = await uploadDocument({ ownerType: 'SUPPLIER', ownerId: supplier.id, type: 'COMPANY_REGISTRATION', file: fakeFile() });
    const manager = await createUser('LOGISTICS_MANAGER');

    await verifyDocument(doc.id, manager.id);

    const notification = await prisma.notification.findFirst({ where: { userId: supplier.userId, event: 'DOCUMENT_VERIFIED' } });
    expect(notification).not.toBeNull();
  });

  it("un document refusé ne touche jamais Driver.status ou Supplier.status — le compte reste ACTIVE (régression)", async () => {
    const { driver } = await createDriver({ withDocuments: false, status: 'AVAILABLE' });
    const { supplier } = await createSupplier({ withDocuments: false });
    const manager = await createUser('LOGISTICS_MANAGER');

    const driverDoc = await uploadDocument({ ownerType: 'DRIVER', ownerId: driver.id, type: 'CIN', file: fakeFile() });
    const supplierDoc = await uploadDocument({ ownerType: 'SUPPLIER', ownerId: supplier.id, type: 'COMPANY_REGISTRATION', file: fakeFile() });

    await rejectDocument(driverDoc.id, manager.id, 'ILLEGIBLE', 'Illisible');
    await rejectDocument(supplierDoc.id, manager.id, 'INVALID_FORMAT', 'Format invalide');

    const refreshedDriver = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    const refreshedSupplier = await prisma.supplier.findUniqueOrThrow({ where: { id: supplier.id } });
    // Seule l'éligibilité (calculée séparément) reflète le refus — jamais le
    // statut du compte lui-même. C'est ce qui permet au livreur de rester
    // connecté, de voir son historique et de corriger son dossier.
    expect(refreshedDriver.status).toBe('AVAILABLE');
    expect(refreshedSupplier.status).toBe('ACTIVE');
  });
});

describe('getActionRequiredDocuments — "Actions requises" côté partenaire', () => {
  it("liste un document dont la tentative la plus récente est REJECTED", async () => {
    const { driver } = await createDriver({ withDocuments: false });
    const doc = await uploadDocument({ ownerType: 'DRIVER', ownerId: driver.id, type: 'CIN', file: fakeFile() });
    const manager = await createUser('LOGISTICS_MANAGER');
    await rejectDocument(doc.id, manager.id, 'ILLEGIBLE', 'Illisible');

    const actionRequired = await getActionRequiredDocuments('DRIVER', driver.id);
    expect(actionRequired.map((d) => d.id)).toEqual([doc.id]);
  });

  it("un nouveau document envoyé après un refus retire l'ancien de la liste (mais il reste dans l'historique)", async () => {
    const { driver } = await createDriver({ withDocuments: false });
    const manager = await createUser('LOGISTICS_MANAGER');
    const oldDoc = await uploadDocument({ ownerType: 'DRIVER', ownerId: driver.id, type: 'CIN', file: fakeFile() });
    await rejectDocument(oldDoc.id, manager.id, 'ILLEGIBLE', 'Illisible');

    await uploadDocument({ ownerType: 'DRIVER', ownerId: driver.id, type: 'CIN', file: fakeFile('cin-v2.pdf') });

    const actionRequired = await getActionRequiredDocuments('DRIVER', driver.id);
    expect(actionRequired).toHaveLength(0);

    const stillInHistory = await prisma.document.findUnique({ where: { id: oldDoc.id } });
    expect(stillInHistory?.status).toBe('REJECTED');
  });

  it('un compte entièrement conforme ne liste aucune action requise', async () => {
    const { driver } = await createDriver(); // withDocuments: true par défaut
    expect(await getActionRequiredDocuments('DRIVER', driver.id)).toHaveLength(0);
  });
});

describe('computeEligibility', () => {
  it("un livreur sans aucun document n'est pas éligible et liste tout comme manquant", async () => {
    const { driver } = await createDriver({ withDocuments: false });
    const result = await computeEligibility('DRIVER', driver.id);
    expect(result.eligible).toBe(false);
    expect(result.missingTypes.sort()).toEqual(['CIN', 'DRIVER_LICENSE', 'VEHICLE_INSURANCE', 'VEHICLE_REGISTRATION'].sort());
  });

  it('devient éligible une fois les 4 documents requis VERIFIED', async () => {
    const { driver } = await createDriver({ withDocuments: false });
    const manager = await createUser('LOGISTICS_MANAGER');

    for (const type of ['CIN', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'VEHICLE_INSURANCE'] as const) {
      const doc = await uploadDocument({ ownerType: 'DRIVER', ownerId: driver.id, type, file: fakeFile() });
      await verifyDocument(doc.id, manager.id);
    }

    const result = await computeEligibility('DRIVER', driver.id);
    expect(result).toEqual({ eligible: true, missingTypes: [], expiredTypes: [] });
  });

  it('un document VERIFIED mais expiré ne compte plus — redevient inéligible', async () => {
    const { driver } = await createDriver({ withDocuments: false });
    const manager = await createUser('LOGISTICS_MANAGER');

    for (const type of ['CIN', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION'] as const) {
      const doc = await uploadDocument({ ownerType: 'DRIVER', ownerId: driver.id, type, file: fakeFile() });
      await verifyDocument(doc.id, manager.id);
    }
    const insurance = await uploadDocument({
      ownerType: 'DRIVER',
      ownerId: driver.id,
      type: 'VEHICLE_INSURANCE',
      expiresAt: new Date(Date.now() - 86_400_000), // hier
      file: fakeFile(),
    });
    await verifyDocument(insurance.id, manager.id);

    const result = await computeEligibility('DRIVER', driver.id);
    expect(result.eligible).toBe(false);
    expect(result.expiredTypes).toEqual(['VEHICLE_INSURANCE']);
    expect(result.missingTypes).toEqual([]);
  });

  it('le document le plus récent VERIFIED prime sur un ancien document expiré du même type', async () => {
    const { driver } = await createDriver({ withDocuments: false });
    const manager = await createUser('LOGISTICS_MANAGER');

    const oldDoc = await uploadDocument({
      ownerType: 'DRIVER',
      ownerId: driver.id,
      type: 'CIN',
      expiresAt: new Date(Date.now() - 86_400_000),
      file: fakeFile(),
    });
    await verifyDocument(oldDoc.id, manager.id);

    // Renouvellement : nouveau document du même type, valide.
    const newDoc = await uploadDocument({
      ownerType: 'DRIVER',
      ownerId: driver.id,
      type: 'CIN',
      expiresAt: new Date(Date.now() + 365 * 86_400_000),
      file: fakeFile(),
    });
    await verifyDocument(newDoc.id, manager.id);

    const result = await computeEligibility('DRIVER', driver.id);
    expect(result.expiredTypes).not.toContain('CIN');
  });

  it('un fournisseur ne requiert que COMPANY_REGISTRATION', async () => {
    const { supplier } = await createSupplier({ withDocuments: false });
    const before = await computeEligibility('SUPPLIER', supplier.id);
    expect(before).toEqual({ eligible: false, missingTypes: ['COMPANY_REGISTRATION'], expiredTypes: [] });

    const manager = await createUser('LOGISTICS_MANAGER');
    const doc = await uploadDocument({ ownerType: 'SUPPLIER', ownerId: supplier.id, type: 'COMPANY_REGISTRATION', file: fakeFile() });
    await verifyDocument(doc.id, manager.id);

    const after = await computeEligibility('SUPPLIER', supplier.id);
    expect(after.eligible).toBe(true);
  });
});

describe('classifyMissingTypes — distinction "jamais fourni" vs "en attente de revue"', () => {
  it("classe en 'vraiment manquant' un type sans aucun document", async () => {
    const { driver } = await createDriver({ withDocuments: false });
    const eligibility = await computeEligibility('DRIVER', driver.id);
    const documents = await listDocumentsForOwner('DRIVER', driver.id);

    const { trulyMissingTypes, pendingReviewTypes } = classifyMissingTypes(eligibility.missingTypes, documents);
    expect(trulyMissingTypes.sort()).toEqual(eligibility.missingTypes.sort());
    expect(pendingReviewTypes).toEqual([]);
  });

  it("classe en 'en attente de revue', pas 'manquant', un type tout juste envoyé (UPLOADED) — régression trouvée en vérifiant la page en direct", async () => {
    const { driver } = await createDriver({ withDocuments: false });
    await uploadDocument({ ownerType: 'DRIVER', ownerId: driver.id, type: 'CIN', file: fakeFile() });

    const eligibility = await computeEligibility('DRIVER', driver.id);
    expect(eligibility.missingTypes).toContain('CIN'); // computeEligibility ne voit que VERIFIED, à raison

    const documents = await listDocumentsForOwner('DRIVER', driver.id);
    const { trulyMissingTypes, pendingReviewTypes } = classifyMissingTypes(eligibility.missingTypes, documents);
    expect(pendingReviewTypes).toContain('CIN');
    expect(trulyMissingTypes).not.toContain('CIN');
  });

  it("un type dont le document le plus récent est REJECTED reste classé 'manquant', pas 'en attente'", async () => {
    const { driver } = await createDriver({ withDocuments: false });
    const manager = await createUser('LOGISTICS_MANAGER');
    const doc = await uploadDocument({ ownerType: 'DRIVER', ownerId: driver.id, type: 'CIN', file: fakeFile() });
    await rejectDocument(doc.id, manager.id, 'ILLEGIBLE', 'Photo floue');

    const eligibility = await computeEligibility('DRIVER', driver.id);
    const documents = await listDocumentsForOwner('DRIVER', driver.id);
    const { trulyMissingTypes, pendingReviewTypes } = classifyMissingTypes(eligibility.missingTypes, documents);

    expect(trulyMissingTypes).toContain('CIN');
    expect(pendingReviewTypes).not.toContain('CIN');
  });

  it("un nouvel envoi après refus reclasse le type en 'en attente de revue'", async () => {
    const { driver } = await createDriver({ withDocuments: false });
    const manager = await createUser('LOGISTICS_MANAGER');
    const rejected = await uploadDocument({ ownerType: 'DRIVER', ownerId: driver.id, type: 'CIN', file: fakeFile() });
    await rejectDocument(rejected.id, manager.id, 'ILLEGIBLE', 'Photo floue');
    await uploadDocument({ ownerType: 'DRIVER', ownerId: driver.id, type: 'CIN', file: fakeFile('cin-v2.pdf') });

    const eligibility = await computeEligibility('DRIVER', driver.id);
    const documents = await listDocumentsForOwner('DRIVER', driver.id);
    const { trulyMissingTypes, pendingReviewTypes } = classifyMissingTypes(eligibility.missingTypes, documents);

    expect(pendingReviewTypes).toContain('CIN');
    expect(trulyMissingTypes).not.toContain('CIN');
  });
});

describe('getIneligibleOwnerIds — version batchée', () => {
  it('identifie correctement les livreurs éligibles vs non éligibles dans un même lot', async () => {
    const { driver: eligibleDriver } = await createDriver({ withDocuments: false });
    const { driver: ineligibleDriver } = await createDriver({ withDocuments: false });
    const manager = await createUser('LOGISTICS_MANAGER');

    for (const type of ['CIN', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'VEHICLE_INSURANCE'] as const) {
      const doc = await uploadDocument({ ownerType: 'DRIVER', ownerId: eligibleDriver.id, type, file: fakeFile() });
      await verifyDocument(doc.id, manager.id);
    }
    // ineligibleDriver n'a aucun document.

    const ineligible = await getIneligibleOwnerIds('DRIVER', [eligibleDriver.id, ineligibleDriver.id]);
    expect(ineligible.has(eligibleDriver.id)).toBe(false);
    expect(ineligible.has(ineligibleDriver.id)).toBe(true);
  });
});

describe('files d\'attente admin', () => {
  it('listPendingDocuments retourne les documents UPLOADED avec un libellé propriétaire résolu', async () => {
    const { driver } = await createDriver({ withDocuments: false });
    await uploadDocument({ ownerType: 'DRIVER', ownerId: driver.id, type: 'CIN', file: fakeFile() });

    const pending = await listPendingDocuments();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.ownerLabel).toContain(driver.driverCode);
  });

  it('listExpiringDocuments ne retient que les VERIFIED dans la fenêtre à venir', async () => {
    const { driver } = await createDriver({ withDocuments: false });
    const manager = await createUser('LOGISTICS_MANAGER');
    const doc = await uploadDocument({
      ownerType: 'DRIVER',
      ownerId: driver.id,
      type: 'CIN',
      expiresAt: new Date(Date.now() + 10 * 86_400_000),
      file: fakeFile(),
    });
    await verifyDocument(doc.id, manager.id);

    const expiring = await listExpiringDocuments(30);
    expect(expiring).toHaveLength(1);

    const tooFar = await listExpiringDocuments(5);
    expect(tooFar).toHaveLength(0);
  });

  it('listExpiredDocuments ne retient que les VERIFIED déjà expirés', async () => {
    const { driver } = await createDriver({ withDocuments: false });
    const manager = await createUser('LOGISTICS_MANAGER');
    const doc = await uploadDocument({
      ownerType: 'DRIVER',
      ownerId: driver.id,
      type: 'CIN',
      expiresAt: new Date(Date.now() - 86_400_000),
      file: fakeFile(),
    });
    await verifyDocument(doc.id, manager.id);

    const expired = await listExpiredDocuments();
    expect(expired).toHaveLength(1);
    expect(expired[0]!.ownerLabel).toContain(driver.driverCode);
  });
});
