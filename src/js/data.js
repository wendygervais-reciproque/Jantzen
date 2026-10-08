/**
 * data.js - Adapté au standard GeoJSON / Leaflet
 * Chargement asynchrone des données et gestion des arrondissements et filtres.
 */

const DATA_BASE  = '/public/data';
const PHOTO_BASE = `${DATA_BASE}/photos_jpg`; // image HD
const THUMB_PHOTO_BASE  = `${DATA_BASE}/thumb_photos_jpg` ; // image vignette (thumb)

const PHOTO_BASE_WEBP = `${DATA_BASE}/photos_webp`;
const THUMB_PHOTO_BASE_WEBP  = `${DATA_BASE}/photos_webp`;

const PHOTO_BASE_AVIF = `${DATA_BASE}/photos_avif`;
const THUMB_PHOTO_BASE_AVIF  = `${DATA_BASE}/photos_avif`;


let THESAURUS             = [];   // index allégé : [{t: terme, c: cluster, u: URL, s: source}]
let RAW_GEOJSON           = null; // FeatureCollection complète
let ALL_FEATURES          = [];   // features[] — source de vérité pour les filtres
let ARR_POLYGONS          = null; // FeatureCollection des 20 arrondissements (tracés officiels)
let PERSONNES_FILTRE_DATA = [];   // Liste des architectes [{ id_archi, libelle }]
let PERIODES_FILTRE_DATA = [];
let ARCHI_TERMS           = [];   // Index pour le filtre à facettes des architectes
let PHOTO_RANGE           = [1, 104];     // nb de photos min/max par bâtiment
let PERIODE_TERMS          = [];

/* ─── ARRONDISSEMENTS PARISIENS (WGS-84) ─────────────────── */
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
    const [thesaurusData, geojsonData, arrData, personnesFiltreData, periodesFiltreData] = await Promise.all([
      fetch(`${DATA_BASE}/thesaurus_index.json`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${DATA_BASE}/map_poi.geojson`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} : Impossible de charger ${DATA_BASE}/map_poi.geojson`);
        return r.json();
      }),
      fetch(`${DATA_BASE}/arrondissements.geojson`).then(r => r.ok ? r.json() : null).catch(() => null),
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

    }

    // Construction du filtre des architectes
    if (typeof buildArchitectesFilter === 'function') {
      buildArchitectesFilter(PERSONNES_FILTRE_DATA);
    }

    // Construction du filtre à facettes des périodes
    if (typeof buildPeriodesFilter === 'function') {
      buildPeriodesFilter(PERIODES_FILTRE_DATA);
    }

    console.log(`${ALL_FEATURES.length} bâtiments, ${PERSONNES_FILTRE_DATA.length} architectes et ${PERIODES_FILTRE_DATA.length} périodes chargées.`);

  } catch (err) {
    console.error("❌ Erreur lors du chargement des données :", err);
  }
}

/* ─── UTILITAIRES DE NORMALISATION ET TEXTE ─────────────────────────────── */

function normalizeTerm(term) {
  return String(term || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['’\-\s]+/g, ' ')
    .trim();
}

function normalizeText(text) {
  return normalizeTerm(text);
}

function buildingTermKeys(props) {
  const jantzen = Array.isArray(props?.terme_jantzen_bat) ? props.terme_jantzen_bat : [];
  const torneh  = Array.isArray(props?.terme_torneh_bat)  ? props.terme_torneh_bat  : [];
  return new Set([...jantzen, ...torneh].map(normalizeTerm).filter(Boolean));
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

// --- Détection du support (AVIF/WEBP) ---
function testImageSupport(dataUri) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => resolve(img.width > 0 && img.height > 0);
    img.onerror = () => resolve(false);
    img.src = dataUri;
  });
}

const AVIF_TEST = 'public/data/photos_avif/Abbaye-2_6_§1.avif';
const WEBP_TEST = 'public/data/photos_webp/Abbaye-2_6_§1.webp';

async function detectImageFormat() {
  const cached = localStorage.getItem('imgFormat');
  if (cached) {
    console.log('[format] depuis le cache :', cached);
    return cached;
  }

  let format = 'webp';
  if (await testImageSupport(AVIF_TEST)) format = 'avif';
  else if (await testImageSupport(WEBP_TEST)) format = 'webp';
  console.log('[format] détecté :', format);

  localStorage.setItem('imgFormat', format);
  return format;
}

let IMG_FORMAT = 'webp';
const imgFormatReady = detectImageFormat().then((f) => { IMG_FORMAT = f; });

function buildUrl(name, bases, ext) {
  return `${bases[ext]}/${encodeURIComponent(name.normalize(ext === 'webp' ? 'NFC' : 'NFD'))}.${ext}`;

  // DEBUG JPG ; A ENLEVER LORS DE REBASCULE AVIF/WEBP
  // let text = `/public/data/photos_webp/${encodeURIComponent(name.normalize('NFD'))}.jpg`;
  // return text;
}

function photoUrl(idPic, format = IMG_FORMAT) {
  return photoUrls(idPic, format)[0] || null;
}

function thumbUrl(idPic, format = IMG_FORMAT) {
  return thumbUrls(idPic, format)[0] || null;
}

/* Les noms de fichiers accentués du serveur mélangent les deux formes Unicode
   (« ç » composé NFC, ou « c » + cédille NFD), y compris au sein d'un même
   format : on ne peut donc pas déduire la forme du format. Ces fonctions
   renvoient les URL candidates, dans l'ordre d'essai : format préféré puis
   l'autre, chacun dans sa forme habituelle puis dans l'autre forme. */
function imageUrlCandidates(idPic, bases, format) {
  if (!idPic || typeof idPic !== 'string') return [];
  const name    = idPic.replace(/^image_/, '');
  const formats = format === 'avif' ? ['avif', 'webp'] : ['webp', 'avif'];
  const urls = [];
  formats.forEach(ext => {
    const first = buildUrl(name, bases, ext);
    const other = `${bases[ext]}/${encodeURIComponent(name.normalize(ext === 'webp' ? 'NFD' : 'NFC'))}.${ext}`;
    urls.push(first);
    if (other !== first) urls.push(other);
  });
  return urls;
}

function photoUrls(idPic, format = IMG_FORMAT) {
  return imageUrlCandidates(idPic, { avif: PHOTO_BASE_AVIF, webp: PHOTO_BASE_WEBP }, format);
}

function thumbUrls(idPic, format = IMG_FORMAT) {
  return imageUrlCandidates(idPic, { avif: THUMB_PHOTO_BASE_AVIF, webp: THUMB_PHOTO_BASE_WEBP }, format);
}

/** Charge la première URL qui répond parmi `urls` ; `onFail` n'est appelé
 *  qu'une fois toutes les candidates épuisées. N'affecte que cette image. */
function setImageSources(img, urls, onFail) {
  const queue = (urls || []).filter(Boolean);
  img.onerror = function () {
    if (queue.length) { this.src = queue.shift(); return; }
    this.onerror = null;
    this.classList.add('img-broken');
    console.warn('[img] image introuvable :', urls[0]);
    onFail?.();
  };
  if (queue.length) img.src = queue.shift();
  else img.onerror();
}

/* ─── DIMENSIONS DES PHOTOS ────── */
// photos.json n'est chargé qu'une fois, à la première galerie ouverte : il fournit les dimensions natives, 
// ce qui permet de disposer les photos en rangées justifiées avant que les images ne soient chargées.
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

function photoRatioKey(name) {
  return String(name || '')
    .replace(/^image_/, '')
    .replace(/\.[^.]+$/, '')
    .toLowerCase();
}

/* ─── PAGES BÂTIMENT ────────────────────────────── */

const batimentCache = new Map();   // id_bat -> Promise<fiche>

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
      batimentCache.delete(key); 
      throw err;
    }));
  }
  return batimentCache.get(key);
}

/* ─── FICHES PERSONNE (chargement mutualisé) ───────────────── */

const personneCache = new Map();   // id_archi -> Promise<fiche>

function getPersonne(id_archi) {
  const key = String(id_archi);
  if (!personneCache.has(key)) {
    personneCache.set(key, fetch(`${DATA_BASE}/personnes/id_archi_${key}.json`)
      .then(r => {
        if (!r.ok) throw new Error(`Fiche de la personne ${key} introuvable`);
        return r.json();
      })
      .catch(err => {
        personneCache.delete(key);
        throw err;
      }));
  }
  return personneCache.get(key);
}

const WIKIMEDIA_COMMONS = 'https://upload.wikimedia.org/wikipedia/commons';

function personneLocalThumbUrl(media) {
  if (!media) return null;

  // Décode les caractères encodés (ex  %20 = espace)
  const decodedFilename = decodeURIComponent(media);

  // Construit le chemin local
  return `/public/data/thumb_personnes_jpg/${decodedFilename}`;
}

function getThesaurusName(id) {
  return id;
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