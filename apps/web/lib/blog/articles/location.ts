import {blogSecondBatchPublishedAt, type BlogArticle} from '../types';

export const rentalArticle: BlogArticle = {
  publishedAt: blogSecondBatchPublishedAt,
  slug: 'video-annonce-location-immobiliere', title: 'Vidéo d’annonce de location immobilière : méthode — BienVu',
  heading: 'Vidéo d’annonce de location immobilière : présenter le logement et ses conditions',
  description: 'Préparez une vidéo pour une annonce de location : pièces, équipements vérifiés, loyer, textes et suivi des versions avant la diffusion.',
  excerpt: 'Une présentation de location doit permettre de comprendre le logement et de retrouver ses conditions actualisées, même dans un montage court.',
  category: 'redaction', keyword: 'vidéo annonce location immobilière', image: 'paris', imageAlt: 'Appartement lumineux illustrant une annonce de location',
  intro: [
    'Pour une annonce de location, une courte vidéo peut montrer la disposition des pièces et les équipements qui apparaissent dans les photos. Elle doit aussi laisser comprendre que le logement est proposé à louer. Une présentation qui ressemble à une vente ou qui affiche un montant sans contexte risque de créer des demandes inutiles.',
    'Préparez une fiche de référence avec les informations vérifiées et les conditions actualisées. Le montage peut ensuite sélectionner les images et les textes utiles à la découverte. La vidéo accompagne l’annonce et les échanges avec les candidats ; elle ne remplace pas les informations nécessaires ni la vérification de votre publication.',
  ],
  takeaways: ['Indiquez clairement la location et la nature du logement.', 'Montrez la disposition et les équipements réellement proposés.', 'Vérifiez les montants, les mentions applicables et les anciennes versions avant diffusion.'],
  sections: [
    {id: 'reference', title: 'Préparer une fiche de référence avant le montage', paragraphs: [
      'Rassemblez le type de bien, la ville, la surface, le nombre de pièces et la configuration. Précisez si le logement est meublé et quels équipements sont effectivement compris. Les objets visibles sur les photos ne font pas tous nécessairement partie de la location : vérifiez ce point avant de les présenter comme un avantage.',
      'Préparez également le montant à afficher, les charges et la disponibilité confirmée. Gardez une source de référence pour chacun de ces éléments. Lorsque vous faites évoluer l’annonce, cette base commune aide à mettre à jour les textes de la vidéo, sa légende et la fiche accessible aux candidats.',
    ], table: {caption: 'La base de préparation d’une vidéo de location', columns: ['Information', 'Question de contrôle', 'Utilisation dans la présentation'], rows: [['Transaction', 'S’agit-il clairement d’une location ?', 'Titre et contexte du montant'], ['Configuration', 'Pièces et espaces sont-ils confirmés ?', 'Ordre des plans et narration'], ['Équipements', 'Sont-ils inclus dans la proposition ?', 'Arguments visuels vérifiés'], ['Conditions', 'Montant et disponibilité sont-ils à jour ?', 'Texte et fiche de référence']]}},
    {id: 'mentions', title: 'Vérifier les informations applicables à l’annonce', paragraphs: [
      'Service Public précise les mentions d’une annonce de location, notamment sur le loyer, les charges, la surface, les honoraires, les diagnostics et les risques. Les informations attendues varient selon la commune et le logement. Vérifiez la fiche officielle et le dossier du mandat avant diffusion ; les textes d’exemple de cet article ne constituent pas une annonce complète.',
      'Préparez la vidéo avec cette vérification déjà effectuée. Choisissez ensuite une mise en page qui laisse lire les informations nécessaires et conservez une fiche actualisée pour les demandes détaillées. Si une condition change, reprenez les éléments concernés dans chaque version diffusée.',
    ], sources: [{url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F35323', label: 'Service Public — informations d’une annonce de location'}]},
    {id: 'images', title: 'Montrer ce qui aide à comprendre le logement', paragraphs: [
      'Une vue d’ensemble du séjour ou de la pièce principale situe le logement. Complétez avec la cuisine, les chambres et les équipements utiles lorsqu’ils sont confirmés. Une progression qui suit les espaces permet de comprendre leur organisation sans reproduire une visite exhaustive.',
      'Pour un petit logement, évitez de masquer la configuration avec des détails décoratifs. Montrez les rangements, les ouvertures et la relation entre les usages lorsqu’ils apparaissent dans les photos. Un grand angle ou une animation ne doit pas faire croire à une surface ou à un espace qui n’existe pas.',
    ]},
    {id: 'texte', title: 'Écrire une présentation courte et factuelle', paragraphs: [
      'Situez le logement, puis expliquez deux ou trois caractéristiques vérifiées. Distinguez le nombre de pièces et le nombre de chambres. Une phrase sur la disposition peut être plus utile qu’une promesse générale de confort, surtout lorsque le candidat cherche à savoir comment son quotidien s’organiserait dans l’espace.',
      'Le texte visible porte les repères essentiels tandis que la narration peut guider la lecture des photos. Faites relire les montants et les unités. Regardez aussi la présentation sans le son pour vérifier que le spectateur comprend bien la transaction et peut retrouver les informations de contact.',
    ], examples: [{title: 'Trame pour un logement fictif', text: 'À louer à [ville] : un [type de logement] de [surface] m². Voici la pièce principale, puis la cuisine et les espaces complémentaires. Retrouvez les conditions actualisées de location dans la fiche et contactez notre agence pour obtenir les informations de visite.', note: 'Complétez avec les faits du mandat, les montants et toutes les mentions applicables au logement.'}]},
    {id: 'loyer', title: 'Éviter l’ambiguïté entre montant et transaction', paragraphs: [
      'Ne reprenez pas un modèle de vente sans vérifier le libellé du montant. Le lecteur doit comprendre qu’il s’agit d’une proposition de location et retrouver les conditions qui correspondent à l’annonce. Contrôlez la même information dans la vidéo, le texte de publication et la fiche du bien.',
      'Si les données importées sont incomplètes, revenez au formulaire ou au dossier du mandat avant de produire la vidéo. Un montant isolé ne permet pas de déduire les charges, les conditions ou la disponibilité. La génération de texte doit partir des informations renseignées, sans compléter ces éléments par supposition.',
    ]},
    {id: 'bienvu', title: 'Préparer une version de location dans BienVu', paragraphs: [
      'Lors de la saisie manuelle, sélectionnez la transaction Location et renseignez les caractéristiques confirmées. Ajoutez les photos, choisissez la couverture et l’ordre des espaces. Préparez la narration à partir d’une description détaillée, puis vérifiez le rendu des textes avant de lancer votre diffusion.',
      'Dans l’éditeur, adaptez les cadrages et le rythme au logement. Les mouvements classiques peuvent suffire pour une présentation simple ; les animations IA sont facultatives et doivent être contrôlées pour leur fidélité. Gardez la vidéo avec le bien afin de retrouver les variantes envoyées ou publiées.',
    ]},
    {id: 'disponibilite', title: 'Maintenir la cohérence quand la location évolue', paragraphs: [
      'Notez les destinations et les versions diffusées. Si le logement n’est plus disponible ou si une condition change, vérifiez les programmations et les contenus déjà publiés. Une ancienne présentation peut continuer à provoquer des demandes lorsque personne ne relie son statut à celui du mandat.',
      'Préparez également la réponse aux personnes intéressées : fiche à jour, précision sur la disposition ou organisation d’un échange. Une vidéo utile peut réduire une incompréhension, mais elle ne résout pas toutes les questions. Consignez celles qui reviennent pour améliorer vos prochains textes et les informations préparées en amont.',
    ]},
  ],
  faqs: [{question: 'Une vidéo peut-elle remplacer toute l’annonce de location ?', answer: 'Elle présente des espaces et accompagne la communication. Préparez les informations et les mentions applicables avec le dossier du logement, puis vérifiez la diffusion complète et la fiche actualisée.'}, {question: 'Puis-je animer les photos d’un logement à louer ?', answer: 'Oui, l’animation IA est une option de création. Vérifiez que le résultat reste fidèle aux espaces, aux équipements et aux caractéristiques réellement proposés.'}],
  related: ['rediger-annonce-immobiliere-legende', 'photos-immobilieres-smartphone', 'envoyer-video-immobiliere-acquereur'],
  links: [{path: '/', label: 'Préparer votre annonce de location'}, {path: '/sources', label: 'Vérifier la compatibilité d’un lien d’annonce'}],
};
