import {blogThirdBatchPublishedAt, type BlogArticle} from '../types';

export const agencyShowcaseArticle: BlogArticle = {
  publishedAt: blogThirdBatchPublishedAt,
  slug: 'vitrine-video-agence-immobiliere', title: 'Vitrine vidéo d’agence immobilière : méthode — BienVu',
  heading: 'Créer une vitrine vidéo pour son agence immobilière',
  description: 'Structurez une vitrine d’agence immobilière avec vos vidéos : identité, sélection des biens, contacts et parcours mobile avec Ma vitrine de BienVu.',
  excerpt: 'Une page à partager pour présenter votre agence et une sélection de biens, avec un parcours qui conduit naturellement vers le contact.',
  category: 'strategie', keyword: 'vitrine vidéo agence immobilière', image: 'lyon',
  imageAlt: 'Intérieur lyonnais illustrant les biens présentés sur une vitrine d’agence',
  intro: [
    'Une vitrine vidéo d’agence immobilière rassemble une présentation de votre équipe ou de votre enseigne et des biens à découvrir en images. Elle offre une destination commune aux liens envoyés après un échange, aux visiteurs de vos réseaux et aux personnes qui souhaitent comprendre votre sélection avant de vous contacter.',
    'Dans BienVu, Ma vitrine permet de composer cette page à partir de votre identité et des biens choisis. Le principal travail consiste à organiser le parcours : qui êtes-vous, quels biens montrez-vous et comment poursuivre la conversation ? Une accumulation de vidéos sans contexte répond moins bien à ces questions qu’une sélection claire et tenue à jour.',
  ],
  takeaways: ['Donnez une identité immédiatement reconnaissable à la page.', 'Sélectionnez des biens à jour et des couvertures qui les distinguent.', 'Testez le parcours de découverte et de contact sur téléphone.'],
  sections: [
    {id: 'objectif', title: 'Définir la destination de votre vitrine', paragraphs: [
      'Décidez d’abord quand vous partagerez la page. Après un premier appel, elle peut montrer votre sélection disponible. Auprès d’un propriétaire, elle peut illustrer votre façon de présenter les mandats. Depuis les réseaux, elle sert de point de passage entre une courte découverte et une demande d’information plus précise.',
      'Ces usages ne demandent pas forcément des pages différentes, mais ils invitent à clarifier le message d’accueil. Une phrase simple sur votre secteur et votre accompagnement suffit souvent. Gardez les informations indispensables visibles avant de demander au visiteur de parcourir toute la galerie.',
    ]},
    {id: 'identite', title: 'Installer l’identité de l’agence sans alourdir la page', paragraphs: [
      'Choisissez un nom public lisible, un logo adapté à son emplacement et une couverture qui donne le ton de votre agence. Une image de secteur ou un visuel représentatif peut fonctionner si vous êtes autorisé à le diffuser. Vérifiez le recadrage mobile : un texte inscrit tout au bord d’une couverture risque de disparaître.',
      'Préparez ensuite une description courte et des coordonnées actualisées. Évitez les formules qui pourraient appartenir à n’importe quelle agence. Une présentation précise du territoire et du type d’accompagnement aide davantage le visiteur à comprendre si votre sélection correspond à sa recherche.',
    ], examples: [{title: 'Présentation d’une agence fictive', text: 'Maison Lyon accompagne vos projets immobiliers à Lyon et dans les communes voisines. Découvrez notre sélection de biens en vidéo, puis échangeons sur les espaces et le secteur que vous recherchez.', note: 'Adaptez le secteur et les services à l’activité réelle de votre agence.'}]},
    {id: 'selection', title: 'Choisir les biens qui composent la galerie', paragraphs: [
      'Retenez une sélection cohérente et disponible. Un bien dont les informations sont incomplètes ou dont la vidéo n’est plus représentative peut créer des demandes inutiles. Vérifiez la transaction, les caractéristiques publiques, la couverture et les photos prévues pour chaque fiche avant de rendre l’ensemble visible.',
      'Distinguez la couverture générale de votre agence des médias publics de chaque bien. Un logo et une bannière ne remplacent pas la sélection de photos d’une annonce. Regardez chaque carte comme une entrée autonome : le visiteur doit reconnaître le logement avant même d’ouvrir la vidéo ou la fiche détaillée.',
    ], table: {caption: 'Deux niveaux d’images à préparer', columns: ['Niveau', 'Contenu utile', 'Vérification'], rows: [
      ['Agence', 'Logo et couverture générale', 'Identité lisible dans les différents recadrages'],
      ['Carte d’un bien', 'Photo de couverture représentative', 'Logement identifiable dans la galerie'],
      ['Fiche publique', 'Photos et vidéo sélectionnées', 'Médias cohérents avec le bien présenté'],
      ['Contact', 'Coordonnées et présentation', 'Informations à jour et facilement accessibles'],
    ]}},
    {id: 'parcours', title: 'Faire de la vidéo une étape vers la fiche du bien', paragraphs: [
      'Une vidéo attire l’attention sur les espaces et les atouts principaux. Elle n’a pas besoin de contenir toutes les informations du dossier pour être utile. Le visiteur doit cependant pouvoir poursuivre vers la fiche du bien et retrouver les caractéristiques actualisées, puis un moyen clair de poser sa question.',
      'Vérifiez ce parcours pour plusieurs annonces : ouverture d’une vidéo, retour à la sélection, consultation d’une fiche et contact. Si vous ajoutez des filtres, assurez-vous que les biens sont correctement classés. Une expérience simple reste importante lorsque la personne arrive depuis un lien ouvert dans une messagerie.',
    ]},
    {id: 'mobile', title: 'Relire la vitrine sur un téléphone', paragraphs: [
      'Regardez la page sur un écran mobile réel. Le nom de l’agence, les couvertures et les boutons de contact doivent rester compréhensibles. Une belle vue sur ordinateur peut devenir confuse si les titres se coupent, si les photos se ressemblent trop ou si le visiteur doit chercher comment revenir à la galerie.',
      'Lisez aussi une vidéo dans son format d’origine. Contrôlez les textes, le son et la taille des éléments importants. Une vitrine constitue un ensemble : la cohérence entre ses cartes et les vidéos ouvertes compte autant que l’apparence de la première section.',
    ]},
    {id: 'publication', title: 'Publier une première sélection, puis la maintenir', paragraphs: [
      'Dans Ma vitrine, préparez les informations publiques de l’agence, ajoutez les médias d’identité et sélectionnez les biens. Utilisez l’aperçu pour vérifier le résultat avant de le rendre public. Consultez les éventuels messages de préparation : ils peuvent concerner un bien sélectionné plutôt que la couverture générale de votre agence.',
      'Une fois la page publiée, partagez son lien dans les échanges appropriés et prévoyez un contrôle régulier de la sélection. Actualisez les biens, les contacts et les anciennes présentations. Notez également les questions reçues : elles indiquent parfois qu’une carte ou une description manque de précision, plutôt qu’un besoin d’ajouter davantage de contenu.',
    ]},
  ],
  faqs: [
    {question: 'Ma vitrine remplace-t-elle tout le site de mon agence ?', answer: 'Elle fournit une destination dédiée à votre présentation et à une sélection de biens en vidéo. Le reste de votre site peut conserver ses autres fonctions, ses contenus et ses informations détaillées.'},
    {question: 'Faut-il publier tous les biens disponibles ?', answer: 'Une sélection contrôlée est préférable à une galerie remplie de fiches incomplètes. Choisissez les biens que vous souhaitez présenter publiquement et vérifiez leurs informations et médias.'},
    {question: 'Pourquoi préparer une photo de couverture par bien ?', answer: 'Elle identifie l’annonce dans la galerie. La couverture de l’agence présente votre identité générale ; celle du bien aide à reconnaître le logement et à choisir la fiche à consulter.'},
  ],
  related: ['referencement-local-agence-immobiliere-video', 'identite-visuelle-agence-immobiliere-videos', 'video-immobiliere-rendez-vous-vendeur-mandat'],
  links: [{path: '/ma-vitrine/exemple', label: 'Voir une vitrine d’agence de démonstration'}, {path: '/', label: 'Préparer les vidéos de vos biens'}, {path: '/modeles-video-immobilier', label: 'Harmoniser les contenus de votre agence'}],
};
