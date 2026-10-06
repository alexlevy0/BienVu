import type {BlogArticle} from '../types';

export const montageArticle: BlogArticle = {
  slug: 'video-immobiliere-photos-duree-montage', title: 'Vidéo immobilière avec photos : durée et montage — BienVu',
  heading: 'Vidéo immobilière à partir de photos : durée, rythme et montage',
  description: 'Construisez une vidéo immobilière à partir de photos : choisissez 20, 30 ou 40 secondes, organisez les plans et ajustez le cadrage et le rythme.',
  excerpt: 'Choisir la durée, répartir les plans et coordonner la narration : des repères de montage pour une présentation facile à suivre.',
  category: 'video', keyword: 'vidéo immobilière à partir de photos', image: 'bordeaux', imageAlt: 'Maison avec jardin illustrant les plans d’une vidéo immobilière',
  intro: [
    'Créer une vidéo immobilière à partir de photos demande de choisir ce que chaque image doit raconter. La durée dépend du nombre d’espaces à présenter, de la quantité d’informations et du support de diffusion. Vingt secondes peuvent suffire à une première découverte ; quarante permettent de développer davantage le parcours.',
    'Le rythme vient ensuite de la répartition des plans, des textes et de la voix. Une succession trop rapide rend les pièces difficiles à lire. Un plan trop long, sans information nouvelle, peut ralentir la présentation. Utilisez les repères suivants comme des points de départ, puis regardez le résultat sur un téléphone.',
  ],
  takeaways: ['Choisissez la durée en fonction des informations à présenter.', 'Attribuez un rôle à chaque photo et adaptez son cadrage.', 'Écoutez la vidéo entière avant de valider l’export.'],
  sections: [
    {id: 'duree', title: '20, 30 ou 40 secondes : quel choix pour le mandat ?', paragraphs: [
      'Une vidéo de vingt secondes convient à une découverte concentrée : quelques espaces, les principaux repères et un contact. Trente secondes donnent plus de place à la distribution et aux particularités. Quarante secondes peuvent accueillir une présentation plus développée si les images et les faits disponibles la justifient.',
      'Ces durées ne constituent pas une règle de performance des réseaux sociaux. Elles correspondent aux choix disponibles dans BienVu. Évaluez le résultat à partir de la lisibilité et de l’intérêt de chaque plan, puis comparez les retours de votre propre public.',
    ], table: {caption: 'Trois structures de départ, à ajuster dans l’éditeur', columns: ['Durée totale', 'Exemple de répartition', 'Usage'], rows: [['20 secondes', '4 plans de 5 secondes', 'Une présentation courte des espaces principaux'], ['30 secondes', '6 plans de 5 secondes', 'Un parcours plus détaillé du bien'], ['40 secondes', '8 plans de 5 secondes', 'Une présentation avec davantage de pièces et de contexte']]}},
    {id: 'selection', title: 'Sélectionner des photos qui apportent une information', paragraphs: [
      'Commencez par une image représentative, puis choisissez les vues qui montrent des espaces distincts. Deux photos proches du même séjour peuvent être utiles si elles expliquent son volume. Elles deviennent répétitives lorsqu’elles n’apportent aucun nouveau repère au montage.',
      'Préparez les fichiers avant de les importer : netteté, exposition et cohérence des couleurs. Le recadrage peut améliorer la lecture, mais il ne répare pas une photo floue. Retirez les vues anciennes ou les images dont l’usage n’est pas autorisé. Conservez un original pour revenir sur un cadrage.',
    ], list: {items: ['Un plan d’ouverture qui situe le bien.', 'Des vues complémentaires des espaces de vie.', 'Les chambres et les pièces utiles à la compréhension de la configuration.', 'Un extérieur ou un détail documenté, si le mandat le justifie.']}},
    {id: 'ordre', title: 'Construire un parcours compréhensible', paragraphs: [
      'Ordonnez les images pour accompagner la découverte : ensemble, espace de vie, cuisine, pièces de repos, extérieur. Ce parcours reste une présentation éditoriale à partir de photos. Évitez de donner l’impression d’un déplacement filmé continu si vous ne connaissez pas la relation entre les pièces.',
      'Associez une information à chaque moment. La ville peut apparaître au début, la surface et la configuration pendant la découverte, puis le prix et le contact vers la fin. Il est inutile de répéter tous les chiffres sur chaque plan si cela surcharge l’image.',
    ], examples: [{title: 'Une répartition de 30 secondes', text: 'Ouverture : 4 s. Séjour : 5 s. Cuisine : 5 s. Chambres : 5 s. Extérieur : 5 s. Conclusion et contact : 6 s. Total : 30 s.', note: 'Exemple de montage, à adapter au nombre de photos et aux informations disponibles.'}]},
    {id: 'cadrage', title: 'Adapter chaque image au format de la vidéo', paragraphs: [
      'Le vertical 9:16 et l’horizontal 16:9 ne montrent pas la même portion d’une photo. Vérifiez le cadrage de chaque plan après avoir choisi le format. Une fenêtre, une ouverture ou un accès extérieur peut disparaître lors du recadrage et rendre la pièce plus difficile à comprendre.',
      'Dans l’éditeur BienVu, réglez le cadrage par image et contrôlez l’emplacement des textes. Gardez une zone lisible pour les informations importantes. Les éléments des applications sociales peuvent recouvrir le bas ou les côtés du fichier : vérifiez aussi la présentation sur la plateforme de destination.',
    ]},
    {id: 'audio', title: 'Coordonner la voix, les textes et les transitions', paragraphs: [
      'La narration doit suivre les images. Une phrase sur la terrasse prend son sens lorsque l’extérieur est visible. Si le texte comporte trop d’informations, simplifiez-le ou répartissez-les autrement ; accélérer toutes les phrases risque de rendre le message moins compréhensible.',
      'Laissez une courte respiration entre les idées et surveillez les silences prolongés. La durée d’un texte dépend de la voix, des nombres et de la ponctuation. Écoutez la piste complète, puis vérifiez que la conclusion se termine avant la fin de la vidéo et que la musique reste discrète.',
    ]},
    {id: 'mouvements', title: 'Utiliser les mouvements avec une intention', paragraphs: [
      'Un zoom lent peut attirer l’attention sur une zone du séjour. Une animation IA peut donner du mouvement à un espace choisi. Déterminez d’abord l’intérêt du mouvement pour le plan, puis regardez s’il préserve les lignes, les volumes et les détails du bien.',
      'Les mouvements classiques sont inclus dans BienVu ; les nouvelles animations IA utilisent un crédit supplémentaire par photo. Vous pouvez mélanger les deux types de plans. Une photo fixe bien cadrée reste utile lorsque le résultat animé ne rend pas correctement un élément important.',
    ]},
    {id: 'controle', title: 'Contrôler le montage avant l’export', paragraphs: [
      'Regardez une première fois la vidéo sans son pour évaluer les textes et les images. Faites une seconde lecture avec la voix et la musique. Notez les moments où une information est trop brève, trop dense ou décalée par rapport à l’image.',
      'Vérifiez enfin le prix, la surface, le nombre de pièces, les coordonnées et la disponibilité. Conservez la version validée avec le mandat. Quand vous retouchez une création dans BienVu, les pistes et les animations conservées peuvent être reprises dans l’éditeur pour faciliter la continuité du projet.',
    ]},
  ],
  faqs: [{question: 'Combien de photos faut-il pour une vidéo immobilière ?', answer: 'Le nombre dépend des espaces à présenter. Commencez par quelques vues distinctes et vérifiez leur lisibilité dans la durée choisie. Une image supplémentaire doit apporter une information utile.'}, {question: 'Une vidéo plus longue présente-t-elle toujours mieux le bien ?', answer: 'La qualité dépend du contenu disponible et de son organisation. Choisissez une durée qui permet de comprendre les espaces et les informations, puis retirez les répétitions.'}],
  related: ['voix-off-immobiliere-exemples-textes', 'photos-immobilieres-smartphone', 'musique-video-immobiliere-droits-mixage'],
  links: [{path: '/guides/choisir-photos-video-immobiliere', label: 'Préparer les photos du montage'}, {path: '/editeur-video-immobilier', label: 'Découvrir les réglages de l’éditeur'}],
};
