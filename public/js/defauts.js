// defauts.js — Valeurs par défaut d'une NOUVELLE année (aucune donnée personnelle).
// Ce ne sont que des propositions : tout est modifiable dans Paramètres.
// Chaque taux/seuil porte sa source et sa date de vérification.
export const SCHEMA = 1;
const x12 = (v) => Array(12).fill(v);

export const SOURCES_2026 = {
  tauxUrssaf: { texte: 'Cipav micro 23,2 % + formation pro 0,2 % — bpifrance-creation.fr', verifie: '2026-11-02' },
  tauxLiberatoire: { texte: 'Versement libératoire BNC 2,2 % — bpifrance-creation.fr', verifie: '2026-11-02' },
  plafondMicro: { texte: 'Micro-BNC 83 600 € (2026-2028) — LF 2026, lecoindesentrepreneurs.fr', verifie: '2026-11-02' },
  seuilTva: { texte: 'Franchise TVA services 37 500 € / 41 250 € — art. 293 B CGI', verifie: '2026-11-02' },
  seuilRfrVl: { texte: 'RFR N-2 ≤ limite 2e tranche du barème (29 315 €/part en 2026) — À VÉRIFIER pour 2027', verifie: '2026-11-02' },
  bareme: { texte: 'Barème revenus 2025 repris du classeur — À VÉRIFIER sur impots.gouv.fr', verifie: '' },
};

export const CHARGES_TYPES = ['Loyer', 'Assurance', 'RC Pro', 'Mutuelle', 'Prévoyance', 'Frais bancaires', 'Comptable',
  'CFE', 'Conseil', 'Logiciels et abonnements', 'Téléphone'];

export function anneeVierge() {
  return {
    schemaVersion: SCHEMA,
    verrouillee: false,
    chargesFixes: CHARGES_TYPES.map((libelle, i) => ({ id: 'c' + i, libelle, montants: x12(0) })),
    cibles: { supervision: 80000, formation: 80000, tresorerie: 120000, tirelireSalaire: 400000, tirelireCharges: 190000 },
    tresorerieInitiale: 0,
    tauxUrssaf: x12(2340),
    tauxLiberatoire: x12(220),
    tauxPas: x12(0),
    tauxSources: SOURCES_2026,
    autresSalaires: x12(0),
    valeurJour: x12(null), // null = calculée par le simulateur
    joursOuvres: x12(20),
    simulateurJour: { salaireVise: 230000, joursTravailles: 16, plancher: 230000, plafondVise: 250000 },
    fiscal: {
      parts: 1, rfrN2: null, rfrN1: null, reductions: 0,
      abattementMicro: 3400, abattementMin: 30500, deductionSalaires: 1000, deductionMin: 50400,
      seuilRfrVlParPart: 2957900, seuilTva: 3750000, seuilTvaMajore: 4125000, fraisReels: 1000000,
      bareme: [{ de: 0, taux: 0 }, { de: 1160000, taux: 1100 }, { de: 2957900, taux: 3000 }, { de: 8457700, taux: 4100 }, { de: 18191700, taux: 4500 }],
    },
    plafondMicro: 8360000,
    seuilAlertePlafond: 8500,
    seuilEcart: 10000,
    categoriesAchats: ['Livres', 'Tests', 'Matériel', 'Logiciels', 'Divers'],
    caPrevu: x12(null), // prévisionnel saisi ; null = moyenne des mois saisis
  };
}

/** Nouvelle année à partir de la précédente : paramètres copiés, trésorerie = solde réel (ou théorique) de décembre. */
export function anneeSuivante(prec, decembre) {
  const a = structuredClone(prec);
  a.verrouillee = false;
  const s = decembre.soldes;
  // Trésorerie initiale = solde réel de décembre moins les autres enveloppes (ajustable ensuite)
  a.tresorerieInitiale = decembre.soldeReel !== null
    ? decembre.soldeReel - s.supervision - s.formation - s.tirelireCharges - s.tirelireSalaire - decembre.aReverser
    : s.tresorerie;
  a.soldesInitiaux = { supervision: s.supervision, formation: s.formation, tirelireCharges: s.tirelireCharges,
    tirelireSalaire: s.tirelireSalaire, aReverser: decembre.aReverser };
  a.fiscal.rfrN2 = prec.fiscal?.rfrN1 ?? null;
  a.fiscal.rfrN1 = null;
  a.caPrevu = x12(null);
  return a;
}
