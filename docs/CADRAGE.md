# BienVu — cadrage produit

Référence du 27 septembre 2026. Les décisions confirmées priment sur les propositions techniques de ce dossier.

## Décisions confirmées par Alex

| Sujet | Décision |
|---|---|
| Nom | BienVu |
| Projet | Départ de zéro |
| Cible | Clients payants, principalement professionnels de l'immobilier |
| Entrée | Un lien d’annonce **ou une saisie manuelle avec photos**, demandée par Alex le 28/09/2026 ; bouton dépliant sous l’import URL |
| Sortie | Vidéo verticale avec une voix présentant le bien |
| Parcours | Renseigner/importer, générer, prévisualiser, télécharger ; aucun éditeur vidéo |
| Import | Priorité aux sites d'agences ; Le Figaro Immobilier, SeLoger, Leboncoin, Bien'ici et les autres si possible |
| Marque | Logo, couleurs et coordonnées enregistrés pour les vidéos de l'agence |
| Revenus | Plusieurs abonnements selon le nombre de vidéos |
| Essai | Une vidéo gratuite avec filigrane après inscription |
| Hébergement | Tout chez Cloudflare si techniquement possible |
| Budget avant clients | 30 € maximum par mois, hébergement et API de test compris |

La préférence de développement est Next.js et TypeScript. Remotion est le moteur vidéo envisagé. Python et Scrapling ne constituent pas une obligation.

## Valeurs proposées pour avancer, modifiables sans redéfinir le produit

- Interface française ; agences et annonces françaises au lancement.
- MP4 H.264/AAC, 1080 × 1920, 30 images/s, environ 30 secondes, plage cible 20–35 secondes selon le contenu.
- Un modèle visuel sobre : 4–6 séquences de photos existantes, mouvements lents, transitions courtes, sous-titres et écran de contact.
- Voix française synthétique standard, testée à l'écoute ; aucune imitation ou création de voix personnelle.
- Pas de musique au premier lancement. Pas d'avatar ni de modification générative des pièces.
- Un utilisateur propriétaire pour une agence ; pas encore d'invitations d'équipe ou de gestion de plusieurs agences.
- Connexion **e-mail/mot de passe en plus de Google**, demandée par Alex le 28/09/2026. Confirmation d’adresse obligatoire et récupération de mot de passe. Better Auth/D1 reste le choix technique d’implémentation ; les e-mails transactionnels sont préparés sur Cloudflare Email Service, avec essais locaux en attendant Workers Paid et un domaine expéditeur vérifié.
- Essai téléchargeable avec filigrane permanent dans les pixels ; abonnements donnant des vidéos sans filigrane BienVu.
- Prix proposés uniquement dans BUDGET-ET-OFFRES.md. Ils ne sont ni validés commercialement ni publiés.

## Parcours minimal

1. Le visiteur comprend la promesse, voit un exemple réel identifié comme démonstration et les limites de compatibilité.
2. Il s'inscrit, puis renseigne une fois le nom de l'agence, au moins un contact, son logo et ses couleurs. Le logo et les couleurs sont facultatifs ; des valeurs de repli permettent de continuer.
3. Il colle le lien d’une annonce qu’il est autorisé à exploiter, ou ouvre le formulaire manuel pour renseigner le bien et ajouter ses photos. Cette alternative reste accessible même si aucun import URL n’a été tenté.
4. Le serveur réserve son droit à une génération et crée un job. La page affiche des étapes compréhensibles.
5. Après l’import ou l’enregistrement manuel, le script, la voix et le rendu s’enchaîneront automatiquement. Au sprint 03, seule l’annonce est enregistrée, sans crédit consommé.
6. Le client regarde le MP4 produit et télécharge exactement cette version. Il peut retourner à son historique.
7. En cas d’échec, il voit une explication utile et peut réessayer, utiliser un autre lien ou saisir l’annonce. Si un job vidéo avait réservé un crédit, l’échec définitif le libère.

Un aperçu n’est pas une étape d’édition vidéo. Le formulaire manuel est une autre façon de créer une annonce, facultative pour les imports URL. Il permet de vérifier et retirer les photos sélectionnées avant l’envoi ; aucun écran de correction obligatoire n’est intercalé après un import. L’identité d’agence reste une configuration distincte.

## Import multi-sites : objectif et engagement

L'import générique doit tenter les pages publiques éligibles même hors des portails nommés. Les adaptateurs spécialisés servent à améliorer leur fiabilité. Afficher trois états distincts dans la matrice interne : testé, générique non vérifié, bloqué/non pris en charge. Ne jamais assimiler une page indexée dans un moteur de recherche à une extraction navigateur réussie.

Un résultat exploitable exige un bien identifiable, un type de bien et une localisation suffisamment claire, ainsi qu'au moins trois photos distinctes et utilisables. Le minimum de trois est une règle proposée, à mesurer pendant les tests. Les informations facultatives absentes sont omises. Un prix, une surface ou une identité d'annonce contradictoires bloquent la vidéo jusqu'à résolution automatique fiable, plutôt que de choisir arbitrairement.

Les annonces de vente sont le premier cas de recette. Pour une location, reconnaître ou demander explicitement prix mensuel, charges et unité. La saisie manuelle offre une alternative aux sites incompatibles ; sa réussite ne compte jamais comme un succès d’extraction de ce site.

## Fidélité et confiance

- Utiliser uniquement les photos et informations du bien, issues de sa page source ou fournies explicitement par l’utilisateur. Distinguer les valeurs extraites (`verified`) des déclarations manuelles (`user_provided`) ; ne pas compléter avec un autre bien.
- Ne pas inventer un étage, une vue, une proximité, une performance énergétique ou une adresse.
- Conserver le mode de création, le lien lorsqu’il existe, la date, la provenance des champs et les contradictions éventuelles. Aucune URL fictive pour une saisie manuelle.
- Conserver les mentions énergétiques et commerciales utiles issues de la source ; leur présentation applicable aux publicités immobilières françaises doit être vérifiée avant lancement. Ce dossier n'établit pas une conformité juridique automatique.
- Présenter clairement que la narration est synthétique. La mention ne doit pas disparaître avec le retrait du filigrane d'essai.
- L'autorisation d'utiliser une photo et l'accès technique au portail sont deux sujets distincts ; ne pas présenter l'import comme une licence de réutilisation.

## Hors périmètre de cette première version

Éditeur vidéo, variations illimitées, publication automatique sur les réseaux, CRM, import massif de catalogues, navigateur connecté au compte d'un portail, contournement de CAPTCHA, marketplace de modèles, génération d'images, applications mobiles natives et doublage multilingue.

## Indicateurs de validation

- Part de liens exploitables, ventilée par source et raison d'échec ; nombre de photos exactes récupérées.
- Temps médian et maximum observé par étape, puis p95 lorsque l'échantillon le permet.
- Coût total des tentatives divisé par le nombre de vidéos réellement utilisables, échecs inclus.
- Taux de génération aboutie, téléchargements et passage de l'essai à un abonnement.
- Erreurs factuelles, consommation double de crédit et accès inter-agences : zéro sur la recette définie.

Les premiers résultats seront des mesures sur un échantillon de test, pas une estimation fiable de la disponibilité de l'ensemble du marché.
