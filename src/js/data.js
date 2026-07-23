/**
 * data.js - Adapté au standard GeoJSON / Leaflet
 * Chargement asynchrone des données et gestion des arrondissements.
 */

// 💡 Si tes fichiers sont servis depuis public/data/ ou data/, ajuste ici si besoin
const DATA_BASE = 'public/data';

let THESAURUS    = [];   // [{id, nom}, ...] ou liste simple
let RAW_GEOJSON  = null; // FeatureCollection complète
let ALL_FEATURES = [];   // features[] — source de vérité pour les filtres
let ARR_POLYGONS = null; // FeatureCollection des 20 arrondissements (tracés officiels)

/* ─── CENTROÏDES DES ARRONDISSEMENTS PARISIENS (WGS-84) ─────────────────── */
const ARR_CENTROIDS = [
  { arr:  1, lat: 48.8609, lng: 2.3477 }, { arr:  2, lat: 48.8672, lng: 2.3474 },
  { arr:  3, lat: 48.8639, lng: 2.3616 }, { arr:  4, lat: 48.8542, lng: 2.3527 },
  { arr:  5, lat: 48.8512, lng: 2.3497 }, { arr:  6, lat: 48.8498, lng: 2.3325 },
  { arr:  7, lat: 48.8585, lng: 2.3060 }, { arr:  8, lat: 48.8744, lng: 2.3083 },
  { arr:  9, lat: 48.8767, lng: 2.3394 }, { arr: 10, lat: 48.8762, lng: 2.3606 },
  { arr: 11, lat: 48.8594, lng: 2.3791 }, { arr: 12, lat: 48.8414, lng: 2.3854 },
  { arr: 13, lat: 48.8295, lng: 2.3603 }, { arr: 14, lat: 48.8335, lng: 2.3262 },
  { arr: 15, lat: 48.8416, lng: 2.2979 }, { arr: 16, lat: 48.8637, lng: 2.2696 },
  { arr: 17, lat: 48.8862, lng: 2.3119 }, { arr: 18, lat: 48.8919, lng: 2.3533 },
  { arr: 19, lat: 48.8822, lng: 2.3818 }, { arr: 20, lat: 48.8646, lng: 2.3982 }
];

function getNearestArrondissement(lat, lng) {
  let minDist = Infinity;
  let nearest = 0;
  ARR_CENTROIDS.forEach(c => {
    const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
    if (d < minDist) { minDist = d; nearest = c.arr; }
  });
  return nearest;
}

/* ─── POINT-DANS-POLYGONE (ray casting) ────────────────────────────────── */

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
                      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lng, lat, geom) {
  const test = rings => {
    let c = false;
    rings.forEach(ring => { if (pointInRing(lng, lat, ring)) c = !c; });
    return c;
  };
  if (geom.type === 'Polygon')      return test(geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some(test);
  return false;
}

function assignArrondissement(lng, lat) {
  if (ARR_POLYGONS && ARR_POLYGONS.features) {
    for (const f of ARR_POLYGONS.features) {
      if (pointInGeometry(lng, lat, f.geometry)) return f.properties.c_ar;
    }
  }
  return getNearestArrondissement(lat, lng);
}

/* ─── CHARGEMENT DES DONNÉES ────────────────────────────────────────────── */

async function loadData() {
  try {
    const [thesaurusData, geojsonData, arrData] = await Promise.all([
      fetch(`${DATA_BASE}/theseaurus_torneh.json`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${DATA_BASE}/map_poi.geojson`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} : Impossible de charger ${DATA_BASE}/map_poi.geojson`);
        return r.json();
      }),
      fetch(`${DATA_BASE}/arrondissements.geojson`).then(r => r.ok ? r.json() : null).catch(() => null)
    ]);

    THESAURUS    = thesaurusData;
    RAW_GEOJSON  = geojsonData;
    ARR_POLYGONS = arrData;

    if (geojsonData && Array.isArray(geojsonData.features)) {
      geojsonData.features.forEach(f => {
        // Standard GeoJSON strict : geometry.coordinates -> [lng, lat]
        if (f.geometry && Array.isArray(f.geometry.coordinates)) {
          const [lng, lat] = f.geometry.coordinates;

          // Si l'arrondissement est absent, on le calcule
          if (!f.properties.arrondissement) {
            f.properties.arrondissement = assignArrondissement(lng, lat);
          } else {
            f.properties.arrondissement = Number(f.properties.arrondissement);
          }
        }
      });

      // Filtrage de sécurité : on ne conserve que les points valides
      ALL_FEATURES = geojsonData.features.filter(f => 
        f.geometry && 
        Array.isArray(f.geometry.coordinates) && 
        !isNaN(f.geometry.coordinates[0]) && 
        !isNaN(f.geometry.coordinates[1])
      );
    }

    console.log(`🎉 SUCCÈS ! ${ALL_FEATURES.length} bâtiments valides chargés dans la carte.`);

  } catch (err) {
    console.error("❌ Erreur lors du chargement des données :", err);
  }
}

/* ─── UTILITAIRES ───────────────────────────────────────────────────────── */

function getThesaurusName(id) {
  if (!THESAURUS || !Array.isArray(THESAURUS)) return id;
  const term = THESAURUS.find(t => t.id === id || t.nom === id);
  return term ? term.nom : id;
}