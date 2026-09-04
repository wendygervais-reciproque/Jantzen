/**
 * data.js - Adapté au standard GeoJSON / Leaflet
 * Chargement asynchrone des données et gestion des arrondissements et filtres.
 */

// 💡 Ajustez le chemin de vos données si besoin
const DATA_BASE  = '/public/data';
const PHOTO_BASE = `${DATA_BASE}/photos_jpg`; // image HD
const THUMB_PHOTO_BASE  = `${DATA_BASE}/thumb_photos_jpg` ; // image vignette (thumb)

let THESAURUS             = [];   // index allégé : [{t: terme, c: cluster, u: URL, s: source}]
let RAW_GEOJSON           = null; // FeatureCollection complète
let ALL_FEATURES          = [];   // features[] — source de vérité pour les filtres
let ARR_POLYGONS          = null; // FeatureCollection des 20 arrondissements (tracés officiels)
let PERSONNES_FILTRE_DATA = [];   // NOUVEAU : Liste des architectes [{ id_archi, libelle }]
let ARCHI_TERMS           = [];   // Index pour le filtre à facettes des architectes
let PHOTO_RANGE           = [1, 104];     // nb de photos min/max par bâtiment
let PERIODE_TERMS          = [];

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

/* --- Dans la fonction loadData() de data.js --- */
async function loadData() {
  try {
    const [thesaurusData, geojsonData, arrData, datesData, personnesFiltreData, periodesFiltreData] = await Promise.all([
      fetch(`${DATA_BASE}/thesaurus_index.json`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${DATA_BASE}/map_poi.geojson`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} : Impossible de charger ${DATA_BASE}/map_poi.geojson`);
        return r.json();
      }),
      fetch(`${DATA_BASE}/arrondissements.geojson`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${DATA_BASE}/batiments_index.json`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch(`${DATA_BASE}/personnes_filtre.json`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${DATA_BASE}/periode_filtre.json`).then(r => r.ok ? r.json() : []).catch(() => [])
    ]);

    THESAURUS             = thesaurusData;
    RAW_GEOJSON           = geojsonData;
    ARR_POLYGONS          = arrData;
    PERSONNES_FILTRE_DATA = personnesFiltreData;
    PERIODES_FILTRE_DATA  = periodesFiltreData;

    if (geojsonData && Array.isArray(geojsonData.features)) {
      geojsonData.features.forEach(f => {
        if (f.geometry && Array.isArray(f.geometry.coordinates)) {
          const [lng, lat] = f.geometry.coordinates;

          if (!f.properties.arrondissement) {
            f.properties.arrondissement = assignArrondissement(lng, lat);
          } else {
            f.properties.arrondissement = Number(f.properties.arrondissement);
          }
        }
      });

      ALL_FEATURES = geojsonData.features.filter(f =>
        f.geometry &&
        Array.isArray(f.geometry.coordinates) &&
        !isNaN(f.geometry.coordinates[0]) &&
        !isNaN(f.geometry.coordinates[1])
      );

      attachBuildingIndex(datesData);
    }

    // Construction du filtre des architectes
    if (typeof buildArchitectesFilter === 'function') {
      buildArchitectesFilter(PERSONNES_FILTRE_DATA);
    }

    // NOUVEAU : Construction du filtre à facettes des périodes
    if (typeof buildPeriodesFilter === 'function') {
      buildPeriodesFilter(PERIODES_FILTRE_DATA);
    }

    console.log(`🎉 SUCCÈS ! ${ALL_FEATURES.length} bâtiments valides, ${PERSONNES_FILTRE_DATA.length} architectes et ${PERIODES_FILTRE_DATA.length} périodes chargées.`);

  } catch (err) {
    console.error("❌ Erreur lors du chargement des données :", err);
  }
}

/* ─── UTILITAIRES DE NORMALISATION ET TEXTE ─────────────────────────────── */

/** Clé de rapprochement tolérante : casse, accents, traits d'union, apostrophes. */
function normalizeTerm(term) {
  return String(term || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['’\-\s]+/g, ' ')
    .trim();
}

/** Alias pour normalizeTerm afin de garantir la compatibilité avec app.js et filters.js */
function normalizeText(text) {
  return normalizeTerm(text);
}

/** Première lettre en capitale. */
function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function photoUrl(idPic) {
  if (!idPic || typeof idPic !== 'string') return null;
  const name = idPic.replace(/^image_/, '');
  return `${PHOTO_BASE}/${encodeURIComponent(name)}.jpg`;
}

function thumbUrl(idPic) {
  if (!idPic || typeof idPic !== 'string') return null;
  const name = idPic.replace(/^image_/, '');
  //const name = "test-thumb"
  return `${THUMB_PHOTO_BASE}/${encodeURIComponent(name)}.jpg`;
}

/* ─── DIMENSIONS DES PHOTOGRAPHIES (ratios pour la mosaïque justifiée) ────── */

// photos.json (~1 574 entrées) n'est chargé qu'une fois, à la première galerie
// ouverte : il fournit les dimensions natives, ce qui permet de disposer les
// photos en rangées justifiées AVANT même que les images ne soient chargées.
let photoRatiosPromise = null;

function loadPhotoRatios() {
  if (!photoRatiosPromise) {
    photoRatiosPromise = fetch(`${DATA_BASE}/photos.json`)
      .then(r => r.ok ? r.json() : [])
      .then(list => {
        const map = new Map();
        (Array.isArray(list) ? list : []).forEach(p => {
          const d = p && p.dimensions;
          if (!p || !p.fichier || !d || !d.largeur || !d.hauteur) return;
          map.set(photoRatioKey(p.fichier), d.largeur / d.hauteur);
        });
        return map;
      })
      .catch(() => new Map());
  }
  return photoRatiosPromise;
}

/** Clé de rapprochement id_pic ↔ fichier : sans extension, insensible à la casse. */
function photoRatioKey(name) {
  return String(name || '')
    .replace(/^image_/, '')
    .replace(/\.[^.]+$/, '')
    .toLowerCase();
}

/* ─── FICHES BÂTIMENT (chargement mutualisé) ────────────────────────────── */

const batimentCache = new Map();   // id_bat → Promise<fiche>

function getBatiment(id_bat) {
  const key = String(id_bat);
  if (!batimentCache.has(key)) {
    batimentCache.set(key, (async () => {
      for (const name of [`id_bat_${key}`, `id_bat_${key}`]) {
        const res = await fetch(`${DATA_BASE}/batiments/${name}.json`);
        if (res.ok) return res.json();
      }
      throw new Error(`Fiche du bâtiment ${key} introuvable`);
    })().catch(err => {
      batimentCache.delete(key);   // un échec ne doit pas être mémorisé
      throw err;
    }));
  }
  return batimentCache.get(key);
}

/* ─── FICHES PERSONNE (architectes, chargement mutualisé) ───────────────── */

const personneCache = new Map();   // id_archi → Promise<fiche>

function getPersonne(id_archi) {
  const key = String(id_archi);
  if (!personneCache.has(key)) {
    personneCache.set(key, fetch(`${DATA_BASE}/personnes/id_archi_${key}.json`)
      .then(r => {
        if (!r.ok) throw new Error(`Fiche de la personne ${key} introuvable`);
        return r.json();
      })
      .catch(err => {
        personneCache.delete(key);   // un échec ne doit pas être mémorisé
        throw err;
      }));
  }
  return personneCache.get(key);
}

const WIKIMEDIA_COMMONS = 'https://upload.wikimedia.org/wikipedia/commons';

/** Vignette (250px) d'une personne, à partir de sa propriété `thumb`. */
function personneThumbUrl(thumb) {
  return thumb ? `${WIKIMEDIA_COMMONS}/thumb/${thumb}` : null;
}

function personneFullImageUrl(thumb) {
  if (!thumb) return null;
  const parts = thumb.split('/').slice(1, 4);
  return parts.length === 3 ? `${WIKIMEDIA_COMMONS}/${parts.join('/')}` : null;
}

function personneLocalThumbUrl(media) {
  if (!media) return null;

  // Décode les caractères encodés (ex: %20 → espace)
  const decodedFilename = decodeURIComponent(media);

  // Construit le chemin local
  return `/public/data/thumb_jpg/${decodedFilename}`;
}

/** Bascule .jpg → .JPG sur une image dont le chargement a échoué. */
function retryUppercaseJpg(imgEl) {
  if (imgEl.src.endsWith('.JPG')) return false;
  imgEl.src = imgEl.src.replace(/\.jpg$/, '.JPG');
  return true;
}

function getThesaurusName(id) {
  return id;
}

/* ─── INDEX DES BÂTIMENTS (dates + volumétrie) ──────────────────────────── */

function attachBuildingIndex(indexData) {
  let minY = Infinity, maxY = -Infinity;
  let minN = Infinity, maxN = -Infinity;

  ALL_FEATURES.forEach(f => {
    const entry = indexData[String(f.properties.id_bat)];
    if (!entry) return;

    if (Array.isArray(entry.y)) {
      f.properties.annees = entry.y;
      if (entry.y[0] < minY) minY = entry.y[0];
      if (entry.y[1] > maxY) maxY = entry.y[1];
    }

    const n = Number(entry.n) || 0;
    f.properties.nbPhotos = n;
    if (n < minN) minN = n;
    if (n > maxN) maxN = n;
  });

  if (Number.isFinite(minY) && Number.isFinite(maxY)) DATE_RANGE  = [minY, maxY];
  if (Number.isFinite(minN) && Number.isFinite(maxN)) PHOTO_RANGE = [minN, maxN];
}

/** Un bâtiment est retenu si son intervalle de construction croise la période demandée. */
function matchesYearRange(properties, from, to) {
  const span = properties.annees;
  if (!span) return false;
  return span[0] <= to && span[1] >= from;
}

/* ─── THÉSAURUS ─────────────────────────────────────────────────────────── */

function getTermMeta(term) {
  const key = normalizeTerm(term);
  return THESAURUS.find(t => normalizeTerm(t.t) === key) || null;
}

let thesaurusFullPromise = null;

function loadThesaurusFull() {
  if (!thesaurusFullPromise) {
    thesaurusFullPromise = fetch(`${DATA_BASE}/thesaurus_jantzen.json`)
      .then(r => r.ok ? r.json() : [])
      .catch(() => []);
  }
  return thesaurusFullPromise;
}

const REFERENCE_LABELS = {
  'fr.wikipedia.org': 'Wikipédia',
  'data.culture.fr':  'Thésaurus du ministère de la Culture'
};

function referenceLabel(href) {
  try {
    const host = new URL(href).hostname;
    return REFERENCE_LABELS[host] || host;
  } catch {
    return 'la page de référence';
  }
}

async function getTermDefinition(term) {
  const key   = normalizeTerm(term);
  const full  = await loadThesaurusFull();
  const entry = full.find(t => normalizeTerm(t.Term_TMS) === key);
  if (!entry) return null;

  const split = value => String(value || '').split('|').map(s => s.trim()).filter(Boolean);

  return {
    terme:       entry.Term_TMS,
    definitions: split(entry.Definition_fr),
    references:  split(entry.URL).map(href => ({ href, label: referenceLabel(href) })),
    source:      entry.source || ''
  };
}