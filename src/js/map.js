/**
 * map.js - Version nettoyée pour GeoJSON standard Leaflet
 * Carte Leaflet à deux niveaux de lecture :
 *   • Vue ville (dézoomée)   : les 20 arrondissements tracés + nombre de bâtiments.
 *   • Vue bâtiments (zoomée) : clusters de points, révélés au zoom ou au clic.
 */

let map = null;
let clusterGroup = null;
let arrGeoLayer = null;   // L.geoJSON des tracés d'arrondissement
let arrLabelGroup = null; // L.layerGroup des étiquettes (numéro + compteur)
const markerMap = {};     // id_bat → marker Leaflet (vue bâtiments)

let currentFeatures = []; // features actuellement affichées (après filtres)
let currentMode = null;   // 'arr' | 'buildings'

const ARR_ZOOM_THRESHOLD = 14; // zoom < seuil → vue arrondissements
const MAX_ZOOM = 16;

/* ─── DIMENSIONNEMENT DES GRAPPES ───────────────────────────────────────── */

/*
 * ⚙️ RÉGLAGES — diamètre des grappes (clusters), en pixels.
 *
 * Une grappe de CLUSTER_COUNT_MIN objets prend CLUSTER_SIZE_MIN ; une grappe de
 * CLUSTER_COUNT_MAX objets ou plus prend CLUSTER_SIZE_MAX. Entre les deux, la
 * taille suit CLUSTER_SIZE_SCALE.
 *
 * CLUSTER_COUNT_MAX est calé sur la grappe la plus fournie du corpus, observée
 * à 252 objets en vue ville ; au-delà, le diamètre est plafonné.
 */
const CLUSTER_SIZE_MIN  = 32;
const CLUSTER_SIZE_MAX  = 64;
const CLUSTER_COUNT_MIN = 2;
const CLUSTER_COUNT_MAX = 260;

/*
 * Répartition entre les deux bornes de taille :
 *   'sqrt'   aire du disque proportionnelle au nombre d'objets — la lecture
 *            cartographique honnête, et la valeur par défaut ;
 *   'log'    écarte davantage les petites valeurs, si les grappes courantes
 *            paraissent toutes identiques ;
 *   'linear' proportionnel au diamètre — exagère fortement les grosses grappes.
 */
const CLUSTER_SIZE_SCALE = 'sqrt';

/** Diamètre en pixels d'une grappe de `count` objets. */
function clusterSize(count) {
  if (!(CLUSTER_COUNT_MAX > CLUSTER_COUNT_MIN)) return CLUSTER_SIZE_MAX;

  const value = Math.min(CLUSTER_COUNT_MAX, Math.max(CLUSTER_COUNT_MIN, Number(count) || CLUSTER_COUNT_MIN));
  let t;

  if (CLUSTER_SIZE_SCALE === 'linear') {
    t = (value - CLUSTER_COUNT_MIN) / (CLUSTER_COUNT_MAX - CLUSTER_COUNT_MIN);
  } else if (CLUSTER_SIZE_SCALE === 'log') {
    // log1p plutôt que log : reste défini si une borne descend à zéro.
    t = (Math.log1p(value) - Math.log1p(CLUSTER_COUNT_MIN)) /
        (Math.log1p(CLUSTER_COUNT_MAX) - Math.log1p(CLUSTER_COUNT_MIN));
  } else {
    t = (Math.sqrt(value) - Math.sqrt(CLUSTER_COUNT_MIN)) /
        (Math.sqrt(CLUSTER_COUNT_MAX) - Math.sqrt(CLUSTER_COUNT_MIN));
  }

  return Math.round(CLUSTER_SIZE_MIN + t * (CLUSTER_SIZE_MAX - CLUSTER_SIZE_MIN));
}

function buildClusterIcon(cluster) {
  const count = cluster.getChildCount();
  const size  = clusterSize(count);

  // Le corps de texte est fixé en CSS : seul le disque varie.
  return L.divIcon({
    className: 'cluster-marker',
    html: `<div class="cluster-dot" style="width:${size}px;height:${size}px">${count}</div>`,
    iconSize:   L.point(size, size),
    iconAnchor: L.point(size / 2, size / 2)
  });
}

function initMap() {
  map = L.map('map', { zoomControl: false, minZoom: 13, maxZoom: 20 })
    .setView([48.858, 2.342], 13);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  clusterGroup = L.markerClusterGroup({
    chunkedLoading: true,
    spiderfyOnMaxZoom: true,
    iconCreateFunction: buildClusterIcon,
    // Emprise affichée au survol : stylée en CSS pour rester sur les jetons
    // de couleur plutôt que sur des valeurs en dur.
    polygonOptions: { className: 'cluster-coverage' },
    maxClusterRadius: zoom => {
      if (zoom >= MAX_ZOOM) return 1;
      if (zoom <= 13) return 130;
      return 90;
    }
  });
  map.addLayer(clusterGroup);

  arrLabelGroup = L.layerGroup();

  // Bascule automatique arrondissements ↔ bâtiments au franchissement du seuil
  map.on('zoomend', () => applyMapMode(false));
}

/* ─── AIGUILLAGE DES MODES ──────────────────────────────────────────────── */

function renderMapFeatures(features) {
  currentFeatures = features;
  applyMapMode(true);
}

function applyMapMode(force) {
  const desired = map.getZoom() < ARR_ZOOM_THRESHOLD ? 'arr' : 'buildings';
  if (desired === currentMode && !force) return;
  currentMode = desired;
  if (desired === 'arr') showArrondissementView();
  else showBuildingView();
}

/* ─── VUE VILLE : ARRONDISSEMENTS ───────────────────────────────────────── */

function showArrondissementView() {
  clusterGroup.clearLayers();

  const counts = {};
  currentFeatures.forEach(f => {
    const a = Number(f.properties.arrondissement);
    if (a) counts[a] = (counts[a] || 0) + 1;
  });

  if (arrGeoLayer) { map.removeLayer(arrGeoLayer); arrGeoLayer = null; }
  arrLabelGroup.clearLayers();

  if (typeof ARR_POLYGONS === 'undefined' || !ARR_POLYGONS) return;

  arrGeoLayer = L.geoJSON(ARR_POLYGONS, {
    style: feature => ({
      className: counts[feature.properties.c_ar] ? 'arr-polygon' : 'arr-polygon empty'
    }),
    onEachFeature: (feature, layer) => {
      const c_ar = feature.properties.c_ar;
      const n = counts[c_ar] || 0;

      layer.on('click', () => map.fitBounds(layer.getBounds(), { padding: [30, 30] }));

      const g = feature.properties.geom_x_y;
      if (!g) return;
      const label = L.divIcon({
        className: '',
        html: `<div class="arr-label${n ? '' : ' empty'}">
                 <span class="arr-label-num">${ordinalArr(c_ar)}</span>
                 <span class="arr-label-count">${n} bât.</span>
               </div>`,
        iconSize: [0, 0]
      });
      L.marker([g.lat, g.lon], { icon: label, interactive: false })
        .addTo(arrLabelGroup);
    }
  }).addTo(map);

  arrLabelGroup.addTo(map);
}

function ordinalArr(n) { return n === 1 ? '1ᵉʳ' : `${n}ᵉ`; }

/* ─── VUE BÂTIMENTS : CLUSTERS DE POINTS ────────────────────────────────── */

function showBuildingView() {
  if (arrGeoLayer) { map.removeLayer(arrGeoLayer); arrGeoLayer = null; }
  if (map.hasLayer(arrLabelGroup)) map.removeLayer(arrLabelGroup);
  arrLabelGroup.clearLayers();

  clusterGroup.clearLayers();
  if (currentFeatures.length === 0) return;

  const layer = L.geoJSON(
    { type: 'FeatureCollection', features: currentFeatures },
    {
      // Standard Leaflet : conversion [lng, lat] -> L.LatLng(lat, lng)
      coordsToLatLng: coords => new L.LatLng(coords[1], coords[0]),

      pointToLayer: (feature, latlng) => {
        const p = feature.properties;
        const id_bat = p.id_bat;

        const icon = L.divIcon({
          className: '',
          html: `<div class="marker-poi" data-id="${id_bat}"></div>`,
          iconSize:    [22, 30],
          iconAnchor:  [11, 30],
          popupAnchor: [0, -28]
        });

        const marker = L.marker(latlng, { icon });
        markerMap[id_bat] = marker;

        let popup = `<div class="popup-inner">
          <div class="popup-name">${p.libelle || 'Bâtiment sans nom'}</div>`;

        if (p.ensemble) {
          popup += `<div class="popup-meta">${p.ensemble}</div>`;
        }

        if (p.terme_jantzen_bat && p.terme_jantzen_bat.length > 0) {
          popup += `<div class="popup-tags" style="font-size:0.8em; color:#666; margin-top:4px;">
                      ${p.terme_jantzen_bat.slice(0, 4).join(', ')}${p.terme_jantzen_bat.length > 4 ? '...' : ''}
                    </div>`;
        }

        popup += `<button class="popup-btn" style="margin-top:8px;" onclick="selectBatiment('${id_bat}')">Voir la fiche</button>
        </div>`;

        marker.bindPopup(popup, { maxWidth: 240, minWidth: 180 });
        marker.on('mouseover', function () { this.openPopup(); });
        marker.on('mouseout', function () { this.closePopup(); });
        marker.on('click', () => selectBatiment(id_bat));
        return marker;
      }
    }
  );

  clusterGroup.addLayer(layer);

  if (typeof selectedId !== 'undefined' && selectedId) {
    openMarkerPopup(selectedId);
  }
}

/* ─── NAVIGATION VERS UN BÂTIMENT ───────────────────────────────────────── */

function flyToFeature(id_bat) {
  // Conteneur non mesuré (carte masquée, fenêtre repliée) : on éviterait
  // des coordonnées NaN.
  if (!map || map.getSize().x === 0) return;

  const feature = ALL_FEATURES.find(f => String(f.properties.id_bat) === String(id_bat));
  if (!feature || !feature.geometry || !feature.geometry.coordinates) return;

  // Le marker n'existe dans clusterGroup que si la vue "bâtiments" a déjà
  // été construite au moins une fois (ex: chargement direct sur une URL
  // alors qu'on est encore dézoomé, en vue arrondissements).
  if (!markerMap[id_bat]) {
    showBuildingView();
    currentMode = 'buildings';
  }

  const marker = markerMap[id_bat];
  if (!marker) return; // sécurité : le bâtiment n'est pas dans currentFeatures (filtré ?)

clusterGroup.zoomToShowLayer(marker, () => {
  map.panTo(marker.getLatLng(), { animate: true });
  map.once('moveend', () => marker.openPopup());
});
}

function openMarkerPopup(id_bat) {
  markerMap[id_bat]?.openPopup();
}

function closeAllPopups() {
  map.closePopup();
}