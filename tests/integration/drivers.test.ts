import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, resetDatabase } from '../db';
import { createDriver, createOrderFixtures, createZone } from '../factories';
import { listDriverLocations, getDriverPerformance, getDriverLeaderboard } from '@/modules/drivers/drivers.service';
import { createOrderForSupplier } from '@/modules/orders/orders.service';

beforeEach(resetDatabase);

describe('listDriverLocations — carte opérationnelle', () => {
  it('renvoie une position pour un livreur récemment pingé, non signalée obsolète', async () => {
    const { driver } = await createDriver({ lat: 33.5731, lng: -7.5898 });

    const locations = await listDriverLocations();
    const point = locations.find((p) => p.id === driver.id);

    expect(point).toBeDefined();
    expect(point?.latitude).toBeCloseTo(33.5731, 4);
    expect(point?.longitude).toBeCloseTo(-7.5898, 4);
    expect(point?.stale).toBe(false);
  });

  it("un livreur sans position connue ni zone déclarée apparaît avec latitude/longitude null plutôt que d'être filtré silencieusement", async () => {
    const { driver } = await createDriver(); // pas de lat/lng, pas de zone

    const locations = await listDriverLocations();
    const point = locations.find((p) => p.id === driver.id);

    expect(point).toBeDefined();
    expect(point?.latitude).toBeNull();
    expect(point?.longitude).toBeNull();
    expect(point?.stale).toBe(true); // pas de lastLocationUpdate = obsolète par définition
    expect(point?.approximate).toBe(false);
  });

  it("un livreur sans position réelle mais avec une zone déclarée retombe sur le centre approximatif de cette zone", async () => {
    const zone = await createZone({ lat: 34.0181, lng: -5.0078 });
    const { driver } = await createDriver({ baseZoneId: zone.id }); // pas de lat/lng réel

    const locations = await listDriverLocations();
    const point = locations.find((p) => p.id === driver.id);

    expect(point?.latitude).toBeCloseTo(34.0181, 4);
    expect(point?.longitude).toBeCloseTo(-5.0078, 4);
    expect(point?.approximate).toBe(true);
  });

  it('une position GPS réelle prime toujours sur la zone déclarée, même si les deux existent', async () => {
    const zone = await createZone({ lat: 34.0181, lng: -5.0078 });
    const { driver } = await createDriver({ baseZoneId: zone.id, lat: 33.5731, lng: -7.5898 });

    const locations = await listDriverLocations();
    const point = locations.find((p) => p.id === driver.id);

    expect(point?.latitude).toBeCloseTo(33.5731, 4);
    expect(point?.approximate).toBe(false);
  });

  it('une position vieille de plus de 20 minutes est marquée stale', async () => {
    const { driver } = await createDriver({ lat: 33.5731, lng: -7.5898 });
    await prisma.driver.update({
      where: { id: driver.id },
      data: { lastLocationUpdate: new Date(Date.now() - 25 * 60_000) },
    });

    const locations = await listDriverLocations();
    const point = locations.find((p) => p.id === driver.id);
    expect(point?.stale).toBe(true);
  });

  it('inclut les livreurs PENDING_APPROVAL — un livreur inscrit reste visible avant même son approbation', async () => {
    const { driver: pending } = await createDriver({ status: 'PENDING_APPROVAL' });

    const locations = await listDriverLocations();
    expect(locations.find((p) => p.id === pending.id)).toBeDefined();
  });

  it('exclut les comptes clos (REJECTED, SUSPENDED)', async () => {
    const { driver: rejected } = await createDriver({ status: 'REJECTED' });
    const { driver: suspended } = await createDriver({ status: 'SUSPENDED' });

    const locations = await listDriverLocations();
    expect(locations.find((p) => p.id === rejected.id)).toBeUndefined();
    expect(locations.find((p) => p.id === suspended.id)).toBeUndefined();
  });
});

describe('getDriverPerformance — note moyenne clients', () => {
  it("retourne null et 0 avis quand le livreur n'a jamais été noté", async () => {
    const { driver } = await createDriver();
    const performance = await getDriverPerformance(driver.id);
    expect(performance.averageRating).toBeNull();
    expect(performance.reviewCount).toBe(0);
  });

  it('agrège plusieurs avis clients — purement informatif, sans effet sur le dispatch', async () => {
    const { driver } = await createDriver();
    const { supplier, product, address } = await createOrderFixtures();

    // Séquentiel, pas Promise.all : createOrderForSupplier calcule le numéro
    // de commande suivant en lisant le compteur courant puis en l'incrémentant
    // — deux appels concurrents liraient la même valeur de départ et
    // entreraient en collision sur la contrainte d'unicité (bug trouvé en
    // écrivant ce test).
    const orders = [];
    for (let i = 0; i < 2; i++) {
      orders.push(
        await createOrderForSupplier({
          supplierId: supplier.id,
          customer: { fullName: `Client Avis ${i}`, phone: `+21267700${i}${i}${i}${i}` },
          address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
          items: [{ productId: product.id, quantity: 1 }],
          deliveryFee: 15,
        })
      );
    }
    await prisma.deliveryReview.createMany({
      data: [
        { orderId: orders[0]!.id, driverId: driver.id, rating: 4 },
        { orderId: orders[1]!.id, driverId: driver.id, rating: 5 },
      ],
    });

    const performance = await getDriverPerformance(driver.id);
    expect(performance.averageRating).toBeCloseTo(4.5, 5);
    expect(performance.reviewCount).toBe(2);
  });
});

describe('getDriverPerformance — niveaux de performance (tiers)', () => {
  /**
   * Insère directement des DeliveryAttempt/DeliveryReview (bypass du cycle
   * complet commande → dispatch → livraison, hors sujet ici) pour tester
   * uniquement le calcul du palier à partir du volume et de la note.
   * `ratings` : un entier par avis (DeliveryReview.rating est un Int en
   * base — une valeur décimale comme 4.5 s'y ferait tronquer silencieusement,
   * fausse valeur qui faisait échouer ce test) ; une moyenne non entière
   * (ex: 4.5) s'obtient donc via PLUSIEURS avis entiers (ex: [4, 5]), pas en
   * passant une moyenne déjà calculée.
   */
  async function createDriverWithStats(successfulDeliveries: number, ratings: number[]) {
    const { driver } = await createDriver();
    const { supplier, product, address } = await createOrderFixtures();
    const baseOrder = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client Stats', phone: `+21267${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 10)}` },
      address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 15,
    });
    const delivery = await prisma.delivery.create({ data: { orderId: baseOrder.id, driverId: driver.id } });

    if (successfulDeliveries > 0) {
      await prisma.deliveryAttempt.createMany({
        data: Array.from({ length: successfulDeliveries }, (_, i) => ({
          deliveryId: delivery.id,
          driverId: driver.id,
          attemptNumber: i + 1,
          result: 'SUCCESS' as const,
        })),
      });
    }

    // Un avis par commande (contrainte d'unicité sur orderId) — une commande
    // dédiée par note souhaitée dans la moyenne.
    for (const [i, rating] of ratings.entries()) {
      const order = await createOrderForSupplier({
        supplierId: supplier.id,
        customer: { fullName: 'Client Avis Stats', phone: `+21268${Date.now().toString().slice(-6)}${i}${Math.floor(Math.random() * 10)}` },
        address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryFee: 15,
      });
      await prisma.deliveryReview.create({ data: { orderId: order.id, driverId: driver.id, rating } });
    }
    return driver;
  }

  it('BRONZE par défaut — livreur sans historique', async () => {
    const { driver } = await createDriver();
    const performance = await getDriverPerformance(driver.id);
    expect(performance.tier).toBe('BRONZE');
  });

  it('BRONZE malgré une excellente note si le volume de livraisons est trop faible', async () => {
    const driver = await createDriverWithStats(5, [5]);
    const performance = await getDriverPerformance(driver.id);
    expect(performance.tier).toBe('BRONZE');
  });

  it('BRONZE malgré un gros volume si le livreur n\'a jamais été noté', async () => {
    const driver = await createDriverWithStats(150, []);
    const performance = await getDriverPerformance(driver.id);
    expect(performance.tier).toBe('BRONZE');
  });

  it('SILVER à partir de 20 livraisons réussies et 4.0 de moyenne', async () => {
    const driver = await createDriverWithStats(20, [4]);
    const performance = await getDriverPerformance(driver.id);
    expect(performance.tier).toBe('SILVER');
  });

  it('reste BRONZE si la note est sous le seuil SILVER malgré le volume requis', async () => {
    const driver = await createDriverWithStats(20, [4, 3]); // moyenne 3.5
    const performance = await getDriverPerformance(driver.id);
    expect(performance.tier).toBe('BRONZE');
  });

  it('GOLD à partir de 50 livraisons réussies et 4.5 de moyenne', async () => {
    const driver = await createDriverWithStats(50, [4, 5]); // moyenne 4.5
    const performance = await getDriverPerformance(driver.id);
    expect(performance.tier).toBe('GOLD');
  });

  it('PLATINUM à partir de 100 livraisons réussies et 4.8 de moyenne', async () => {
    const driver = await createDriverWithStats(100, [5, 5, 5, 5, 4]); // moyenne 4.8
    const performance = await getDriverPerformance(driver.id);
    expect(performance.tier).toBe('PLATINUM');
  });
});

describe('getDriverLeaderboard', () => {
  /**
   * Crée `n` livraisons DÉLIVRÉES à `deliveredAt` donné (par défaut
   * maintenant) pour simuler des livraisons dans/hors de la fenêtre du
   * classement — chaque livraison a sa propre commande (Delivery.orderId
   * est unique).
   */
  async function createDeliveriesAt(driverId: string, n: number, deliveredAt: Date) {
    const { supplier, product, address } = await createOrderFixtures();
    for (let i = 0; i < n; i += 1) {
      const order = await createOrderForSupplier({
        supplierId: supplier.id,
        customer: { fullName: `Client Leaderboard ${i}`, phone: `+2126${Date.now().toString().slice(-6)}${i}${Math.floor(Math.random() * 10)}` },
        address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
        items: [{ productId: product.id, quantity: 1 }],
        deliveryFee: 15,
      });
      await prisma.delivery.create({ data: { orderId: order.id, driverId, deliveredAt } });
    }
  }

  it('classe les livreurs par nombre de livraisons décroissant sur la période', async () => {
    const { driver: top } = await createDriver();
    const { driver: middle } = await createDriver();
    const { driver: bottom } = await createDriver();
    await createDeliveriesAt(top.id, 5, new Date());
    await createDeliveriesAt(middle.id, 3, new Date());
    await createDeliveriesAt(bottom.id, 1, new Date());

    const board = await getDriverLeaderboard('WEEK');
    expect(board.map((e) => e.driverId)).toEqual([top.id, middle.id, bottom.id]);
    expect(board.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it("exclut un livreur sans aucune livraison sur la période", async () => {
    const { driver: active } = await createDriver();
    const { driver: idle } = await createDriver();
    await createDeliveriesAt(active.id, 2, new Date());

    const board = await getDriverLeaderboard('WEEK');
    expect(board.map((e) => e.driverId)).toContain(active.id);
    expect(board.map((e) => e.driverId)).not.toContain(idle.id);
  });

  it('ignore les livraisons hors de la fenêtre WEEK mais les compte en MONTH', async () => {
    const { driver } = await createDriver();
    const twentyDaysAgo = new Date(Date.now() - 20 * 86_400_000);
    await createDeliveriesAt(driver.id, 4, twentyDaysAgo);

    const weekBoard = await getDriverLeaderboard('WEEK');
    expect(weekBoard.map((e) => e.driverId)).not.toContain(driver.id);

    const monthBoard = await getDriverLeaderboard('MONTH');
    const entry = monthBoard.find((e) => e.driverId === driver.id);
    expect(entry?.deliveries).toBe(4);
  });

  it("affiche le palier réel (calculé sur tout l'historique), pas un palier recalculé sur la seule période affichée", async () => {
    const { driver } = await createDriver();
    // 50 livraisons + note 4.5 de moyenne, hors même de la fenêtre MONTH (30j) → GOLD réel.
    const longAgo = new Date(Date.now() - 40 * 86_400_000);
    await createDeliveriesAt(driver.id, 50, longAgo);

    const deliveries = await prisma.delivery.findMany({ where: { driverId: driver.id } });
    await prisma.deliveryAttempt.createMany({
      data: deliveries.map((d) => ({ deliveryId: d.id, driverId: driver.id, attemptNumber: 1, result: 'SUCCESS' as const })),
    });

    const orders = await prisma.order.findMany({ where: { delivery: { driverId: driver.id } }, take: 2 });
    await prisma.deliveryReview.createMany({
      data: orders.map((o, i) => ({ orderId: o.id, driverId: driver.id, rating: i === 0 ? 4 : 5 })), // moyenne 4.5
    });

    // Une seule livraison DANS la fenêtre du mois pour apparaître au classement.
    await createDeliveriesAt(driver.id, 1, new Date());

    const board = await getDriverLeaderboard('MONTH');
    const entry = board.find((e) => e.driverId === driver.id);
    expect(entry?.tier).toBe('GOLD');
    expect(entry?.deliveries).toBe(1); // le classement lui-même reste bien scopé à la période
  });
});
