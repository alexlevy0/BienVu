# Sprint 02 — Comptes, agence et identité visuelle

**Dépendance : sprint 01. Terminé le 28/09/2026 après recette sur bienvu.online.** Authentification humaine e-mail/Google et même agence confirmées par Alex ; marque, mobile, fichiers hostiles, isolation de deux comptes et révocation vérifiés sur Workers/D1/R2 réels. Les identités de recette et jetons d'expiration restent explicitement synthétiques. [Recette distante](../preuves/sprint-02/RECETTE-DISTANTE.md).

## Objectif

Un utilisateur peut se connecter, créer son agence et enregistrer une identité réutilisable. Les données d'une agence ne sont accessibles qu'à son propriétaire. Le modèle initial est un utilisateur et une agence ; les équipes sont hors périmètre.

Références : [CADRAGE.md](../CADRAGE.md), [CONTRATS.md](../CONTRATS.md), [ARCHITECTURE.md](../ARCHITECTURE.md). Better Auth/D1 est l'implémentation technique retenue ; Alex a demandé e-mail/mot de passe en plus de Google et a confirmé les connexions réelles.

## Travail à réaliser

- [x] **02.1 — Intégrer la connexion.** Configurer le flux OAuth, les sessions et la déconnexion avec les versions compatibles. Vérifier cookies sécurisés, origines autorisées, URL de retour et protections intégrées du fournisseur d'authentification. Aucun jeton de fournisseur ne doit finir dans les journaux ou dans un objet de session envoyé inutilement au navigateur. Connexion Google réelle confirmée ; distinguer ci-dessous les parcours humains des scénarios négatifs sur fixtures distantes.
- [x] **02.2 — Créer l'agence une seule fois.** Rendre la création idempotente, y compris lors de connexions simultanées. Déduire systématiquement l'agence de la session sur les routes serveur. Préparer l'identité d'éligibilité à l'essai sans accorder encore de génération publique.
- [x] **02.3 — Enregistrer la marque.** Formulaire simple pour nom, logo, couleurs et coordonnées facultatives. Proposer des valeurs visuelles par défaut. Valider les couleurs et coordonnées, expliquer les champs requis, gérer sauvegarde et erreur. L'identité d'agence est un réglage permanent ; elle n'introduit pas un éditeur d'annonce.
- [x] **02.4 — Sécuriser le logo.** Accepter uniquement des formats raster contrôlés avec limites de poids et dimensions. Vérifier le contenu réel du fichier, le décoder et le normaliser si nécessaire. Stocker dans R2 privé. Écarter SVG actif, HTML déguisé et fichier corrompu.
- [x] **02.5 — Gérer les versions d'assets.** Une modification de logo s'applique aux futures générations. Une vidéo déjà produite conserve son apparence ; un job en cours utilise la copie de marque de son manifeste. Ne pas supprimer un asset encore référencé par un travail actif.
- [x] **02.6 — Tester l'isolation.** Préparer deux agences distinctes et vérifier lectures, écritures, fichiers et URL signées éventuelles. L'identifiant d'agence transmis par le client ne permet jamais de changer de propriétaire.

## Critères d'acceptation

1. Connexion, rechargement de page et déconnexion fonctionnent dans l'environnement Workers de test ; distinguer les vérifications locales des vérifications OAuth réelles.
2. Un double retour de connexion ne crée pas deux agences.
3. Nom, couleurs et coordonnées persistent ; les erreurs de validation restent lisibles sur mobile.
4. L'agence A ne peut ni lire ni modifier la marque ou le logo de B, même avec un identifiant connu.
5. Une requête non authentifiée est refusée et un fichier malveillant n'est pas publié.
6. Aucune modification de marque ne provoque de nouvelle consommation de crédit ni de recalcul automatique d'une vidéo.

## Livrables et fin du sprint

Authentification, routes de marque, formulaire, gestion privée des logos et tests ciblés d'isolation. Documenter la configuration OAuth nécessaire sans secrets et mettre à jour [SUIVI.md](../SUIVI.md).

Les abonnements, invitations et rôles d’équipe restent hors périmètre. **Extension demandée par Alex le 28/09/2026 : connexion e-mail/mot de passe en plus de Google**, avec confirmation et récupération. Elle remplace l’exclusion initiale des mots de passe. Après les essais avec simulateur local, Cloudflare Email Service est vérifié réellement le 28/09 avec Workers Paid et `bienvu.online` : deux messages reçus en boîte principale, confirmation, connexion, reset, révocation et conservation de l’agence. Ces deux envois précèdent le raccordement web du domaine ; un troisième reset valide ensuite l'origine bienvu.online et la même agence via les deux méthodes. [Rapport des deux premiers envois](../preuves/sprint-02/EMAIL-CLOUDFLARE.md). Voir [AUTHENTIFICATION.md](../AUTHENTIFICATION.md).

## Recette distante de clôture

- [x] Rechargement, déconnexion/révocation/reconnexion ; callbacks OAuth négatifs ; Alex confirme mot de passe et Google avec la même agence.
- [x] Deux identités synthétiques distinctes sur le vrai service, lectures/écritures/logo étrangers refusés.
- [x] Nom/couleurs/contacts sauvegardés et relus sur mobile ; PNG puis JPEG depuis le sélecteur ; formats malveillants, poids/dimensions refusés ; latence et taille relevées au plafond.
- [x] Un nouvel e-mail réel sur l'origine actuelle, réception et parcours confirmés. Expiration et rejeu exercés sur le serveur distant avec jetons synthétiques séparés, sans modifier l'adresse réelle d'Alex.

Les détails et limites sont dans le [rapport de clôture](../preuves/sprint-02/RECETTE-DISTANTE.md).
02.5 démontre les versions immuables et la copie de marque. Leur intégration à une vidéo/job réels est une dépendance des sprints 06–07. La réconciliation des logos orphelins et la suppression/conservation complète relèvent de l'exploitation avant lancement ; aucun asset référencé ne doit être purgé entre-temps.

## Résultat du 27 septembre 2026

À la livraison initiale, 02.1 était implémenté (Better Auth 1.7.6, Google, sessions et déconnexion) mais restait non coché faute d'identifiants et de callback réel. Cette réserve est levée par les recettes du 28/09 décrites en tête de fichier. Les preuves initiales de marque/isolation restent **locales** ; 02.5 prouve la conservation des versions et de la copie de marque, pas un rendu produit utilisant un logo.

43 tests, types et build OpenNext réussis ; sonde HTTP D1/R2 sous workerd, marque persistante, isolation de deux propriétaires, normalisation des logos, inspection mobile/ordinateur et nettoyage. [Rapport et limites](../preuves/sprint-02/RAPPORT.md) · [Configuration OAuth et reproduction](../AUTHENTIFICATION.md).
