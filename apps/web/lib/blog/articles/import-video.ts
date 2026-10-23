import { blogThirdBatchPublishedAt, type BlogArticle } from '../types';

export const importVideoArticle: BlogArticle = {
  publishedAt: blogThirdBatchPublishedAt,
  slug: 'transformer-annonce-immobiliere-video-lien',
  title: 'Transformer une annonce immobilière en vidéo — BienVu',
  heading: 'Transformer une annonce immobilière en vidéo à partir de son lien',
  description:
    'Du lien d’annonce à la vidéo immobilière : import des photos, sélection des plans, voix off et vérifications avant de partager votre création.',
  excerpt:
    'Un parcours concret pour passer d’une annonce existante à une vidéo cohérente, sans recopier tout le dossier ni organiser un tournage.',
  category: 'video',
  keyword: 'transformer annonce immobilière en vidéo',
  image: 'lyon',
  imageAlt: 'Séjour lumineux illustrant une annonce à transformer en vidéo',
  intro: [
    'Transformer une annonce immobilière en vidéo consiste à réutiliser ses informations et ses photos pour construire une présentation animée. Le lien sert de point de départ : il permet de récupérer le dossier disponible sur une source compatible. La sélection des images, le texte et le format déterminent ensuite ce que le spectateur comprendra du bien.',
    'Cette méthode convient à une agence qui possède déjà de bonnes photos et souhaite créer une première présentation sans tournage supplémentaire. Voici le parcours à suivre dans BienVu, depuis le choix du lien jusqu’au contrôle du résultat. L’exemple reste volontairement simple : un bien, une idée principale et une destination de diffusion.',
  ],
  takeaways: [
    'Utilisez le lien direct d’un bien, puis vérifiez les données récupérées.',
    'Choisissez les photos utiles au récit plutôt que toute la galerie.',
    'Contrôlez la narration et le cadrage dans le format de diffusion.',
  ],
  sections: [
    {
      id: 'bon-lien',
      title: 'Partir du lien direct de l’annonce',
      paragraphs: [
        'Ouvrez la page du bien qui vous intéresse, puis copiez son adresse complète. Une page de résultats, le site général d’une agence ou un espace qui nécessite une connexion ne présentent pas les mêmes informations qu’une fiche d’annonce. Vérifiez également que vous utilisez la bonne transaction et la version actualisée du bien.',
        'Dans BienVu, collez ce lien dans le champ de création. La page Sources permet de consulter les imports testés. Si la récupération échoue, vous pouvez compléter le dossier manuellement et ajouter vos photos. Préparez alors le même ensemble de références : localisation, surface, pièces, description et coordonnées utiles.',
      ],
    },
    {
      id: 'verification',
      title: 'Relire les informations avant de choisir le montage',
      paragraphs: [
        'Comparez les données importées à votre dossier de mandat. Contrôlez en priorité la commune, la transaction, la surface et le montant. Si deux chiffres présents dans la source se contredisent, revenez à la pièce de référence ; un montage ne doit pas choisir un chiffre simplement parce qu’il paraît plus avantageux.',
        'Faites la même vérification pour les arguments descriptifs. Un jardin commun ne devient pas un jardin privatif, une rénovation possible ne devient pas un équipement existant. Corrigez les informations dans le dossier avant de travailler la voix off. Vous évitez ainsi de reprendre séparément les textes affichés et la narration.',
      ],
      table: {
        caption: 'Contrôles utiles après un import',
        columns: ['Élément', 'Vérification', 'Action si nécessaire'],
        rows: [
          ['Ville', 'Commune du bien et non adresse de l’agence', 'Confirmer la localisation'],
          ['Surface', 'Valeur exacte et unité', 'Reprendre le dossier du mandat'],
          ['Photos', 'Images du bon bien, récentes et utilisables', 'Retirer les images étrangères au logement'],
          ['Description', 'Atouts et réserves fidèles à la source', 'Corriger avant de générer'],
        ],
      },
    },
    {
      id: 'selection',
      title: 'Sélectionner les photos qui font comprendre le bien',
      paragraphs: [
        'Ouvrez Personnaliser, puis l’onglet Photos. La galerie récupérée permet de choisir les images à utiliser, dans la limite proposée pour la vidéo. Les premières photos présélectionnées constituent un point de départ : remplacez les doublons, les détails secondaires et les vues trop proches par des images qui apportent une information différente.',
        'Pour un appartement, vous pourriez retenir une vue générale du séjour, une autre pièce de vie, une chambre et l’extérieur réellement associé au logement. Pour une maison, la relation entre façade, séjour et jardin peut être plus importante. Regardez l’ensemble comme une suite : chaque nouvelle photo doit compléter la précédente.',
      ],
    },
    {
      id: 'format',
      title: 'Choisir la durée et le format selon la destination',
      paragraphs: [
        'Prévoyez une destination principale avant le montage. Une vidéo verticale 9:16 accompagne facilement une découverte sur téléphone ; une version horizontale 16:9 peut mieux montrer une grande pièce sur un site ou un écran. Regardez le recadrage des images choisies, car les ouvertures et les passages doivent rester compréhensibles.',
        'BienVu propose des durées de vingt, trente et quarante secondes. Une sélection courte de plans peut suffire à présenter un bien simplement. Allongez lorsque vous avez réellement plus d’espaces à expliquer. Évitez de multiplier les images si chacune ne dispose plus du temps nécessaire pour être regardée.',
      ],
    },
    {
      id: 'narration',
      title: 'Préparer une voix off qui accompagne les photos',
      paragraphs: [
        'La description importée sert à préparer la narration. Relisez les phrases proposées dans Voix et texte : elles doivent correspondre aux plans montrés et rester naturelles à l’oral. Un inventaire de chiffres, de références et de détails administratifs n’aide pas nécessairement à comprendre le logement dans une présentation courte.',
        'Vous pouvez activer une voix off, ajouter des sous-titres et choisir un avatar si ces options servent votre présentation. Vérifiez le coût affiché avant de lancer la génération. Les mouvements classiques et les animations IA ne produisent pas le même résultat ; sélectionnez les animations pour les images qui en bénéficient réellement.',
      ],
      examples: [
        {
          title: 'Trame à adapter à un appartement fictif',
          text: 'À vendre à [ville], cet appartement de [surface] mètres carrés. Découvrez la pièce de vie, puis [un atout confirmé]. Contactez [agence] pour organiser une visite.',
          note: 'Remplacez les champs par les faits du mandat et vérifiez leur correspondance avec les photos.',
        },
      ],
    },
    {
      id: 'controle',
      title: 'Vérifier le résultat avant de le diffuser',
      paragraphs: [
        'Regardez une première fois la vidéo avec le son, puis une seconde fois sans le son. Contrôlez la prononciation de la ville et des nombres, la lecture des titres, le cadrage des pièces et la présence des coordonnées attendues. Dans un plan animé, observez également les lignes, les fenêtres et les objets qui doivent rester fidèles au bien.',
        'Si une correction est nécessaire, ouvrez le résultat dans l’éditeur et reprenez le passage concerné. Conservez une version clairement nommée avec le bien avant de la télécharger ou de préparer sa diffusion. Pour le prochain mandat, réutilisez surtout votre méthode de contrôle : elle compte autant que la rapidité de l’import.',
      ],
    },
  ],
  faqs: [
    {
      question: 'Peut-on créer une vidéo depuis n’importe quel lien immobilier ?',
      answer:
        'La récupération dépend du site source et de l’accès à sa fiche. Consultez les sources testées dans BienVu. La saisie manuelle et l’ajout de vos photos permettent de préparer le dossier lorsque l’import ne suffit pas.',
    },
    {
      question: 'Faut-il garder toutes les photos de l’annonce ?',
      answer:
        'Non. Sélectionnez les photos qui présentent des espaces complémentaires et réordonnez-les. Une galerie de départ volumineuse peut servir à choisir une présentation courte plutôt qu’à tout faire défiler.',
    },
    {
      question: 'L’import dispense-t-il de vérifier les informations ?',
      answer:
        'Non. L’agence garde la responsabilité de relire les faits et de choisir les images. Les informations de l’annonce peuvent être incomplètes ou avoir évolué depuis leur première publication.',
    },
  ],
  related: [
    'format-video-immobiliere-vertical-horizontal',
    'avatar-ia-video-immobiliere',
    'photos-immobilieres-smartphone',
  ],
  links: [
    { path: '/', label: 'Créer une vidéo depuis votre annonce' },
    { path: '/sources', label: 'Consulter les sources d’import testées' },
    { path: '/guides/choisir-photos-video-immobiliere', label: 'Choisir les photos de la vidéo' },
  ],
};
