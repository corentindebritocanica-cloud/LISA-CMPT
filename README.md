# LISA-CMPT — Pilotage personnel micro-BNC

> **Statut (29/09/2026) : phase d'analyse. Aucun code applicatif n'est encore écrit.**
> Ce README est la **base d'information du projet** : il se lit AVANT toute modification et se met à jour APRÈS chaque modification (voir « Règles de travail »).

## 1. Objectif

Transformer un classeur Excel en application web de **pilotage personnel** pour une psychologue libérale non conventionnée (micro-BNC, cotisations Cipav collectées par l'Urssaf, versement libératoire de l'impôt, plus un petit salaire hospitalier).

Elle doit répondre à trois questions :
1. Combien puis-je me verser ce mois-ci ?
2. Combien mettre de côté (supervision, formation, précaution, congés) ?
3. Où en est la trésorerie du compte pro, en théorie **et** en réel ?

**Hors périmètre** : facturation, facture électronique, comptabilité en partie double, assistant IA.

## 2. Infrastructure constatée

| Élément | État constaté le 29/09/2026 |
|---|---|
| Dépôt GitHub | `corentindebritocanica-cloud/LISA-CMPT` — **public**, ne contenait que ce README |
| Projet Firebase | `lisa-compta` (dédié à cette app), actif |
| Firestore | Créé le 29/09/2026, mode natif, région **eur3** (Europe), protection contre la suppression désactivée, récupération à un instant donné désactivée |
| Authentication | E-mail + mot de passe activé |
| Application web Firebase | Aucune enregistrée pour l'instant (config publique à créer) |
| Firebase Hosting | Site `lisa-compta` existant (non utilisé pour l'instant) |
| Règles Firestore | **Non vérifiées** à ce jour : à contrôler et déployer avant toute donnée |

Le dépôt et le site publié sont publics : **le code ne contient aucune donnée personnelle, aucun secret, aucune clé privée**. Les accès d'administration (token GitHub, compte de service Firebase) sont fournis hors dépôt, lus uniquement en variables d'environnement, et servent à l'initialisation, à l'import des données et au déploiement des règles (jamais dans l'app publiée).

## 3. Analyse du classeur source

Fichier : « Compta Lisa V3.2 » (classeur Excel avec macros, .xlsm). **Il n'est pas versé dans ce dépôt** (données personnelles) ; il est conservé dans le projet Claude « Excel Comptabilité ».

### 3.1 Onglet « Bilan Annuel 2026 » (colonnes B à M = janvier à décembre, N = total)

Feuille protégée sans mot de passe ; seules les cellules de saisie sont déverrouillées.

| Étape | Lignes | Contenu | Nature |
|---|---|---|---|
| 1 Activité | 7, 8, 9 | CA encaissé, jours de congé, jours de formation | **Saisie** |
| 2 Frais et état | 12, 13, 14 | Charges fixes payées, cotisations (CA × taux Urssaf + retraite), versement libératoire (CA × taux) | Calcul |
| 3 Enveloppes | 17, 18, 19, 20, 21 | Provisions supervision / formation / trésorerie ; tirelire charges ; tirelire salaire | Calcul |
| 4 Absences | 24, 25 | Pioche charges ; pioche salaire | Calcul |
| 5 Salaire net | 28, 29, 30, 31, 32, 33 | Base nette, prélèvement à la source, net cabinet, **retrait manuel forcé** (saisie), salaire hospitalier, reste à vivre total | Mixte |
| 6 Épargne perso | 36, 37 | Épargne personnelle (saisie), reste à vivre final | Mixte |
| 7 Comptes pro | 40 à 45 | Soldes cumulés : supervision, formation, trésorerie, tirelire charges, tirelire salaire, total | Calcul |
| 8 Dépenses pro | 48, 49, 50 | Dépenses supervision, formation, autres achats pro | **Saisie** |

Mises en forme conditionnelles : les lignes 40 à 44 se colorent quand la dépense (ou pioche, ou retrait) correspondante est renseignée.

### 3.2 Onglet « Paramètres » (colonnes B à M = mois, N = total réel, O = cible annuelle)

| Section | Lignes | Contenu |
|---|---|---|
| 1 Charges fixes | 6 à 17 (total ligne 18) | 12 postes mensuels : loyer, assurances, mutuelle, prévoyance, frais bancaires, comptable, CFE, conseil, abonnements, téléphone… |
| 2 Provisions | 21, 22, 23 ; O21 à O23 | Cibles annuelles supervision, formation, trésorerie ; trésorerie initiale au 1er janvier en B24 |
| 3 Fiscalité et revenus | 27, 28, 29, 30 | Taux Urssaf + retraite, taux du versement libératoire, taux PAS (mensuels), salaire net hospitalier |
| 4 Tirelire congés | 33, 34 ; O33, O34 ; 35, 36 | Cibles annuelles tirelire salaire et charges ; valeur d'un jour de salaire ; jours ouvrés moyens (20) |
| 5 Simulateur « valeur d'un jour » | 40 à 42 | Net visé ÷ jours travaillés ; le résultat est à **recopier à la main** en ligne 35 |
| 6 Simulateur fiscal | 46 à 58 | Revenu de référence, parts, quotient familial, barème par tranches (0 / 11 / 30 / 41 / 45 % ; seuils 11 600, 29 579, 84 577, 181 917 €), marge avant hausse, effort pour baisser d'une tranche |

Mise en forme conditionnelle : la colonne N passe au vert si le total réel atteint la cible (à 1 € près), au rouge sinon.

### 3.3 Formules (logique à reproduire à l'identique)

Notation : `abs = congés + formation`, `J = jours ouvrés moyens`.

- Pioche charges = `MIN(charges, abs × charges / J)` ; pioche salaire = `abs × valeur du jour`
- Charges payées = `charges − pioche charges`
- Cotisations = `CA × taux Urssaf + retraite` ; libératoire = `CA × taux libératoire`
- Provision (supervision, formation, trésorerie) et cibles des tirelires : mois 1 = `ROUND(cible / 12, 2)` ; mois suivants = `ROUND(MAX(0, (cible − déjà provisionné) / mois restants y compris le courant), 2)`. Dans le classeur, « mois restants » = `14 − numéro de colonne`.
- Tirelire du mois = `MAX(0, cible mensuelle × (1 − abs / J))`
- Base nette = `CA − charges payées − cotisations − libératoire − 3 provisions − 2 tirelires + pioche salaire`
- Net cabinet = `base nette × (1 − taux PAS)` ; salaire versé = retrait forcé s'il est saisi, sinon net cabinet
- Reste à vivre = `salaire versé + salaire hospitalier` ; reste à vivre final = `reste à vivre − épargne perso`
- Soldes cumulés : supervision et formation = `précédent + provision − dépense` ; trésorerie = `précédent (mois 1 : trésorerie initiale) + provision trésorerie − autres achats + (net cabinet − retrait forcé si un retrait est saisi)` ; tirelires = `précédent + versement − pioche` ; total = somme des 5 soldes
- Colonne N des soldes = valeur du dernier mois (décembre), pas une somme

### 3.4 Macros VBA du classeur (référence, non reprises telles quelles)

| Macro | Rôle | Décision |
|---|---|---|
| `GenererBilanMaster_UltimeV46` | **Supprime et recrée** les deux onglets (relancée, elle écrase les saisies) | Non reprise |
| `PoserQuestionGemini` | Assistant IA via une API externe | Hors périmètre, à ne pas reprendre |
| `GenererJSONString` / `ExtraireDonneesJSON` | Export JSON (voir 3.5) | Sert de base à l'import |
| `SauvegardeHistorique` | Copie du classeur vers un dossier local en dur | Remplacée par export/import JSON |
| `CreerArchives` / `CopierArchives` | Copies d'onglets « (2) » et « Feuille tampon » | Remplacées par le sélecteur d'année |

### 3.5 Structure de l'export JSON existant

`parametres` (charges fixes par poste sur 12 mois ; taux Urssaf, libératoire et PAS mensuels ; cibles des provisions et des tirelires ; trésorerie initiale ; parts fiscales) et `bilan` (12 mois × CA, congés, formation, retrait forcé, épargne perso, dépense supervision, dépense formation, autres dépenses).

**Limites** : cet export ne contient qu'**une seule valeur** de salaire hospitalier (pas par mois), ni la valeur du jour par mois, ni les jours ouvrés. L'import 2026 devra donc lire directement le classeur, et non ce JSON.

## 4. Anomalies constatées dans le classeur (à corriger dans l'app)

1. **Rattrapage automatique cassé** : les formules des provisions et des tirelires ne subsistent que pour janvier à mars. D'avril à décembre, ce sont des valeurs saisies à la main (mai à zéro, septembre à décembre à zéro). Une cellule de tirelire contient même un rattrapage ajouté à la main dans la formule (somme de constantes). Les cibles annuelles ne sont donc pas atteignables.
2. **Trésorerie purement théorique** : aucun solde réel du compte pro, aucun écart, aucune enveloppe pour l'Urssaf et l'impôt à reverser. L'enveloppe Formation est négative de janvier à juin.
3. **Décembre trompeur** : les colonnes des mois futurs répètent le dernier solde connu, ce qui donne un faux « total fin d'année ».
4. **Simulateur fiscal non annualisé et mal alimenté** : il prend le total « reste à vivre » des mois saisis (janvier à août), qui mélange retraits et salaire hospitalier ; il ne calcule aucun impôt (il n'indique que la tranche). Avec le versement libératoire, le CA micro n'entre pas dans le barème (seul le salaire hospitalier y entre), mais il compte pour le revenu fiscal de référence.
5. **Taux PAS à zéro** toute l'année alors que le libellé de la ligne indique 10 %.
6. **Salaire hospitalier** renseigné seulement de janvier à mai ; charges fixes vides de septembre à décembre ; valeur d'un jour modifiée à partir d'octobre.
7. **Cases vides ou zéro** mélangées sur les jours de congé et de formation (le comportement est le même, mais la saisie est incohérente).
8. **Aucun suivi du plafond micro-BNC** (CA cumulé).
9. **Simulateur « valeur d'un jour » déconnecté** : recopie manuelle vers la ligne 35.

## 5. Questions ouvertes (à trancher avant de figer les paramètres)

- **Taux Urssaf + retraite** relevés dans le classeur : 13,4 % (janvier à mars), 23,2 % (avril), 23,4 % (mai à décembre). Hypothèses à vérifier sur sources officielles : réduction ACRE en début d'année, puis taux plein 23,2 %, puis 0,2 point de contribution à la formation professionnelle à partir de mai.
- **Taux du versement libératoire** : 2,2 %, sauf 2,4 % en avril (écart de 0,2 point : erreur de saisie, ou contribution ajoutée à tort ?).
- **CFE** lissée à 65 €/mois depuis janvier : la première année étant exonérée, est-elle due en 2026 ?
- **Prélèvement à la source** sur le salaire hospitalier : taux réel à renseigner.
- **Données de test** : le classeur fournit des valeurs de référence (janvier et août) pour les tests automatiques. Le dépôt étant public, les tests utiliseront des **valeurs fictives équivalentes**, sauf décision contraire.
- Le questionnaire complet sera intégré ici dès réception des réponses.

## 6. Architecture cible (à valider)

- Application web statique sans étape de build : `index.html` + modules JS, manifest et service worker.
- Hébergement GitHub Pages (déploiement par GitHub Actions) ; Firebase Hosting à étudier pour les en-têtes CSP/HSTS, **sans changer sans accord**.
- Données : Firestore sous `users/{uid}`, montants en centimes entiers, `schemaVersion` et `updatedAt`, calculs faits dans un module pur testable.
- Connexion e-mail + mot de passe ; règles Firestore avec liste blanche d'utilisateurs, testées à l'émulateur.
- Confidentialité : jamais de nom de patient (codes clients anonymes uniquement).

## 7. Règles de travail

1. Lire ce README **avant** toute modification.
2. Mettre à jour ce README **après** chaque modification.
3. Ne jamais écrire dans le dépôt : secrets, tokens, clés, données personnelles ou financières réelles, le classeur source, ni le JSON de données 2026.
4. Avant toute écriture dans Firestore de production : export de sauvegarde, essai à blanc, confirmation.
5. Tous les taux et seuils vont dans les paramètres, avec source et date de vérification.

## 8. Journal

| Date | Changement |
|---|---|
| 29/09/2026 | Analyse du classeur, état de l'infrastructure, anomalies et questions ouvertes. Aucun code. |
