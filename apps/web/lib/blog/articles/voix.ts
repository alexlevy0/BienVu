import type {BlogArticle} from '../types';

export const voixArticle: BlogArticle = {
  slug: 'voix-off-immobiliere-exemples-textes', title: 'Voix off immobilière : textes et exemples de scripts — BienVu',
  heading: 'Voix off immobilière : rédiger un texte naturel, avec exemples',
  description: 'Écrivez une voix off immobilière claire : structure du script, durée, faits vérifiés et exemples pour un appartement, une maison ou une location.',
  excerpt: 'Des phrases qui accompagnent les images, des repères de durée et trois exemples de narration à adapter à votre annonce.',
  category: 'video', keyword: 'voix off immobilière', image: 'paris', imageAlt: 'Salon lumineux illustrant une vidéo immobilière avec voix off',
  intro: [
    'Une voix off immobilière aide à situer le bien et à relier les images. Elle peut préciser une configuration, un équipement ou une information de l’annonce qui n’apparaît pas immédiatement dans la photo. Le texte gagne à être écrit comme une présentation orale : des phrases simples, des idées distinctes et une conclusion facile à comprendre.',
    'Commencez par la durée de la vidéo et les faits disponibles. Vous pourrez ensuite choisir les informations à dire, celles à afficher et celles à réserver à la fiche complète. Les exemples de cet article sont des modèles fictifs, à adapter aux caractéristiques vérifiées du mandat.',
  ],
  takeaways: ['Écrivez pour l’écoute et associez chaque idée à une image.', 'Faites un essai de lecture pour ajuster la longueur du texte.', 'Relisez les faits, les nombres et la conclusion avant la génération.'],
  sections: [
    {id: 'structure', title: 'Une structure en trois parties', paragraphs: [
      'L’ouverture situe le bien : type, ville et raison de poursuivre la découverte. Le développement décrit quelques espaces ou caractéristiques utiles. La conclusion indique comment obtenir des informations ou préparer une visite. Cette structure fonctionne même lorsque la présentation reste courte.',
      'Choisissez une idée principale pour chaque phrase. Si vous mentionnez le jardin, faites-la correspondre à une image extérieure. Si la configuration est importante, présentez-la lorsque les pièces sont visibles. Une narration cohérente évite au spectateur de reconstruire lui-même le lien entre le texte et les plans.',
    ], list: {ordered: true, items: ['Situer : « À [ville], découvrez ce [type de bien]. »', 'Développer : décrire deux ou trois éléments confirmés du mandat.', 'Conclure : « Contactez notre agence pour recevoir la fiche et connaître les possibilités de visite. »']}},
    {id: 'longueur', title: 'Ajuster le texte à 20, 30 ou 40 secondes', paragraphs: [
      'La durée de lecture varie selon la voix, les pauses et les informations prononcées. Un prix ou une adresse peuvent prendre plus de temps que leur place sur la page le laisse penser. Lisez le texte à voix haute avec un chronomètre pour obtenir un premier repère, puis écoutez la voix générée.',
      'À titre de travail, vous pouvez essayer environ quarante à cinquante mots pour vingt secondes, soixante à soixante-quinze pour trente et quatre-vingts à cent pour quarante. Ce sont des hypothèses de rédaction, à ajuster après écoute. Une fin coupée ou de longs blancs indiquent que la répartition mérite une correction.',
    ]},
    {id: 'appartement', title: 'Exemple de voix off pour un appartement', paragraphs: [
      'L’appartement se présente par sa configuration et ses espaces principaux. Évitez l’inventaire de tous les objets. Précisez le nombre de pièces et la surface lorsqu’ils sont confirmés, puis décrivez les usages que l’agencement permet réellement.',
      'Le texte suivant donne une base à tester avec la voix choisie. Raccourcissez-le pour une présentation brève ou ajoutez une caractéristique vérifiée si la durée le permet. Le prix peut rester visible dans le montage si sa lecture rend le texte trop dense.',
    ], examples: [{title: 'Modèle à adapter', text: 'À Lyon, découvrez cet appartement de trois pièces et soixante-cinq mètres carrés. Le séjour constitue le point de départ de la visite, puis la présentation se poursuit vers la cuisine et les deux chambres. Chaque image vous donne un aperçu de la distribution des espaces. Retrouvez le prix, les caractéristiques et les informations complètes dans l’annonce. Notre agence peut vous transmettre la fiche du bien et vous renseigner sur les possibilités de visite.', note: 'Bien fictif. La durée doit être vérifiée avec la voix sélectionnée.'}]},
    {id: 'maison', title: 'Exemple de voix off pour une maison', paragraphs: [
      'Pour une maison, montrez le lien entre les pièces de vie et l’extérieur. Une transition simple entre le séjour et le jardin peut donner une direction au récit. Confirmez les accès, les surfaces et les équipements avant de les citer.',
      'Ce modèle comporte des champs à compléter. Une fois le texte renseigné, contrôlez que chaque phrase correspond à une photo disponible. Retirez la terrasse, le jardin ou toute autre caractéristique si elle ne concerne pas le mandat.',
    ], examples: [{title: 'Modèle à adapter', text: 'À [ville], découvrez une maison de [surface] mètres carrés. La présentation commence par [pièce principale], puis vous accompagne vers [espaces confirmés]. À l’extérieur, [description factuelle] complète les usages du quotidien. Retrouvez la configuration, le prix et les informations de l’annonce. Contactez notre agence pour échanger sur votre recherche et préparer une visite.'}]},
    {id: 'location', title: 'Exemple de voix off pour un bien à louer', paragraphs: [
      'Le texte d’une location doit donner des repères pratiques : type de logement, localisation, configuration et modalités de contact. Les montants et les conditions doivent correspondre à l’annonce à jour. Gardez assez de temps pour montrer les équipements confirmés.',
      'La conclusion peut inviter à demander la fiche ou à connaître le parcours de candidature. Elle doit rester ouverte et factuelle. Évitez d’ajouter des critères de sélection personnels ou des promesses de disponibilité qui n’ont pas été validées.',
    ], examples: [{title: 'Modèle à adapter', text: 'À louer à [ville], un [type de logement] de [surface] mètres carrés. Découvrez [pièce principale], puis [autre espace ou équipement confirmé]. Les informations sur le loyer et les conditions sont disponibles dans l’annonce. Notre agence vous renseigne sur la disponibilité du logement, les visites et les étapes de candidature.'}]},
    {id: 'style', title: 'Rendre la lecture naturelle', paragraphs: [
      'Préférez une formulation orale aux phrases longues de la fiche technique. « Le séjour s’ouvre sur la terrasse » se lit plus simplement qu’une accumulation de surfaces et de qualificatifs. Variez les débuts de phrase et gardez une ponctuation qui aide la voix à respirer.',
      'Les expressions comme « exceptionnel », « unique » ou « coup de cœur assuré » ne remplacent pas une caractéristique. Décrivez ce qui est documenté et ce que les images montrent. Relisez aussi les noms de ville, les abréviations et les nombres : ils peuvent nécessiter une formulation plus explicite pour la synthèse vocale.',
    ]},
    {id: 'bienvu', title: 'Vérifier la narration dans votre vidéo BienVu', paragraphs: [
      'BienVu prépare une voix off française à partir des informations de l’annonce lorsque vous activez cette option. Une description précise fournit davantage de matière au texte généré. Contrôlez donc les faits avant de lancer la création, puis écoutez le résultat avec les images.',
      'Dans l’éditeur, les pistes conservées du projet permettent de retrouver la narration et son emplacement. Vérifiez son niveau face à la musique et sa coordination avec les plans. Une vidéo qui se comprend avec et sans son reste plus facile à consulter dans des situations différentes.',
    ]},
  ],
  faqs: [{question: 'Faut-il lire le prix dans la voix off ?', answer: 'Vous pouvez le prononcer ou l’afficher dans la vidéo, selon le temps disponible. Sa présentation doit rester cohérente avec l’annonce et les mentions applicables.'}, {question: 'Les sous-titres rendent-ils la voix inutile ?', answer: 'Ils offrent une autre manière de suivre la présentation. Vous choisissez la voix et les sous-titres selon le résultat souhaité ; vérifiez la lisibilité des textes dans le montage.'}],
  related: ['sous-titres-video-immobiliere-lisibilite', 'musique-video-immobiliere-droits-mixage', 'rediger-annonce-immobiliere-legende'],
  links: [{path: '/video-immobiliere-ia', label: 'Créer une vidéo avec voix off'}, {path: '/editeur-video-immobilier', label: 'Retrouver les pistes du projet dans l’éditeur'}],
};
