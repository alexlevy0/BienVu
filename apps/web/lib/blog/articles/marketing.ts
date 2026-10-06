import type {BlogArticle} from '../types';

export const marketingArticle: BlogArticle = {
  slug: 'marketing-immobilier-ia-agence',
  title: 'Marketing immobilier IA : le guide pour votre agence — BienVu',
  heading: 'Marketing immobilier IA : automatiser la communication de votre agence',
  description: 'Organisez votre marketing immobilier avec l’IA : informations du mandat, vidéos, identité d’agence, diffusion et contrôle avant publication.',
  excerpt: 'De la prise de mandat à la publication : une méthode pour automatiser les tâches répétitives et garder la main sur vos contenus.',
  category: 'strategie', keyword: 'marketing immobilier IA', image: 'paris', imageAlt: 'Salon lumineux illustrant la présentation d’un bien immobilier',
  intro: [
    'Le marketing immobilier avec l’IA consiste à préparer et décliner les informations d’un bien pour les diffuser avec régularité. Une agence peut ainsi produire une première vidéo, proposer un texte de présentation et retrouver ses créations au même endroit. Le point de départ reste un mandat documenté : photos, caractéristiques, prix et informations vérifiées.',
    'L’enjeu est de réduire les ressaisies et les opérations de montage répétitives. Une organisation claire permet ensuite de consacrer le temps disponible à la sélection des images, à la relation avec le vendeur et aux réponses aux acquéreurs. Voici un parcours que vous pouvez appliquer à chaque nouveau bien.',
  ],
  takeaways: ['Centralisez les faits avant de produire les contenus.', 'Réutilisez une identité d’agence et des formats adaptés à chaque destination.', 'Validez le résultat et mesurez les demandes reçues, au-delà des vues.'],
  sections: [
    {id: 'base-du-mandat', title: '1. Constituer une base fiable pour le mandat', paragraphs: [
      'Rassemblez la ville, le type de bien, la surface, le nombre de pièces, le prix et les éléments qui expliquent son intérêt. Une terrasse, un bureau indépendant ou une proximité vérifiée peuvent orienter la présentation. Une information absente doit rester à compléter : elle ne devient pas un argument parce qu’un texte généré la suggère.',
      'Définissez aussi une référence interne et une photo de couverture. Ces repères simplifient la recherche du projet et la comparaison de ses versions. Si vous importez une annonce, contrôlez les champs et les images récupérés avant de lancer le montage ; les résultats peuvent varier selon le site source.',
    ], list: {items: ['Une description factuelle, sans superlatif automatique.', 'Des photos récentes, autorisées et représentatives du bien.', 'Un prix et une disponibilité à jour.', 'Les coordonnées de l’agence et une action attendue : demander la fiche ou organiser une visite.']}},
    {id: 'parcours-repetable', title: '2. Préparer un parcours qui se répète facilement', paragraphs: [
      'Un modèle de travail réduit les décisions à prendre à chaque création. Choisissez une structure simple : une ouverture qui situe le bien, deux ou trois espaces importants, puis une invitation à contacter l’agence. Le modèle sert de point de départ ; adaptez-le aux particularités du mandat plutôt que d’imposer le même récit à un studio et à une maison familiale.',
      'BienVu permet de démarrer depuis un lien, une description ou une saisie manuelle. Le projet rassemble les informations et les photos avant la génération. L’identité renseignée dans Mon agence et les modèles d’agence aident à conserver une présentation cohérente entre les différents collaborateurs.',
    ]},
    {id: 'formats-diffusion', title: '3. Choisir les formats selon leur destination', paragraphs: [
      'La même annonce peut alimenter plusieurs usages : une vidéo verticale pour les réseaux, une présentation horizontale pour le site et un message adressé à un client intéressé. Chaque support doit répondre à une question précise. Une première vidéo montre les espaces ; une publication suivante peut détailler l’extérieur ou une caractéristique vérifiée.',
      'Le contenu utile ne se résume pas à afficher plusieurs fois le même prix. Variez l’ordre des plans, le texte d’ouverture et l’appel à l’action selon le public. Gardez toutefois les faits identiques entre les versions pour éviter des informations contradictoires.',
    ], table: {caption: 'Un objectif par support de communication', columns: ['Support', 'Objectif', 'Élément à préparer'], rows: [['Vidéo verticale', 'Faire découvrir le bien', 'Un premier plan lisible et une accroche courte'], ['Vidéo horizontale', 'Présenter les espaces sur le site', 'Un cadrage adapté et des informations complètes'], ['Message client', 'Accompagner un échange', 'Une vidéo et un contexte personnalisé'], ['Publication de suivi', 'Répondre à une question', 'Un détail du bien et une réponse vérifiée']]}},
    {id: 'personnaliser', title: '4. Garder une identité reconnaissable', paragraphs: [
      'Commencez par quelques règles stables : un logo lisible, deux couleurs, une typographie et une manière de signer les publications. Ces choix rendent la production plus simple à relire. Sur mobile, un texte court et contrasté est souvent plus utile qu’un habillage dense qui masque la pièce.',
      'Dans l’éditeur BienVu, ajustez le cadrage, les textes, la durée des plans et l’équilibre entre voix et musique. Les animations IA restent facultatives. Réservez-les aux images dont le mouvement apporte quelque chose à la lecture de l’espace, puis vérifiez le résultat à vitesse normale.',
    ]},
    {id: 'validation', title: '5. Organiser la validation avant diffusion', paragraphs: [
      'Attribuez clairement la relecture à une personne. Elle vérifie le prix, le nombre de pièces, les coordonnées, les mentions nécessaires à la publicité du bien et la fidélité des images. Une vidéo terminée techniquement doit encore passer cette validation éditoriale.',
      'BienVu propose des liens de validation client et des projets d’agence. Vous pouvez préparer la version à soumettre puis transmettre vous-même le lien au destinataire. Les contenus privés restent séparés des vidéos que vous choisissez explicitement de rendre publiques dans Explorer.',
    ]},
    {id: 'publication-mesure', title: '6. Programmer, vérifier, puis améliorer', paragraphs: [
      'Dans le parcours actuel de BienVu, la publication directe concerne les Reels Instagram et Facebook. Connectez les comptes autorisés dans Mon agence ; Instagram doit être professionnel et lié à une Page Facebook que vous gérez. Pour les autres destinations, téléchargez la vidéo et adaptez la diffusion au support.',
      'Une programmation doit être suivie jusqu’à son résultat : une destination peut échouer indépendamment d’une autre. Après publication, relevez les demandes de fiche, les messages et les visites attribuables à la campagne. Comparez des biens et des périodes comparables, car le prix, la localisation et la demande influencent aussi les résultats.',
    ]},
    {id: 'demarrer', title: 'Un premier chantier concret pour votre agence', paragraphs: [
      'Prenez un seul mandat et préparez une vidéo, sa légende et deux publications de suivi. Notez le temps consacré à chaque étape et les corrections nécessaires. Ce petit essai révèle les champs manquants, les photos peu exploitables et les réglages qui méritent de devenir un modèle.',
      'Une fois le parcours validé, appliquez-le à vos prochains biens. L’automatisation du marketing immobilier devient alors une méthode de production : les tâches se répètent, les versions se retrouvent et les décisions restent documentées. La réussite se juge sur la qualité des contenus et des échanges obtenus.',
    ]},
  ],
  faqs: [
    {question: 'L’IA peut-elle inventer les atouts d’un bien ?', answer: 'Votre présentation doit partir d’informations vérifiées. Relisez les textes générés et retirez tout argument qui ne correspond pas aux caractéristiques documentées du mandat.'},
    {question: 'Peut-on essayer BienVu sans abonnement payant ?', answer: 'Oui. L’essai sans compte offre un crédit pour une vidéo avec les mouvements classiques. Un compte confirmé reçoit ensuite trois crédits gratuits par mois.'},
  ],
  related: ['un-mandat-sept-contenus-immobiliers', 'identite-visuelle-agence-immobiliere-videos', 'cout-video-immobiliere-budget-credits'],
  links: [{path: '/comment-ca-marche', label: 'Découvrir le parcours BienVu'}, {path: '/modeles-video-immobilier', label: 'Préparer les modèles de votre agence'}],
};
