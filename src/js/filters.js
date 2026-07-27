/**
 * filters.js — Filtres : arrondissement, temporalité, thésaurus Jantzen, architectes.
 */

const activeFilters = {
  arrondissements: new Set(), // Set<number>
  thesaurus:       new Set(), // Set<string> ("façade", "lucarne"…)
  architectes:     new Set(), // Set<number> (IDs d'architectes)
  years:           null       // [début, fin] — null tant que toute la période est retenue
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

/* ─── TEMPORALITÉ ───────────────────────────────────────────────────────── */

let dateApplyTimer = null;

function buildDateFilter() {
  const [min, max] = DATE_RANGE;
  const from  = document.getElementById('date-from');
  const to    = document.getElementById('date-to');
  const fromN = document.getElementById('date-from-input');
  const toN   = document.getElementById('date-to-input');
  if (!from || !to) return;

  [from, to, fromN, toN].forEach(el => {
    if (!el) return;
    el.min = min;
    el.max = max;
  });
  from.value = fromN.value = min;
  to.value   = toN.value   = max;

  from.addEventListener('input', () => onDateInput('from', from.value));
  to.addEventListener('input',   () => onDateInput('to',   to.value));

  fromN?.addEventListener('change', () => onDateInput('from', fromN.value));
  toN?.addEventListener('change',   () => onDateInput('to',   toN.value));

  document.getElementById('date-reset')?.addEventListener('click', resetDateFilter);

  updateDateUI();
}

function onDateInput(which, rawValue) {
  const [min, max] = DATE_RANGE;
  const from = document.getElementById('date-from');
  const to   = document.getElementById('date-to');

  let value = Math.round(Number(rawValue));
  if (!Number.isFinite(value)) return;
  value = Math.min(max, Math.max(min, value));

  if (which === 'from') from.value = Math.min(value, Number(to.value));
  else                  to.value   = Math.max(value, Number(from.value));

  updateDateUI();

  clearTimeout(dateApplyTimer);
  dateApplyTimer = setTimeout(() => {
    const a = Number(from.value), b = Number(to.value);
    activeFilters.years = (a === min && b === max) ? null : [a, b];
    applyFilters();
  }, 180);
}

function updateDateUI() {
  const [min, max] = DATE_RANGE;
  const from = document.getElementById('date-from');
  const to   = document.getElementById('date-to');
  if (!from || !to) return;

  const a = Number(from.value), b = Number(to.value);
  const span = max - min || 1;

  const fill = document.getElementById('date-fill');
  if (fill) {
    fill.style.left  = `${((a - min) / span) * 100}%`;
    fill.style.width = `${((b - a) / span) * 100}%`;
  }

  from.setAttribute('aria-valuetext', `année ${a}`);
  to.setAttribute('aria-valuetext',   `année ${b}`);

  const fromN = document.getElementById('date-from-input');
  const toN   = document.getElementById('date-to-input');
  if (fromN && document.activeElement !== fromN) fromN.value = a;
  if (toN   && document.activeElement !== toN)   toN.value   = b;

  const summary = document.getElementById('date-summary');
  if (summary) {
    summary.textContent = (a === min && b === max)
      ? `Toute la période (${min} – ${max})`
      : `De ${a} à ${b}`;
  }
}

function resetDateFilter() {
  const [min, max] = DATE_RANGE;
  const from = document.getElementById('date-from');
  const to   = document.getElementById('date-to');
  if (from) from.value = min;
  if (to)   to.value   = max;
  activeFilters.years = null;
  updateDateUI();
  applyFilters();
}

function syncDateInputs() {
  const [min, max] = DATE_RANGE;
  const from = document.getElementById('date-from');
  const to   = document.getElementById('date-to');
  if (!from || !to) return;
  const [a, b] = activeFilters.years || [min, max];
  from.value = Math.max(min, Math.min(Number(a), max));
  to.value   = Math.max(min, Math.min(Number(b), max));
  updateDateUI();
}

/* ─── THÉSAURUS ─────────────────────────────────────────────────────────── */

let THES_TERMS = [];
const CLUSTER_UNSORTED = 'Non classés';

const SOURCE_LABELS = {
  wiki:              'Wikipédia',
  ThesOrsay:         'Thésaurus du musée d’Orsay',
  mistral_generated: 'Définition générée automatiquement'
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

  document.getElementById('thesaurus-search')
    ?.addEventListener('input', e => renderThesaurusGroups(e.target.value));

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
  title.className = 'thes-group-label';
  title.innerHTML = `${cluster} <span class="thes-group-count">${terms.length}</span>`;
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
  // ✨ MODIFICATION ICI : Ajout du compteur d'occurrences dans le libellé
  chip.textContent = `${capitalize(entry.term)} (${entry.count})`;
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
}

function updateArrondissementsData(featuresActuelles) {
  const counts = new Map();
  featuresActuelles.forEach(f => {
    const arr = Number(f.properties.arrondissement);
    if (arr) {
      counts.set(arr, (counts.get(arr) || 0) + 1);
    }
  });

  document.querySelectorAll('.chip[data-arr]').forEach(chip => {
    const arr = Number(chip.dataset.arr);
    const count = counts.get(arr) || 0;
    const isActive = activeFilters.arrondissements.has(arr);

    const isAvailable = count > 0 || isActive;

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

  const references = def?.references || [];
  if (references.length > 0) {
    const list = document.createElement('ul');
    list.className = 'thes-def-links';

    references.forEach(({ href, label }) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href        = href;
      link.target      = '_blank';
      link.rel         = 'noopener noreferrer';
      link.textContent = label;
      link.setAttribute('aria-label', `${label} — « ${entry.term} » (nouvelle fenêtre)`);
      item.appendChild(link);
      list.appendChild(item);
    });

    card.appendChild(list);
  }

  const source = SOURCE_LABELS[def?.source || entry.source];
  if (source) {
    const note = document.createElement('p');
    note.className   = 'thes-def-source';
    note.textContent = `Définition : ${source}`;
    card.appendChild(note);
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

  activeFilters.arrondissements.forEach(a => {
    tags.push({
      label: a === 1 ? '1er arr.' : `${a}e arr.`,
      remove: () => {
        activeFilters.arrondissements.delete(a);
        document.querySelectorAll(`.chip[data-arr="${a}"]`).forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-pressed', 'false');
        });
        applyFilters();
      }
    });
  });

  if (activeFilters.years) {
    const [a, b] = activeFilters.years;
    tags.push({ label: `${a} – ${b}`, remove: resetDateFilter });
  }

  activeFilters.thesaurus.forEach(id => {
    tags.push({
      label: capitalize(id),
      remove: () => {
        activeFilters.thesaurus.delete(id);
        document.querySelectorAll(`.chip[data-id="${CSS.escape(id)}"]`).forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-pressed', 'false');
        });
        applyFilters();
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
  activeFilters.years = null;

  document.querySelectorAll('.chip').forEach(c => {
    c.classList.remove('active');
    c.setAttribute('aria-pressed', 'false');
  });

  const [min, max] = DATE_RANGE;
  const from = document.getElementById('date-from');
  const to   = document.getElementById('date-to');
  if (from) from.value = min;
  if (to)   to.value   = max;
  updateDateUI();

  applyFilters();
}

/* ─── ACCORDÉON ─────────────────────────────────────────────────────────── */

function toggleFilterSection(btn) {
  const body = btn.nextElementSibling;
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  btn.setAttribute('aria-expanded', String(isOpen));
}

/* ─── ARCHITECTES ────────────────────────────────────────────────────────── */

function buildArchitectesFilter(personnesFiltre = []) {
  const counts = new Map();
  ALL_FEATURES.forEach(f => {
    const personnes = f.properties.personnes || [];
    personnes.forEach(p => {
      if (p.personneID !== undefined && p.personneID !== null) {
        const idNum = Number(p.personneID);
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
    document.getElementById('archi-search').addEventListener('input', e => {
      renderArchitectesList(e.target.value);
    });
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
  // ✨ MODIFICATION ICI : Ajout du compteur d'occurrences dans le libellé
  chip.textContent = `${entry.libelle} (${entry.count})`;
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
  
  applyFilters();
}

function updateArchitectesData(featuresActuelles) {
  const counts = new Map();

  featuresActuelles.forEach(f => {
    const personnes = f.properties.personnes || [];
    personnes.forEach(p => {
      const id = p.personneID ?? p.id_archi ?? p.id;
      if (id !== undefined && id !== null) {
        const idNum = Number(id);
        if (!isNaN(idNum)) {
          counts.set(idNum, (counts.get(idNum) || 0) + 1);
        }
      }
    });

    if (f.properties.personneID !== undefined && f.properties.personneID !== null) {
      const raw = f.properties.personneID;
      const ids = Array.isArray(raw) ? raw : [raw];
      ids.forEach(id => {
        const idNum = Number(id);
        if (!isNaN(idNum) && personnes.length === 0) {
          counts.set(idNum, (counts.get(idNum) || 0) + 1);
        }
      });
    }
  });

  ARCHI_TERMS.forEach(item => {
    item.count = counts.get(Number(item.id)) || 0;
  });
}