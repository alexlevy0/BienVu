// Sources réelles fixes, sélectionnées par l'opérateur. Jamais une URL fournie par un client.
const agency={url:'https://www.espaces-atypiques.com/ventes/75015-paris-appartement-bourgeois-avec-vue-panoramique-16624/',hosts:['www.espaces-atypiques.com','espaces-atypiques.com']} as const;
// URL effectivement extraite lors du contrôle distant, pour isoler un échec de transfert.
export const diagnosticPhoto='https://www.espaces-atypiques.com/wp-content/uploads/149294/16624/149294-16624-60683113a.jpg';
export const cases={
  figaro:{url:'https://immobilier.lefigaro.fr/annonces/annonce-108944355.html',hosts:['immobilier.lefigaro.fr','proprietes.lefigaro.fr','i.f1g.fr','static.f1g.fr']},
  // Lien trouvé sur le site de l'agence le 27/09/2026. Ce repérage web ne valide pas Browser Run.
  agency,
  // Une seule contre-vérification après l'échec de galerie du 27/09/2026.
  // Réservation distincte : l'échec initial reste conservé et compté.
  'agency-gallery-check':agency,
  // Contrôle borné : galerie HTML, sans charger les ressources auxiliaires.
  'agency-static-check':agency,
  // Correction du timeout d'inactivité constaté dans l'historique fournisseur.
  'agency-keepalive-check':agency,
} as const;
