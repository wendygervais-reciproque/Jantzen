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
let isInitialLoad = true;
const markerMap = {};     // id_bat → marker Leaflet (vue bâtiments)

let currentFeatures = []; // features actuellement affichées (après filtres)
let currentMode = null;   // 'arr' | 'buildings'
let arrBoundsByCode = {}; // c_ar → L.LatLngBounds du polygone (showArrondissementView) —
                           // reconstruit à chaque rendu ; sert à restreindre la reprise du
                           // focus clavier après activation d'un rond (cf. bindClusterKeyboard).

const ARR_ZOOM_THRESHOLD = 14; // zoom < seuil → vue arrondissements
const MAX_ZOOM = 19;

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
 *
 * En dessous de 900px (même seuil que le reste de l'appli responsive), les
 * bornes _MOBILE prennent le relais : sur un écran étroit, le centre de
 * Paris compte assez d'arrondissements voisins pour que les grosses grappes
 * de la taille desktop se chevauchent et masquent leur propre chiffre.
 */
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
 *   'log'    écarte davantage les petites valeurs, si les grappes courantes
 *            paraissent toutes identiques ;
 *   'linear' proportionnel au diamètre — exagère fortement les grosses grappes.
 */
const CLUSTER_SIZE_SCALE = 'sqrt';

/* ⚙️ RÉGLAGES — étiquette d'arrondissement (numéro + rond de comptage, vue
   ville). Largeur allouée au numéro (ex. "17e", "1er") et espace entre les
   deux marqueurs, en pixels — cf. showArrondissementView(). */
const ARR_NUM_W     = 34;
const ARR_LABEL_GAP = 12; // === --component-gap-12

/** Diamètre en pixels d'une grappe de `count` objets. */
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
    // log1p plutôt que log : reste défini si une borne descend à zéro.
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

  // Le corps de texte est fixé en CSS : seul le disque varie.
  // aria-label sur ce div (unique enfant) : au clavier, Leaflet pose
  // tabindex/role="button" sur le wrapper qu'il génère lui-même (donc hors de
  // notre contrôle direct), mais le nom accessible d'un rôle sans aria-label
  // propre se calcule à partir de celui de ses enfants — voir
  // bindClusterKeyboard() ci-dessous pour l'activation au clavier (Leaflet
  // pose le tabindex mais ne câble pas Entrée/Espace vers le clic).
  return L.divIcon({
    className: 'cluster-marker',
    html: `<div class="cluster-dot" style="width:${size}px;height:${size}px" aria-label="${count} bâtiments, agrandir">${count}</div>`,
    iconSize:   L.point(size, size),
    iconAnchor: L.point(size / 2, size / 2)
  });
}

/**
 * LatLng d'un marqueur/grappe à partir de sa position réellement rendue à
 * l'écran (centre de son `getBoundingClientRect()`), plutôt que
 * `L.DomUtil.getPosition()` : ce dernier lit `_leaflet_pos`, une propriété
 * que Leaflet cache sur l'icône et qui peut rester à (0,0) juste après un
 * grand saut de zoom — DOM fraîchement (ré)inséré, icône recyclée depuis le
 * pool du plugin de cluster sans repasser par un `setPosition` synchrone —
 * alors que le rectangle CSS, lui, reflète toujours ce qui est effectivement
 * affiché.
 */
function elementLatLng(el) {
  const rect = el.getBoundingClientRect();
  const mapRect = map.getContainer().getBoundingClientRect();
  const containerPoint = L.point(
    rect.left + rect.width / 2 - mapRect.left,
    rect.top + rect.height / 2 - mapRect.top
  );
  return map.containerPointToLatLng(containerPoint);
}

/**
 * Focalise, parmi les POI/grappes actuellement affichés, le plus proche de
 * `latlng`. Restreint d'abord à `bounds` quand fourni — les limites exactes
 * de la grappe/de l'arrondissement qui vient d'être activé — pour ne jamais
 * ramasser un élément d'à côté (ex. un bâtiment de l'arrondissement voisin,
 * géographiquement proche du rond cliqué mais hors de son tracé) ; si rien
 * ne s'y trouve (bornes très serrées, imprécision de projection), on retombe
 * sur la recherche non restreinte plutôt que de laisser le focus perdu.
 */
function focusNearestMapChild(latlng, bounds) {
  const candidates = [...document.querySelectorAll('.marker-poi, .cluster-marker, .arr-cluster-marker')];
  const nearest = restrictToBounds => {
    let best = null, bestDist = Infinity;
    for (const el of candidates) {
      const ll = elementLatLng(el);
      if (restrictToBounds && !bounds.contains(ll)) continue;
      const d = ll.distanceTo(latlng);
      if (d < bestDist) { bestDist = d; best = el; }
    }
    return best;
  };
  const best = (bounds && nearest(true)) || nearest(false);
  best?.focus();
}

/**
 * Activer une grappe au clavier la fait disparaître — remplacée par un zoom
 * (POI/sous-grappes révélés) ou, sur une grappe déjà irréductible au zoom
 * courant (pas seulement au zoom max de la carte), un éclatement en spirale
 * sur place (spiderfy) — sans lui laisser de successeur évident à focaliser :
 * le focus retombait sur le document, puis Tab reprenait au premier POI/
 * grappe du DOM, sans rapport avec ce qui venait de se passer à l'écran.
 *
 * Ces deux issues sont distinctes (événements 'moveend' de la carte /
 * 'spiderfied' du plugin de cluster) mais convergent vers la même reprise :
 * reposer le focus sur ce qui est apparu le plus près d'où l'utilisateur en
 * était, dans les limites de `bounds` (cf. focusNearestMapChild). 'moveend'
 * (pas 'zoomend' seul) : c'est l'événement qui garantit que Leaflet a fini de
 * repositionner ses calques pour la nouvelle vue, zoom ET pan compris — y
 * compris pour les grappes que le plugin recycle (même élément DOM repris et
 * repositionné) plutôt que détruit et reconstruit, ce qui rend illusoire
 * toute tentative de confirmer la bonne transition par la disparition d'un
 * élément précis : mieux vaut réagir au premier 'moveend'/'spiderfied` venu.
 */
function scheduleClusterFocusHandoff(latlng, getBounds) {
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    map.off('moveend', finish);
    clusterGroup.off('spiderfied', finish);
    // `getBounds` résolu ici seulement (pas avant) : les bornes exactes (ex.
    // 'clusterclick' du plugin) ne sont connues qu'une fois le clic joué.
    focusNearestMapChild(latlng, getBounds());
  };
  map.once('moveend', finish);
  clusterGroup.once('spiderfied', finish);
  // Filet de sécurité : le clic n'a exceptionnellement provoqué ni zoom/pan
  // ni éclatement (ex. bornes déjà résolues) — on n'attend pas indéfiniment.
  setTimeout(() => {
    if (settled) return;
    settled = true;
    map.off('moveend', finish);
    clusterGroup.off('spiderfied', finish);
  }, 1500);
}

/**
 * Rend les grappes (bâtiments comme arrondissements) activables au clavier.
 * Leaflet leur pose déjà tabindex="0"/role="button" par défaut (option
 * `keyboard`, jamais désactivée ici — à l'inverse des POI, cf. leur
 * `keyboard: false` et bindPoiKeyboard() plus bas), donc Tab les atteint déjà ;
 * il manque Entrée/Espace → clic (que Leaflet ne câble pas lui-même), le
 * recentrage au focus clavier (que bindPoiKeyboard fait pour les POI, cf. son
 * commentaire sur :focus-visible), et la reprise du focus à l'éclatement
 * d'une grappe (cf. scheduleClusterFocusHandoff ci-dessus). Une grappe
 * n'existe qu'un temps (reconstruite à chaque changement de zoom/mode par le
 * plugin de cluster ou showArrondissementView), donc pas d'écouteur par
 * grappe : une seule délégation sur le conteneur de la carte, qui les
 * retrouve via leur classe (posée par buildClusterIcon / le `dotIcon` de
 * showArrondissementView) plutôt que par référence.
 */
function bindClusterKeyboard() {
  // 'clusterclick' (événement du plugin) donne accès à l'objet L.MarkerCluster
  // réellement cliqué — et donc à ses bornes exactes (`getBounds()`), qui ne
  // se déduisent pas de son icône DOM (position ponctuelle, pas une emprise).
  // Capturé ici (une seule fois, à l'écoute en continu) plutôt qu'en tentant
  // de le retrouver après coup : la grappe cliquée aura déjà disparu.
  let lastClusterClickBounds = null;
  clusterGroup.on('clusterclick', e => { lastClusterClickBounds = e.layer.getBounds(); });

  map.getContainer().addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = e.target.closest('.cluster-marker, .arr-cluster-marker');
    if (!target) return;
    e.preventDefault();   // Espace ne doit pas faire défiler la page
    const latlng = elementLatLng(target);
    // Rond d'arrondissement : pas de 'clusterclick' (hors clusterGroup, cf.
    // showArrondissementView) — ses bornes sont retrouvées via le code
    // d'arrondissement posé sur .arr-cluster-dot plutôt que recalculées.
    const arrCode = target.querySelector('.arr-cluster-dot')?.dataset.arr;
    lastClusterClickBounds = null;
    // Écouteurs posés avant le clic (cf. scheduleClusterFocusHandoff) — un
    // clic peut déclencher 'moveend'/'spiderfied' de façon synchrone.
    scheduleClusterFocusHandoff(
      latlng,
      () => lastClusterClickBounds || (arrCode != null ? arrBoundsByCode[arrCode] : null)
    );
    target.click();   // synchrone : peuple lastClusterClickBounds si c'est une grappe bâtiments
  });

  // 'focus' ne bulle pas ('focusin' oui) : nécessaire ici puisqu'on délègue,
  // faute d'écouteur posé sur chaque grappe (cf. commentaire ci-dessus).
  // Pas de référence L.Marker sous la main (délégation) : la position
  // géographique se retrouve à partir du rendu réel de l'icône (cf.
  // elementLatLng), plutôt qu'en la recherchant dans clusterGroup/arrLabelGroup.
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
    // Le zoom au double-clic/double-tap natif de Leaflet fait doublon avec
    // nos propres clics (grappe, rond d'arrondissement) et, sur tactile, sa
    // détection de « second tap rapproché » peut avaler un second tap
    // pourtant destiné à un clic simple sur un autre élément — surtout
    // gênant en vue arrondissements, où les ronds sont proches les uns des
    // autres à l'écran.
    doubleClickZoom: false,
    // keyboard:false — évite que Leaflet pose tabindex="0" sur le conteneur
    // pour son propre panoramique aux flèches : un arrêt de tabulation
    // supplémentaire, sans rien à y activer (chaque POI/grappe est déjà
    // atteignable individuellement), juste après les filtres. Les flèches ne
    // pilotent donc plus la carte, mais tout le reste (Tab, Entrée/Espace sur
    // POI et grappes) est indépendant de cette option.
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

  // Pane dédiée au numéro d'arrondissement (vue ville), sous la pane des
  // marqueurs par défaut (600) : le rond de comptage d'un arrondissement
  // voisin — rendu dans cette dernière — passe ainsi toujours au-dessus,
  // quel que soit l'ordre de rendu des deux features. Sans cette séparation,
  // numéro et rond partagent le même marqueur (même contexte d'empilement
  // né du transform de positionnement Leaflet) et impossible de garantir
  // cet ordre entre deux arrondissements voisins.
  map.createPane('arrNumPane');
  map.getPane('arrNumPane').style.zIndex = 590;

  clusterGroup = L.markerClusterGroup({
    chunkedLoading: true,
    spiderfyOnMaxZoom: true,
    iconCreateFunction: buildClusterIcon,
    // Emprise affichée au survol : stylée en CSS pour rester sur les jetons
    // de couleur plutôt que sur des valeurs en dur.
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

  // Bascule automatique arrondissements ↔ bâtiments au franchissement du seuil
  map.on('zoomend', () => applyMapMode(false));

  // Tactile : un clic sur la carte (hors POI/card, qui interceptent déjà le
  // clic — bubblingMouseEvents désactivé par défaut sur les marqueurs) ferme
  // la card épinglée, comme le ferait un reclic sur le POI.
  map.on('click', () => {
    if (poiPinnedId == null) return;
    const id = poiPinnedId;
    poiPinnedId = null;
    markerMap[id]?.closePopup();
    refreshPoiActive();
  });

  // Rien ne mesurait la carte au redimensionnement de la fenêtre : Leaflet
  // garde alors la taille de conteneur connue à l'initialisation, et les
  // positions écran qu'il calcule (marqueurs, polygones) dérivent de celles
  // réellement affichées une fois la fenêtre redimensionnée — d'où des
  // grappes dont la zone cliquable ne correspond plus à ce qui est dessiné,
  // un décalage d'autant plus visible/gênant que le zoom est élevé (les
  // polygones y sont petits, un même écart en pixels y pèse proportionnellement
  // bien plus lourd). Léger anti-rebond : un redimensionnement déclenche
  // plusieurs 'resize' d'affilée (ex. barre d'adresse mobile qui se replie).
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => map.invalidateSize(), 150);
  });
}

/* ─── ÉVITEMENT DU PANNEAU DE FILTRES ────────────────────────────────────
 * Le contrôle de zoom (bottomright) et le panneau de filtres partagent le
 * même coin : quand celui-ci se déploie sur toute la hauteur disponible
 * (son bas atteint, comme le contrôle de zoom, screen-inset depuis le bas
 * de l'écran), il mord sur le bouton. On le décale alors à gauche du
 * panneau — même marge de sécurité de 16 px — sinon il reste à sa place
 * par défaut, calée en CSS (.leaflet-control-zoom). Le panneau n'a ni
 * hauteur ni largeur fixes (accordéons, repli, breakpoints) : on mesure
 * donc en JS plutôt que de dupliquer ces règles en CSS. */
function initZoomControlAvoidance() {
  const zoomEl = document.querySelector('.leaflet-control-zoom');
  const panel  = document.getElementById('filters-panel');
  const mapEl  = document.getElementById('map');
  if (!zoomEl || !panel || !mapEl) return;

  const GAP = 16; // === --screen-inset

  function update() {
    // En dessous de ce seuil, #filters-panel est une modale plein écran (pas
    // un panneau docké à éviter) : la garder dans ce calcul pousserait le
    // contrôle de zoom hors écran dès qu'elle est ouverte.
    if (window.matchMedia('(max-width: 900px)').matches) {
      zoomEl.style.marginRight = '';
      return;
    }

    const zoomRect = zoomEl.getBoundingClientRect();
    if (zoomRect.width === 0) return; // carte masquée (vue mosaïque)

    const panelRect = panel.getBoundingClientRect();
    const overlaps = panelRect.width > 0 && panelRect.bottom + GAP > zoomRect.top;

    zoomEl.style.marginRight = overlaps
      ? `${Math.round(window.innerWidth - panelRect.left + GAP)}px`
      : '';
  }

  // Le panneau change de taille (accordéons, repli, résultats) et la carte
  // change de visibilité (bascule vue carte/mosaïque) sans jamais déclencher
  // resize sur la fenêtre — d'où l'observation directe des deux éléments.
  new ResizeObserver(update).observe(panel);
  new ResizeObserver(update).observe(mapEl);
  window.addEventListener('resize', update);
  update();
}

/* ─── AIGUILLAGE DES MODES ──────────────────────────────────────────────── */

 // À ajouter en haut de map.js avec les autres let

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
  arrBoundsByCode = {};

  if (typeof ARR_POLYGONS === 'undefined' || !ARR_POLYGONS) return;

  arrGeoLayer = L.geoJSON(ARR_POLYGONS, {
    // Arrondissement sans bâtiment (après filtrage) : ni emprise ni étiquette.
    // Une grappe ronde n'existe pas là où il n'y a rien à compter.
    filter: feature => (counts[feature.properties.c_ar] || 0) > 0,
    // Emprise reprenant l'aspect du survol d'une grappe ronde (doré Orsay).
    style: () => ({ className: 'arr-polygon' }),
    onEachFeature: (feature, layer) => {
      const c_ar = feature.properties.c_ar;
      const n = counts[c_ar] || 0;
      // Cliquer un arrondissement doit toujours faire éclater son contenu
      // (sous-grappes/POI) — jamais juste le recentrer. `fitBounds` seul ne
      // le garantit pas : il vise le zoom minimal qui fait tenir le polygone
      // à l'écran (+30px de marge), et pour un grand arrondissement (donc un
      // polygone qui a besoin de moins de zoom pour y tenir), ce zoom peut
      // rester sous ARR_ZOOM_THRESHOLD — la vue reste alors en mode
      // arrondissements, pile ajustée sur ses limites, et recliquer dessus
      // ne fait que recalculer la même cible (rien à observer : le clic et
      // fitBounds tournent bien à chaque fois, seul le zoom obtenu stagne).
      // On plafonne donc au minimum au seuil de bascule.
      const bounds = layer.getBounds();
      arrBoundsByCode[c_ar] = bounds;   // cf. bindClusterKeyboard() : reprise du focus après activation
      const zoomToArr = () => {
        const zoom = Math.max(map.getBoundsZoom(bounds, false, [30, 30]), ARR_ZOOM_THRESHOLD);
        map.setView(bounds.getCenter(), zoom);
      };
      layer.on('click', zoomToArr);

      const g = feature.properties.geom_x_y;
      if (!g) return;

      // Rond noir de comptage, dimensionné comme une vraie grappe (clusterSize),
      // précédé du numéro d'arrondissement. Deux marqueurs distincts plutôt
      // qu'un seul (numéro + rond côte à côte) : le rond doit toujours passer
      // au-dessus du numéro d'un arrondissement voisin quand ils se
      // chevauchent (petits arrondissements centraux, serrés les uns contre
      // les autres) — impossible à garantir avec un seul marqueur partagé,
      // cf. la pane dédiée `arrNumPane` posée dans initMap(). Décalages
      // calculés à la main (pas de flex/gap) pour reproduire côte à côte le
      // rendu de deux marqueurs positionnés indépendamment sur le même point.
      const size = clusterSize(n);
      const dotOffsetX = Math.round((ARR_NUM_W + ARR_LABEL_GAP) / 2);
      const numOffsetX = -Math.round((ARR_LABEL_GAP + size) / 2);

      const dotIcon = L.divIcon({
        // Classe dédiée (Leaflet l'applique au wrapper qui reçoit
        // tabindex/role="button") : c'est elle qui permet à
        // bindClusterKeyboard() de repérer ce rond parmi tout ce que la
        // carte peut contenir, sans dépendre de sa structure interne.
        className: 'arr-cluster-marker',
        html: `<div class="cluster-dot arr-cluster-dot" data-arr="${c_ar}" style="width:${size}px;height:${size}px;
                 transform:translate(calc(-50% + ${dotOffsetX}px), -50%)" aria-label="${n} bâtiments, ${ordinalArr(c_ar)} arrondissement">${n}</div>`,
        iconSize: [0, 0]
      });
      // Interactif (contrairement au numéro) : pour un petit arrondissement au
      // fort effectif, le rond déborde largement du tracé du polygone —
      // taper dessus tombait alors hors de sa zone cliquable et le zoom ne se
      // déclenchait pas (régression observée sur les arrondissements centraux,
      // là où rond ≫ polygone ; 3e/4e épargnés car leur effectif — donc leur
      // rond — reste petit). Le rond répond donc lui aussi au clic, en plus
      // du polygone.
      L.marker([g.lat, g.lon], { icon: dotIcon }).addTo(arrLabelGroup).on('click', zoomToArr);

      const numIcon = L.divIcon({
        className: '',
        html: `<div class="arr-label-num" style="width:${ARR_NUM_W}px;
                 transform:translate(calc(-50% + ${numOffsetX}px), -50%)">${ordinalArr(c_ar)}</div>`,
        iconSize: [0, 0]
      });
      // keyboard:false — `interactive:false` ne dispense pas Leaflet de poser
      // tabindex="0"/role="button" (l'option keyboard, par défaut true, lui
      // est indépendante) : sans ce flag, ce numéro pourtant décoratif
      // (aucun clic, aucun clavier n'est censé y faire quoi que ce soit)
      // devenait un arrêt de tabulation fantôme — imperceptible (icône 0×0,
      // aucun style de focus) et redondant avec le rond, qui porte la même
      // information de façon opérable.
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

        // keyboard: false — Leaflet rend sinon nativement l'icône (le
        // wrapper) tabbable de son côté, en plus de `.marker-poi` que
        // bindPoiKeyboard() instrumente ci-dessous : deux arrêts de
        // tabulation par POI, dont un « muet » (sans recentrage), d'où le
        // double Tab nécessaire avant correction.
        const marker = L.marker(latlng, { icon, keyboard: false });
        markerMap[id_bat] = marker;

        // Card partagée avec la mosaïque, reconstruite à l'ouverture (données
        // mutualisées en cache). Popup sans croix ; toute la card est cliquable.
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
        // Un POI n'est ajouté au DOM par le plugin de cluster que lorsqu'il
        // est effectivement affiché seul (pas regroupé) au zoom courant :
        // 'add' est donc le bon moment pour le rendre joignable au clavier —
        // et, de la même façon, pour lui réappliquer .active si besoin (ex.
        // ouverture directe d'un permalien : le marqueur n'existe pas encore
        // au moment du premier refreshPoiActive(), noyé dans un cluster).
        marker.on('add', () => {
          bindPoiKeyboard(marker, id_bat, p);
          if (typeof refreshPoiActive === 'function') refreshPoiActive();
        });
        return marker;
      }
    }
  );

  clusterGroup.addLayer(layer);

  // Ré-applique l'état « activé » du POI (sélection ou card épinglée) après
  // reconstruction des marqueurs.
  refreshPoiActive();
}

/* ─── CARD (APERÇU) & INTERACTION DES POI ───────────────────────────────────
 *
 * Deux niveaux de « focus » pour un POI, matérialisés par l'état visuel
 * .marker-poi.active :
 *   • épinglé  — card d'aperçu maintenue ouverte (clic sur le POI) ;
 *   • sélectionné — page bâtiment ouverte (clic sur la card).
 * Le survol ouvre la card de façon transitoire, avec un « pont » permettant de
 * glisser la souris du POI jusqu'à la card sans qu'elle se referme.
 */

let poiPinnedId       = null;   // POI dont la card est épinglée (aperçu, page non ouverte)
let poiCardCloseTimer = null;   // fermeture différée (pont de survol)
let poiCardHovered    = false;  // la souris est au-dessus de la card ouverte

/** Contenu du popup : la card partagée + clic → page bâtiment, + enrichissement. */
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

/**
 * Rend un POI joignable au clavier (RGAA 7.3 : toute fonctionnalité au
 * pointeur doit avoir un équivalent clavier) : Tab l'atteint comme un bouton,
 * Entrée/Espace reproduit le clic, et la prise de focus AU CLAVIER recentre
 * la carte dessus et ouvre la card d'aperçu — équivalent clavier du survol
 * à la souris (mêmes fonctions openPoiCard/schedulePoiCardClose, donc même
 * pont de survol et même respect d'un épinglage/sélection en cours).
 *
 * Le recentrage/aperçu doivent rester réservés au focus clavier : un clic
 * souris pose aussi le focus sur l'élément (comportement natif d'un
 * tabindex="0"), et si on agissait dans tous les cas, le marqueur se
 * déplaçait sous le curseur entre le mousedown et le mouseup — Leaflet
 * interprétait alors le geste comme un glissé et n'émettait plus le 'click',
 * empêchant l'ouverture de la fiche bâtiment au clic. D'où le filtre sur
 * :focus-visible, qui exclut justement le focus déclenché par un pointeur.
 */
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
  // Quitte le POI au clavier (Tab suivant/précédent) : referme l'aperçu,
  // sauf s'il est épinglé ou survolé — même garde que schedulePoiCardClose
  // au mouseout, pour ne jamais fermer une card que l'utilisateur pilote
  // encore à la souris ou a explicitement épinglée.
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

/** Périphérique de pointage « fin » avec survol (souris) → poste de travail. */
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

  // 2. On décale la vue vers le haut (ex: -120px sur l'axe Y) 
  // pour que le marqueur se retrouve dans la moitié inférieure de l'écran.
  // Ajuste '120' selon la hauteur de ta popup/card.
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

/** Abandonne le focus POI (appelé à la désélection depuis ui.js). */
function clearPoiFocus() {
  poiPinnedId = null;
  refreshPoiActive();
}

/* ─── NAVIGATION VERS UN BÂTIMENT ───────────────────────────────────────── */

function flyToFeature(id_bat, attemptsLeft = 20) {
  if (!map) return;
  // Conteneur non mesuré : au chargement direct d'un permalien, ce code
  // s'exécute avant que Leaflet n'ait eu l'occasion de mesurer la carte (le
  // tout premier rendu n'a pas encore eu lieu) — on réessaie au prochain
  // repaint plutôt que d'abandonner. En vue mosaïque en revanche, la carte
  // est masquée à dessein (display: none) et ne sera jamais mesurée : le
  // nombre d'essais est borné pour ne pas tourner indéfiniment dans ce cas.
  if (map.getSize().x === 0) {
    if (attemptsLeft > 0) requestAnimationFrame(() => flyToFeature(id_bat, attemptsLeft - 1));
    return;
  }

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