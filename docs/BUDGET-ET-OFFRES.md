# BienVu — budget des tests et hypothèses commerciales

**Plafond actuel du pilote, autorisé par Alex le 29/09/2026 : 50 € par mois, hébergement et API compris ; coupure préventive à 45 €.** La marge de 5 € protège des écarts entre provisions et facture, sans garantir le montant facturé. Les relevés datés ci-dessous conservent les anciennes enveloppes de 30 € et 40 € pour leur contexte. Les montants en euros sont des enveloppes de travail, pas des devis ; prévoir conversion et taxes effectives.

Après la publication, deux créations authentifiées et un essai anonyme sur le domaine le 29/09, le dernier instantané D1 connu est **27,85 € de base + 9,50 € d'imports réservés = 37,35 €**. Avec les **0,05 € provisionnés hors D1** pour un appel OpenAI local, le cumul prudent est **37,40 €**, soit **7,60 € avant la coupure de 45 €**, sous réserve du rapprochement des factures. Le premier job authentifié a échoué avant les fournisseurs car la sous-enveloppe de narration était en pause ; son crédit a été libéré, sa provision conservée. Le second et l'essai anonyme ont produit chacun un MP4 réel ; l'essai anonyme possède aussi son aperçu filigrané. Ses six appels de texte/voix représentent 0,30 € de sous-réservations **déjà incluses** dans sa provision vidéo. Les extractions de description restent incluses dans la base D1. L'essai anonyme n'a pas été récupéré après connexion ; son crédit demeure `unfunded`. [Recette distante et limites](preuves/accueil/DEPLOIEMENT-29-09.md).

La migration `0020_budget_envelope_50.sql` a relevé seulement le mois actif de 35 à 45 € et la politique d'essai de 25 à 45 €, sans effacer les engagements, tentatives, quotas ni pauses existants. Les variables du Worker de rendu sont à 45 €/50 €. Chaque essai URL anonyme réserve 2 € ; chaque extraction de description réserve 0,05 €, sans double comptage des sous-journaux. Le lancement de nouvelles dépenses reste bloqué si le mois n'est pas explicitement ouvert ou si la coupure est atteinte.

**28/09/2026 : Alex déclare avoir activé Workers Paid pour 5 €.** Ce montant remplace la dépense initiale déclarée de 0 €, sans constituer une facture consultée. La recette Containers conserve une provision fixe de 8 € (dont 3 € de marge de rapprochement) et réserve 0,50 € par tentative ; trois rendus prévus, cinq au maximum en comptant les échecs. La consultation API de la facture est refusée avec les droits OAuth actuels ; les métriques Containers sont accessibles séparément.

**Après la recette Containers : cinq tentatives, dont quatre échecs et un MP4 distant utilisable.** Engagement applicatif prudent avant le domaine : 10,50 €. Pause persistante et nouveaux rendus désactivés, conteneur arrêté. Ces réservations ne sont pas une facture ; [preuves et limites financières](preuves/sprint-00/CONTAINERS-PAID.md).

**Domaine acheté par Alex le 28/09/2026 : `bienvu.online`, 4,99 USD déclarés payés.** Ce paiement est compté intégralement ce mois-ci. En attendant le débit en euros, une provision de **6 €** est retranchée de la marge : engagement prudent total **16,50 €**, solde estimé **13,50 €** sur les 30 €. Cette provision n'est ni un taux de change ni un montant facturé vérifié. Le renouvellement du domaine n'a pas été chiffré. Aucun autre achat n'est engagé pour la recette e-mail ; les deux messages de confirmation/récupération ont été livrés avec l'offre Cloudflare existante (surcoût estimé 0 €, facture non consultée).

**Reprise du sprint 06, autorisée le 28/09/2026 : 26,35 € provisionnés sur 40 €.** L’ancien cumul de 24,75 € reste conservé ; ajout de **1,60 €** pour au plus trois nouvelles tentatives de rendu à 0,50 € et 0,10 € d’infrastructure. **13,65 € disponibles dans l’enveloppe, dont 8,65 € avant coupure à 35 €.** Aucun nouvel appel Google/OpenAI prévu : les WAV approuvés sont réutilisés. La migration 0013 permet le nouveau plafond sans modifier les anciens budgets ; le mois de septembre est relevé explicitement, avec compteurs, échecs et provisions conservés. Les provisions ne sont pas une facture. [Résultats de recette](preuves/sprint-06/RAPPORT.md).

**Sprint 07 — 28/09 : provision supplémentaire de 3,50 € avant la recette complète.** Deux générations contrôlées (texte/voix 1,40 €, rendu 1 €, un import 0,50 €, marge infrastructure 0,60 €) dans une D1 isolée. Cumul prudent **29,85 €**, marge **10,15 € sur 40 €**, dont **5,15 € avant coupure à 35 €**. Les montants réservés dans les sous-journaux font partie de cette provision, ils ne sont pas ajoutés une seconde fois. Compteurs et coûts précédents conservés. Une allocation de développement d’une vidéo pour l’agence d’Alex réserve jusqu’à 1,70 € seulement à son utilisation ; aucun achat ni rechargement API nouveau. Facture/TTC restent à rapprocher. [Recette et limites](preuves/sprint-07/RAPPORT.md).

## Historique : pilote anonyme initialement demandé le 29/09 à 30 €

La nouvelle demande fixe 30 € pour l’ensemble du service. Dernier total connu : **29,85 € de provisions**, soit **0,15 € théorique** avant rapprochement des factures, et aucune marge sous une coupure prudente à 25 €. Les anciennes écritures et seuils distants 40 €/35 € ne sont pas réinitialisés par cette tâche. **Aucun test payant, achat ou déploiement** pour l’implémentation anonyme ; portes fermées par défaut.

La migration locale `0018_anonymous_budget_ceiling.sql` impose `trial_policy.budget_ceiling_cents=2500` sur le même registre de coûts, avec un plafond effectif au plus égal au plafond global. Elle inclut les 0,50 € du futur import dans le contrôle d’admission, sans les réserver deux fois. Un ancien plafond global de 35 € ne peut donc pas autoriser un essai anonyme au-delà de 25 €. Migration non appliquée à distance.

Une nouvelle tentative URL provisionne 1,20 € de génération + **0,30 € de dérivée** + 0,50 € d’import, soit **2 €**, échecs compris. Renderer/voix gardent leurs sous-enveloppes incluses dans ce total. Le vrai post-traitement local est mesuré dans le [rapport](preuves/essai-anonyme/RAPPORT.md), sans assimilation au coût Containers. Les limites 5/jour, 30/mois ne garantissent pas une facture de 30 €. Rapprocher la consommation et obtenir une marge suffisante avant activation. [Configuration et budget détaillés](ESSAI-ANONYME.md).

**Workflow descriptif — 29/09, local :** un appel OpenAI Responses réel sur une annonce fictive avec crédits API préexistants, 382 tokens d'entrée et 101 de sortie. Facturation effective inconnue ; provision prudente **0,05 €**, ajoutée une seule fois au cumul historique de 29,85 €, soit **29,90 € provisionnés**. Aucun rendu ni TTS supplémentaires. Les appels hébergés vérifient le plus bas des plafonds D1 ; après la hausse autorisée, le mois actif et le pilote sont bornés à 45 €. [Preuve et travaux restants](preuves/accueil/WORKFLOW-IMPROVEMENTS.md).

## Répartition de travail après la hausse du 29/09

| Poste | Enveloppe de travail mensuelle |
|---|---:|
| Workers Paid, conversion et taxes estimées | 8 € |
| Consommation Cloudflare supplémentaire : navigateur, conteneurs, D1/R2, Workflows, logs | 7 € |
| API texte et voix pour les tests | 5 € |
| Marge pour écarts, opérations non anticipées ou prépaiement minimal | 30 € |
| Total maximal visé | **50 €** |

Les adresses de développement fournies restent utilisables pour le site. Le domaine acheté par Alex pour l'expéditeur consomme désormais une partie de la marge ci-dessus ; son paiement réel doit remplacer la provision une fois le débit connu. Aucun abonnement de scraping, proxy payant, abonnement musical ou deuxième plateforme d'hébergement n'est prévu dans cette enveloppe. Un abonnement ChatGPT ne remplace pas les crédits API ; comptabiliser les crédits prépayés effectivement achetés ainsi que la consommation, sans les compter deux fois.

## Tarifs officiels consultés le 27 septembre 2026

| Service | Repère tarifaire | Source |
|---|---|---|
| Workers Paid | Minimum de 5 USD/mois au niveau du compte, puis dépassements éventuels | S08 |
| Browser Run gratuit | 10 minutes de navigateur/jour, 3 navigateurs simultanés | S04 |
| Browser Run avec Workers Paid | 10 heures/mois incluses, puis 0,09 USD/heure ; facturation de concurrence au-delà de l'allocation prévue | S04 |
| Containers | Réservé à Workers Paid ; allocations de calcul incluses et dépassements CPU, RAM, disque, réseau | S07 |
| Remotion | Gratuit si éligible, notamment personne seule ou équipe jusqu'à 3 selon les conditions ; sinon chiffrer la licence avant de conclure sur le budget | S17 |
| OpenAI GPT-5.4 mini | Repère du 28/09 : 0,75 USD/M tokens en entrée, 4,50 USD/M en sortie ; remise cache non déduite de la provision | [Modèle et tarifs](https://developers.openai.com/api/docs/models/gpt-5.4-mini) |
| Google TTS Chirp 3 HD | Choisi par Alex le 28/09 : 1 million de caractères gratuits/mois, puis 30 USD/million ; facturation obligatoire | [Tarifs Google](https://cloud.google.com/text-to-speech/pricing) |

Le plan gratuit Browser Run aide à tester le scraping. Le rendu sur Cloudflare Containers nécessite le plan Workers Paid : le produit complet n'est donc pas un hébergement intégralement gratuit.

**Premier essai Chirp 3 du 28/09 à 18:05 UTC :** accès Google rétabli, **une synthèse réelle de 347 caractères**, WAV de 19,52 s. Prix brut estimé avant gratuité : **0,01041 USD** ; la console d'Alex affiche 25,746 EUR/million au-delà du million gratuit. Facture et solde de gratuité inconnus. Avant l'appel, D1 indiquait **22,50 €** (6 € d'imports, soit 0,50 € de plus que lors de la recette 04). Une provision de campagne de **0,15 €** a été ajoutée en conservant les compteurs, le plafond et l'état des imports : cumul **22,65 €**, marge **7,35 € sur 30 €**, coupure à 25 €. La sonde compte 0,05 € pour cet appel, inclus dans les 0,15 € déjà provisionnés ; aucune double addition. Maximum trois tentatives/3 000 caractères par mois. Rejeu du WAV vérifié sans réseau et sans seconde réservation. [Procédure](VOIX-GOOGLE.md) · [mesures](preuves/sprint-05/PREPARATION-GOOGLE.md#première-synthèse-réelle--2809-1805-utc).

**Campagne texte/voix locale du 28/09 à 18:28 UTC : 23,35 € provisionnés, marge 6,65 € sur 30 € à cet instant.** Alex confirme **0 € de crédits OpenAI achetés ce mois-ci**. Avant l'essai complet, réservation globale de **0,70 €** (deux appels texte + douze voix à 0,05 € maximum chacun) : base D1 1 665 → 1 735 centimes, imports 600 centimes, coupure toujours à 25 €. Réel exécuté : un appel OpenAI et cinq synthèses Google, soit 0,30 € de réservations locales **déjà incluses** dans les 0,70 €. Estimation 0,001095 USD de texte et 0,0078 USD de voix, avant gratuité ; avec l'échantillon précédent, total estimé **0,019305 USD**. Facture/TTC et gratuité Google restante inconnus. Reprise et réduction des pauses sans nouvel appel. Aucune nouvelle dépense d'achat ; aucun double comptage des crédits anciens. [Rapport](preuves/sprint-05/RAPPORT.md) · [procédure et limites](NARRATION.md).

**État à la fin de la recette Cloudflare du sprint 05 : 24,15 € provisionnés, marge 5,85 € sur 30 €.** Une campagne supplémentaire de **0,80 €** (0,70 € API et 0,10 € Worker/D1/R2) est réservée avant l'essai : base D1 1 735 → 1 815 centimes, plus 600 centimes d'import. Sept réservations de 0,05 € dans le journal distant (une tentative interrompue par une incompatibilité runtime, puis un texte et cinq voix réussis), soit 0,35 € **déjà inclus** dans les 0,70 €. Reprise après redéploiement 0/0, enveloppe et Worker remis en pause. Estimation du succès distant **0,009120 USD avant gratuité**, cumul API des essais réussis **0,028425 USD** ; facture, change, TTC et surcoût infrastructure non rapprochés. La base de fixture isolée ne modifie pas les compteurs d'import publics. Aucun achat de crédit ni nouvelle souscription. [Preuves et écarts](preuves/sprint-05/CLOUDFLARE.md).

**Comparaison de naturel du 28/09 à 19:29 UTC : provisions globales toujours à 24,15 €.** Le journal distant conservait 0,35 € disponibles sur son enveloppe API de 0,70 €. Le nouvel essai Cloudflare utilise un appel OpenAI et cinq appels Google, soit 0,30 € de réservations supplémentaires **dans cette même enveloppe** : total distant 0,65 €, reste 0,05 €. Aucun compteur effacé ni nouvelle provision globale. Estimation de cet essai : **0,009636 USD avant gratuité** ; cumul API réussi **0,038061 USD**, facturation inconnue. Voix et rythme validés par Alex. [Comparaison, mesures et limites](preuves/sprint-05/NATUREL.md).

**Ajout confirmé le 28/09/2026 : e-mail/mot de passe en plus de Google.** [Cloudflare Email Service](https://developers.cloudflare.com/email-service/platform/pricing/) exige Workers Paid pour envoyer aux adresses des utilisateurs : 3 000 e-mails/mois inclus par compte, puis 0,35 USD/1 000 (tarif consulté le 28/09/2026). La préparation utilise cet hébergement déjà prévu, avec un plafond applicatif de 50 messages/jour et 3 par adresse/10 minutes. Les essais locaux coûtent 0 € et n’envoient rien. `bienvu.online` est désormais acheté et actif ; Email Sending a été activé pour ce domaine. Le contrôle fournisseur avant envoi indique une limite de 1 000 messages/jour et zéro message consommé. La recette réelle reste limitée au destinataire confirmé par Alex. La recette distante observe 115 ms CPU pour une inscription, 113 ms pour une connexion de recette et 124 ms pour le reset ; ce petit échantillon ne donne pas un coût en charge. Deux messages sont comptés et livrés, surcoût e-mail attendu 0 € dans les allocations existantes. Les limites applicatives ne couvrent pas d’autres applications utilisant les allocations du compte Cloudflare.

### Calcul du rendu, à remplacer par des mesures

Après allocations incluses, les tarifs consultés pour Containers sont : 0,000020 USD par vCPU-seconde utilisée, 0,0000025 USD par GiB-seconde de RAM provisionnée, 0,00000007 USD par GB-seconde de disque provisionné. Les allocations sont notamment 375 vCPU-minutes, 25 GiB-heures et 200 GB-heures par mois. RAM et disque sont facturés selon le type d'instance et son temps actif, pas seulement selon les octets occupés [S07].

Formule indicative du coût brut d'une session de conteneur, avant allocations et autres frais :

```text
cpu_seconds × cpu_rate
+ uptime_seconds × provisioned_memory_GiB × memory_rate
+ uptime_seconds × provisioned_disk_GB × disk_rate
```

Ajouter le démarrage, le téléchargement des médias, le traitement audio, le rendu, l'upload et le temps avant mise en sommeil. Les allocations étant partagées au compte, ne pas les soustraire une fois par service ou une fois par vidéo. Workers, Durable Objects, stockage, transferts et journaux peuvent s'ajouter.

## Mesures exigées

Chaque tentative enregistre temps de navigateur, tentatives, tokens texte, appels TTS, durée audio, durée active du conteneur, type d'instance, volume de stockage, erreurs et coût estimé. Réconcilier régulièrement avec les tableaux de facturation.

```text
coût effectif par vidéo utilisable =
  toutes les dépenses variables des tentatives de l'échantillon
  / nombre de vidéos utilisables produites
```

Le rapport sépare coût marginal estimé, coût après allocations disponibles et facture totale. Une vidéo ratée coûte potentiellement de l'argent sans consommer le quota du client.

## Limites applicatives proposées avant les premiers clients

- **Imports : 10 tentatives par jour UTC**, modification demandée par Alex le 28/09/2026, et **30 par mois UTC**. La migration `0010` conserve l’historique. Ce garde-fou de test partagé entre agences est distinct du nombre de vidéos de l’abonnement et des limites du fournisseur Cloudflare. Les 0,50 € provisionnés par tentative hébergée restent conservés ; la hausse du 29/09 porte la coupure à 45 €.
- 30 générations réelles maximum par mois de test et 5 par jour, hors fixtures locales ; commencer par 3 à 5 rendus au sprint 00.
- Un seul rendu simultané ; fermer les sessions navigateur ; arrêter les conteneurs inutilisés rapidement après vérification de l'absence de rendu actif.
- Réserver une estimation conservatrice avant chaque job. Valeur initiale proposée : 0,50 € par tentative complète, à remplacer par les mesures ; inclure les jobs déjà en cours dans le budget engagé.
- Alerte à 20 € d'engagement estimé mensuel ; pause des nouvelles générations payantes en coûts à 45 € pour garder 5 € de marge. L'interface et les téléchargements existants restent disponibles.
- Postes distincts pour frais fixes, dépenses réellement facturées, prépaiements et réservations ; aucun calcul de solde uniquement en mémoire.
- Limiter taille des médias, tokens d'entrée/sortie, durée des jobs et nombre de retries. Les mocks sont le mode par défaut de la CI.
- Ajouter une commande ou un contrôle opérateur permettant de couper immédiatement nouvelles sessions navigateur, voix et rendus.

**Ces contrôles ne constituent pas une garantie de plafond de facture fournisseur.** Une consommation déjà engagée, des données de facturation retardées ou du trafic extérieur peuvent dépasser les estimations. Le plafond de 50 € impose aussi le suivi des comptes, les limites réellement disponibles chez les fournisseurs et l'arrêt des tests à temps. Ne pas confondre alerte budgétaire et coupure automatique.

**Sprint 03, portage Cloudflare du 28/09/2026 :** cinq imports réels du parcours hébergé (trois annonces d'agences, une page JS et une saisie synthétiques), plus deux groupes opérateur bornés, provisionnés 7 × 0,50 € = **3,50 €** en D1 avant exécution. Six sessions Browser Run fermées, conteneur `basic` endormi, aucune voix/rendu IA ni nouvelle vidéo. Le sixième import est refusé 429 ; les cinq tentatives du jour restent après purge. Un dossier synthétique antidaté pour vérifier la purge ajoute séparément une tentative au jour précédent, sans lancement de transport.

Alex confirme aucune autre dépense : **8 € fixes + 2,50 € rendus antérieurs + 6 € domaine + 3,50 € imports = 20 € de provisions**, **10 € encore dans l'enveloppe de 30 €**. Le nouveau registre mensuel tient compte du domaine et des anciens rendus ; le contrôleur renderer est laissé en pause avec ses cinq essais, son ancien instantané n'est pas le budget global courant. Alerte opérateur à 20 €, coupure au plus à 25 €. Les seuils restent prudents : facture TTC, conversion du domaine et allocations effectivement disponibles non rapprochées.

La réservation d'un import précède les ressources et persiste après échec/purge. Pas de mois nouveau automatiquement ouvert ; `node scripts/import-operator.mjs state|pause|resume` et la commande `budget <base_centimes> <plafond_centimes>` permettent le suivi explicite. [Exploitation](IMPORTS.md#cloudflare--configuration-et-exploitation) · [mesures et limites](preuves/sprint-03/CLOUDFLARE.md).

Le troisième e-mail réel valide le domaine actuel, réception et parcours confirmés par Alex ; surcoût e-mail attendu nul dans les inclusions, sans le confondre avec une facture vérifiée.

**Sprint 04, recette du 28/09/2026 :** quatre imports hébergés supplémentaires, tous en échec, réservés avant exécution : **2 €**. Cumul prudent à cet instant **22 €**, marge **8 €** sur l’enveloppe de 30 €, coupure toujours à 25 €. Une session Browser Run de 2,066 s fermée normalement ; conteneur endormi, dernier cycle observé 56,829 s (pas un cumul ni une facture). Compteur journalier conservé à 9/10 et mensuel à 10/30 après nettoyage. Aucun nouvel abonnement, envoi d’e-mail ou appel IA/TTS/rendu pendant cette recette. L'instantané de 18:06 UTC, avant la campagne texte/voix, est de **10/10 imports ce jour et 11/30 ce mois**, avec **22,65 €** provisionnés, campagne vocale comprise. [Rapport et mesures](preuves/sprint-04/RAPPORT.md#recette-cloudflare).

## Offres confirmées pour la présentation, vente non ouverte

Alex a confirmé le 30/09/2026 les prix et quotas de la maquette « Découvrir les offres ». L'ancienne hypothèse Découverte 29 €/10, Agence 59 €/30 et Volume 99 €/60 est remplacée pour la présentation commerciale. Les prix payants ci-dessous sont mensuels HT ; la facturation réelle reste à implémenter et à valider avant toute souscription.

| Code | Offre | Prix mensuel | Vidéos par période |
|---|---|---:|---:|
| `gratuit` | Gratuit | 0 € | 3 |
| `plus` | Plus | 19 € HT | 20 |
| `pro` | Pro | 49 € HT | 60 |

Chaque palier conserve la même qualité vidéo et l'identité d'agence. Depuis le 29/09, un essai anonyme abouti par session avec aperçu filigrané ; trois vidéos par mois sur le compte gratuit, dont l’essai récupéré. Un crédit et la connexion débloquent le master existant, sans nouvel export. Les anciens essais `trial` conservent leurs fichiers et droits historiques. Pas d'offre annuelle, de dépassement automatique, de report de crédits ou de packs supplémentaires dans cette version.

La page publique présente cette grille confirmée, mais ses CTA payants restent inactifs : il n'existe encore ni Checkout ni achat. Les identifiants et quotas des futures allocations serveur, les prix TTC applicables et les textes contractuels doivent être préparés au sprint 08 avant l'ouverture des paiements. Les anciennes fixtures Stripe ne deviennent pas des offres de production du seul fait de cette maquette.

Pour vérifier la viabilité, chiffrer au quota entièrement utilisé : revenu net après taxes et paiement, moins frais fixes alloués, générations réussies et ratées, essais gratuits, stockage et support. Ne pas déduire une marge garantie à partir du seul prix du TTS.
