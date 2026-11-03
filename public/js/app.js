// =====================================================================
// app.js — Interface de Compta Lisa (écrans, navigation, saisie).
// Règle de sécurité : jamais d'innerHTML avec des données ; tout passe par
// textContent / createElement (fonction h). Rien de financier en console.
// =====================================================================
import * as D from './donnees.js';
import { calculerAnnee, completerPrevision, suiviPlafond, simulateurFiscal, microVsReel, valeurJourSimulee } from './calc.js';
import { eur, nombre, pct, jours, lireEuros, lirePct, lireJours, lireNombre, MOIS, MOIS_COURT } from './format.js';
import { anneeVierge, anneeSuivante } from './defauts.js';

// ------------------------------------------------------------------ Outils DOM
function h(tag, attrs = {}, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') e.style.cssText = v; // CSSOM : autorisé par la CSP (contrairement à l'attribut style)
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of enfants.flat(Infinity)) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : String(c));
  return e;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...enfants) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, v);
  for (const c of enfants.flat()) if (c) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}
const racine = () => document.getElementById('racine');
function notifier(msg) {
  const n = h('div', { class: 'notif', role: 'status' }, msg);
  document.body.append(n); setTimeout(() => n.remove(), 3500);
}
let idSeq = 0; const nid = (p) => `${p}-${++idSeq}`;
const signe = (c) => (c < 0 ? 'negatif' : '');

// ------------------------------------------------------------------ État
const MOIS_VIDE = () => ({ ca: null, nbSeances: 0, caHorsSoins: 0, joursConge: 0, joursFormation: 0, retraitForce: null, epargne: 0,
  depSupervision: 0, depFormation: 0, autresAchats: [], soldeReel: null, paiementUrssaf: 0, paiementImpot: 0, declareUrssaf: false, forces: {} });
const etat = { annee: new Date().getFullYear(), annees: [], params: null, mois: Array(12).fill(null), res: [], reglages: { accueil: 'tableau', theme: 'clair' }, stop: null };
const aujourdHui = new Date();
const moisCourant = () => (etat.annee === aujourdHui.getFullYear() ? aujourdHui.getMonth() : etat.annee < aujourdHui.getFullYear() ? 11 : 0);
const moisSaisi = (m) => etat.mois[m] && etat.mois[m].ca !== null && etat.mois[m].ca !== undefined;
const verrouillee = () => !!etat.params?.verrouillee;

function recalculer() {
  if (!etat.params) { etat.res = []; return; }
  const p = paramsCalcul(etat.params);
  etat.res = calculerAnnee(p, completerPrevision(p, etat.mois));
}
/** Convertit les paramètres stockés en paramètres de calcul. */
function paramsCalcul(P) {
  const total = Array.from({ length: 12 }, (_, m) => (P.chargesFixes || []).reduce((t, c) => t + (c.montants?.[m] || 0), 0));
  return { ...P, chargesFixesTotal: total, autresSalaires: P.autresSalaires || Array(12).fill(0), valeurJour: P.valeurJour || Array(12).fill(null) };
}
const dernierMoisSaisi = () => { for (let m = 11; m >= 0; m--) if (moisSaisi(m)) return m; return -1; };
const moisReference = () => { const d = dernierMoisSaisi(); return d >= 0 ? d : moisCourant(); };

// ------------------------------------------------------------------ Démarrage
async function demarrer() {
  try { await D.initialiser(); } catch { return ecranErreur('Impossible de charger l\'application. Vérifie ta connexion puis recharge la page.'); }
  D.surErreurEcriture((code) => notifier(code === 'permission-denied' ? 'Enregistrement refusé (droits ou valeur hors limites).' : 'Erreur d\'enregistrement. Réessaie dans un instant.'));
  D.surConnexion((u) => ouvrirSession(u).catch((e) => ecranErreur(`Chargement impossible (${e?.code || 'erreur inconnue'}). Recharge la page ; si ça persiste, préviens Corentin.`, true)));
}
async function ouvrirSession(u) {
  {
    if (!u) return ecranConnexion();
    if (!u.emailVerified) return ecranVerification();
    if (u.autorise === false) return ecranErreur('Ce compte n\'est pas autorisé. Demande à Corentin de l\'ajouter.', true);
    if (D.MODE_DEMO) D.chargerDemo(etat.annee);
    etat.reglages = { ...etat.reglages, ...(await D.lireReglages()) };
    appliquerTheme();
    etat.annees = await D.listerAnnees();
    if (!etat.annees.includes(etat.annee) && etat.annees.length) etat.annee = etat.annees.at(-1);
    construireCadre();
    ouvrirAnnee(etat.annee);
    // Nouvelle année civile pas encore créée : proposition à chaque ouverture (pas sur téléphone)
    const an = aujourdHui.getFullYear();
    if (!consultation() && !etat.annees.includes(an) && etat.annees.includes(an - 1)) dialogueNouvelleAnnee(an, an - 1);
  }
}
function appliquerTheme() {
  const t = etat.reglages.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'sombre' : 'clair') : etat.reglages.theme;
  document.documentElement.dataset.theme = t || 'clair';
}

function marque() {
  return h('div', { class: 'marque' },
    s('svg', { width: 30, height: 30, viewBox: '0 0 32 32', 'aria-hidden': 'true' },
      s('rect', { width: 32, height: 32, rx: 9, fill: 'var(--accent)' }),
      s('path', { d: 'M9 21c3-7 11-7 14 0', stroke: '#fff', 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round' }),
      s('circle', { cx: 16, cy: 11, r: 3, fill: '#fff' })),
    'Compta Lisa');
}
const MSG_CONFIDENTIALITE = 'Secret professionnel : n\'inscris jamais de nom de patient ni d\'information de santé dans cette application. Uniquement des montants et des codes anonymes.';

function ecranConnexion(message = '') {
  const erreur = h('p', { class: 'erreur', role: 'alert', id: 'err-cnx' }, message);
  const email = h('input', { class: 'entree texte', id: 'email', type: 'email', name: 'email', autocomplete: 'username', required: true, 'aria-describedby': 'err-cnx' });
  const mdp = h('input', { class: 'entree texte', id: 'mdp', type: 'password', name: 'password', autocomplete: 'current-password', required: true });
  const bouton = h('button', { class: 'btn btn-principal', type: 'submit' }, 'Se connecter');
  const form = h('form', { class: 'carte-connexion', onsubmit: async (e) => {
    e.preventDefault(); erreur.textContent = ''; bouton.disabled = true;
    try { await D.connexion(email.value.trim(), mdp.value); } catch (err) {
      erreur.textContent = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(err?.code)
        ? 'E-mail ou mot de passe incorrect.' : err?.code === 'auth/too-many-requests' ? 'Trop d\'essais. Patiente quelques minutes.' : 'Connexion impossible. Vérifie ta connexion internet.';
      bouton.disabled = false;
    }
  } },
  marque(), h('h1', {}, 'Connexion'),
  h('div', { class: 'champ' }, h('label', { for: 'email' }, 'Adresse e-mail'), email),
  h('div', { class: 'champ', style: 'margin-top:12px' }, h('label', { for: 'mdp' }, 'Mot de passe'), mdp),
  erreur,
  h('div', { class: 'actions', style: 'justify-content:space-between' },
    h('button', { class: 'btn-lien btn', type: 'button', onclick: async () => {
      if (!email.value) { erreur.textContent = 'Saisis d\'abord ton e-mail.'; return; }
      try { await D.motDePasseOublie(email.value.trim()); } catch { /* même message : ne révèle pas si le compte existe */ }
      erreur.textContent = 'Si ce compte existe, un e-mail de réinitialisation vient d\'être envoyé.';
    } }, 'Mot de passe oublié'), bouton),
  h('p', { class: 'confidentialite', style: 'margin-top:20px' }, MSG_CONFIDENTIALITE));
  racine().replaceChildren(h('main', { class: 'ecran-centre' }, form));
  email.focus();
}
function ecranVerification() {
  racine().replaceChildren(h('main', { class: 'ecran-centre' }, h('div', { class: 'carte-connexion' }, marque(),
    h('h1', {}, 'Vérifie ton e-mail'),
    h('p', {}, 'Clique sur le lien reçu par e-mail, puis recharge cette page.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: async () => { try { await D.renvoyerVerification(); notifier('Lien renvoyé.'); } catch { notifier('Envoi impossible pour le moment.'); } } }, 'Renvoyer le lien'),
      h('button', { class: 'btn', onclick: () => D.deconnexion() }, 'Se déconnecter'),
      h('button', { class: 'btn btn-principal', onclick: () => location.reload() }, 'J\'ai vérifié')))));
}
function ecranErreur(msg, avecDeconnexion = false) {
  racine().replaceChildren(h('main', { class: 'ecran-centre' }, h('div', { class: 'carte-connexion', role: 'alert' }, marque(), h('p', {}, msg),
    avecDeconnexion ? h('button', { class: 'btn', onclick: () => D.deconnexion() }, 'Se déconnecter') : null)));
}

// ------------------------------------------------------------------ Cadre (navigation)
const ICONES = {
  tableau: 'M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z',
  saisie: 'M4 20h4l10-10-4-4L4 16zm12-14 4 4',
  annuel: 'M3 5h18M3 12h18M3 19h18M8 3v18',
  parametres: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8-3 2-1-2-4-2 1-2-1V5h-4v2l-2 1-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 1v2h4v-2l2-1 2 1 2-4-2-1z',
  simulateurs: 'M4 4h16v16H4zM8 8h3M8 12h8M8 16h5',
  sauvegarde: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
};
const VUES = [['tableau', 'Tableau de bord'], ['saisie', 'Saisie du mois'], ['annuel', 'Vue annuelle'], ['parametres', 'Paramètres'], ['simulateurs', 'Simulateurs'], ['sauvegarde', 'Sauvegarde']];
// Téléphone (≤ 760 px) : mode consultation, sans saisie (tableau de bord simplifié + vue annuelle).
const TEL = matchMedia('(max-width: 760px)');
const consultation = () => TEL.matches;
const vuesVisibles = () => (consultation() ? VUES.filter(([v]) => v === 'tableau' || v === 'annuel') : VUES);
TEL.addEventListener('change', () => { if (document.getElementById('vue')) { construireCadre(); afficher(false); } });

function construireCadre() {
  const statut = h('span', { class: 'statut', role: 'status', 'aria-live': 'polite' });
  D.surStatut((st) => {
    statut.dataset.s = st;
    statut.textContent = { enregistre: 'Enregistré', enCours: 'Enregistrement…', horsLigne: 'Hors ligne — sera envoyé au retour du réseau', erreur: 'Erreur d\'enregistrement' }[st];
  });
  const nav = h('nav', { class: 'nav', 'aria-label': 'Navigation principale' },
    vuesVisibles().map(([id, nom]) => h('a', { href: '#/' + id, 'data-vue': id },
      s('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, s('path', { d: ICONES[id] })),
      h('span', {}, nom))));
  const choixAnnee = h('select', { 'aria-label': 'Année', id: 'choix-annee', onchange: (e) => ouvrirAnnee(Number(e.target.value)) });
  document.body.classList.toggle('consultation', consultation());
  racine().replaceChildren(h('div', { class: 'appli' },
    h('aside', { class: 'barre-laterale' }, marque(), nav,
      h('div', { class: 'pied-nav' }, choixAnnee, statut,
        h('button', { class: 'btn', onclick: () => D.deconnexion() }, 'Se déconnecter'))),
    h('main', { class: 'contenu', id: 'vue', tabindex: '-1' })));
  remplirAnnees();
  window.onhashchange = () => afficher(true);
}
function remplirAnnees() {
  const sel = document.getElementById('choix-annee'); if (!sel) return;
  const liste = [...new Set([...etat.annees, etat.annee])].sort();
  sel.replaceChildren(...liste.map((a) => h('option', { value: a, selected: a === etat.annee }, a)));
}

function ouvrirAnnee(a) {
  etat.annee = a; etat.stop?.(); etat.params = null; etat.mois = Array(12).fill(null);
  let premier = true;
  etat.stop = D.ecouterAnnee(a, ({ params, mois }) => {
    etat.params = params; etat.mois = mois; recalculer();
    // Ne pas reconstruire un formulaire en cours de frappe (retour d'écriture ou autre onglet)
    const actif = document.activeElement;
    if (!premier && actif && actif.closest('#vue') && ['INPUT', 'SELECT'].includes(actif.tagName)) { majPanneau?.(); return; }
    premier = false; afficher(false);
  });
  remplirAnnees();
}

function vueCourante() {
  const [, vue = '', arg] = location.hash.split('/');
  const accueil = consultation() ? 'tableau' : etat.reglages.accueil || 'tableau';
  return { vue: vuesVisibles().some(([v]) => v === vue) ? vue : accueil, arg };
}
let majPanneau = null;
function afficher(focus) {
  const { vue, arg } = vueCourante();
  document.querySelectorAll('.nav a').forEach((a) => { if (a.dataset.vue === vue) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const zone = document.getElementById('vue'); if (!zone) return;
  majPanneau = null;
  if (!etat.params && vue !== 'sauvegarde') { zone.replaceChildren(vueSansAnnee()); return; }
  const rendus = { tableau: () => (consultation() ? vueMobile() : vueTableau()), saisie: () => vueSaisie(arg), annuel: vueAnnuel, parametres: vueParametres, simulateurs: vueSimulateurs, sauvegarde: vueSauvegarde };
  zone.replaceChildren(rendus[vue]());
  document.title = `${VUES.find(([v]) => v === vue)[1]} — Compta Lisa`;
  if (focus) zone.focus();
}

function vueSansAnnee() {
  const prec = etat.annees.filter((a) => a < etat.annee).at(-1);
  return h('section', {}, h('h1', {}, `Année ${etat.annee}`),
    h('p', {}, 'Cette année n\'existe pas encore.'),
    h('div', { class: 'actions', style: 'justify-content:flex-start' },
      prec ? h('button', { class: 'btn btn-principal', onclick: () => dialogueNouvelleAnnee(etat.annee, prec) }, `Créer ${etat.annee} à partir de ${prec}`) : null,
      h('button', { class: 'btn', onclick: async () => { await D.creerAnnee(etat.annee, anneeVierge()); etat.annees = await D.listerAnnees(); remplirAnnees(); } }, 'Créer une année vierge')));
}
async function creerAnneeDepuis(cible, prec, donnees) {
  // Calcule décembre de l'année précédente (lu sur le serveur) pour reporter les soldes
  const p = paramsCalcul(donnees.params);
  const dec = calculerAnnee(p, completerPrevision(p, donnees.mois))[11];
  await D.creerAnnee(cible, anneeSuivante(donnees.params, dec));
  etat.annees = await D.listerAnnees(); ouvrirAnnee(cible);
  notifier(`Année ${cible} créée. Vérifie la trésorerie initiale dans Paramètres.`);
}

/**
 * Passage à une nouvelle année : fenêtre de confirmation en deux temps.
 * Proposée à chaque ouverture du site tant que la nouvelle année n'est pas créée.
 */
async function dialogueNouvelleAnnee(cible, prec) {
  let donnees;
  try { donnees = await D.lireAnnee(prec); } catch { notifier('Lecture impossible (connexion ?). Réessaie plus tard.'); return; }
  if (!donnees.params) return;
  const dec = donnees.mois[11];
  const decIncomplet = !dec || dec.ca === null || dec.ca === undefined || dec.soldeReel === null || dec.soldeReel === undefined;
  const d = h('dialog', { 'aria-labelledby': 'titre-annee' });
  const fermer = () => { d.close(); d.remove(); };
  const etape1 = () => d.replaceChildren(
    h('h2', { id: 'titre-annee' }, `Passer à ${cible} ?`),
    h('p', {}, `L'année ${cible} sera créée à partir des paramètres de ${prec} (charges, cibles, taux). Les soldes des enveloppes de fin décembre ${prec} seront reportés.`),
    decIncomplet ? h('p', { class: 'bandeau' }, `Attention : décembre ${prec} n'est pas complètement saisi (CA ou solde réel du compte). Les soldes reportés seraient des estimations. Saisis décembre avant de valider.`) : null,
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: fermer }, 'Plus tard'),
      h('button', { class: 'btn btn-principal', onclick: etape2 }, `Passer à ${cible}`)));
  const etape2 = () => d.replaceChildren(
    h('h2', { id: 'titre-annee' }, 'Confirmation'),
    h('p', {}, `Créer définitivement l'année ${cible} ?`),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: fermer }, 'Annuler'),
      h('button', { class: 'btn btn-principal', onclick: async (e) => { e.target.disabled = true; try { await creerAnneeDepuis(cible, prec, donnees); } catch { notifier('Création impossible. Réessaie.'); } fermer(); } }, `Oui, créer ${cible}`)));
  etape1(); document.body.append(d); d.showModal();
}

// ------------------------------------------------------------------ Champs de saisie réutilisables
/**
 * Champ numérique au format français. type : 'eur' | 'pct' | 'jours' | 'entier'
 * onChange(valeur) n'est appelé qu'avec une valeur valide (ou null si vide et autorisé).
 */
function champ({ label, valeur, onChange, type = 'eur', aide, vide = true, min, max, lecture = false, id = nid('c'), compact = false }) {
  const fmt = { eur: nombre, pct: (v) => (v === null || v === undefined ? '' : nombre(v)), jours, entier: (v) => (v ?? '') }[type];
  const lire = { eur: lireEuros, pct: lirePct, jours: lireJours, entier: (t) => { const n = lireNombre(t); return n === null || Number.isNaN(n) ? n : Math.round(n); } }[type];
  const err = h('div', { class: 'erreur', id: id + '-e', 'aria-live': 'polite' });
  const input = h('input', { class: 'entree', id, type: 'text', inputmode: 'decimal', autocomplete: 'off', value: fmt(valeur), readonly: lecture || verrouillee(), 'aria-describedby': id + '-e', 'aria-label': compact ? label : null });
  input.addEventListener('input', () => {
    const v = lire(input.value);
    let msg = '';
    if (Number.isNaN(v)) msg = 'Nombre invalide (ex. 1 234,56).';
    else if (v === null && !vide) msg = 'Valeur obligatoire.';
    else if (v !== null && min !== undefined && v < min) msg = 'Valeur trop petite.';
    else if (v !== null && max !== undefined && v > max) msg = 'Valeur trop grande.';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    err.textContent = msg;
    if (!msg) onChange(v);
  });
  input.addEventListener('blur', () => { const v = lire(input.value); if (!Number.isNaN(v) && !err.textContent) input.value = fmt(v); });
  const suffixe = { eur: '€', pct: '%', jours: 'j', entier: '' }[type];
  const boite = suffixe ? h('div', { class: 'suffixe' }, input, h('span', { 'aria-hidden': 'true' }, suffixe)) : input;
  if (compact) return h('div', {}, boite, err);
  return h('div', { class: 'champ' }, h('label', { for: id }, label), boite, aide ? h('div', { class: 'aide' }, aide) : null, err);
}

// ------------------------------------------------------------------ Tableau de bord
function vueTableau() {
  const m = moisReference(); const r = etat.res[m]; const P = etat.params;
  const plafond = suiviPlafond(etat.res, P.plafondMicro, P.seuilAlertePlafond);
  const horsSoins = etat.mois.reduce((t, x) => t + (x?.caHorsSoins || 0), 0);
  const deCote = r.provSupervision + r.provFormation + r.provTresorerie + r.tirCharges + r.tirSalaire;
  const ecartAlerte = r.ecartReel !== null && Math.abs(r.ecartReel) > (P.seuilEcart ?? 10000);
  const manquants = Array.from({ length: moisCourant() }, (_, i) => i).filter((i) => !moisSaisi(i));

  return h('section', {},
    h('div', { class: 'entete' }, h('h1', {}, `Tableau de bord — ${MOIS[m]} ${etat.annee}`),
      manquants.length ? h('a', { class: 'pastille alerte', href: `#/saisie/${manquants[0] + 1}` }, `${manquants.length} mois non saisi${manquants.length > 1 ? 's' : ''}`) : null,
      r.prevision ? h('span', { class: 'pastille' }, 'Prévision') : null),
    verrouillee() ? h('p', { class: 'bandeau info' }, 'Année clôturée : lecture seule.') : null,
    h('div', { class: 'grille g3' },
      h('article', { class: 'carte' }, h('div', { class: 'question' }, 'Combien te verser ce mois-ci ?'),
        h('div', { class: 'grand' }, eur(r.salaireVerse)),
        h('ul', { class: 'lignes' },
          h('li', {}, h('span', {}, 'Net cabinet calculé'), h('span', { class: 'num ' + signe(r.netCabinet) }, eur(r.netCabinet))),
          r.retrait !== null ? h('li', {}, h('span', {}, 'Retrait manuel forcé'), h('span', { class: 'num' }, eur(r.retrait))) : null,
          h('li', {}, h('span', {}, 'Autres revenus salariés'), h('span', { class: 'num' }, eur(r.autresSalaires))),
          h('li', { class: 'total' }, h('span', {}, 'Reste à vivre total'), h('span', { class: 'num' }, eur(r.resteAVivre))))),
      h('article', { class: 'carte' }, h('div', { class: 'question' }, 'Combien mettre de côté ?'),
        h('div', { class: 'grand' }, eur(deCote)),
        h('ul', { class: 'lignes' },
          [['Supervision', r.provSupervision], ['Formation', r.provFormation], ['Trésorerie de précaution', r.provTresorerie], ['Tirelire charges', r.tirCharges], ['Tirelire salaire', r.tirSalaire], ['Urssaf + impôt à payer le mois suivant', r.du]]
            .map(([n, v]) => h('li', {}, h('span', {}, n), h('span', { class: 'num' }, eur(v)))))),
      h('article', { class: 'carte' }, h('div', { class: 'question' }, 'Où en est le compte pro ?'),
        h('div', { class: 'grand' }, eur(r.soldeReel ?? r.theoriqueCompte)),
        h('div', { class: 'muted petit' }, r.soldeReel === null ? 'Solde théorique (solde réel non saisi)' : 'Solde réel saisi'),
        h('ul', { class: 'lignes' },
          h('li', {}, h('span', {}, 'Théorique'), h('span', { class: 'num' }, eur(r.theoriqueCompte))),
          h('li', {}, h('span', {}, 'Réel'), h('span', { class: 'num' }, eur(r.soldeReel))),
          h('li', { class: 'total' }, h('span', {}, 'Écart'), r.ecartReel === null ? h('span', { class: 'muted' }, '—')
            : h('span', { class: 'pastille ' + (ecartAlerte ? 'alerte' : 'ok') }, eur(r.ecartReel)))))),

    h('div', { class: 'grille g2', style: 'margin-top:16px' },
      h('article', { class: 'carte' }, h('h2', {}, 'Plafond micro-BNC'),
        h('div', { class: 'jauge' + (plafond.alerte ? ' alerte' : ''), role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(plafond.pct / 100), 'aria-label': 'CA cumulé par rapport au plafond' },
          h('span', { style: `width:${Math.min(100, plafond.pct / 100)}%` }),
          h('i', { class: 'repere', style: `left:${(P.seuilAlertePlafond || 8500) / 100}%` })),
        h('p', { class: 'petit' }, h('strong', { class: 'num' }, eur(plafond.cumul)), ` encaissés sur ${eur(P.plafondMicro)} (${pct(plafond.pct)})`),
        h('p', { class: 'petit muted' }, `Projection fin d'année : ${eur(plafond.projection)}`, plafond.alerte ? h('span', { class: 'pastille alerte', style: 'margin-left:8px' }, 'Seuil d\'alerte atteint') : null),
        h('p', { class: 'petit muted' }, `Recettes hors soins (TVA) : ${eur(horsSoins)} sur ${eur(P.fiscal?.seuilTva)}`,
          horsSoins > (P.fiscal?.seuilTva ?? Infinity) * 0.85 ? h('span', { class: 'pastille alerte', style: 'margin-left:8px' }, 'Proche du seuil TVA') : null)),
      h('article', { class: 'carte' }, h('h2', {}, `Enveloppes fin ${MOIS[m].toLowerCase()}`),
        h('ul', { class: 'lignes' },
          [['Supervision', r.soldes.supervision], ['Formation', r.soldes.formation], ['Trésorerie de précaution', r.soldes.tresorerie], ['Tirelire charges', r.soldes.tirelireCharges], ['Tirelire salaire', r.soldes.tirelireSalaire]]
            .map(([n, v]) => h('li', {}, h('span', {}, n, v < 0 ? h('span', { class: 'pastille ko', style: 'margin-left:8px' }, 'négative') : null), h('span', { class: 'num ' + signe(v) }, eur(v)))),
          h('li', {}, h('span', {}, 'Urssaf + impôt à reverser'), h('span', { class: 'num' }, eur(r.aReverser))),
          h('li', { class: 'total' }, h('span', {}, 'Total des enveloppes'), h('span', { class: 'num' }, eur(r.soldes.total)))))),

    h('div', { class: 'grille g2', style: 'margin-top:16px' },
      h('article', { class: 'carte' }, h('h2', {}, 'Chiffre d\'affaires mensuel'), graphiqueCA(),
        h('p', { class: 'petit muted' }, 'Barres pleines : encaissé. Barres en pointillés : prévision.')),
      h('article', { class: 'carte' }, h('h2', {}, 'Répartition du CA de l\'année'), repartitionCA(),
        h('p', { class: 'petit muted', style: 'margin-top:10px' }, `Prévision fin d'année : CA ${eur(etat.res.reduce((t, x) => t + x.ca, 0))}, reste à vivre ${eur(etat.res.reduce((t, x) => t + x.resteAVivre, 0))}.`))),
    h('article', { class: 'carte', style: 'margin-top:16px' }, h('h2', {}, 'Échéances et rappels'), echeances()),
    h('p', { class: 'confidentialite', style: 'margin-top:16px' }, MSG_CONFIDENTIALITE));
}

// ------------------------------------------------------------------ Téléphone : consultation
let moisVu = null; // mois affiché sur téléphone (null = dernier mois saisi)
function vueMobile() {
  const m = moisVu ?? moisReference(); const r = etat.res[m]; const P = etat.params;
  const plafond = suiviPlafond(etat.res, P.plafondMicro, P.seuilAlertePlafond);
  const deCote = r.provSupervision + r.provFormation + r.provTresorerie + r.tirCharges + r.tirSalaire;
  const aller = (d) => { moisVu = Math.min(11, Math.max(0, m + d)); afficher(false); };
  const ligne = (n, v, cls = '') => h('li', { class: cls }, h('span', {}, n), h('span', { class: 'num ' + signe(v) }, eur(v)));
  return h('section', { class: 'mobile' },
    h('div', { class: 'choix-mois' },
      h('button', { class: 'btn', 'aria-label': 'Mois précédent', disabled: m === 0, onclick: () => aller(-1) }, '‹'),
      h('h1', {}, `${MOIS[m]} ${etat.annee}`, r.prevision ? h('span', { class: 'pastille' }, 'Prévision') : null),
      h('button', { class: 'btn', 'aria-label': 'Mois suivant', disabled: m === 11, onclick: () => aller(1) }, '›')),
    h('p', { class: 'bandeau info petit' }, 'Consultation sur téléphone. La saisie se fait sur ordinateur.'),
    h('article', { class: 'carte' }, h('div', { class: 'question' }, 'À te verser'), h('div', { class: 'grand' }, eur(r.salaireVerse)),
      h('ul', { class: 'lignes' }, ligne('CA encaissé', r.ca), ligne('Reste à vivre total', r.resteAVivre, 'total'))),
    h('article', { class: 'carte' }, h('div', { class: 'question' }, 'À mettre de côté'), h('div', { class: 'grand' }, eur(deCote)),
      h('ul', { class: 'lignes' }, ligne('Urssaf + impôt à payer', r.du))),
    h('article', { class: 'carte' }, h('div', { class: 'question' }, 'Compte pro'), h('div', { class: 'grand' }, eur(r.soldeReel ?? r.theoriqueCompte)),
      h('div', { class: 'muted petit' }, r.soldeReel === null ? 'Théorique (solde réel non saisi)' : `Réel — écart ${eur(r.ecartReel)}`)),
    h('article', { class: 'carte' }, h('h2', {}, 'Enveloppes'),
      h('ul', { class: 'lignes' },
        [['Supervision', r.soldes.supervision], ['Formation', r.soldes.formation], ['Trésorerie', r.soldes.tresorerie], ['Tirelire charges', r.soldes.tirelireCharges], ['Tirelire salaire', r.soldes.tirelireSalaire]]
          .map(([n, v]) => ligne(n, v)), ligne('Total', r.soldes.total, 'total'))),
    h('article', { class: 'carte' }, h('h2', {}, 'Plafond micro-BNC'),
      h('div', { class: 'jauge' + (plafond.alerte ? ' alerte' : ''), role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(plafond.pct / 100), 'aria-label': 'CA cumulé par rapport au plafond' },
        h('span', { style: `width:${Math.min(100, plafond.pct / 100)}%` })),
      h('p', { class: 'petit' }, `${eur(plafond.cumul)} sur ${eur(P.plafondMicro)} (${pct(plafond.pct)})`)));
}

function graphiqueCA() {
  const W = 600, H = 210, b = 26, l = 44;
  const max = Math.max(1, ...etat.res.map((r) => r.ca));
  const larg = (W - l - 8) / 12;
  const g = s('svg', { class: 'graph', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'CA mensuel : ' + etat.res.map((r, i) => `${MOIS[i]} ${eur(r.ca)}${r.prevision ? ' (prévision)' : ''}`).join(', ') });
  for (let i = 0; i <= 2; i++) {
    const y = H - b - ((H - b - 10) * i) / 2;
    g.append(s('line', { class: 'axe', x1: l, x2: W, y1: y, y2: y }), s('text', { x: l - 6, y: y + 4, 'text-anchor': 'end' }, (max * i / 2 / 100000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k€'));
  }
  etat.res.forEach((r, i) => {
    const hh = ((H - b - 10) * r.ca) / max;
    const x = l + i * larg + larg * 0.18;
    g.append(s('rect', { class: 'barre' + (r.prevision ? ' prev' : ''), x, y: H - b - hh, width: larg * 0.64, height: Math.max(0, hh), rx: 3 },
      s('title', {}, `${MOIS[i]} : ${eur(r.ca)}`)), s('text', { x: x + larg * 0.32, y: H - 8, 'text-anchor': 'middle' }, MOIS_COURT[i]));
  });
  return g;
}
function repartitionCA() {
  const R = etat.res.filter((r) => r.saisi);
  const somme = (k) => R.reduce((t, r) => t + (typeof k === 'function' ? k(r) : r[k]), 0);
  const ca = somme('ca') || 1;
  const parts = [
    ['Cotisations Urssaf', somme('cotisations'), '#5f5199'], ['Impôt libératoire', somme((r) => r.liberatoire + r.pas), '#8f83c4'],
    ['Charges fixes payées', somme('chargesPayees'), '#c2a35a'], ['Enveloppes', somme((r) => r.provSupervision + r.provFormation + r.provTresorerie), '#5a9c86'],
    ['Tirelires', somme((r) => r.tirCharges + r.tirSalaire), '#9fc9b9'], ['Salaire (hors pioche)', somme((r) => r.baseNette - r.piocheSalaire), '#d9d2ef'],
  ];
  return h('div', {},
    h('div', { class: 'repartition', role: 'img', 'aria-label': parts.map(([n, v]) => `${n} ${pct(Math.round((v * 10000) / ca))}`).join(', ') },
      parts.map(([, v, c]) => h('span', { style: `width:${Math.max(0, (v * 100) / ca)}%;background:${c}` }))),
    h('ul', { class: 'legende' }, parts.map(([n, v, c]) => h('li', {}, h('i', { style: `background:${c}` }), h('span', {}, n), h('span', { class: 'num muted', style: 'margin-left:auto' }, eur(v))))),
    h('p', { class: 'petit muted' }, `Sur ${eur(somme('ca'))} encaissés (mois saisis).`));
}
function echeances() {
  const items = [];
  const m = moisReference(); const r = etat.res[m];
  // Échéance légale : fin du mois suivant (déclaration mensuelle), même à 0 €
  const fin = new Date(etat.annee, m + 2, 0);
  const suivant = `du 1er au ${fin.getDate()} ${MOIS[fin.getMonth()].toLowerCase()}${m === 11 ? ' ' + fin.getFullYear() : ''}`;
  items.push([`Déclaration Urssaf (même à 0 €) et paiement + libératoire (${MOIS[m].toLowerCase()})`, suivant, eur(r.du)]);
  if (aujourdHui.getMonth() <= 11) items.push(['CFE', `15 décembre ${etat.annee}`, '']);
  items.push([`Déclaration de revenus 2042-C-PRO (revenus ${etat.annee})`, `mai-juin ${etat.annee + 1}`, '']);
  if (aujourdHui.getMonth() >= 7 && aujourdHui.getMonth() <= 8) items.push(['Option ou renonciation au versement libératoire pour ' + (etat.annee + 1), `avant le 1er octobre ${etat.annee}`, '']);
  // Garde-fou RFR : le RFR de cette année conditionne le libératoire dans 2 ans
  const F = etat.params.fiscal;
  const sim = simulateurFiscal({ caAnnuel: etat.res.reduce((t, x) => t + x.ca, 0), salairesAnnuels: salairesImposables(), parts: F.parts || 1, f: F });
  return h('div', {},
    h('ul', { class: 'lignes' }, items.map(([n, d, v]) => h('li', {}, h('span', {}, n), h('span', { class: 'num' }, d, v ? ` — ${v}` : '')))),
    sim.vlPossibleDansDeuxAns ? null : h('p', { class: 'bandeau', style: 'margin:12px 0 0' },
      `Attention : le revenu fiscal de référence ${etat.annee} estimé (${eur(sim.rfr)}) dépasse le seuil (${eur(sim.seuilVL)}). Le versement libératoire ne serait plus accessible en ${etat.annee + 2}.`));
}

// ------------------------------------------------------------------ Saisie du mois
function vueSaisie(arg) {
  const n = Number(arg);
  const m = Number.isInteger(n) && n >= 1 && n <= 12 ? n - 1 : moisReference() + (moisSaisi(moisReference()) && moisReference() < 11 ? 1 : 0);
  const S = { ...MOIS_VIDE(), ...(etat.mois[m] || {}) };
  const maj = (cle, v) => {
    S[cle] = v; etat.mois[m] = { ...S }; recalculer(); D.sauverMois(etat.annee, m, { ...S }); majPanneau();
  };
  const P = etat.params;
  const declare = S.declareUrssaf;

  const puces = h('div', { class: 'puces-mois', role: 'navigation', 'aria-label': 'Choix du mois' },
    MOIS.map((nom, i) => h('a', { class: 'puce', href: `#/saisie/${i + 1}`, 'aria-current': i === m ? 'true' : 'false', 'aria-label': `${nom}${moisSaisi(i) ? ', saisi' : i < moisCourant() ? ', non saisi' : ''}` },
      MOIS_COURT[i], moisSaisi(i) ? h('i', { class: 'point', 'aria-hidden': 'true' }) : i < moisCourant() ? h('i', { class: 'point manque', 'aria-hidden': 'true' }) : null)));

  // Autres achats : liste catégorie + montant
  const listeAchats = h('div', {});
  const dessinerAchats = () => listeAchats.replaceChildren(
    ...S.autresAchats.map((a, i) => h('div', { class: 'achat' },
      h('select', { class: 'select', 'aria-label': `Catégorie de l'achat ${i + 1}`, disabled: verrouillee(), onchange: (e) => { S.autresAchats[i] = { ...a, categorie: e.target.value }; maj('autresAchats', [...S.autresAchats]); } },
        (P.categoriesAchats || []).map((c) => h('option', { value: c, selected: c === a.categorie }, c))),
      champ({ label: `Montant de l'achat ${i + 1}`, valeur: a.montant, compact: true, vide: false, min: 0, onChange: (v) => { S.autresAchats[i] = { ...S.autresAchats[i], montant: v }; maj('autresAchats', [...S.autresAchats]); } }),
      h('button', { class: 'btn', type: 'button', disabled: verrouillee(), 'aria-label': `Supprimer l'achat ${i + 1}`, onclick: () => { S.autresAchats.splice(i, 1); maj('autresAchats', [...S.autresAchats]); dessinerAchats(); } }, '×'))),
    h('button', { class: 'btn', type: 'button', disabled: verrouillee() || S.autresAchats.length >= 50, onclick: () => { S.autresAchats.push({ categorie: (P.categoriesAchats || ['Divers'])[0], montant: 0 }); maj('autresAchats', [...S.autresAchats]); dessinerAchats(); listeAchats.querySelectorAll('input').forEach((x, i, t) => i === t.length - 1 && x.focus()); } }, '+ Ajouter un achat'));
  dessinerAchats();

  const form = h('form', { onsubmit: (e) => e.preventDefault(), 'aria-label': `Saisie de ${MOIS[m]}` },
    verrouillee() ? h('p', { class: 'bandeau info' }, 'Année clôturée : lecture seule.') : null,
    h('fieldset', {}, h('legend', {}, '1 · Activité du mois'),
      h('div', { class: 'champs' },
        champ({ label: 'CA encaissé', valeur: S.ca, min: 0, lecture: declare, aide: declare ? 'Mois déclaré à l\'Urssaf : CA verrouillé' : 'Paiements visibles en banque ce mois-ci', onChange: (v) => maj('ca', v) }),
        champ({ label: 'Nombre de séances', type: 'entier', valeur: S.nbSeances, min: 0, max: 1000, vide: false, onChange: (v) => maj('nbSeances', v) }),
        champ({ label: 'Dont recettes hors soins', valeur: S.caHorsSoins, min: 0, vide: false, aide: 'Formation, conseil… (suivi TVA)', onChange: (v) => maj('caHorsSoins', v) }))),
    h('fieldset', {}, h('legend', {}, '4 · Absences'),
      h('div', { class: 'champs' },
        champ({ label: 'Jours de congé', type: 'jours', valeur: S.joursConge, min: 0, max: 31, vide: false, aide: 'Demi-journées : 0,5', onChange: (v) => maj('joursConge', v) }),
        champ({ label: 'Jours de formation', type: 'jours', valeur: S.joursFormation, min: 0, max: 31, vide: false, aide: 'Traités comme des congés', onChange: (v) => maj('joursFormation', v) }))),
    h('fieldset', {}, h('legend', {}, '5 · Salaire et 6 · Épargne'),
      h('div', { class: 'champs' },
        champ({ label: 'Retrait manuel forcé', valeur: S.retraitForce, min: 0, aide: 'Vide = net cabinet calculé', onChange: (v) => maj('retraitForce', v) }),
        champ({ label: 'Épargne perso', valeur: S.epargne, min: 0, vide: false, onChange: (v) => maj('epargne', v) }))),
    h('fieldset', {}, h('legend', {}, '8 · Dépenses pro'),
      h('div', { class: 'champs' },
        champ({ label: 'Supervision', valeur: S.depSupervision, min: 0, vide: false, onChange: (v) => maj('depSupervision', v) }),
        champ({ label: 'Formation', valeur: S.depFormation, min: 0, vide: false, onChange: (v) => maj('depFormation', v) })),
      h('h3', { style: 'margin-top:14px' }, 'Autres achats pro (payés par la trésorerie)'), listeAchats),
    h('fieldset', {}, h('legend', {}, '7 · Fin de mois'),
      h('div', { class: 'champs' },
        champ({ label: 'Solde réel du compte pro', valeur: S.soldeReel, aide: 'Relevé le dernier jour du mois', onChange: (v) => maj('soldeReel', v) }),
        champ({ label: 'Payé à l\'Urssaf ce mois', valeur: S.paiementUrssaf, min: 0, vide: false, onChange: (v) => maj('paiementUrssaf', v) }),
        champ({ label: 'Payé en impôt libératoire', valeur: S.paiementImpot, min: 0, vide: false, onChange: (v) => maj('paiementImpot', v) })),
      h('label', { class: 'case', style: 'margin-top:12px' },
        h('input', { type: 'checkbox', checked: declare, disabled: verrouillee(), onchange: (e) => { maj('declareUrssaf', e.target.checked); afficher(false); } }),
        'Mois déclaré à l\'Urssaf (verrouille le CA)')));

  const panneau = h('aside', { class: 'carte panneau', 'aria-live': 'polite', 'aria-label': 'Résultat du mois' });
  majPanneau = () => panneauResultat(panneau, m);
  majPanneau();
  return h('section', {}, h('div', { class: 'entete' }, h('h1', {}, `Saisie — ${MOIS[m]} ${etat.annee}`)), puces, h('div', { class: 'saisie' }, form, panneau));
}

function panneauResultat(zone, m) {
  const r = etat.res[m]; const P = etat.params; const S = etat.mois[m] || {};
  const ligne = (nom, v, cls = '') => h('li', { class: cls }, h('span', {}, nom), h('span', { class: 'num ' + signe(v) }, eur(v)));
  const forces = Object.keys(S.forces || {});
  // Proposition de lissage (plancher / plafond visés) : l'application propose, Lisa valide
  const sim = P.simulateurJour || {};
  let proposition = null;
  if (!r.prevision && r.retrait === null && sim.plafondVise && r.netCabinet > sim.plafondVise) {
    const exces = r.netCabinet - sim.plafondVise;
    proposition = h('div', { class: 'bandeau info', style: 'margin-top:12px' },
      h('p', { style: 'margin:0 0 8px' }, `Le net dépasse ${eur(sim.plafondVise)} de ${eur(exces)}. Mettre cet excédent dans la tirelire salaire ? Cela avance l'épargne de l'année : la cible annuelle ne change pas, les versements des mois suivants baisseront d'autant.`),
      h('button', { class: 'btn btn-principal', disabled: verrouillee(), onclick: () => appliquerForce(m, 'cibleTirelireSalaire', r.cibleTirelireSalaire + Math.round(exces / Math.max(0.0001, 1 - r.abs / (P.joursOuvres[m] || 20)))) }, 'Appliquer'));
  } else if (!r.prevision && r.retrait === null && sim.plancher && r.netCabinet < sim.plancher) {
    proposition = h('div', { class: 'bandeau info', style: 'margin-top:12px' },
      h('p', { style: 'margin:0 0 8px' }, `Le net est sous ton plancher (${eur(sim.plancher)}). Verser ${eur(sim.plancher)} en retrait forcé ? L'écart sera pris sur la trésorerie.`),
      h('button', { class: 'btn btn-principal', disabled: verrouillee(), onclick: () => { const S2 = { ...MOIS_VIDE(), ...S, retraitForce: sim.plancher }; etat.mois[m] = S2; recalculer(); D.sauverMois(etat.annee, m, S2); afficher(false); } }, 'Appliquer'));
  }
  zone.replaceChildren(...[
    h('div', { class: 'question' }, 'À te verser'),
    h('div', { class: 'grand' }, eur(r.salaireVerse)),
    r.prevision ? h('p', { class: 'petit muted' }, 'CA non saisi : calcul sur la prévision.') : null,
    proposition,
    h('div', { class: 'etape' }, '2 · Frais et État'),
    h('ul', { class: 'lignes' }, ligne('Charges fixes payées', r.chargesPayees), ligne('Cotisations Urssaf', r.cotisations), ligne('Impôt libératoire', r.liberatoire)),
    h('div', { class: 'etape' }, '3 · Mises de côté'),
    h('ul', { class: 'lignes' }, ligne('Supervision', r.provSupervision, forces.includes('provSupervision') ? 'force' : ''), ligne('Formation', r.provFormation, forces.includes('provFormation') ? 'force' : ''),
      ligne('Trésorerie', r.provTresorerie, forces.includes('provTresorerie') ? 'force' : ''), ligne('Tirelire charges', r.tirCharges, forces.includes('cibleTirelireCharges') ? 'force' : ''),
      ligne('Tirelire salaire', r.tirSalaire, forces.includes('cibleTirelireSalaire') ? 'force' : '')),
    forces.length ? h('p', { class: 'petit' }, h('span', { class: 'force' }, 'En orange : valeurs forcées. '),
      h('button', { class: 'btn-lien btn', disabled: verrouillee(), onclick: () => { const S2 = { ...MOIS_VIDE(), ...S, forces: {} }; etat.mois[m] = S2; recalculer(); D.sauverMois(etat.annee, m, S2); afficher(false); } }, 'Revenir en automatique')) : null,
    r.abs ? h('div', { class: 'etape' }, '4 · Absences') : null,
    r.abs ? h('ul', { class: 'lignes' }, ligne('Pioche charges', r.piocheCharges), ligne(`Pioche salaire (${jours(r.abs)} j × ${eur(r.valeurJour)})`, r.piocheSalaire)) : null,
    h('div', { class: 'etape' }, '5 · Salaire'),
    h('ul', { class: 'lignes' }, ligne('Base nette avant impôt', r.baseNette), r.pas ? ligne('Impôt (PAS)', r.pas) : null, ligne('Net cabinet (théorique)', r.netCabinet, 'total'),
      ligne('Reste à vivre total', r.resteAVivre), ligne('Reste à vivre final', r.resteAVivreFinal)),
    h('div', { class: 'etape' }, '7 · Compte pro fin de mois'),
    h('ul', { class: 'lignes' }, ligne('Total enveloppes', r.soldes.total), ligne('Urssaf + impôt à reverser', r.aReverser), ligne('Théorique sur le compte', r.theoriqueCompte, 'total'),
      r.ecartReel !== null ? ligne('Écart réel − théorique', r.ecartReel) : null),
    r.alertes.length ? h('p', {}, r.alertes.map((a) => h('span', { class: 'pastille ' + (a.startsWith('negatif') ? 'ko' : 'alerte'), style: 'margin:2px' }, libelleAlerte(a)))) : null].filter(Boolean));
}
const libelleAlerte = (a) => ({ 'negatif:supervision': 'Supervision négative', 'negatif:formation': 'Formation négative', 'negatif:tresorerie': 'Trésorerie négative',
  'negatif:tirelireCharges': 'Tirelire charges négative', 'negatif:tirelireSalaire': 'Tirelire salaire négative', ecartReel: 'Écart réel > seuil', baseNegative: 'Base nette négative' }[a] || a);
function appliquerForce(m, cle, v) {
  const S = { ...MOIS_VIDE(), ...(etat.mois[m] || {}) };
  S.forces = { ...(S.forces || {}), [cle]: v };
  etat.mois[m] = S; recalculer(); D.sauverMois(etat.annee, m, S); afficher(false);
}

// ------------------------------------------------------------------ Vue annuelle (8 étapes)
const ETAPES = [
  ['1 · Mon activité du mois', [['CA encaissé', 'ca', 'eur'], ['Jours d\'absence', 'abs', 'jours']]],
  ['2 · Mes frais et l\'État', [['Charges fixes payées', 'chargesPayees'], ['Cotisations Urssaf', 'cotisations'], ['Impôt libératoire', 'liberatoire']]],
  ['3 · Mes enveloppes', [['Prov. supervision', 'provSupervision', 'eur', 'provSupervision'], ['Prov. formation', 'provFormation', 'eur', 'provFormation'], ['Prov. trésorerie précaution', 'provTresorerie', 'eur', 'provTresorerie'], ['Tirelire charges', 'tirCharges', 'eur', 'cibleTirelireCharges'], ['Tirelire salaire', 'tirSalaire', 'eur', 'cibleTirelireSalaire']]],
  ['4 · Absences', [['Pioche charges', 'piocheCharges'], ['Pioche salaire', 'piocheSalaire']]],
  ['5 · Mon salaire net', [['Net cabinet (théorique)', 'netCabinet'], ['Base nette avant impôt', 'baseNette'], ['Impôt (PAS)', 'pas'], ['Retrait manuel forcé', 'retrait'], ['Autres revenus salariés', 'autresSalaires'], ['Reste à vivre total', 'resteAVivre']]],
  ['6 · Mon épargne personnelle', [['Reste à vivre final', 'resteAVivreFinal'], ['Épargne perso', (r) => r.resteAVivre - r.resteAVivreFinal]]],
  ['7 · L\'état de mes comptes pro', [['Total trésorerie théorique', (r) => r.soldes.total], ['Enveloppe supervision', (r) => r.soldes.supervision], ['Enveloppe formation', (r) => r.soldes.formation], ['Trésorerie précaution', (r) => r.soldes.tresorerie], ['Tirelire charges', (r) => r.soldes.tirelireCharges], ['Tirelire salaire', (r) => r.soldes.tirelireSalaire], ['Urssaf + impôt à reverser', 'aReverser'], ['Solde réel', 'soldeReel'], ['Écart réel', 'ecartReel']], true],
  ['8 · Mes dépenses pro', [['Dépenses (total)', (r) => r.depSup + r.depForm + r.autresAchats], ['Supervision', 'depSup'], ['Formation', 'depForm'], ['Autres achats pro', 'autresAchats']]],
];
const ouvertes = new Set();
function vueAnnuel() {
  const corps = h('tbody', {});
  const dessiner = () => {
    corps.replaceChildren();
    ETAPES.forEach(([titre, lignes, solde], i) => {
      const ouvert = ouvertes.has(i);
      corps.append(h('tr', { class: 'section' }, h('th', { colspan: 14 }, h('button', { 'aria-expanded': String(ouvert), onclick: () => { ouvert ? ouvertes.delete(i) : ouvertes.add(i); dessiner(); } }, ouvert ? '▾' : '▸', titre))));
      (ouvert ? lignes : lignes.slice(0, 1)).forEach(([nom, cle, type, cleForce], j) => {
        const val = (r) => (typeof cle === 'function' ? cle(r) : r[cle]);
        const total = solde ? val(etat.res[11]) : etat.res.reduce((t, r) => t + (val(r) ?? 0), 0);
        corps.append(h('tr', { class: j === 0 ? 'cle' : '' }, h('td', {}, nom),
          etat.res.map((r, m) => {
            const v = val(r); const force = cleForce && (etat.mois[m]?.forces || {})[cleForce] !== undefined;
            return h('td', { class: ['num', r.prevision ? 'prevision' : '', force ? 'est-force' : '', typeof v === 'number' && v < 0 ? 'negatif' : ''].join(' '), title: force ? 'Valeur forcée' : r.prevision ? 'Prévision' : null },
              type === 'jours' ? jours(v) : v === null ? '—' : eur(v));
          }),
          h('td', { class: 'num col-total' }, type === 'jours' ? jours(total) : eur(total))));
      });
    });
  };
  dessiner();
  return h('section', {},
    h('div', { class: 'entete' }, h('h1', {}, `Bilan annuel ${etat.annee}`),
      h('button', { class: 'btn', onclick: () => { ETAPES.forEach((_, i) => ouvertes.add(i)); dessiner(); } }, 'Tout déplier'),
      h('button', { class: 'btn', onclick: () => { ouvertes.clear(); dessiner(); } }, 'Tout replier'),
      h('button', { class: 'btn btn-principal', onclick: () => { ETAPES.forEach((_, i) => ouvertes.add(i)); dessiner(); setTimeout(() => print(), 50); } }, 'Imprimer / PDF')),
    h('p', { class: 'petit muted pas-imprimer' }, 'Clique sur une étape pour voir le détail. En italique : prévision. En orange : valeur forcée.'),
    h('div', { class: 'tableau-defile' }, h('table', {},
      h('caption', { class: 'sr' }, `Bilan annuel ${etat.annee} en 8 étapes`),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Mois'), MOIS_COURT.map((n) => h('th', { scope: 'col' }, n)), h('th', { scope: 'col', class: 'col-total' }, 'Total'))),
      corps)));
}

// ------------------------------------------------------------------ Paramètres
function vueParametres() {
  const P = structuredClone(etat.params);
  const sauver = () => { etat.params = structuredClone(P); recalculer(); D.sauverParams(etat.annee, etat.params); };
  const ligne12 = (nom, tableau, type, opts = {}) => h('tr', {}, h('th', { scope: 'row' }, nom),
    tableau.map((v, m) => h('td', {}, champ({ label: `${nom} — ${MOIS[m]}`, valeur: v, type, compact: true, vide: opts.vide ?? false, min: opts.min, max: opts.max, onChange: (x) => { tableau[m] = x; sauver(); } }))));
  const enteteMois = h('thead', {}, h('tr', {}, h('th', {}, ''), MOIS_COURT.map((n) => h('th', { scope: 'col' }, n))));

  // Charges fixes : une ligne par charge, montants mois par mois
  const corpsCharges = h('tbody', {});
  const dessinerCharges = () => corpsCharges.replaceChildren(
    ...P.chargesFixes.map((c, i) => h('tr', {},
      h('th', { scope: 'row' }, h('input', { class: 'entree texte', 'aria-label': `Nom de la charge ${i + 1}`, value: c.libelle, maxlength: 40, readonly: verrouillee(), oninput: (e) => { c.libelle = e.target.value.slice(0, 40); sauver(); } })),
      c.montants.map((v, m) => h('td', {}, champ({ label: `${c.libelle} — ${MOIS[m]}`, valeur: v, compact: true, vide: false, min: 0, onChange: (x) => { c.montants[m] = x; sauver(); } }))),
      h('td', {}, h('button', { class: 'btn', disabled: verrouillee(), 'aria-label': `Supprimer ${c.libelle}`, onclick: () => { if (confirm(`Supprimer la charge « ${c.libelle} » ?`)) { P.chargesFixes.splice(i, 1); sauver(); dessinerCharges(); } } }, '×')))),
    h('tr', {}, h('th', { scope: 'row' }, 'Total'), Array.from({ length: 12 }, (_, m) => h('td', { class: 'num col-total' }, eur(P.chargesFixes.reduce((t, c) => t + (c.montants[m] || 0), 0))))));
  dessinerCharges();

  const src = P.tauxSources || {};
  const source = (cle, nom) => h('div', { class: 'champs', style: 'margin-top:8px' },
    h('div', { class: 'champ' }, h('label', {}, `Source — ${nom}`, h('input', { class: 'entree texte', value: src[cle]?.texte || '', maxlength: 160, readonly: verrouillee(), oninput: (e) => { P.tauxSources = { ...P.tauxSources, [cle]: { ...(P.tauxSources?.[cle] || {}), texte: e.target.value.slice(0, 160) } }; sauver(); } }))),
    h('div', { class: 'champ' }, h('label', {}, 'Vérifié le', h('input', { class: 'entree texte', type: 'date', value: src[cle]?.verifie || '', readonly: verrouillee(), onchange: (e) => { P.tauxSources = { ...P.tauxSources, [cle]: { ...(P.tauxSources?.[cle] || {}), verifie: e.target.value } }; sauver(); } }))));
  const C = P.cibles; const F = P.fiscal; const SJ = P.simulateurJour; const SI = P.soldesInitiaux || (P.soldesInitiaux = {});

  return h('section', {},
    h('div', { class: 'entete' }, h('h1', {}, `Paramètres ${etat.annee}`),
      h('button', { class: 'btn', onclick: () => { P.verrouillee = !P.verrouillee; sauver(); afficher(false); } }, P.verrouillee ? 'Rouvrir l\'année' : 'Clôturer l\'année')),
    verrouillee() ? h('p', { class: 'bandeau info' }, 'Année clôturée : lecture seule. « Rouvrir l\'année » pour corriger.') : null,

    h('fieldset', {}, h('legend', {}, 'Charges fixes du cabinet (par mois)'),
      h('div', { class: 'tableau-defile grille-params' }, h('table', {}, enteteMois.cloneNode(true), corpsCharges)),
      h('div', { class: 'actions', style: 'justify-content:flex-start' }, h('button', { class: 'btn', disabled: verrouillee() || P.chargesFixes.length >= 40, onclick: () => { P.chargesFixes.push({ id: 'c' + Date.now(), libelle: 'Nouvelle charge', montants: Array(12).fill(0) }); sauver(); dessinerCharges(); } }, '+ Ajouter une charge'))),

    h('fieldset', {}, h('legend', {}, 'Cibles annuelles et soldes de départ'),
      h('div', { class: 'champs' },
        champ({ label: 'Cible supervision', valeur: C.supervision, min: 0, vide: false, onChange: (v) => { C.supervision = v; sauver(); } }),
        champ({ label: 'Cible formation', valeur: C.formation, min: 0, vide: false, onChange: (v) => { C.formation = v; sauver(); } }),
        champ({ label: 'Cible trésorerie précaution', valeur: C.tresorerie, min: 0, vide: false, onChange: (v) => { C.tresorerie = v; sauver(); } }),
        champ({ label: 'Cible tirelire salaire', valeur: C.tirelireSalaire, min: 0, vide: false, aide: 'Valeur du jour × jours de congé prévus', onChange: (v) => { C.tirelireSalaire = v; sauver(); } }),
        champ({ label: 'Cible tirelire charges', valeur: C.tirelireCharges, min: 0, vide: false, aide: 'Charges d\'un jour × jours de congé prévus', onChange: (v) => { C.tirelireCharges = v; sauver(); } }),
        champ({ label: 'Trésorerie initiale au 1er janvier', valeur: P.tresorerieInitiale, vide: false, onChange: (v) => { P.tresorerieInitiale = v; sauver(); } }),
        champ({ label: 'Report supervision', valeur: SI.supervision ?? 0, vide: false, onChange: (v) => { SI.supervision = v; sauver(); } }),
        champ({ label: 'Report formation', valeur: SI.formation ?? 0, vide: false, onChange: (v) => { SI.formation = v; sauver(); } }),
        champ({ label: 'Report tirelire charges', valeur: SI.tirelireCharges ?? 0, vide: false, onChange: (v) => { SI.tirelireCharges = v; sauver(); } }),
        champ({ label: 'Report tirelire salaire', valeur: SI.tirelireSalaire ?? 0, vide: false, onChange: (v) => { SI.tirelireSalaire = v; sauver(); } }),
        champ({ label: 'Urssaf + impôt restant à payer au 1er janvier', valeur: SI.aReverser ?? 0, vide: false, onChange: (v) => { SI.aReverser = v; sauver(); } }))),

    h('fieldset', {}, h('legend', {}, 'Taux mois par mois'),
      h('div', { class: 'tableau-defile grille-params' }, h('table', {}, enteteMois.cloneNode(true), h('tbody', {},
        ligne12('Urssaf + retraite + formation (%)', P.tauxUrssaf, 'pct', { min: 0, max: 10000 }),
        ligne12('Versement libératoire (%)', P.tauxLiberatoire, 'pct', { min: 0, max: 10000 }),
        ligne12('Prélèvement à la source (%)', P.tauxPas, 'pct', { min: 0, max: 10000 })))),
      source('tauxUrssaf', 'taux Urssaf'), source('tauxLiberatoire', 'libératoire')),

    h('fieldset', {}, h('legend', {}, 'Revenus et jours'),
      h('div', { class: 'tableau-defile grille-params' }, h('table', {}, enteteMois.cloneNode(true), h('tbody', {},
        ligne12('Salaire hospitalier (net payé)', P.autresSalaires, 'eur', { min: 0 }),
        ligne12('Valeur d\'un jour (vide = simulateur)', P.valeurJour, 'eur', { vide: true, min: 0 }),
        ligne12('Jours ouvrés moyens', P.joursOuvres, 'jours', { min: 1, max: 31 }),
        ligne12('CA prévu (vide = moyenne)', P.caPrevu || (P.caPrevu = Array(12).fill(null)), 'eur', { vide: true, min: 0 })))),
      h('div', { class: 'champs', style: 'margin-top:12px' },
        champ({ label: 'Salaire net visé', valeur: SJ.salaireVise, min: 0, vide: false, onChange: (v) => { SJ.salaireVise = v; sauver(); } }),
        champ({ label: 'Jours travaillés par mois', type: 'jours', valeur: SJ.joursTravailles, min: 1, max: 31, vide: false, onChange: (v) => { SJ.joursTravailles = v; sauver(); } }),
        champ({ label: 'Plancher de salaire', valeur: SJ.plancher, min: 0, aide: 'Proposition de retrait si le net est en dessous', onChange: (v) => { SJ.plancher = v; sauver(); } }),
        champ({ label: 'Plafond de salaire', valeur: SJ.plafondVise, min: 0, aide: 'Au-delà : proposition vers la tirelire salaire', onChange: (v) => { SJ.plafondVise = v; sauver(); } })),
      h('p', { class: 'petit muted' }, `Valeur d'un jour calculée : ${eur(valeurJourSimulee(SJ.salaireVise, SJ.joursTravailles))} (utilisée pour les mois laissés vides).`)),

    h('fieldset', {}, h('legend', {}, 'Plafonds, seuils et fiscalité du foyer'),
      h('div', { class: 'champs' },
        champ({ label: 'Plafond micro-BNC', valeur: P.plafondMicro, min: 0, vide: false, onChange: (v) => { P.plafondMicro = v; sauver(); } }),
        champ({ label: 'Alerte plafond à (%)', type: 'pct', valeur: P.seuilAlertePlafond, min: 0, max: 10000, vide: false, onChange: (v) => { P.seuilAlertePlafond = v; sauver(); } }),
        champ({ label: 'Alerte écart réel / théorique', valeur: P.seuilEcart, min: 0, vide: false, onChange: (v) => { P.seuilEcart = v; sauver(); } }),
        champ({ label: 'Seuil franchise TVA', valeur: F.seuilTva, min: 0, vide: false, onChange: (v) => { F.seuilTva = v; sauver(); } }),
        champ({ label: 'Seuil RFR libératoire (par part)', valeur: F.seuilRfrVlParPart, min: 0, vide: false, onChange: (v) => { F.seuilRfrVlParPart = v; sauver(); } }),
        champ({ label: 'Nombre de parts', type: 'jours', valeur: F.parts, min: 1, max: 10, vide: false, onChange: (v) => { F.parts = v; sauver(); } }),
        champ({ label: 'RFR de l\'avis N-2', valeur: F.rfrN2, min: 0, onChange: (v) => { F.rfrN2 = v; sauver(); } }),
        champ({ label: 'RFR de l\'avis N-1', valeur: F.rfrN1, min: 0, onChange: (v) => { F.rfrN1 = v; sauver(); } }),
        champ({ label: 'Réductions et crédits d\'impôt', valeur: F.reductions, min: 0, vide: false, onChange: (v) => { F.reductions = v; sauver(); } }),
        champ({ label: 'Frais réels estimés (simulateur)', valeur: F.fraisReels, min: 0, vide: false, onChange: (v) => { F.fraisReels = v; sauver(); } })),
      source('plafondMicro', 'plafond micro-BNC'), source('seuilRfrVl', 'seuil RFR'), source('bareme', 'barème')),

    h('fieldset', {}, h('legend', {}, 'Catégories d\'achats et affichage'),
      h('div', { class: 'champs' },
        h('div', { class: 'champ' }, h('label', { for: 'cats' }, 'Catégories (séparées par des virgules)'),
          h('input', { id: 'cats', class: 'entree texte', value: (P.categoriesAchats || []).join(', '), readonly: verrouillee(), onchange: (e) => { P.categoriesAchats = e.target.value.split(',').map((x) => x.trim().slice(0, 30)).filter(Boolean).slice(0, 30); sauver(); } })),
        h('div', { class: 'champ' }, h('label', { for: 'accueil' }, 'Écran d\'accueil'),
          h('select', { id: 'accueil', class: 'select', onchange: (e) => { etat.reglages.accueil = e.target.value; D.sauverReglages(etat.reglages); } },
            [['tableau', 'Tableau de bord'], ['saisie', 'Saisie du mois'], ['annuel', 'Vue annuelle']].map(([v, n]) => h('option', { value: v, selected: etat.reglages.accueil === v }, n)))),
        h('div', { class: 'champ' }, h('label', { for: 'theme' }, 'Thème'),
          h('select', { id: 'theme', class: 'select', onchange: (e) => { etat.reglages.theme = e.target.value; appliquerTheme(); D.sauverReglages(etat.reglages); } },
            [['clair', 'Clair'], ['sombre', 'Sombre'], ['auto', 'Comme le système']].map(([v, n]) => h('option', { value: v, selected: etat.reglages.theme === v }, n)))))));
}

// ------------------------------------------------------------------ Simulateurs
/** Salaire annuel net IMPOSABLE (bulletin) s'il est saisi, sinon somme des nets payés (estimation basse). */
function salairesImposables() {
  const v = etat.params.fiscal?.salaireImposable;
  return Number.isInteger(v) ? v : etat.res.reduce((t, x) => t + x.autresSalaires, 0);
}
function vueSimulateurs() {
  const P = etat.params; const F = P.fiscal;
  const ca = etat.res.reduce((t, r) => t + r.ca, 0);
  const sal = salairesImposables();
  const cot = etat.res.reduce((t, r) => t + r.cotisations, 0);
  const fisc = simulateurFiscal({ caAnnuel: ca, salairesAnnuels: sal, parts: F.parts || 1, f: F });
  const mvr = microVsReel({ caAnnuel: ca, fraisReels: F.fraisReels || 0, cotisations: cot, f: F });
  const L = (n, v, cls = '') => h('li', { class: cls }, h('span', {}, n), h('span', { class: 'num ' + signe(v) }, eur(v)));
  return h('section', {}, h('div', { class: 'entete' }, h('h1', {}, `Simulateurs ${etat.annee}`)),
    h('p', { class: 'petit muted' }, 'Calculs annualisés : mois saisis + prévision des mois restants. Indicatifs, ne remplacent pas un conseil fiscal.'),
    h('div', { class: 'grille g2' },
      h('article', { class: 'carte' }, h('h2', {}, 'Impôt sur le revenu (versement libératoire)'),
        h('ul', { class: 'lignes' },
          L('CA annuel projeté', ca), L('Bénéfice micro (après abattement 34 %)', fisc.beneficeMicro),
          L('Salaires imposables (après 10 %)', fisc.salairesNets), L('Impôt au barème sur les salaires', Math.max(0, fisc.impotSalaires - (F.reductions || 0)), 'total'),
          L('Revenu fiscal de référence estimé', fisc.rfr), L(`Seuil libératoire (${F.parts || 1} part)`, fisc.seuilVL)),
        champ({ label: 'Salaire hospitalier annuel net imposable', valeur: F.salaireImposable ?? null, min: 0,
          aide: 'Cumul « net imposable » du bulletin de décembre. Vide = somme des nets payés (impôt un peu sous-estimé).',
          onChange: (v) => { F.salaireImposable = v; D.sauverParams(etat.annee, etat.params); recalculer(); } }),
        h('p', { class: fisc.vlPossibleDansDeuxAns ? 'pastille ok' : 'bandeau', style: 'margin-top:10px' },
          fisc.vlPossibleDansDeuxAns ? `Libératoire toujours accessible en ${etat.annee + 2}` : `Libératoire perdu en ${etat.annee + 2} : RFR au-dessus du seuil.`),
        h('p', { class: 'petit muted' }, `Pour comparer, sans libératoire (tout au barème) : ${eur(fisc.impotSansVL)} d'impôt, contre ${eur(etat.res.reduce((t, r) => t + r.liberatoire, 0))} de libératoire + ${eur(fisc.impotSalaires)} sur les salaires.`)),
      h('article', { class: 'carte' }, h('h2', {}, 'Micro-BNC ou régime réel ?'),
        h('ul', { class: 'lignes' }, L('Base imposable en micro', mvr.baseMicro), L('Frais réels estimés', F.fraisReels || 0), L('Cotisations de l\'année', cot), L('Base imposable au réel', mvr.baseReel),
          L('Différence de base', mvr.avantageReel, 'total')),
        h('p', { class: 'petit muted' }, mvr.avantageReel > 0 ? 'Le réel réduirait la base imposable. À valider avec un expert-comptable (2035, cotisations Cipav différentes).' : 'L\'abattement de 34 % reste plus favorable avec ces frais.')),
      h('article', { class: 'carte' }, h('h2', {}, 'Valeur d\'un jour de travail'),
        h('ul', { class: 'lignes' }, L('Salaire net visé', P.simulateurJour.salaireVise), h('li', {}, h('span', {}, 'Jours travaillés / mois'), h('span', { class: 'num' }, jours(P.simulateurJour.joursTravailles))),
          L('Valeur d\'un jour', valeurJourSimulee(P.simulateurJour.salaireVise, P.simulateurJour.joursTravailles), 'total')),
        h('p', { class: 'petit muted' }, 'Modifiable dans Paramètres. Utilisée automatiquement pour la pioche salaire des mois sans valeur saisie.'),
        h('p', { class: 'petit muted' }, `CA moyen par jour travaillé (mois saisis) : ${eur(caParJour())}.`))));
}
function caParJour() {
  const R = etat.res.filter((r) => r.saisi);
  const j = R.reduce((t, r) => t + Math.max(0, (etat.params.joursOuvres[r.mois] || 20) - r.abs), 0);
  return j ? Math.round(R.reduce((t, r) => t + r.ca, 0) / j) : 0;
}

// ------------------------------------------------------------------ Sauvegarde / import
function telecharger(objet, nom) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(objet, null, 2)], { type: 'application/json' }));
  const a = h('a', { href: url, download: nom }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const horodatage = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
function vueSauvegarde() {
  const apercu = h('div', { 'aria-live': 'polite' });
  const fichier = h('input', { type: 'file', accept: 'application/json,.json', id: 'fichier-import', onchange: async (e) => {
    const f = e.target.files?.[0]; apercu.replaceChildren(); if (!f) return;
    if (f.size > 5_000_000) { apercu.append(h('p', { class: 'bandeau' }, 'Fichier trop gros.')); return; }
    let json; try { json = JSON.parse(await f.text()); } catch { apercu.append(h('p', { class: 'bandeau' }, 'Fichier illisible (JSON invalide).')); return; }
    const v = D.verifierImport(json);
    if (!v.ok) { apercu.append(h('p', { class: 'bandeau' }, 'Import impossible : ', v.erreurs.join(' '))); return; }
    apercu.append(h('h3', {}, 'Aperçu'),
      h('ul', { class: 'lignes' }, v.resume.map((x) => h('li', {}, h('span', {}, `Année ${x.annee}${etat.annees.includes(Number(x.annee)) ? ' (sera remplacée)' : ''}`), h('span', { class: 'num' }, `${x.saisis} mois · CA ${eur(x.ca)}`)))),
      h('div', { class: 'actions', style: 'justify-content:flex-start' },
        h('button', { class: 'btn btn-principal', onclick: async (ev) => {
          if (!confirm('Remplacer les années listées par le contenu du fichier ? Une sauvegarde de l\'état actuel va d\'abord être téléchargée.')) return;
          ev.target.disabled = true;
          try { telecharger(await D.exporterTout(), `compta-lisa-avant-import-${horodatage()}.json`); }
          catch { notifier('Sauvegarde préalable impossible (connexion ?) : import annulé.'); ev.target.disabled = false; return; }
          try { await D.importer(json); notifier('Import terminé.'); etat.annees = await D.listerAnnees(); remplirAnnees(); ouvrirAnnee(etat.annee); }
          catch { notifier('Import interrompu : certaines valeurs ont été refusées.'); ev.target.disabled = false; }
        } }, 'Confirmer l\'import')));
  } });
  return h('section', {}, h('div', { class: 'entete' }, h('h1', {}, 'Sauvegarde')),
    h('div', { class: 'grille g2' },
      h('article', { class: 'carte' }, h('h2', {}, 'Exporter'),
        h('p', {}, 'Télécharge toutes les années dans un fichier JSON. Une copie est aussi envoyée chaque dimanche par e-mail.'),
        h('button', { class: 'btn btn-principal', onclick: async () => telecharger(await D.exporterTout(), `compta-lisa-${horodatage()}.json`) }, 'Télécharger la sauvegarde')),
      h('article', { class: 'carte' }, h('h2', {}, 'Importer'),
        h('p', {}, 'Recharge une sauvegarde. Tu verras un aperçu avant de confirmer.'),
        h('label', { for: 'fichier-import', class: 'petit' }, 'Fichier de sauvegarde (.json)'), h('div', {}, fichier), apercu),
      h('article', { class: 'carte' }, h('h2', {}, 'Nouvelle année'),
        h('p', {}, `Crée ${etat.annee + 1} en reprenant les paramètres de ${etat.annee} et les soldes de fin décembre.`),
        h('button', { class: 'btn', disabled: !etat.params || etat.annees.includes(etat.annee + 1), onclick: async () => { const a = etat.annee; etat.annee = a + 1; await creerAnneeDepuis(a); ouvrirAnnee(a + 1); } },
          etat.annees.includes(etat.annee + 1) ? `${etat.annee + 1} existe déjà` : `Créer ${etat.annee + 1}`))),
    h('p', { class: 'confidentialite', style: 'margin-top:16px' }, MSG_CONFIDENTIALITE));
}

// ------------------------------------------------------------------ PWA (hors ligne de l'interface)
if ('serviceWorker' in navigator && !D.MODE_DEMO) navigator.serviceWorker.register('./sw.js').catch(() => {});
demarrer();
