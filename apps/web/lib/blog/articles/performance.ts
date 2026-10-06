import {blogSecondBatchPublishedAt, type BlogArticle} from '../types';

export const performanceArticle: BlogArticle = {
  publishedAt: blogSecondBatchPublishedAt,
  slug: 'mesurer-performance-video-immobiliere', title: 'Mesurer la performance de vos vidéos immobilières — BienVu',
  heading: 'Mesurer la performance d’une vidéo immobilière, au-delà des vues',
  description: 'Suivez vos vidéos immobilières avec des indicateurs utiles : consultations, demandes de fiche, contacts qualifiés, visites et budget par mandat.',
  excerpt: 'Reliez chaque vidéo à un objectif et à un mandat pour comprendre les échanges qu’elle apporte à votre agence.',
  category: 'budget', keyword: 'performance vidéo immobilière', image: 'lyon', imageAlt: 'Loft illustrant un mandat dont la diffusion vidéo est suivie',
  intro: [
    'Une vidéo peut être vue plusieurs fois sans provoquer une prise de contact. Une autre peut toucher moins de personnes et déclencher une question précise sur le logement. Pour analyser la performance de vos vidéos immobilières, commencez donc par leur objectif : faire découvrir un mandat, obtenir une demande de fiche ou préparer une visite.',
    'Le suivi devient plus utile lorsque vous reliez la création, sa diffusion et les réponses reçues. Vous n’avez pas besoin d’un tableau compliqué pour commencer. Une référence de bien, une version identifiée, une période d’observation et quelques définitions communes permettent déjà de comparer vos actions sans inventer de résultats.',
  ],
  takeaways: ['Définissez ce que vous voulez mesurer avant la publication.', 'Gardez les définitions et les périodes comparables entre vos relevés.', 'Distinguez visibilité, intérêt exprimé et résultat commercial.'],
  sections: [
    {id: 'objectif', title: 'Choisir un indicateur lié à l’objectif du contenu', paragraphs: [
      'Une vidéo de découverte peut être évaluée sur sa visibilité et sur les échanges qu’elle ouvre. Une vidéo envoyée à un client déjà intéressé se juge plutôt sur la réponse à sa question et la suite de la conversation. Les mêmes chiffres ne décrivent pas ces deux situations.',
      'Écrivez l’objectif dans votre fiche de suivi avant la diffusion. Définissez ce qui comptera comme une demande utile : une question sur la configuration, une demande de plan ou un rendez-vous envisagé. Cette règle commune évite que chaque membre de l’équipe classe différemment les réponses reçues.',
    ], table: {caption: 'Associer l’objectif à une observation', columns: ['Objectif', 'Observation utile', 'Limite à garder en tête'], rows: [['Faire découvrir le bien', 'Données de visibilité du réseau', 'Une vue ne signifie pas une demande'], ['Obtenir une fiche', 'Demandes identifiées et pertinentes', 'Le même contact peut écrire plusieurs fois'], ['Préparer une visite', 'Questions résolues et rendez-vous', 'Le client peut connaître le bien par ailleurs'], ['Améliorer le montage', 'Retours sur la compréhension', 'Le mandat influence aussi les réactions']]}},
    {id: 'definition', title: 'Lire les définitions propres à chaque plateforme', paragraphs: [
      'Les réseaux ne comptent pas tous une vue de la même manière. L’aide YouTube distingue notamment le démarrage ou la relecture d’un Short et les vues engagées. Avant de comparer des publications, consultez la définition de l’indicateur que vous relevez dans le réseau concerné.',
      'Ne rassemblez pas automatiquement toutes les vues dans un total présenté comme un nombre de personnes. Une même personne peut revoir une vidéo ou découvrir le bien sur plusieurs canaux. Conservez les mesures séparées et indiquez la plateforme, la période et la définition lorsque vous les partagez avec l’équipe.',
    ], sources: [{url: 'https://support.google.com/youtube/answer/10059070?hl=fr-419', label: 'YouTube — vues et vues engagées des Shorts'}]},
    {id: 'tableau', title: 'Créer une fiche de suivi par mandat et par version', paragraphs: [
      'Notez la référence du bien, le nom de la vidéo, son format, son angle et les destinations. Ajoutez la date de publication et le moment auquel vous relevez les résultats. Une mesure faite le lendemain ne se compare pas directement à une autre faite plusieurs semaines après la diffusion.',
      'Gardez aussi les changements intervenus pendant la période : prix, nouvelles photos ou disponibilité. Si une publication accompagne une baisse de prix, vous ne pouvez pas attribuer automatiquement toutes les nouvelles demandes à son montage. Le contexte explique une partie importante des variations observées.',
    ], list: {items: ['Référence du mandat et version du contenu.', 'Objectif, angle de présentation et durée.', 'Réseau, date de diffusion et période de mesure.', 'Indicateurs disponibles et définition utilisée.', 'Demandes reçues, suite donnée et changements du mandat.']}},
    {id: 'attribution', title: 'Relier les demandes à la vidéo avec prudence', paragraphs: [
      'Quand un contact arrive, demandez simplement comment il a découvert le logement. S’il mentionne une vidéo précise, notez cette information avec la demande. Si plusieurs canaux ont participé à sa découverte, conservez cette nuance au lieu d’imposer une source unique.',
      'Une visite ou une vente peut résulter d’un ensemble d’actions : annonce, recommandation, échange avec l’agence et présentation vidéo. Utilisez les informations disponibles pour comprendre le parcours, sans transformer un dernier clic ou un message en preuve que le contenu a produit seul tout le résultat.',
    ], examples: [{title: 'Une qualification simple de l’échange', text: '« Où avez-vous découvert ce logement ? » Puis : « La vidéo vous a-t-elle aidé à comprendre un espace en particulier ? » Notez la réponse avec la référence du mandat et la question du contact.', note: 'Recueillez uniquement les informations utiles à votre suivi habituel, sans déduire une consultation que vous ne mesurez pas.'}]},
    {id: 'cout', title: 'Ajouter le budget réellement consacré au contenu', paragraphs: [
      'Additionnez la part de coût des outils, le temps de préparation et les dépenses de diffusion pertinentes. Si vous utilisez un abonnement, indiquez votre méthode de répartition sur les créations. Une allocation théorique de crédits et une dépense de publicité ne sont pas la même chose.',
      'Vous pouvez calculer un coût par demande attribuable en divisant le budget retenu par le nombre de demandes répondant à votre définition. Si aucune demande n’est identifiée, indiquez ce résultat plutôt que de fabriquer un coût unitaire. Gardez la même base HT ou TTC dans tous les montants comparés.',
    ], examples: [{title: 'Calcul fictif de suivi', text: 'Une campagne représente 60 € dans votre méthode de budget. Trois demandes qualifiées lui sont attribuées avec les éléments disponibles. Le coût observé par demande est de 20 €. Deux rendez-vous ont ensuite lieu : ce résultat doit être suivi séparément.', note: 'Hypothèse pédagogique, sans promesse de résultat ni chiffre issu des clients BienVu.'}]},
    {id: 'comparaison', title: 'Tester une amélioration sans changer toute la vidéo', paragraphs: [
      'Choisissez une modification : première image, phrase d’ouverture, ordre des plans ou invitation à demander la fiche. Gardez les autres éléments aussi stables que possible et notez le changement. Vous pourrez discuter de son effet avec davantage de contexte qu’en comparant deux créations entièrement différentes.',
      'Les comparaisons restent imparfaites lorsque les biens ou les périodes diffèrent. Un logement très recherché et un mandat atypique ne fournissent pas un test identique. Utilisez les observations pour proposer le prochain essai, et recherchez les difficultés répétées : texte illisible, information absente ou destination de contact peu claire.',
    ]},
    {id: 'routine', title: 'Installer une routine de lecture des résultats', paragraphs: [
      'Réservez un moment régulier pour examiner les publications, les demandes et les questions de l’équipe. Choisissez quelques enseignements concrets à appliquer aux prochains mandats. Une liste courte de modifications utiles est plus facile à mettre en œuvre qu’un grand rapport sans décision.',
      'BienVu permet de retrouver les créations d’un bien et les résultats de diffusion par réseau. Pour les données d’audience et les échanges clients, complétez votre suivi avec les informations réellement accessibles dans les plateformes et dans vos outils d’agence. Le statut « publié » confirme une diffusion ; il ne démontre pas son audience ni sa rentabilité commerciale.',
    ]},
  ],
  faqs: [{question: 'Peut-on comparer directement les vues de TikTok, Instagram et YouTube ?', answer: 'Vérifiez leurs définitions et conservez les mesures par réseau. Une somme de vues ne correspond pas nécessairement à un nombre de personnes distinctes ni à des demandes commerciales.'}, {question: 'Quel indicateur choisir pour commencer ?', answer: 'Partez de l’objectif de la vidéo. Pour une présentation de bien, vous pouvez suivre les demandes de fiche ou les échanges pertinents, avec la référence du mandat et la source connue.'}],
  related: ['cout-video-immobiliere-budget-credits', 'calendrier-editorial-immobilier', 'youtube-shorts-immobilier-agence'],
  links: [{path: '/publications', label: 'Consulter les résultats de diffusion'}, {path: '/abonnement', label: 'Prévoir le budget de génération'}],
};
