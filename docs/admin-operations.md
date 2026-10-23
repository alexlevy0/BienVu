# Pilotage et support

L’administration conserve les outils existants et les regroupe dans six catégories. Les favoris et filtres sont synchronisés par compte ; les vues peuvent être privées ou partagées avec le staff. Les liens de listes contiennent leurs critères ; les dossiers vidéo et agence ont une URL dédiée.

| Fonction              | Accès / comportement                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Navigation            | Six catégories, recherche de rubrique, favoris synchronisés.                                                                                                 |
| Points d’attention    | Générations sans changement depuis 15 minutes, signalements ouverts et incidents avec agence, date et diagnostic.                                            |
| Diagnostic vidéo      | Source, transitions d’étapes, appels script/voix, préparation, avatar, chaque animation, ressources en file, crédits, coûts et notifications.                |
| Agence à 360°         | Abonnement, crédits, dernières vidéos, signalements, correspondance par adresse du propriétaire et notes internes.                                           |
| Fournisseurs          | Activité réelle enregistrée, capacité et occupation des files, dernier solde Runway, vérification gratuite du solde HeyGen. Un solde inconnu n’est pas zéro. |
| Filtres et vues       | Critères conservés par rubrique, URL partageable, vues nommées synchronisées ou partagées, raccourci des échecs de la semaine.                               |
| Performance           | Moyenne, médiane et P95, filtres origine/durée/avatar/animations, attentes cumulées, séries quotidiennes sans faux zéros.                                    |
| Incidents             | Une occurrence par vidéo/étape/code, deux fenêtres de 7 jours, suivi optimiste à traiter/en cours/résolu, réouverture si nouveau cas.                        |
| Rétention             | Première puis deuxième vidéo prête, retour à 7/30 jours avec exclusion des cohortes trop récentes, jours et semaines d’usage.                                |
| Rentabilité par rendu | Standard, avatar, avatar avec animations, animations seules. Modes Stripe séparés ; marge inconnue si les frais/coûts ne sont pas couverts.                  |
| Changements           | Réglages et changements documentés sur la courbe de durée ou de taux d’échec ; historique de déploiement vérifié.                                            |
| Tables et dossiers    | En-têtes fixes dans les tables, unités et badges communs, dossiers longs en page dédiée.                                                                     |

## Droits

Les indicateurs, dossiers complets, coûts, changements et incidents restent réservés au super admin. Le compte de support garde ses rubriques existantes et peut lire/ajouter des notes internes depuis la fiche agence et gérer les dossiers de suivi. Les nouvelles écritures vérifient l’origine, les entrées et la session, sont limitées en fréquence et conservées avec l’auteur. Les notes ne déclenchent aucun e-mail.

## Mesures

- Fenêtres UTC, jusqu’à 366 jours avec dates explicites. Les performances utilisent les 20 000 créations les plus récentes au maximum ; un dépassement est signalé. Les anciens jobs sans événement `ready` ne sont pas chronométrés.
- La durée totale va de la création à l’événement original `ready`, indépendamment d’une modification ultérieure du job. P95 : rang supérieur ; médiane : moyenne des deux valeurs centrales pour un effectif pair.
- Les files peuvent se chevaucher. Leurs attentes cumulées ne sont jamais soustraites du temps total. Les intervalles de créneau sont visibles dans le diagnostic et ne sont pas présentés comme du temps CPU.
- Le suivi des nouvelles transitions d’étapes et des notifications commence avec la migration `0081`. L’ancien historique n’est pas inventé. « Accepté » signifie accepté par le fournisseur push, sans preuve de lecture/affichage par le navigateur. Aucun endpoint ou secret push n’est exposé.
- La rétention porte sur les agences ayant un compte et une première vidéo prête dans la période. Les taux à 7/30 jours ont uniquement les cohortes suffisamment anciennes au dénominateur. Les essais anonymes non rattachés sont exclus.
- La rentabilité utilise les vues financières existantes ; les provisions ne deviennent pas des factures. Les groupes correspondent aux options demandées, y compris si une animation a échoué.

## Déploiements

Après activation du Worker web, exécuter `node scripts/record-admin-deployment.mjs`. Le script vérifie la version active à 100 %, lit sa date réelle et son identifiant, puis enregistre une entrée idempotente. Ne pas l’appeler après un simple build ou avant activation. Les anciens déploiements ne sont pas reconstitués.

Appliquer `0081_admin_operations.sql` puis `0082_admin_workspace.sql` avant de déployer le web et le worker de génération. Les triggers observent aussi les Workers déjà déployés ; aucune reconstruction du renderer n’est nécessaire.
# Évolutions du workspace administrateur

La migration `0082_admin_workspace.sql` ajoute les dix évolutions suivantes sans modifier les droits client ni les contrats des générations existantes :

| Fonction                                               | Accès                                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Récupération guidée                                    | Diagnostic vidéo, section « Récupération guidée »                                         |
| Alertes automatiques et opt-in navigateur              | Vue d’ensemble / Incidents ; seuils dans Incidents / Fournisseurs                         |
| Classification client, interne et démonstration        | Dossier agence ; filtre Clients dans Performance, Rétention et Rentabilité                |
| Recherche globale                                      | Bouton de recherche et raccourci ⌘K / Ctrl+K                                              |
| Dossiers attribués, priorité, échéance et report       | Vue d’ensemble, Incidents, dossiers vidéo/agence ; suivi simplifié pour le compte support |
| Agences à accompagner                                  | Agences et Rétention                                                                      |
| Comparaison avec une fenêtre précédente de durée égale | Performance, Rétention et Rentabilité                                                     |
| Différences et restauration d’une configuration        | Changements & résultats                                                                   |
| Miniatures, sommaire et navigation entre diagnostics   | Dossier vidéo ; contexte de la liste filtrée conservé pendant cinq minutes dans l’onglet  |
| Favoris, filtres et vues synchronisés ou partagés      | Navigation et barre « Enregistrer la vue »                                                |

## Persistance et accès

Les préférences privées sont liées à l’utilisateur authentifié. Les vues partagées sont explicitement publiées à l’équipe d’administration ; elles peuvent être modifiées par les membres du staff. Une vue privée ne peut pas être lue ou supprimée par un autre membre. Les modifications sont des événements immuables appliqués avec révision optimiste dans D1. Les suppressions de vues sont logiques et restent historisées. Les filtres conservent un secours local ; une erreur de synchronisation est signalée.

Le compte support peut gérer les dossiers attribués et ses préférences. Les recherches globales, classifications, alertes techniques, versions de configuration et récupérations restent réservées au super admin. Les liens du suivi support restent dans ses rubriques autorisées. La liste des responsables est limitée aux adresses vérifiées configurées dans `SUPER_ADMIN_EMAIL` / `ADMIN_EMAIL`.

Les comptes dont le propriétaire correspond à ces adresses sont automatiquement internes. Une agence peut également être classée interne ou démonstration avec un motif. Le filtre Clients exclut ces comptes des nouvelles analyses ; il ne supprime pas leurs données. Les compteurs historiques de la vue globale restent explicitement toutes origines.

## Récupération sans nouvelle génération payante

La demande conserve l’acteur et le motif. Le cron du worker de génération reprend une demande à la fois, avec verrou persistant, au plus deux clips par passage. Il utilise uniquement les identifiants de tâches Runway déjà connus et le helper de lecture du SDK. Il ne crée ni upload, ni tâche IA, ni nouvelle réservation de crédits. Une tâche réellement échouée ou dont le résultat n’est plus disponible ne peut pas être récupérée ; une création sans identifiant reste incertaine et n’est jamais soumise une seconde fois.

Les clips récupérés rejoignent la bibliothèque réutilisable de l’agence. Ils alimentent également une préparation encore active tant qu’aucun manifeste n’a été figé. Le fichier d’une vidéo déjà assemblée et ses crédits réglés restent inchangés. Son diagnostic conserve donc l’échec d’origine. Le même passage peut relancer une intention de workflow encore en attente ou constater un rendu déjà terminé, sans annuler le renderer ni refaire le calcul. Les traitements terminés ne sont pas rejoués.

Cette fonctionnalité nécessite le déploiement du worker de génération en plus du web. Aucune génération fournisseur payante n’est utilisée par les tests.

## Alertes

Le cron web évalue chaque minute l’immobilité des générations, l’ancienneté des entrées en file, la proportion d’échecs parmi les créations des 30 dernières minutes déjà terminées et la dernière réserve Runway utilisable connue. Les seuils et le délai entre alertes similaires sont configurables. Aucune sonde IA payante n’est créée.

Les occurrences sont regroupées par règle jusqu’à résolution. Le solde utilisable Runway existant exige une mesure de moins de cinq minutes ; une mesure absente n’est pas interprétée comme un solde nul. Les notifications utilisent une inscription personnelle explicite distincte du suivi des vidéos. Chaque tentative revérifie l’identité staff, le consentement, l’expiration et l’état du navigateur enregistré. Une livraison par alerte et appareil, verrou et reprises bornées ; un endpoint expiré est désactivé. Le panneau reste disponible sans activer les notifications. L’acceptation par le service push ne constitue pas une preuve d’affichage système.

## Comparaisons et suivi client

Les fenêtres comparées ont une durée égale en UTC, y compris lorsque la journée actuelle est partielle. Les mêmes filtres sont appliqués. Les périodes dépassant l’échantillon maximal restent signalées. La marge n’est pas calculée si des coûts ou frais sont incomplets ; les rapprochements comptables peuvent faire évoluer les périodes passées.

Les signaux de suivi sont explicables : au moins deux échecs sur 14 jours ; aucune première vidéo prête après trois jours, sans génération active ; ou plus de 14 jours sans vidéo prête après au moins deux réussites, sans génération active. Ils excluent les comptes internes/démonstrations et proposent de préparer un dossier. Ils ne déclenchent aucun message client et ne constituent pas une prédiction de résiliation.

## Versions de configuration

Les réglages supportés sont les fonctionnalités, les capacités de génération, les cartes par défaut et les avatars IA. La migration conserve leur état initial pour permettre de revenir même avant la première modification historisée. L’écran montre les différences entre l’état actuel et une version choisie. Restaurer exige un motif et la révision courante ; l’écriture de la nouvelle version et du journal est atomique. Les schémas actuels, les limites et la disponibilité de l’avatar par défaut sont revalidés. Les secrets, contenus médias et déploiements applicatifs ne sont pas restaurés par cet écran.

Les scénarios D1, rôles, conflits, comparaisons, restauration, notifications opt-in et récupération idempotente sont couverts dans `tests/admin-workspace.test.ts`.
