# Mosaïques et groupes complets — 17 octobre 2026

Les cartes de Personnaliser, de `/avatar` et du superadmin présentent un portrait principal et jusqu’à deux aperçus secondaires, selon les apparences disponibles dans leur sélection. Les aperçus publics proviennent uniquement des variantes publiées du même groupe ; aucun portrait masqué n’est révélé pour compléter la mosaïque. Seul le portrait principal monte une vidéo au survol ; les petites images sont chargées à proximité de l’écran.

Le superadmin affiche des cartes par identité HeyGen, avec son identifiant visible, dans les deux onglets. Le choix par défaut utilise aussi des groupes d’options par personne. « Ajouter le groupe entier » et « Compléter le groupe » lisent toutes les pages du catalogue de cette personne avant mutation, écartent les moteurs non autorisés, activent les variantes compatibles si nécessaire et ajoutent leurs identifiants au même groupe du brouillon. La publication reste explicite. Le défaut, le nom personnalisé et les recommandations sont conservés ; répéter l’action ne crée pas de doublon.

Un défaut de restauration des anciens brouillons pouvait réintroduire les lignes séparées : leurs portraits sauvegardés ne contenaient pas les identités récentes et écrasaient la correspondance obtenue du serveur. Le serveur fournit maintenant la correspondance d’identités complète à l’administrateur, et la restauration préserve un `group_id` connu lorsqu’une ancienne entrée n’en contient pas. Les modifications éditoriales du brouillon restent conservées.

## Validation

- 36 tests ciblés réussis : catalogue, groupes, publications, favoris, droits/origines, transparence, pipeline avatar simulé. Nouveaux cas : ancien brouillon sans identité, lecture des 70 variantes sur trois pages, ajout idempotent d’un groupe entier, curseur/réponse incohérent ou erreur réseau, trois aperçus issus de la seule sélection publique.
- Contrôles TypeScript de tous les packages, applications et tests ; frontières (619 fichiers) ; compilation Next/OpenNext ; `git diff --check`.
- Vrais composants et D1 Miniflare isolée : ancien brouillon de 27 variantes séparées restauré en 9 groupes, groupe Annie complété de 3 à 6 variantes sans doublon, publication conservée en 9 groupes et visible dans la galerie. Trois portraits dans la mosaïque, grille mobile à 390 px sans débordement horizontal. Captures et fixture privées sous `evidence/local/avatar-mosaics/`.

Aucune génération fournisseur payante, migration SQL ou nouveau secret. Le déploiement porte sur le Worker web ; le pipeline, le renderer et leurs capacités restent inchangés. La sélection publique existante est conservée jusqu’à une action explicite de publication du superadmin.
