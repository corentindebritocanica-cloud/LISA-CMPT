// config.js — Configuration WEB publique de Firebase (ce n'est pas un secret :
// la sécurité repose sur la connexion + les règles Firestore + la restriction de la clé par domaine).
// Rempli au déploiement depuis l'application web enregistrée dans le projet lisa-compta.
export const CONFIG = {
  nomApp: 'Compta Lisa',
  firebase: {
    apiKey: 'AIzaSyCxVWaycweLLY6mAtSq9xsskSnZzl2T8Kg',
    authDomain: 'lisa-compta.firebaseapp.com',
    projectId: 'lisa-compta',
    messagingSenderId: '779757383089',
    appId: '1:779757383089:web:d68582fc494978c62c6190',
  },
};
