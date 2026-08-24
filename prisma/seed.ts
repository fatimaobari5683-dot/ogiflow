import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Données de démonstration — comptes et référentiel de base pour tester
 * manuellement la chaîne complète (commande → dispatch → livraison → POD →
 * paiement → settlement) une fois une base PostgreSQL disponible.
 *
 * Mot de passe pour tous les comptes créés : "Passw0rd!2026"
 */
const prisma = new PrismaClient();
const DEMO_PASSWORD_HASH = bcrypt.hashSync('Passw0rd!2026', 12);

async function main() {
  // Référentiel de zones — couvre les grandes villes marocaines desservies,
  // pas seulement Casablanca : le tarif de base reflète grossièrement la
  // densité de la ville et sa distance au hub logistique (Casablanca).
  const zoneDefs = [
    { name: 'Centre-Ville Casablanca', city: 'Casablanca', lat: 33.5731, lng: -7.5898, fee: 15 },
    { name: 'Agdal Rabat', city: 'Rabat', lat: 34.0209, lng: -6.8416, fee: 15 },
    { name: 'Kénitra Centre', city: 'Kénitra', lat: 34.261, lng: -6.5802, fee: 18 },
    { name: 'Guéliz Marrakech', city: 'Marrakech', lat: 31.6295, lng: -7.9811, fee: 20 },
    { name: 'Fès Ville Nouvelle', city: 'Fès', lat: 34.0181, lng: -5.0078, fee: 20 },
    { name: 'Meknès Centre', city: 'Meknès', lat: 33.8935, lng: -5.5473, fee: 20 },
    { name: 'Tanger Centre', city: 'Tanger', lat: 35.7595, lng: -5.834, fee: 22 },
    { name: 'Tétouan Centre', city: 'Tétouan', lat: 35.5785, lng: -5.3684, fee: 22 },
    { name: 'Agadir Centre', city: 'Agadir', lat: 30.4278, lng: -9.5981, fee: 25 },
    { name: 'Oujda Centre', city: 'Oujda', lat: 34.6814, lng: -1.9086, fee: 25 },
  ] as const;

  const zonesByCity = new Map<string, Awaited<ReturnType<typeof prisma.zone.upsert>>>();
  for (const z of zoneDefs) {
    const created = await prisma.zone.upsert({
      where: { name: z.name },
      update: { latitude: z.lat, longitude: z.lng },
      create: { name: z.name, city: z.city, baseDeliveryFee: z.fee, latitude: z.lat, longitude: z.lng },
    });
    zonesByCity.set(z.city, created);
  }
  const zone = zonesByCity.get('Casablanca')!;

  await createUserIfMissing({
    email: 'admin@logiflow.ma',
    phone: '+212600000001',
    firstName: 'Admin',
    lastName: 'LogiFlow',
    role: 'SUPER_ADMIN',
  });

  await createUserIfMissing({
    email: 'logistique@logiflow.ma',
    phone: '+212600000002',
    firstName: 'Yasmine',
    lastName: 'Logistique',
    role: 'LOGISTICS_MANAGER',
  });

  await createUserIfMissing({
    email: 'support@logiflow.ma',
    phone: '+212600000004',
    firstName: 'Salma',
    lastName: 'Support',
    role: 'SUPPORT_AGENT',
  });

  await createUserIfMissing({
    email: 'finance@logiflow.ma',
    phone: '+212600000003',
    firstName: 'Karim',
    lastName: 'Finance',
    role: 'FINANCE_MANAGER',
  });

  const supplierUser = await createUserIfMissing({
    email: 'contact@atlasdeco.ma',
    phone: '+212600000010',
    firstName: 'Sara',
    lastName: 'Atlas',
    role: 'SUPPLIER',
  });

  const supplier = await prisma.supplier.upsert({
    where: { userId: supplierUser.id },
    update: {},
    create: {
      userId: supplierUser.id,
      companyName: 'Atlas Déco',
      status: 'ACTIVE',
      defaultCommissionRate: 12,
      contactEmail: supplierUser.email!,
      contactPhone: supplierUser.phone,
    },
  });

  await prisma.product.upsert({
    where: { supplierId_sku: { supplierId: supplier.id, sku: 'ATL-001' } },
    update: {},
    create: {
      supplierId: supplier.id,
      sku: 'ATL-001',
      name: 'Lampe artisanale en laiton',
      price: 450,
      weightKg: 1.2,
    },
  });

  // Documents VERIFIED — depuis que le dispatch/la création de commande
  // vérifient réellement la conformité documentaire (voir
  // documents.service.ts / dispatch.service.ts), un compte de démo sans
  // documents serait bloqué en pratique. `ensureVerifiedDocuments` est
  // idempotent (ne duplique pas un document déjà présent, ex: le CIN
  // réellement uploadé et vérifié via l'UI pendant cette session).
  await ensureVerifiedDocuments('SUPPLIER', supplier.id, ['COMPANY_REGISTRATION']);

  // Répartis sur 3 villes différentes plutôt qu'empilés à Casablanca — la
  // carte opérationnelle et la liste des zones doivent refléter une vraie
  // couverture nationale, pas une seule ville.
  const driverDefs = [
    { email: 'driver1@logiflow.ma', phone: '+212600000021', firstName: 'Hamid', lastName: 'Bennani', city: 'Casablanca', address: '24 Boulevard Mohammed V, Centre-Ville, Casablanca' },
    { email: 'driver2@logiflow.ma', phone: '+212600000022', firstName: 'Rachid', lastName: 'Idrissi', city: 'Rabat', address: '7 Avenue Fal Ould Oumeir, Agdal, Rabat' },
    { email: 'driver3@logiflow.ma', phone: '+212600000023', firstName: 'Nabil', lastName: 'Chraibi', city: 'Marrakech', address: '15 Rue de la Liberté, Guéliz, Marrakech' },
  ] as const;
  const driverUsers = await Promise.all(driverDefs.map((u) => createUserIfMissing({ ...u, role: 'DRIVER' })));

  for (const [index, user] of driverUsers.entries()) {
    const driverZone = zonesByCity.get(driverDefs[index]!.city)!;
    const zoneDef = zoneDefs.find((z) => z.city === driverDefs[index]!.city)!;
    const driver = await prisma.driver.upsert({
      where: { userId: user.id },
      // Repositionne un livreur de démo déjà existant sur sa ville assignée
      // (utile si le seed a précédemment tourné avec l'ancienne répartition
      // "tout Casablanca") — mais ne touche jamais `status`, potentiellement
      // modifié depuis via l'UI pendant une démo.
      update: {
        address: driverDefs[index]!.address,
        currentLatitude: zoneDef.lat + 0.003,
        currentLongitude: zoneDef.lng + 0.003,
        lastLocationUpdate: new Date(),
        baseZoneId: driverZone.id,
      },
      create: {
        userId: user.id,
        driverCode: `DRV-${String(index + 1).padStart(3, '0')}`,
        vehicleType: 'MOTORCYCLE',
        status: 'AVAILABLE',
        commissionRate: 10,
        address: driverDefs[index]!.address,
        currentLatitude: zoneDef.lat + 0.003,
        currentLongitude: zoneDef.lng + 0.003,
        lastLocationUpdate: new Date(),
        baseZoneId: driverZone.id,
      },
    });
    // Aligne les zones de service sur la ville assignée : retire toute zone
    // d'un run de seed précédent (ex: l'ancienne répartition "tout
    // Casablanca") avant de (re)créer la zone canonique de ce livreur.
    await prisma.driverZone.deleteMany({ where: { driverId: driver.id, zoneId: { not: driverZone.id } } });
    await prisma.driverZone.upsert({
      where: { driverId_zoneId: { driverId: driver.id, zoneId: driverZone.id } },
      update: {},
      create: { driverId: driver.id, zoneId: driverZone.id },
    });

    await ensureVerifiedDocuments(
      'DRIVER',
      driver.id,
      ['CIN', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'VEHICLE_INSURANCE'],
      // DRV-002 sert de démonstration pour l'écran "expirent bientôt" du
      // Control Tower — son assurance expire dans 12 jours.
      index === 1 ? { VEHICLE_INSURANCE: 12 } : undefined
    );
  }

  const customerUser = await createUserIfMissing({
    email: 'client1@example.com',
    phone: '+212600000031',
    firstName: 'Fatima',
    lastName: 'Obari',
    role: 'CUSTOMER',
  });

  const customer = await prisma.customer.upsert({
    where: { userId: customerUser.id },
    update: {},
    create: { userId: customerUser.id, fullName: 'Fatima Obari', phone: customerUser.phone },
  });

  await prisma.address.upsert({
    where: { id: `${customer.id}-default` },
    update: {},
    create: {
      id: `${customer.id}-default`,
      customerId: customer.id,
      label: 'Domicile',
      fullAddress: '12 Rue des Fleurs, Centre-Ville',
      city: 'Casablanca',
      zoneId: zone.id,
      latitude: 33.5735,
      longitude: -7.59,
      isDefault: true,
    },
  });

  console.info('Seed terminé.');
  console.info('Comptes créés (mot de passe : Passw0rd!2026) :');
  console.info('  admin@logiflow.ma        SUPER_ADMIN');
  console.info('  logistique@logiflow.ma   LOGISTICS_MANAGER');
  console.info('  support@logiflow.ma      SUPPORT_AGENT');
  console.info('  finance@logiflow.ma      FINANCE_MANAGER');
  console.info('  contact@atlasdeco.ma     SUPPLIER (Atlas Déco)');
  console.info('  driver1@logiflow.ma      DRIVER (DRV-001, Casablanca)');
  console.info('  driver2@logiflow.ma      DRIVER (DRV-002, Rabat)');
  console.info('  driver3@logiflow.ma      DRIVER (DRV-003, Marrakech)');
  console.info('  client1@example.com      CUSTOMER');
}

/**
 * Crée un document VERIFIED pour chaque type demandé, sauf si un document
 * VERIFIED de ce type existe déjà pour ce propriétaire (idempotent —
 * respecte un document réellement uploadé/vérifié via l'UI entre deux runs
 * du seed). `expiresInDays` permet de forcer un type précis à expirer
 * bientôt, pour peupler l'écran "Documents expirant" en démo.
 */
async function ensureVerifiedDocuments(
  ownerType: 'DRIVER' | 'SUPPLIER',
  ownerId: string,
  types: ('CIN' | 'DRIVER_LICENSE' | 'VEHICLE_REGISTRATION' | 'VEHICLE_INSURANCE' | 'COMPANY_REGISTRATION')[],
  expiresInDays: Partial<Record<(typeof types)[number], number>> = {}
) {
  for (const type of types) {
    const existing = await prisma.document.findFirst({ where: { ownerType, ownerId, type, status: 'VERIFIED' } });
    if (existing) continue;

    const days = expiresInDays[type] ?? 365;
    await prisma.document.create({
      data: {
        ownerType,
        ownerId,
        type,
        fileKey: `seed/${ownerType.toLowerCase()}/${ownerId}/${type}.pdf`,
        fileName: `${type}.pdf`,
        mimeType: 'application/pdf',
        status: 'VERIFIED',
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + days * 86_400_000),
      },
    });
  }
}

async function createUserIfMissing(input: {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: 'SUPER_ADMIN' | 'LOGISTICS_MANAGER' | 'FINANCE_MANAGER' | 'SUPPORT_AGENT' | 'SUPPLIER' | 'DRIVER' | 'CUSTOMER';
}) {
  return prisma.user.upsert({
    where: { phone: input.phone },
    update: {},
    create: {
      email: input.email,
      phone: input.phone,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      status: 'ACTIVE',
      passwordHash: DEMO_PASSWORD_HASH,
    },
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
