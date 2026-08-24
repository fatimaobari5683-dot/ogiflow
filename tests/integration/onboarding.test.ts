import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, resetDatabase } from '../db';
import { createOrderFixtures, createUser } from '../factories';
import { register } from '@/modules/auth/auth.service';
import { registerSchema } from '@/modules/auth/auth.validators';
import { createOrderForSupplier, OrderError } from '@/modules/orders/orders.service';
import {
  approveSupplier,
  rejectSupplier,
  approveDriver,
  rejectDriver,
  listPendingSuppliers,
  listPendingDrivers,
  OnboardingError,
} from '@/modules/onboarding/onboarding.service';
import { uploadDocument, verifyDocument } from '@/modules/documents/documents.service';

beforeEach(resetDatabase);

let phoneCounter = 0;
function uniquePhone(): string {
  phoneCounter += 1;
  return `+2126${String(90000000 + phoneCounter)}`;
}

async function registerPendingSupplier() {
  const { userId } = await register({
    firstName: 'Nadia',
    lastName: 'Fournisseur',
    phone: uniquePhone(),
    password: 'Passw0rd!2026',
    role: 'SUPPLIER',
    companyName: 'Nadia Déco SARL',
  });
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { userId } });
  return { userId, supplier };
}

async function registerPendingDriver() {
  const zone = await prisma.zone.create({ data: { name: `Zone-Driver-${Date.now()}-${Math.random()}`, city: 'Casablanca' } });
  const { userId } = await register({
    firstName: 'Karim',
    lastName: 'Livreur',
    phone: uniquePhone(),
    password: 'Passw0rd!2026',
    role: 'DRIVER',
    vehicleType: 'CAR',
    address: '12 Rue Test, Casablanca',
    baseZoneId: zone.id,
  });
  const driver = await prisma.driver.findUniqueOrThrow({ where: { userId } });
  return { userId, driver, zone };
}

describe('register — profils métier créés en attente', () => {
  it('crée un fournisseur PENDING_APPROVAL avec la vraie raison sociale (pas le nom de la personne)', async () => {
    const { supplier } = await registerPendingSupplier();
    expect(supplier.status).toBe('PENDING_APPROVAL');
    expect(supplier.companyName).toBe('Nadia Déco SARL');
  });

  it('crée un livreur PENDING_APPROVAL avec le type de véhicule choisi', async () => {
    const { driver } = await registerPendingDriver();
    expect(driver.status).toBe('PENDING_APPROVAL');
    expect(driver.vehicleType).toBe('CAR');
    expect(driver.driverCode).toMatch(/^DRV-/);
  });

  it('le schéma d\'inscription refuse un livreur sans adresse', () => {
    const result = registerSchema.safeParse({
      firstName: 'Karim',
      lastName: 'Livreur',
      phone: uniquePhone(),
      password: 'Passw0rd!2026',
      role: 'DRIVER',
      vehicleType: 'CAR',
      baseZoneId: 'some-zone-id',
    });
    expect(result.success).toBe(false);
  });

  it('le schéma d\'inscription refuse un livreur sans zone principale', () => {
    const result = registerSchema.safeParse({
      firstName: 'Karim',
      lastName: 'Livreur',
      phone: uniquePhone(),
      password: 'Passw0rd!2026',
      role: 'DRIVER',
      vehicleType: 'CAR',
      address: '12 Rue Test, Casablanca',
    });
    expect(result.success).toBe(false);
  });

  it("persiste l'adresse et la zone principale déclarées à l'inscription, et crée automatiquement la zone de service correspondante", async () => {
    const zone = await prisma.zone.create({ data: { name: `Zone-BaseTest-${Date.now()}`, city: 'Tanger' } });
    const { userId } = await register({
      firstName: 'Youssef',
      lastName: 'Livreur',
      phone: uniquePhone(),
      password: 'Passw0rd!2026',
      role: 'DRIVER',
      vehicleType: 'MOTORCYCLE',
      address: '5 Avenue Mohammed V, Tanger',
      baseZoneId: zone.id,
    });
    const driver = await prisma.driver.findUniqueOrThrow({ where: { userId } });
    expect(driver.address).toBe('5 Avenue Mohammed V, Tanger');
    expect(driver.baseZoneId).toBe(zone.id);
    // La zone déclarée devient aussi la première zone de service — sans quoi
    // le livreur resterait invisible au scoring de dispatch (zoneMatch)
    // jusqu'à une assignation manuelle par un opérateur.
    const driverZones = await prisma.driverZone.findMany({ where: { driverId: driver.id } });
    expect(driverZones).toHaveLength(1);
    expect(driverZones[0]!.zoneId).toBe(zone.id);
  });
});

describe('createOrderForSupplier — garde-fou statut fournisseur (régression critique)', () => {
  it('refuse de créer une commande pour un fournisseur PENDING_APPROVAL', async () => {
    const { supplier } = await registerPendingSupplier();
    const zone = await prisma.zone.create({ data: { name: 'Zone Test', city: 'Casablanca', baseDeliveryFee: 15 } });
    const product = await prisma.product.create({ data: { supplierId: supplier.id, name: 'Produit', price: 100 } });
    void zone;

    await expect(
      createOrderForSupplier({
        supplierId: supplier.id,
        customer: { fullName: 'Client', phone: '+212600000001' },
        address: { fullAddress: '1 rue Test', city: 'Casablanca' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryFee: 20,
      })
    ).rejects.toThrow(OrderError);
  });

  it('un fournisseur ACTIVE mais sans documents vérifiés reste bloqué — approbation de compte ≠ conformité documentaire', async () => {
    const { supplier } = await registerPendingSupplier();
    const product = await prisma.product.create({ data: { supplierId: supplier.id, name: 'Produit', price: 100 } });
    const manager = await createUser('LOGISTICS_MANAGER');

    await approveSupplier(supplier.id, manager.id);
    expect((await prisma.supplier.findUniqueOrThrow({ where: { id: supplier.id } })).status).toBe('ACTIVE');

    // register() ne crée aucun document — l'approbation de compte seule ne
    // suffit donc plus depuis l'activation du Compliance Engine.
    await expect(
      createOrderForSupplier({
        supplierId: supplier.id,
        customer: { fullName: 'Client', phone: '+212600000002' },
        address: { fullAddress: '1 rue Test', city: 'Casablanca' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryFee: 20,
      })
    ).rejects.toThrow(OrderError);
  });

  it('autorise la création de commande une fois le fournisseur ACTIVE ET ses documents vérifiés', async () => {
    const { supplier } = await registerPendingSupplier();
    const product = await prisma.product.create({ data: { supplierId: supplier.id, name: 'Produit', price: 100 } });
    const manager = await createUser('LOGISTICS_MANAGER');

    await approveSupplier(supplier.id, manager.id);
    const doc = await uploadDocument({
      ownerType: 'SUPPLIER',
      ownerId: supplier.id,
      type: 'COMPANY_REGISTRATION',
      file: { buffer: Buffer.from('RC'), fileName: 'rc.pdf', mimeType: 'application/pdf' },
    });
    await verifyDocument(doc.id, manager.id);

    const order = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client', phone: '+212600000002' },
      address: { fullAddress: '1 rue Test', city: 'Casablanca' },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 20,
    });
    expect(order.supplierId).toBe(supplier.id);
  });

  it('refuse aussi pour un fournisseur déjà ACTIVE via la fixture standard si son statut est repassé à REJECTED', async () => {
    const { supplier } = await createOrderFixtures();
    await prisma.supplier.update({ where: { id: supplier.id }, data: { status: 'REJECTED', rejectionReason: 'Document manquant' } });
    const product = await prisma.product.create({ data: { supplierId: supplier.id, name: 'Produit', price: 100 } });

    await expect(
      createOrderForSupplier({
        supplierId: supplier.id,
        customer: { fullName: 'Client', phone: '+212600000003' },
        address: { fullAddress: '1 rue Test', city: 'Casablanca' },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryFee: 20,
      })
    ).rejects.toThrow(OrderError);
  });
});

describe('approveSupplier / rejectSupplier', () => {
  it('approuver fait passer Supplier et User en ACTIVE, et écrit un audit log', async () => {
    const { userId, supplier } = await registerPendingSupplier();
    const manager = await createUser('LOGISTICS_MANAGER');

    const updated = await approveSupplier(supplier.id, manager.id);
    expect(updated.status).toBe('ACTIVE');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.status).toBe('ACTIVE');

    const audit = await prisma.auditLog.findFirst({ where: { entityId: supplier.id, action: 'SUPPLIER_APPROVED' } });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(manager.id);
  });

  it('refuser stocke le motif et laisse le compte User inchangé', async () => {
    const { supplier } = await registerPendingSupplier();
    const manager = await createUser('LOGISTICS_MANAGER');

    const updated = await rejectSupplier(supplier.id, manager.id, 'Registre de commerce illisible');
    expect(updated.status).toBe('REJECTED');
    expect(updated.rejectionReason).toBe('Registre de commerce illisible');
  });

  it('refuse une double approbation (déjà ACTIVE)', async () => {
    const { supplier } = await registerPendingSupplier();
    const manager = await createUser('LOGISTICS_MANAGER');
    await approveSupplier(supplier.id, manager.id);

    await expect(approveSupplier(supplier.id, manager.id)).rejects.toThrow(OnboardingError);
  });

  it("n'apparaît plus dans listPendingSuppliers une fois traité", async () => {
    const { supplier } = await registerPendingSupplier();
    const manager = await createUser('LOGISTICS_MANAGER');

    expect(await listPendingSuppliers()).toEqual(expect.arrayContaining([expect.objectContaining({ id: supplier.id })]));
    await approveSupplier(supplier.id, manager.id);
    expect(await listPendingSuppliers()).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: supplier.id })]));
  });
});

describe('approveDriver / rejectDriver', () => {
  it('approuver fait passer le livreur en OFFLINE (jamais AVAILABLE directement)', async () => {
    const { driver } = await registerPendingDriver();
    const manager = await createUser('LOGISTICS_MANAGER');

    const updated = await approveDriver(driver.id, manager.id);
    expect(updated.status).toBe('OFFLINE');
  });

  it('refuser stocke le motif', async () => {
    const { driver } = await registerPendingDriver();
    const manager = await createUser('LOGISTICS_MANAGER');

    const updated = await rejectDriver(driver.id, manager.id, 'Permis de conduire expiré');
    expect(updated.status).toBe('REJECTED');
    expect(updated.rejectionReason).toBe('Permis de conduire expiré');
  });

  it('refuse de traiter deux fois la même inscription', async () => {
    const { driver } = await registerPendingDriver();
    const manager = await createUser('LOGISTICS_MANAGER');
    await rejectDriver(driver.id, manager.id, 'Document manquant');

    await expect(approveDriver(driver.id, manager.id)).rejects.toThrow(OnboardingError);
    await expect(rejectDriver(driver.id, manager.id, 'Autre motif')).rejects.toThrow(OnboardingError);
  });

  it("n'apparaît plus dans listPendingDrivers une fois traité", async () => {
    const { driver } = await registerPendingDriver();
    const manager = await createUser('LOGISTICS_MANAGER');

    expect(await listPendingDrivers()).toEqual(expect.arrayContaining([expect.objectContaining({ id: driver.id })]));
    await rejectDriver(driver.id, manager.id, 'Non éligible');
    expect(await listPendingDrivers()).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: driver.id })]));
  });
});
