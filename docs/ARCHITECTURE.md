# BienVu — architecture proposée

Statut : architecture des sprints 00–03 démontrée ; pipeline vidéo et facturation encore à construire. Références officielles dans [SOURCES.md](SOURCES.md).

## Services

| Composant | Choix proposé | Responsabilité |
|---|---|---|
| Application | Next.js standard + adaptateur Cloudflare sur Workers | Interface, sessions, routes serveur et accès autorisé aux fichiers |
| Import | Worker TypeScript + Browser Run + Container privé Node/Sharp | TLS à IP épinglée, extraction structurée et photos réencodées |
| Traitement durable | Cloudflare Workflows | Enchaînement des étapes, reprises et statut des jobs |
| Données | Cloudflare D1 | Agences, annonces, jobs, abonnements, écritures de quota et coûts |
| Fichiers | R2 privé | Photos validées, narration, manifeste et MP4 |
| Rendu | Remotion dans Cloudflare Containers | Chromium et encodage vidéo dans un environnement Linux/Node |
| Authentification | Better Auth + D1 ; e-mail/mot de passe et Google | Sessions et identité vérifiée ; deux modes demandés par Alex |
| E-mails de compte | Binding Cloudflare Email Service | Confirmation et récupération ; simulateur local, domaine et Workers Paid requis pour le réel |
| Texte et voix | API OpenAI, modèles configurables | Script factuel et synthèse vocale |
| Abonnements | Stripe Checkout + Billing + Customer Portal | Paiement récurrent et gestion client |

« Tout Cloudflare » concerne l'hébergement applicatif, les données et le calcul. Stripe, Google OAuth et l'API d'IA sont des services externes proposés, pas des hébergeurs supplémentaires pour le code de BienVu. Ces choix restent documentés et remplaçables.

## Next.js : décision à enregistrer

Le choix initial proposé est de conserver un vrai projet Next.js et de tester `@opennextjs/cloudflare`. La documentation Cloudflare recommande désormais vinext pour les nouvelles applications, mais le décrit encore en bêta et comme une réimplémentation de l'API Next.js. OpenNext adapte un build Next.js et reste documenté [S01–S02].

Au sprint 00, vérifier la matrice exacte des versions, le build de production, les route handlers, les bindings et les sessions. Épingler les versions qui fonctionnent et noter la décision dans une ADR. Ne pas convertir silencieusement le projet en vinext si une incompatibilité apparaît ; expliquer les éléments incompatibles et la voie retenue. Aucune version exacte de Next.js n'est imposée par ce dossier sans vérification de compatibilité.

## Deux environnements de calcul

Un Worker n'est pas un processus Node.js complet permettant de lancer librement des exécutables. Le navigateur de scraping est géré par Browser Run. Le navigateur de rendu et l'encodeur vivent dans le conteneur Remotion. Ne pas importer `@remotion/renderer`, FFmpeg, ou un lancement Chromium local dans le bundle du Worker.

Pour Browser Run, utiliser le package Cloudflare documenté et ses bindings. Ne pas supposer que Crawlee ou le package Playwright standard se déploient tels quels dans Workers. Le premier import n'a pas besoin de Crawlee.

Le conteneur est un service privé de calcul déclenché à la demande, avec une concurrence réduite au lancement et mise en sommeil après inactivité. Remotion fournit une démonstration Cloudflare Containers, explicitement incomplète pour un produit payant [S06]. Construire autour les contrôles d'accès, le suivi, les reprises et la gestion des échecs.

## Organisation cible du monorepo

| Chemin proposé | Contenu |
|---|---|
| `apps/web` | Next.js, interface, Better Auth, routes utilisateur et webhook Stripe |
| `apps/pipeline` | Worker d'import, Workflow et accès privé au contrôleur de rendu |
| `apps/importer` | Transport Node TLS et décodage Sharp, Container privé `basic` |
| `apps/renderer` | Serveur Node du conteneur, Remotion renderer, mesure audio et vérification MP4 |
| `packages/contracts` | Types TypeScript et schémas de validation partagés, sans dépendance Node native |
| `packages/video` | Composition React Remotion et primitives visuelles |
| `packages/db` | Schéma D1, migrations et fonctions d'accès côté serveur |
| `packages/importers` | Extraction générique et adaptateurs par source |
| `fixtures` | Petits échantillons autorisés ou synthétiques, expurgés et déterministes |
| `docs/bienvu` | Ce dossier, suivi et rapports de sprint |

Un dépôt pnpm suffit ; n'ajouter un orchestrateur de monorepo que s'il résout un besoin identifié. Les Dockerfiles couvrent le renderer, le transport d'import privé et les outils locaux Linux. L'extension au transport d'import est motivée dans l'[ADR 0003](adr/0003-transport-import-cloudflare.md).

## Chemin d'une génération

1. Le serveur authentifie le client et déduit son agence depuis sa session.
2. Il valide l’URL ou l’annonce manuelle déjà enregistrée, contrôle l’accès, réserve atomiquement le crédit et le budget estimé, puis écrit le job et une intention de lancement persistante.
3. Il démarre un Workflow avec un identifiant stable lié au job. Une relance de l'intention ne doit pas créer un second job ni réserver un second crédit.
4. Le Workflow importe la page, valide et stocke les photos, ou reprend l’annonce manuelle et ses photos privées. Il produit ensuite le script et les pistes de voix, en conservant la provenance importée ou déclarée des informations.
5. Il crée le manifeste de rendu immuable avec une copie de la charte de l'agence et le droit au filigrane fixé côté serveur.
6. Le contrôleur déclenche le conteneur avec un identifiant de rendu. L'acceptation du travail et la fin du rendu sont distinctes ; prévoir statut et reprise, sans dépendre d'une requête HTTP ouverte jusqu'à la fin.
7. Le conteneur mesure les pistes, calcule la timeline, rend et contrôle le MP4, puis le stocke dans R2. Le contrôleur vérifie l'existence et l'intégrité de l'artefact.
8. Le job passe à `ready` et sa réservation est consommée une seule fois. Le client voit l'état par interrogation périodique.

Utiliser Workflows comme orchestration durable. Ne pas ajouter Redis, BullMQ et une seconde file pour les mêmes étapes sans besoin démontré. Les retries du Workflow n'offrent pas à eux seuls une exécution exactement une fois des appels externes [S10].

## Persistance et isolation

- D1 conserve les métadonnées ; R2 conserve les objets volumineux. Les étapes Workflows transportent des identifiants et des clés d'objet, pas des tableaux de photos en base64.
- Tous les enregistrements métier portent `agencyId`. Le filtre d'agence est systématique côté serveur ; l'identifiant fourni par le navigateur ne vaut pas autorisation.
- R2 reste privé. Les téléchargements passent par une route authentifiée prenant en charge les requêtes Range, ou par des URL signées de courte durée émises après contrôle d'accès.
- Les fichiers accessibles au renderer doivent être limités aux objets du job. Ne jamais transmettre au navigateur de scraping les secrets de l'agence, du stockage ou du paiement.
- Stocker les fichiers avec des clés idempotentes par job, étape et empreinte ; garder les versions de modèle, prompt, template et paramètres.
- Séparer local, staging et production, notamment D1, R2, OAuth et Stripe test/live.

## Réservation et reprises

L'unité facturée est une nouvelle vidéo aboutie. Le téléchargement, l'aperçu et la relance technique d'un même job ne consomment pas un nouveau crédit. Une nouvelle création volontaire après succès en consomme un.

L'écriture de réservation, le contrôle du solde et la création du job doivent être atomiques. Sur D1, utiliser une stratégie supportée et démontrée par des tests concurrents : batch transactionnel avec contraintes/conditions assurant un rollback intégral, ou mécanisme de sérialisation documenté si nécessaire. Ne pas supposer qu'une transaction interactive ou deux appels SQL séparés sont atomiques. L'échec d'une condition doit annuler la réservation, et pas seulement renvoyer zéro ligne.

Un mécanisme périodique réconcilie les intentions non lancées, les jobs bloqués, les fichiers produits avant un crash, les réservations expirées et les statuts Stripe. Une réconciliation ne relance pas aveuglément des appels payants.

## Limites proposées pour les premiers tests

- Un rendu à la fois ; au plus deux sessions Browser Run actives, avec attente plutôt que lancement sans limite.
- Un job actif par agence. Browser Run fermé dans `finally` ; délai d'import borné à 60 secondes pour la page principale.
- 12 photos téléchargées au maximum, 10 Mo par image, 50 Mo au total ; au plus 6 photos retenues pour la vidéo.
- Budget applicatif et temporisation des retries définis dans BUDGET-ET-OFFRES.md.
- Un conteneur `standard-2` est un point de départ à mesurer, pas un dimensionnement validé ; ajuster selon RAM, CPU et coût observés.

## Frontières de sécurité propres au produit

Les URL viennent des utilisateurs. Valider HTTPS, hôte, port, résolution et redirections ; refuser les adresses locales, privées, loopback, link-local et endpoints de métadonnées, y compris IPv6. Appliquer la protection aussi aux photos, sous-requêtes et nouvelles navigations. Vérifier l'application effective de cette politique dans Browser Run, pas seulement au champ de saisie.

Les pages sont des données non fiables : aucun texte HTML ne peut modifier le prompt système, lancer un outil ou injecter du code dans Remotion. Le renderer n'exécute que le template BienVu et reçoit des données validées. Les logos et photos acceptés sont des images raster contrôlées ; pas de SVG actif ou de HTML arbitraire.

La préférence Cloudflare n'autorise pas un déploiement externe automatique si le rendu ou un portail échoue. Consigner le résultat, terminer les éléments vérifiables et fournir une alternative chiffrée si nécessaire.

## Réalisation du sprint 03

L’importeur TypeScript est séparé du transport. L’application workerd locale utilise un pont Node sur loopback authentifié pour les connexions HTTPS à IP épinglée et le décodage raster borné. D1 et R2 restent les bindings de l’application. Ce pont est un outil de développement, pas un nouvel hébergement retenu. Le chemin distant utilise depuis le 28/09 un Container Cloudflare `basic`, séparé du renderer, via Service Binding privé. Browser Run délègue tout trafic autorisé au même transport à IP épinglée ; photos URL et manuelles passent par Sharp dans le conteneur. Un cron purge les imports abandonnés/expirés avec protection des références de jobs. [ADR 0003](adr/0003-transport-import-cloudflare.md), [configuration et recette](IMPORTS.md), [rapport distant](preuves/sprint-03/CLOUDFLARE.md).

Les photos privées précédant un job sont journalisées sous un préfixe d’import. La publication D1 est atomique après stockage ; une purge rejouable protège toute référence depuis un job. Le manifeste de rendu demeure limité aux fichiers de son job. Aucun crédit n’est consommé par l’import seul.
