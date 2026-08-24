/**
 * Espace d'accueil par rôle — source unique de vérité utilisée par la racine
 * `/` et par la connexion. Un rôle sans espace dédié (fournisseur, client)
 * retombe sur `/login` en attendant son portail.
 */
export function getHomePathForRole(role: string): string {
  switch (role) {
    case 'SUPER_ADMIN':
    case 'LOGISTICS_MANAGER':
    case 'FINANCE_MANAGER':
      return '/dashboard';
    case 'DRIVER':
      return '/missions';
    case 'SUPPLIER':
      return '/supplier';
    default:
      return '/login';
  }
}
