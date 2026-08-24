import type { OrderStatus } from '@prisma/client';

/**
 * Machine à états des commandes.
 *
 * Principe fondamental : le statut d'une commande ne doit JAMAIS être modifié
 * par une simple assignation (order.status = 'X'). Toute transition doit
 * passer par `transitionOrderStatus`, qui vérifie que la transition est
 * autorisée et enregistre l'historique complet.
 */

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: [
    'DELIVERED',
    'CUSTOMER_ABSENT',
    'WRONG_ADDRESS',
    'CUSTOMER_REFUSED',
    'RESCHEDULED',
  ],
  CUSTOMER_ABSENT: ['RESCHEDULED', 'RETURNED'],
  WRONG_ADDRESS: ['RESCHEDULED', 'RETURNED'],
  CUSTOMER_REFUSED: ['RETURNED'],
  RESCHEDULED: ['OUT_FOR_DELIVERY', 'RETURNED'],
  DELIVERED: [], // état terminal
  RETURNED: [], // état terminal
  CANCELLED: [], // état terminal
};

export class InvalidTransitionError extends Error {
  statusCode = 409;
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Transition invalide : impossible de passer de "${from}" à "${to}".`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertValidTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/**
 * États considérés comme "échec de livraison" — utilisés pour les stats
 * de performance livreur et le scoring de prédiction d'échec (section 22 du plan).
 */
export const FAILURE_STATUSES: OrderStatus[] = [
  'CUSTOMER_ABSENT',
  'WRONG_ADDRESS',
  'CUSTOMER_REFUSED',
];

export const TERMINAL_STATUSES: OrderStatus[] = ['DELIVERED', 'RETURNED', 'CANCELLED'];

/**
 * Événements domaine déclenchés à chaque transition — consommés par
 * le moteur de notifications, le ledger financier, et les analytics.
 * (Architecture événementielle — section 21 du plan.)
 */
export function getDomainEventsForTransition(to: OrderStatus): string[] {
  const eventMap: Partial<Record<OrderStatus, string[]>> = {
    CONFIRMED: ['ORDER_CONFIRMED'],
    ASSIGNED: ['DRIVER_ASSIGNED'],
    PICKED_UP: ['PICKUP_COMPLETED'],
    OUT_FOR_DELIVERY: ['OUT_FOR_DELIVERY', 'NOTIFY_CUSTOMER'],
    DELIVERED: [
      'ORDER_DELIVERED',
      'NOTIFY_CUSTOMER',
      'UPDATE_SUPPLIER_STATS',
      'CALCULATE_COMMISSION',
      'UPDATE_DRIVER_BALANCE',
      'CREATE_FINANCIAL_TRANSACTION',
      'UPDATE_ANALYTICS',
    ],
    CUSTOMER_ABSENT: ['FAILED_DELIVERY', 'NOTIFY_CUSTOMER'],
    WRONG_ADDRESS: ['FAILED_DELIVERY', 'NOTIFY_SUPPLIER'],
    CUSTOMER_REFUSED: ['FAILED_DELIVERY'],
    RETURNED: ['ORDER_RETURNED', 'NOTIFY_SUPPLIER', 'REVERSE_COMMISSION', 'COMPENSATE_DRIVER_FAILED_ATTEMPT'],
    CANCELLED: ['ORDER_CANCELLED', 'NOTIFY_SUPPLIER'],
  };
  return eventMap[to] ?? [];
}
