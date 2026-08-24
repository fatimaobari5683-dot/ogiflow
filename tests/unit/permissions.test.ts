import { describe, it, expect } from 'vitest';
import { Permission, ROLE_PERMISSIONS, hasPermission, assertPermission, ForbiddenError } from '@/shared/constants/permissions';

const ALL_ROLES = Object.keys(ROLE_PERMISSIONS);
const ALL_PERMISSIONS = Object.values(Permission);

describe('permissions — refus par défaut', () => {
  it("un rôle inconnu n'a aucune permission", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(hasPermission('ROLE_QUI_NEXISTE_PAS', permission)).toBe(false);
    }
  });

  it('SUPER_ADMIN a accès à absolument toutes les permissions déclarées', () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(hasPermission('SUPER_ADMIN', permission)).toBe(true);
    }
  });

  it('assertPermission lève ForbiddenError (403) quand refusé, ne lève rien quand accordé', () => {
    expect(() => assertPermission('CUSTOMER', Permission.SETTLEMENTS_MANAGE)).toThrow(ForbiddenError);
    expect(() => assertPermission('SUPER_ADMIN', Permission.SETTLEMENTS_MANAGE)).not.toThrow();
  });
});

describe('permissions — isolation critique entre rôles métier', () => {
  // Ces trois assertions codifient les corrections de sécurité faites cette
  // session (voir requireSupplierAccess / requireDriverAccess) : un rôle
  // "self-service" ne doit JAMAIS recevoir la permission globale équivalente,
  // sous peine de contourner la vérification de propriété (IDOR).
  it('SUPPLIER n\'a pas ANALYTICS_VIEW (accès en bloc à tous les fournisseurs)', () => {
    expect(hasPermission('SUPPLIER', Permission.ANALYTICS_VIEW)).toBe(false);
  });

  it("SUPPLIER n'a pas SETTLEMENTS_MANAGE (verrait les versements de tous les fournisseurs)", () => {
    expect(hasPermission('SUPPLIER', Permission.SETTLEMENTS_MANAGE)).toBe(false);
  });

  it("DRIVER n'a pas DRIVERS_MANAGE (verrait/modifierait tous les livreurs)", () => {
    expect(hasPermission('DRIVER', Permission.DRIVERS_MANAGE)).toBe(false);
  });

  it("CUSTOMER n'a aucune permission d'écriture opérationnelle", () => {
    const writePermissions = [
      Permission.ORDERS_CREATE,
      Permission.ORDERS_UPDATE_STATUS,
      Permission.DISPATCH_MANAGE,
      Permission.PAYMENTS_MANAGE,
      Permission.DRIVERS_MANAGE,
    ];
    for (const permission of writePermissions) {
      expect(hasPermission('CUSTOMER', permission)).toBe(false);
    }
  });
});

describe('permissions — cohérence de la table de rôles', () => {
  it('chaque rôle métier (hors SUPER_ADMIN) a au moins une permission', () => {
    for (const role of ALL_ROLES) {
      if (role === 'SUPER_ADMIN') continue;
      expect(ROLE_PERMISSIONS[role]!.length, `${role} n'a aucune permission — probablement un oubli`).toBeGreaterThan(0);
    }
  });

  it("aucune permission dupliquée au sein d'un même rôle", () => {
    for (const role of ALL_ROLES) {
      const perms = ROLE_PERMISSIONS[role]!;
      expect(new Set(perms).size).toBe(perms.length);
    }
  });
});
