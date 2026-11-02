// =====================================================================
// calc.js — Module de calcul PUR (aucun accès réseau, DOM ou Firestore)
// Toutes les sommes sont en CENTIMES entiers. Les taux sont en centièmes
// de pourcent (23,40 % => 2340). Les jours sont des nombres (0,5 autorisé).
// Reprend à l'identique la logique du classeur "Compta Lisa V3.2",
// avec rattrapage automatique sur tous les mois et valeurs forcées possibles.
// =====================================================================

/** Arrondi au centime, demi vers l'extérieur (comme ROUND d'Excel). */
export function arrondi(x) {
  return Math.sign(x) * Math.round(Math.abs(x) + 1e-9);
}

/** Montant (centimes) x taux (centièmes de %) => centimes arrondis. */
export function appliquerTaux(montant, taux) {
  return arrondi((montant * taux) / 10000);
}

const vide = (v) => v === null || v === undefined;

/**
 * Provision avec rattrapage : mois 1 = cible/12 ; ensuite
 * MAX(0, (cible - déjà provisionné) / mois restants y compris le courant).
 * `forces[m]` (centimes ou null) remplace la valeur calculée du mois m.
 */
export function provisionsAvecRattrapage(cible, forces = []) {
  const res = [];
  let deja = 0;
  for (let m = 0; m < 12; m++) {
    const calc = m === 0 ? arrondi(cible / 12) : arrondi(Math.max(0, (cible - deja) / (12 - m)));
    const v = vide(forces[m]) ? calc : forces[m];
    res.push(v);
    deja += v;
  }
  return res;
}

/** Valeur d'un jour = salaire visé / jours travaillés par mois (simulateur relié). */
export function valeurJourSimulee(salaireVise, joursTravailles) {
  return joursTravailles > 0 ? arrondi(salaireVise / joursTravailles) : 0;
}

/**
 * Calcule l'année complète.
 * @param {object} p  paramètres de l'année (voir README, section Modèle)
 * @param {object[]} mois 12 objets de saisie (null/{} pour un mois non saisi)
 * @returns {object[]} 12 résultats mensuels
 */
export function calculerAnnee(p, mois) {
  const M = Array.from({ length: 12 }, (_, i) => mois[i] || {});
  const f = (k) => M.map((x) => (x.forces || {})[k]);

  const provSup = provisionsAvecRattrapage(p.cibles.supervision, f('provSupervision'));
  const provForm = provisionsAvecRattrapage(p.cibles.formation, f('provFormation'));
  const provTreso = provisionsAvecRattrapage(p.cibles.tresorerie, f('provTresorerie'));
  const cibleTirC = provisionsAvecRattrapage(p.cibles.tirelireCharges, f('cibleTirelireCharges'));
  const cibleTirS = provisionsAvecRattrapage(p.cibles.tirelireSalaire, f('cibleTirelireSalaire'));

  const vjAuto = valeurJourSimulee(p.simulateurJour?.salaireVise ?? 0, p.simulateurJour?.joursTravailles ?? 0);

  const si = p.soldesInitiaux || {}; // report de l'année précédente
  const out = [];
  let prec = null;
  for (let m = 0; m < 12; m++) {
    const s = M[m];
    const ca = s.ca ?? 0;
    const jo = p.joursOuvres[m] || 20;
    const abs = (s.joursConge ?? 0) + (s.joursFormation ?? 0);
    const chargesFixes = p.chargesFixesTotal[m] ?? 0;
    const vj = vide(p.valeurJour[m]) ? vjAuto : p.valeurJour[m];

    // Étape 4 — pioches d'absence
    const piocheCharges = arrondi(Math.min(chargesFixes, (abs * chargesFixes) / jo));
    const piocheSalaire = arrondi(abs * vj);
    // Étape 2 — frais et État
    const chargesPayees = chargesFixes - piocheCharges;
    const cotisations = appliquerTaux(ca, p.tauxUrssaf[m]);
    const liberatoire = appliquerTaux(ca, p.tauxLiberatoire[m]);
    // Étape 3 — enveloppes et tirelires (prorata des jours travaillés)
    const ratio = 1 - abs / jo;
    const tirCharges = arrondi(Math.max(0, cibleTirC[m] * ratio));
    const tirSalaire = arrondi(Math.max(0, cibleTirS[m] * ratio));
    // Étape 5 — salaire net
    const baseNette = ca - chargesPayees - cotisations - liberatoire
      - provSup[m] - provForm[m] - provTreso[m] - tirCharges - tirSalaire + piocheSalaire;
    const pas = appliquerTaux(baseNette, p.tauxPas[m] ?? 0);
    const netCabinet = baseNette - pas;
    const retrait = vide(s.retraitForce) ? null : s.retraitForce;
    const salaireVerse = retrait ?? netCabinet;
    const autresSalaires = p.autresSalaires[m] ?? 0;
    const resteAVivre = salaireVerse + autresSalaires;
    // Étape 6 — épargne perso
    const resteAVivreFinal = resteAVivre - (s.epargne ?? 0);
    // Étape 7 — soldes cumulés du compte pro
    const depSup = s.depSupervision ?? 0;
    const depForm = s.depFormation ?? 0;
    const autresAchats = (s.autresAchats || []).reduce((t, a) => t + (a.montant ?? 0), 0);
    const soldes = {
      supervision: (prec ? prec.soldes.supervision : (si.supervision ?? 0)) + provSup[m] - depSup,
      formation: (prec ? prec.soldes.formation : (si.formation ?? 0)) + provForm[m] - depForm,
      tresorerie: (prec ? prec.soldes.tresorerie : p.tresorerieInitiale) + provTreso[m] - autresAchats
        + (retrait === null ? 0 : netCabinet - retrait),
      tirelireCharges: (prec ? prec.soldes.tirelireCharges : (si.tirelireCharges ?? 0)) + tirCharges - piocheCharges,
      tirelireSalaire: (prec ? prec.soldes.tirelireSalaire : (si.tirelireSalaire ?? 0)) + tirSalaire - piocheSalaire,
    };
    soldes.total = soldes.supervision + soldes.formation + soldes.tresorerie
      + soldes.tirelireCharges + soldes.tirelireSalaire;

    // Ajouts : Urssaf + impôt à reverser (payé le 1er du mois suivant)
    const du = cotisations + liberatoire;
    const paye = (s.paiementUrssaf ?? 0) + (s.paiementImpot ?? 0);
    const aReverser = (prec ? prec.aReverser : (si.aReverser ?? 0)) + du - paye;

    // Trésorerie réelle : le compte contient aussi ce qui reste à reverser
    const theoriqueCompte = soldes.total + aReverser;
    const soldeReel = vide(s.soldeReel) ? null : s.soldeReel;
    const ecartReel = soldeReel === null ? null : soldeReel - theoriqueCompte;

    const r = {
      mois: m, saisi: !vide(s.ca) && !s.prevision, prevision: !!s.prevision, ca, abs, valeurJour: vj, chargesFixes, piocheCharges, piocheSalaire,
      chargesPayees, cotisations, liberatoire,
      provSupervision: provSup[m], provFormation: provForm[m], provTresorerie: provTreso[m],
      cibleTirelireCharges: cibleTirC[m], cibleTirelireSalaire: cibleTirS[m],
      tirCharges, tirSalaire, baseNette, pas, netCabinet, retrait, salaireVerse, autresSalaires,
      resteAVivre, resteAVivreFinal, depSup, depForm, autresAchats, soldes,
      du, paye, aReverser, theoriqueCompte, soldeReel, ecartReel,
      caCumule: (prec?.caCumule ?? 0) + ca,
    };
    r.alertes = alertesMois(r, p);
    out.push(r);
    prec = r;
  }
  return out;
}

/** Alertes discrètes d'un mois (codes ; l'interface les traduit). */
function alertesMois(r, p) {
  const a = [];
  for (const k of ['supervision', 'formation', 'tresorerie', 'tirelireCharges', 'tirelireSalaire']) {
    if (r.soldes[k] < 0) a.push('negatif:' + k);
  }
  if (r.ecartReel !== null && Math.abs(r.ecartReel) > (p.seuilEcart ?? 10000)) a.push('ecartReel');
  if (r.baseNette < 0) a.push('baseNegative');
  return a;
}

/** Plafond micro-BNC : jauge + projection fin d'année (moyenne des mois saisis). */
export function suiviPlafond(resultats, plafond, seuilAlerte = 8500) {
  const saisis = resultats.filter((r) => r.saisi);
  const cumul = saisis.reduce((t, r) => t + r.ca, 0);
  const projection = saisis.length ? arrondi((cumul / saisis.length) * 12) : 0;
  const pct = plafond ? (cumul * 10000) / plafond : 0; // centièmes de %
  return { cumul, projection, pct: arrondi(pct), alerte: pct >= seuilAlerte || projection >= (plafond * seuilAlerte) / 10000 };
}

/** Impôt au barème progressif (tranches en centimes, taux en centièmes de %). */
export function impotBareme(revenuImposable, parts, tranches) {
  const q = revenuImposable / parts;
  let impot = 0;
  for (let i = 0; i < tranches.length; i++) {
    const bas = tranches[i].de;
    const haut = i + 1 < tranches.length ? tranches[i + 1].de : Infinity;
    if (q > bas) impot += ((Math.min(q, haut) - bas) * tranches[i].taux) / 10000;
  }
  return arrondi(impot * parts);
}

/**
 * Simulateur fiscal annualisé, deux sources séparées.
 * Avec versement libératoire : seuls les salaires vont au barème ;
 * le CA micro (après abattement) entre dans le revenu fiscal de référence.
 */
export function simulateurFiscal({ caAnnuel, salairesAnnuels, parts, f }) {
  const abattementMicro = Math.max(appliquerTaux(caAnnuel, f.abattementMicro), f.abattementMin);
  const beneficeMicro = Math.max(0, caAnnuel - abattementMicro);
  const deductionSal = Math.min(Math.max(appliquerTaux(salairesAnnuels, f.deductionSalaires), salairesAnnuels > 0 ? f.deductionMin : 0), salairesAnnuels);
  const salairesNets = salairesAnnuels - deductionSal;
  const impotSalaires = impotBareme(salairesNets, parts, f.bareme);
  const rfr = salairesNets + beneficeMicro;
  const seuilVL = f.seuilRfrVlParPart * parts;
  return {
    beneficeMicro, salairesNets, impotSalaires, rfr, seuilVL,
    vlPossibleDansDeuxAns: rfr <= seuilVL,
    // Comparaison sans libératoire (tout au barème)
    impotSansVL: impotBareme(salairesNets + beneficeMicro, parts, f.bareme),
  };
}

/** Simulateur micro vs réel (base imposable seulement, pas plus). */
export function microVsReel({ caAnnuel, fraisReels, cotisations, f }) {
  const baseMicro = Math.max(0, caAnnuel - Math.max(appliquerTaux(caAnnuel, f.abattementMicro), f.abattementMin));
  const baseReel = Math.max(0, caAnnuel - fraisReels - cotisations);
  return { baseMicro, baseReel, avantageReel: baseMicro - baseReel };
}

/**
 * Prévisionnel : complète les mois non saisis avec le CA prévu (caPrevu)
 * ou, à défaut, la moyenne des mois saisis. Les mois complétés portent prevision: true.
 */
export function completerPrevision(p, mois) {
  const saisis = mois.filter((s) => s && s.ca !== null && s.ca !== undefined);
  const moyenne = saisis.length ? arrondi(saisis.reduce((t, s) => t + s.ca, 0) / saisis.length) : 0;
  return Array.from({ length: 12 }, (_, m) => {
    const s = mois[m] || {};
    if (s.ca !== null && s.ca !== undefined) return s;
    const prevu = p.caPrevu?.[m];
    return { ...s, ca: prevu ?? moyenne, prevision: true };
  });
}
