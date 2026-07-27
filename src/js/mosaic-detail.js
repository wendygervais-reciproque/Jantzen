/**
 * mosaic-detail.js — Volet de détail de la vue mosaïque.
 *
 * Propre à la vue mosaïque : rassemble dans un volet gauche docké les
 * informations du bâtiment sélectionné et ses photographies (empilées, puis
 * réparties en rangées quand le volet est élargi). La vue carte conserve, elle,
 * sa fiche flottante et son carrousel coverflow — ce module ne les touche pas.
 */

/* ⚙️ RÉGLAGES — largeur du volet détail (gauche) de la mosaïque, en pixels. */
const MD_MIN = 400, MD_MAX = 900;   // défaut = min ; la tirette n'élargit que
const PANEL_STEP = 40;              // pas de redimensionnement au clavier

/* ─── OUVERTURE / FERMETURE ─────────────────────────────────────────────── */

async function openMosaicDetail(id_bat) {
  const panel = document.getElementById('mosaic-detail');
  if (!panel) return;

  panel.hidden = false;
  document.getElementById('app')?.classList.add('has-detail');

  const info   = document.getElementById('md-info');
  const photos = document.getElementById('md-photos');
  const label  = document.getElementById('md-photos-label');
  if (info)   info.innerHTML = '<p class="md-loading">Chargement…</p>';
  if (photos) photos.innerHTML = '';
  if (label)  label.hidden = true;

  let data;
  try {
    data = await getBatiment(id_bat);
  } catch {
    if (info) info.innerHTML = '<p class="md-loading">Erreur de chargement.</p>';
    return;
  }
  // Une autre sélection a pu aboutir entre-temps.
  if (String(selectedId) !== String(id_bat)) return;

  renderMosaicInfo(data);
  renderMosaicPhotos(data);
  panel.scrollTop = 0;
}

function closeMosaicDetail() {
  const panel = document.getElementById('mosaic-detail');
  if (panel) panel.hidden = true;
  document.getElementById('app')?.classList.remove('has-detail');
}

/* ─── RENDU DES INFOS ───────────────────────────────────────────────────── */

function renderMosaicInfo(data) {
  const host = document.getElementById('md-info');
  if (!host) return;
  host.innerHTML = '';

  const title = document.createElement('h2');
  title.className   = 'md-title';
  title.textContent = data.libelle || 'Bâtiment sans nom';
  host.appendChild(title);

  const adresse = data.adresse;
  const addrText = (adresse && typeof adresse === 'object')
    ? (adresse.affichage || adresse.voie || '')
    : (adresse || '');
  if (addrText) {
    const p = document.createElement('p');
    p.className   = 'md-address';
    p.textContent = addrText;
    host.appendChild(p);
  }

  const cells = [
    ['Ensemble',             data.ensemble],
    ['Date de construction', data.dateConstruction],
    ['Arrondissement',       data.arrondissement ? ordinalArr(Number(data.arrondissement)) : null]
  ].filter(([, value]) => value);

  if (cells.length) {
    const grid = document.createElement('div');
    grid.className = 'info-meta-grid';
    grid.innerHTML = cells.map(([label, value]) => `
      <div class="info-meta-cell">
        <span class="info-meta-label">${label}</span>
        <span class="info-meta-value">${value}</span>
      </div>`).join('');
    host.appendChild(grid);
  }

  renderMosaicPersonnes(host, data);
  renderMosaicElements(host, data.terme_jantzen_bat || []);
}

function renderMosaicPersonnes(host, data) {
  const personnes = Array.isArray(data.personnes) ? data.personnes : [];
  if (personnes.length === 0) return;

  const label = document.createElement('span');
  label.className   = 'info-elements-label';
  label.textContent = 'Personnes';
  host.appendChild(label);

  const list = document.createElement('div');
  list.className = 'info-personnes';
  host.appendChild(list);

  // buildPersonCard (ui.js) est réutilisé tel quel : vignette + nom + rôle +
  // liens vers les référentiels.
  Promise.all(personnes.map(async entry => {
    try { return { entry, personne: await getPersonne(entry.personneID) }; }
    catch (err) { console.error(err); return null; }
  })).then(people => {
    if (String(selectedId) !== String(data.id_bat)) return;
    people.filter(Boolean).forEach(({ entry, personne }) => {
      list.appendChild(buildPersonCard(entry, personne));
    });
  });
}

function renderMosaicElements(host, terms) {
  if (terms.length === 0) return;

  const label = document.createElement('span');
  label.className   = 'info-elements-label';
  label.textContent = 'Éléments architecturaux (Index Jantzen)';
  host.appendChild(label);

  const tags = document.createElement('div');
  tags.className = 'info-elements';
  terms.forEach(term => {
    const tag = document.createElement('button');
    tag.type        = 'button';
    tag.className   = 'info-element-tag';
    tag.textContent = capitalize(term);
    // Un clic bascule le terme dans le filtre thésaurus (volet droit).
    tag.onclick = () => {
      const chip = document.querySelector(`.chip[data-id="${CSS.escape(term)}"]`);
      if (!chip) return;
      openFilterSection('thésaurus');
      toggleThesaurusChip(chip, term);
    };
    tags.appendChild(tag);
  });
  host.appendChild(tags);
}

/* ─── RENDU DES PHOTOS ──────────────────────────────────────────────────── */

function renderMosaicPhotos(data) {
  const host  = document.getElementById('md-photos');
  const label = document.getElementById('md-photos-label');
  if (!host) return;
  host.innerHTML = '';

  const photos = Array.isArray(data.photos) ? data.photos : [];
  if (label) {
    label.hidden      = photos.length === 0;
    label.textContent = `Photos du ${data.libelle || 'bâtiment'}`;
  }
  if (photos.length === 0) return;

  // Liste normalisée pour la visionneuse : même ordre que la galerie.
  const gallery = photos.map(ph => ({
    src:     photoUrl(ph.id_pic),
    caption: (ph.IndexJantzen || []).map(capitalize).join(' · ')
  }));

  photos.forEach((ph, i) => {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'md-photo';
    btn.setAttribute('aria-label', gallery[i].caption
      ? `Agrandir la photographie : ${gallery[i].caption}`
      : 'Agrandir la photographie');

    const img = document.createElement('img');
    img.alt      = gallery[i].caption || '';
    img.loading  = 'lazy';
    img.decoding = 'async';
    img.src      = gallery[i].src;
    img.onerror  = function () { retryUppercaseJpg(this); };
    btn.appendChild(img);

    btn.onclick = () => openGalleryLightbox(gallery, i);
    host.appendChild(btn);
  });
}

/* ─── REDIMENSIONNEMENT (tirette) ───────────────────────────────────────── */

/**
 * Rend une poignée `role="separator"` fonctionnelle :
 *   • glissement au pointeur — largeur en continu, bornée [min, max] ;
 *   • flèches / Origine / Fin au clavier — pas discrets, pour l'accessibilité.
 *
 * @param {{cssVar, min, max, step, invert}} opts  invert : la poignée est sur
 *        le bord gauche du volet (glisser vers la gauche élargit).
 */
function initPanelResize(handle, { cssVar, min, max, step, invert }) {
  if (!handle) return;
  const root = document.documentElement;

  const getW = () => parseFloat(getComputedStyle(root).getPropertyValue(cssVar)) || min;
  const setW = w => {
    w = Math.round(Math.min(max, Math.max(min, w)));
    root.style.setProperty(cssVar, `${w}px`);
    handle.setAttribute('aria-valuenow', String(w));
  };

  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = getW();
    try { handle.setPointerCapture(e.pointerId); } catch { /* pas de pointeur réel */ }

    // Écoute sur window : le pointeur quitte forcément la fine poignée pendant
    // le glissement, les mouvements doivent continuer d'arriver.
    const onMove = ev => {
      const dx = ev.clientX - startX;
      setW(startW + (invert ? -dx : dx));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  handle.addEventListener('keydown', e => {
    let w = getW();
    switch (e.key) {
      case 'ArrowRight': w += invert ? -step : step; break;
      case 'ArrowLeft':  w += invert ? step : -step; break;
      case 'Home':       w = min; break;
      case 'End':        w = max; break;
      default: return;
    }
    e.preventDefault();
    setW(w);
  });
}

function bindMosaicDetail() {
  document.getElementById('mosaic-detail-close')?.addEventListener('click', deselectBatiment);

  initPanelResize(document.getElementById('mosaic-detail-handle'),
    { cssVar: '--md-w', min: MD_MIN, max: MD_MAX, step: PANEL_STEP, invert: false });
}
