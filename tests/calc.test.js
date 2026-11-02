// Tests du module de calcul — VALEURS FICTIVES (le dépôt est public).
// Les tests avec les valeurs réelles du classeur sont dans tests/calc.reel.test.js,
// fichier local exclu du dépôt (.gitignore).
// Attendus calculés à la main à partir des formules du classeur (tolérance 0,01 €).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculerAnnee, completerPrevision, provisionsAvecRattrapage, suiviPlafond, impotBareme, simulateurFiscal, valeurJourSimulee } from '../public/js/calc.js';

const c = (e) => Math.round(e * 100);
const proche = (obtenu, attendu, msg) => assert.ok(Math.abs(obtenu - c(attendu)) <= 1, `${msg} : obtenu ${obtenu / 100}, attendu ${attendu}`);
const params = {
  cibles: { supervision: c(800), formation: c(800), tresorerie: c(1200), tirelireSalaire: c(4000), tirelireCharges: c(1900) },
  tresorerieInitiale: c(3000), chargesFixesTotal: Array(12).fill(c(1000)),
  tauxUrssaf: Array(12).fill(2340), tauxLiberatoire: Array(12).fill(220), tauxPas: Array(12).fill(0),
  autresSalaires: Array(12).fill(c(200)), valeurJour: Array(12).fill(c(150)), joursOuvres: Array(12).fill(20),
  simulateurJour: { salaireVise: c(2300), joursTravailles: 16 },
};
const R = calculerAnnee(params, [{ ca: c(5000), retraitForce: c(1900), depFormation: c(300) }, { ca: c(2000), joursConge: 10 }]);

test('Mois sans absence (type janvier)', () => {
  const j = R[0];
  proche(j.cotisations, 1170, 'cotisations 23,4 %'); proche(j.liberatoire, 110, 'libératoire 2,2 %');
  proche(j.provSupervision, 66.67, 'provision 800/12'); proche(j.provTresorerie, 100, 'provision 1200/12');
  proche(j.tirCharges, 158.33, 'tirelire charges'); proche(j.tirSalaire, 333.33, 'tirelire salaire');
  proche(j.baseNette, 1995, 'base nette'); proche(j.resteAVivre, 2100, 'retrait forcé + autres salaires');
  proche(j.soldes.tresorerie, 3195, 'trésorerie = initiale + provision + (net − retrait)');
  proche(j.soldes.formation, -233.33, 'formation négative');
  assert.ok(j.alertes.includes('negatif:formation'));
});

test('Mois avec 10 jours de congé (type août)', () => {
  const a = R[1];
  proche(a.piocheCharges, 500, 'pioche charges = 10 × 1000 / 20'); proche(a.piocheSalaire, 1500, 'pioche salaire = 10 × 150');
  proche(a.chargesPayees, 500, 'charges payées'); proche(a.tirCharges, 79.17, 'tirelire charges au prorata');
  proche(a.tirSalaire, 166.67, 'tirelire salaire au prorata'); proche(a.baseNette, 2008.82, 'base nette');
  proche(a.soldes.tirelireSalaire, 333.33 + 166.67 - 1500, 'tirelire salaire après pioche');
});

test('Rattrapage : la cible est atteinte malgré un mois forcé à 0', () => {
  const v = provisionsAvecRattrapage(c(800), [null, null, null, null, 0]);
  assert.equal(v.reduce((a, b) => a + b, 0), c(800));
});

test('Prévisionnel : moyenne des mois saisis et cible atteinte', () => {
  const m = completerPrevision({ caPrevu: Array(12).fill(null) }, [{ ca: c(4000) }, { ca: c(6000) }]);
  assert.equal(m[5].ca, c(5000)); assert.equal(m[5].prevision, true);
  assert.equal(calculerAnnee(params, m).reduce((t, x) => t + x.provSupervision, 0), c(800));
});

test('Report des soldes de l\'année précédente', () => {
  const r = calculerAnnee({ ...params, soldesInitiaux: { supervision: c(50), formation: c(-20) } }, [{ ca: 0 }]);
  proche(r[0].soldes.supervision, 116.67, 'supervision'); proche(r[0].soldes.formation, 46.67, 'formation');
});

test('Urssaf + impôt à reverser et écart réel', () => {
  const r = calculerAnnee(params, [{ ca: c(5000), soldeReel: c(9999) }, { ca: c(2000), paiementUrssaf: c(1170), paiementImpot: c(110) }]);
  proche(r[0].aReverser, 1280, 'dû du mois'); proche(r[1].aReverser, 512, 'après paiement');
  assert.equal(r[0].ecartReel, c(9999) - r[0].theoriqueCompte);
  assert.ok(r[0].alertes.includes('ecartReel'));
});

test('Simulateur valeur du jour : 2 300 / 16 = 143,75', () => assert.equal(valeurJourSimulee(c(2300), 16), c(143.75)));

test('Plafond : cumul, projection et alerte à 85 %', () => {
  const p = suiviPlafond(calculerAnnee(params, Array(6).fill({ ca: c(6000) })), c(83600));
  assert.equal(p.cumul, c(36000)); assert.equal(p.projection, c(72000)); assert.equal(p.alerte, true);
});

test('Barème progressif : 20 000 € pour 1 part', () => {
  const b = [{ de: 0, taux: 0 }, { de: c(11600), taux: 1100 }, { de: c(29579), taux: 3000 }];
  assert.equal(impotBareme(c(20000), 1, b), c(924));
});

test('Garde-fou RFR : 60 000 € de CA => libératoire perdu dans 2 ans', () => {
  const f = { abattementMicro: 3400, abattementMin: c(305), deductionSalaires: 1000, deductionMin: c(504), seuilRfrVlParPart: c(29579), bareme: [{ de: 0, taux: 0 }] };
  const r = simulateurFiscal({ caAnnuel: c(60000), salairesAnnuels: 0, parts: 1, f });
  assert.equal(r.beneficeMicro, c(39600)); assert.equal(r.vlPossibleDansDeuxAns, false);
});
