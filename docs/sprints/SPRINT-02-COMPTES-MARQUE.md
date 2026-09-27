# Sprint 02 — Comptes, agence et identité visuelle

**Dépendance : sprint 01. Statut initial : à faire.**

## Objectif

Un utilisateur peut se connecter, créer son agence et enregistrer une identité réutilisable. Les données d'une agence ne sont accessibles qu'à son propriétaire. Le modèle initial est un utilisateur et une agence ; les équipes sont hors périmètre.

Références : [CADRAGE.md](../CADRAGE.md), [CONTRATS.md](../CONTRATS.md), [ARCHITECTURE.md](../ARCHITECTURE.md). Better Auth, D1 et Google OAuth sont les choix proposés, à valider techniquement, pas des décisions déjà prises par Alex.

## Travail à réaliser

- [ ] **02.1 — Intégrer la connexion.** Configurer le flux OAuth, les sessions et la déconnexion avec les versions compatibles. Vérifier cookies sécurisés, origines autorisées, URL de retour et protections intégrées du fournisseur d'authentification. Aucun jeton de fournisseur ne doit finir dans les journaux ou dans un objet de session envoyé inutilement au navigateur.
- [ ] **02.2 — Créer l'agence une seule fois.** Rendre la création idempotente, y compris lors de connexions simultanées. Déduire systématiquement l'agence de la session sur les routes serveur. Préparer l'identité d'éligibilité à l'essai sans accorder encore de génération publique.
- [ ] **02.3 — Enregistrer la marque.** Formulaire simple pour nom, logo, couleurs et coordonnées facultatives. Proposer des valeurs visuelles par défaut. Valider les couleurs et coordonnées, expliquer les champs requis, gérer sauvegarde et erreur. L'identité d'agence est un réglage permanent ; elle n'introduit pas un éditeur d'annonce.
- [ ] **02.4 — Sécuriser le logo.** Accepter uniquement des formats raster contrôlés avec limites de poids et dimensions. Vérifier le contenu réel du fichier, le décoder et le normaliser si nécessaire. Stocker dans R2 privé. Écarter SVG actif, HTML déguisé et fichier corrompu.
- [ ] **02.5 — Gérer les versions d'assets.** Une modification de logo s'applique aux futures générations. Une vidéo déjà produite conserve son apparence ; un job en cours utilise la copie de marque de son manifeste. Ne pas supprimer un asset encore référencé par un travail actif.
- [ ] **02.6 — Tester l'isolation.** Préparer deux agences distinctes et vérifier lectures, écritures, fichiers et URL signées éventuelles. L'identifiant d'agence transmis par le client ne permet jamais de changer de propriétaire.

## Critères d'acceptation

1. Connexion, rechargement de page et déconnexion fonctionnent dans l'environnement Workers de test ; distinguer les vérifications locales des vérifications OAuth réelles.
2. Un double retour de connexion ne crée pas deux agences.
3. Nom, couleurs et coordonnées persistent ; les erreurs de validation restent lisibles sur mobile.
4. L'agence A ne peut ni lire ni modifier la marque ou le logo de B, même avec un identifiant connu.
5. Une requête non authentifiée est refusée et un fichier malveillant n'est pas publié.
6. Aucune modification de marque ne provoque de nouvelle consommation de crédit ni de recalcul automatique d'une vidéo.

## Livrables et fin du sprint

Authentification, routes de marque, formulaire, gestion privée des logos et tests ciblés d'isolation. Documenter la configuration OAuth nécessaire sans secrets et mettre à jour [SUIVI.md](../SUIVI.md).

Les abonnements, invitations, rôles d'équipe, connexion par mot de passe et récupération de mot de passe ne sont pas attendus dans ce sprint. Si un autre mode de connexion est retenu, consigner la raison et sa charge d'exploitation avant de l'intégrer.
