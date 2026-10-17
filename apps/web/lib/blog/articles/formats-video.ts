import {blogThirdBatchPublishedAt, type BlogArticle} from '../types';

export const videoFormatsArticle: BlogArticle = {
  publishedAt: blogThirdBatchPublishedAt,
  slug: 'format-video-immobiliere-vertical-horizontal', title: 'Format vidéo immobilier : vertical ou horizontal ? — BienVu',
  heading: 'Quel format choisir pour une vidéo immobilière : 9:16 ou 16:9 ?',
  description: 'Comparez les formats vidéo immobiliers vertical 9:16 et horizontal 16:9 : destination, cadrage des photos, textes et méthode pour préparer deux versions.',
  excerpt: 'Le bon format dépend de l’écran et du parcours de diffusion. Une méthode pour choisir votre cadrage avant de commencer le montage.',
  category: 'video', keyword: 'format vidéo immobilière', image: 'bordeaux',
  imageAlt: 'Pièce de vie bordelaise à cadrer dans une vidéo verticale ou horizontale',
  intro: [
    'Le format d’une vidéo immobilière désigne la proportion entre sa largeur et sa hauteur. En 9:16, l’image est verticale ; en 16:9, elle est horizontale. Ce choix modifie la place disponible pour les pièces, les titres et un éventuel présentateur. Il mérite donc d’être décidé avant la sélection finale des photos.',
    'Il n’existe pas de format universellement meilleur pour tous les mandats. Une découverte sur téléphone et une présentation sur un grand écran ne mettent pas en valeur les mêmes cadrages. L’objectif est de rendre le logement compréhensible dans son contexte de diffusion, puis de préparer une seconde version si elle répond à un usage réel.',
  ],
  takeaways: ['Choisissez la destination principale avant de recadrer les photos.', 'Vérifiez les portes, ouvertures et circulations dans chaque format.', 'Une seconde version demande une relecture des textes et des plans.'],
  sections: [
    {id: 'proportions', title: 'Comprendre ce que changent les proportions', paragraphs: [
      'Une image verticale réserve davantage de hauteur à un sujet et dispose de moins de largeur pour une grande pièce. Une image horizontale laisse plus de place aux lignes latérales, à une façade ou à la relation entre cuisine et séjour. Le même cliché peut donc raconter deux choses différentes selon la zone conservée.',
      'La résolution et les proportions sont deux notions distinctes. Une image peut être grande tout en ayant le mauvais cadrage pour votre montage. Avant de chercher une résolution plus élevée, vérifiez que la photo d’origine contient les éléments nécessaires autour de la zone que vous souhaitez montrer.',
    ], table: {caption: 'Choisir un format selon la présentation attendue', columns: ['Question', 'Vertical 9:16', 'Horizontal 16:9'], rows: [
      ['Écran principal', 'Découverte sur téléphone tenu verticalement', 'Site, écran large ou présentation sur ordinateur'],
      ['Photo large', 'Choisir un point de cadrage précis', 'Conserver plus facilement les relations latérales'],
      ['Texte et avatar', 'Réserver une place compacte', 'Répartir les éléments sur une largeur plus importante'],
      ['Contrôle final', 'Observer les informations proches des bords', 'Vérifier la lisibilité sur un petit écran'],
    ]}},
    {id: 'destination', title: 'Partir du parcours de diffusion', paragraphs: [
      'Si le premier usage est une découverte verticale sur les réseaux, préparez d’abord le 9:16. Si vous présentez le bien sur le site de l’agence ou dans un rendez-vous sur ordinateur, regardez ce qu’apporte le 16:9. Vérifiez toujours l’aperçu de publication de la destination choisie : les interfaces peuvent recouvrir une partie du contenu.',
      'Le format seul ne décide pas de la qualité de la présentation. Une vidéo verticale bien choisie peut servir dans une page d’agence, et une vidéo horizontale peut être pertinente dans un échange client. Cherchez le cadrage qui convient à cet usage plutôt qu’un automatisme identique pour tous les canaux.',
    ]},
    {id: 'photos', title: 'Contrôler les photos avant de générer', paragraphs: [
      'Prenez une photo large du séjour et regardez sa zone utile dans les deux formats. Le vertical conserve-t-il une fenêtre et une partie suffisante de la pièce ? L’horizontal donne-t-il assez de présence à un détail important ? Si une information disparaît, choisissez une autre photo ou déplacez le cadrage lorsque l’éditeur le permet.',
      'Une succession de recadrages serrés peut rendre l’organisation du bien difficile à comprendre. Gardez au moins des vues qui situent les espaces avant les détails. Pour une maison, la façade et le jardin demandent parfois d’autres photos que celles retenues pour une présentation centrée sur les pièces intérieures.',
    ]},
    {id: 'elements', title: 'Prévoir la place des textes et de l’avatar', paragraphs: [
      'Les titres ne doivent pas rester collés au même bord parce qu’ils fonctionnaient dans un autre format. Regardez leur longueur, leurs retours à la ligne et leur contraste. Le contact final doit rester lisible sans demander au spectateur de mettre la vidéo en pause pour déchiffrer une information essentielle.',
      'Si un avatar accompagne la voix off, vérifiez sa taille et son emplacement sur plusieurs plans. Une disposition acceptable dans le cadre horizontal peut masquer une part importante de la pièce en vertical. Simplifiez le nombre d’éléments simultanés avant de réduire indéfiniment les caractères ou le présentateur.',
    ]},
    {id: 'deux-versions', title: 'Préparer deux versions sans perdre la cohérence', paragraphs: [
      'Conservez le même dossier de faits et le même message principal pour vos variantes. Changez les photos ou leur cadrage lorsqu’ils ne transmettent plus la bonne information. Vous pouvez garder une continuité de couleurs, de voix et de ton, sans exiger que les deux montages aient exactement la même disposition.',
      'Nommez les exports avec le bien et la destination, puis vérifiez le coût affiché pour chaque nouvelle création. Dans BienVu, le format fait partie des choix de génération. Ne supposez pas qu’une animation disponible pour une photo dans un format pourra être réutilisée sans modification dans un autre : contrôlez les éléments proposés et le total avant lancement.',
    ], examples: [{title: 'Deux destinations, un même bien fictif', text: 'Version verticale : une ouverture sur la pièce de vie et trois plans centrés sur les usages. Version horizontale : une vue plus large de cette pièce et des transitions qui montrent davantage la relation avec les espaces voisins.', note: 'Il s’agit d’un principe de montage à adapter aux photos disponibles, pas d’une conversion automatique.'}]},
    {id: 'lecture', title: 'Terminer par une lecture sur l’écran visé', paragraphs: [
      'Regardez la version mobile sur un téléphone et la version de présentation sur l’écran prévu. Une miniature dans un outil de montage ne suffit pas à juger la taille réelle des textes. Vérifiez aussi que l’ouverture et la conclusion restent compréhensibles lorsque la vidéo est regardée sans le son.',
      'Conservez une petite liste de contrôle commune aux deux variantes : bon bien, informations exactes, cadrages utiles, voix claire et contact visible. Si une destination produit régulièrement des questions sur un détail coupé, faites évoluer la sélection des photos de cette version au prochain mandat.',
    ]},
  ],
  faqs: [
    {question: 'Le format vertical améliore-t-il automatiquement les résultats ?', answer: 'Non. Il peut correspondre à un usage sur téléphone, mais le choix des plans, le message et la destination comptent aussi. Comparez les retours obtenus dans un contexte précis plutôt que les seules proportions.'},
    {question: 'Peut-on utiliser les mêmes photos en 9:16 et en 16:9 ?', answer: 'Oui, si leurs recadrages restent utiles. Certaines photos larges perdent un passage ou une partie importante du logement en vertical. Vérifiez chaque plan et remplacez ceux qui deviennent difficiles à comprendre.'},
    {question: 'Faut-il systématiquement produire les deux formats ?', answer: 'Préparez les versions dont vous avez réellement besoin pour votre diffusion. Une seconde destination peut justifier un autre montage, mais elle demande une vérification et un budget de création propres.'},
  ],
  related: ['transformer-annonce-immobiliere-video-lien', 'reel-immobilier-instagram-scripts', 'video-immobiliere-photos-duree-montage'],
  links: [{path: '/video-immobiliere-ia', label: 'Découvrir les formats proposés par BienVu'}, {path: '/editeur-video-immobilier', label: 'Revoir les cadrages de votre montage'}, {path: '/publication-reseaux-sociaux-immobilier', label: 'Préparer la diffusion sur vos réseaux'}],
};
