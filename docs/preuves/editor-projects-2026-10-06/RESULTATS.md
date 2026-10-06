# Ouverture des projets de l’Éditeur — 6 octobre 2026

Le message « La limite des imports de test est atteinte » provenait d’un plafond historique de **30 lignes d’import par agence**, comprenant aussi les brouillons manuels. Le compte signalé avait 30 lignes : 22 manuelles et 8 par lien. Les deux choix de la modale créaient un brouillon via `/api/imports/draft`, ce qui les bloquait ensemble. Cette route réservait aussi du budget de transfert sans télécharger de fichier.

## Correctif

- Le nombre total de projets conservés ne bloque plus un nouvel import ou brouillon. Aucun projet client n’a été supprimé.
- Ouvrir un projet vide ou copier les médias publiés de la démo ne réserve plus un budget de transfert. Les uploads personnels conservent leur réservation avant traitement.
- Les quotas partagés d’import par lien, les budgets financiers, les limites de fichiers et l’isolation des agences restent en place. Aucun crédit ni provision historique n’a été remboursé.
- La migration `0047_project_creation_rate.sql` ajoute un registre indépendant de créations manuelles : 60 par agence et heure UTC, idempotence sans double décompte, historique repris, suppressions sans remise à zéro.
- Les erreurs distinguent quota de liens, indisponibilité financière, limites du transfert et créations rapprochées.

## Vérifications

Les nouvelles régressions D1 vérifient l’ouverture après 30 projets, la migration sans perte, l’indépendance des quotas et budgets, la concurrence, le rejeu, la suppression et le renouvellement horaire. La copie complète de la démo est testée avec 30 projets déjà enregistrés, des quotas de liens épuisés et un budget de transfert en pause.

Compilation TypeScript des applications et des tests, contrôle des frontières, build OpenNext et trois déploiements simulés : validés. Le premier passage général comportait 375 tests, dont 370 réussis et cinq échecs liés à des délais ou connexions locales interrompues pendant la compilation. Les suites concernées ont ensuite été relancées : **27/27** pour comptes, validation client et essais anonymes, puis **2/2** pour la voix d’éditeur. Toutes les régressions du correctif passent.

Vérification sur `bienvu.online` avec un compte technique isolé contenant 30 projets synthétiques : clic réel sur « Nouveau projet », puis sur chaque choix de la modale.

| Choix | Photos | Plans animés réutilisables | Clips de voix | Musique | Crédits décomptés |
| --- | ---: | ---: | ---: | --- | ---: |
| Nouveau projet | 0 | 0 | 0 | Non | 0 |
| Utiliser la démo | 4 | 4 | 4 | Oui | 0 |

Les 30 projets étaient encore présents après les deux créations. Les quatre photos privées ont été relues et leurs empreintes vérifiées ; les vidéos, la voix et la musique sont accessibles au propriétaire. La voix accepte les plages HTTP, la musique conserve sa durée et sa forme d’onde. Les deux brouillons restent inaccessibles sans session et leur rejeu reprend le même identifiant. La timeline de la démo affiche les quatre « Vidéo IA », la voix d’origine et la musique après chargement.

Solde de crédits inchangé, zéro réservation de transfert et zéro génération pour cette recette. Les compteurs de liens et les provisions financières globaux sont restés identiques. Aucun appel de génération IA ou envoi d’email n’a été effectué.

## Déploiement et nettoyage

Migration D1 appliquée avant le code. Versions actives à 100 % :

| Worker | Version | Bindings conservés |
| --- | --- | ---: |
| Web | `290c5c73-3d73-4b6b-b519-e9db41ca1abd` | 44 |
| Imports | `9d4f404d-5bf2-40dd-9216-cf9be6f7a295` | 9 |
| Génération | `b929f459-b0f5-4cfe-a697-ae76d15d5af8` | 28 |

Les empreintes des bindings avant et après déploiement sont identiques. Les conteneurs existants ont été conservés sans reconstruction.

Les 32 projets synthétiques, leurs photos, voix, musique et les quatre copies d’animations du compte technique ont été supprimés après vérification. Sessions et identifiants de connexion techniques révoqués ; le propriétaire et le registre de créations restent conservés conformément aux invariants de la base. Les objets et journaux de médias associés sont à zéro.

Les rapports, captures et journaux techniques restent dans `evidence/remote/editor-projects-20261006/`, hors Git. Les fichiers d’identité temporaires ont été effacés. Cette recette ne constitue pas une nouvelle exécution de GitHub Actions.
