import {blogSecondBatchPublishedAt, type BlogArticle} from '../types';

export const identityArticle: BlogArticle = {
  publishedAt: blogSecondBatchPublishedAt,
  slug: 'identite-visuelle-agence-immobiliere-videos', title: 'Identité visuelle d’agence immobilière en vidéo — BienVu',
  heading: 'Identité visuelle d’agence immobilière : des vidéos cohérentes d’un mandat à l’autre',
  description: 'Construisez une identité vidéo pour votre agence immobilière : logo, couleurs, typographie, textes et modèles réutilisables dans BienVu.',
  excerpt: 'Quelques règles partagées pour le logo, les couleurs et les textes simplifient les créations et la relecture de toute l’équipe.',
  category: 'strategie', keyword: 'identité visuelle agence immobilière vidéo', image: 'paris', imageAlt: 'Intérieur élégant illustrant une présentation vidéo d’agence',
  intro: [
    'L’identité visuelle d’une agence ne se limite pas au logo posé sur la dernière image. Elle comprend la manière de présenter une ville, de faire ressortir une surface, de signer une vidéo et de proposer un contact. Des choix cohérents aident l’équipe à créer et à relire les contenus de plusieurs mandats sans réinventer toute la mise en page.',
    'Commencez avec des règles peu nombreuses et faciles à appliquer. Le bien reste le sujet principal : son salon, sa disposition et son extérieur doivent pouvoir se lire. L’habillage accompagne cette présentation. Voici une méthode pour transformer vos éléments de marque en un modèle vidéo utilisable au quotidien.',
  ],
  takeaways: ['Définissez une hiérarchie stable pour la ville, les caractéristiques et le contact.', 'Testez l’identité sur plusieurs images et dans les deux formats.', 'Enregistrez les réglages utiles, puis adaptez chaque modèle aux faits du mandat.'],
  sections: [
    {id: 'socle', title: 'Rassembler les éléments réellement utilisés par l’agence', paragraphs: [
      'Réunissez le logo disponible, les couleurs, les coordonnées et les typographies que l’agence utilise déjà sur ses supports. Vérifiez que les fichiers conviennent à une petite taille et que les informations de contact sont à jour. Une identité simple peut être très cohérente si les éléments sont choisis et appliqués avec soin.',
      'Choisissez aussi une manière de nommer l’agence dans la vidéo. Un nom long ou un slogan complet peuvent demander une autre disposition qu’un logo court. Testez le résultat sur un téléphone : l’objectif est que l’agence soit identifiable, sans que sa signature occupe la place nécessaire à la présentation du bien.',
    ]},
    {id: 'hierarchie', title: 'Donner un rôle à chaque niveau de texte', paragraphs: [
      'Décidez ce qui attire l’attention en premier : ville, type de bien ou caractéristique principale. Les informations secondaires complètent ce repère. Le prix et le contact doivent rester faciles à retrouver, mais n’ont pas forcément besoin d’être affichés en grand pendant tous les plans du montage.',
      'Gardez cette hiérarchie dans les différents contenus de l’agence. Un texte important peut changer selon le mandat, tandis que sa fonction visuelle reste stable. Si le premier écran présente une ville, les créations suivantes peuvent reprendre la même logique et laisser les caractéristiques trouver leur place au bon moment.',
    ], table: {caption: 'Exemple de hiérarchie de présentation', columns: ['Élément', 'Rôle', 'Contrôle'], rows: [['Ville ou type de bien', 'Situer la présentation', 'Se lit dès l’ouverture'], ['Surface et pièces', 'Donner des repères factuels', 'Correspond à la fiche'], ['Prix', 'Présenter le montant actualisé', 'Reste visible au moment prévu'], ['Signature d’agence', 'Identifier le professionnel', 'Ne masque pas les espaces'], ['Coordonnées', 'Permettre de poursuivre', 'Sont correctes et lisibles']]}},
    {id: 'couleurs', title: 'Choisir une palette qui fonctionne sur les photos', paragraphs: [
      'Préparez une couleur principale, une couleur de texte et une solution de repli pour les images complexes. Une teinte qui fonctionne sur un fond uni peut disparaître dans un salon clair ou une façade végétalisée. Essayez le même habillage sur plusieurs photos représentatives de vos mandats avant de le retenir.',
      'Évitez de multiplier les couleurs pour distinguer chaque information. Une palette limitée facilite la cohérence et laisse les images conserver leur ambiance. Une ombre ou un fond discret peut compléter le contraste lorsque la scène l’exige, sans créer un grand panneau qui cache une partie importante de la pièce.',
    ]},
    {id: 'typographie', title: 'Préparer une typographie lisible dans les cas difficiles', paragraphs: [
      'Testez les noms de communes longs, les grands montants et les coordonnées complètes. Une mise en page réussie avec « Lyon » peut se retrouver trop serrée avec un nom de ville plus long. Vérifiez les retours à la ligne et la taille réellement affichée avant d’enregistrer le modèle.',
      'Définissez une ou deux fonctions typographiques simples : un titre et un texte d’information. Le style doit rester compatible avec les sous-titres et le contenu des photos. Si une police décorative ralentit la lecture des chiffres, réservez-la à un titre bref et choisissez une présentation plus directe pour les données du bien.',
    ], examples: [{title: 'Une règle de rédaction et de mise en page', text: 'Ouverture : ville et type de bien. Plans intermédiaires : une information utile à la fois. Conclusion : montant actualisé et moyen de contacter l’agence. Même présentation des unités et du nombre de pièces dans toutes les versions.', note: 'Adaptez cette règle aux mentions applicables et à la durée de votre vidéo.'}]},
    {id: 'formats', title: 'Décliner le modèle en vertical et en horizontal', paragraphs: [
      'Un format vertical et un format horizontal ne disposent pas de la même largeur pour les phrases. Préparez une mise en page pour chacun plutôt que de réduire automatiquement tous les textes. Vérifiez les marges, le logo et les informations proches des bords dans l’aperçu de la destination.',
      'Les cadrages doivent eux aussi être revus. Une photo qui montre bien le séjour en horizontal peut perdre l’accès au balcon lorsqu’elle est recadrée. Le modèle aide à organiser la vidéo, mais il ne dispense pas de contrôler la matière de chaque mandat et de choisir une autre image si nécessaire.',
    ]},
    {id: 'bienvu', title: 'Enregistrer le socle dans BienVu', paragraphs: [
      'Renseignez le nom, le logo, les couleurs et les coordonnées dans Mon agence. Préparez ensuite un montage dont les textes, cadrages et réglages audio correspondent à votre manière de travailler. Les modèles d’agence peuvent mémoriser des choix utiles et servir de point de départ aux créations suivantes.',
      'Donnez un nom explicite au modèle, par exemple selon le format et l’usage. Si l’équipe travaille à plusieurs, partagez aussi une courte règle de relecture : où se trouvent le prix, les coordonnées et la signature. La cohérence vient autant de la procédure que du fichier enregistré.',
    ]},
    {id: 'validation', title: 'Tester le modèle sur plusieurs mandats', paragraphs: [
      'Appliquez le modèle à des biens différents : un studio, une maison et un appartement avec un nom de quartier long. Regardez la vidéo complète sur téléphone et dans les formats prévus. Notez les ajustements récurrents afin de corriger le modèle au lieu de refaire la même correction sur chaque création.',
      'Mettez à jour les coordonnées et les éléments de marque lorsqu’ils changent. Gardez une personne responsable de ces informations et un modèle de référence identifié. L’équipe peut ensuite personnaliser les montages tout en conservant une base commune, ce qui facilite la production et le contrôle des versions.',
    ]},
  ],
  faqs: [{question: 'Faut-il afficher le logo sur chaque plan ?', answer: 'Choisissez une présence cohérente et lisible qui laisse le bien au premier plan. Testez la signature sur plusieurs photos et gardez un contact clair dans la conclusion.'}, {question: 'Un modèle évite-t-il toute personnalisation ?', answer: 'Il fournit un point de départ. Les photos, les informations du mandat, les cadrages et la longueur des textes doivent encore être vérifiés pour chaque création.'}],
  related: ['marketing-immobilier-ia-agence', 'validation-video-immobiliere-vendeur', 'sous-titres-video-immobiliere-lisibilite'],
  links: [{path: '/modeles-video-immobilier', label: 'Découvrir les modèles d’agence'}, {path: '/agence', label: 'Préparer le logo et les coordonnées de l’agence'}],
};
