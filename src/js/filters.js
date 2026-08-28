/**
 * filters.js — Filtres : arrondissement, thésaurus Jantzen, architectes, périodes.
 */

/**
 * Remplit une puce : libellé + pastille de compte. Le compte n'est plus glissé
 * entre parenthèses dans le libellé — c'est un élément à part entière du
 * composant Chip (bordure, forme de gélule), masqué quand il vaut zéro.
 */
function setChipContent(chip, label, count) {
  chip.textContent = '';

  const text = document.createElement('span');
  text.className   = 'chip-label';
  text.textContent = label;
  chip.appendChild(text);

  if (count > 0) {
    const badge = document.createElement('span');
    badge.className   = 'chip-count';
    badge.textContent = String(count);
    chip.appendChild(badge);
  }
}

/**
 * Câble un champ `.thes-search` (thésaurus, personnes…) à sa croix
 * d'effacement : la croix n'apparaît que si le champ contient du texte, et
 * son clic vide le champ, relance le rendu et rend la main au champ.
 */
function bindSearchClear(inputId, clearId, onChange) {
  const input = document.getElementById(inputId);
  const clear = document.getElementById(clearId);
  if (!input) return;

  input.addEventListener('input', e => {
    if (clear) clear.hidden = !e.target.value;
    onChange(e.target.value);
  });

  clear?.addEventListener('click', () => {
    input.value = '';
    clear.hidden = true;
    onChange('');
    input.focus();
  });
}

const activeFilters = {
  arrondissements: new Set(), // Set<number>
  thesaurus:       new Set(), // Set<string> ("façade", "lucarne"…)
  architectes:     new Set(), // Set<number> (IDs d'architectes)
  periodes:        new Set(), // Set<string> ("1530-1589", ...)
};


/* ─── ARRONDISSEMENTS ───────────────────────────────────────────────────── */

function buildArrChips() {
  const container = document.getElementById('arr-chips');
  if (!container) return;
  container.innerHTML = '';

  const arrs = [...new Set(ALL_FEATURES.map(f => Number(f.properties.arrondissement)))]
    .filter(Boolean)
    .sort((a, b) => a - b);

  arrs.forEach(a => {
    const btn = document.createElement('button');
    btn.type        = 'button';
    btn.className   = 'chip';
    btn.textContent = a === 1 ? '1er' : `${a}e`;
    btn.dataset.arr = a;
    btn.setAttribute('aria-pressed', 'false');
    btn.onclick = () => toggleChip(btn, activeFilters.arrondissements, a);
    container.appendChild(btn);
  });
}

function syncArrChips() {
  document.querySelectorAll('.chip[data-arr]').forEach(chip => {
    const on = activeFilters.arrondissements.has(Number(chip.dataset.arr));
    chip.classList.toggle('active', on);
    chip.setAttribute('aria-pressed', String(on));
  });
}


/* ─── THÉSAURUS ─────────────────────────────────────────────────────────── */

let THES_TERMS = [];
const CLUSTER_UNSORTED = 'Non classés';

const SOURCE_LABELS = {
  wiki:              'Wikipédia',
  ThesOrsay:         'Thésaurus du musée d’Orsay',
  mistral_generated: 'Définition générée automatiquement avec Mistral'
};

function buildThesaurusFilter() {
  const counts = new Map();
  ALL_FEATURES.forEach(f => {
    (f.properties.terme_jantzen_bat || []).forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
  });

  THES_TERMS = [...counts.entries()].map(([term, count]) => {
    const meta = getTermMeta(term);
    return {
      term, count,
      cluster:    meta?.c || CLUSTER_UNSORTED,
      url:        meta?.u || '',
      source:     meta?.s || '',
      documented: !!meta
    };
  }).sort((a, b) => a.term.localeCompare(b.term, 'fr'));

  bindSearchClear('thesaurus-search', 'thesaurus-search-clear', renderThesaurusGroups);

  renderThesaurusGroups('');
}

function renderThesaurusGroups(query) {
  const host  = document.getElementById('thesaurus-groups');
  const empty = document.getElementById('thesaurus-empty');
  if (!host) return;

  const q = normalizeTerm(query);
  const matching = THES_TERMS.filter(t => {
    const isVisible = t.count > 0 || activeFilters.thesaurus.has(t.term);
    const matchesQuery = q ? normalizeTerm(t.term).includes(q) : true;
    return isVisible && matchesQuery;
  });

  host.innerHTML = '';
  if (empty) empty.hidden = matching.length > 0;
  if (matching.length === 0) return;

  const groups = new Map();
  matching.forEach(t => {
    if (!groups.has(t.cluster)) groups.set(t.cluster, []);
    groups.get(t.cluster).push(t);
  });

  [...groups.keys()]
    .sort((a, b) => {
      if (a === CLUSTER_UNSORTED) return 1;
      if (b === CLUSTER_UNSORTED) return -1;
      return a.localeCompare(b, 'fr');
    })
    .forEach(cluster => host.appendChild(buildClusterGroup(cluster, groups.get(cluster))));
}

function buildClusterGroup(cluster, terms) {
  const group = document.createElement('section');
  group.className = 'thes-group';

  const title = document.createElement('h4');
  title.className   = 'thes-group-label';
  title.textContent = cluster;   // le deux-points est posé en CSS
  group.appendChild(title);

  const chips = document.createElement('div');
  chips.className = 'thes-terms';
  terms.forEach(t => chips.appendChild(buildTermRow(t)));
  group.appendChild(chips);

  return group;
}

function buildTermRow(entry) {
  const row = document.createElement('span');
  row.className = 'thes-term';

  const chip = document.createElement('button');
  chip.type        = 'button';
  chip.className   = 'chip';
  setChipContent(chip, capitalize(entry.term), entry.count);
  chip.dataset.id  = entry.term;

  const plural = `${entry.count} bâtiment${entry.count > 1 ? 's' : ''}`;
  chip.title = plural;
  chip.setAttribute('aria-label', `${capitalize(entry.term)}, ${plural}`);

  if (activeFilters.thesaurus.has(entry.term)) chip.classList.add('active');
  chip.setAttribute('aria-pressed', String(activeFilters.thesaurus.has(entry.term)));
  chip.onclick = () => toggleThesaurusChip(chip, entry.term);
  row.appendChild(chip);

  if (entry.documented) {
    const info = document.createElement('button');
    info.type      = 'button';
    info.className = 'thes-info';
    info.textContent = 'i';
    info.setAttribute('aria-expanded', 'false');
    info.setAttribute('aria-label', `Définition de « ${entry.term} »`);
    info.onclick = () => toggleTermDefinition(info, entry, row);
    row.appendChild(info);
  }

  return row;
}

/* ─── DYNAMISATION ──────────────────────────────────────────── */

function updateThesaurusData(featuresActuelles) {
  const counts = new Map();

  featuresActuelles.forEach(f => {
    const rawTerms = f.properties.terme_jantzen_bat;
    const termsArray = Array.isArray(rawTerms) ? rawTerms : [];

    termsArray.forEach(t => {
      const normalizedTerm = normalizeText(t);
      if (normalizedTerm) {
        counts.set(normalizedTerm, (counts.get(normalizedTerm) || 0) + 1);
      }
    });
  });

  THES_TERMS.forEach(item => {
    const normItemTerm = normalizeText(item.term);
    item.count = counts.get(normItemTerm) || 0;
  });

  activeFilters.thesaurus.forEach(term => {
    const normTerm = normalizeText(term);
    if (!counts.get(normTerm)) {
      activeFilters.thesaurus.delete(term);
    }
  });
}

function updateArrondissementsData(featuresActuelles) {
  let featuresSansArr = ALL_FEATURES;

  // 1. Recherche
  if (typeof searchQuery !== 'undefined' && searchQuery.length >= 2) {
    const ids = lunrSearch(searchQuery);
    featuresSansArr = featuresSansArr.filter(f => 
      ids.has(String(f.properties.id_bat)) || ids.has(Number(f.properties.id_bat))
    );
  }

  // 2. Périodes
  if (activeFilters.periodes.size > 0) {
    const selectedPeriodes = Array.from(activeFilters.periodes);
    featuresSansArr = featuresSansArr.filter(f => {
      const raw = f.properties.periode;
      const batPeriodes = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      return selectedPeriodes.some(p => batPeriodes.includes(p));
    });
  }

  // 3. Thésaurus
  if (activeFilters.thesaurus.size > 0) {
    const selectedTerms = Array.from(activeFilters.thesaurus).map(t => normalizeText(t));
    featuresSansArr = featuresSansArr.filter(f => {
      const rawTerms = f.properties.terme_jantzen_bat;
      const batTermsArray = Array.isArray(rawTerms) ? rawTerms : [];
      const batTermsNormalized = batTermsArray.map(t => normalizeText(t));
      return selectedTerms.every(term => batTermsNormalized.includes(term));
    });
  }

  // 4. Architectes
  if (activeFilters.architectes.size > 0) {
    const selectedArchiIds = Array.from(activeFilters.architectes).map(id => Number(id));
    featuresSansArr = featuresSansArr.filter(f => {
      const raw = f.properties.personneID;
      const arr = Array.isArray(raw) ? raw : (raw != null ? [raw] : []);
      const batArchiIds = arr
        .map(item => Number(typeof item === 'object' && item !== null ? item.personneID : item))
        .filter(id => !isNaN(id));

      return selectedArchiIds.some(selectedId => batArchiIds.includes(selectedId));
    });
  }

  const counts = new Map();
  featuresSansArr.forEach(f => {
    const arr = Number(f.properties.arrondissement);
    if (arr) {
      counts.set(arr, (counts.get(arr) || 0) + 1);
    }
  });

  activeFilters.arrondissements.forEach(arr => {
    if (!counts.get(arr)) {
      activeFilters.arrondissements.delete(arr);
    }
  });

  document.querySelectorAll('.chip[data-arr]').forEach(chip => {
    const arr = Number(chip.dataset.arr);
    const count = counts.get(arr) || 0;
    const isAvailable = count > 0;

    chip.disabled = !isAvailable;
    chip.classList.toggle('disabled', !isAvailable);

    const labelArr = arr === 1 ? '1er' : `${arr}e`;
    if (!isAvailable) {
      chip.title = 'Aucun bâtiment pour ce filtre';
      chip.setAttribute('aria-label', `${labelArr} arrondissement (aucun résultat)`);
    } else {
      const plural = `${count} bâtiment${count > 1 ? 's' : ''}`;
      chip.title = plural;
      chip.setAttribute('aria-label', `${labelArr} arrondissement, ${plural}`);
    }
  });
}

/* ─── INFOBULLES DE DÉFINITION ──────────────────────────────────────────── */

function toggleTermDefinition(button, entry, row) {
  const open = button.getAttribute('aria-expanded') === 'true';
  closeAllTermDefinitions();
  if (open) return;

  button.setAttribute('aria-expanded', 'true');

  const card = document.createElement('div');
  card.className = 'thes-def';
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `Définition de ${entry.term}`);
  card.textContent = 'Chargement de la définition…';
  row.after(card);

  getTermDefinition(entry.term).then(def => {
    if (button.getAttribute('aria-expanded') !== 'true') return;
    renderDefinitionCard(card, entry, def);
  });
}

function renderDefinitionCard(card, entry, def) {
  card.innerHTML = '';

  const definitions = def?.definitions?.length ? def.definitions : ['Définition indisponible.'];
  definitions.forEach(text => {
    const p = document.createElement('p');
    p.className   = 'thes-def-text';
    p.textContent = text;
    card.appendChild(p);
  });

  const source = SOURCE_LABELS[def?.source || entry.source];
  if (source) {
    const note = document.createElement('p');
    note.className   = 'thes-def-source';
    note.textContent = `Définition : ${source}`;
    card.appendChild(note);
  }

  const originalReferences = def?.references || [];
  const orsayLink = {
    href: `https://www.musee-orsay.fr/fr/collections/recherche?artwork_icono_subject=${encodeURIComponent(entry.term)}&search_type=advanced_search`,
    label: 'Musée d’Orsay'
  }
  const references = [orsayLink, ...originalReferences];
  if (references.length > 0) {
    const list = document.createElement('ul');
    list.className = 'thes-def-links';

    references.forEach(({ href, label }) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href        = href;
      link.target      = '_blank';
      link.rel         = 'noopener noreferrer';
      link.append(label);
      link.setAttribute('aria-label', `${label} — « ${entry.term} » (nouvelle fenêtre)`);
      link.insertAdjacentHTML('beforeend', '<svg class="icon icon-external" aria-hidden="true"><use href="#i-external"/></svg>');
      item.appendChild(link);
      list.appendChild(item);
    });

    card.appendChild(list);
  }
}

function closeAllTermDefinitions() {
  document.querySelectorAll('.thes-def').forEach(el => el.remove());
  document.querySelectorAll('.thes-info[aria-expanded="true"]')
    .forEach(el => el.setAttribute('aria-expanded', 'false'));
}

/* ─── TOGGLES ───────────────────────────────────────────────────────────── */

function toggleChip(btn, set, val) {
  const on = !set.has(val);
  if (on) set.add(val); else set.delete(val);
  btn.classList.toggle('active', on);
  btn.setAttribute('aria-pressed', String(on));
  if (typeof applyFilters === 'function') applyFilters();
}

function toggleThesaurusChip(btn, id) {
  const input = document.getElementById('thesaurus-search');
  const clear = document.getElementById('thesaurus-search-clear');
  if (input) input.value = '';
  if (clear) clear.hidden = true;
  toggleChip(btn, activeFilters.thesaurus, id);
}

/* ─── TAGS ACTIFS & RÉINITIALISATION ────────────────────────────────────── */

function renderActiveTags() {
  const bar = document.getElementById('filters-active-bar');
  if (!bar) return;

  bar.innerHTML = '';
  const tags = [];

  activeFilters.arrondissements.forEach(a => {
    tags.push({
      label: a === 1 ? '1er arr.' : `${a}e arr.`,
      remove: () => {
        activeFilters.arrondissements.delete(a);
        document.querySelectorAll(`.chip[data-arr="${a}"]`).forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-pressed', 'false');
        });
        if (typeof applyFilters === 'function') applyFilters();
      }
    });
  });

  activeFilters.thesaurus.forEach(id => {
    tags.push({
      label: capitalize(id),
      remove: () => {
        activeFilters.thesaurus.delete(id);
        document.querySelectorAll(`.chip[data-id="${CSS.escape(id)}"]`).forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-pressed', 'false');
        });
        if (typeof applyFilters === 'function') applyFilters();
      }
    });
  });

  activeFilters.architectes.forEach(archiId => {
    const archiObj = ARCHI_TERMS.find(a => a.id === archiId);
    const labelName = archiObj ? archiObj.libelle : `Archi ${archiId}`;

    tags.push({
      label: labelName,
      remove: () => {
        activeFilters.architectes.delete(archiId);
        document.querySelectorAll(`.chip[data-id="${CSS.escape(String(archiId))}"]`).forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-pressed', 'false');
        });
        if (typeof applyFilters === 'function') applyFilters();
      }
    });
  });

  activeFilters.periodes.forEach(pLabel => {
    tags.push({
      label: `${pLabel}`,
      remove: () => {
        activeFilters.periodes.delete(pLabel);
        document.querySelectorAll(`#date-chips-container .chip[data-id="${CSS.escape(pLabel)}"]`).forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-pressed', 'false');
        });
        if (typeof applyFilters === 'function') applyFilters();
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
    close.type      = 'button';
    close.className = 'filter-active-tag-remove';
    close.setAttribute('aria-label', `Retirer le filtre ${label}`);
    close.textContent = '×';
    close.onclick = remove;

    tag.append(document.createTextNode(label), close);
    bar.appendChild(tag);
  });

  const reset = document.createElement('button');
  reset.type        = 'button';
  reset.id          = 'filter-reset-btn';
  reset.textContent = 'Réinitialiser';
  reset.onclick     = resetAllFilters;
  bar.appendChild(reset);

  bar.classList.add('has-active');
}

function resetAllFilters() {
  activeFilters.arrondissements.clear();
  activeFilters.thesaurus.clear();
  activeFilters.architectes.clear();
  activeFilters.periodes.clear();

  

  document.querySelectorAll('.chip').forEach(c => {
    c.classList.remove('active');
    c.setAttribute('aria-pressed', 'false');
  });

  if( typeof deselectBatiment === 'function') deselectBatiment();

  if (typeof applyFilters === 'function') applyFilters();
}

/* ─── ACCORDÉON ─────────────────────────────────────────────────────────── */

function toggleFilterSection(btn) {
  // Le bouton est enveloppé dans un <h3> (hiérarchie de titres, RGAA 9.1) :
  // le frère direct à considérer est celui du <h3>, pas celui du bouton.
  const body = (btn.closest('h3') || btn).nextElementSibling;
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  btn.setAttribute('aria-expanded', String(isOpen));
}

/**
 * Détecte, pour chaque en-tête de section sticky, l'instant où il est
 * réellement figé en haut de #filters-body (par opposition à sa position
 * normale dans le flux) : une sentinelle de hauteur nulle est posée juste
 * avant chaque en-tête, et sort du viewport du panneau exactement quand ce
 * dernier se colle. Sert uniquement à poser `.is-stuck`, qui porte l'élévation
 * « anchored » — l'en-tête ne doit pas la porter en position normale.
 */
function initStickyFilterHeaders() {
  const root = document.getElementById('filters-body');
  const sentinels = document.querySelectorAll('.filter-section-sentinel');
  if (!root || !sentinels.length || typeof IntersectionObserver === 'undefined') return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      // Idem : l'en-tête réel (.filter-section-header) est un petit-fils du
      // frère direct de la sentinelle, imbriqué dans le <h3> englobant.
      const wrapper = entry.target.nextElementSibling;
      const header  = wrapper?.querySelector('.filter-section-header') || wrapper;
      if (header) header.classList.toggle('is-stuck', entry.intersectionRatio < 1);
    });
  }, { root, threshold: [1] });

  sentinels.forEach(el => observer.observe(el));
}

/* ─── ARCHITECTES ────────────────────────────────────────────────────────── */

function buildArchitectesFilter(personnesFiltre = []) {
  const counts = new Map();
  ALL_FEATURES.forEach(f => {
    const raw = f.properties.personneID;
    const arr = Array.isArray(raw) ? raw : (raw != null ? [raw] : []);
    
    arr.forEach(item => {
      // extrait la valeur selon que c'est un objet {personneID: 249, role: "..."} ou un nombre direct
      const val = (typeof item === 'object' && item !== null) ? item.personneID : item;
      const idNum = Number(val);
      if (!isNaN(idNum)) {
        counts.set(idNum, (counts.get(idNum) || 0) + 1);
      }
    });
  });

  ARCHI_TERMS = personnesFiltre
    .map(p => {
      const idNum = Number(p.id_archi);
      return {
        id: idNum,
        libelle: p.libelle,
        count: counts.get(idNum) || 0
      };
    })
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));

  const searchInput = document.getElementById('archi-search');
  if (searchInput) {
    searchInput.replaceWith(searchInput.cloneNode(true));
    bindSearchClear('archi-search', 'archi-search-clear', renderArchitectesList);
  }

  updateArchitectesData(ALL_FEATURES);
  renderArchitectesList(document.getElementById('archi-search')?.value || '');
}

function renderArchitectesList(query) {
  const host  = document.getElementById('archi-chips-container');
  const empty = document.getElementById('archi-empty');
  if (!host) return;

  const q = normalizeText(query);

  const matching = ARCHI_TERMS.filter(a => {
    const isVisible = a.count > 0 || activeFilters.architectes.has(Number(a.id));
    const matchesQuery = q ? normalizeText(a.libelle).includes(q) : true;
    return isVisible && matchesQuery;
  });

  host.innerHTML = '';
  if (empty) empty.hidden = matching.length > 0;
  if (matching.length === 0) return;

  matching.forEach(entry => {
    host.appendChild(buildArchiChipRow(entry));
  });
}

function buildArchiChipRow(entry) {
  const row = document.createElement('span');
  row.className = 'thes-term';

  const chip = document.createElement('button');
  chip.type        = 'button';
  chip.className   = 'chip';
  setChipContent(chip, entry.libelle, entry.count);
  chip.dataset.id  = entry.id;

  const plural = `${entry.count} bâtiment${entry.count > 1 ? 's' : ''}`;
  chip.title = plural;
  chip.setAttribute('aria-label', `${entry.libelle}, ${plural}`);

  const isActive = activeFilters.architectes.has(entry.id);
  if (isActive) chip.classList.add('active');
  chip.setAttribute('aria-pressed', String(isActive));

  chip.onclick = () => toggleArchiChip(chip, entry.id);
  row.appendChild(chip);

  return row;
}

function toggleArchiChip(btn, archiId) {
  const numericId = Number(archiId);
  const on = !activeFilters.architectes.has(numericId);
  
  if (on) {
    activeFilters.architectes.add(numericId);
  } else {
    activeFilters.architectes.delete(numericId);
  }
  
  btn.classList.toggle('active', on);
  btn.setAttribute('aria-pressed', String(on));

  const input = document.getElementById('archi-search');
  const clear = document.getElementById('archi-search-clear');
  if (input) input.value = '';
  if (clear) clear.hidden = true;
  
  if (typeof applyFilters === 'function') applyFilters();
}

function updateArchitectesData(featuresActuelles) {
  let featuresSansArchi = ALL_FEATURES;

  // 1. Recherche textuelle
  if (typeof searchQuery !== 'undefined' && searchQuery.length >= 2) {
    const ids = lunrSearch(searchQuery);
    featuresSansArchi = featuresSansArchi.filter(f => 
      ids.has(String(f.properties.id_bat)) || ids.has(Number(f.properties.id_bat))
    );
  }

  // 2. Arrondissements
  if (activeFilters.arrondissements.size > 0) {
    featuresSansArchi = featuresSansArchi.filter(f =>
      activeFilters.arrondissements.has(Number(f.properties.arrondissement))
    );
  }

  // 3. Périodes (OU)
  if (activeFilters.periodes.size > 0) {
    const selectedPeriodes = Array.from(activeFilters.periodes);
    featuresSansArchi = featuresSansArchi.filter(f => {
      const raw = f.properties.periode;
      const batPeriodes = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      return selectedPeriodes.some(p => batPeriodes.includes(p));
    });
  }

  // 4. Thésaurus (ET)
  if (activeFilters.thesaurus.size > 0) {
    const selectedTerms = Array.from(activeFilters.thesaurus).map(t => normalizeText(t));
    featuresSansArchi = featuresSansArchi.filter(f => {
      const rawTerms = f.properties.terme_jantzen_bat;
      const batTermsArray = Array.isArray(rawTerms) ? rawTerms : [];
      const batTermsNormalized = batTermsArray.map(t => normalizeText(t));
      return selectedTerms.every(term => batTermsNormalized.includes(term));
    });
  }

  // 5. Architectes déjà sélectionnés (ET) — Essentiel pour le facettage dynamique en ET
  if (activeFilters.architectes.size > 0) {
    const selectedArchiIds = Array.from(activeFilters.architectes).map(id => Number(id));
    featuresSansArchi = featuresSansArchi.filter(f => {
      const raw = f.properties.personneID;
      const arr = Array.isArray(raw) ? raw : (raw != null ? [raw] : []);
      const batArchiIds = arr
        .map(item => Number(typeof item === 'object' && item !== null ? item.personneID : item))
        .filter(id => !isNaN(id));

      return selectedArchiIds.every(selectedId => batArchiIds.includes(selectedId));
    });
  }

  // Compter les occurrences
  const counts = new Map();
  featuresSansArchi.forEach(f => {
    const raw = f.properties.personneID;
    const arr = Array.isArray(raw) ? raw : (raw != null ? [raw] : []);

    const uniqueIds = new Set(
      arr
        .map(item => Number(typeof item === 'object' && item !== null ? item.personneID : item))
        .filter(id => !isNaN(id))
    );

    uniqueIds.forEach(idNum => {
      counts.set(idNum, (counts.get(idNum) || 0) + 1);
    });
  });

  // Mettre à jour les compteurs
  ARCHI_TERMS.forEach(item => {
    item.count = counts.get(Number(item.id)) || 0;
  });

  // Nettoyage des filtres obsolètes
  activeFilters.architectes.forEach(archiId => {
    if (!counts.get(Number(archiId))) {
      activeFilters.architectes.delete(archiId);
    }
  });
}

/* ─── PÉRIODES (FILTRE À FACETTES EN OU) ──────────────────────────────── */

function buildPeriodesFilter(periodesData = []) {
  let list = [];

  // 1. Extraire les chaînes de périodes depuis la structure d'objets [{ periode: [...] }, ...]
  if (Array.isArray(periodesData)) {
    periodesData.forEach(item => {
      if (typeof item === 'string') {
        list.push(item);
      } else if (item && Array.isArray(item.periode)) {
        list.push(...item.periode);
      } else if (item && item.periode) {
        list.push(item.periode);
      }
    });
  } else if (periodesData && Array.isArray(periodesData.periode)) {
    list = periodesData.periode;
  }

  // Nettoyage et suppression des doublons
  list = [...new Set(list.map(p => String(p).trim()).filter(Boolean))];

  // 2. Compter les occurrences dans ALL_FEATURES
  const counts = new Map();
  ALL_FEATURES.forEach(f => {
    const raw = f.properties.periode || f.properties.periodes;
    const periodesArray = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    
    periodesArray.forEach(p => {
      const cleanP = String(p).trim();
      if (cleanP) {
        counts.set(cleanP, (counts.get(cleanP) || 0) + 1);
      }
    });
  });

  // 3. Mettre à jour PERIODE_TERMS
  PERIODE_TERMS = list.map(p => ({
    label: p,
    count: counts.get(p) || 0
  }));

  updatePeriodesData(ALL_FEATURES);
  renderPeriodesList();
}

function renderPeriodesList() {
  const container = document.getElementById('date-chips-container');
  if (!container) return;
  container.innerHTML = '';

  // Conserver l'affichage vertical
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'flex-start';
  container.style.gap = '4px';

  PERIODE_TERMS.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'thes-term';
    row.style.width = '100%';

    const chip = document.createElement('button');
    chip.type        = 'button';
    chip.className   = 'chip';
    
    // La pastille de compte n'apparaît que si count > 0.
    setChipContent(chip, entry.label, entry.count);
    chip.dataset.id  = entry.label;

    const isActive = activeFilters.periodes.has(entry.label);
    const isAvailable = entry.count > 0;

    if (!isAvailable && !isActive) {
      chip.disabled = true;
      chip.classList.add('disabled');
      chip.title = 'Aucun bâtiment pour ce filtre';
      chip.setAttribute('aria-label', `Période ${entry.label} (aucun résultat)`);
    } else {
      chip.disabled = false;
      chip.classList.remove('disabled');
      const plural = `${entry.count} bâtiment${entry.count > 1 ? 's' : ''}`;
      chip.title = plural;
      chip.setAttribute('aria-label', `Période ${entry.label}, ${plural}`);
    }

    if (isActive) chip.classList.add('active');
    chip.setAttribute('aria-pressed', String(isActive));

    chip.onclick = () => togglePeriodeChip(chip, entry.label);
    row.appendChild(chip);
    container.appendChild(row);
  });
}

function togglePeriodeChip(btn, periodeLabel) {
  const on = !activeFilters.periodes.has(periodeLabel);
  
  if (on) {
    activeFilters.periodes.add(periodeLabel);
  } else {
    activeFilters.periodes.delete(periodeLabel);
  }
  
  btn.classList.toggle('active', on);
  btn.setAttribute('aria-pressed', String(on));
  
  if (typeof applyFilters === 'function') applyFilters();
}

function updatePeriodesData(featuresActuelles) {
  let featuresSansPeriodes = ALL_FEATURES;

  // 1. Recherche textuelle
  if (typeof searchQuery !== 'undefined' && searchQuery.length >= 2) {
    const ids = lunrSearch(searchQuery);
    featuresSansPeriodes = featuresSansPeriodes.filter(f => 
      ids.has(String(f.properties.id_bat)) || ids.has(Number(f.properties.id_bat))
    );
  }

  // 2. Arrondissements
  if (activeFilters.arrondissements.size > 0) {
    featuresSansPeriodes = featuresSansPeriodes.filter(f =>
      activeFilters.arrondissements.has(Number(f.properties.arrondissement))
    );
  }

  // 3. Thésaurus
  if (activeFilters.thesaurus.size > 0) {
    const selectedTerms = Array.from(activeFilters.thesaurus).map(t => normalizeText(t));
    featuresSansPeriodes = featuresSansPeriodes.filter(f => {
      const rawTerms = f.properties.terme_jantzen_bat;
      const batTermsArray = Array.isArray(rawTerms) ? rawTerms : [];
      const batTermsNormalized = batTermsArray.map(t => normalizeText(t));
      return selectedTerms.every(term => batTermsNormalized.includes(term));
    });
  }

  // 4. Architectes
  if (activeFilters.architectes.size > 0) {
    const selectedArchiIds = Array.from(activeFilters.architectes).map(id => Number(id));
    featuresSansPeriodes = featuresSansPeriodes.filter(f => {
      const raw = f.properties.personneID;
      const arr = Array.isArray(raw) ? raw : (raw != null ? [raw] : []);
      const batArchiIds = arr
        .map(item => Number(typeof item === 'object' && item !== null ? item.personneID : item))
        .filter(id => !isNaN(id));

      return selectedArchiIds.some(selectedId => batArchiIds.includes(selectedId));
    });
  }

  const counts = new Map();
  featuresSansPeriodes.forEach(f => {
    const raw = f.properties.periode || f.properties.periodes;
    const periodesArray = Array.isArray(raw) ? raw : (raw ? [raw] : []);

    periodesArray.forEach(p => {
      const cleanP = String(p).trim();
      if (cleanP) {
        counts.set(cleanP, (counts.get(cleanP) || 0) + 1);
      }
    });
  });

  PERIODE_TERMS.forEach(item => {
    item.count = counts.get(item.label) || 0;
  });

  activeFilters.periodes.forEach(p => {
    if (!counts.get(p)) {
      activeFilters.periodes.delete(p);
    }
  });

  renderPeriodesList();
}