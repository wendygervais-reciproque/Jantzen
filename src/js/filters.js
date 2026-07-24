/**
 * filters.js — Filtres : arrondissement, temporalité, thésaurus Jantzen.
 */

const activeFilters = {
  arrondissements: new Set(), // Set<number>
  thesaurus:       new Set(), // Set<string> ("façade", "lucarne"…)
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

/* ─── TEMPORALITÉ ───────────────────────────────────────────────────────── */

/*
 * Deux `<input type="range">` natifs superposés plutôt qu'un composant maison :
 * rôle `slider`, `aria-valuemin/max/now` et pilotage clavier (flèches, Origine,
 * Fin, Page préc./suiv.) sont fournis par le navigateur et testés par les
 * technologies d'assistance. Les champs numériques associés offrent
 * l'alternative sans pointage exigée par le RGAA.
 */

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

  // Le curseur bouge en continu : on rafraîchit l'affichage à chaque cran,
  // mais on ne relance le filtrage qu'une fois la saisie stabilisée.
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

  // Les deux poignées ne se croisent pas.
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

  // Sans cela, les lecteurs d'écran annoncent un nombre nu hors contexte.
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

/* ─── THÉSAURUS ─────────────────────────────────────────────────────────── */

let THES_TERMS = [];              // [{term, count, cluster, url, source, documented}]
const CLUSTER_UNSORTED = 'Non classés';

const SOURCE_LABELS = {
  wiki:              'Wikipédia',
  ThesOrsay:         'Thésaurus du musée d’Orsay',
  mistral_generated: 'Définition générée automatiquement'
};

function buildThesaurusFilter() {
  // On ne liste que les termes réellement portés par le corpus : le thésaurus
  // compte 89 entrées, dont 71 ne qualifient aucun bâtiment.
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
  const matching = q ? THES_TERMS.filter(t => normalizeTerm(t.term).includes(q)) : THES_TERMS;

  host.innerHTML = '';
  if (empty) empty.hidden = matching.length > 0;
  if (matching.length === 0) return;

  // Clusters par ordre alphabétique, « Non classés » toujours en dernier.
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
  chip.textContent = capitalize(entry.term);
  chip.dataset.id  = entry.term;

  // `title` seul servirait de nom accessible et masquerait le terme :
  // le libellé explicite porte les deux informations.
  const plural = `${entry.count} bâtiment${entry.count > 1 ? 's' : ''}`;
  chip.title = plural;
  chip.setAttribute('aria-label', `${capitalize(entry.term)}, ${plural}`);

  if (activeFilters.thesaurus.has(entry.term)) chip.classList.add('active');
  chip.setAttribute('aria-pressed', String(activeFilters.thesaurus.has(entry.term)));
  chip.onclick = () => toggleThesaurusChip(chip, entry.term);
  row.appendChild(chip);

  // Bouton d'infobulle seulement là où une définition existe : sur les 41
  // termes du corpus, 18 seulement figurent au thésaurus.
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

function getFeaturesMatchingOtherFilters() {
  return ALL_FEATURES.filter(f => {
    if (activeFilters.arrondissements.size > 0 ){
      const arr = Number(f.properties.arrondissement);
      if (!activeFilters.arrondissements.has(arr)) return false;
    }
    if (activeFilters.years) {
      const [a, b] = activeFilters.years;
      const year = Number(f.properties.annee);
      if (year < a || year > b) return false;
    }
    return true;
  });
}


/* ─── INFOBULLES DE DÉFINITION ──────────────────────────────────────────── */

/*
 * Divulgation en flux plutôt qu'infobulle flottante : le panneau de filtres
 * défile et rogne son contenu, une carte positionnée en absolu y serait
 * tronquée. En flux, l'ordre de tabulation reste naturel — le lien de
 * référence suit immédiatement son bouton — et rien n'est masqué.
 */

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

  // La définition n'est téléchargée qu'ici : le fichier complet (60 Ko) n'est
  // pas nécessaire au démarrage, l'index de 9,5 Ko suffit aux filtres.
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

  // Un terme peut renvoyer à plusieurs référentiels (Wikipédia et
  // data.culture.fr) : on expose chaque lien séparément.
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

  // La provenance de la définition, distincte des liens : 22 termes du
  // thésaurus portent un texte généré automatiquement, il faut le signaler.
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
