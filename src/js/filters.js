/**
 * filters.js - Adapté au nouveau jeu de données (Termes Jantzen texte + id_bat)
 * Filtres : arrondissement + thésaurus Jantzen.
 */

const activeFilters = {
  arrondissements: new Set(), // Set<number>
  thesaurus:       new Set()  // Set<string> ("façade", "domes", etc.)
};

/* ─── CONSTRUCTION DES FILTRES ─────────────────────────────────────────────── */

function buildArrChips() {
  const container = document.getElementById('arr-chips');
  if (!container) return;
  container.innerHTML = '';

  // Recenser les arrondissements réellement présents dans les données (convertis en Number)
  const arrs = [...new Set(ALL_FEATURES.map(f => Number(f.properties.arrondissement)))]
    .filter(Boolean)
    .sort((a, b) => a - b);

  arrs.forEach(a => {
    const btn = document.createElement('button');
    btn.className   = 'chip';
    btn.textContent = a === 1 ? '1er' : `${a}e`;
    btn.dataset.arr = a;
    btn.onclick = () => toggleChip(btn, activeFilters.arrondissements, a);
    container.appendChild(btn);
  });
}

function buildThesaurusFilter() {
  const container = document.getElementById('thesaurus-chips');
  if (!container) return;
  container.innerHTML = '';

  let availableTerms = [];

  // Si THESAURUS est chargé depuis le JSON et contient des objets/chaînes
  if (typeof THESAURUS !== 'undefined' && Array.isArray(THESAURUS) && THESAURUS.length > 0) {
    availableTerms = THESAURUS.map(item => (typeof item === 'object' ? item.nom || item.id : item));
  } else {
    // Sinon, on extrait dynamiquement tous les termes Jantzen uniques présents dans ALL_FEATURES
    const termSet = new Set();
    ALL_FEATURES.forEach(f => {
      const terms = f.properties.terme_jantzen_bat || [];
      terms.forEach(t => termSet.add(t));
    });
    availableTerms = [...termSet];
  }

  // Tri alphabétique français
  availableTerms.sort((a, b) => a.localeCompare(b, 'fr'));

  availableTerms.forEach(term => {
    if (!term) return;
    const btn = document.createElement('button');
    btn.className   = 'chip';
    // Mettre la première lettre en majuscule pour l'affichage
    btn.textContent = term.charAt(0).toUpperCase() + term.slice(1);
    btn.dataset.id  = term; // La valeur stockée reste la valeur d'origine (ex: "façade")
    btn.onclick = () => toggleThesaurusChip(btn, term);
    container.appendChild(btn);
  });
}

/* ─── TOGGLES ────────────────────────────────────────────────────────────── */

function toggleChip(btn, set, val) {
  if (set.has(val)) { 
    set.delete(val); 
    btn.classList.remove('active'); 
  } else { 
    set.add(val);    
    btn.classList.add('active'); 
  }
  applyFilters();
}

function toggleThesaurusChip(btn, id) {
  toggleChip(btn, activeFilters.thesaurus, id);
}

/* ─── TAGS ACTIFS & RÉINITIALISATION ────────────────────────────────────── */

function renderActiveTags() {
  const bar = document.getElementById('filters-active-bar');
  if (!bar) return;
  
  bar.innerHTML = '';
  const tags = [];

  // 1. Tags Arrondissements
  activeFilters.arrondissements.forEach(a => {
    const labelText = a === 1 ? '1er arr.' : `${a}e arr.`;
    tags.push({ 
      label: labelText, 
      remove: () => {
        activeFilters.arrondissements.delete(a);
        document.querySelectorAll(`.chip[data-arr="${a}"]`).forEach(c => c.classList.remove('active'));
        applyFilters();
      }
    });
  });

  // 2. Tags Thésaurus (Termes Jantzen)
  activeFilters.thesaurus.forEach(id => {
    // Support des noms explicites via getThesaurusName ou formatage direct
    const nom = typeof getThesaurusName === 'function' ? getThesaurusName(id) : id;
    const displayLabel = nom.charAt(0).toUpperCase() + nom.slice(1);
    
    tags.push({ 
      label: displayLabel, 
      remove: () => {
        activeFilters.thesaurus.delete(id);
        document.querySelectorAll(`.chip[data-id="${id}"]`).forEach(c => c.classList.remove('active'));
        applyFilters();
      }
    });
  });

  if (tags.length === 0) {
    bar.classList.remove('has-active');
    return;
  }

  tags.forEach(({ label, remove }) => {
    const tag = document.createElement('span');
    tag.className = 'filter-active-tag';
    
    const close = document.createElement('button');
    close.className = 'filter-active-tag-remove';
    close.setAttribute('aria-label', `Supprimer le filtre ${label}`);
    close.textContent = '×';
    close.onclick = remove;
    
    tag.append(document.createTextNode(label), close);
    bar.appendChild(tag);
  });

  // Bouton de réinitialisation globale
  const reset = document.createElement('button');
  reset.id          = 'filter-reset-btn';
  reset.textContent = 'Réinitialiser';
  reset.onclick     = resetAllFilters;
  bar.appendChild(reset);

  bar.classList.add('has-active');
}

function resetAllFilters() {
  activeFilters.arrondissements.clear();
  activeFilters.thesaurus.clear();
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  applyFilters();
}

/* ─── ACCORDÉON ─────────────────────────────────────────────────────────── */

function toggleFilterSection(btn) {
  const body = btn.nextElementSibling;
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  btn.setAttribute('aria-expanded', String(isOpen));
}