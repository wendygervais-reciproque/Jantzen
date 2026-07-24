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
  ['info-address', 'info-meta-grid', 'info-elements-tags', 'info-personnes-list'].forEach(id => {
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
  renderInfoPersonnes(data.id_bat, data.personnes);
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

/* ─── PERSONNES LIÉES (architectes) ─────────────────────────────────────── */

const PERSON_REFERENCES = [
  { key: 'orsay',    label: "Musée d'Orsay", url: id => `https://www.musee-orsay.fr/fr/ressources/repertoire-artistes-personnalites/${id}` },
  { key: 'pss',      label: 'PSS-Archi',     url: id => `https://www.pss-archi.eu/architecte/${id}` },
  { key: 'wikidata', label: 'Wikidata',      url: id => `https://www.wikidata.org/wiki/${id}` }
];

/**
 * Résout et affiche les personnes liées au bâtiment (`personnes[].personneID`).
 * Les fiches sont chargées en parallèle puis rendues d'un bloc, pour éviter
 * un panneau qui se peuple ligne par ligne.
 */
async function renderInfoPersonnes(id_bat, personnes) {
  const container = document.getElementById('info-personnes-list');
  const label     = document.getElementById('info-personnes-label');
  if (!container) return;

  container.innerHTML = '';
  const entries = Array.isArray(personnes) ? personnes : [];
  if (label) label.hidden = entries.length === 0;
  if (entries.length === 0) return;

  const people = await Promise.all(entries.map(async entry => {
    try { return { entry, personne: await getPersonne(entry.personneID) }; }
    catch (err) { console.error(err); return null; }
  }));

  // Une autre sélection a pu aboutir pendant le chargement.
  if (String(selectedId) !== String(id_bat)) return;

  people.filter(Boolean).forEach(({ entry, personne }) => {
    container.appendChild(buildPersonCard(entry, personne));
  });
}

function buildPersonCard(entry, personne) {
  const card = document.createElement('div');
  card.className = 'person-card';
  const nom = personne.libelle || 'Personne inconnue';

  if (personne.thumb) {
    const thumbBtn = document.createElement('button');
    thumbBtn.type      = 'button';
    thumbBtn.className = 'person-thumb';
    thumbBtn.setAttribute('aria-label', `Agrandir la photographie de ${nom}`);

    const img = document.createElement('img');
    img.src     = personneThumbUrl(personne.thumb);
    img.alt     = '';
    img.loading = 'lazy';
    thumbBtn.appendChild(img);

    // Même visionneuse que le carrousel, en mode image isolée (pas de navigation).
    thumbBtn.onclick = () => openPersonLightbox(personneFullImageUrl(personne.thumb), nom);
    card.appendChild(thumbBtn);
  }

  const info = document.createElement('div');
  info.className = 'person-info';

  const nameEl = document.createElement('span');
  nameEl.className = 'person-name';
  nameEl.textContent = nom;
  info.appendChild(nameEl);

  if (entry.role) {
    const roleEl = document.createElement('span');
    roleEl.className = 'person-role';
    roleEl.textContent = capitalize(entry.role);
    info.appendChild(roleEl);
  }

  const links = buildPersonLinks(personne, nom);
  if (links) info.appendChild(links);

  card.appendChild(info);
  return card;
}

function buildPersonLinks(personne, nom) {
  const refs = PERSON_REFERENCES
    .map(({ key, label, url }) => personne[key] ? { label, href: url(personne[key]) } : null)
    .filter(Boolean);
  if (refs.length === 0) return null;

  const p = document.createElement('p');
  p.className = 'person-links';
  p.append("Plus d'infos : ");

  refs.forEach(({ label, href }, i) => {
    const link = document.createElement('a');
    link.href        = href;
    link.target      = '_blank';
    link.rel         = 'noopener noreferrer';
    link.textContent = label;
    link.setAttribute('aria-label', `${label} — ${nom} (nouvelle fenêtre)`);
    p.appendChild(link);
    if (i < refs.length - 1) p.append(' · ');
  });

  return p;
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
