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

  // moveFocus: true — nouvelle sélection franche, comme l'ouverture d'une
  // modale/lightbox : le focus doit entrer dans le volet qui s'ouvre.
  presentSelection(id_bat, true);
  if (typeof writeStateToHash === 'function') writeStateToHash('push');
}

/**
 * Affiche le bâtiment sélectionné : volet détail (commun aux deux vues), et,
 * en vue carte, recentrage sur son marqueur. Séparé de selectBatiment pour
 * pouvoir ré-afficher à l'identique lors d'une bascule de vue, sans repasser
 * par la sélection (ni ré-écrire l'URL) — d'où `moveFocus`, à false par
 * défaut : cette ré-présentation ne doit pas voler le focus à l'utilisateur.
 */
function presentSelection(id_bat, moveFocus = false) {
  if (currentView === 'map' && typeof flyToFeature === 'function') flyToFeature(id_bat);
  openMosaicDetail(id_bat, { moveFocus });
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

/**
 * Vignette 56 × 56 : la photo si `media` est renseigné (lien, ouvre la page
 * média Wikidata dans un nouvel onglet), sinon — ou si son chargement échoue
 * — une silhouette de repli statique, pour qu'une carte personne ait
 * toujours sa vignette.
 */
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
    // 1 seule requête : en échec, on renonce à la photo au profit de la
    // silhouette de repli (pas de nouvelle tentative réseau).
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


/**
 * Nom de la personne (fiche bâtiment) : un bouton — pas un lien, puisqu'il ne
 * change pas de ressource mais met à jour le filtre « Architectes & Artistes »
 * de la page courante — qui active le filtre sur cette personne au clic.
 * Garde le style « titre » (`.person-name`, couleur primary) ; le survol/focus
 * ne fait que souligner et affiche une infobulle expliquant l'action (motif
 * accessible `attachTooltip`, déjà utilisé ailleurs dans le volet détail :
 * déclenché au clavier comme à la souris, fermeture à Échap — RGAA 7.1/7.3,
 * 12.9). Si l'identifiant est introuvable, repli sur un simple texte statique.
 */
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

  // attachTooltip() fige d'abord le nom accessible sur le texte visible seul
  // (motif standard, cf. mosaic-detail.js) : on le renforce ensuite pour que
  // l'action soit sans ambiguïté même si l'infobulle (aria-describedby)
  // n'est pas restituée par la techno d'assistance.
  attachTooltip(btn, `Filtrer les bâtiments de ${nom}`);
  btn.setAttribute('aria-label', `Filtrer les bâtiments de ${nom}`);

  return btn;
}