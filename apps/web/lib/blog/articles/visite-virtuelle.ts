import { blogThirdBatchPublishedAt, type BlogArticle } from '../types';

export const virtualTourArticle: BlogArticle = {
  publishedAt: blogThirdBatchPublishedAt,
  slug: 'video-immobiliere-visite-virtuelle-differences',
  title: 'Vidéo immobilière ou visite virtuelle : différences — BienVu',
  heading: 'Vidéo immobilière ou visite virtuelle : quel usage pour votre mandat ?',
  description:
    'Comparez vidéo immobilière, montage de photos et visite virtuelle interactive : expérience du visiteur, préparation, diffusion et complémentarité.',
  excerpt:
    'Une vidéo guide le regard ; une visite virtuelle laisse davantage explorer. Comprendre ces expériences aide à choisir les contenus utiles à votre mandat.',
  category: 'strategie',
  keyword: 'vidéo immobilière ou visite virtuelle',
  image: 'bordeaux',
  imageAlt: 'Pièce de vie avec plusieurs espaces à présenter en vidéo ou à explorer en visite virtuelle',
  intro: [
    'Les expressions vidéo immobilière et visite virtuelle sont parfois utilisées pour désigner des contenus très différents. Une vidéo déroule des plans dans un ordre choisi. Une visite virtuelle interactive permet au visiteur de regarder et de naviguer à partir de points ou d’espaces proposés. Cette différence change la préparation et le rôle du contenu dans votre communication.',
    'Avant de choisir, définissez ce que vous souhaitez permettre : donner envie de découvrir un bien, expliquer des espaces ou laisser une personne explorer plus librement avant un échange. Les formats peuvent se compléter. Le bon choix dépend de votre dossier, des médias disponibles et de l’usage attendu, plutôt que d’une opposition systématique entre les outils.',
  ],
  takeaways: [
    'Distinguez lecture guidée et exploration interactive.',
    'Une photo animée ne reconstitue pas une visite réelle du logement.',
    'Préparez le contenu selon la question à laquelle il doit répondre.',
  ],
  sections: [
    {
      id: 'experiences',
      title: 'Comparer ce que le visiteur peut réellement faire',
      paragraphs: [
        'Dans une vidéo, le spectateur suit une progression définie par le montage. Il peut généralement lancer, mettre en pause ou revenir en arrière, mais il ne choisit pas un nouveau point de vue dans la pièce. Le créateur décide des espaces présentés, de leur ordre et de la place de la narration.',
        'Dans une visite interactive, la personne explore les vues que le dispositif lui rend accessibles. Selon la réalisation, elle peut se déplacer entre des points, faire tourner une vue ou consulter des informations. Ne supposez pas que toutes les visites virtuelles proposent les mêmes fonctions : regardez l’expérience effectivement livrée.',
      ],
      table: {
        caption: 'Comparer les usages plutôt que les seules étiquettes',
        columns: ['Critère', 'Vidéo immobilière', 'Visite virtuelle interactive'],
        rows: [
          ['Progression', 'Ordre choisi au montage', 'Exploration dans les possibilités proposées'],
          ['Point de vue', 'Plans prévus dans le fichier', 'Vues consultables selon le dispositif'],
          ['Narration', 'Texte, voix ou présentateur intégrés', 'Informations selon la réalisation'],
          ['Usage possible', 'Découverte guidée et partage', 'Examen plus libre des espaces disponibles'],
        ],
      },
    },
    {
      id: 'photos',
      title: 'Situer le montage réalisé à partir de photos',
      paragraphs: [
        'Un montage de photos compose une vidéo à partir d’images fixes. Les transitions, les zooms et les mouvements peuvent créer une présentation fluide. Il reste toutefois limité aux informations que ces photos et le dossier permettent de montrer. Il ne devient pas une visite interactive parce que les images bougent.',
        'Une animation IA ajoute un mouvement généré à une photo. Elle peut apporter une dynamique, mais elle ne prouve pas un déplacement réel dans le logement et ne mesure pas ses espaces. Évitez donc de présenter ce résultat comme une reconstitution exacte ou comme un accès à tous les points de vue du bien.',
      ],
    },
    {
      id: 'objectifs',
      title: 'Choisir selon la première question du public',
      paragraphs: [
        'Pour une personne qui découvre une annonce sur téléphone, une vidéo courte peut proposer une entrée simple : localisation, pièce de vie et un ou deux atouts vérifiés. Pour quelqu’un qui souhaite examiner davantage les espaces avant de vous appeler, une exploration interactive peut répondre à un autre besoin si vous disposez des médias adaptés.',
        'Une vidéo tournée sur place peut également montrer des relations et des déplacements réellement captés. Elle représente encore une autre façon de documenter le bien. Choisissez le contenu qui répond à la question posée plutôt que d’attribuer toutes ces possibilités à un seul fichier vidéo.',
      ],
    },
    {
      id: 'preparation',
      title: 'Comparer la préparation et les livrables',
      paragraphs: [
        'Pour un montage à partir de photos, rassemblez les images utilisables, les faits, les coordonnées et les textes de référence. Préparez ensuite le cadrage et le rythme. Pour une visite interactive, clarifiez les vues à produire, les espaces accessibles et la manière dont l’expérience sera consultée par le public.',
        'Si vous comparez des prestations, demandez précisément ce qui est livré : fichier téléchargeable, page de consultation, possibilités de mise à jour et modalités de partage. Les périmètres étant différents, un prix isolé n’explique pas la valeur ni les contraintes d’un contenu. Listez vos usages avant de comparer les propositions.',
      ],
    },
    {
      id: 'complementarite',
      title: 'Construire un parcours avec plusieurs contenus',
      paragraphs: [
        'Vous pouvez utiliser une vidéo pour une première découverte et orienter ensuite vers la fiche détaillée ou une visite interactive disponible. Donnez à chaque étape une fonction claire. La personne ne doit pas devoir ouvrir plusieurs contenus identiques pour retrouver une information essentielle ou un contact.',
        'Gardez les faits cohérents entre les versions. Une surface, un montant ou une disponibilité modifiés doivent être contrôlés sur les différentes destinations. Notez où les contenus sont diffusés et qui peut les actualiser ; leur complémentarité devient moins utile lorsqu’ils racontent des états différents du même mandat.',
      ],
      examples: [
        {
          title: 'Parcours possible pour un bien fictif',
          text: 'Une courte vidéo présente le séjour et les atouts principaux. La fiche du bien rassemble les informations détaillées et, si elle existe, une visite interactive. Un contact permet ensuite de poser une question ou d’organiser une visite sur place.',
          note: 'Les médias et les destinations dépendent de ce que votre agence a réellement préparé pour ce mandat.',
        },
      ],
    },
    {
      id: 'bienvu',
      title: 'Utiliser BienVu pour la partie vidéo du parcours',
      paragraphs: [
        'BienVu permet de créer une vidéo à partir d’une annonce ou de vos photos, avec une voix off, des textes et des options de présentation. Vous pouvez choisir les images, préparer leur ordre, ajouter un avatar ou sélectionner des animations IA, puis vérifier le montage avant sa diffusion.',
        'Ce parcours produit une présentation vidéo : il ne transforme pas automatiquement vos photos en visite interactive à 360 degrés. Pour l’utiliser utilement, préparez une prochaine étape visible, comme la fiche du bien ou votre vitrine d’agence. La vidéo et les informations détaillées se renforcent lorsqu’elles restent faciles à relier.',
      ],
    },
  ],
  faqs: [
    {
      question: 'Une vidéo avec des photos animées est-elle une visite virtuelle à 360 degrés ?',
      answer:
        'Non. Le spectateur suit les plans du montage et ne choisit pas librement son point de vue. Une animation IA ne reconstitue pas automatiquement la géométrie complète d’une pièce ni les circulations du logement.',
    },
    {
      question: 'Faut-il choisir un seul format pour toute son agence ?',
      answer:
        'Votre méthode peut rester cohérente tout en adaptant les contenus au mandat. Une découverte courte, un tournage et une exploration interactive ne répondent pas exactement aux mêmes questions.',
    },
    {
      question: 'Ces contenus remplacent-ils une visite du bien ?',
      answer:
        'Ils peuvent préparer la découverte et les échanges, mais chacun possède des limites. Les questions sur les espaces et les caractéristiques doivent être complétées avec le dossier et, lorsque nécessaire, une visite sur place.',
    },
  ],
  related: [
    'video-appartement-a-vendre-agencement',
    'animation-photo-immobiliere-ia-fidelite',
    'transformer-annonce-immobiliere-video-lien',
  ],
  links: [
    { path: '/video-immobiliere-ia', label: 'Comprendre la création vidéo dans BienVu' },
    { path: '/animation-photo-immobiliere', label: 'Voir le rôle des animations IA' },
    { path: '/ma-vitrine/exemple', label: 'Découvrir une destination pour vos vidéos' },
  ],
};
