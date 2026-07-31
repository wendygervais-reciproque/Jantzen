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
  { key: 'WPfr',     label: 'Wikipedia',     url: id => `https://fr.wikipedia.org/wiki/${id}` },
  { key: 'pss',      label: 'PSS-Archi',     url: id => `https://www.pss-archi.eu/architecte/${id}` },
  { key: 'wikidata', label: 'Wikidata',      url: id => `https://www.wikidata.org/wiki/${id}` }
];

function buildPersonCard(entry, personne) {
  const card = document.createElement('div');
  card.className = 'person-card';
  const nom = personne.libelle || 'Personne inconnue';

  // La vignette est construite à partir de `media` (nom de fichier local) — et
  // non de `thumb`, qui n'est qu'un chemin Wikimedia conservé pour le crédit.
  // Tant que /public/data/thumb_jpg n'est pas déposé, on retire proprement la
  // vignette au lieu de laisser une image cassée à côté du nom.
  if (personne.media) {
    const thumbBtn = document.createElement('button');
    thumbBtn.type      = 'button';
    thumbBtn.className = 'person-thumb';
    thumbBtn.setAttribute('aria-label', `Agrandir la photographie de ${nom}`);

    const img = document.createElement('img');
    img.src     = personneLocalThumbUrl(personne.media);
    img.alt     = '';
    img.loading = 'lazy';
    img.onerror = function () {
      // Une partie du fonds est en extension capitale : on retente une fois,
      // puis on renonce (le nom et les liens suffisent sans portrait).
      if (/\.jpg$/.test(this.getAttribute('src') || '')) { retryUppercaseJpg(this); return; }
      thumbBtn.remove();
    };
    thumbBtn.appendChild(img);

    // Construit la légende avec le lien Wikidata si l'id est renseigné
    const wikidataRef = PERSON_REFERENCES.find(r => r.key === 'wikidata');
    const wikidataUrl = (wikidataRef && personne.wikidata)
      ? wikidataRef.url(personne.wikidata)
      : null;

    const caption = wikidataUrl
      ? `${nom} © ${wikidataUrl}`
      : nom;

    thumbBtn.onclick = () => openPersonLightbox(personneLocalFullImageUrl(personne.media), {
      name: nom,
      wikidataUrl
    });    
    card.appendChild(thumbBtn);
  }

  const info = document.createElement('div');
  info.className = 'person-info';

  const nameEl = document.createElement('span');
  nameEl.className = 'person-name';
  nameEl.textContent = nom;

  const searchLink = buildSeeAllBuildingsLink(personne, nom);
  if (searchLink) nameEl.appendChild(searchLink);

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
    link.setAttribute('aria-label', `${label} — ${nom} (nouvelle fenêtre)`);
    link.append(label);
    link.insertAdjacentHTML('beforeend', '<svg class="icon icon-external" aria-hidden="true"><use href="#i-external"/></svg>');
    p.appendChild(link);
    if (i < refs.length - 1) p.append(' · ');
  });

  return p;
}


function buildSeeAllBuildingsLink(personne, nom) {
  const archiId = personne.personneID ?? personne.id ?? personne.id_archi;
  if (archiId == null) return null;

  const hash = `#archi=${encodeURIComponent(archiId)}`;
  const fullUrl = `${location.origin}${location.pathname}${location.search}${hash}`;

  const copyIconSVG = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>`;

  const checkIconSVG = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>`;

  const p = document.createElement('span');
  p.className = 'person-action';
  p.append(' ');

  const copyBtn = document.createElement('button');
  copyBtn.type      = 'button';
  copyBtn.className = 'person-copy-link';
  copyBtn.innerHTML = copyIconSVG;
  copyBtn.setAttribute('aria-label', `Copier le lien vers les bâtiments de ${nom}`);
  copyBtn.title = 'Copier le lien';

  let resetTimer = null;

  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);

      clearTimeout(resetTimer);
      copyBtn.innerHTML = checkIconSVG;
      copyBtn.classList.add('copied');
      copyBtn.setAttribute('aria-label', 'Lien copié !');

      resetTimer = setTimeout(() => {
        copyBtn.innerHTML = copyIconSVG;
        copyBtn.classList.remove('copied');
        copyBtn.setAttribute('aria-label', `Copier le lien vers les bâtiments de ${nom}`);
      }, 500);
    } catch (err) {
      console.error('Impossible de copier le lien :', err);
    }
  };

  p.appendChild(copyBtn);
  return p;
}