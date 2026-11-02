// sauvegarde.mjs — Sauvegarde hebdomadaire : exporte Firestore en JSON et l'envoie par e-mail.
// Exécuté par GitHub Actions (dépôt PUBLIC : les journaux sont publics, donc AUCUNE donnée
// n'est jamais affichée ; seuls des compteurs sont écrits).
// Secrets requis : FIREBASE_SERVICE_ACCOUNT, GMAIL_USER, GMAIL_APP_PASSWORD, SAUVEGARDE_DEST.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

const { FIREBASE_SERVICE_ACCOUNT, GMAIL_USER, GMAIL_APP_PASSWORD, SAUVEGARDE_DEST } = process.env;
if (!FIREBASE_SERVICE_ACCOUNT || !GMAIL_USER || !GMAIL_APP_PASSWORD || !SAUVEGARDE_DEST) {
  console.log('Secrets de sauvegarde incomplets : envoi ignoré.');
  process.exit(0);
}
initializeApp({ credential: cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const propre = (d) => { const { updatedAt, ...r } = d; return r; };

const out = { application: 'compta-lisa', schemaVersion: 1, exporteLe: new Date().toISOString(), cabinets: {} };
let nb = 0;
for (const cab of await db.collection('cabinet').listDocuments()) {
  const annees = {};
  for (const a of (await cab.collection('annees').get()).docs) {
    const mois = Array(12).fill(null);
    (await a.ref.collection('mois').get()).forEach((m) => { mois[Number(m.id) - 1] = propre(m.data()); nb++; });
    annees[a.id] = { params: propre(a.data()), mois };
  }
  out.cabinets[cab.id] = annees;
}
const date = out.exporteLe.slice(0, 10);
const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });
await transport.sendMail({
  from: `Compta Lisa <${GMAIL_USER}>`, to: SAUVEGARDE_DEST,
  subject: `Sauvegarde Compta Lisa du ${date}`,
  text: 'Sauvegarde hebdomadaire en pièce jointe. Pour restaurer un cabinet : Sauvegarde > Importer, avec le bloc du cabinet (voir README).',
  attachments: [{ filename: `compta-lisa-${date}.json`, content: JSON.stringify(out, null, 2), contentType: 'application/json' }],
});
console.log(`Sauvegarde envoyée (${nb} mois exportés).`);
