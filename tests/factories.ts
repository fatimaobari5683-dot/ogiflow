import bcrypt from 'bcryptjs';
import { prisma } from './db';
import type { UserRole, VehicleType, DocumentOwnerType, DocumentType } from '@prisma/client';

const REQUIRED_DOCUMENT_TYPES: Record<DocumentOwnerType, DocumentType[]> = {
  DRIVER: ['CIN', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'VEHICLE_INSURANCE'],
  SUPPLIER: ['COMPANY_REGISTRATION'],
};

/**
 * Crée directement des documents VERIFIED (bypass du service, comme le fait
 * déjà `createSupplier` avec `status: 'ACTIVE'`) — pour que les tests de
 * dispatch/commande n'aient pas tous à gérer explicitement la conformité
 * documentaire, maintenant que le dispatch/la création de commande la
 * vérifient réellement. `withDocuments: false` reste nécessaire pour les
 * tests qui exercent spécifiquement le moteur d'éligibilité lui-même (voir
 * documents.test.ts).
 */
async function attachVerifiedDocuments(ownerType: DocumentOwnerType, ownerId: string): Promise<void> {
  const types = REQUIRED_DOCUMENT_TYPES[ownerType];
  if (types.length === 0) return;
  await prisma.document.createMany({
    data: types.map((type) => ({
      ownerType,
      ownerId,
      type,
      fileKey: `test-fixtures/${ownerType.toLowerCase()}/${ownerId}/${type}.pdf`,
      fileName: `${type}.pdf`,
      mimeType: 'application/pdf',
      status: 'VERIFIED',
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 86_400_000),
    })),
  });
}

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now()}${counter}`;
}

/**
 * Suffixe numérique unique de longueur fixe (8 chiffres, épuisement à
 * 10^8 appels — largement suffisant pour une suite de tests). Ne PAS
 * construire un numéro puis le tronquer avec `.slice()` : ça coupait
 * justement la partie qui garantissait l'unicité (bug trouvé en écrivant
 * ce fichier — deux fixtures créées dans la même milliseconde généraient
 * le même numéro de téléphone tronqué).
 */
function uniquePhoneSuffix(): string {
  counter += 1;
  return String(counter).padStart(8, '0');
}

export async function createUser(role: UserRole, overrides: Partial<{ phone: string; email: string }> = {}) {
  return prisma.user.create({
    data: {
      firstName: 'Test',
      lastName: role,
      phone: overrides.phone ?? `+2126${uniquePhoneSuffix()}`,
      email: overrides.email ?? `${unique('user')}@test.local`,
      passwordHash: await bcrypt.hash('Passw0rd!2026', 4),
      role,
      status: 'ACTIVE',
    },
  });
}

export async function createZone(overrides: { lat?: number; lng?: number } = {}) {
  return prisma.zone.create({
    data: { name: unique('Zone-'), city: 'Casablanca', baseDeliveryFee: 15, latitude: overrides.lat, longitude: overrides.lng },
  });
}

export async function createSupplier(overrides: { commissionRate?: number; withDocuments?: boolean } = {}) {
  const user = await createUser('SUPPLIER');
  const supplier = await prisma.supplier.create({
    data: {
      userId: user.id,
      companyName: unique('Supplier-'),
      status: 'ACTIVE',
      defaultCommissionRate: overrides.commissionRate ?? 12,
    },
  });
  if (overrides.withDocuments !== false) {
    await attachVerifiedDocuments('SUPPLIER', supplier.id);
  }
  return { user, supplier };
}

export async function createProduct(supplierId: string, overrides: { price?: number } = {}) {
  return prisma.product.create({
    data: {
      supplierId,
      name: unique('Product-'),
      price: overrides.price ?? 100,
    },
  });
}

export async function createDriver(
  overrides: {
    zoneId?: string;
    baseZoneId?: string;
    status?: 'PENDING_APPROVAL' | 'AVAILABLE' | 'BUSY' | 'OFFLINE' | 'REJECTED' | 'SUSPENDED';
    commissionRate?: number;
    lat?: number;
    lng?: number;
    withDocuments?: boolean;
  } = {}
) {
  const user = await createUser('DRIVER');
  const driver = await prisma.driver.create({
    data: {
      userId: user.id,
      driverCode: unique('DRV-'),
      vehicleType: 'MOTORCYCLE' as VehicleType,
      status: overrides.status ?? 'AVAILABLE',
      commissionRate: overrides.commissionRate ?? 10,
      currentLatitude: overrides.lat,
      currentLongitude: overrides.lng,
      lastLocationUpdate: overrides.lat !== undefined ? new Date() : undefined,
      baseZoneId: overrides.baseZoneId,
    },
  });
  if (overrides.zoneId) {
    await prisma.driverZone.create({ data: { driverId: driver.id, zoneId: overrides.zoneId } });
  }
  if (overrides.withDocuments !== false) {
    await attachVerifiedDocuments('DRIVER', driver.id);
  }
  return { user, driver };
}

export async function createCustomerWithAddress(overrides: { zoneId?: string; lat?: number; lng?: number } = {}) {
  const customer = await prisma.customer.create({
    data: { fullName: unique('Customer-'), phone: `+2127${uniquePhoneSuffix()}` },
  });
  const address = await prisma.address.create({
    data: {
      customerId: customer.id,
      fullAddress: '1 Test Street',
      city: 'Casablanca',
      zoneId: overrides.zoneId,
      latitude: overrides.lat,
      longitude: overrides.lng,
    },
  });
  return { customer, address };
}

/**
 * Compose une chaîne complète prête à créer une commande : fournisseur +
 * produit + client + adresse, tous dans la même zone si fournie. Couvre le
 * cas le plus courant utilisé par la majorité des tests de service.
 */
export async function createOrderFixtures(
  options: { zoneId?: string; commissionRate?: number; productPrice?: number; withDocuments?: boolean } = {}
) {
  const zone = options.zoneId ? { id: options.zoneId } : await createZone();
  const { supplier } = await createSupplier({ commissionRate: options.commissionRate, withDocuments: options.withDocuments });
  const product = await createProduct(supplier.id, { price: options.productPrice });
  const { customer, address } = await createCustomerWithAddress({ zoneId: zone.id });
  return { zone, supplier, product, customer, address };
}
