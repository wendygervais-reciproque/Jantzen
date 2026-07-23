/**
 * ui.js — Sélection d'un bâtiment et panneau « infos bâtiment ».
 *
 * La fiche est découpée en deux surfaces indépendantes :
 *   • #info-panel (ce fichier)  — identité et métadonnées du bâtiment ;
 *   • #carousel   (carousel.js) — ses photographies, filtrables par élément.
 */

let selectedId = null;

/* ─── SÉLECTION ─────────────────────────────────────────────────────────── */

/**
 * @param {number|string} id_bat
 * @param {{fullscreen?: boolean}} [options] — ouvre directement la visionneuse
 *        (comportement du clic depuis la mosaïque).
 */
function selectBatiment(id_bat, options = {}) {
  selectedId = id_bat;

  document.querySelectorAll('.mosaic-tile').forEach(el => {
    el.classList.toggle('is-active', String(el.dataset.id) === String(id_bat));
  });

  if (currentView === 'map') {
    if (typeof flyToFeature === 'function')   flyToFeature(id_bat);
    if (typeof openMarkerPopup === 'function') openMarkerPopup(id_bat);
  }

  loadDetailAndShow(id_bat, options);
}

function deselectBatiment() {
  selectedId = null;
  document.querySelectorAll('.mosaic-tile').forEach(el => el.classList.remove('is-active'));
  closeInfoPanel();
  closeCarousel();
  if (typeof closeAllPopups === 'function' && currentView === 'map') closeAllPopups();
}

/* ─── CHARGEMENT DE LA FICHE ────────────────────────────────────────────── */

async function loadDetailAndShow(id_bat, options = {}) {
  const panel = document.getElementById('info-panel');
  if (!panel) return;

  panel.hidden = false;
  const title = document.getElementById('info-title');
  if (title) title.textContent = 'Chargement…';
  ['info-address', 'info-meta-grid', 'info-elements-tags'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  try {
    const data = await getBatiment(id_bat);
    // Une autre sélection a pu aboutir entre-temps : on ignore la réponse obsolète.
    if (String(selectedId) !== String(id_bat)) return;

    showInfoPanel(data);
    openCarousel(data);
    if (options.fullscreen) openLightbox();
  } catch (err) {
    console.error(err);
    if (title) title.textContent = `Erreur de chargement (bâtiment ${id_bat})`;
  }
}

/* ─── PANNEAU INFOS ─────────────────────────────────────────────────────── */

function showInfoPanel(data) {
  const elTitle   = document.getElementById('info-title');
  const elAddress = document.getElementById('info-address');
  const elMeta    = document.getElementById('info-meta-grid');

  if (elTitle) elTitle.textContent = data.libelle || 'Bâtiment sans nom';

  if (elAddress) {
    const adresse = data.adresse;
    elAddress.textContent = (adresse && typeof adresse === 'object')
      ? (adresse.affichage || adresse.voie || '')
      : (adresse || '');
  }

  if (elMeta) {
    const cells = [
      ['Ensemble',            data.ensemble],
      ['Date de construction', data.dateConstruction],
      ['Arrondissement',      data.arrondissement ? ordinalArr(Number(data.arrondissement)) : null]
    ].filter(([, value]) => value);

    elMeta.innerHTML = cells.map(([label, value]) => `
      <div class="info-meta-cell">
        <span class="info-meta-label">${label}</span>
        <span class="info-meta-value">${value}</span>
      </div>`).join('');
  }

  renderInfoElements(data.terme_jantzen_bat || []);
}

function renderInfoElements(terms) {
  const container = document.getElementById('info-elements-tags');
  const label     = document.getElementById('info-elements-label');
  if (!container) return;

  container.innerHTML = '';
  if (label) label.hidden = terms.length === 0;
  if (terms.length === 0) return;

  terms.forEach(term => {
    const tag = document.createElement('button');
    tag.type        = 'button';
    tag.className   = 'info-element-tag';
    tag.textContent = capitalize(term);
    // Un clic sur un terme le bascule dans le filtre global du thésaurus.
    tag.onclick = () => {
      const chip = document.querySelector(`.chip[data-id="${CSS.escape(term)}"]`);
      if (!chip) return;
      openFilterSection('thésaurus');
      toggleThesaurusChip(chip, term);
    };
    container.appendChild(tag);
  });
}

function closeInfoPanel() {
  const panel = document.getElementById('info-panel');
  if (panel) panel.hidden = true;
}

/* ─── UTILITAIRES ───────────────────────────────────────────────────────── */

function openFilterSection(labelMatch) {
  document.querySelectorAll('.filter-section-header').forEach(btn => {
    const label = btn.querySelector('.filter-section-label')?.textContent.toLowerCase() || '';
    if (!label.includes(labelMatch.toLowerCase())) return;

    const body = btn.nextElementSibling;
    if (body && !body.classList.contains('open')) {
      body.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
}
