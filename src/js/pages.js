/**
 * pages.js - Adapté et sécurisé
 * Gestion des pages statiques (overlay) et des vues contextuelles.
 */

const PAGES_CONTENT = {
  base: {
    title: 'La base Architecture Paris',
    html: `<h1>La base <em>Architecture Paris</em></h1>
<p>La base <strong>Architecture Paris</strong> est constituée d'un ensemble de <strong>17 000 photographies d'immeubles parisiens</strong> réalisées par Éric Jantzen. Ce fonds constitue un panorama exceptionnel du bâti parisien, documentant les façades d'immeubles dans une très grande diversité de styles architecturaux.</p>
<h2>Constitution du fonds</h2>
<p>Les photographies ont été réalisées sur plusieurs décennies par Éric Jantzen, dont la démarche méthodique a permis de constituer un corpus homogène et représentatif. Les images couvrent l'ensemble des arrondissements parisiens avec une attention particulière portée aux immeubles de la fin du XIXe et du début du XXe siècle.</p>
<h2>Indexation et enrichissement</h2>
<p>Dans le cadre du projet TORNE-H, le Centre de ressources et de recherche Daniel Marchesseau a entrepris une première expérimentation d'indexation assistée par intelligence artificielle sur ce fonds. L'objectif est de produire une indexation iconographique pertinente, en complément d'une structuration et d'un enrichissement documentaires.</p>
<h2>Conservation</h2>
<p>Le fonds numérique est conservé par le Service de la Documentation du musée d'Orsay. Les images sont publiées en format JPG dans une résolution moyenne, uniquement pour les photographies dont les droits sont dans le domaine public.</p>`
  },
  projet: {
    title: 'Le projet TORNE-H',
    html: `<h1>Le projet TORNE-H</h1>
<p>TORNE-H est un projet de recherche porté par le <strong>musée des Arts Décoratifs</strong>, avec pour partenaires l'<strong>École nationale des Chartes-PSL</strong> et la <strong>Bibliothèque nationale de France</strong>. Le Centre de ressources et de recherche Daniel Marchesseau des musées d'Orsay et de l'Orangerie a rejoint ce projet en 2026.</p>
<h2>Objectifs</h2>
<p>Débuté en octobre 2024, le projet explore les <strong>techniques avancées d'analyse d'images par intelligence artificielle</strong>. Il vise à démontrer la valeur ajoutée de l'IA pour le traitement des collections par le personnel scientifique et à tester l'intégration des données générées au sein des processus métiers propres à la gestion des collections nationales.</p>
<h2>L'expérimentation Architecture Paris</h2>
<p>Dans le cadre de TORNE-H, le Centre de ressources et de recherche Daniel Marchesseau réalise une première expérimentation d'indexation assistée par IA sur le fonds Jantzen. Cette interface en est le résultat : elle présente les données produites dans un environnement de consultation cartographique et documentaire.</p>
<h2>Partenaires</h2>
<ul>
  <li><strong>Musée des Arts Décoratifs</strong> (porteur du projet)</li>
  <li><strong>Musées d'Orsay et de l'Orangerie — EPMO</strong></li>
  <li><strong>École nationale des Chartes-PSL</strong></li>
  <li><strong>Bibliothèque nationale de France</strong></li>
</ul>`
  },
  credits: {
    title: 'Crédits',
    html: `<h1>Crédits</h1>
<h2>Fonds photographique</h2>
<p>Photographies : <strong>Éric Jantzen</strong><br>Conservation : Service de la Documentation, musée d'Orsay</p>
<h2>Conception et réalisation</h2>
<p>Direction du projet : <strong>Benoît Deshayes</strong>, chef du service des données patrimoniales numériques, EPMO.<br>
Recherche et traitement des données : <strong>Eva Rivière</strong>, stagiaire Master 2 TNAH, École nationale des Chartes-PSL.</p>
<h2>Technologies utilisées</h2>
<p>Cartographie : <a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a> · Fond de carte : <a href="https://www.openstreetmap.org" target="_blank" rel="noopener">OpenStreetMap</a> · Moteur de recherche : <a href="https://lunrjs.com" target="_blank" rel="noopener">Lunr.js</a></p>
<h2>Remerciements</h2>
<p>Claire Guitton, Clara Baudry, Clarisse Estebe, Clémence Raynaud, Frédéric Robinson, Marion Charpier (École nationale des Chartes-PSL).</p>`
  },
  cgu: {
    title: "Conditions générales d'utilisation",
    html: `<h1>Conditions générales d'utilisation</h1>
<p>Les présentes conditions générales d'utilisation régissent l'accès et l'utilisation de l'interface de valorisation du fonds photographique Architecture Paris, réalisée dans le cadre du projet de recherche TORNE-H.</p>
<h2>Propriété intellectuelle</h2>
<p>L'ensemble des contenus de cette interface (textes, images, données) est soumis à la législation française et internationale sur la propriété intellectuelle. Les images publiées sont des photographies de bâtiments dans le domaine public.</p>
<h2>Utilisation des données</h2>
<p>Les données présentées sont produites à des fins de recherche dans le cadre du projet TORNE-H. Toute réutilisation est soumise à l'accord préalable de l'EPMO.</p>
<h2>Prototype de recherche</h2>
<p>Cette interface est un prototype réalisé dans un cadre de recherche et n'est pas destinée à devenir un service pérenne. L'EPMO ne saurait être tenu responsable des éventuelles erreurs ou imprécisions dans les données.</p>
<h2>Contact</h2>
<p>Pour toute question : <a href="mailto:benoit.deshayes@musee-orsay.fr">benoit.deshayes@musee-orsay.fr</a><br>
<em>CGU de l'établissement : <a href="https://www.musee-orsay.fr" target="_blank" rel="noopener">www.musee-orsay.fr</a></em></p>`
  }
};

/* ─── PAGES STATIQUES ───────────────────────────────────────────────────── */

function showPage(pageKey) {
  // Retirer l'état actif de tous les liens de navigation
  document.querySelectorAll('#header-nav a').forEach(a => a.classList.remove('active'));

  if (pageKey === 'carte') {
    closePage();
    const navCarte = document.getElementById('nav-carte');
    if (navCarte) navCarte.classList.add('active');
    return;
  }

  const page = PAGES_CONTENT[pageKey];
  if (!page) return;

  const navEl = document.getElementById(`nav-${pageKey}`);
  if (navEl) navEl.classList.add('active');

  const titleEl = document.getElementById('page-overlay-title');
  const bodyEl  = document.getElementById('page-overlay-body');

  if (titleEl) titleEl.textContent = page.title;
  if (bodyEl)  bodyEl.innerHTML   = page.html;

  // Masque l'en-tête de l'overlay pour les pages avec un lien nav (base, projet)
  // Le conserve pour les pages sans lien direct (credits, cgu)
  const overlayHeader = document.getElementById('page-overlay-header');
  if (overlayHeader) overlayHeader.hidden = !!navEl;

  const overlay = document.getElementById('page-overlay');
  if (overlay) {
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
  }
}

function closePage() {
  const overlay = document.getElementById('page-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
  }
}