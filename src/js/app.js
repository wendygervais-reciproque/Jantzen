/**
 * app.js — Point d'entrée : initialisation asynchrone et câblage de l'interface.
 */

let searchQuery = '';

document.addEventListener('DOMContentLoaded', async () => {

  // ── Chargement des données ──────────────────────────────────────────────
  try {
    await loadData();
  } catch (err) {
    console.error('Erreur de chargement des données :', err);
    const countEl = document.getElementById('search-results-count');
    if (countEl) countEl.textContent = 'Erreur de chargement';
    return;
  }

  // ── Initialisation des modules ──────────────────────────────────────────
  initMap();
  buildLunrIndex();
  buildArrChips();
  buildDateFilter();
  buildThesaurusFilter();
  renderCurrentView(ALL_FEATURES);

  bindSearch();
  bindNavigation();
  bindViewToggle();
  bindFiltersPanel();
  bindCarousel();
  bindMosaicDetail();
  bindKeyboard();

  // ── Routage URL ────────────────────────────────────────────────────────
wireUrlRouting();
  const initialId = getIdFromPath(window.location.pathname);
  if (initialId) selectBatiment(initialId); // ← pas applyRouteFromUrl
});

/* ─── RECHERCHE ─────────────────────────────────────────────────────────── */
function bindSearch() {
  const input = document.getElementById('search-input');
  const clear = document.getElementById('search-clear');
  let searchDebounceTimer = null;

  input?.addEventListener('input', e => {
    searchQuery = e.target.value.trim();
    if (clear) clear.hidden = !searchQuery;
    if (searchQuery.length > 0) {
      resetOtherFiltersUI();
    }
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      applyFilters();
    }, 1000);
  });

  clear?.addEventListener('click', () => {
    clearTimeout(searchDebounceTimer);
    if (input) input.value = '';
    searchQuery = '';
    clear.hidden = true;
    applyFilters();
    input?.focus();
  });
}

// Réinitialise les données ET l'UI de tous les filtres sauf la recherche
function resetOtherFiltersUI() {
  // 1. Arrondissements — chips
  activeFilters.arrondissements.clear();
  document.querySelectorAll('#arr-chips .chip').forEach(chip => {
    chip.classList.remove('active');
    chip.setAttribute('aria-pressed', 'false');
  });

  // 2. Temporalité — sliders + inputs
  activeFilters.years = null;
  const dateFromInput = document.getElementById('date-from-input');
  const dateToInput   = document.getElementById('date-to-input');
  const dateFrom      = document.getElementById('date-from');
  const dateTo        = document.getElementById('date-to');
  if (dateFromInput) dateFromInput.value = '';
  if (dateToInput)   dateToInput.value   = '';
  if (dateFrom && dateFrom.min) dateFrom.value = dateFrom.min;
  if (dateTo && dateTo.max)     dateTo.value   = dateTo.max;
  document.getElementById('date-reset')?.click(); // si ce bouton sait déjà tout remettre à zéro proprement

  // 3. Thésaurus
  activeFilters.thesaurus.clear();
  const thesSearchVal = document.getElementById('thesaurus-search')?.value || '';
  renderThesaurusGroups(thesSearchVal);
}

/* ─── NAVIGATION (marque, à propos, pages) ──────────────────────────────── */

function bindNavigation() {
  document.getElementById('brand-home')?.addEventListener('click', e => {
    e.preventDefault();
    closePage();          // le logotype ramène au fond (carte ou mosaïque)
  });

  document.getElementById('brand-about')?.addEventListener('click', e => {
    e.preventDefault();
    showAbout();
  });

  document.getElementById('link-credits')?.addEventListener('click', e => {
    e.preventDefault();
    showPage('credits');
  });

  document.getElementById('link-cgu')?.addEventListener('click', e => {
    e.preventDefault();
    showPage('cgu');
  });

  document.getElementById('page-overlay-close')?.addEventListener('click', closePage);
}

/* ─── BASCULE CARTE / MOSAÏQUE ──────────────────────────────────────────── */

function bindViewToggle() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
}

/* ─── PANNEAU DE FILTRES ────────────────────────────────────────────────── */

function bindFiltersPanel() {
  const panel  = document.getElementById('filters-panel');
  const toggle = document.getElementById('filters-toggle');
  if (!panel || !toggle) return;

  toggle.addEventListener('click', () => {
    // Rétractation en largeur ET en hauteur (voir .is-collapsed en CSS) : ne
    // restent que le titre et l'icône. La classe sur #app laisse la grille
    // mosaïque récupérer l'espace libéré.
    const collapsed = panel.classList.toggle('is-collapsed');
    document.getElementById('app')?.classList.toggle('filters-collapsed', collapsed);
    toggle.textContent = collapsed ? '+' : '−';
    toggle.setAttribute('aria-expanded', String(!collapsed));
  });
}

/* ─── CARROUSEL, MULTISELECT ET PLEIN ÉCRAN ─────────────────────────────── */

function bindCarousel() {
  document.getElementById('info-close')?.addEventListener('click', deselectBatiment);

  document.getElementById('carousel-prev')?.addEventListener('click', () => stepPhoto(-1));
  document.getElementById('carousel-next')?.addEventListener('click', () => stepPhoto(1));
  document.getElementById('carousel-fullscreen')?.addEventListener('click', openLightbox);

  document.getElementById('lightbox-close')?.addEventListener('click', closeLightbox);
  document.getElementById('lightbox-prev')?.addEventListener('click', () => stepPhoto(-1));
  document.getElementById('lightbox-next')?.addEventListener('click', () => stepPhoto(1));
  document.getElementById('lightbox')?.addEventListener('click', e => {
    if (e.target.id === 'lightbox') closeLightbox();   // clic sur le fond
  });

  const field = document.querySelector('#elem-select .ms-field');
  field?.addEventListener('click', e => {
    // La pastille de comptage sert de bouton « tout désélectionner ».
    if (e.target.closest('.ms-badge-clear')) {
      e.stopPropagation();
      clearElementFilter();
      return;
    }
    toggleElementMenu();
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#elem-select')) closeElementMenu();
  });
}

/* ─── CLAVIER ───────────────────────────────────────────────────────────── */

function bindKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (isLightboxOpen())                                  return closeLightbox();
      if (!document.getElementById('elem-select-menu')?.hidden) return closeElementMenu();
      if (document.querySelector('.thes-def'))                return closeAllTermDefinitions();
      if (isPageOpen())                                      return closePage();
      if (selectedId !== null)                               return deselectBatiment();
      return;
    }

    // Flèches : navigation dans les photos, sauf pendant une saisie.
    // Actives quand le coverflow est visible (vue carte) ou que la visionneuse
    // est ouverte — y compris la galerie du volet mosaïque, coverflow masqué.
    const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    const carouselVisible = !document.getElementById('carousel')?.hidden;
    if (typing || (!carouselVisible && !isLightboxOpen())) return;

    if (e.key === 'ArrowLeft')  { e.preventDefault(); stepPhoto(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); stepPhoto(1);  }
  });
}

/* ─── APPLICATION DES FILTRES ───────────────────────────────────────────── */

function applyFilters() {
  let filteredFeatures = ALL_FEATURES;

  // 1. Recherche textuelle (Lunr)
  if (searchQuery.length >= 2) {
    const ids = lunrSearch(searchQuery);
    filteredFeatures = filteredFeatures.filter(f => 
      ids.has(String(f.properties.id_bat)) || ids.has(Number(f.properties.id_bat))
    );
  }

  // 2. Filtre arrondissement
  if (activeFilters.arrondissements.size > 0) {
    filteredFeatures = filteredFeatures.filter(f =>
      activeFilters.arrondissements.has(Number(f.properties.arrondissement))
    );
  }

  // 3. Filtre temporel — intersection avec l'intervalle de construction
  if (activeFilters.years) {
    const [from, to] = activeFilters.years;
    filteredFeatures = filteredFeatures.filter(f => matchesYearRange(f.properties, from, to));
  }

  // 4. Filtre thésaurus (Index Jantzen)
  if (activeFilters.thesaurus.size > 0) {
    const selectedTerms = Array.from(activeFilters.thesaurus).map(t => normalizeText(t));

    filteredFeatures = filteredFeatures.filter(f => {
      const rawTerms = f.properties.terme_jantzen_bat;
      const batTermsArray = Array.isArray(rawTerms) ? rawTerms : [];
      
      // Normalisation des termes du bâtiment
      const batTermsNormalized = batTermsArray.map(t => normalizeText(t));

      // Vérifie si au moins un terme sélectionné est présent
      return selectedTerms.every(term => batTermsNormalized.includes(term));
    });
  }

  // Mise à jour de l'UI du thésaurus (compteurs) basée sur les données filtrées
  updateThesaurusData(filteredFeatures);
  const thesSearchVal = document.getElementById('thesaurus-search')?.value || '';
  renderThesaurusGroups(thesSearchVal);

  // Rendu final de la vue et des tags
  renderCurrentView(filteredFeatures);
  renderActiveTags();
}

// Fonction utilitaire : désactive tous les filtres actifs (mais pas la recherche)
function resetAllFiltersExceptSearch() {
  activeFilters.arrondissements.clear();
  activeFilters.years = null;
  activeFilters.thesaurus.clear();

  // Décoche les cases correspondantes dans le DOM
  document.querySelectorAll('.filter-checkbox:checked').forEach(cb => {
    cb.checked = false;
  });

  // Reset visuel des sliders/selects d'années si tu en as
  const yearFromEl = document.getElementById('year-from');
  const yearToEl = document.getElementById('year-to');
  if (yearFromEl) yearFromEl.value = '';
  if (yearToEl) yearToEl.value = '';
}

// Gestionnaire de la barre de recherche avec debounce
let searchDebounceTimer = null;

function onSearchInputChange(value) {
  searchQuery = value;

  // Si l'utilisateur tape quelque chose, on désactive les autres filtres
  // (mais on ne touche pas à la recherche elle-même)
  if (searchQuery.trim().length > 0) {
    resetAllFiltersExceptSearch();
  }

  // Debounce : on n'applique les filtres qu'1s après la dernière frappe
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    applyFilters();
  }, 1000);
}

/* ─── ROUTAGE URL (/batiment/:id) ───────────────────────────────────────── */

const ROUTE_BASE = '/batiment/';
let suppressUrlSync = false; // évite de re-pousser l'URL pendant un popstate

function getIdFromPath(path) {
  const m = path.match(/\/batiment\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function pathForId(id) {
  return id != null ? `${ROUTE_BASE}${encodeURIComponent(id)}` : '/';
}

function syncUrlForSelection(id) {
  if (suppressUrlSync) return;
  const target = pathForId(id);
  if (target === window.location.pathname) return;
  history.pushState({ id_bat: id }, '', target);
}

function wireUrlRouting() {
  const originalSelect   = selectBatiment;
  const originalDeselect = deselectBatiment;
  window.selectBatiment = function (id_bat, options) {
    originalSelect(id_bat, options);
    syncUrlForSelection(id_bat);
  };
  window.deselectBatiment = function () {
    originalDeselect();
    syncUrlForSelection(null);
  };
  window.addEventListener('popstate', () => {
    const id = getIdFromPath(window.location.pathname);
    suppressUrlSync = true;
    try {
      if (id) selectBatiment(id);
      else deselectBatiment();
    } finally {
      suppressUrlSync = false;
    }
  });
}

function fitMapToResults() {
  if (!map || !currentFeatures || currentFeatures.length === 0) return;
  const tempLayer = L.geoJSON({
    type: 'FeatureCollection',
    features: currentFeatures
  }, {
    coordsToLatLng: coords => new L.LatLng(coords[1], coords[0])
  });

  const bounds = tempLayer.getBounds();
  
  if (bounds.isValid()) {
    map.fitBounds(bounds, {
      padding: [40, 40], // Marge en pixels autour des éléments
      maxZoom: 16        // Limite le zoom pour éviter d'être trop près s'il n'y a qu'un seul bâtiment
    });
  }
}

