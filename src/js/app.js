/**
 * app.js — Point d'entrée : initialisation asynchrone et câblage de l'interface.
 */

let searchQuery = '';

document.addEventListener('DOMContentLoaded', async () => {

  // ── Chargement des données ──────────────────────────────────────────────
  try {
    await loadData();
    // buildArchitectesFilter est déjà exécuté à la fin de loadData() dans data.js
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

  // 2. periode
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

/* ─── NAVIGATION (marque, à propos, pages) ──────────────────────────────── */

function bindNavigation() {
  document.getElementById('brand-home')?.addEventListener('click', e => {
    e.preventDefault();
    closePage();          // le logotype ramène au fond (carte ou mosaïque)
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
    toggle.querySelector('use')?.setAttribute('href', collapsed ? '#i-plus' : '#i-minus');
    toggle.setAttribute('aria-expanded', String(!collapsed));
  });
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

/* ─── CLAVIER ───────────────────────────────────────────────────────────── */

function bindKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (isLightboxOpen())                                     return closeLightbox();
      if (mdPhotoFilter.size)                                   return clearMdElementFilter();
      if (document.querySelector('.thes-def'))                  return closeAllTermDefinitions();
      if (isPageOpen())                        return closePage();
      if (selectedId !== null)                 return deselectBatiment();
      return;
    }

    // Flèches : navigation dans les photos de la visionneuse, sauf pendant une saisie.
    const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if (typing || !isLightboxOpen()) return;

    if (e.key === 'ArrowLeft')  { e.preventDefault(); stepPhoto(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); stepPhoto(1);  }
  });
}

/* ─── APPLICATION DES FILTRES ───────────────────────────────────────────── */

/* --- Dans la fonction applyFilters() de app.js --- */
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

    console.log('coucou');
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
      const rawTerms = f.properties.terme_jantzen_bat;
      const batTermsArray = Array.isArray(rawTerms) ? rawTerms : [];
      const batTermsNormalized = batTermsArray.map(t => normalizeText(t));
      return selectedTerms.every(term => batTermsNormalized.includes(term));
    });
  }

  // Mettre à jour les données des architectes
  updateArchitectesData(filteredFeatures);

  // 5. Filtre Architectes 
  if (activeFilters.architectes.size > 0) {
    const selectedArchiIds = Array.from(activeFilters.architectes).map(id => Number(id));
    filteredFeatures = filteredFeatures.filter(f => {
      const personnes = f.properties.personnes || [];
      let batArchiIds = personnes
        .map(p => Number(p.personneID ?? p.id_archi ?? p.id))
        .filter(id => !isNaN(id));

      if (batArchiIds.length === 0 && f.properties.personneID != null) {
        const raw = f.properties.personneID;
        batArchiIds = (Array.isArray(raw) ? raw : [raw]).map(Number);
      }
      return selectedArchiIds.some(selectedId => batArchiIds.includes(selectedId));
    });
  }

  // Mise à jour des données et rendu UI des facettes
  updateArrondissementsData(filteredFeatures);
  updateThesaurusData(filteredFeatures);
  updatePeriodesData(filteredFeatures); // NOUVEAU
  
  renderPeriodesList(); // NOUVEAU

  const thesSearchVal = document.getElementById('thesaurus-search')?.value || '';
  renderThesaurusGroups(thesSearchVal);

  const archiSearchVal = document.getElementById('archi-search')?.value || '';
  renderArchitectesList(archiSearchVal);

  // Le bâtiment ouvert n'a plus sa place dans les nouveaux résultats : on
  // referme sa fiche plutôt que de la laisser affichée hors filtre.
  if (selectedId !== null && !filteredFeatures.some(f => String(f.properties.id_bat) === String(selectedId))) {
    deselectBatiment();
  }

  // Rendu final
  renderCurrentView(filteredFeatures);
  renderActiveTags();

  if (typeof writeStateToHash === 'function') writeStateToHash('replace');
}

/* ─── ÉTAT PARTAGÉ DANS LE HASH D'URL ───────────────────────────────────────
 *
 * L'état complet de l'app — vue, filtres, recherche, bâtiment ouvert — vit dans
 * le hash : #v=mosaic&arr=7,16&an=1900-1914&th=facade,garde-corps&q=leroux&bat=1663
 *
 * Le hash n'étant jamais envoyé au serveur, recharger n'importe quelle URL
 * demande toujours « / » (qui existe) : plus de 404 ni de page d'erreur, sur
 * n'importe quel serveur statique. Les deux vues lisent le même état, donc la
 * bascule carte↔mosaïque conserve filtres et sélection ; un lien reproduit
 * l'état exact.
 */

let applyingState   = false;   // vrai pendant l'application : on n'écrit pas ce qu'on lit
let lastWrittenHash = null;    // dernier hash posé par nous (garde anti-double-application)

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

/* Slugs lisibles pour le thésaurus : « façade » → « facade », « garde-corps » →
   « garde-corps ». Réversibles par rapprochement avec les termes réels du corpus. */
function termSlug(term) {
  return String(term || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // sans accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')                         // séparateurs → tiret
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

/** Écrit l'état courant dans l'URL. `push` empile une entrée d'historique
 *  (sélection, bascule de vue) ; `replace` non (churn des filtres/recherche). */
function writeStateToHash(mode = 'replace') {
  if (applyingState) return;
  const hash = serializeState(currentAppState());
  if (hash === (location.hash || '')) { lastWrittenHash = location.hash; return; }
  lastWrittenHash = hash;
  const url = hash || (location.pathname + location.search);   // hash vide → URL propre
  if (mode === 'push') history.pushState(null, '', url);
  else                 history.replaceState(null, '', url);
}

/** Applique l'état décrit par le hash courant (chargement, Précédent/Suivant). */
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

    // Le hash prend le dessus sur /personne/N s'il contient explicitement
    // une clé "archi" ; sinon on garde ce que applyArchitecteFilterFromPath()
    // a déjà positionné avant cet appel.
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
/** Précédent/Suivant : on ré-applique, sauf si le hash est déjà le nôtre. */
function onHistoryNav() {
  if (location.hash === lastWrittenHash) return;
  applyStateFromHash();
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

