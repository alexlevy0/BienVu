# BienVu — cadrage produit

Référence du 27 septembre 2026. Les décisions confirmées priment sur les propositions techniques de ce dossier.

## Décisions confirmées par Alex

| Sujet | Décision |
|---|---|
| Nom | BienVu |
| Projet | Départ de zéro |
| Cible | Clients payants, principalement professionnels de l'immobilier |
| Entrée | Un lien d’annonce, une description du bien ou une saisie manuelle avec photos. Une description préremplit un brouillon à vérifier ; un import URL incomplet devient un brouillon « À compléter ». |
| Sortie | Vidéo verticale avec une voix présentant le bien |
| Parcours | Renseigner/importer, générer, prévisualiser, télécharger ; aucun éditeur vidéo |
| Import | Priorité aux sites d'agences ; Le Figaro Immobilier, SeLoger, Leboncoin, Bien'ici et les autres si possible |
| Marque | Logo, couleurs et coordonnées enregistrés pour les vidéos de l'agence |
| Animation | Depuis le 01/10 : mouvements de caméra fluides et option Runway pour une ou deux photos, réglable avant génération. Achat API déclaré de 10 € ; recette réelle et solde requis avant activation. |
| Rendu de référence | Le 01/10, Alex confirme une visite immersive avec les informations surtout à la fin. Cinéma devient le défaut des nouvelles créations ; Éditorial et Minimal restent proposés et les brouillons conservent leur style enregistré. |
| Revenus | Plusieurs abonnements selon le nombre de vidéos |
| Essai | Depuis le 29/09 : un essai anonyme abouti avec aperçu filigrané ; connexion et crédit pour récupérer le master propre, sans nouveau rendu. Compte gratuit : trois vidéos/mois, essai récupéré compris. |
| Hébergement | Tout chez Cloudflare si techniquement possible |
| Budget | Enveloppe actuelle 100 €/mois, coupure à 90 €, confirmées le 01/10 ; anciens relevés conservés. Achat Runway API de 10 € déclaré, compris dans cette enveloppe et à imputer une fois. Factures et coût par vidéo à rapprocher. |

La préférence de développement est Next.js et TypeScript. Remotion est le moteur vidéo envisagé. Python et Scrapling ne constituent pas une obligation.

## Valeurs proposées pour avancer, modifiables sans redéfinir le produit

- Interface française ; agences et annonces françaises au lancement.
- MP4 H.264/AAC, 1080 × 1920, 30 images/s, environ 30 secondes, plage cible 20–35 secondes selon le contenu.
- Un modèle visuel sobre : 4–6 scènes de narration, jusqu'à 12 photos distinctes du bien, mouvements lents, transitions courtes, sous-titres et écran de contact.
- Voix française synthétique standard, testée à l'écoute ; aucune imitation ou création de voix personnelle.
- Pas de musique au premier lancement. Pas d'avatar. L'animation Runway demandée le 01/10 vise un mouvement de caméra sur les photographies existantes, avec instruction de conserver les pièces et leurs détails ; les originaux restent conservés et le rendu doit être vérifié avant partage.
- Un utilisateur propriétaire pour une agence ; pas encore d'invitations d'équipe ou de gestion de plusieurs agences.
- Connexion **e-mail/mot de passe en plus de Google**, demandée par Alex le 28/09/2026. Confirmation d’adresse obligatoire et récupération de mot de passe. Better Auth/D1 reste le choix technique d’implémentation ; les e-mails transactionnels sont préparés sur Cloudflare Email Service, avec essais locaux en attendant Workers Paid et un domaine expéditeur vérifié.
- Essai anonyme lisible avec filigrane incrusté. Connexion et crédit pour télécharger sans filigrane ; abonnements destinés au volume supplémentaire. [Règles et activation du pilote](ESSAI-ANONYME.md).
- Offres confirmées par Alex dans BUDGET-ET-OFFRES.md : Gratuit 3 vidéos/mois, Plus 19 € HT/20 vidéos, Pro 49 € HT/60 vidéos. Présentation publiée ; souscription payante non ouverte.

## Parcours minimal

1. Le visiteur comprend la promesse, voit un exemple réel identifié comme démonstration et les limites de compatibilité.
2. Il peut lancer l’essai URL avant de s’inscrire, avec habillage neutre BienVu. Aucune identité d’agence n’est nécessaire pour récupérer cet essai ; sa charte peut être configurée ensuite pour ses prochaines vidéos.
3. Il colle une URL seule, décrit le bien ou ouvre la saisie manuelle. Le texte descriptif est analysé une fois à la soumission, avec budget et contrôle anti-abus, puis conservé dans un brouillon révisable. Un import partiel conserve ses faits et photos utilisables ; le formulaire s'ouvre à la première section à compléter.
4. Le formulaire guidé vérifie cinq sections, sans imposer de ressaisie des sections complètes. Les photos choisies sont envoyées dans le stockage privé dès leur sélection pour les comptes connectés. La validation finale est toujours requise après saisie manuelle, description ou import partiel ; l'URL entièrement valide reste directe.
5. Après validation de l'annonce, le serveur réserve le droit à une seule génération et confie le job au Workflow durable. Navigation, rechargement et téléchargement ne relancent ni le rendu ni le débit.
6. Le visiteur regarde l’aperçu filigrané puis se connecte. Son compte récupère le même job et un crédit débloque son master privé ; le bouton de téléchargement apparaît dans le résultat. Il peut retourner à son historique.
7. En cas d’échec, il voit une explication utile et peut réessayer, utiliser un autre lien ou saisir l’annonce. Si un job vidéo avait réservé un crédit, l’échec définitif le libère.

Un aperçu n’est pas une étape d’édition vidéo. Le formulaire manuel est une autre façon de créer une annonce, facultative pour les imports URL complets. Une correction obligatoire est demandée uniquement lorsqu'un import est partiel ; les photos déjà validées sont réutilisées. L’identité d’agence reste une configuration distincte.

## Import multi-sites : objectif et engagement

L'import générique doit tenter les pages publiques éligibles même hors des portails nommés. Les adaptateurs spécialisés servent à améliorer leur fiabilité. Afficher trois états distincts dans la matrice interne : testé, générique non vérifié, bloqué/non pris en charge. Ne jamais assimiler une page indexée dans un moteur de recherche à une extraction navigateur réussie.

Un résultat exploitable exige un bien identifiable, un type de bien et une localisation suffisamment claire, ainsi qu'au moins trois photos distinctes et utilisables. Le minimum de trois est une règle proposée, à mesurer pendant les tests. Les informations facultatives absentes sont omises. Un prix, une surface ou une identité d'annonce contradictoires bloquent la vidéo jusqu'à résolution automatique fiable, plutôt que de choisir arbitrairement.

Les annonces de vente sont le premier cas de recette. Pour une location, reconnaître ou demander explicitement prix mensuel, charges et unité. La saisie manuelle offre une alternative aux sites incompatibles ; sa réussite ne compte jamais comme un succès d’extraction de ce site.

## Fidélité et confiance

- Utiliser uniquement les photos et informations du bien, issues de sa page source ou fournies explicitement par l’utilisateur. Distinguer les valeurs extraites (`verified`) des déclarations manuelles (`user_provided`) ; ne pas compléter avec un autre bien.
- Ne pas inventer un étage, une vue, une proximité, une performance énergétique ou une adresse.
- Conserver le mode de création, le lien lorsqu’il existe, la date, la provenance des champs et les contradictions éventuelles. Aucune URL fictive pour une saisie manuelle.
- Conserver les mentions énergétiques et commerciales utiles issues de la source ; leur présentation applicable aux publicités immobilières françaises doit être vérifiée avant lancement. Ce dossier n'établit pas une conformité juridique automatique.
- Conserver la provenance synthétique de la narration dans le manifeste serveur. Alex a demandé le 29/09 de retirer la mention visible de l'image ; cette mention n'est pas réintroduite dans les vidéos.
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
