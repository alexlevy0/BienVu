import { blogThirdBatchPublishedAt, type BlogArticle } from '../types';

export const avatarRealEstateArticle: BlogArticle = {
  publishedAt: blogThirdBatchPublishedAt,
  slug: 'avatar-ia-video-immobiliere',
  title: 'Avatar IA immobilier : choisir son présentateur — BienVu',
  heading: 'Avatar IA pour une vidéo immobilière : choisir le visage et la bonne place',
  description:
    'Choisissez un avatar IA pour présenter vos biens : apparence, médaillon ou silhouette, placement, narration et contrôles avant publication.',
  excerpt:
    'Un présentateur peut guider la découverte d’un logement. Voici comment l’intégrer sans masquer les photos ni surcharger votre vidéo.',
  category: 'video',
  keyword: 'avatar IA immobilier',
  image: 'paris',
  imageAlt: 'Appartement parisien illustrant le décor à laisser visible derrière un avatar',
  intro: [
    'Un avatar IA immobilier est un présentateur numérique qui accompagne la narration d’une vidéo de bien. Il permet de préparer une présentation incarnée sans demander à un collaborateur de se filmer à chaque nouveau mandat. Son intérêt dépend cependant du rôle que vous lui donnez : introduire le logement, expliquer un espace ou conclure par une invitation à contacter l’agence.',
    'Le choix du visage ne suffit donc pas. Il faut aussi penser au cadrage, à la place du texte et au temps pendant lequel le présentateur reste visible. Dans une vidéo immobilière, le spectateur doit pouvoir regarder le bien. L’avatar apporte un repère humain ; les photos restent la matière principale de la présentation.',
  ],
  takeaways: [
    'Choisissez une apparence cohérente avec le ton de votre agence.',
    'Adaptez la taille du présentateur aux détails importants de chaque plan.',
    'Vérifiez ensemble le visage, les textes et la voix dans le résultat.',
  ],
  sections: [
    {
      id: 'role',
      title: 'Définir ce que le présentateur doit apporter',
      paragraphs: [
        'Commencez par décider si l’avatar est utile pour ce mandat. Une introduction peut situer le bien et une conclusion peut rappeler le contact. Une présence sur toute la vidéo convient à une narration plus accompagnée, à condition de conserver assez de place pour les pièces et leurs caractéristiques.',
        'Une version sans avatar reste pertinente pour une présentation qui donne la priorité aux images. Comparez les deux approches sur un même dossier plutôt que de supposer qu’un visage améliore toujours les échanges. Regardez ensuite les retours concrets : questions posées sur le bien, compréhension de la présentation et qualité des contacts.',
      ],
    },
    {
      id: 'apparence',
      title: 'Choisir un groupe d’avatars, puis une déclinaison',
      paragraphs: [
        'Dans le catalogue BienVu, les apparences d’un même présentateur sont regroupées. Vous pouvez choisir un visage puis regarder ses déclinaisons pour trouver une tenue et une attitude adaptées à votre communication. Une agence qui recherche une présentation sobre ne retiendra pas nécessairement la même apparence qu’une équipe au ton plus décontracté.',
        'Évaluez la démonstration en mouvement, pas uniquement la miniature. Observez la posture, les gestes et la place occupée à l’écran. Lorsque vous avez trouvé une apparence qui fonctionne, les favoris permettent de la retrouver plus facilement pour les prochains mandats et de conserver une certaine continuité dans vos vidéos.',
      ],
    },
    {
      id: 'presentation',
      title: 'Médaillon ou silhouette : choisir selon les images',
      paragraphs: [
        'Le médaillon rassemble le présentateur dans une zone compacte. Il convient lorsque vous voulez garder une présence identifiable tout en laissant lire une photo chargée en détails. Sa forme demande néanmoins de réserver une place qui ne recouvre ni un équipement important, ni une information affichée.',
        'La silhouette sans fond, lorsqu’elle est compatible avec l’avatar choisi, donne une présence plus intégrée à l’image. Elle occupe souvent davantage de surface et nécessite un contrôle du bas du cadre. Évitez de la poser sur un élément qui aide à comprendre la pièce, comme une porte ou une circulation.',
      ],
      table: {
        caption: 'Repères pour choisir une présentation d’avatar',
        columns: ['Choix', 'Intérêt dans la vidéo', 'Point de contrôle'],
        rows: [
          [
            'Médaillon',
            'Présence compacte et facilement identifiable',
            'Ne pas couvrir les textes ni un détail du logement',
          ],
          [
            'Silhouette compatible',
            'Présentateur intégré au décor',
            'Vérifier le cadrage et la place au bas de l’image',
          ],
          ['Introduction et conclusion', 'Accompagner le début et le contact', 'Contrôler les changements de présence'],
          ['Toute la vidéo', 'Guider l’ensemble de la narration', 'Garder les espaces visibles dans chaque plan'],
        ],
      },
    },
    {
      id: 'placement',
      title: 'Régler la taille en regardant le bien',
      paragraphs: [
        'Réglez le présentateur à partir des photos réellement sélectionnées. Une position basse peut libérer le haut de l’image, mais masquer un meuble ou une information de surface. Une taille qui fonctionne sur une grande vue extérieure peut être trop importante dans une petite cuisine. Faites défiler les plans de l’aperçu avant de valider.',
        'Regardez également le résultat dans le format final. Une version verticale possède moins de largeur disponible pour juxtaposer le texte et le visage. Évitez de résoudre une collision en réduisant le texte jusqu’à le rendre illisible : déplacez le présentateur, diminuez sa présence ou simplifiez les informations affichées.',
      ],
    },
    {
      id: 'texte',
      title: 'Écrire une narration adaptée à une présentation incarnée',
      paragraphs: [
        'Un présentateur gagne à employer des phrases courtes et précises. Situez le bien, présentez un ou deux éléments vérifiés, puis indiquez la prochaine étape. Écartez les formulations qui donnent l’impression que l’avatar a personnellement visité le logement ou représente un conseiller réel de votre agence si ce n’est pas le cas.',
        'La voix et l’apparence doivent servir le même ton. Une présentation calme de pièces lumineuses n’exige pas une succession de slogans. Écoutez aussi les nombres et les noms de lieux, puis vérifiez que la musique reste assez basse pour laisser comprendre les phrases sur un téléphone.',
      ],
      examples: [
        {
          title: 'Introduction à adapter à un bien réel',
          text: 'Découvrez cet appartement à [ville]. La visite commence dans [pièce visible], puis se poursuit vers [espace confirmé]. Retrouvez les informations du bien auprès de [agence].',
          note: 'Utilisez uniquement les espaces et les caractéristiques présents dans votre dossier.',
        },
      ],
    },
    {
      id: 'controle',
      title: 'Valider l’ensemble avant la diffusion',
      paragraphs: [
        'Dans Personnaliser, ouvrez Avatar IA, choisissez le groupe et l’apparence, puis vérifiez la présentation disponible. Contrôlez le coût indiqué avant de lancer la création, car la durée de présence du présentateur influence le supplément. Conservez les mêmes réglages lorsque vous comparez deux apparences pour que votre essai reste lisible.',
        'À la lecture finale, observez le visage, les limites de la silhouette et les rapports avec les textes. Vérifiez que le contact final reste visible et que la présence du présentateur ne gêne pas la compréhension d’un plan animé. Une option utile sur un mandat peut être superflue sur un autre : gardez une approche éditoriale.',
      ],
    },
  ],
  faqs: [
    {
      question: 'Tous les avatars peuvent-ils être affichés sans fond ?',
      answer:
        'Non. La silhouette sans fond dépend de la compatibilité de l’apparence choisie. Vérifiez les options disponibles dans la personnalisation plutôt que de supposer que toutes les déclinaisons possèdent les mêmes possibilités.',
    },
    {
      question: 'Peut-on garder le même avatar pour toute une agence ?',
      answer:
        'Vous pouvez retrouver vos apparences favorites pour vos créations. Choisissez une référence visuelle et un ton communs, puis contrôlez le placement sur chaque nouveau bien.',
    },
    {
      question: 'Un avatar remplace-t-il la relation avec un conseiller ?',
      answer:
        'Il présente des informations dans une vidéo. Les échanges, les réponses aux questions et les visites restent assurés par les professionnels de l’agence. Indiquez une manière claire de les contacter.',
    },
  ],
  related: [
    'voix-off-immobiliere-exemples-textes',
    'video-immobiliere-rendez-vous-vendeur-mandat',
    'format-video-immobiliere-vertical-horizontal',
  ],
  links: [
    { path: '/avatar', label: 'Découvrir les avatars proposés' },
    { path: '/', label: 'Personnaliser le présentateur de votre vidéo' },
    { path: '/abonnement', label: 'Consulter les offres et les crédits' },
  ],
};
