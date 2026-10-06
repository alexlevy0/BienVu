import type {BlogArticle} from '../types';

export const budgetArticle: BlogArticle = {
  slug: 'cout-video-immobiliere-budget-credits', title: 'Coût d’une vidéo immobilière : budget et crédits — BienVu',
  heading: 'Combien coûte une vidéo immobilière ? Budget, crédits et coût par mandat',
  description: 'Calculez le coût de vos vidéos immobilières avec BienVu : crédits vidéo, animations IA, abonnements, recharges et budget de communication par mandat.',
  excerpt: 'Des exemples de calcul pour choisir votre volume, prévoir les animations et suivre le budget réellement consacré à chaque bien.',
  category: 'budget', keyword: 'coût vidéo immobilière', image: 'sud', imageAlt: 'Maison avec piscine illustrant le budget vidéo d’un mandat',
  intro: [
    'Le coût d’une vidéo immobilière dépend de la manière de la produire. Un tournage, un montage à partir de photos et une vidéo avec animations IA mobilisent des ressources différentes. Pour un devis de prestation, comparez le périmètre : préparation, déplacement, prises de vue, montage, retouches, musique et formats livrés.',
    'Dans BienVu, le budget de génération se calcule en crédits. Vous pouvez prévoir le nombre de créations et les nouvelles photos animées avant de choisir une offre. Les calculs ci-dessous utilisent les tarifs affichés au 5 octobre 2026 ; consultez la page des offres avant un achat.',
  ],
  takeaways: ['Une nouvelle vidéo ou un nouvel export utilise un crédit, plus les nouvelles animations.', 'Comparez votre consommation prévue aux crédits réellement disponibles sur la période.', 'Ajoutez le temps de préparation et la diffusion au budget global du mandat.'],
  sections: [
    {id: 'bareme', title: 'Comprendre le coût en crédits d’une création', paragraphs: [
      'La formule de départ est simple : un crédit pour la nouvelle vidéo, plus un crédit par nouvelle photo animée par IA. Les zooms et les mouvements classiques sont inclus. Une vidéo avec quatre nouvelles animations représente donc cinq crédits.',
      'Une animation conservée peut être réutilisée pour la même photo au même format sans nouveau supplément d’animation. Le coût affiché avant le lancement reste le repère à vérifier. Télécharger ou publier une vidéo déjà produite ne demande pas un nouveau crédit de génération.',
    ], table: {caption: 'Exemples de coût pour une nouvelle vidéo', columns: ['Création', 'Crédit vidéo', 'Nouvelles animations', 'Total'], rows: [['Mouvements classiques', '1', '0', '1 crédit'], ['Une photo animée', '1', '1', '2 crédits'], ['Deux photos animées', '1', '2', '3 crédits'], ['Quatre photos animées', '1', '4', '5 crédits']]}},
    {id: 'offres', title: 'Comparer les volumes mensuels', paragraphs: [
      'L’offre gratuite d’un compte confirmé comprend trois crédits par mois. Plus propose quarante crédits pour dix-neuf euros hors taxes par mois ; Pro en propose cent vingt pour quarante-neuf euros hors taxes. Les crédits mensuels se renouvellent sans report.',
      'Le nombre de vidéos possibles dépend des options choisies. Quarante crédits couvrent quarante nouvelles vidéos avec les mouvements classiques, ou huit nouvelles vidéos de cinq crédits chacune. Ces deux usages consomment le même volume, mais produisent des montages différents.',
    ], table: {caption: 'Offres affichées au 5 octobre 2026', columns: ['Offre', 'Prix mensuel', 'Crédits mensuels'], rows: [['Gratuit', '0 €', '3'], ['Plus', '19 € HT', '40'], ['Pro', '49 € HT', '120']]}},
    {id: 'cout-unitaire', title: 'Distinguer coût théorique et utilisation réelle', paragraphs: [
      'En divisant le prix de Plus par ses quarante crédits, vous obtenez 0,475 € HT par crédit si tout le volume mensuel est utilisé. Une création de cinq crédits représente alors une allocation théorique de 2,375 € HT. Ce calcul répartit un abonnement ; il ne constitue pas le prix d’un achat unitaire.',
      'Si vous utilisez seulement dix crédits sur la période, les dix-neuf euros se répartissent sur ce volume réellement consommé. Le coût moyen devient différent. Pour comparer les offres, partez donc de votre activité prévisible et des crédits que vous utilisez effectivement.',
    ]},
    {id: 'recharges', title: 'Prévoir un besoin ponctuel avec une recharge', paragraphs: [
      'Les recharges complètent le solde sans changer l’abonnement. Les packs affichés comprennent dix crédits pour sept euros HT, trente pour dix-neuf euros HT et cent pour cinquante-neuf euros HT. Les recharges sont sans expiration ; les crédits mensuels sont utilisés en premier.',
      'Une recharge peut convenir à une série de nouveaux mandats ou à un projet demandant plusieurs animations. Un abonnement correspond davantage à un volume régulier. Comparez le nombre de crédits nécessaire et votre calendrier de consommation avant de choisir.',
    ], table: {caption: 'Prix des recharges et division par crédit', columns: ['Pack', 'Prix', 'Prix par crédit'], rows: [['10 crédits', '7 € HT', '0,70 € HT'], ['30 crédits', '19 € HT', 'Environ 0,63 € HT'], ['100 crédits', '59 € HT', '0,59 € HT']]}},
    {id: 'mandat', title: 'Calculer les crédits d’une campagne par mandat', paragraphs: [
      'Listez les créations réellement distinctes : une première vidéo, une autre version ou un nouveau format peuvent représenter plusieurs exports. Comptez ensuite les nouvelles animations nécessaires à chacun. Une animation disponible dans un format ne garantit pas sa réutilisation dans un autre.',
      'Prenons une première vidéo avec deux nouvelles photos animées : trois crédits. Une seconde version au même format réutilisant ces animations disponibles peut demander un crédit vidéo. La campagne représente alors quatre crédits dans cette hypothèse. Vérifiez le récapitulatif de chaque lancement, car les ressources disponibles déterminent la réutilisation.',
    ], examples: [{title: 'Votre feuille de calcul', text: 'Crédits prévus = nouveaux rendus vidéo + nouvelles animations nécessaires. Budget de communication du mandat = part du coût des outils + temps de préparation + dépenses de diffusion + éventuelles prestations extérieures.', note: 'Méthode de calcul : complétez-la avec vos montants réels et sans mélanger des bases HT et TTC.'}]},
    {id: 'temps', title: 'Ajouter le temps et les dépenses de diffusion', paragraphs: [
      'Le coût des crédits est une partie du budget. Ajoutez la préparation des photos, la relecture, les retouches et le suivi des demandes. Si vous diffusez une publicité payante, consignez également cette dépense ; la publication intégrée ne crée pas à elle seule une campagne publicitaire.',
      'Pour évaluer la méthode, comparez des périodes et des biens comparables. Un mandat très demandé peut recevoir des contacts indépendamment du montage. Documenter les dépenses et la source des demandes donne un repère plus utile que d’attribuer automatiquement chaque contact à la vidéo.',
    ]},
    {id: 'resultats', title: 'Relier le budget aux demandes obtenues', paragraphs: [
      'Vous pouvez calculer un coût par demande qualifiée en divisant le budget de la campagne par les demandes que vous lui attribuez. Définissez d’abord ce que vous comptez : demande de fiche, échange pertinent ou visite. Gardez la même définition pour comparer les résultats.',
      'Si vous n’avez aucune demande attribuable, indiquez-le et analysez le parcours : diffusion, clarté du message, prix et conditions du mandat. Une vente ne se résume pas à la vidéo. Le suivi sert à améliorer vos décisions de production et de diffusion avec des données réellement observées.',
    ]},
    {id: 'essai', title: 'Commencer avec l’essai offert', paragraphs: [
      'Un visiteur sans compte dispose d’un crédit d’essai pour une vidéo avec les mouvements classiques et un aperçu filigrané. Après connexion, la récupération de cette vidéo permet son téléchargement sans filigrane et ne décompte pas les crédits mensuels.',
      'Un compte confirmé reçoit ensuite trois crédits gratuits par mois, utilisables aussi pour de nouvelles animations. Ce premier volume permet d’évaluer vos informations, vos photos et le résultat avant de prévoir une production régulière pour l’agence.',
    ]},
  ],
  faqs: [{question: 'Publier une vidéo déjà créée consomme-t-il des crédits ?', answer: 'Télécharger et publier une vidéo déjà produite ne consomme pas de crédit supplémentaire. Une nouvelle génération ou un nouvel export doit être vérifié dans son récapitulatif.'}, {question: 'Que se passe-t-il si la génération échoue ?', answer: 'Le crédit vidéo est restitué si l’export échoue. Les suppléments d’animations échouées sont restitués ; les animations réussies restent débitées, conservées et réutilisables selon leur disponibilité.'}],
  related: ['animation-photo-immobiliere-ia-fidelite', 'un-mandat-sept-contenus-immobiliers', 'marketing-immobilier-ia-agence'],
  links: [{path: '/abonnement', label: 'Consulter les prix et l’estimateur actuels'}, {path: '/guides/creer-video-immobiliere-gratuite', label: 'Préparer votre première vidéo gratuite'}],
};
