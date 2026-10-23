import { blogThirdBatchPublishedAt, type BlogArticle } from '../types';

export const apartmentVideoArticle: BlogArticle = {
  publishedAt: blogThirdBatchPublishedAt,
  slug: 'video-appartement-a-vendre-agencement',
  title: 'Vidéo d’appartement à vendre : montrer l’agencement — BienVu',
  heading: 'Vidéo d’appartement à vendre : rendre l’agencement compréhensible',
  description:
    'Présentez un appartement en vidéo avec des photos bien ordonnées : pièce de vie, chambres, cuisine, rangements et cadrages utiles pour comprendre le logement.',
  excerpt:
    'Dans un appartement, les relations entre les pièces comptent autant que les beaux détails. Une méthode pour les présenter avec les bonnes photos.',
  category: 'video',
  keyword: 'vidéo appartement à vendre',
  image: 'paris',
  imageAlt: 'Séjour d’appartement avec de grandes ouvertures pour illustrer un montage immobilier',
  intro: [
    'Une vidéo d’appartement à vendre doit permettre au spectateur de se représenter des usages : où se trouve la pièce de vie, quelle place occupe la cuisine et comment se distinguent les espaces de repos. Une série de photos élégantes peut rester difficile à comprendre si les vues se répètent ou si le montage laisse imaginer des passages qui n’existent pas.',
    'Avec une vidéo réalisée à partir de photos, le travail commence donc par la sélection et l’ordre des images. Le but est de présenter ce que le dossier permet réellement de montrer. Les détails décoratifs accompagnent cette découverte ; ils ne doivent pas remplacer les vues qui donnent des repères sur le logement.',
  ],
  takeaways: [
    'Présentez les vues d’ensemble avant les détails décoratifs.',
    'Distinguez les pièces et les chambres dans les textes.',
    'Ne faites pas déduire un agencement que les images ne prouvent pas.',
  ],
  sections: [
    {
      id: 'questions',
      title: 'Répondre aux premières questions sur le logement',
      paragraphs: [
        'Listez les informations que votre sélection peut clarifier : la pièce principale, la place de la cuisine, les espaces de repos et les ouvertures visibles. Ajoutez les caractéristiques vérifiées qui apportent du contexte, comme la surface ou l’étage lorsque cette information est disponible. Toutes n’ont pas besoin d’être prononcées dans la même phrase.',
        'Demandez-vous ensuite ce qui manque aux photos. Si une chambre n’est pas montrée, ne la remplacez pas par une seconde vue du séjour présentée comme un nouvel espace. Le dossier détaillé et la visite permettront de compléter la découverte. La vidéo peut rester courte sans donner une impression trompeuse de complétude.',
      ],
    },
    {
      id: 'ordre',
      title: 'Construire une suite de pièces facile à suivre',
      paragraphs: [
        'Commencez par une pièce identifiable, puis présentez un espace complémentaire. Vous pouvez passer du séjour à la cuisine lorsqu’une vue montre leur relation, puis aux chambres et à un éventuel extérieur. Lorsque l’ordre correspond à une logique éditoriale plutôt qu’à un parcours physique, évitez les formulations comme « juste derrière cette porte » si rien ne le confirme.',
        'Pour deux vues d’une même pièce, conservez assez de repères pour que le spectateur la reconnaisse. Une fenêtre, un mur ou une ouverture peuvent aider. Si les angles donnent l’impression de deux pièces différentes, retirez le doublon ou indiquez clairement ce que la seconde image apporte.',
      ],
      table: {
        caption: 'Une progression possible pour un appartement fictif',
        columns: ['Passage', 'Question à laquelle répondre', 'Photo à privilégier'],
        rows: [
          ['Ouverture', 'Quel logement découvre-t-on ?', 'Vue d’ensemble représentative'],
          ['Pièce de vie', 'Comment utilise-t-on cet espace ?', 'Séjour avec des repères lisibles'],
          ['Cuisine', 'Quelle place occupe-t-elle ?', 'Vue claire, ouverte ou séparée selon le bien'],
          ['Repos', 'Quels espaces sont réellement montrés ?', 'Chambre identifiable'],
          ['Conclusion', 'Comment poursuivre la découverte ?', 'Dernière vue et contact de l’agence'],
        ],
      },
    },
    {
      id: 'petites-surfaces',
      title: 'Présenter une petite surface sans la déformer',
      paragraphs: [
        'Dans un studio ou un petit appartement, montrez la relation entre les différents usages plutôt que de chercher à faire paraître l’espace plus vaste. Une photo générale peut situer le coin cuisine et la pièce principale, puis une autre montrer les rangements ou la salle d’eau. Gardez les proportions et les limites du logement visibles.',
        'Le recadrage vertical peut accentuer un détail au point de faire disparaître le contexte. Comparez-le avec une version plus large et choisissez une autre image si nécessaire. Des mouvements de caméra très importants ou des animations qui modifient la profondeur ne doivent pas donner l’illusion d’un volume différent.',
      ],
    },
    {
      id: 'texte',
      title: 'Nommer les caractéristiques avec précision',
      paragraphs: [
        'Un nombre de pièces n’est pas automatiquement un nombre de chambres. Reprenez les données du dossier pour éviter cette confusion dans le titre, la voix off et la conclusion. Faites aussi la différence entre la surface du logement et celle d’un balcon ou d’une terrasse lorsque ces éléments sont présentés séparément.',
        'Les formulations sur la lumière, le vis-à-vis et le calme doivent rester proportionnées aux informations disponibles. Une belle photo à un moment de la journée ne décrit pas toutes les conditions du logement. Préférez les éléments concrets que votre agence peut expliquer à une personne intéressée.',
      ],
      examples: [
        {
          title: 'Trame de présentation factuelle',
          text: 'À vendre à [ville], cet appartement de [surface] mètres carrés. Découvrez [pièce visible], puis [espace complémentaire confirmé]. Retrouvez le dossier du bien et les modalités de visite auprès de [agence].',
          note: 'Ajoutez les caractéristiques exactes du mandat et retirez tout espace qui n’est pas effectivement présenté.',
        },
      ],
    },
    {
      id: 'style',
      title: 'Choisir une mise en page adaptée aux photos',
      paragraphs: [
        'Dans BienVu, comparez les styles à partir des images de l’appartement. Une composition avec plusieurs vues peut illustrer des pièces complémentaires, tandis qu’une grande photo laisse davantage regarder un volume particulier. Vérifiez la taille du titre et la place des informations dans chaque cas.',
        'Si un avatar apparaît, placez-le dans une zone qui ne masque pas la cuisine, une porte ou un rangement important. La musique doit accompagner la visite sans gêner la voix. Une présentation sobre peut rendre un appartement plus compréhensible qu’une accumulation d’effets et de textes superposés.',
      ],
    },
    {
      id: 'validation',
      title: 'Relire la vidéo comme une personne qui ne connaît pas le bien',
      paragraphs: [
        'Faites regarder le résultat à un collègue sans lui expliquer l’agencement au préalable. Demandez-lui quelles pièces il a reconnues et ce qu’il n’a pas compris. Si son interprétation diffère du logement, reprenez la sélection, l’ordre ou le texte plutôt que d’ajouter simplement un nouveau slogan.',
        'Terminez par un contrôle sur téléphone : une pièce doit rester identifiable, les textes doivent être lisibles et le contact doit conduire vers la bonne agence. Les questions recueillies après les premiers partages peuvent ensuite orienter une seconde version ou compléter la fiche détaillée du bien.',
      ],
    },
  ],
  faqs: [
    {
      question: 'Faut-il montrer toutes les pièces dans une vidéo courte ?',
      answer:
        'Choisissez les vues qui aident à comprendre le logement, sans présenter la vidéo comme une visite exhaustive si certaines pièces manquent. La fiche complète et les échanges permettent de poursuivre la découverte.',
    },
    {
      question: 'Comment présenter un studio en vidéo ?',
      answer:
        'Montrez une vue générale, puis des usages réellement visibles : cuisine, rangements et salle d’eau selon vos photos. Évitez de transformer des cadrages d’une même pièce en faux espaces distincts.',
    },
    {
      question: 'Une vidéo réalisée à partir de photos montre-t-elle le plan exact ?',
      answer:
        'Elle ne reconstitue pas automatiquement un plan fiable. Les circulations doivent être établies à partir d’informations vérifiées. Utilisez un plan existant ou une visite pour expliquer ce que les photos ne montrent pas.',
    },
  ],
  related: [
    'video-maison-a-vendre-scenario',
    'video-immobiliere-visite-virtuelle-differences',
    'format-video-immobiliere-vertical-horizontal',
  ],
  links: [
    { path: '/', label: 'Créer la vidéo de votre appartement' },
    { path: '/guides/choisir-photos-video-immobiliere', label: 'Composer votre sélection de photos' },
    { path: '/editeur-video-immobilier', label: 'Ajuster les cadrages et les textes' },
  ],
};
