/**
 * ui.js — Sélection d'un bâtiment.
 *
 * Le détail (infos + photos) est un composant unique, partagé par les deux
 * vues — voir mosaic-detail.js, dont le nom garde la trace de son origine
 * (volet gauche docké de la vue mosaïque) mais qui présente désormais aussi le
 * bâtiment sélectionné en vue carte. Ce fichier ne garde que la sélection
 * elle-même, et les utilitaires réutilisés par mosaic-detail.js (cards
 * « personnes liées »).
 */

let selectedId = null;

/* ─── SÉLECTION ─────────────────────────────────────────────────────────── */

function selectBatiment(id_bat) {
  selectedId = id_bat;

  document.querySelectorAll('.mosaic-tile').forEach(el => {
    el.classList.toggle('is-active', String(el.dataset.id) === String(id_bat));
  });

  presentSelection(id_bat);
  if (typeof writeStateToHash === 'function') writeStateToHash('push');
}

/**
 * Affiche le bâtiment sélectionné : volet détail (commun aux deux vues), et,
 * en vue carte, recentrage sur son marqueur. Séparé de selectBatiment pour
 * pouvoir ré-afficher à l'identique lors d'une bascule de vue, sans repasser
 * par la sélection (ni ré-écrire l'URL).
 */
function presentSelection(id_bat) {
  if (currentView === 'map' && typeof flyToFeature === 'function') flyToFeature(id_bat);
  openMosaicDetail(id_bat);
  // Le POI du bâtiment ouvert reste « activé » (utile quand la card est fermée).
  if (typeof refreshPoiActive === 'function') refreshPoiActive();
}

function deselectBatiment() {
  selectedId = null;
  document.querySelectorAll('.mosaic-tile').forEach(el => el.classList.remove('is-active'));
  clearSelectionSurfaces();
  if (typeof writeStateToHash === 'function') writeStateToHash('push');
}

/** Ferme toutes les surfaces de détail sans toucher selectedId. */
function clearSelectionSurfaces() {
  if (typeof closeMosaicDetail === 'function') closeMosaicDetail();
  if (typeof closeAllPopups === 'function' && currentView === 'map') closeAllPopups();
  if (typeof clearPoiFocus === 'function') clearPoiFocus();
}

/* ─── PERSONNES LIÉES (architectes) ─────────────────────────────────────── */

const PERSON_REFERENCES = [
  { key: 'orsay',    label: "Musée d'Orsay", url: id => `https://www.musee-orsay.fr/fr/ressources/repertoire-artistes-personnalites/${id}` },
  { key: 'pss',      label: 'PSS-Archi',     url: id => `https://www.pss-archi.eu/architecte/${id}` },
  { key: 'wikidata', label: 'Wikidata',      url: id => `https://www.wikidata.org/wiki/${id}` }
];

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

    // Même visionneuse que la galerie photo, en mode image isolée (pas de navigation).
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
