/**
 * app.js — Point d'entrée : initialisation asynchrone et câblage de l'interface.
 */

let searchQuery = '';

document.addEventListener('DOMContentLoaded', async () => {

  document.addEventListener('contextmenu', e => {
    if (e.target.tagName === 'IMG' || e.target.closest('img, .md-photo, #lightbox')) {
      e.preventDefault();
    }
  });
  
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
  buildThesaurusFilter();
  buildPeriodesFilter(PERIODES_FILTRE_DATA);
  
  // S'assurer que les architectes sont affichés avec les données filtrées initiales
  renderArchitectesList('');

  renderCurrentView(ALL_FEATURES);

  bindSearch();
  bindNavigation();
  bindViewToggle();
  bindFiltersPanel();
  bindFiltersFab();
  bindLightbox();
  bindMosaicDetail();
  bindKeyboard();

  // ── État partagé dans l'URL ─────────────────────────────────────────────
  applyStateFromHash();
  window.addEventListener('popstate',   onHistoryNav);
  window.addEventListener('hashchange', onHistoryNav);
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
    }, 800);
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

function resetOtherFiltersUI() {
  // 1. Arrondissements — chips
  activeFilters.arrondissements.clear();
  document.querySelectorAll('#arr-chips .chip').forEach(chip => {
    chip.classList.remove('active');
    chip.setAttribute('aria-pressed', 'false');
  });

  // 2. Périodes
  activeFilters.periodes.clear();
  if (typeof renderPeriodesList === 'function') renderPeriodesList();

  // 3. Thésaurus
  activeFilters.thesaurus.clear();
  const thesSearchVal = document.getElementById('thesaurus-search')?.value || '';
  renderThesaurusGroups(thesSearchVal);

  // 4. Architectes
  activeFilters.architectes.clear();
  const archiSearchVal = document.getElementById('archi-search')?.value || '';
  renderArchitectesList(archiSearchVal);
}

/* ─── MODALES : isolation du fond ────────────────────────────────────────
   Pendant qu'une modale (page statique ou visionneuse) est affichée, #app
   passe en inerte */
function setBackgroundInert(isInert) {
  const app = document.getElementById('app');
  if (!app) return;
  app.toggleAttribute('inert', isInert);
  app.setAttribute('aria-hidden', String(isInert));
}

/* Variante pour les modales mobiles (filtres, fiche bâtiment) : contrairement
   aux pages statiques et à la visionneuse, ces deux-là vivent À L'INTÉRIEUR
   de #app */
function setAppSiblingsInert(exceptEl, isInert) {
  const app = document.getElementById('app');
  if (!app) return;
  Array.from(app.children).forEach(child => {
    if (child === exceptEl) return;
    child.toggleAttribute('inert', isInert);
    child.setAttribute('aria-hidden', String(isInert));
  });
}

/* ─── NAVIGATION (marque, à propos, pages) ──────────────────────────────── */
function bindNavigation() {
  document.getElementById('brand-home')?.addEventListener('click', e => {
    e.preventDefault();
    closePage();          // le logotype ramène au fond (carte ou liste)
    searchQuery = '';
    const input = document.getElementById('search-input');
    if(input) input.value = '';
    const clear = document.getElementById('search-clear');
    if(clear) clear.hidden = true;
    
    resetOtherFiltersUI();

    setView('map');

    deselectBatiment();
    applyFilters();
  });

  document.getElementById('brand-about')?.addEventListener('click', e => {
    e.preventDefault();
    showAbout();
  });

  document.getElementById('page-overlay-close')?.addEventListener('click', closePage);
}

/* ─── BASCULE CARTE / LISTE ──────────────────────────────────────────── */
function bindViewToggle() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
}

/* ─── PANNEAU DE FILTRES ────────────────────────────────────────────────── */
function bindFiltersPanel() {
  const panel  = document.getElementById('filters-panel');
  const toggle = document.getElementById('filters-toggle');
  if (typeof initStickyFilterHeaders === 'function') initStickyFilterHeaders();
  if (!panel || !toggle) return;

  toggle.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('is-collapsed');
    document.getElementById('app')?.classList.toggle('filters-collapsed', collapsed);
    toggle.querySelector('use')?.setAttribute('href', collapsed ? '#i-plus' : '#i-minus');
    toggle.setAttribute('aria-expanded', String(!collapsed));
  });
}

/* ─── FILTRES EN MODALE (mobile/tablette, inf 900px) ───────────────────────── */
function bindFiltersFab() {
  document.getElementById('filters-fab')?.addEventListener('click', openFiltersMobile);
  document.getElementById('filters-close')?.addEventListener('click', closeFiltersMobile);
  document.getElementById('filters-footer-back')?.addEventListener('click', closeFiltersMobile);
}

function openFiltersMobile() {
  const panel = document.getElementById('filters-panel');
  const fab   = document.getElementById('filters-fab');
  if (!panel) return;
  panel.classList.remove('filters-mobile-closing');
  panel.classList.add('filters-mobile-open');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  fab?.classList.add('is-active');
  fab?.setAttribute('aria-expanded', 'true');
  setAppSiblingsInert(panel, true);
  document.getElementById('filters-close')?.focus();
}

function closeFiltersMobile() {
  const panel = document.getElementById('filters-panel');
  const fab   = document.getElementById('filters-fab');
  if (!panel?.classList.contains('filters-mobile-open')) return;
  panel.classList.remove('filters-mobile-open');
  panel.setAttribute('role', 'region');
  panel.removeAttribute('aria-modal');
  fab?.classList.remove('is-active');
  fab?.setAttribute('aria-expanded', 'false');
  setAppSiblingsInert(panel, false);
  fab?.focus();
  panel.classList.add('filters-mobile-closing');
  const clear = () => panel.classList.remove('filters-mobile-closing');
  panel.addEventListener('animationend', clear, { once: true });
  setTimeout(clear, 300);
}

function isFiltersMobileOpen() {
  return !!document.getElementById('filters-panel')?.classList.contains('filters-mobile-open');
}

/* ─── VISIONNEUSE PLEIN ÉCRAN ────────────────────────────────────────────── */
function bindLightbox() {
  document.getElementById('lightbox-close')?.addEventListener('click', closeLightbox);
  document.getElementById('lightbox-prev')?.addEventListener('click', () => stepPhoto(-1));
  document.getElementById('lightbox-next')?.addEventListener('click', () => stepPhoto(1));
  document.getElementById('lightbox')?.addEventListener('click', e => {
    if (e.target.id === 'lightbox') closeLightbox();   // clic sur le fond
  });
}

/* ─── NAVIGATION CLAVIER ───────────────────────────────────────────────────────────── */
function bindKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (isLightboxOpen())                                     return closeLightbox();
      if (mdPhotoFilter.size)                                   return clearMdElementFilter();
      if (document.querySelector('.thes-def'))                  return closeAllTermDefinitions();
      if (isFiltersMobileOpen())               return closeFiltersMobile();
      if (isPageOpen())                        return closePage();
      if (selectedId !== null)                 return deselectBatiment();
      if (typeof map !== 'undefined' && map?.getContainer().contains(document.activeElement)) {
        return document.getElementById('search-input')?.focus();
      }
      return;
    }

    // Flèches : navigation dans les photos de la visionneuse, sauf pendant une saisie
    const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if (typing || !isLightboxOpen()) return;

    if (e.key === 'ArrowLeft')  { e.preventDefault(); stepPhoto(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); stepPhoto(1);  }
  });
}

/* ─── APPLICATION DES FILTRES ───────────────────────────────────────────── */

function withFocusPreserved(fn) {
  const active    = document.activeElement;
  const chip      = active?.closest?.('.chip, #filter-reset-btn, .filter-active-tag-remove');
  const container = chip?.closest?.('#thesaurus-groups, #archi-chips-container, #date-chips-container, #filters-active-bar');
  const key       = chip?.dataset?.id;
  const containerId = container?.id;

  fn();

  if (!chip || document.body.contains(chip)) return;   // rien détruit : pas d'intervention

  if (key != null && containerId) {
    const replacement = [...document.getElementById(containerId).querySelectorAll('.chip')]
      .find(c => c.dataset.id === key);
    if (replacement) { replacement.focus(); return; }
  }
  document.querySelector('.filter-section-header')?.focus();
}

function applyFilters() {
  let filteredFeatures = ALL_FEATURES;

  const isSearchActive     = searchQuery.length >= 2;
  const isThesaurusActive  = activeFilters.thesaurus.size > 0;
  const isArchitectesActive = activeFilters.architectes.size > 0;
  const isPeriodesActive   = activeFilters.periodes.size > 0; // NOUVEAU

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


  // 3. Filtre des périodes à facettes (Filtre en OU)
  if (activeFilters.periodes.size > 0) {

    const selectedPeriodes = Array.from(activeFilters.periodes);

    filteredFeatures = filteredFeatures.filter(f => {
      const raw = f.properties.periode;
      const batPeriodes = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      
      // Filtre OU : au moins une des périodes sélectionnées doit correspondre
      return selectedPeriodes.some(p => batPeriodes.includes(p));
    });
  }

  // 4. Filtre thésaurus (Index Jantzen)
  if (activeFilters.thesaurus.size > 0) {
    const selectedTerms = Array.from(activeFilters.thesaurus).map(t => normalizeText(t));
    filteredFeatures = filteredFeatures.filter(f => {
      const batTerms = buildingTermKeys(f.properties);   // Jantzen ∪ Torne-H
      return selectedTerms.every(term => batTerms.has(term));
    });
  }

  // Mettre à jour les données des architectes
  updateArchitectesData(filteredFeatures);

  // 5. Filtre Architectes 
  if (activeFilters.architectes.size > 0) {
    const selectedArchiIds = Array.from(activeFilters.architectes).map(id => Number(id));
    filteredFeatures = filteredFeatures.filter(f => {
      const raw = f.properties.personneID;
      const arr = Array.isArray(raw) ? raw : (raw != null ? [raw] : []);
      const batArchiIds = arr
        .map(item => Number(typeof item === 'object' && item !== null ? item.personneID : item))
        .filter(id => !isNaN(id));

      return selectedArchiIds.every(selectedId => batArchiIds.includes(selectedId));
    });
  }

  // Mise à jour des données et rendu UI des facettes
  updateArrondissementsData(filteredFeatures);
  updateThesaurusData(filteredFeatures);
  updatePeriodesData(filteredFeatures);

  // Ces rendus reconstruisent leurs puces de toutes pièces (voir
  // withFocusPreserved ci-dessus) : regroupés dans un seul appel pour ne
  // capturer/restaurer le focus qu'une fois.
  withFocusPreserved(() => {
    renderPeriodesList(); 

    const thesSearchVal = document.getElementById('thesaurus-search')?.value || '';
    renderThesaurusGroups(thesSearchVal);

    const archiSearchVal = document.getElementById('archi-search')?.value || '';
    renderArchitectesList(archiSearchVal);

    renderActiveTags();
  });

  if (selectedId !== null && !filteredFeatures.some(f => String(f.properties.id_bat) === String(selectedId))) {
    deselectBatiment();
  }

  // Rendu final
  renderCurrentView(filteredFeatures);

  if (typeof writeStateToHash === 'function') writeStateToHash('replace');
}

/* ─── ÉTAT PARTAGÉ DANS LE HASH D'URL ───────────────────────────────────────
 *
 * L'état complet de l'app — vue, filtres, recherche, bâtiment ouvert — vit dans
 * le hash : #v=mosaic&arr=7,16&an=1900-1914&th=facade,garde-corps&q=leroux&bat=1663
 */

let applyingState   = false;  
let lastWrittenHash = null;

function currentAppState() {
  return {
    view:     typeof currentView !== 'undefined' ? currentView : 'map',
    arr:      [...activeFilters.arrondissements],
    periodes: [...activeFilters.periodes],
    thes:     [...activeFilters.thesaurus],
    archi:    [...activeFilters.architectes],
    query:    searchQuery,
    bat:      selectedId != null ? String(selectedId) : null
  };
}

function serializeState(s) {
  const parts = [];
  if (s.view && s.view !== 'map')      parts.push(`v=${s.view}`);
  if (s.arr && s.arr.length)           parts.push(`arr=${s.arr.join(',')}`);
  if (s.periodes && s.periodes.length) parts.push(`per=${s.periodes.map(encodeURIComponent).join(',')}`);
  if (s.thes && s.thes.length)         parts.push(`th=${s.thes.map(termSlug).join(',')}`);
  if (s.archi && s.archi.length)       parts.push(`archi=${s.archi.join(',')}`);
  if (s.query)                         parts.push(`q=${encodeURIComponent(s.query)}`);
  if (s.bat != null)                   parts.push(`bat=${encodeURIComponent(s.bat)}`);
  return parts.length ? `#${parts.join('&')}` : '';
}

function parseHash(hash) {
  const s = { view: 'map', arr: [], periodes: [], thes: [], archi: [], query: '', bat: null };
  const raw = (hash || '').replace(/^#/, '');
  if (!raw) return s;
  raw.split('&').forEach(pair => {
    const i = pair.indexOf('=');
    if (i < 0) return;
    const key = pair.slice(0, i), val = pair.slice(i + 1);
    switch (key) {
      case 'v':     if (val === 'mosaic' || val === 'map') s.view = val; break;
      case 'arr':   s.arr = val.split(',').map(Number).filter(Number.isFinite); break;
      case 'per':   s.periodes = val.split(',').map(decodeURIComponent); break;
      case 'th':    s.thes = val.split(',').map(slugToTerm).filter(Boolean); break;
      case 'archi': s.archi = val.split(',').map(Number).filter(Number.isFinite); break;
      case 'q':     try { s.query = decodeURIComponent(val); } catch { s.query = val; } break;
      case 'bat':   try { s.bat   = decodeURIComponent(val); } catch { s.bat   = val; } break;
    }
  });
  return s;
}

/* Termes lisibles pour le thésaurus : « façade » -> « facade », « garde-corps » ->
   « garde-corps ». Réversibles par rapprochement avec les termes réels du corpus. */
function termSlug(term) {
  return String(term || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // sans accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // séparateurs -> tiret
    .replace(/^-+|-+$/g, '');
}

let _slugToTerm = null;
function slugToTerm(slug) {
  if (!_slugToTerm) {
    _slugToTerm = new Map();
    (typeof THES_TERMS !== 'undefined' ? THES_TERMS : []).forEach(t => {
      const key = termSlug(t.term);
      if (!_slugToTerm.has(key)) _slugToTerm.set(key, t.term);
    });
  }
  return _slugToTerm.get(termSlug(slug)) || null;
}

function writeStateToHash(mode = 'replace') {
  if (applyingState) return;
  const hash = serializeState(currentAppState());
  if (hash === (location.hash || '')) { lastWrittenHash = location.hash; return; }
  lastWrittenHash = hash;
  const url = hash || (location.pathname + location.search); 
  if (mode === 'push') history.pushState(null, '', url);
  else                 history.replaceState(null, '', url);
}

function applyStateFromHash() {
  applyingState = true;
  try {
    const s = parseHash(location.hash);

    // 1. Recherche
    searchQuery = s.query;
    const input = document.getElementById('search-input');
    if (input) input.value = s.query;
    const clear = document.getElementById('search-clear');
    if (clear) clear.hidden = !s.query;

    // 2. Filtres : état + resync UI
    activeFilters.arrondissements = new Set(s.arr);
    activeFilters.thesaurus       = new Set(s.thes);
    activeFilters.periodes        = new Set(s.periodes);

    if (s.archi.length > 0 || location.hash.includes('archi=')) {
      activeFilters.architectes = new Set(s.archi);
    }

    syncArrChips();
    if (typeof renderPeriodesList === 'function') renderPeriodesList();

    // 3. Passe de filtrage unique
    applyFilters();

    // 4-5. Vue et sélection
    setView(s.view);
    if (s.bat) selectBatiment(s.bat);
    else       deselectBatiment();
  } finally {
    applyingState = false;
  }
  lastWrittenHash = location.hash;
}
function onHistoryNav() {
  if (location.hash === lastWrittenHash) return;
  applyStateFromHash();
}

let hasFittedInitialView = false;

function fitMapToResults() {
  if (!map) return;

  const isDesktop = window.innerWidth > 900;
  const paddingRight = isDesktop ? 60 : 20;

  // Sur ordi, on autorise/impose un maxZoom plus élevé
  const zoomOptions = {
    paddingTopLeft: [40, 40],
    paddingBottomRight: [paddingRight, 40],
    maxZoom: isDesktop ? 14.5 : 12.5 // Zoom plus proche sur ordinateur
  };

  // 1. Vue globale / arrondissements (ou aucun résultat)
  if (!currentFeatures || currentFeatures.length === 0 || !hasFittedInitialView) {
    hasFittedInitialView = true;
    
    const arrBounds = (typeof ARR_POLYGONS !== 'undefined' && ARR_POLYGONS)
      ? L.geoJSON(ARR_POLYGONS).getBounds()
      : null;

    if (arrBounds && arrBounds.isValid()) {
      map.fitBounds(arrBounds, zoomOptions);
    }
    return;
  }

  // 2. Vue filtrée
  const tempLayer = L.geoJSON({
    type: 'FeatureCollection',
    features: currentFeatures
  }, {
    coordsToLatLng: coords => new L.LatLng(coords[1], coords[0])
  });

  const bounds = tempLayer.getBounds();

  if (bounds.isValid()) {
    map.fitBounds(bounds, zoomOptions);
  }
}