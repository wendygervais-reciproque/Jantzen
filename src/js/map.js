
/**
 * map.js - Version nettoyée pour GeoJSON standard Leaflet
 * Carte Leaflet à deux niveaux de lecture :
 *   • Vue ville (dézoomée)   : les 20 arrondissements tracés + nombre de bâtiments
 *   • Vue bâtiments (zoomée) : clusters de points, révélés au zoom ou au clic
 */

let map = null;
let clusterGroup = null;
let arrGeoLayer = null;   // L.geoJSON des tracés d'arrondissement
let arrLabelGroup = null; // L.layerGroup des étiquettes (numéro + compteur)
let isInitialLoad = true;
const markerMap = {};     // id_bat -> marker Leaflet (vue bâtiments)

let currentFeatures = []; // features actuellement affichées (après filtres)
let currentMode = null;   // 'arr' | 'buildings'

const ARR_ZOOM_THRESHOLD = 14; // zoom < seuil -> vue arrondissements
const MAX_ZOOM = 19;

/* ─── CLUSTERS ───────────────────────────────────────── */


const CLUSTER_SIZE_MIN  = 32;
const CLUSTER_SIZE_MAX  = 64;
const CLUSTER_SIZE_MIN_MOBILE = 20;
const CLUSTER_SIZE_MAX_MOBILE = 40;
const CLUSTER_COUNT_MIN = 2;
const CLUSTER_COUNT_MAX = 260;

/*
 * Répartition entre les deux bornes de taille :
 *   'sqrt'   aire du disque proportionnelle au nombre d'objets — la lecture
 *            cartographique honnête, et la valeur par défaut ;
 *   'log'    écarte davantage les petites valeurs, si les clusters courantes
 *            paraissent toutes identiques ;
 *   'linear' proportionnel au diamètre — exagère fortement les grosses clusters.
 */
const CLUSTER_SIZE_SCALE = 'sqrt';

const ARR_NUM_W     = 34;
const ARR_LABEL_GAP = 12; // --component-gap-12

function clusterSize(count) {
  const mobile  = window.matchMedia('(max-width: 900px)').matches;
  const sizeMin = mobile ? CLUSTER_SIZE_MIN_MOBILE : CLUSTER_SIZE_MIN;
  const sizeMax = mobile ? CLUSTER_SIZE_MAX_MOBILE : CLUSTER_SIZE_MAX;

  if (!(CLUSTER_COUNT_MAX > CLUSTER_COUNT_MIN)) return sizeMax;

  const value = Math.min(CLUSTER_COUNT_MAX, Math.max(CLUSTER_COUNT_MIN, Number(count) || CLUSTER_COUNT_MIN));
  let t;

  if (CLUSTER_SIZE_SCALE === 'linear') {
    t = (value - CLUSTER_COUNT_MIN) / (CLUSTER_COUNT_MAX - CLUSTER_COUNT_MIN);
  } else if (CLUSTER_SIZE_SCALE === 'log') {
    t = (Math.log1p(value) - Math.log1p(CLUSTER_COUNT_MIN)) /
        (Math.log1p(CLUSTER_COUNT_MAX) - Math.log1p(CLUSTER_COUNT_MIN));
  } else {
    t = (Math.sqrt(value) - Math.sqrt(CLUSTER_COUNT_MIN)) /
        (Math.sqrt(CLUSTER_COUNT_MAX) - Math.sqrt(CLUSTER_COUNT_MIN));
  }

  return Math.round(sizeMin + t * (sizeMax - sizeMin));
}

function buildClusterIcon(cluster) {
  const count = cluster.getChildCount();
  const size  = clusterSize(count);

  return L.divIcon({
    className: 'cluster-marker',
    html: `<div class="cluster-dot" style="width:${size}px;height:${size}px" aria-label="${count} bâtiments, agrandir">${count}</div>`,
    iconSize:   L.point(size, size),
    iconAnchor: L.point(size / 2, size / 2)
  });
}

function elementLatLng(el) {
  const rect = el.getBoundingClientRect();
  const mapRect = map.getContainer().getBoundingClientRect();
  const containerPoint = L.point(
    rect.left + rect.width / 2 - mapRect.left,
    rect.top + rect.height / 2 - mapRect.top
  );
  return map.containerPointToLatLng(containerPoint);
}

function focusVisibleMapChild(latlng) {
  const bounds = map.getBounds();
  let best = null, bestDist = Infinity;
  document.querySelectorAll('.marker-poi, .cluster-marker, .arr-cluster-marker').forEach(el => {
    const ll = elementLatLng(el);
    if (!bounds.contains(ll)) return;
    const d = ll.distanceTo(latlng);
    if (d < bestDist) { bestDist = d; best = el; }
  });
  if (!best) return null;
  best.focus();
  return best;
}

function scheduleClusterFocusHandoff(latlng) {
  const deadline = Date.now() + 2000;
  const tick = () => {
    const active = document.activeElement;
    const stillOnMapChild = active?.matches?.('.marker-poi, .cluster-marker, .arr-cluster-marker')
      && document.body.contains(active);
    if (!stillOnMapChild) focusVisibleMapChild(latlng);
    if (Date.now() < deadline) setTimeout(tick, 150);
  };
  setTimeout(tick, 150);   // laisse la transition du clic s'amorcer avant le premier essai
}

function bindClusterKeyboard() {
  map.getContainer().addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = e.target.closest('.cluster-marker, .arr-cluster-marker');
    if (!target) return;
    e.preventDefault();   // Espace ne doit pas faire défiler la page
    const latlng = elementLatLng(target);
    target.click();
    scheduleClusterFocusHandoff(latlng);
  });

  map.getContainer().addEventListener('focusin', e => {
    if (!map || map.getSize().x === 0) return;
    const target = e.target.closest('.cluster-marker, .arr-cluster-marker');
    if (!target || !target.matches(':focus-visible')) return;
    map.panTo(elementLatLng(target), { animate: true });
  });
}

function initMap() {
  map = L.map('map', {
     zoomControl: false,
     minZoom: 11,
     maxZoom: MAX_ZOOM,
    zoomDelta: 0.5,
    zoomSnap: 0.5,
    doubleClickZoom: false,
    keyboard: false})
    .setView([48.5131, 2.8], 13);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=cb1_2bz2_1_6017a8eaf6b69e397bb0242b', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  L.control.zoom({ position: 'bottomright',
    zoomInDelta: 0.5,
    zoomOutDelta: 0.5
   }).addTo(map);
  initZoomControlAvoidance();

  map.createPane('arrNumPane');
  map.getPane('arrNumPane').style.zIndex = 590;

  clusterGroup = L.markerClusterGroup({
    chunkedLoading: true,
    spiderfyOnMaxZoom: true,
    iconCreateFunction: buildClusterIcon,
    polygonOptions: { className: 'cluster-coverage' },
    maxClusterRadius: zoom => {
      if (zoom >= MAX_ZOOM) return 1;
      if (zoom <= 11) return 130;
      return 90;
    }
  });
  map.addLayer(clusterGroup);

  arrLabelGroup = L.layerGroup();

  bindClusterKeyboard();

  // Bascule automatique arrondissements <-> bâtiments au franchissement du seuil
  map.on('zoomend', () => applyMapMode(false));

  map.on('click', () => {
    if (poiPinnedId == null) return;
    const id = poiPinnedId;
    poiPinnedId = null;
    markerMap[id]?.closePopup();
    refreshPoiActive();
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => map.invalidateSize(), 150);
  });
}

/* ─── ÉVITEMENT DU PANNEAU DE FILTRES ──────────────────────────────────── */
function initZoomControlAvoidance() {
  const zoomEl = document.querySelector('.leaflet-control-zoom');
  const panel  = document.getElementById('filters-panel');
  const mapEl  = document.getElementById('map');
  if (!zoomEl || !panel || !mapEl) return;

  const GAP = 16; // === --screen-inset

  function update() {
    if (window.matchMedia('(max-width: 900px)').matches) {
      zoomEl.style.marginRight = '';
      return;
    }

    const zoomRect = zoomEl.getBoundingClientRect();
    if (zoomRect.width === 0) return; // carte masquée (vue liste)

    const panelRect = panel.getBoundingClientRect();
    const overlaps = panelRect.width > 0 && panelRect.bottom + GAP > zoomRect.top;

    zoomEl.style.marginRight = overlaps
      ? `${Math.round(window.innerWidth - panelRect.left + GAP)}px`
      : '';
  }

  new ResizeObserver(update).observe(panel);
  new ResizeObserver(update).observe(mapEl);
  window.addEventListener('resize', update);
  update();
}

/* ───  MODES ──────────────────────────────────────────────── */

function renderMapFeatures(features) {
  currentFeatures = features;
  applyMapMode(true);

  if (isInitialLoad) {
    isInitialLoad = false; // Désactivé pour les recherches/filtres futurs
    // On n'appelle PAS fitMapToResults() la toute première fois
  } else {
    fitMapToResults();
  }
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
    filter: feature => (counts[feature.properties.c_ar] || 0) > 0,
    style: () => ({ className: 'arr-polygon' }),
    onEachFeature: (feature, layer) => {
      const c_ar = feature.properties.c_ar;
      const n = counts[c_ar] || 0;
      const bounds = layer.getBounds();
      const zoomToArr = () => {
        const zoom = Math.max(map.getBoundsZoom(bounds, false, [30, 30]), ARR_ZOOM_THRESHOLD);
        map.setView(bounds.getCenter(), zoom);
      };
      layer.on('click', zoomToArr);

      const g = feature.properties.geom_x_y;
      if (!g) return;

      const size = clusterSize(n);
      const dotOffsetX = Math.round((ARR_NUM_W + ARR_LABEL_GAP) / 2);
      const numOffsetX = -Math.round((ARR_LABEL_GAP + size) / 2);

      const dotIcon = L.divIcon({

        className: 'arr-cluster-marker',
        html: `<div class="cluster-dot arr-cluster-dot" style="width:${size}px;height:${size}px;
                 transform:translate(calc(-50% + ${dotOffsetX}px), -50%)" aria-label="${n} bâtiments, ${ordinalArr(c_ar)} arrondissement">${n}</div>`,
        iconSize: [0, 0]
      });

      L.marker([g.lat, g.lon], { icon: dotIcon }).addTo(arrLabelGroup).on('click', zoomToArr);

      const numIcon = L.divIcon({
        className: '',
        html: `<div class="arr-label-num" style="width:${ARR_NUM_W}px;
                 transform:translate(calc(-50% + ${numOffsetX}px), -50%)">${ordinalArr(c_ar)}</div>`,
        iconSize: [0, 0]
      });

      L.marker([g.lat, g.lon], { icon: numIcon, interactive: false, keyboard: false, pane: 'arrNumPane' }).addTo(arrLabelGroup);
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

        const marker = L.marker(latlng, { icon, keyboard: false });
        markerMap[id_bat] = marker;

        marker.bindPopup(() => buildMapCard(p), {
          closeButton:  false,
          autoPan:      false,
          closeOnClick: false,
          className:    'bldg-card-popup',
          minWidth: 210, maxWidth: 210
        });

        marker.on('mouseover', () => openPoiCard(id_bat));
        marker.on('mouseout',  () => schedulePoiCardClose(id_bat));
        marker.on('popupopen', e => bindCardBridge(e.popup, id_bat));
        marker.on('click',     () => togglePoiClick(id_bat));

        marker.on('add', () => {
          bindPoiKeyboard(marker, id_bat, p);
          if (typeof refreshPoiActive === 'function') refreshPoiActive();
        });
        return marker;
      }
    }
  );

  clusterGroup.addLayer(layer);

  refreshPoiActive();
}

/* ─── CARD (APERÇU) & INTERACTION DES POI ───────────────────────────────────  */

let poiPinnedId       = null;   // POI dont la card est épinglée (aperçu, page non ouverte)
let poiCardCloseTimer = null;   // fermeture différée (pont de survol)
let poiCardHovered    = false;  // la souris est au-dessus de la card ouverte

function buildMapCard(props) {
  const card = buildBuildingCard(props);
  card.onclick = () => {
    poiPinnedId = null;            // la page prend le relais de l'aperçu
    map.closePopup();
    selectBatiment(props.id_bat);  // ouvre la page ; le POI reste activé
  };
  getBatiment(props.id_bat).then(data => enrichBuildingCard(card, data)).catch(() => {});
  return card;
}

function bindPoiKeyboard(marker, id_bat, props) {
  const el = marker.getElement()?.querySelector('.marker-poi');
  if (!el) return;

  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.setAttribute('aria-label', props.libelle || `Bâtiment ${id_bat}`);

  el.addEventListener('focus', () => {
    if (!map || map.getSize().x === 0) return;
    if (!el.matches(':focus-visible')) return;
    map.panTo(marker.getLatLng(), { animate: true });
    openPoiCard(id_bat);
  });
  el.addEventListener('blur', () => schedulePoiCardClose(id_bat));
  el.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();   // Espace ne doit pas faire défiler la page
    togglePoiClick(id_bat);
  });
}

/** Ouvre (ou garde ouverte) la card d'un POI au survol. */
function openPoiCard(id) {
  clearTimeout(poiCardCloseTimer);
  const marker = markerMap[id];
  if (marker && !marker.isPopupOpen()) marker.openPopup();
}

/** Ferme la card après un court délai, sauf si épinglée ou survolée (pont). */
function schedulePoiCardClose(id) {
  clearTimeout(poiCardCloseTimer);
  poiCardCloseTimer = setTimeout(() => {
    if (poiPinnedId === id || poiCardHovered) return;
    markerMap[id]?.closePopup();
  }, 140);
}

/** Pont de survol : garder la card ouverte quand la souris passe dessus. */
function bindCardBridge(popup, id) {
  const el = popup.getElement();
  if (!el) return;
  el.addEventListener('mouseenter', () => { poiCardHovered = true; clearTimeout(poiCardCloseTimer); });
  el.addEventListener('mouseleave', () => { poiCardHovered = false; schedulePoiCardClose(id); });
}

function isHoverPointer() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/**
 * Clic sur un POI.
 *   • Desktop (souris) : le survol montre déjà la card → le clic ouvre la page
 *     bâtiment directement (reclic = ferme la page).
 *   • Tactile (pas de survol) : 1er tap épingle la card d'aperçu, tap sur la
 *     card ouvre la page, reclic sur le POI ferme la card.
 */
function togglePoiClick(id) {
  const isMobile = window.innerWidth <= 900;

  if (String(selectedId) === String(id)) {   // page ouverte pour ce bâtiment
    deselectBatiment();                       // reclic → ferme la page
    return;
  }

  if (isHoverPointer()) {                     // desktop : clic → page directe
    poiPinnedId = null;
    map.closePopup();
    selectBatiment(id);
    return;
  }

  if (poiPinnedId === id) {                   // tactile : card déjà épinglée
    poiPinnedId = null;                       // reclic → ferme la card
    markerMap[id]?.closePopup();
    refreshPoiActive();
    return;
  }
  if (selectedId != null) deselectBatiment(); // un seul focus : on ferme l'autre page
  poiPinnedId = id;                           // épingle ce POI
  refreshPoiActive();
  openPoiCard(id);

  if (isMobile && markerMap[id]) {
      centerMarkerForMobile(markerMap[id]);
  }
}

function centerMarkerForMobile(marker) {
  if (!map || !marker) return;

  const targetLatLng = marker.getLatLng();

  // 1. On va sur le marqueur
  map.panTo(targetLatLng, { animate: false });

  // 2. On décale la vue vers le haut (ex: -120px sur l'axe Y) pour que le marqueur se retrouve dans la moitié inférieure de l'écran
  const offsetY = -220;

  map.panBy([0, offsetY], { animate: true });
}

/** Applique .active au POI focalisé (sélection prioritaire, sinon épinglé). */
function refreshPoiActive() {
  const activeId = (typeof selectedId !== 'undefined' && selectedId != null)
    ? String(selectedId)
    : (poiPinnedId != null ? String(poiPinnedId) : null);

  document.querySelectorAll('.marker-poi.active').forEach(el => {
    if (el.dataset.id !== activeId) el.classList.remove('active');
  });
  if (activeId) {
    document.querySelector(`.marker-poi[data-id="${CSS.escape(activeId)}"]`)?.classList.add('active');
  }
}

function clearPoiFocus() {
  poiPinnedId = null;
  refreshPoiActive();
}

/* ─── NAVIGATION VERS UN BÂTIMENT ───────────────────────────────────────── */

function flyToFeature(id_bat, attemptsLeft = 20) {
  if (!map) return;

  if (map.getSize().x === 0) {
    if (attemptsLeft > 0) requestAnimationFrame(() => flyToFeature(id_bat, attemptsLeft - 1));
    return;
  }

  const feature = ALL_FEATURES.find(f => String(f.properties.id_bat) === String(id_bat));
  if (!feature || !feature.geometry || !feature.geometry.coordinates) return;

  if (!markerMap[id_bat]) {
    showBuildingView();
    currentMode = 'buildings';
  }

  const marker = markerMap[id_bat];
  if (!marker) return; // sécurité : le bâtiment n'est pas dans currentFeatures (filtré ?)

clusterGroup.zoomToShowLayer(marker, () => {
  const isMobile = window.innerWidth <= 900;
  if (isMobile) {
    centerMarkerForMobile(marker);
  }

  else {
    map.panTo(marker.getLatLng(), { animate: true });
  }
  if (typeof refreshPoiActive === 'function') refreshPoiActive();
});
}

function openMarkerPopup(id_bat) {
  markerMap[id_bat]?.openPopup();
}

function closeAllPopups() {
  map.closePopup();
}
