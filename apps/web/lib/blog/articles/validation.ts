import {blogSecondBatchPublishedAt, type BlogArticle} from '../types';

export const approvalArticle: BlogArticle = {
  publishedAt: blogSecondBatchPublishedAt,
  slug: 'validation-video-immobiliere-vendeur', title: 'Validation de vidéo immobilière avec le vendeur — BienVu',
  heading: 'Validation d’une vidéo immobilière : recueillir des retours précis du vendeur',
  description: 'Organisez la validation de vos vidéos immobilières : version à relire, commentaires horodatés, corrections et accord avant publication avec BienVu.',
  excerpt: 'Une version identifiée, des questions précises et des retours regroupés évitent de perdre les corrections au fil des échanges.',
  category: 'strategie', keyword: 'validation vidéo immobilière vendeur', image: 'bordeaux', imageAlt: 'Maison avec jardin illustrant une vidéo à faire valider',
  intro: [
    'Après le montage d’un bien, les retours peuvent arriver dans plusieurs messages : une correction de prix, une préférence de photo et une remarque sur la musique. Si personne ne sait quelle version est relue, l’équipe risque de modifier une création dépassée ou de publier avant que les dernières informations soient vérifiées.',
    'Une procédure de validation simple organise ces échanges. Elle indique ce qu’il faut relire, à qui revient la décision et comment formuler une correction. BienVu permet de partager une version par un lien privé avec des commentaires horodatés. Le lien accompagne cette procédure ; il ne remplace pas les vérifications du professionnel.',
  ],
  takeaways: ['Identifiez la version à relire et les personnes qui décident.', 'Demandez des retours situés dans le temps, avec une correction précise.', 'Relisez le rendu final après les modifications avant de le diffuser.'],
  sections: [
    {id: 'perimetre', title: 'Définir ce que vous demandez de valider', paragraphs: [
      'Séparez les informations factuelles des choix de présentation. Le vendeur peut signaler une caractéristique erronée ou une photo qui ne correspond plus à l’état du logement. L’agence vérifie le prix, les coordonnées, les mentions nécessaires et les autorisations de diffusion. Les préférences de rythme ou de musique peuvent ensuite être discutées dans le cadre choisi.',
      'Expliquez ce périmètre au moment du partage. Une demande vague comme « qu’en pensez-vous ? » peut déclencher une conversation sur tous les aspects du montage. Une demande structurée aide le destinataire à se concentrer d’abord sur les informations qui doivent être exactes.',
    ], table: {caption: 'Répartir les points de relecture', columns: ['Sujet', 'Question à poser', 'Décision à documenter'], rows: [['Informations du bien', 'Les caractéristiques affichées sont-elles exactes ?', 'Correction factuelle à intégrer'], ['Photos', 'Les vues représentent-elles le logement actuel ?', 'Image à garder ou remplacer'], ['Présentation', 'Le rythme permet-il de comprendre les espaces ?', 'Ajustement éditorial éventuel'], ['Diffusion', 'Quelle version et quelles destinations sont retenues ?', 'Version finale et canaux prévus']]}},
    {id: 'version', title: 'Partager une version clairement identifiée', paragraphs: [
      'Donnez un nom explicite au projet et mentionnez la référence du mandat. Indiquez aussi la date de la version partagée et le format prévu. Ces repères deviennent utiles lorsque plusieurs vidéos du même logement existent : une version verticale, une horizontale ou un montage centré sur l’extérieur.',
      'Avant l’envoi, regardez vous-même la vidéo complète. Une étape de validation ne doit pas servir à faire découvrir au destinataire des erreurs évidentes que l’agence pouvait corriger. Vérifiez les informations, les plans et l’audio, puis partagez la version réellement prête à recevoir ses remarques.',
    ]},
    {id: 'demande', title: 'Formuler une demande de retour facile à traiter', paragraphs: [
      'Précisez ce que le destinataire doit regarder et comment il peut répondre. Demandez le moment concerné, l’information à corriger et la modification souhaitée. Une observation située à douze secondes se retrouve beaucoup plus facilement qu’un message parlant du « texte vers le milieu ».',
      'Proposez une échéance de retour adaptée à la diffusion envisagée, puis attendez une réponse explicite selon votre procédure. L’absence de message ne devient pas automatiquement un accord. Si une information nouvelle arrive, clarifiez son impact sur la vidéo et sur les autres contenus du mandat.',
    ], examples: [{title: 'Message d’accompagnement', text: 'Bonjour, voici la version verticale de la présentation de votre bien, référence M-024. Pouvez-vous vérifier les informations affichées et les photos ? Pour une correction, indiquez le moment concerné et le texte à remplacer. Nous vous transmettrons la version finale après intégration des retours.'}]},
    {id: 'commentaires', title: 'Transformer les remarques en corrections concrètes', paragraphs: [
      'Regroupez les commentaires avant de modifier le montage. Distinguez une erreur à corriger, une question qui demande une vérification et une préférence de présentation. Si deux personnes proposent des changements contradictoires, revenez à la personne qui décide au lieu de choisir implicitement une version des informations.',
      'Pour chaque correction, notez le plan ou le texte concerné et sa source. Une nouvelle surface, un nouveau prix ou une affirmation sur un équipement doivent être vérifiés avant d’être intégrés. Vous gardez ainsi un historique qui explique la modification sans dépendre de la mémoire du monteur.',
    ], examples: [{title: 'Un retour exploitable', text: 'À 00:12, le texte indique « deux chambres ». La fiche vérifiée du mandat en compte trois. Remplacer le texte par « trois chambres » et adapter la narration si elle reprend aussi cette information.', note: 'Exemple fictif : utilisez les informations confirmées de votre propre mandat.'}]},
    {id: 'bienvu', title: 'Utiliser les liens de validation dans BienVu', paragraphs: [
      'Dans le projet, préparez un lien de validation client pour la version à relire. Le destinataire peut consulter cette version, laisser des commentaires horodatés et la valider selon le parcours proposé. Vous transmettez vous-même le lien ; BienVu ne choisit pas les personnes à contacter à votre place.',
      'Le partage de validation est privé et révocable. Il reste distinct d’une publication publique dans Explorer ou d’une diffusion sur les réseaux sociaux. Vérifiez la version effectivement partagée après une modification du montage et mettez fin au lien lorsque vous n’avez plus besoin de cet accès.',
    ]},
    {id: 'final', title: 'Revoir la vidéo après l’intégration des retours', paragraphs: [
      'Une correction peut modifier plus que le texte demandé. Un nom de ville plus long peut demander un autre cadrage typographique ; une nouvelle photo peut changer le rythme et la relation avec la voix off. Regardez le rendu complet après les retouches pour repérer ces effets.',
      'Présentez la version finale avec un résumé des modifications utiles. Si un point n’a pas été changé, expliquez pourquoi et clarifiez l’accord attendu. En cas de nouveau rendu, vérifiez le récapitulatif de crédits avant lancement. L’existence d’un commentaire n’implique pas que chaque modification entraîne une nouvelle animation.',
    ]},
    {id: 'diffusion', title: 'Relier l’accord à la version réellement diffusée', paragraphs: [
      'Enregistrez quelle version a été retenue et pour quelles destinations. Le fichier publié doit correspondre à cette version, avec les informations encore à jour au moment de la diffusion. Si le prix ou la disponibilité change entre la validation et la programmation, reprenez les contrôles concernés.',
      'Après publication, gardez la trace des destinations et du résultat par réseau. Une modification future sera plus simple si vous retrouvez le projet, le rendu et la fiche du mandat ensemble. La validation devient alors une étape de production documentée, plutôt qu’une suite de messages dispersés.',
    ]},
  ],
  faqs: [{question: 'Un lien de validation rend-il la vidéo publique ?', answer: 'Le lien de validation client est privé et révocable. Il ne constitue pas une publication dans Explorer ni une diffusion sur les réseaux sociaux.'}, {question: 'Faut-il refaire une validation après une correction ?', answer: 'Vérifiez les changements et le rendu final. Votre procédure doit préciser quand une nouvelle confirmation est nécessaire, notamment si les informations ou les destinations de diffusion changent.'}],
  related: ['identite-visuelle-agence-immobiliere-videos', 'envoyer-video-immobiliere-acquereur', 'marketing-immobilier-ia-agence'],
  links: [{path: '/projets', label: 'Retrouver vos projets et leurs validations'}, {path: '/editeur-video-immobilier', label: 'Intégrer les retours dans le montage'}],
};
