import {blogSecondBatchPublishedAt, type BlogArticle} from '../types';

export const subtitlesArticle: BlogArticle = {
  publishedAt: blogSecondBatchPublishedAt,
  slug: 'sous-titres-video-immobiliere-lisibilite', title: 'Sous-titres de vidéo immobilière : rendre le texte lisible — BienVu',
  heading: 'Sous-titres de vidéo immobilière : rester lisible, même sans le son',
  description: 'Améliorez les sous-titres de vos vidéos immobilières : relecture, synchronisation, contraste, emplacement et contrôle sur un téléphone avant publication.',
  excerpt: 'Un prix, un nom de quartier ou une phrase de narration doivent se comprendre rapidement, sans cacher les espaces que vous présentez.',
  category: 'video', keyword: 'sous-titres vidéo immobilière', image: 'lyon', imageAlt: 'Pièce lumineuse illustrant la lisibilité des textes d’une vidéo',
  intro: [
    'Une présentation immobilière peut être regardée dans un endroit où le son est coupé. Elle peut aussi être utile à une personne qui comprend mieux une information écrite. Les sous-titres donnent accès à la narration, tandis que les textes du montage mettent en avant les repères du bien. Préparer ces deux niveaux évite de transformer chaque plan en écran rempli de mots.',
    'Commencez par une voix off claire et un texte vérifié. Corrigez ensuite la transcription, contrôlez sa place dans l’image et regardez la vidéo sur un téléphone. Le travail consiste à rendre les informations compréhensibles tout en conservant la lecture des pièces, des ouvertures et des détails utiles.',
  ],
  takeaways: ['Les sous-titres retranscrivent la narration ; les titres apportent des repères visuels.', 'Relisez les chiffres et les noms de lieux, puis contrôlez la synchronisation.', 'Vérifiez la vidéo sans le son et dans l’aperçu de la destination.'],
  sections: [
    {id: 'role', title: 'Distinguer sous-titres et informations superposées', paragraphs: [
      'Le W3C décrit les sous-titres accessibles comme une version écrite de la parole et des informations sonores nécessaires à la compréhension, synchronisée avec l’audio. Un simple titre « trois pièces » ne remplace donc pas une phrase qui explique l’organisation du logement. Il donne un repère, mais ne transmet pas tout ce que la narration apporte.',
      'Dans une vidéo immobilière, gardez un rôle à chaque texte. Le titre peut situer la ville, un cartouche peut porter la surface et les sous-titres peuvent restituer la présentation orale. Si les trois répètent la même chose en même temps, simplifiez la mise en page ou le texte de voix off pour libérer de la place.',
    ], sources: [{url: 'https://www.w3.org/WAI/media/av/captions/', label: 'W3C WAI — sous-titres et informations audio'}]},
    {id: 'redaction', title: 'Écrire une narration facile à suivre', paragraphs: [
      'Des phrases courtes facilitent la relecture et la mise en rythme. Donnez une information principale par phrase et évitez les listes de caractéristiques récitées sans contexte. Une formulation qui explique le lien entre le séjour et la terrasse apporte une lecture de l’espace, là où une accumulation d’adjectifs n’ajoute souvent aucun fait.',
      'Lisez le script à voix haute avant de générer la narration. Une phrase difficile à prononcer risque aussi d’être difficile à lire rapidement. Retirez les répétitions et vérifiez les termes précis du mandat. Les sous-titres ne doivent pas servir à compenser un texte oral trop dense pour la durée choisie.',
    ], examples: [{title: 'Simplifier une phrase de présentation', text: 'Version chargée : « Découvrez ce très bel appartement lumineux et idéalement agencé qui dispose d’un agréable séjour donnant accès à un extérieur. » Version plus précise : « Le séjour s’ouvre sur le balcon. Voici comment ces deux espaces se relient. »', note: 'Utilisez cette reformulation seulement si les caractéristiques correspondent au bien.'}]},
    {id: 'relecture', title: 'Corriger la transcription avant de regarder le style', paragraphs: [
      'Relisez d’abord le contenu, sans vous laisser distraire par la typographie. Les noms de communes, les quartiers, les montants et les unités demandent une attention particulière. Une surface mal transcrite change une information importante ; une belle mise en page ne corrige pas cette erreur.',
      'Comparez le texte à la narration et à la fiche du mandat. Vérifiez les accords, la ponctuation et la manière d’écrire les chiffres. Gardez une présentation cohérente des mètres carrés, des pièces et du prix entre les titres, la légende et la vidéo. Une dernière relecture par une autre personne peut repérer un détail devenu familier pour le monteur.',
    ], list: {items: ['Ville, quartier et référence du bien.', 'Surface, nombre de pièces et montant exact.', 'Mots qui décrivent une caractéristique vérifiée.', 'Ponctuation et séparation des phrases.', 'Coordonnées et invitation à contacter l’agence.']}},
    {id: 'mise-en-page', title: 'Choisir une taille, un contraste et un emplacement', paragraphs: [
      'Testez la taille sur un vrai écran de téléphone. Un texte qui semble lisible dans une grande fenêtre de montage peut devenir trop petit une fois publié. Une typographie simple, un contraste suffisant et une position stable facilitent la lecture. Évitez de changer de style à chaque plan sans raison liée au contenu.',
      'Les images immobilières contiennent parfois des fenêtres très claires, des murs blancs et des meubles sombres dans le même cadre. Vérifiez le texte sur chaque photo, et pas uniquement sur la première. Une ombre ou un fond discret peut aider, mais il doit laisser voir les informations spatiales importantes de la scène.',
    ]},
    {id: 'rythme', title: 'Laisser le temps de lire sans désynchroniser la voix', paragraphs: [
      'Une phrase doit apparaître au moment où elle est prononcée et rester compréhensible à la lecture normale. Contrôlez surtout les transitions de plans, les débuts et les fins de phrase. Si la narration présente une chambre pendant que l’image montre la cuisine, le problème concerne aussi le montage, même si les mots sont exacts.',
      'Quand une portion semble trop rapide, raccourcissez la formulation ou ajustez le rythme du montage. Évitez d’entasser une longue phrase dans un cartouche très étroit. Le contrôle se fait en lecture continue : la pause permet de corriger un mot, mais ne démontre pas que le spectateur aura le temps de le lire.',
    ], table: {caption: 'Contrôles à effectuer en lecture continue', columns: ['Point à vérifier', 'Ce que vous observez', 'Correction possible'], rows: [['Texte et parole', 'Le même message au même moment', 'Revoir la narration ou le timing'], ['Image et phrase', 'Le plan montre ce qui est expliqué', 'Déplacer le plan concerné'], ['Lecture mobile', 'Les mots se lisent sans pause', 'Simplifier la phrase ou agrandir le texte'], ['Contraste', 'Le texte reste visible sur chaque image', 'Adapter couleur, ombre ou fond']]}},
    {id: 'destination', title: 'Vérifier l’interface du réseau et la lecture sans son', paragraphs: [
      'Les commandes de la plateforme peuvent occuper une partie de l’image. Avant publication, regardez l’aperçu de la destination et contrôlez les informations proches des bords. Une surface, un prix ou une ligne de sous-titres ne doit pas disparaître derrière un bouton, une légende ou un élément de navigation.',
      'Faites ensuite une lecture sans le son. Vous devez pouvoir identifier le bien et suivre l’essentiel de la présentation. Faites aussi une lecture avec la voix pour vérifier le mixage : les sous-titres améliorent l’accès au contenu, mais ne remplacent pas un audio compréhensible pour les personnes qui souhaitent l’écouter.',
    ]},
    {id: 'bienvu', title: 'Intégrer ce contrôle à votre parcours BienVu', paragraphs: [
      'Activez les sous-titres lors de la préparation de la vidéo et renseignez précisément les informations qui servent à la narration. Relisez l’aperçu généré, puis ajustez les textes du montage dans l’éditeur selon les éléments disponibles dans le projet. Conservez un style commun pour les titres et l’identité de votre agence.',
      'Avant de télécharger ou de publier, contrôlez le résultat complet plutôt qu’un seul écran. Une nouvelle version doit reprendre les vérifications du prix, du cadrage et de la narration. Gardez ce contrôle dans votre procédure d’agence afin qu’un changement de photo ou de format ne fasse pas réapparaître un problème de lisibilité.',
    ]},
  ],
  faqs: [{question: 'Afficher la surface et le prix suffit-il pour regarder sans son ?', answer: 'Ces repères aident à identifier le bien, mais ils ne transmettent pas forcément les informations de la narration. Relisez les sous-titres et vérifiez la compréhension de la vidéo complète.'}, {question: 'Quelle taille de texte choisir ?', answer: 'Il n’existe pas une taille unique pour toutes les mises en page. Contrôlez le résultat sur un téléphone, dans le format et l’aperçu de publication prévus, puis ajustez sans masquer les pièces.'}],
  related: ['voix-off-immobiliere-exemples-textes', 'story-instagram-immobiliere-scenarios', 'identite-visuelle-agence-immobiliere-videos'],
  links: [{path: '/editeur-video-immobilier', label: 'Personnaliser les textes de votre montage'}, {path: '/video-immobiliere-ia', label: 'Préparer une vidéo avec sous-titres'}],
};
