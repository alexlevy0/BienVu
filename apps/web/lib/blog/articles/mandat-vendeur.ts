import {blogThirdBatchPublishedAt, type BlogArticle} from '../types';

export const sellerMeetingArticle: BlogArticle = {
  publishedAt: blogThirdBatchPublishedAt,
  slug: 'video-immobiliere-rendez-vous-vendeur-mandat', title: 'Vidéo immobilière en rendez-vous vendeur — BienVu',
  heading: 'Présenter votre communication vidéo lors d’un rendez-vous vendeur',
  description: 'Préparez votre rendez-vous vendeur avec un exemple vidéo, une méthode de production et un plan de diffusion concrets pour présenter le travail de votre agence.',
  excerpt: 'Montrer ce que votre agence prépare pour un mandat rend la conversation plus concrète. Une trame de démonstration, sans promesse de résultat inventée.',
  category: 'strategie', keyword: 'vidéo immobilière rendez-vous vendeur', image: 'bordeaux',
  imageAlt: 'Intérieur de caractère utilisé comme exemple de présentation en rendez-vous vendeur',
  intro: [
    'Lors d’un rendez-vous vendeur, la communication vidéo peut donner une forme concrète à votre méthode de commercialisation. Montrer un exemple permet d’expliquer comment vous choisissez les photos, préparez le texte et présentez les espaces. Le propriétaire peut alors discuter d’un travail visible plutôt que d’une promesse générale de visibilité.',
    'Cette démonstration ne garantit ni l’obtention du mandat, ni un délai de vente, ni un prix. Elle sert à présenter votre organisation et à comprendre les attentes du propriétaire. Préparez-la comme un échange de quelques minutes, avec une vidéo pertinente et des étapes que votre agence est réellement capable de tenir.',
  ],
  takeaways: ['Choisissez un exemple comparable et clairement présenté comme tel.', 'Expliquez le travail derrière la vidéo et les étapes de validation.', 'Parlez des actions prévues et de leur suivi, sans promettre une vente.'],
  sections: [
    {id: 'exemple', title: 'Choisir une démonstration utile au propriétaire', paragraphs: [
      'Préparez une vidéo qui ressemble au type de bien ou au style de présentation discuté. Un propriétaire d’appartement peut avoir du mal à se projeter dans un exemple uniquement consacré à une grande villa. La démonstration doit montrer une méthode applicable à son logement, même si les caractéristiques restent différentes.',
      'Utilisez un contenu que vous pouvez présenter et indiquez clairement s’il s’agit d’une démonstration fictive ou d’un autre mandat. Évitez de donner l’impression qu’une vidéo a déjà été produite pour le bien du propriétaire si ce n’est pas le cas. Vérifiez le son et prévoyez une lecture simple avant le rendez-vous.',
    ]},
    {id: 'demonstration', title: 'Faire une démonstration courte et structurée', paragraphs: [
      'Montrez d’abord le résultat, puis expliquez deux ou trois décisions : la photo d’ouverture, la progression des espaces et la place des informations. Arrêtez-vous sur un passage représentatif si le propriétaire pose une question. Une démonstration devient moins utile lorsqu’elle se transforme en visite de tous les réglages du logiciel.',
      'Reliez ensuite l’exemple à son bien. Demandez quels espaces il souhaite faire comprendre et quelles questions les futurs visiteurs pourraient poser. Ces réponses peuvent orienter les prises de vue et la description du dossier, sans laisser le vendeur dicter une présentation qui contredirait des faits vérifiés.',
    ], table: {caption: 'Trame d’un échange autour de votre vidéo', columns: ['Moment', 'Ce que vous montrez', 'Question à poser'], rows: [
      ['Découverte', 'Une vidéo pertinente', 'Quels espaces souhaitez-vous mettre en avant ?'],
      ['Méthode', 'Le choix des photos et du texte', 'Quelles informations faut-il confirmer ?'],
      ['Validation', 'Un exemple de retour précis', 'Qui centralisera les corrections ?'],
      ['Diffusion', 'Les destinations réellement prévues', 'Quel suivi souhaitez-vous recevoir ?'],
    ]}},
    {id: 'production', title: 'Expliquer les étapes que votre agence prend en charge', paragraphs: [
      'Décrivez une chaîne de travail simple : préparation des informations, choix des photos, création de la narration, contrôle du montage et diffusion. Précisez à quel moment les caractéristiques du mandat sont vérifiées. Cette organisation montre que la vidéo découle d’un dossier fiable, plutôt que d’une suite d’effets automatiques.',
      'Avec BienVu, vous pouvez illustrer le passage d’une annonce ou d’un dossier saisi à une vidéo personnalisée. Présentez les choix utiles au propriétaire : le format, l’identité de l’agence et la manière dont ses espaces seront montrés. Les détails techniques de génération ne sont nécessaires que s’ils répondent à une question concrète.',
    ]},
    {id: 'diffusion', title: 'Présenter un plan de diffusion réalisable', paragraphs: [
      'Distinguez les supports que vous utilisez réellement : réseaux professionnels de l’agence, site ou vitrine, échanges avec les acquéreurs. Montrez comment une même présentation peut avoir plusieurs destinations tout en restant adaptée à chaque contexte. Ne promettez pas une publication sur un canal que vous ne gérez pas.',
      'La fréquence et le suivi comptent autant que la liste des supports. Expliquez quand la vidéo sera relue, comment les informations évolueront et qui vérifiera les anciennes versions. Si vous prévoyez un budget publicitaire, présentez-le séparément de la production du contenu, avec les conditions que vous avez effectivement définies.',
    ]},
    {id: 'retours', title: 'Préparer la validation avec des questions précises', paragraphs: [
      'Demandez au propriétaire de vérifier les faits, les espaces présentés et les éventuelles informations manquantes. Centralisez les retours plutôt que de recevoir plusieurs versions de commentaires sur des canaux différents. Une demande comme « la terrasse montrée est commune » appelle une correction claire ; « rendre plus vendeur » mérite d’être précisé.',
      'Gardez la responsabilité éditoriale de la présentation. Vous pouvez prendre en compte les préférences de ton ou d’image tout en conservant les réserves et les éléments nécessaires à une communication fidèle. Fixez aussi une version de référence pour éviter qu’un ancien export soit diffusé après une modification.',
    ], examples: [{title: 'Formulation pour présenter votre méthode', text: 'Nous préparons une vidéo à partir des informations et des photos retenues pour votre bien. Nous vérifions les faits, puis nous vous demandons un retour précis avant la diffusion prévue. Voici un exemple de la façon dont nous organisons cette présentation.', note: 'Adaptez cette formulation à votre processus réel et aux engagements convenus avec le propriétaire.'}]},
    {id: 'suivi', title: 'Rendre compte des échanges obtenus', paragraphs: [
      'Lors du suivi, parlez des actions réalisées et des questions reçues. Les vues seules ne disent pas si une personne a compris le bien ou souhaite le visiter. Une demande sur l’agencement ou un contact qui cite un passage de la vidéo peut apporter une information utile, même sans volume important de visionnages.',
      'Conservez une trace des versions et des destinations pour expliquer ce qui a été partagé. Si vous montrez des résultats d’autres mandats, indiquez le contexte et ne les présentez pas comme une prévision. La démonstration de votre méthode reste crédible lorsqu’elle distingue ce que vous faites de ce que vous ne pouvez pas garantir.',
    ]},
  ],
  faqs: [
    {question: 'Faut-il préparer une vidéo complète avant le rendez-vous ?', answer: 'Un exemple pertinent peut suffire pour présenter votre méthode. Une vidéo propre au bien demande des photos et des informations fiables, ainsi qu’un cadre approprié pour leur utilisation.'},
    {question: 'Peut-on promettre qu’une vidéo fera vendre plus vite ?', answer: 'Un exemple ou un nombre de vues ne permet pas de garantir un délai de vente. Présentez les actions de communication et les retours observés, en conservant le contexte de chaque mandat.'},
    {question: 'Que montrer si le propriétaire connaît déjà les vidéos immobilières ?', answer: 'Concentrez-vous sur vos choix et votre organisation : sélection des images, vérification des informations, validation et suivi de diffusion. Ce travail explique davantage votre proposition qu’une liste d’effets disponibles.'},
  ],
  related: ['validation-video-immobiliere-vendeur', 'vitrine-video-agence-immobiliere', 'mesurer-performance-video-immobiliere'],
  links: [{path: '/comment-ca-marche', label: 'Voir le parcours de création BienVu'}, {path: '/ma-vitrine/exemple', label: 'Préparer une démonstration de vitrine'}, {path: '/modeles-video-immobilier', label: 'Structurer les présentations de votre agence'}],
};
