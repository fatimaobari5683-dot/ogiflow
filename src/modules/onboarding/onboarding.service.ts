import { prisma } from '@/infrastructure/database/client';
import { queueAndSendNotification } from '@/modules/notifications/notifications.service';

export class OnboardingError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 409) {
    super(message);
    this.name = 'OnboardingError';
    this.statusCode = statusCode;
  }
}

export async function listPendingSuppliers() {
  return prisma.supplier.findMany({
    where: { status: 'PENDING_APPROVAL' },
    include: { user: { select: { firstName: true, lastName: true, email: true, phone: true, createdAt: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function listPendingDrivers() {
  return prisma.driver.findMany({
    where: { status: 'PENDING_APPROVAL' },
    include: { user: { select: { firstName: true, lastName: true, email: true, phone: true, createdAt: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Fait passer un fournisseur de PENDING_APPROVAL à ACTIVE — c'est le SEUL
 * chemin qui autorise un fournisseur à créer de vraies commandes
 * (createOrderForSupplier vérifie ce statut). Réactive aussi le compte User
 * si l'inscription l'avait laissé en PENDING_VERIFICATION.
 */
export async function approveSupplier(supplierId: string, actorId: string) {
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });
  if (supplier.status !== 'PENDING_APPROVAL') {
    throw new OnboardingError(`Ce fournisseur est déjà au statut "${supplier.status}".`);
  }

  const [updated] = await prisma.$transaction([
    prisma.supplier.update({ where: { id: supplierId }, data: { status: 'ACTIVE', rejectionReason: null } }),
    prisma.user.update({ where: { id: supplier.userId }, data: { status: 'ACTIVE' } }),
    prisma.auditLog.create({
      data: { actorId, action: 'SUPPLIER_APPROVED', entityType: 'Supplier', entityId: supplierId, beforeState: { status: supplier.status }, afterState: { status: 'ACTIVE' } },
    }),
  ]);

  await queueAndSendNotification({
    recipient: { userId: supplier.userId },
    channel: 'EMAIL',
    event: 'SUPPLIER_APPROVED',
    payload: { companyName: supplier.companyName },
  }).catch(() => {});

  return updated;
}

export async function rejectSupplier(supplierId: string, actorId: string, reason: string) {
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });
  if (supplier.status !== 'PENDING_APPROVAL') {
    throw new OnboardingError(`Ce fournisseur est déjà au statut "${supplier.status}".`);
  }

  const [updated] = await prisma.$transaction([
    prisma.supplier.update({ where: { id: supplierId }, data: { status: 'REJECTED', rejectionReason: reason } }),
    prisma.auditLog.create({
      data: { actorId, action: 'SUPPLIER_REJECTED', entityType: 'Supplier', entityId: supplierId, beforeState: { status: supplier.status }, afterState: { status: 'REJECTED', reason } },
    }),
  ]);

  await queueAndSendNotification({
    recipient: { userId: supplier.userId },
    channel: 'EMAIL',
    event: 'SUPPLIER_REJECTED',
    payload: { companyName: supplier.companyName, reason },
  }).catch(() => {});

  return updated;
}

/**
 * Fait passer un livreur de PENDING_APPROVAL à OFFLINE — délibérément pas
 * AVAILABLE : l'approbation autorise le compte, elle ne le rend pas
 * immédiatement dispatchable. C'est au livreur d'activer sa disponibilité
 * depuis l'app (voir AvailabilityToggle), comme n'importe quel autre passage
 * OFFLINE→AVAILABLE.
 */
export async function approveDriver(driverId: string, actorId: string) {
  const driver = await prisma.driver.findUniqueOrThrow({ where: { id: driverId } });
  if (driver.status !== 'PENDING_APPROVAL') {
    throw new OnboardingError(`Ce livreur est déjà au statut "${driver.status}".`);
  }

  const [updated] = await prisma.$transaction([
    prisma.driver.update({ where: { id: driverId }, data: { status: 'OFFLINE', rejectionReason: null } }),
    prisma.user.update({ where: { id: driver.userId }, data: { status: 'ACTIVE' } }),
    prisma.auditLog.create({
      data: { actorId, action: 'DRIVER_APPROVED', entityType: 'Driver', entityId: driverId, beforeState: { status: driver.status }, afterState: { status: 'OFFLINE' } },
    }),
  ]);

  await queueAndSendNotification({
    recipient: { userId: driver.userId },
    channel: 'EMAIL',
    event: 'DRIVER_APPROVED',
    payload: { driverCode: driver.driverCode },
  }).catch(() => {});

  return updated;
}

export async function rejectDriver(driverId: string, actorId: string, reason: string) {
  const driver = await prisma.driver.findUniqueOrThrow({ where: { id: driverId } });
  if (driver.status !== 'PENDING_APPROVAL') {
    throw new OnboardingError(`Ce livreur est déjà au statut "${driver.status}".`);
  }

  const [updated] = await prisma.$transaction([
    prisma.driver.update({ where: { id: driverId }, data: { status: 'REJECTED', rejectionReason: reason } }),
    prisma.auditLog.create({
      data: { actorId, action: 'DRIVER_REJECTED', entityType: 'Driver', entityId: driverId, beforeState: { status: driver.status }, afterState: { status: 'REJECTED', reason } },
    }),
  ]);

  await queueAndSendNotification({
    recipient: { userId: driver.userId },
    channel: 'EMAIL',
    event: 'DRIVER_REJECTED',
    payload: { driverCode: driver.driverCode, reason },
  }).catch(() => {});

  return updated;
}
