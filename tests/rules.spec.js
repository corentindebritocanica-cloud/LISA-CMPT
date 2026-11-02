// Tests des règles Firestore sur l'émulateur.
// Lancer : npm run test:rules  (démarre l'émulateur puis exécute ce fichier)
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

let env;
const CAB = 'lisa';
const annee = () => ({
  schemaVersion: 1, updatedAt: serverTimestamp(), verrouillee: false,
  cibles: { supervision: 80000, formation: 80000, tresorerie: 120000, tirelireSalaire: 400000, tirelireCharges: 190000 },
  tresorerieInitiale: 300000, tauxUrssaf: Array(12).fill(2340), tauxLiberatoire: Array(12).fill(220),
  tauxPas: Array(12).fill(0), joursOuvres: Array(12).fill(20),
});
const mois = (o = {}) => ({ schemaVersion: 1, updatedAt: serverTimestamp(), ca: 500000, joursConge: 0.5, ...o });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lisa',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'acces/uidLisa'), { cabinet: CAB });
    await setDoc(doc(db, 'acces/uidCorentin'), { cabinet: CAB });
    await setDoc(doc(db, 'acces/uidAutre'), { cabinet: 'autre' });
    await setDoc(doc(db, 'cabinet/lisa/annees/2026'), { ...annee(), updatedAt: new Date() });
  });
});

const lisa = () => env.authenticatedContext('uidLisa', { email_verified: true }).firestore();
const corentin = () => env.authenticatedContext('uidCorentin', { email_verified: true }).firestore();

// ---------- Cas AUTORISÉS ----------
test('Lisa lit et écrit un mois', async () => {
  await assertSucceeds(setDoc(doc(lisa(), 'cabinet/lisa/annees/2026/mois/01'), mois()));
  await assertSucceeds(getDoc(doc(lisa(), 'cabinet/lisa/annees/2026/mois/01')));
});
test('Corentin (liste blanche) accède aux mêmes données', async () => {
  await assertSucceeds(getDoc(doc(corentin(), 'cabinet/lisa/annees/2026')));
});
test('Création d\'une nouvelle année valide', async () => {
  await assertSucceeds(setDoc(doc(lisa(), 'cabinet/lisa/annees/2027'), annee()));
});
test('Réglages d\'interface valides', async () => {
  await assertSucceeds(setDoc(doc(lisa(), 'cabinet/lisa/reglages/interface'), { schemaVersion: 1, updatedAt: serverTimestamp(), accueil: 'saisie' }));
});
test('Lecture de sa propre fiche d\'accès', async () => {
  await assertSucceeds(getDoc(doc(lisa(), 'acces/uidLisa')));
});

test('Listes des années et des mois (utilisées au démarrage de l\'app)', async () => {
  await assertSucceeds(getDocs(collection(lisa(), 'cabinet/lisa/annees')));
  await assertSucceeds(getDocs(collection(lisa(), 'cabinet/lisa/annees/2026/mois')));
});

// ---------- Cas REFUSÉS ----------
test('Liste d\'un autre cabinet ou de la liste blanche : refusée', async () => {
  const db = env.authenticatedContext('uidAutre', { email_verified: true }).firestore();
  await assertFails(getDocs(collection(db, 'cabinet/lisa/annees')));
  await assertFails(getDocs(collection(lisa(), 'acces')));
});
test('Non connecté : refusé', async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'cabinet/lisa/annees/2026')));
});
test('E-mail non vérifié : refusé', async () => {
  const db = env.authenticatedContext('uidLisa', { email_verified: false }).firestore();
  await assertFails(getDoc(doc(db, 'cabinet/lisa/annees/2026')));
});
test('Compte inscrit hors liste blanche : refusé', async () => {
  const db = env.authenticatedContext('intrus', { email_verified: true }).firestore();
  await assertFails(getDoc(doc(db, 'cabinet/lisa/annees/2026')));
});
test('Compte d\'un autre cabinet : refusé', async () => {
  const db = env.authenticatedContext('uidAutre', { email_verified: true }).firestore();
  await assertFails(getDoc(doc(db, 'cabinet/lisa/annees/2026')));
});
test('L\'app ne peut pas modifier la liste blanche', async () => {
  await assertFails(setDoc(doc(lisa(), 'acces/intrus'), { cabinet: CAB }));
  await assertFails(getDoc(doc(lisa(), 'acces/uidCorentin')));
});
test('Champ inconnu (hasOnly) : refusé', async () => {
  await assertFails(setDoc(doc(lisa(), 'cabinet/lisa/annees/2026/mois/02'), mois({ nomPatient: 'X' })));
});
test('Montant décimal (pas en centimes) : refusé', async () => {
  await assertFails(setDoc(doc(lisa(), 'cabinet/lisa/annees/2026/mois/02'), mois({ ca: 5000.5 })));
});
test('Jours hors bornes : refusé', async () => {
  await assertFails(setDoc(doc(lisa(), 'cabinet/lisa/annees/2026/mois/02'), mois({ joursConge: 40 })));
});
test('Mois invalide : refusé', async () => {
  await assertFails(setDoc(doc(lisa(), 'cabinet/lisa/annees/2026/mois/13'), mois()));
});
test('updatedAt falsifié : refusé', async () => {
  await assertFails(setDoc(doc(lisa(), 'cabinet/lisa/annees/2026/mois/02'), { ...mois(), updatedAt: new Date(2000, 0, 1) }));
});
test('Suppression : toujours refusée', async () => {
  await assertFails(deleteDoc(doc(lisa(), 'cabinet/lisa/annees/2026')));
});
test('Année clôturée : saisie refusée, déverrouillage permis', async () => {
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'cabinet/lisa/annees/2026'), { verrouillee: true }));
  await assertFails(setDoc(doc(lisa(), 'cabinet/lisa/annees/2026/mois/03'), mois()));
  await assertFails(updateDoc(doc(lisa(), 'cabinet/lisa/annees/2026'), { tresorerieInitiale: 1, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(lisa(), 'cabinet/lisa/annees/2026'), { verrouillee: false, updatedAt: serverTimestamp() }));
});
test('Mois déclaré à l\'Urssaf : CA figé', async () => {
  const ref = doc(lisa(), 'cabinet/lisa/annees/2026/mois/04');
  await assertSucceeds(setDoc(ref, mois({ declareUrssaf: true })));
  await assertFails(updateDoc(ref, { ca: 1, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { soldeReel: 700000, updatedAt: serverTimestamp() }));
});
test('Chemin hors arborescence : refusé', async () => {
  await assertFails(setDoc(doc(lisa(), 'divers/x'), { a: 1 }));
});
