/**
 * pages.js - Onglets de la page « À propos » (a-propos.html).
 */

/* ─── PAGE « À PROPOS » (onglets) ───────────────────────────────────────── */
// L'onglet affiché suit le hash (#base, #projet, #credits) : chaque onglet a
// donc sa propre adresse, partageable, et le bouton Précédent du navigateur
// revient à l'onglet d'avant.

const ABOUT_TABS = ['base', 'projet', 'credits'];

function tabFromHash() {
  const key = location.hash.replace(/^#/, '');
  return ABOUT_TABS.includes(key) ? key : ABOUT_TABS[0];
}

function showAboutTab(tabKey) {
  document.querySelectorAll('.page-tab').forEach(tab => {
    const active = tab.dataset.tab === tabKey;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('.page-panel').forEach(panel => {
    panel.hidden = panel.id !== `panel-${tabKey}`;
  });
}

function selectAboutTab(tabKey) {
  if (tabKey !== tabFromHash()) history.pushState(null, '', `#${tabKey}`);
  showAboutTab(tabKey);
  window.scrollTo(0, 0);
}

function bindAboutTabs() {
  const tabs = Array.from(document.querySelectorAll('.page-tab'));
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectAboutTab(tab.dataset.tab));
    tab.addEventListener('keydown', e => {
      let next = null;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      if (e.key === 'ArrowLeft')  next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (e.key === 'Home')       next = tabs[0];
      if (e.key === 'End')        next = tabs[tabs.length - 1];
      if (!next) return;
      e.preventDefault();
      selectAboutTab(next.dataset.tab);
      next.focus();
    });
  });

  showAboutTab(tabFromHash());
  window.addEventListener('popstate',   () => showAboutTab(tabFromHash()));
  window.addEventListener('hashchange', () => showAboutTab(tabFromHash()));
}

/* ─── EN-TÊTE ESCAMOTABLE ───────────────────────────────────────────────── */
// Le menu principal sort de l'écran quand on descend dans la page et revient
// dès qu'on remonte, pour garder le retour à la carte à portée de clic.

function bindPageHeader() {
  const root   = document.documentElement;
  const header = document.querySelector('.page-header');
  if (!header) return;

  const measure = () => root.style.setProperty('--page-header-h', `${header.offsetHeight}px`);
  measure();
  window.addEventListener('resize', measure);

  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (Math.abs(y - lastY) < 4) return;   // ignore les micro-défilements
    root.classList.toggle('is-header-hidden', y > lastY && y > header.offsetHeight);
    lastY = y;
  }, { passive: true });
}

document.addEventListener('DOMContentLoaded', () => {
  bindAboutTabs();
  bindPageHeader();
});
