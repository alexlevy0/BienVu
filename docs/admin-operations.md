# Pilotage et support

L’administration conserve les outils existants et les regroupe dans six catégories. Les favoris et les vues de listes sont propres au compte et au navigateur. Les liens de listes contiennent leurs critères ; les dossiers vidéo et agence ont une URL dédiée.

| Fonction | Accès / comportement |
| --- | --- |
| Navigation | Six catégories, recherche de rubrique, favoris locaux. |
| Points d’attention | Générations sans changement depuis 15 minutes, signalements ouverts et incidents avec agence, date et diagnostic. |
| Diagnostic vidéo | Source, transitions d’étapes, appels script/voix, préparation, avatar, chaque animation, ressources en file, crédits, coûts et notifications. |
| Agence à 360° | Abonnement, crédits, dernières vidéos, signalements, correspondance par adresse du propriétaire et notes internes. |
| Fournisseurs | Activité réelle enregistrée, capacité et occupation des files, dernier solde Runway, vérification gratuite du solde HeyGen. Un solde inconnu n’est pas zéro. |
| Filtres et vues | Critères conservés par rubrique, URL partageable, vues nommées locales, raccourci des échecs de la semaine. |
| Performance | Moyenne, médiane et P95, filtres origine/durée/avatar/animations, attentes cumulées, séries quotidiennes sans faux zéros. |
| Incidents | Une occurrence par vidéo/étape/code, deux fenêtres de 7 jours, suivi optimiste à traiter/en cours/résolu, réouverture si nouveau cas. |
| Rétention | Première puis deuxième vidéo prête, retour à 7/30 jours avec exclusion des cohortes trop récentes, jours et semaines d’usage. |
| Rentabilité par rendu | Standard, avatar, avatar avec animations, animations seules. Modes Stripe séparés ; marge inconnue si les frais/coûts ne sont pas couverts. |
| Changements | Réglages et changements documentés sur la courbe de durée ou de taux d’échec ; historique de déploiement vérifié. |
| Tables et dossiers | En-têtes fixes dans les tables, unités et badges communs, dossiers longs en page dédiée. |

## Droits

Les indicateurs, dossiers complets, coûts, changements et incidents restent réservés au super admin. Le compte de support garde ses rubriques existantes et peut lire/ajouter uniquement des notes internes depuis la fiche agence. Les nouvelles écritures vérifient l’origine, les entrées et la session, sont limitées en fréquence et conservées avec l’auteur. Les notes ne déclenchent aucun e-mail.

## Mesures

- Fenêtres UTC, jusqu’à 366 jours avec dates explicites. Les performances utilisent les 20 000 créations les plus récentes au maximum ; un dépassement est signalé. Les anciens jobs sans événement `ready` ne sont pas chronométrés.
- La durée totale va de la création à l’événement original `ready`, indépendamment d’une modification ultérieure du job. P95 : rang supérieur ; médiane : moyenne des deux valeurs centrales pour un effectif pair.
- Les files peuvent se chevaucher. Leurs attentes cumulées ne sont jamais soustraites du temps total. Les intervalles de créneau sont visibles dans le diagnostic et ne sont pas présentés comme du temps CPU.
- Le suivi des nouvelles transitions d’étapes et des notifications commence avec la migration `0081`. L’ancien historique n’est pas inventé. « Accepté » signifie accepté par le fournisseur push, sans preuve de lecture/affichage par le navigateur. Aucun endpoint ou secret push n’est exposé.
- La rétention porte sur les agences ayant un compte et une première vidéo prête dans la période. Les taux à 7/30 jours ont uniquement les cohortes suffisamment anciennes au dénominateur. Les essais anonymes non rattachés sont exclus.
- La rentabilité utilise les vues financières existantes ; les provisions ne deviennent pas des factures. Les groupes correspondent aux options demandées, y compris si une animation a échoué.

## Déploiements

Après activation du Worker web, exécuter `node scripts/record-admin-deployment.mjs`. Le script vérifie la version active à 100 %, lit sa date réelle et son identifiant, puis enregistre une entrée idempotente. Ne pas l’appeler après un simple build ou avant activation. Les anciens déploiements ne sont pas reconstitués.

Appliquer `0081_admin_operations.sql` avant de déployer le web. Les triggers observent aussi les Workers déjà déployés ; aucune reconstruction du renderer n’est nécessaire.
