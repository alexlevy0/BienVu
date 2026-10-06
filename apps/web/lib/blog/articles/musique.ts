import type {BlogArticle} from '../types';

export const musiqueArticle: BlogArticle = {
  slug: 'musique-video-immobiliere-droits-mixage', title: 'Musique vidéo immobilière : droits, choix et mixage — BienVu',
  heading: 'Musique pour une vidéo immobilière : droits, choix et mixage',
  description: 'Choisissez une musique pour vos vidéos immobilières : vérification de la licence, usage commercial, ambiance, découpe et mixage avec la voix off.',
  excerpt: 'Vérifier la licence, sélectionner une ambiance et équilibrer la piste avec la narration : les étapes avant publication.',
  category: 'video', keyword: 'musique vidéo immobilière', image: 'lyon', imageAlt: 'Intérieur d’un loft illustrant une vidéo immobilière avec musique',
  intro: [
    'La musique d’une vidéo immobilière accompagne les images et le rythme. Une piste discrète peut relier les plans, tandis qu’un morceau très marqué peut attirer l’attention sur l’habillage. Le choix dépend du bien, de la voix et du contexte de diffusion.',
    'Commencez par les droits d’utilisation. Une piste accessible en ligne ou présente dans une application doit être couverte par une licence adaptée à votre usage. Préparez ensuite la portion utilisée, son niveau et sa durée. Voici un parcours pratique pour intégrer la musique à une présentation d’agence.',
  ],
  takeaways: ['Conservez une licence qui couvre l’usage prévu et les destinations.', 'Choisissez un extrait qui laisse la voix compréhensible.', 'Écoutez le fichier exporté et vérifiez le résultat de la publication.'],
  sections: [
    {id: 'licence', title: 'Vérifier ce que la licence autorise', paragraphs: [
      'Une musique dite libre de droits reste soumise aux conditions de sa licence. Vérifiez l’usage commercial, l’association à une vidéo, les plateformes, les publicités éventuelles et les obligations de crédit. Conservez le document, la preuve d’achat si nécessaire et la référence du morceau avec le projet.',
      'Les licences Creative Commons comportent plusieurs variantes. La clause NC restreint les usages commerciaux ; la clause ND peut empêcher la diffusion d’une adaptation. Pour une campagne d’agence, choisissez une autorisation qui couvre explicitement votre projet et demandez une clarification au titulaire des droits si une condition reste incertaine.',
    ], sources: [{url: 'https://creativecommons.org/faq/#does-my-use-violate-the-noncommercial-clause-of-the-licenses', label: 'Creative Commons — conditions d’usage non commercial'}, {url: 'https://creativecommons.org/licenses/by-nd/4.0/legalcode.fr', label: 'Creative Commons — licence sans adaptation'}]},
    {id: 'plateformes', title: 'Contrôler les droits pour chaque destination', paragraphs: [
      'La bibliothèque musicale sous licence d’Instagram est destinée aux usages personnels non commerciaux ; Meta indique que certains comptes professionnels et types de publications y ont un accès restreint. Une piste disponible dans l’interface ne permet donc pas de conclure que tous les usages de votre agence sont couverts.',
      'Vérifiez séparément le partage sur Instagram, Facebook, le site de l’agence et les campagnes publicitaires. Une autorisation liée à une plateforme peut ne pas couvrir les autres. Si vous souhaitez réutiliser un même fichier sur plusieurs supports, recherchez une licence qui les prévoit clairement.',
    ], sources: [{url: 'https://www.facebook.com/help/instagram/402084904469945', label: 'Meta — accès à la bibliothèque musicale sous licence d’Instagram'}]},
    {id: 'ambiance', title: 'Choisir une ambiance qui accompagne les images', paragraphs: [
      'Écoutez quelques pistes avec le premier plan de la vidéo. Une maison avec jardin peut se présenter avec une ambiance calme ; un loft peut accueillir un rythme plus marqué. Ce sont des choix éditoriaux à tester, et non des règles liées à la valeur ou à la catégorie du bien.',
      'Les morceaux instrumentaux simplifient souvent la coexistence avec une voix off, car ils n’ajoutent pas de paroles à comprendre. Gardez une intensité cohérente entre les plans. Un changement brutal de style ou de volume peut interrompre la lecture de la présentation.',
    ]},
    {id: 'extrait', title: 'Choisir la bonne portion du morceau', paragraphs: [
      'Une introduction musicale peut être très longue ou comporter une montée qui arrive après la fin de votre vidéo. Cherchez un passage qui correspond à la durée du montage et à son rythme. Le point de départ de la piste source mérite autant d’attention que son volume.',
      'Évitez de couper au milieu d’une phrase musicale lorsque cela produit une rupture audible. Vous pouvez sélectionner un autre extrait ou adapter la fin avec un fondu. Pour une vidéo de vingt à quarante secondes, contrôlez particulièrement l’entrée et les derniers instants.',
    ], list: {ordered: true, items: ['Écouter le passage dans le contexte du montage.', 'Choisir le point de départ dans la source.', 'Ajuster la durée utilisée à la vidéo.', 'Contrôler l’entrée, la sortie et les éventuels changements d’intensité.']}},
    {id: 'mixage', title: 'Garder la voix intelligible', paragraphs: [
      'Commencez par écouter la narration seule, puis ajoutez la musique à un niveau modéré. La voix doit rester compréhensible sur les haut-parleurs d’un téléphone. Si une portion musicale masque une phrase, réduisez son niveau ou choisissez un extrait moins dense.',
      'Le pourcentage de volume affiché dans un éditeur dépend aussi du niveau du fichier source : deux pistes réglées au même pourcentage peuvent sembler différentes. Utilisez l’écoute comme contrôle final et vérifiez les moments où la voix est plus douce, ainsi que la conclusion.',
    ]},
    {id: 'bibliotheque', title: 'Utiliser la bibliothèque de musique BienVu', paragraphs: [
      'L’éditeur BienVu propose les pistes mises à disposition dans la banque de musiques du service. Vous pouvez faire glisser une musique depuis les sources vers la timeline. Sa durée s’adapte au montage, et les réglages permettent de choisir la portion utilisée et de contrôler son niveau.',
      'La forme d’onde aide à repérer les zones plus denses ou les silences et complète l’écoute. Utilisez les pistes mises à disposition pour votre montage. Pour toute source supplémentaire, vérifiez les droits correspondant à votre diffusion et conservez la licence avec le projet.',
    ]},
    {id: 'validation', title: 'Une vérification audio avant publication', paragraphs: [
      'Lisez la vidéo du début à la fin au casque, puis sur un téléphone. Repérez les débuts trop forts, les coupures, les silences involontaires et les phrases masquées. Vérifiez que la piste ne dépasse pas la vidéo et que le dernier plan garde une sortie propre.',
      'Après diffusion, contrôlez le résultat sur le réseau concerné. Si une plateforme signale un problème de droits, consultez les informations disponibles et la licence conservée. Vous pouvez aussi préparer une version avec une autre musique ou sans piste musicale, tout en gardant la narration et les images du projet.',
    ]},
  ],
  faqs: [{question: 'Puis-je utiliser une chanson connue dans une vidéo d’agence ?', answer: 'Il faut disposer des autorisations adaptées à votre usage, notamment commercial et audiovisuel. Vérifiez les conditions auprès du titulaire des droits ou choisissez une piste dont la licence couvre clairement le projet.'}, {question: 'Une musique libre de droits doit-elle être gratuite ?', answer: 'Son prix et ses conditions sont deux sujets distincts. Une licence peut être payante et prévoir des usages précis ; consultez le document avant d’utiliser le morceau.'}],
  related: ['voix-off-immobiliere-exemples-textes', 'video-immobiliere-photos-duree-montage', 'calendrier-editorial-immobilier'],
  links: [{path: '/editeur-video-immobilier', label: 'Découvrir les pistes et le mixage dans l’éditeur'}, {path: '/conditions', label: 'Lire les règles d’utilisation des contenus'}],
};
