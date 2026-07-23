/**
 * app.js - Adapté au nouveau jeu de données (id_bat numérique & photos dans photo_jpg)
 * Point d'entrée de l'application — initialisation asynchrone.
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
  buildThesaurusFilter();
  renderMapFeatures(ALL_FEATURES);
  renderResults(ALL_FEATURES);

  // ── Recherche ───────────────────────────────────────────────────────────
  document.getElementById('search-input').addEventListener('input', onSearch);
  document.getElementById('search-clear').addEventListener('click', clearSearch);

  // ── Panneau de détail ───────────────────────────────────────────────────
  const detailClose = document.getElementById('detail-close');
  if (detailClose) detailClose.addEventListener('click', closeDetail);

  // ── Panneau de filtres (collapse) ───────────────────────────────────────
  const filtersBody   = document.getElementById('filters-body');
  const filtersToggle = document.getElementById('filters-toggle');
  if (filtersToggle && filtersBody) {
    filtersToggle.addEventListener('click', () => {
      const collapsed = filtersBody.classList.toggle('collapsed');
      filtersToggle.textContent = collapsed ? '+' : '−';
      filtersToggle.setAttribute('aria-expanded', String(!collapsed));
    });
  }

  // ── Pages overlay ───────────────────────────────────────────────────────
  const pageOverlayClose = document.getElementById('page-overlay-close');
  if (pageOverlayClose) {
    pageOverlayClose.addEventListener('click', () => showPage('carte'));
  }

  // ── Tirette de redimensionnement du bandeau bas ─────────────────────────
  const stripResizer = document.getElementById('strip-resizer');
  const strip        = document.getElementById('results-strip');

  if (stripResizer && strip) {
    stripResizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = strip.getBoundingClientRect().height;
      stripResizer.classList.add('dragging');
      document.body.style.cursor    = 'row-resize';
      document.body.style.userSelect = 'none';

      function onMove(ev) {
        const delta = startY - ev.clientY;
        const newH  = Math.max(80, Math.min(500, startH + delta));
        strip.style.height = newH + 'px';
      }

      function onUp() {
        stripResizer.classList.remove('dragging');
        document.body.style.cursor    = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }
});

/* ─── RECHERCHE ─────────────────────────────────────────────────────────── */

function onSearch(e) {
  searchQuery = e.target.value.trim();
  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) clearBtn.style.display = searchQuery ? 'flex' : 'none';
  applyFilters();
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  searchQuery = '';
  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  applyFilters();
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
  if (typeof activeFilters !== 'undefined' && activeFilters.arrondissements && activeFilters.arrondissements.size > 0) {
    features = features.filter(f =>
      activeFilters.arrondissements.has(Number(f.properties.arrondissement))
    );
  }

  // 3. Filtre thésaurus (Index Jantzen)
  // On gère à la fois activeFilters.thesaurus et activeFilters.terme_jantzen_bat
  const selectedTerms = activeFilters?.thesaurus || activeFilters?.terme_jantzen_bat;

  if (selectedTerms && selectedTerms.size > 0) {
    features = features.filter(f => {
      const batTerms = f.properties.terme_jantzen_bat || [];
      // Au moins un des termes cochés doit faire partie des termes du bâtiment
      return batTerms.some(term => selectedTerms.has(term));
    });
  }

  renderResults(features);
  renderMapFeatures(features);
  if (typeof renderActiveTags === 'function') renderActiveTags();
}

/* ─── CHARGEMENT DE LA FICHE BÂTIMENT DÉTAILLÉE ─────────────────────────── */

/**
 * Fonction à appeler lors du clic sur un bâtiment pour charger
 * son fichier JSON individuel (ex: /batiments/id_bat_1.json)
 */
async function loadBatimentDetail(id_bat) {
  try {
    const response = await fetch(`./batiments/id_bat_${id_bat}.json`);
    if (!response.ok) throw new Error(`Fichier id_bat_${id_bat}.json introuvable`);
    
    const batData = await response.json();
    
    // Exemple d'utilisation : ouvrir le volet de détail avec les photos du dossier /photo_jpg/
    if (typeof openDetailPanel === 'function') {
      openDetailPanel(batData);
    }
  } catch (err) {
    console.error(`Erreur lors du chargement de la fiche du bâtiment ${id_bat}:`, err);
  }
}