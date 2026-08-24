/**
 * Distance orthodromique (haversine) entre deux points GPS, en kilomètres.
 * Utilisée par le moteur de dispatch pour estimer la proximité livreur/commande
 * sans dépendre d'un service de cartographie externe (voir dispatch.service.ts).
 */
export function haversineDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const EARTH_RADIUS_KM = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Ordonne une liste d'arrêts par plus proche voisin successif à partir
 * d'une position de départ — heuristique gloutonne, pas une résolution
 * exacte du voyageur de commerce : un livreur porte au plus une poignée de
 * livraisons actives à la fois (voir MAX_CONCURRENT_DELIVERIES,
 * dispatch.service.ts), le gain d'un vrai solveur TSP y serait invisible.
 * Les points sans coordonnées connues restent à la fin, dans leur ordre
 * d'origine — mieux vaut un ordre partiellement optimisé qu'un arrêt exclu.
 */
export function sequenceByNearestNeighbor<T>(
  start: { lat: number; lng: number } | null,
  items: T[],
  getPoint: (item: T) => { lat: number; lng: number } | null
): T[] {
  const withCoords: { item: T; point: { lat: number; lng: number } }[] = [];
  const withoutCoords: T[] = [];
  for (const item of items) {
    const point = getPoint(item);
    if (point) withCoords.push({ item, point });
    else withoutCoords.push(item);
  }

  if (!start || withCoords.length === 0) {
    return [...withCoords.map((w) => w.item), ...withoutCoords];
  }

  const remaining = [...withCoords];
  const ordered: T[] = [];
  let currentPos = start;
  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    remaining.forEach((candidate, index) => {
      const distance = haversineDistanceKm(currentPos, candidate.point);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    const [next] = remaining.splice(nearestIndex, 1);
    ordered.push(next!.item);
    currentPos = next!.point;
  }

  return [...ordered, ...withoutCoords];
}
