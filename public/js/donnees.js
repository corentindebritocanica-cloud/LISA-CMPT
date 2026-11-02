// donnees.js — Accès aux données (Firebase Auth + Firestore) et mode démo local.
// Aucune donnée financière n'est écrite dans la console.
import { CONFIG } from './config.js';
import { SCHEMA, anneeVierge } from './defauts.js';

const V = '../vendor/firebase-13.1.0/'; // relatif à js/
const statutListeners = new Set();
let statut = 'enregistre'; // enregistre | enCours | horsLigne | erreur
function setStatut(s) { statut = s; statutListeners.forEach((f) => f(s)); }
export const surStatut = (f) => { statutListeners.add(f); f(statut); };
window.addEventListener('online', () => setStatut(statut === 'horsLigne' ? 'enCours' : statut));
window.addEventListener('offline', () => setStatut('horsLigne'));

/** Mode démo : uniquement en local (localhost) avec ?demo, données fictives en mémoire. */
export const MODE_DEMO = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('demo');

let fb = null; // modules Firebase chargés
let db = null, auth = null, cabinet = null;

export async function initialiser() {
  if (MODE_DEMO) return;
  const [app, a, fs] = await Promise.all([import(V + 'firebase-app.js'), import(V + 'firebase-auth.js'), import(V + 'firebase-firestore.js')]);
  fb = { ...app, ...a, ...fs };
  const appli = fb.initializeApp(CONFIG.firebase);
  // Session gardée sur l'appareil jusqu'à déconnexion manuelle
  auth = fb.initializeAuth(appli, { persistence: [fb.indexedDBLocalPersistence, fb.browserLocalPersistence] });
  // Cache local persistant + gestion de plusieurs onglets ouverts
  db = fb.initializeFirestore(appli, { localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) });
}

// ------------------------------------------------------------------ Auth
export function surConnexion(cb) {
  if (MODE_DEMO) { cabinet = 'demo'; cb({ email: 'demo@exemple.fr', emailVerified: true }); return; }
  fb.onAuthStateChanged(auth, async (u) => {
    cabinet = null;
    if (u && u.emailVerified) {
      try {
        const acc = await fb.getDoc(fb.doc(db, 'acces', u.uid));
        cabinet = acc.exists() ? acc.data().cabinet : null;
      } catch { cabinet = null; }
    }
    cb(u ? { email: u.email, emailVerified: u.emailVerified, autorise: !!cabinet } : null);
  });
}
export const connexion = (email, mdp) => fb.signInWithEmailAndPassword(auth, email, mdp);
export const deconnexion = () => (MODE_DEMO ? location.reload() : fb.signOut(auth));
export const motDePasseOublie = (email) => fb.sendPasswordResetEmail(auth, email);
export const renvoyerVerification = () => fb.sendEmailVerification(auth.currentUser);

// ------------------------------------------------------------------ Lecture
const mem = { annees: {}, mois: {}, reglages: { accueil: 'tableau', theme: 'clair' } };
const cheminAnnee = (a) => ['cabinet', cabinet, 'annees', String(a)];
const id2 = (m) => String(m + 1).padStart(2, '0');

export async function listerAnnees() {
  if (MODE_DEMO) return Object.keys(mem.annees).map(Number).sort();
  const snap = await fb.getDocs(fb.collection(db, 'cabinet', cabinet, 'annees'));
  return snap.docs.map((d) => Number(d.id)).sort();
}

/** Écoute une année (paramètres + 12 mois) ; cb({ params, mois }) à chaque changement, y compris d'un autre onglet. */
export function ecouterAnnee(annee, cb) {
  if (MODE_DEMO) {
    const envoyer = () => cb({ params: mem.annees[annee] || null, mois: Array.from({ length: 12 }, (_, m) => mem.mois[annee + id2(m)] || null) });
    envoyer();
    mem.ecoute = envoyer;
    return () => { mem.ecoute = null; };
  }
  let params = null; const mois = Array(12).fill(null);
  const emettre = () => cb({ params, mois: [...mois] });
  const u1 = fb.onSnapshot(fb.doc(db, ...cheminAnnee(annee)), (d) => { params = d.exists() ? nettoyer(d.data()) : null; emettre(); }, erreurLecture);
  const u2 = fb.onSnapshot(fb.collection(db, ...cheminAnnee(annee), 'mois'), (s) => {
    s.forEach((d) => { mois[Number(d.id) - 1] = nettoyer(d.data()); });
    emettre();
  }, erreurLecture);
  return () => { u1(); u2(); };
}
function erreurLecture() { setStatut('erreur'); }
function nettoyer(d) { const { updatedAt, ...r } = d; return r; }

export async function lireReglages() {
  if (MODE_DEMO) return mem.reglages;
  const d = await fb.getDoc(fb.doc(db, 'cabinet', cabinet, 'reglages', 'interface'));
  return d.exists() ? nettoyer(d.data()) : { accueil: 'tableau', theme: 'clair' };
}

// ------------------------------------------------------------------ Écriture (enregistrement automatique)
const attente = new Map();
function planifier(cle, fn, delai = 600) {
  clearTimeout(attente.get(cle));
  setStatut(navigator.onLine ? 'enCours' : 'horsLigne');
  attente.set(cle, setTimeout(async () => {
    attente.delete(cle);
    try {
      await fn();
      if (!attente.size) setStatut(navigator.onLine ? 'enregistre' : 'horsLigne');
    } catch (e) {
      setStatut('erreur');
      erreurEcriture(e?.code || 'inconnue');
    }
  }, delai));
}
let erreurEcriture = () => {};
export const surErreurEcriture = (f) => { erreurEcriture = f; };

function ecrire(chemin, donnees) {
  if (MODE_DEMO) return Promise.resolve();
  // Écriture du document complet : les règles vérifient la liste des champs autorisés.
  // Hors ligne, la promesse attend le retour du réseau : le cache local garde la saisie.
  return fb.setDoc(fb.doc(db, ...chemin), { ...donnees, schemaVersion: SCHEMA, updatedAt: fb.serverTimestamp() });
}

export function sauverMois(annee, m, donnees) {
  if (MODE_DEMO) { mem.mois[annee + id2(m)] = donnees; mem.ecoute?.(); }
  planifier('m' + annee + m, () => ecrire([...cheminAnnee(annee), 'mois', id2(m)], donnees));
}
export function sauverParams(annee, params) {
  if (MODE_DEMO) { mem.annees[annee] = params; mem.ecoute?.(); }
  planifier('p' + annee, () => ecrire(cheminAnnee(annee), params), 900);
}
export function sauverReglages(r) {
  if (MODE_DEMO) { mem.reglages = r; return; }
  planifier('r', () => ecrire(['cabinet', cabinet, 'reglages', 'interface'], r));
}

/** Création immédiate d'une année (nouvelle année ou import). */
export async function creerAnnee(annee, params) {
  if (MODE_DEMO) { mem.annees[annee] = params; return; }
  await ecrire(cheminAnnee(annee), params);
}

// ------------------------------------------------------------------ Sauvegarde / import JSON
export async function exporterTout() {
  const annees = await listerAnnees();
  const out = { application: 'compta-lisa', schemaVersion: SCHEMA, exporteLe: new Date().toISOString(), annees: {} };
  for (const a of annees) {
    const { params, mois } = await lireUneFois(a);
    out.annees[a] = { params, mois };
  }
  return out;
}
function lireUneFois(a) {
  return new Promise((res) => {
    let n = 0; let stop = () => {};
    stop = ecouterAnnee(a, (v) => { if (++n >= (MODE_DEMO ? 1 : 2)) { setTimeout(() => stop()); res(v); } });
  });
}

/** Import : écrit les années du fichier (après aperçu et confirmation dans l'interface). */
export async function importer(json) {
  for (const [a, { params, mois }] of Object.entries(json.annees)) {
    await creerAnnee(Number(a), params);
    for (let m = 0; m < 12; m++) if (mois[m]) {
      if (MODE_DEMO) mem.mois[a + id2(m)] = mois[m];
      else await ecrire([...cheminAnnee(a), 'mois', id2(m)], mois[m]);
    }
  }
  mem.ecoute?.();
}

/** Contrôle d'un fichier importé : version, structure, types. Renvoie { ok, erreurs, resume }. */
export function verifierImport(json) {
  const erreurs = [];
  if (json?.application !== 'compta-lisa') erreurs.push('Ce fichier ne vient pas de Compta Lisa.');
  if (!Number.isInteger(json?.schemaVersion) || json.schemaVersion > SCHEMA) erreurs.push('Version du fichier non prise en charge.');
  const resume = [];
  for (const [a, v] of Object.entries(json?.annees || {})) {
    if (!/^20[2-9]\d$/.test(a)) { erreurs.push(`Année invalide : ${a}`); continue; }
    if (!v?.params || !Array.isArray(v.mois) || v.mois.length !== 12) { erreurs.push(`Année ${a} incomplète.`); continue; }
    const saisis = v.mois.filter((m) => m && Number.isInteger(m.ca)).length;
    const ca = v.mois.reduce((t, m) => t + (Number.isInteger(m?.ca) ? m.ca : 0), 0);
    resume.push({ annee: a, saisis, ca });
  }
  return { ok: erreurs.length === 0 && resume.length > 0, erreurs, resume };
}

export const nouvelleAnneeVierge = anneeVierge;

// ------------------------------------------------------------------ Données fictives du mode démo
export function chargerDemo(annee) {
  const p = anneeVierge();
  p.tresorerieInitiale = 400000;
  p.chargesFixes[0].montants = Array(12).fill(60000);
  p.chargesFixes[3].montants = Array(12).fill(5000);
  p.chargesFixes[7].montants = Array(12).fill(5000);
  mem.annees[annee] = p;
  const ca = [380000, 420000, 450000, 470000, 400000, 500000, 460000, 150000, 430000, 470000];
  ca.forEach((c, m) => {
    mem.mois[annee + id2(m)] = { ca: c, nbSeances: Math.round(c / 6500), joursConge: m === 7 ? 10 : 0, joursFormation: m === 3 ? 2 : 0,
      retraitForce: m < 9 ? 230000 : null, epargne: 0, depSupervision: m % 3 === 0 ? 8000 : 0, depFormation: m === 0 ? 30000 : 0,
      autresAchats: m === 1 ? [{ categorie: 'Livres', montant: 4500 }] : [], soldeReel: m === 8 ? 790000 : null,
      paiementUrssaf: 0, paiementImpot: 0, declareUrssaf: m < 9 };
  });
}
