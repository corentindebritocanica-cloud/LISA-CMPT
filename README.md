# LISA-CMPT — Pilotage personnel micro-BNC

> **Statut (02/11/2026) : version 1 construite et testée (calcul, règles, interface). Déploiement sur Firebase Hosting. Import des données 2026 prévu fin novembre (Excel final).**
> Ce README est la **base d'information du projet** : il se lit AVANT toute modification et se met à jour APRÈS chaque modification (voir « Règles de travail »).

## 1. Objectif

Transformer un classeur Excel en application web de **pilotage personnel** pour une psychologue libérale non conventionnée (micro-BNC, cotisations Cipav collectées par l'Urssaf, versement libératoire de l'impôt, plus un petit salaire hospitalier).

Elle doit répondre à trois questions :
1. Combien puis-je me verser ce mois-ci ?
2. Combien mettre de côté (supervision, formation, précaution, congés) ?
3. Où en est la trésorerie du compte pro, en théorie **et** en réel ?

**Hors périmètre** : facturation, facture électronique, comptabilité en partie double, assistant IA.

## 2. Infrastructure (état au 02/11/2026)

| Élément | État |
|---|---|
| Dépôt GitHub | `corentindebritocanica-cloud/LISA-CMPT` — **public** |
| Application | **https://lisa-compta.web.app** (Firebase Hosting, en-têtes de sécurité actifs) |
| Projet Firebase | `lisa-compta`, plan Spark (gratuit, sans facturation) |
| Firestore | Mode natif, région **eur3**, règles de `firestore.rules` déployées le 02/11/2026 |
| Authentication | E-mail + mot de passe. Comptes : Corentin et Lisa, tous deux dans `acces` (cabinet `lisa`) |
| Application web Firebase | `1:779757383089:web:d68582fc494978c62c6190` (config dans `public/js/config.js`) |
| Données | Aucune pour l'instant : import 2026 prévu fin novembre |

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

## 5. Décisions (questionnaire du 14/10/2026 et échanges du 02/11/2026)

- **Taux** : Cipav micro 23,2 % + formation pro 0,2 % = **23,4 %** ; libératoire **2,2 %** (sources : bpifrance-creation.fr, centre-inffo.fr, vérifiés le 02/11/2026). Janv.-mars 13,4 % = ACRE (finie le 31/03/2026, décomposition à confirmer sur un relevé). Avril (23,2 % + 2,4 %) = même total, formation pro saisie sur la mauvaise ligne : l'app propose 23,4 % / 2,2 %. Taux saisis mois par mois, avec source et date.
- **Plafond micro-BNC** 83 600 € (2026-2028), alerte à 85 % ; **TVA** : recettes hors soins suivies à part (franchise 37 500 € / 41 250 €).
- **Versement libératoire** : RFR N-2 ≤ seuil par part (29 315 € en 2026 ; 29 579 € supposé pour 2027, à vérifier). **Risque : avec ~60 k€ de CA en 2026, le RFR 2026 (~40 k€) dépasse le seuil → libératoire perdu en 2028.** Garde-fou affiché dans l'app. Rappel en août pour l'option avant le 1er octobre.
- **Jours de formation = jours de congé** (pioches identiques), demi-journées autorisées.
- **Reste à vivre** : noms gardés. Reste à vivre total = salaire versé + autres revenus salariés ; final = total − épargne perso.
- **Lissage** : l'app propose (net > plafond 2 500 € → excédent vers la tirelire salaire ; net < plancher 2 300 € → retrait forcé), Lisa valide.
- **Report** des 5 enveloppes d'une année sur l'autre ; trésorerie initiale = solde réel de décembre, ajustable.
- **Import « tel quel »** : les valeurs tapées à la main dans l'Excel (avril → décembre) sont importées comme **valeurs forcées** (orange), remises en automatique d'un clic.
- **Connexion** : e-mail + mot de passe, session gardée jusqu'à déconnexion (pas de verrouillage d'inactivité, demandé par Corentin), mot de passe enregistré dans le navigateur / Trousseau Apple. Pas de double authentification.
- **Pas de facturation Google Cloud** (plan Spark). Région Firestore eur3.
- **Sauvegarde** : export/import JSON dans l'app + envoi automatique chaque dimanche vers la boîte mail de Corentin (secret SAUVEGARDE_DEST).
- **Encaissements** : total du mois + nombre de séances (pas de détail paiement par paiement).

## 6. Architecture

- **Hébergement : Firebase Hosting** (`lisa-compta.web.app`) pour les en-têtes HTTP CSP, HSTS, frame-ancestors (impossibles sur GitHub Pages). Code sur GitHub, déployé par GitHub Actions.
- **Sans étape de build** : `public/index.html` + modules ES natifs, `manifest.webmanifest`, `sw.js` (interface disponible hors ligne).
- **SDK Firebase 13.1.0 copié en local** dans `public/vendor/firebase-13.1.0/` (identique au fichier officiel gstatic, imports réécrits en relatif) : aucun script externe.

| Fichier | Rôle |
|---|---|
| `public/js/calc.js` | Calcul **pur** (centimes entiers), testé. Aucune dépendance. |
| `public/js/donnees.js` | Auth + Firestore (cache local persistant, plusieurs onglets), enregistrement auto, export/import, mode démo |
| `public/js/app.js` | Écrans : tableau de bord, saisie, vue annuelle, paramètres, simulateurs, sauvegarde |
| `public/js/format.js` | Formats fr-FR, lecture « 1 234,56 » |
| `public/js/defauts.js` | Valeurs d'une nouvelle année + sources des taux |
| `public/js/config.js` | Configuration web Firebase **publique** (pas un secret) |
| `firestore.rules` | Règles de sécurité |
| `tests/calc.test.js` | Tests du calcul (valeurs **fictives**) |
| `tests/rules.spec.js` | Tests des règles sur l'émulateur (19 cas) |
| `scripts/sauvegarde.mjs` | Sauvegarde hebdomadaire par e-mail (GitHub Actions) |

**Mode démo** : `http://localhost:8123/?demo` (localhost uniquement), données fictives en mémoire, sans Firebase.

### 6.1 Modèle de données Firestore

Montants en **centimes entiers**, taux en **centièmes de %** (23,40 % = 2340), jours en nombres (0,5 permis). Résultats jamais stockés.

- `acces/{uid}` → `{ cabinet: 'lisa' }` : liste blanche, écrite **uniquement en admin**.
- `cabinet/lisa/annees/{AAAA}` : `schemaVersion, updatedAt, verrouillee, chargesFixes[{id, libelle, montants[12]}], cibles{supervision, formation, tresorerie, tirelireSalaire, tirelireCharges}, tresorerieInitiale, soldesInitiaux{…, aReverser}, tauxUrssaf[12], tauxLiberatoire[12], tauxPas[12], tauxSources{cle:{texte, verifie}}, autresSalaires[12], valeurJour[12] (null = simulateur), joursOuvres[12], simulateurJour{salaireVise, joursTravailles, plancher, plafondVise}, fiscal{parts, rfrN2, rfrN1, reductions, abattementMicro, abattementMin, deductionSalaires, deductionMin, seuilRfrVlParPart, seuilTva, seuilTvaMajore, fraisReels, bareme[]}, plafondMicro, seuilAlertePlafond, seuilEcart, categoriesAchats[], caPrevu[12]`.
- `cabinet/lisa/annees/{AAAA}/mois/{01..12}` : `schemaVersion, updatedAt, ca (null = non saisi), caHorsSoins, nbSeances, joursConge, joursFormation, retraitForce (null = net calculé), epargne, depSupervision, depFormation, autresAchats[{categorie, montant}], soldeReel, paiementUrssaf, paiementImpot, declareUrssaf, forces{provSupervision, provFormation, provTresorerie, cibleTirelireCharges, cibleTirelireSalaire}`.
- `cabinet/lisa/reglages/interface` : `accueil (tableau|saisie|annuel), theme (clair|sombre|auto)`.

### 6.2 Calcul (écarts volontaires avec l'Excel)

- Rattrapage automatique sur **tous** les mois ; une valeur forcée par mois reste possible.
- Arrondi au centime de chaque montant (écart max 0,005 € avec l'Excel, ex. 577,656 → 577,66).
- Prévisionnel : mois non saisis = CA prévu, sinon moyenne des mois saisis.
- **Urssaf + impôt à reverser** = cumul (cotisations + libératoire) − paiements réels. **Théorique sur le compte** = total des enveloppes + à reverser ; écart = solde réel − théorique (alerte au-delà de 100 €).
- Simulateur fiscal annualisé : salaires seuls au barème ; CA micro après abattement 34 % dans le RFR.

### 6.3 Sécurité

- Connexion obligatoire, **e-mail vérifié**, UID présent dans `acces` avec le bon cabinet ; inscription d'un inconnu = aucun accès.
- Règles : `hasOnly` sur chaque document, types et bornes (montants entiers ±10 M€, jours 0-31, mois 01-12, listes limitées), `updatedAt == request.time`, **aucune suppression**, année clôturée en lecture seule, CA figé quand le mois est déclaré à l'Urssaf. Tout le reste refusé.
- En-têtes HTTP (`firebase.json`) : CSP sans script externe ni inline, HSTS, `frame-ancestors 'none'`, nosniff, no-referrer, Permissions-Policy, noindex. CSP aussi en `<meta>`.
- Interface : jamais d'`innerHTML` avec des données (fonction `h()` + `textContent`), styles via CSSOM. Rien de financier dans la console.
- Dépôt **public** : aucune donnée réelle (les tests réels restent en local, `tests/calc.reel.test.js` ignoré).
- Compte de service : uniquement en secret GitHub (déploiement, sauvegarde) et pour l'administration ponctuelle ; jamais dans l'app.

## 6.4 Guide pas à pas

**Se connecter** : ouvrir https://lisa-compta.web.app, e-mail + mot de passe ; accepter l'enregistrement du mot de passe (Edge, ou Safari/Trousseau avec Touch ID). Première fois : cliquer le lien de vérification reçu par e-mail. Sur Mac, Safari → Fichier → « Ajouter au Dock » pour l'utiliser comme une application.

**Saisie mensuelle (fin de mois, 5-15 min)** : Saisie du mois → CA, séances, absences, retrait, dépenses, solde réel du compte, paiements Urssaf/impôt. Tout s'enregistre seul (pastille « Enregistré »). Cocher « Mois déclaré à l'Urssaf » après la déclaration du 1er.

**Mot de passe oublié** : lien sur l'écran de connexion (ou Corentin renvoie un lien).

**Ajouter un compte autorisé** (admin, Corentin) : créer le compte dans la console Firebase → Authentication, puis créer le document `acces/{uid}` avec `cabinet: "lisa"` (Firestore → Données). L'app ne peut jamais écrire dans `acces`.

**Sauvegarder / restaurer** : écran Sauvegarde → Télécharger ; Importer affiche un aperçu et télécharge l'état actuel avant d'écraser. La sauvegarde du dimanche (e-mail) contient `cabinets.lisa` : pour la restaurer, garder ce bloc sous la forme `{ "application": "compta-lisa", "schemaVersion": 1, "annees": { … } }`.

**Nouvelle année** : choisir l'année dans le sélecteur ou Sauvegarde → « Créer AAAA+1 » : paramètres copiés, enveloppes reportées, trésorerie initiale = solde réel de décembre (à ajuster dans Paramètres). Clôturer l'année écoulée dans Paramètres (lecture seule, réversible).

**Mettre à jour l'application** : lire ce README → modifier → `npm test` et `npm run test:rules` → relire le diff → push sur `main`. GitHub Actions lance « Tests » puis « Déploiement » (si le secret `FIREBASE_SERVICE_ACCOUNT` existe). Changer la version du cache dans `public/sw.js` à chaque mise à jour de l'interface. Mettre ce README à jour.

**Essai local** : `npx http-server public -p 8123` puis http://localhost:8123/?demo (données fictives).

## 6.5 À faire par Corentin (hors de portée de l'assistant)

1. **Secrets GitHub** (dépôt → Settings → Secrets and variables → Actions → New repository secret) : `FIREBASE_SERVICE_ACCOUNT` (contenu du JSON du compte de service), `GMAIL_USER` et `SAUVEGARDE_DEST` (adresse de Corentin), `GMAIL_APP_PASSWORD` (mot de passe d'application Gmail). Sans eux, le déploiement automatique et la sauvegarde du dimanche ne tournent pas.
2. **Restreindre la clé web** : console Google Cloud du projet lisa-compta → API et services → Identifiants → clé « Browser key (auto created by Firebase) » → Restrictions d'application : *Sites web* → `https://lisa-compta.web.app/*`, `https://lisa-compta.firebaseapp.com/*`, `http://localhost:8123/*` ; Restrictions d'API : Identity Toolkit API, Token Service API, Cloud Firestore API.
3. **Droits du compte de service** pour le déploiement par GitHub Actions : rôles *Administrateur Firebase Hosting*, *Administrateur des règles Firebase* et *Consommateur Service Usage* (IAM → compte `firebase-adminsdk-fbsvc@…`). Sans eux, l'outil `firebase deploy` est refusé (constaté le 02/11/2026 ; le déploiement a été fait par les API REST).
4. **App Check** (facultatif) : à activer plus tard avec reCAPTCHA v3 si des abus apparaissent ; non activé pour rester simple.

## 6.6 Checklist de sécurité

- [x] Aucun secret ni donnée réelle dans le dépôt (vérifié à chaque commit)
- [x] Règles Firestore strictes, testées (19 cas), déployées ; aucune suppression possible
- [x] Liste blanche `acces` écrite seulement en admin ; e-mail vérifié obligatoire
- [x] CSP + HSTS + frame-ancestors en en-têtes HTTP ; aucun script externe ; pas d'innerHTML de données
- [x] Données en centimes, validées côté client et côté règles
- [x] Message de confidentialité (aucun nom de patient) dans l'app
- [ ] Clé web restreinte par domaine (6.5-2)
- [ ] Secrets GitHub ajoutés (6.5-1)
- [ ] Compte de service : rôles de déploiement ajoutés (6.5-3)

## 7. Règles de travail

1. Lire ce README **avant** toute modification.
2. Mettre à jour ce README **après** chaque modification.
3. Ne jamais écrire dans le dépôt : secrets, tokens, clés, données personnelles ou financières réelles, le classeur source, ni le JSON de données 2026.
4. Avant toute écriture dans Firestore de production : export de sauvegarde, essai à blanc, confirmation.
5. Tous les taux et seuils vont dans les paramètres, avec source et date de vérification.
6. Avant chaque push : `npm test` et `npm run test:rules` au vert, et relire le diff (aucun secret, aucune donnée réelle).

## 8. Journal

| Date | Changement |
|---|---|
| 29/09/2026 | Analyse du classeur, état de l'infrastructure, anomalies et questions ouvertes. Aucun code. |
| 02/11/2026 | V1 : calcul + tests, règles + tests émulateur, interface complète, Firebase Hosting, workflows Tests / Déploiement / Sauvegarde. Application web Firebase enregistrée (`1:779757383089:web:d68582fc494978c62c6190`). |
| 02/11/2026 | Règles déployées, site publié (API REST : la CLI était refusée faute de droit Service Usage). Compte de Lisa créé, liste blanche `acces` (2 comptes). Restriction de clé impossible par le compte de service (API Keys non activée) : à faire à la main. Proxy de session : écriture des secrets GitHub interdite. |
| 02/11/2026 | Incident : chargement infini après connexion. Les règles refusaient les requêtes de **liste** (années, mois) car elles testaient l'identifiant du document. Corrigé (`allow get` avec contrôle d'identifiant / `allow list` sans), 2 tests ajoutés (21 au total). L'app affiche désormais une erreur au lieu de tourner. Cache service worker v3. |
| 02/11/2026 | Incident : chemin du SDK relatif à `js/` (404 en production, invisible en mode démo). Corrigé (`../vendor/…`), cache du service worker passé en v2. |
