/**
 * Modèle RBAC — LogiFlow
 * Chaque rôle est associé à un ensemble explicite de permissions.
 * Aucune permission implicite : tout accès non listé est refusé par défaut.
 */

export enum Permission {
  // Utilisateurs & administration
  USERS_MANAGE = 'users:manage',
  SETTINGS_MANAGE = 'settings:manage',
  AUDIT_VIEW = 'audit:view',

  // Fournisseurs
  SUPPLIERS_MANAGE = 'suppliers:manage',
  SUPPLIERS_VIEW_OWN = 'suppliers:view_own',

  // Catalogue produits
  PRODUCTS_MANAGE_OWN = 'products:manage_own',

  // Commandes
  ORDERS_CREATE = 'orders:create',
  ORDERS_VIEW_ALL = 'orders:view_all',
  ORDERS_VIEW_OWN = 'orders:view_own',
  ORDERS_UPDATE_STATUS = 'orders:update_status',
  ORDERS_CANCEL = 'orders:cancel',

  // Dispatch & livreurs
  DISPATCH_MANAGE = 'dispatch:manage',
  DRIVERS_MANAGE = 'drivers:manage',
  DRIVERS_VIEW_OWN = 'drivers:view_own',
  DELIVERIES_UPDATE_STATUS = 'deliveries:update_status',

  // Finance
  PAYMENTS_MANAGE = 'payments:manage',
  COMMISSIONS_MANAGE = 'commissions:manage',
  SETTLEMENTS_MANAGE = 'settlements:manage',
  FINANCE_VIEW_OWN = 'finance:view_own',

  // Support
  SUPPORT_MANAGE = 'support:manage',

  // Tracking public (client)
  TRACKING_VIEW_OWN = 'tracking:view_own',

  // Analytics
  ANALYTICS_VIEW = 'analytics:view',

  // Control Tower — exceptions & alertes SLA
  EXCEPTIONS_MANAGE = 'exceptions:manage',

  // Promotions — codes de réduction
  PROMOTIONS_MANAGE = 'promotions:manage',
}

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SUPER_ADMIN: Object.values(Permission), // accès complet

  LOGISTICS_MANAGER: [
    Permission.ORDERS_VIEW_ALL,
    Permission.ORDERS_UPDATE_STATUS,
    Permission.DISPATCH_MANAGE,
    Permission.DRIVERS_MANAGE,
    Permission.SUPPLIERS_MANAGE, // inclut l'approbation d'inscription — même écran Control Tower que les livreurs
    Permission.DELIVERIES_UPDATE_STATUS,
    Permission.AUDIT_VIEW,
    Permission.ANALYTICS_VIEW,
    Permission.EXCEPTIONS_MANAGE,
    Permission.PROMOTIONS_MANAGE,
  ],

  FINANCE_MANAGER: [
    Permission.PAYMENTS_MANAGE,
    Permission.COMMISSIONS_MANAGE,
    Permission.SETTLEMENTS_MANAGE,
    Permission.ORDERS_VIEW_ALL,
    Permission.AUDIT_VIEW,
    Permission.ANALYTICS_VIEW,
  ],

  SUPPORT_AGENT: [
    Permission.SUPPORT_MANAGE,
    Permission.ORDERS_VIEW_ALL,
  ],

  SUPPLIER: [
    Permission.SUPPLIERS_VIEW_OWN,
    Permission.PRODUCTS_MANAGE_OWN,
    Permission.ORDERS_CREATE,
    Permission.ORDERS_VIEW_OWN,
    Permission.ORDERS_CANCEL,
    Permission.FINANCE_VIEW_OWN,
    // Pas ANALYTICS_VIEW ici volontairement : ce serait un accès en bloc à
    // TOUS les fournisseurs. requireSupplierAccess() vérifie déjà la
    // propriété pour SUPPLIER via son propre chemin (voir auth-context.ts).
  ],

  DRIVER: [
    Permission.DRIVERS_VIEW_OWN,
    Permission.DELIVERIES_UPDATE_STATUS,
  ],

  CUSTOMER: [
    Permission.TRACKING_VIEW_OWN,
  ],
};

export function hasPermission(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function assertPermission(role: string, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new ForbiddenError(
      `Le rôle "${role}" ne dispose pas de la permission "${permission}".`
    );
  }
}

export class ForbiddenError extends Error {
  statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}
