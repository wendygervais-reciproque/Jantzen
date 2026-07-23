/**
 * ui.js - Adapté au nouveau jeu de données (id_bat, photo_jpg & batiments/id_bat_X.json)
 * Rendu des résultats, du panneau de détail et de la galerie.
 */

let selectedId = null;

const MAX_RESULTS = 100;

/* ─── RÉSULTATS (bandeau horizontal) ────────────────────────────────────── */

function renderResults(features) {
  const track = document.getElementById('results-track');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('search-results-count');

  if (!track) return;
  track.innerHTML = '';

  if (count) {
    count.textContent = features.length === ALL_FEATURES.length
      ? ''
      : `${features.length} résultat${features.length > 1 ? 's' : ''}`;
  }

  if (features.length === 0) {
    if (empty) empty.classList.add('visible');
    return;
  }
  if (empty) empty.classList.remove('visible');

  const slice = features.slice(0, MAX_RESULTS);
  slice.forEach(f => {
    const p = f.properties;
    
    // Récupération des 3 premiers termes Jantzen du bâtiment
    const terms = (p.terme_jantzen_bat || []).slice(0, 3).map(term => 
      term.charAt(0).toUpperCase() + term.slice(1)
    );

    const card = document.createElement('div');
    card.className = 'result-card';
    if (String(selectedId) === String(p.id_bat)) card.classList.add('active');
    
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', p.libelle || `Bâtiment ${p.id_bat}`);
    card.dataset.id = p.id_bat;

    // Construction de l'image de couverture si image_ref existe
    const thumbSrc = p.image_ref ? `${DATA_BASE}/photo_jpg/${p.image_ref}.jpg` : null;

    card.innerHTML = `
      <div class="result-card-thumb">
        ${thumbSrc 
          ? `<img src="${thumbSrc}" alt="" onerror="this.parentElement.innerHTML='<span class=\"no-img\">☐</span>'"/>` 
          : '<span class="no-img">☐</span>'}
      </div>
      <span class="result-card-arr">${p.arrondissement ? p.arrondissement + (p.arrondissement === 1 ? 'er' : 'e') : ''}</span>
      <div class="result-card-info">
        <div class="result-card-name">${p.libelle || 'Bâtiment sans nom'}</div>
        ${p.ensemble ? `<div class="result-card-meta">${p.ensemble}</div>` : ''}
        <div class="result-card-meta">${terms.join(' · ')}</div>
      </div>`;

    card.onclick   = () => selectBatiment(p.id_bat);
    card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') selectBatiment(p.id_bat); };
    track.appendChild(card);
  });

  if (features.length > MAX_RESULTS) {
    const more = document.createElement('div');
    more.className   = 'results-more';
    more.textContent = `+${features.length - MAX_RESULTS} autres — affinez les filtres`;
    track.appendChild(more);
  }
}

/* ─── SÉLECTION ─────────────────────────────────────────────────────────── */

function selectBatiment(id_bat) {
  selectedId = id_bat;

  document.querySelectorAll('.result-card').forEach(el => {
    el.classList.toggle('active', String(el.dataset.id) === String(id_bat));
  });

  const active = document.querySelector('.result-card.active');
  if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

  if (typeof flyToFeature === 'function') flyToFeature(id_bat);
  if (typeof openMarkerPopup === 'function') openMarkerPopup(id_bat);
  loadDetailAndShow(id_bat);
}

/* ─── PANNEAU DE DÉTAIL — chargement asynchrone ─────────────────────────── */

async function loadDetailAndShow(id_bat) {
  const panel = document.getElementById('detail-panel');
  if (!panel) return;
  
  panel.classList.add('visible');
  panel.setAttribute('aria-hidden', 'false');

  // Affichage immédiat de l'état de chargement
  const elTitle   = document.getElementById('detail-title');
  const elAddress = document.getElementById('detail-address');
  const elGallery = document.getElementById('detail-gallery');
  const elMeta    = document.getElementById('detail-meta-grid');
  const elTags    = document.getElementById('detail-elements-tags');
  const elLabel   = document.getElementById('detail-elements-label');

  if (elTitle)   elTitle.textContent   = 'Chargement…';
  if (elAddress) elAddress.textContent = '';
  if (elGallery) elGallery.innerHTML   = '';
  if (elMeta)    elMeta.innerHTML      = '';
  if (elTags)    elTags.innerHTML      = '';
  if (elLabel)   elLabel.style.display = 'none';

  try {
    // ⚠️ ADAPTATION : Nom du fichier individuel généré par le script Python
    const response = await fetch(`${DATA_BASE}/batiments/id_bat_${id_bat}.json`);
    if (!response.ok) throw new Error(`Fiche bâtiment id_bat_${id_bat}.json introuvable`);
    
    const data = await response.json();
    showDetailPanel(data);
  } catch (err) {
    console.error(err);
    if (elTitle) elTitle.textContent = `Erreur de chargement (Bâtiment ${id_bat})`;
  }
}

function showDetailPanel(data) {
  const elTitle   = document.getElementById('detail-title');
  const elAddress = document.getElementById('detail-address');
  const elMeta    = document.getElementById('detail-meta-grid');
  const elDesc    = document.getElementById('detail-description');

  if (elTitle)   elTitle.textContent   = data.libelle || 'Bâtiment sans nom';
  
  // Formatage de l'adresse (gestion objet ou chaîne)
  if (elAddress) {
    if (typeof data.adresse === 'object' && data.adresse !== null) {
      elAddress.textContent = data.adresse.affichage || data.adresse.voie || '';
    } else {
      elAddress.textContent = data.adresse || '';
    }
  }

  // Métadonnées : ensemble, dates, architectes
  if (elMeta) {
    let metaHTML = '';
    if (data.ensemble) {
      metaHTML += `<div class="detail-meta-cell">
         <span class="detail-meta-label">Ensemble</span>
         <span class="detail-meta-value">${data.ensemble}</span>
       </div>`;
    }
    if (data.dateConstruction) {
      metaHTML += `<div class="detail-meta-cell">
         <span class="detail-meta-label">Date de construction</span>
         <span class="detail-meta-value">${data.dateConstruction}</span>
       </div>`;
    }
    elMeta.innerHTML = metaHTML;
  }

  if (elDesc) elDesc.textContent = '';

  // Mots-clés Jantzen / Éléments architecturaux
  const tagsContainer = document.getElementById('detail-elements-tags');
  const label         = document.getElementById('detail-elements-label');

  if (tagsContainer) {
    tagsContainer.innerHTML = '';
    const terms = data.terme_jantzen_bat || [];

    if (terms.length > 0) {
      if (label) {
        label.textContent   = 'Éléments architecturaux (Index Jantzen)';
        label.style.display = 'block';
      }

      terms.forEach(term => {
        const tag       = document.createElement('span');
        tag.className   = 'detail-element-tag';
        tag.textContent = term.charAt(0).toUpperCase() + term.slice(1);
        
        // Clic sur un tag : filtre la carte par ce terme
        tag.onclick = () => {
          const btn = document.querySelector(`.chip[data-id="${term}"]`);
          if (btn) {
            openFilterSection('thésaurus');
            if (typeof toggleThesaurusChip === 'function') {
              toggleThesaurusChip(btn, term);
            }
          }
        };
        tagsContainer.appendChild(tag);
      });
    } else if (label) {
      label.style.display = 'none';
    }
  }

  renderGallery(data.photos || []);
}

function closeDetail() {
  const panel = document.getElementById('detail-panel');
  if (panel) {
    panel.classList.remove('visible');
    panel.setAttribute('aria-hidden', 'true');
  }
  selectedId = null;
  document.querySelectorAll('.result-card').forEach(el => el.classList.remove('active'));
  if (typeof closeAllPopups === 'function') closeAllPopups();
}

/* ─── GALERIE ───────────────────────────────────────────────────────────── */

function renderGallery(photos) {
  const container = document.getElementById('detail-gallery');
  if (!container) return;
  container.innerHTML = '';

  if (!photos || photos.length === 0) {
    container.innerHTML = '<div class="no-photo">Aucune photo disponible</div>';
    return;
  }

  let currentIdx = 0;

  const img = document.createElement('img');
  img.alt = '';
  setGalleryImg(img, photos[0]);
  container.appendChild(img);

  if (photos.length > 1) {
    const nav = document.createElement('div');
    nav.className = 'gallery-nav';

    photos.forEach((photo, i) => {
      const dot = document.createElement('button');
      dot.className = 'gallery-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', `Photo ${i + 1}`);
      dot.onclick = () => {
        currentIdx = i;
        setGalleryImg(img, photo);
        container.querySelectorAll('.gallery-dot')
          .forEach((d, j) => d.classList.toggle('active', j === i));
        
        const cnt = document.getElementById('gallery-count-txt');
        if (cnt) cnt.textContent = `${i + 1} / ${photos.length}`;
      };
      nav.appendChild(dot);
    });
    container.appendChild(nav);

    const cnt = document.createElement('span');
    cnt.className   = 'gallery-count';
    cnt.id          = 'gallery-count-txt';
    cnt.textContent = `1 / ${photos.length}`;
    container.appendChild(cnt);
  }
}

function setGalleryImg(imgEl, photo) {
  // Extraire l'ID numérique de l'image ("image_6813" -> "6813")
  const imgId = photo.id_pic ? photo.id_pic.replace('image_', '') : photo.id;
  
  // ⚠️ ADAPTATION : Nouveau dossier photo_jpg
  imgEl.src = `${DATA_BASE}/photo_jpg/${imgId}.jpg`;
  
  imgEl.onerror = function () {
    // Fallback majuscule .JPG ou .jpeg si nécessaire
    if (!this.src.endsWith('.JPG')) {
      this.src = `${DATA_BASE}/photo_jpg/${imgId}.JPG`;
    } else {
      this.style.display = 'none';
    }
  };
}

/* ─── UTILITAIRES ───────────────────────────────────────────────────────── */

function openFilterSection(labelMatch) {
  document.querySelectorAll('.filter-section-header').forEach(btn => {
    const label = btn.querySelector('.filter-section-label')?.textContent.toLowerCase() || '';
    if (label.includes(labelMatch.toLowerCase())) {
      const body = btn.nextElementSibling;
      if (body && !body.classList.contains('open')) {
        body.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    }
  });
}