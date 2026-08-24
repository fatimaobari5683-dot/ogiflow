/**
 * Basemap raster CARTO "Positron" (gratuit, sans clé API, https://github.com/
 * CartoDB/basemap-styles). Un style raster plutôt que le style vectoriel GL
 * officiel : simple composition d'images, pas de pipeline de rendu
 * polygones/glyphes — plus robuste dans un contexte WebGL logiciel/restreint
 * (constaté : le style vectoriel chargeait ses métadonnées avec succès mais
 * ne peignait jamais les tuiles dans ce type d'environnement).
 */
export const CARTO_RASTER_STYLE = {
  version: 8 as const,
  sources: {
    carto: {
      type: 'raster' as const,
      tiles: [
        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      ],
      tileSize: 256,
      attribution: '© <a href="https://carto.com/attributions">CARTO</a>, © OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'carto-light', type: 'raster' as const, source: 'carto', minzoom: 0, maxzoom: 20 }],
};
