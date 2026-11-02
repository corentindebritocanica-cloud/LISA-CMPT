// format.js — Formats français (Intl fr-FR) et saisie des montants.
const fmtEur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtNb = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
export const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Centimes -> "1 234,56 €" */
export const eur = (c) => (c === null || c === undefined ? '—' : fmtEur.format(c / 100));
/** Centimes -> "1 234,56" (pour un champ de saisie) */
export const nombre = (c) => (c === null || c === undefined ? '' : fmtNb.format(c / 100));
/** Centièmes de % -> "23,40 %" */
export const pct = (t) => (t === null || t === undefined ? '—' : fmtNb.format(t / 100) + ' %');

/** Nettoie une saisie française : "1 234,56 €" -> 1234.56 (ou null si vide). NaN si invalide. */
export function lireNombre(txt) {
  const s = String(txt ?? '').replace(/[\s  €%]/g, '').replace(',', '.');
  if (s === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}
/** Saisie -> centimes entiers (null si vide, NaN si invalide). */
export function lireEuros(txt) {
  const n = lireNombre(txt);
  return n === null || Number.isNaN(n) ? n : Math.round(n * 100);
}
/** Saisie "23,4" -> 2340 centièmes de %. */
export function lirePct(txt) {
  const n = lireNombre(txt);
  return n === null || Number.isNaN(n) ? n : Math.round(n * 100);
}
/** Jours : nombre, par pas de 0,5. */
export function lireJours(txt) {
  const n = lireNombre(txt);
  if (n === null || Number.isNaN(n)) return n;
  return Math.round(n * 2) / 2;
}
export const jours = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
