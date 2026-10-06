import {blogSecondBatchPublishedAt, type BlogArticle} from '../types';

export const clientMessagesArticle: BlogArticle = {
  publishedAt: blogSecondBatchPublishedAt,
  slug: 'envoyer-video-immobiliere-acquereur', title: 'Envoyer une vidéo immobilière à un acquéreur — BienVu',
  heading: 'Envoyer une vidéo immobilière à un acquéreur : messages et suivi',
  description: 'Accompagnez vos échanges clients avec une vidéo immobilière : messages personnalisés, fichier ou lien, préparation de visite et suivi des réponses.',
  excerpt: 'Une vidéo peut prolonger un échange avec un client lorsqu’elle répond à sa question et lui indique clairement comment obtenir la suite.',
  category: 'redaction', keyword: 'envoyer vidéo immobilière acquéreur', image: 'sud', imageAlt: 'Maison avec terrasse illustrant un échange avec un acquéreur',
  intro: [
    'Un acquéreur ne reçoit pas une vidéo immobilière dans le même contexte qu’une personne qui la découvre au hasard sur un réseau. Il peut avoir demandé la fiche, parlé de son projet ou préparé une visite. Un message court qui rappelle cet échange aide à comprendre pourquoi vous lui présentez ce logement.',
    'Le fichier vidéo sert à montrer les espaces et à accompagner la conversation. Il ne remplace pas la fiche détaillée, les réponses aux questions ni une visite. Préparez une version à jour, choisissez un moyen d’envoi adapté et proposez une suite précise. Les exemples de messages ci-dessous sont fictifs et destinés à des échanges déjà engagés avec vos clients.',
  ],
  takeaways: ['Rappelez le contexte de l’échange et l’intérêt du bien pour le client.', 'Envoyez une version à jour avec un fichier ou un lien adapté.', 'Proposez une seule suite utile et consignez la réponse reçue.'],
  sections: [
    {id: 'contexte', title: 'Choisir le bon moment dans la conversation', paragraphs: [
      'Une vidéo peut suivre une demande de renseignements, compléter un appel ou préparer un rendez-vous. Avant de l’envoyer, identifiez la question qu’elle aide à traiter : disposition du séjour, présence d’un extérieur ou organisation des chambres. Vous évitez ainsi de transmettre une présentation générale sans lien avec le besoin exprimé.',
      'Reprenez uniquement les critères effectivement connus du client. Si son projet n’est pas encore clair, commencez par un échange pour le préciser. Une présentation vidéo ne remplace pas cette qualification et ne permet pas de conclure seule qu’un logement correspond à son budget ou à ses contraintes.',
    ]},
    {id: 'version', title: 'Préparer une version pertinente et actualisée', paragraphs: [
      'Contrôlez la référence du bien, le prix, la disponibilité et les coordonnées avant l’envoi. Sélectionnez un montage qui montre les espaces concernés par la question. Si le client veut comprendre l’accès à la terrasse, une vidéo centrée sur les chambres risque de laisser son interrogation sans réponse.',
      'Évitez les versions dont les informations sont devenues obsolètes. Une vidéo déjà créée peut être téléchargée à nouveau ; une correction du contenu nécessite de revoir le projet et le rendu. Gardez dans Mes biens les versions associées au mandat pour retrouver facilement celle que vous avez transmise.',
    ]},
    {id: 'fichier-lien', title: 'Choisir entre le fichier et le lien', paragraphs: [
      'Le fichier MP4 peut être joint ou envoyé avec le canal utilisé pour votre échange, selon ses possibilités. Vérifiez son poids, sa lecture et la manière dont le destinataire pourra le retrouver. Un lien peut être plus pratique lorsque vous souhaitez accompagner la vidéo d’une fiche actualisée ou éviter une pièce jointe trop volumineuse.',
      'Choisissez consciemment la portée du partage. Une création privée dans votre espace ne devient pas publique parce que vous l’avez générée. Les liens de validation client de BienVu concernent une version partagée pour la relecture ; Explorer correspond à un partage public explicite. Utilisez le moyen qui convient à votre conversation et à votre intention de diffusion.',
    ], table: {caption: 'Préparer le support de l’échange', columns: ['Support', 'À vérifier', 'Contexte adapté'], rows: [['Fichier vidéo', 'Poids et lecture du MP4', 'Canal qui accepte la pièce jointe'], ['Lien vers une présentation', 'Accès prévu et version disponible', 'Échange accompagné d’informations'], ['Fiche du bien', 'Prix, disponibilité et coordonnées', 'Demande de renseignements détaillés'], ['Lien de validation', 'Version et personnes destinataires', 'Retour attendu sur le montage']]}},
    {id: 'premier-message', title: 'Rédiger le message qui accompagne la découverte', paragraphs: [
      'Commencez par rappeler l’échange et le mandat concerné. Dites ensuite ce que la vidéo montre, puis proposez la suite. Le message peut rester court parce que la vidéo porte déjà une partie de la présentation. Évitez de recopier une longue annonce sans expliquer pourquoi vous l’adressez à cette personne.',
      'Personnalisez l’introduction avec un élément réellement discuté. Ne promettez pas que le logement répond à tous les critères si vous ne l’avez pas vérifié. La formule « pour vous aider à voir la disposition » est plus précise qu’une affirmation générale sur le bien idéal.',
    ], examples: [{title: 'Après une demande de renseignements', text: 'Bonjour Sophie, à la suite de votre demande sur l’appartement référence M-024, voici une courte vidéo du séjour et des chambres. Elle vous aidera à voir leur disposition. Souhaitez-vous que je vous transmette également le plan et la fiche actualisée ?'}]},
    {id: 'visite', title: 'Utiliser la vidéo pour préparer ou prolonger une visite', paragraphs: [
      'Avant une visite, la vidéo peut rappeler le logement qui sera présenté et les espaces principaux. Accompagnez-la des informations pratiques du rendez-vous dans votre échange habituel. Le client peut ainsi distinguer ce mandat d’un autre bien dont vous lui avez parlé.',
      'Après la visite, choisissez une relance liée à une question exprimée. Le même montage peut servir de rappel, mais le message doit ouvrir un échange utile. Une demande précise sur un espace permet de poursuivre la conversation sans considérer que le simple envoi du fichier constitue une décision du client.',
    ], examples: [{title: 'Avant un rendez-vous confirmé', text: 'Bonjour, voici la présentation du logement que nous visiterons demain. Vous pourrez revoir le séjour et l’extérieur avant notre rendez-vous. Si une question vous vient sur la disposition, indiquez-la et nous la reprendrons pendant la visite.'}, {title: 'Après la visite', text: 'Bonjour, je vous renvoie la présentation du bien que nous avons visité. Vous aviez une question sur la relation entre la cuisine et le séjour : ces plans peuvent vous aider à la revoir. Souhaitez-vous que nous reprenions ce point ensemble ?'}]},
    {id: 'suivi', title: 'Suivre la réponse plutôt que seulement l’envoi', paragraphs: [
      'Notez la date, la version et le contexte du message. Consignez ensuite la réponse : demande de plan, question sur une caractéristique ou rendez-vous envisagé. Ces informations donnent un suivi plus concret que la seule mention « vidéo envoyée » dans votre dossier.',
      'La lecture d’un fichier ne prouve pas une intention d’achat. Si vous ne disposez pas d’une mesure fiable de consultation, ne l’inventez pas. Reprenez la conversation avec une question liée au projet et gardez votre procédure habituelle pour les relances et les préférences de contact du client.',
    ]},
    {id: 'bienvu', title: 'Préparer et retrouver le contenu dans BienVu', paragraphs: [
      'Créez la présentation du mandat avec ses informations vérifiées et ses photos. Dans l’éditeur, ajustez les textes, le cadrage et la narration pour mettre en avant le sujet utile à votre échange. Téléchargez le rendu depuis le bien et transmettez-le vous-même au client avec votre message.',
      'BienVu rassemble les créations par bien pour retrouver les contenus associés. Le téléchargement d’une vidéo déjà produite ne demande pas un nouveau crédit de génération. Si vous créez un nouveau montage ou de nouvelles animations, vérifiez le récapitulatif avant le lancement et conservez la référence de la version envoyée.',
    ]},
  ],
  faqs: [{question: 'BienVu envoie-t-il la vidéo automatiquement à mes clients ?', answer: 'Vous téléchargez ou partagez le contenu avec le moyen adapté, puis vous transmettez vous-même le message au destinataire. Les exemples proposés ici accompagnent votre échange habituel.'}, {question: 'Faut-il créer une nouvelle vidéo pour chaque contact ?', answer: 'Une version existante peut suffire si elle répond à la question et reste à jour. Personnalisez d’abord le message ; préparez un nouveau montage seulement lorsqu’il apporte une information utile.'}],
  related: ['validation-video-immobiliere-vendeur', 'mesurer-performance-video-immobiliere', 'rediger-annonce-immobiliere-legende'],
  links: [{path: '/biens', label: 'Retrouver les vidéos du mandat'}, {path: '/video-immobiliere-ia', label: 'Créer une présentation à partager'}],
};
