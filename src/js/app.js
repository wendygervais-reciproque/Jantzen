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

  input?.addEventListener('input', e => {
    searchQuery = e.target.value.trim();
    if (clear) clear.hidden = !searchQuery;
    applyFilters();
  });

  clear?.addEventListener('click', () => {
    if (input) input.value = '';
    searchQuery = '';
    clear.hidden = true;
    applyFilters();
    input?.focus();
  });
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
  const body   = document.getElementById('filters-body');
  const toggle = document.getElementById('filters-toggle');
  if (!body || !toggle) return;

  toggle.addEventListener('click', () => {
    const collapsed = body.classList.toggle('collapsed');
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
    const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    const carouselVisible = !document.getElementById('carousel')?.hidden;
    if (typing || !carouselVisible) return;

    if (e.key === 'ArrowLeft')  { e.preventDefault(); stepPhoto(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); stepPhoto(1);  }
  });
}

/* ─── APPLICATION DES FILTRES ───────────────────────────────────────────── */

function applyFilters() {
  let features = ALL_FEATURES;

  // 1. Recherche textuelle (Lunr)
  if (searchQuery.length >= 2) {
    const ids = lunrSearch(searchQuery);
    // Comparaison souple (String/Number) pour id_bat
    features = features.filter(f => ids.has(String(f.properties.id_bat)) || ids.has(Number(f.properties.id_bat)));
  }

  // 2. Filtre arrondissement
  if (activeFilters.arrondissements.size > 0) {
    features = features.filter(f =>
      activeFilters.arrondissements.has(Number(f.properties.arrondissement))
    );
  }

  // 3. Filtre temporel — intersection avec l'intervalle de construction
  if (activeFilters.years) {
    const [from, to] = activeFilters.years;
    features = features.filter(f => matchesYearRange(f.properties, from, to));
  }

  // 4. Filtre thésaurus (Index Jantzen) — au moins un terme coché en commun
  if (activeFilters.thesaurus.size > 0) {
    features = features.filter(f =>
      (f.properties.terme_jantzen_bat || []).some(term => activeFilters.thesaurus.has(term))
    );
  }

  renderCurrentView(features);
  renderActiveTags();
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
