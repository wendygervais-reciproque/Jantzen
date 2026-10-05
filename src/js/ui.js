/**
 * ui.js — Sélection d'un bâtiment 
 */

let selectedId = null;

/* ─── SÉLECTION ─────────────────────────────────────────────────────────── */

function selectBatiment(id_bat) {
  selectedId = id_bat;

  document.querySelectorAll('.mosaic-tile').forEach(el => {
    el.classList.toggle('is-active', String(el.dataset.id) === String(id_bat));
  });

  // moveFocus: true — nouvelle sélection franche, comme l'ouverture d'une
  // modale/lightbox : le focus doit entrer dans le volet qui s'ouvre
  presentSelection(id_bat, true);
  if (typeof writeStateToHash === 'function') writeStateToHash('push');
}

function presentSelection(id_bat, moveFocus = false) {
  if (currentView === 'map' && typeof flyToFeature === 'function') flyToFeature(id_bat);
  openMosaicDetail(id_bat, { moveFocus });
  // Le POI du bâtiment ouvert reste « activé »
  if (typeof refreshPoiActive === 'function') refreshPoiActive();
}

function deselectBatiment() {
  selectedId = null;
  document.querySelectorAll('.mosaic-tile').forEach(el => el.classList.remove('is-active'));
  clearSelectionSurfaces();
  if (typeof writeStateToHash === 'function') writeStateToHash('push');
}

function clearSelectionSurfaces() {
  if (typeof closeMosaicDetail === 'function') closeMosaicDetail();
  if (typeof closeAllPopups === 'function' && currentView === 'map') closeAllPopups();
  if (typeof clearPoiFocus === 'function') clearPoiFocus();
}

/* ─── PERSONNES LIÉES (architectes) ─────────────────────────────────────── */

const PERSON_REFERENCES = [
  { key: 'orsay',    label: "Musée d'Orsay", url: id => `https://www.musee-orsay.fr/fr/ressources/repertoire-artistes-personnalites/${id}` },
  { key: 'WPfr',     label: 'Wikipedia',     url: id => `https://fr.wikipedia.org/wiki/${id}` },
  { key: 'pss',      label: 'PSS-Archi',     url: id => `https://www.pss-archi.eu/architecte/${id}` },
  { key: 'wikidata', label: 'Wikidata',      url: id => `https://www.wikidata.org/wiki/${id}` }
];

function buildPersonCard(entry, personne) {
  const card = document.createElement('div');
  card.className = 'person-card';
  const nom = personne.libelle || 'Personne inconnue';

  card.appendChild(buildPersonThumb(personne, nom));

  const info = document.createElement('div');
  info.className = 'person-info';

  const nameLabel = entry.role ? `${nom} (${entry.role})` : nom;
  const nameEl = buildPersonFilterButton(personne, nom, nameLabel);
  info.appendChild(nameEl);

  const links = buildPersonLinks(personne, nom);
  if (links) info.appendChild(links);

  card.appendChild(info);
  return card;
}

function buildPersonThumb(personne, nom) {
  if (!personne.media) return buildPersonThumbPlaceholder();

  const wikidataRef = PERSON_REFERENCES.find(r => r.key === 'wikidata');
  const wikidataMediaUrl = (wikidataRef && personne.wikidata)
    ? `${wikidataRef.url(personne.wikidata)}#/media/File:${decodeURIComponent(personne.media).replace(/ /g, '_')}`
    : null;
  if (!wikidataMediaUrl) return buildPersonThumbPlaceholder();

  const thumbLink = document.createElement('a');
  thumbLink.className = 'person-thumb';
  thumbLink.href       = wikidataMediaUrl;
  thumbLink.target     = '_blank';
  thumbLink.rel        = 'noopener noreferrer';
  thumbLink.setAttribute('aria-label', `Voir la photographie de ${nom} sur Wikidata (nouvelle fenêtre)`);

  const img = document.createElement('img');
  img.src     = personneLocalThumbUrl(personne.media);
  img.alt     = '';
  img.loading = 'lazy';
  img.onerror = function () {
    thumbLink.replaceWith(buildPersonThumbPlaceholder());
  };
  thumbLink.appendChild(img);

  return thumbLink;
}

function buildPersonThumbPlaceholder() {
  const el = document.createElement('div');
  el.className = 'person-thumb person-thumb-placeholder';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-person"/></svg>';
  return el;
}

function buildPersonLinks(personne, nom) {
  const refs = PERSON_REFERENCES
    .map(({ key, label, url }) => personne[key] ? { label, href: url(personne[key]) } : null)
    .filter(Boolean);
  if (refs.length === 0) return null;

  const p = document.createElement('p');
  p.className = 'person-links';

  refs.forEach(({ label, href }, i) => {
    const link = document.createElement('a');
    link.href        = href;
    link.target      = '_blank';
    link.rel         = 'noopener noreferrer';
    link.setAttribute('aria-label', `${label} — ${nom} (nouvelle fenêtre)`);
    link.append(label);
    link.insertAdjacentHTML('beforeend', '<svg class="icon icon-external" aria-hidden="true"><use href="#i-external"/></svg>');
    p.appendChild(link);
    if (i < refs.length - 1) p.append(' · ');
  });

  return p;
}

function buildPersonFilterButton(personne, nom, label) {
  const archiId = personne.personneID ?? personne.id ?? personne.id_archi;
  if (archiId == null) {
    const span = document.createElement('span');
    span.className = 'person-name';
    span.textContent = label;
    return span;
  }

  const numericId = Number(archiId);

  const btn = document.createElement('button');
  btn.type      = 'button';
  btn.className = 'person-name';
  btn.textContent = label;

  btn.onclick = () => {
    activeFilters.architectes.add(numericId);
    if (typeof applyFilters === 'function') applyFilters();
  };

  attachTooltip(btn, `Filtrer les bâtiments de ${nom}`);
  btn.setAttribute('aria-label', `Filtrer les bâtiments de ${nom}`);

  return btn;
}