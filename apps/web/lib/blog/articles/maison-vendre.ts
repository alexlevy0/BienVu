import {blogThirdBatchPublishedAt, type BlogArticle} from '../types';

export const houseVideoArticle: BlogArticle = {
  publishedAt: blogThirdBatchPublishedAt,
  slug: 'video-maison-a-vendre-scenario', title: 'Vidéo de maison à vendre : scénario et photos — BienVu',
  heading: 'Vidéo de maison à vendre : raconter les espaces en trente secondes',
  description: 'Préparez une vidéo de maison à vendre : façade, pièce de vie, chambres et jardin, avec un scénario de trente secondes et une sélection de photos.',
  excerpt: 'Une maison se comprend par ses espaces et leurs relations. Un exemple de séquence pour présenter l’intérieur et les extérieurs avec cohérence.',
  category: 'video', keyword: 'vidéo maison à vendre', image: 'sud',
  imageAlt: 'Maison avec terrasse et piscine illustrant un scénario de vidéo immobilière',
  intro: [
    'Une vidéo de maison à vendre doit aider à comprendre une propriété, pas seulement faire défiler ses plus belles photos. La façade situe le bien, la pièce de vie montre un usage et l’extérieur complète la lecture. L’ordre de ces images compte lorsque le spectateur ne connaît ni la maison ni son organisation.',
    'Pour préparer une version de trente secondes, choisissez d’abord ce que votre sélection peut montrer honnêtement. Le scénario ci-dessous sert de base de travail pour une vidéo réalisée à partir de photos. Il ne remplace ni une visite sur place ni les informations détaillées du mandat ; il crée une première découverte facile à poursuivre avec l’agence.',
  ],
  takeaways: ['Choisissez une ouverture qui identifie vraiment la maison.', 'Reliez intérieur et extérieur à partir des photos disponibles.', 'Gardez un contact final lisible et un message principal clair.'],
  sections: [
    {id: 'angle', title: 'Choisir l’angle de présentation du mandat', paragraphs: [
      'Déterminez le point d’entrée le plus fidèle au bien. Une maison familiale peut se présenter par les espaces de vie et les chambres. Une maison avec un extérieur particulièrement utile peut commencer par la relation entre terrasse et séjour. Une façade seule ne raconte pas nécessairement ce que le visiteur souhaite comprendre.',
      'Écrivez une phrase de travail avant de sélectionner les images : « montrer la pièce de vie et son accès extérieur », par exemple. Cette phrase ne doit pas inventer une circulation absente des photos. Elle sert à trier les vues et à éviter un mélange d’arguments qui ne tient plus dans la durée prévue.',
    ]},
    {id: 'photos', title: 'Réunir des vues complémentaires', paragraphs: [
      'Sélectionnez une vue d’ensemble de l’extérieur, des images lisibles du séjour et de la cuisine, une chambre représentative et un extérieur réellement inclus dans la proposition. Ajoutez un espace complémentaire seulement s’il joue un rôle dans la présentation. Deux angles très proches du même canapé apportent rarement deux informations utiles.',
      'Préparez également les éléments de contexte confirmés : ville, surface de la maison, nombre de pièces et caractéristiques des extérieurs. Distinguez bien surface habitable et terrain lorsque vous préparez les textes. Si une photo ne permet pas de montrer une information, ne comptez pas sur une animation pour la démontrer.',
    ]},
    {id: 'scenario', title: 'Construire une progression de trente secondes', paragraphs: [
      'Le découpage suivant est une proposition éditoriale. Il réserve assez de place à chaque famille d’images et se termine par une action simple. Vous pouvez changer l’ouverture ou retirer un espace si les photos ne sont pas assez représentatives. La durée finale de chaque passage dépendra aussi de la narration.',
      'En présence de niveaux différents, évitez une succession qui laisserait croire que toutes les pièces se suivent directement. Une courte indication ou une transition entre les espaces peut clarifier la progression. La vidéo doit donner un aperçu ordonné, sans transformer le montage en preuve d’un agencement que les images ne montrent pas.',
    ], table: {caption: 'Exemple de séquence pour une maison fictive', columns: ['Temps indicatif', 'Image ou espace', 'Rôle dans le récit'], rows: [
      ['0 à 5 s', 'Façade ou vue générale identifiable', 'Présenter la maison et sa localisation'],
      ['5 à 12 s', 'Séjour et pièce de vie', 'Montrer l’espace principal'],
      ['12 à 18 s', 'Cuisine ou espace complémentaire', 'Compléter les usages'],
      ['18 à 25 s', 'Chambre puis extérieur confirmé', 'Élargir la découverte'],
      ['25 à 30 s', 'Belle vue finale et contact', 'Inviter à obtenir la fiche ou une visite'],
    ]}},
    {id: 'exterieurs', title: 'Montrer les extérieurs avec précision', paragraphs: [
      'Un jardin, une terrasse et une piscine ne sont pas interchangeables dans les attentes d’un acquéreur. Montrez ce qui existe et vérifiez les libellés préparés à partir du dossier. Une vue prise depuis la maison ne permet pas à elle seule de déduire les limites d’un terrain ou le statut d’un espace voisin.',
      'Choisissez des photos cohérentes avec la saison et l’état du bien que vous proposez. Si vous utilisez des animations IA, observez particulièrement la végétation, les lignes de la terrasse et les bords du bassin. Revenez à un mouvement classique ou à un autre plan lorsque l’animation modifie un détail important.',
    ]},
    {id: 'narration', title: 'Écrire un texte qui relie les espaces', paragraphs: [
      'La voix off peut expliquer la progression plutôt que nommer chaque photo. Une phrase sur la pièce de vie, une autre sur les espaces complémentaires et une invitation à contacter l’agence suffisent parfois. Les dimensions et le montant peuvent être répartis entre le texte visible et la narration pour ne pas créer une liste difficile à écouter.',
      'Évitez les appréciations absolues qui ne peuvent pas être vérifiées, comme un calme garanti ou un jardin sans aucune contrainte. Parlez de ce que les images et le dossier permettent d’établir. Si vous mentionnez un accès, une dépendance ou un aménagement, contrôlez son statut avant de l’intégrer à la présentation.',
    ], examples: [{title: 'Trame de narration à compléter', text: 'À vendre à [ville], cette maison de [surface] mètres carrés. Découvrez la pièce de vie, puis [espace confirmé]. La visite se poursuit vers [extérieur réellement proposé]. Contactez [agence] pour recevoir les informations du mandat.', note: 'Les temps de séquence et cette trame sont des exemples, à ajuster à la durée de lecture.'}]},
    {id: 'creation', title: 'Préparer le montage dans BienVu', paragraphs: [
      'Importez l’annonce ou renseignez le dossier manuellement, puis sélectionnez les photos dans l’ordre retenu. Choisissez le format selon la destination. Dans Style, comparez une composition discrète avec une présentation plus graphique ; une photo de jardin ou de grande pièce ne demande pas toujours le même espace pour les textes.',
      'Lancez la création après avoir relu les faits et le coût affiché. Contrôlez le résultat sur téléphone, puis reprenez les cadrages ou le rythme dans l’éditeur si nécessaire. Conservez le lien vers la fiche ou la vitrine de l’agence dans votre diffusion pour que la découverte puisse se poursuivre facilement.',
    ]},
  ],
  faqs: [
    {question: 'Faut-il commencer la vidéo par la façade ?', answer: 'La façade peut identifier la maison, mais une pièce de vie ou une relation intérieur-extérieur peut constituer une meilleure ouverture. Choisissez une image représentative du bien et de l’angle de présentation retenu.'},
    {question: 'Combien de photos sélectionner pour trente secondes ?', answer: 'Il n’existe pas de nombre obligatoire. Choisissez assez de vues pour comprendre les espaces, tout en laissant le temps de les regarder. Retirez les doublons avant de raccourcir chaque passage.'},
    {question: 'Une animation IA peut-elle montrer l’agencement complet ?', answer: 'Elle met une photo en mouvement. Elle ne prouve pas les relations entre des espaces absents du cliché et ne remplace pas une visite ou un plan fiable du logement.'},
  ],
  related: ['video-appartement-a-vendre-agencement', 'video-immobilier-prestige', 'animation-photo-immobiliere-ia-fidelite'],
  links: [{path: '/', label: 'Créer la vidéo de votre maison à vendre'}, {path: '/animation-photo-immobiliere', label: 'Choisir les photos à animer'}, {path: '/editeur-video-immobilier', label: 'Ajuster les séquences dans l’éditeur'}],
};
