# Essai anonyme et récupération après connexion

Implémentation et recette locale du 29 septembre 2026 : [rapport local](preuves/essai-anonyme/RAPPORT.md). Alex a ensuite autorisé un plafond pilote de **50 €/mois avec coupure à 45 €**, ainsi que la [publication sur `bienvu.online`](preuves/accueil/DEPLOIEMENT-29-09.md). Un essai anonyme réel a depuis créé un master privé et un aperçu filigrané sur Cloudflare, vus par Alex. La fenêtre privée a été fermée avant la connexion : la récupération du même job et son téléchargement restent à vérifier en conditions réelles. Le défi Turnstile se masque désormais après validation et l'envoi démarre automatiquement ; le suivi d'assemblage affiche la progression mesurée du renderer.

## Parcours et droits

Un visiteur colle une URL prise en charge et valide Turnstile ; le défi disparaît et lance automatiquement le job du pipeline existant. Il retrouve ce job au rechargement ou dans un autre onglet du même navigateur. Son aperçu vertical complet contient un filigrane **dans les pixels**, avec la même piste audio que le master privé. Aucun bouton ne télécharge l’aperçu ; cela n’empêche pas la copie d’un média lisible.

Depuis le 30 septembre, **Mes vidéos est aussi accessible sans compte** : les essais en cours, terminés ou échoués du navigateur apparaissent dans la bibliothèque et dans « Récentes ». Recherche, filtres, lecture et ouverture directe de `/historique/:id` fonctionnent pour les essais anonymes. Le bouton « Télécharger sans filigrane » enregistre l’intention de récupération avant d’ouvrir la connexion. Une fois rattaché, le job apparaît seulement dans l’historique de son agence, sans copie ni nouveau traitement.

L’accès dépend du **même navigateur et du même profil**, avec le cookie d’essai conservé. Supprimer les cookies ou fermer toutes les fenêtres privées peut faire perdre cette preuve. Les médias non récupérés restent soumis à leur expiration existante, **24 heures après disponibilité par défaut**, affichée sur la carte. Les métadonnées expirées peuvent rester visibles tant que la session de trente jours est valide ; elles ne donnent aucun accès aux fichiers expirés.

« Télécharger sans filigrane » enregistre l’intention côté serveur puis ouvre Better Auth, Google ou e-mail/mot de passe avec vérification d’adresse. Le retour `/essai/recuperer` récupère le job et ouvre `/historique/:id`. Il n’existe ni nouvel import, ni nouvelle voix, ni nouveau rendu à la connexion ou au téléchargement. L’agence du compte est créée par le mécanisme existant, sans formulaire obligatoire. La vidéo neutre BienVu reste inchangée si la marque du compte est configurée plus tard.

Le nouveau quota gratuit est de **trois vidéos par période mensuelle**. La période part de la date/heure d’inscription en UTC ; chaque borne est calculée depuis cette date : 31 janvier → 28/29 février → 31 mars, à la même heure. Les crédits inutilisés ne se reportent pas. Une récupération prête débite une seule unité, laissant deux crédits à un nouveau compte. Une récupération pendant le rendu réserve une unité, puis la consomme au succès ou la libère à l’échec, sur l’allocation d’origine même si la période a changé.

Les allocations et périodes payantes/de développement préexistantes sont prioritaires et conservées. Un abonnement actif, suspendu ou impayé ne crée pas de repli gratuit. Un quota épuisé n’interdit pas d’enregistrer la propriété : seule la dérivée reste lisible. L’utilisateur affecte ensuite explicitement un crédit disponible depuis la page du résultat. Aucun débit supplémentaire au téléchargement. Aucun partage Explorer automatique ; publication volontaire uniquement avec les autorisations existantes et un master débloqué.

## Intégration et atomicité

La migration `0017_anonymous_trials.sql` étend le ledger existant : `allocations.kind=free`, réservation `unfunded` sans allocation, politique, session, aperçu et événements. Elle reconstruit les deux contraintes CHECK avec clés étrangères différées, en conservant les identifiants, montants, états et périodes. Une migration sur base peuplée est testée localement, notamment un ancien MP4 et sa réservation consommée. `0018_anonymous_budget_ceiling.sql` pose la coupure initiale du pilote à 25 €. `0020_budget_envelope_50.sql` la relève à 45 € et porte la capacité du registre global à 45 € pour le mois actif, en préservant les montants existants. Sauvegarder la base avant toute application distante ; ne pas supprimer les ledgers pour revenir en arrière.

`generation_runs.agency_id` demeure le **périmètre technique immuable** des imports, manifests, jobs et clés R2. Pour un anonyme il s’agit d’un espace interne neutre, sans compte utilisateur ni coordonnées inventées. `owner_agency_id` désigne séparément l’agence authentifiée autorisée ; les lignes anciennes reçoivent leur propriétaire d’origine. L’historique connecté et ses routes média vérifient ce propriétaire actuel, jamais une agence envoyée par le navigateur. L’historique anonyme vérifie la preuve HttpOnly, le périmètre technique de cette session et l’absence de propriétaire ; les lignes rattachées sont exclues et leurs droits revérifiés après lecture.

L’admission est un seul INSERT protégé par triggers : limites, budget, job, réservation et outbox sont indissociables. La récupération est un seul UPDATE conditionnel : propriété, candidat d’allocation, débit/réservation et événement sont réglés par triggers dans cette écriture. L’expiration entre en concurrence sur la même ligne. Les contraintes uniques et relectures rendent les doubles soumissions/callbacks idempotents. Les appels D1 séparés ne servent jamais de transaction interactive implicite. Le règlement final relit la réservation actuelle ; le manifeste de rendu peut rester neutre même si le propriétaire a changé.

L’outbox, les Workflows, checkpoints narration, Durable Object de rendu et réconciliation cron restent ceux du sprint 07. Une coupure avant l’envoi du Workflow ne perd pas le job. Les fichiers déjà publiés dans R2 permettent de réconcilier un état `publishing` sans rendu supplémentaire. Les tentatives réseau, le délai global et les reprises restent bornés ; aucune garantie d’exactement une fois n’est annoncée pour un fournisseur si sa réponse a été perdue.

## Sessions et accès privés

- Preuve aléatoire de 256 bits, seulement son SHA-256 en D1. Cookie `__Host-bienvu-trial` en HTTPS, `HttpOnly; Secure; SameSite=Lax; Path=/`, trente jours par défaut. En HTTP loopback local : `bienvu-trial`, sans Secure. Aucun droit dérivé de localStorage.
- Les POST vérifient l’origine ; Google garde `state`/PKCE et une destination interne fixe. Le job à récupérer est enregistré dans la session serveur. Un ID, un e-mail ou une agence fournis par le client ne suffisent pas. Un autre navigateur sans preuve reçoit une explication ; aucune attribution implicite par e-mail.
- Siteverify contrôle succès, hostname du `BETTER_AUTH_URL`, action `anonymous_trial`, date de défi (≤300 s), timeout et réutilisation. Un replay de la **même** commande retrouve le job avant de revalider le jeton ; un jeton ne crée pas un second job. L’UI renouvelle le défi expiré. Il n’existe pas de bypass serveur Turnstile en production.
- L’IP brute n’est ni persistée ni envoyée dans les événements. Le HMAC-SHA256 utilise un secret serveur distinct. `CF-Connecting-IP` n’est accepté qu’avec le contexte Cloudflare de confiance (`cf.colo`). En local, un contexte loopback explicite utilise une valeur de test fixe ; `X-Forwarded-For` n’accorde aucun droit.
- Les deux MP4 restent dans R2 privé. Les routes de streaming autorisent GET/HEAD/Range après contrôle de session ou propriétaire, état, expiration et crédit. Les paramètres `variant`, `download` ou une clé devinée ne sélectionnent jamais le master pour un anonyme. Réponses privées `Cache-Control: private, no-store`, sans URL R2 publique ou signée.

API ajoutée : `GET/POST /api/trial`, `GET /api/trial/history`, `GET /api/trial/:id`, `GET/HEAD /api/trial/:id/preview`, `POST /api/trial/:id/login`, `POST /api/trial/claim`, `GET/HEAD /api/generations/:id/preview`, `POST /api/generations/:id/unlock`. L’historique anonyme retourne au maximum les trente derniers essais non rattachés, avec seulement l’URL d’aperçu autorisée : aucun cookie valide donne une liste vide, aucune session nouvelle n’est créée par cette lecture, et la mise en pause des nouvelles admissions ne cache pas les essais existants. Les réponses restent privées et non mises en cache. La route existante `/api/generations/:id/video`, avec `?download=1` pour télécharger, contrôle désormais la propriété actuelle et la consommation du crédit.

Les représentations distinguent `status/stage`, `ownership`, `masterAccess` et `retention`. La publication reste dans `generation_shares`. Un événement unique `(job_id,event)` enregistre `requested`, `started`, `ready`, `failed`, `login`, `claimed`, `download` sans jeton, URL d’annonce, e-mail ou IP. `requested` signifie demande admise ; les refus préalables n’ajoutent pas une tentative facturable.

## Limites configurables

Une seule ligne `trial_policy`, valeurs initiales :

| Champ | Défaut | Portée |
|---|---:|---|
| `enabled`, `free_enabled` | 0 / 0 | Nouveaux essais / nouvelles générations gratuites |
| `free_monthly` | 3 | Allocation gratuite lors de la création de sa période |
| `session_days` | 30 | Durée de la preuve de session |
| `successes` | 1 | Succès cumulés par session, conservés après récupération |
| `session_concurrency` | 1 | Jobs en cours par session |
| `session_daily` | 3 | Démarrages par session sur 24 h glissantes |
| `ip_daily` | 5 | Démarrages par empreinte IP sur 24 h glissantes |
| `global_daily`, `global_monthly` | 5 / 30 | Démarrages anonymes par jour/mois UTC |
| `render_concurrency` | 1 | Un seul slot de rendu ; cette V1 refuse une autre valeur |
| `retention_hours` | 24 | Conservation d’un résultat non récupéré après succès/échec |
| `active_minutes` | 15 | Deadline séparée du job en cours |
| `budget_ceiling_cents` | 4500 après 0020 | Coupure du pilote, au plus le plafond global déjà configuré |
| `preview_provision_cents` | 30 | Surprovision conservatrice de la dérivée, figée par job |

Les garde-fous globaux déjà présents restent applicables : toutes générations confondues 5/jour et 30/mois, un job actif, imports 10/jour et 30/mois, budget D1 et plafonds privés voix/rendu. Modifier un plafond anonyme ne relève pas ces limites partagées. Une IP partagée n’est pas une personne et un cookie ne garantit pas « un essai par personne ». Les refus proposent la connexion, qui reste soumise à son quota et au budget.

Les connecteurs anonymes sont limités à **Century 21, Orpi et Espaces Atypiques**, avec chemin d’annonce reconnu. Aucun import générique arbitraire. Les protections existantes continuent ensuite : DNS public exclusivement, connexion IP épinglée du transport Node, redirections revalidées, contrôles IPv4/IPv6, taille/durée/compte des photos et destinations secondaires. Browser Run conserve les restrictions de source et de ressources du sprint 04. Un portail bloqué reste un échec, sans contournement.

## Conservation et purge

Le cron de `generation-worker.ts` réconcilie les jobs puis lance `cleanupAnonymousTrials`, par lots de dix. Un job actif est annulé/réconcilié avec le renderer avant d’être marqué échoué ; on ne supprime pas des fichiers tant qu’un rendu peut encore les écrire. Deadline par défaut quinze minutes, transport/rendu interne au plus dix minutes ; une panne durable du cron ou du service d’annulation exige intervention opérateur.

La transition conditionnelle `available → expiring` gagne avant toute suppression et interdit ensuite un claim. Un claim gagnant protège au contraire tous ses fichiers du TTL anonyme. La purge supprime le préfixe exact du job, ses manifests et aperçus, nettoie les charges utiles de narration, et supprime les photos/imports seulement lorsqu’aucun autre job ne les référence. `expiring` est reprenable après incident, puis devient `expired`. Les essais récupérés sont conservés au moins sept jours après la fin de la période de crédit en cours, pour permettre le déverrouillage au renouvellement ; les anciennes vidéos gardent leur expiration. L’expiration des vidéos de comptes coupe leur accès ; leur politique de purge physique générale reste un sujet d’exploitation du sprint 09, distinct de la purge anonyme implémentée ici.

Les empreintes IP et jetons Turnstile hachés sont effacés après 48 h. La preuve de session et l’intention sont effacées à son expiration, trente jours par défaut. Les tombstones de session/espace technique et les identifiants de jobs restent référencés par les compteurs/ledgers, sans preuve réutilisable, URL ni données de narration après purge. Cette V1 ne supprime pas ces écritures comptables et ne prétend pas effacer l’historique de coûts. Définir leur durée légale et la procédure de suppression de compte avant ouverture commerciale.

## Vidéo et coût

Le renderer Remotion produit une seule fois le master. FFmpeg crée ensuite `preview.mp4` avec un PNG BienVu incrusté durant toute la piste ; l’AAC est copié, pas resynthétisé. Deux rapports vérifiés (dimensions, codecs, durée, faststart, volume, SHA-256) sont requis avant publication. Le contrôleur vérifie les deux objets privés et le Workflow enregistre leurs métadonnées avant `ready`.

La dérivée exige un **FFmpeg complet avec le filtre overlay**. Le binaire allégé de Remotion sur ce Mac n’a pas ce filtre ; la recette locale utilise FFmpeg de l’image Linux déjà disponible, sans réseau. Le Dockerfile du renderer installe déjà FFmpeg complet. Les temps locaux sont dans le rapport ; ils ne donnent ni temps Containers ni facture Cloudflare.

La demande initiale du 29/09 fixait **30 €**, puis Alex a autorisé **20 € supplémentaires**, soit **50 € pour le pilote et une coupure à 45 €**. Avant la publication, le registre D1 contenait 29,85 € de provisions (frais fixes, domaine et anciens essais), auxquels s'ajoutent 0,05 € provisionnés pour un appel OpenAI local hors registre. Ce total prudent de 29,90 € laisse **15,10 € avant la coupure**, pas une facture rapprochée. L'admission anonyme inclut dès le départ les 0,50 € de l'import futur, puis son journal les réserve une seule fois. Les relevés historiques 30 €/25 € et 40 €/35 € restent datés dans la documentation ; la migration 0020 ne réinitialise aucune dépense.

Avant un essai hébergé, le registre global réserve 1,20 € par génération + 0,30 € pour l’aperçu ; l’import réserve séparément 0,50 €, soit **2 € au total** pour ce pilote URL. La sous-enveloppe renderer réserve 0,50 € + 0,30 € ; texte/voix conservent leurs sous-journaux. Les sous-enveloppes sont incluses dans les provisions globales, pas ajoutées une seconde fois. Les échecs conservent coûts et tentatives ; les crédits utilisateur libérés ne remboursent pas ces coûts. Ces provisions et les limites de volume ne garantissent pas une facture maximale. Ne pas relever les limites avant mesures et rapprochement des comptes.

## Configuration et commandes

Aucun nouveau binding d’infrastructure n’est nécessaire : web `DB`, `MEDIA`, `GENERATION_SERVICE` ; pipeline `DB`, `MEDIA`, `IMPORT_SERVICE`, Workflows et contrôleur vidéo existants. En production, le web exige un widget Turnstile pour `bienvu.online`, les deux secrets serveur et la nouvelle image du renderer.

Web, côté serveur :

```dotenv
ANONYMOUS_TRIALS_ENABLED=false
TURNSTILE_SITE_KEY=
# Secrets, ne jamais versionner une valeur réelle :
TURNSTILE_SECRET_KEY=
TRIAL_IP_HMAC_SECRET=
```

Créer/configurer un widget Turnstile **Managed**, autoriser le hostname exact du site de recette, renseigner sitekey/secret et générer un secret HMAC aléatoire d’au moins 32 caractères. Utiliser un widget/hostname séparé pour la recette ; aucun contournement de hostname/action n’est implémenté. Les secrets restent dans `.dev.vars` local ou les secrets Workers. `BETTER_AUTH_URL`, les redirections Google et la livraison e-mail restent celles du domaine de recette. La vérification d’adresse doit être active sur ce domaine.

Préparation sans service payant :

```sh
pnpm db:migrate                     # D1 locale uniquement ; inclut 0017 et 0018
pnpm check                          # frontières, tests sur fixtures, TypeScript
pnpm build:web                      # build OpenNext local
pnpm --filter @bienvu/renderer bundle
# Avec FFmpeg/FFprobe complets installés :
BIENVU_FFMPEG_PATH=/chemin/ffmpeg BIENVU_FFPROBE_PATH=/chemin/ffprobe \
  pnpm exec tsx scripts/probe-anonymous-video.ts
# Alternative locale : image renderer déjà construite (aucun pull automatique)
pnpm exec tsx scripts/probe-anonymous-video.ts --docker-ffmpeg bienvu-video:sprint-06-final
pnpm exec tsx scripts/probe-trial-media.ts
# Interface avec APIs/Turnstile simulés, média local issu de la commande précédente :
pnpm --filter @bienvu/web dev --port 8790 --webpack
node scripts/probe-trial-ui.mjs
```

Il n’existe pas de commande lint dans ce dépôt. `check:boundaries`, TypeScript, tests et `git diff --check` servent aux contrôles statiques disponibles ; aucun succès ESLint n’est revendiqué.

Pour ouvrir le parcours sur l'environnement sauvegardé, appliquer les migrations, livrer ensemble web/pipeline et nouvelle image renderer, configurer Turnstile et le HMAC, puis contrôler la capacité budgétaire et les sous-enveloppes. Dans cet environnement seulement, `trial_policy.enabled=1`, `free_enabled=1`, `ANONYMOUS_TRIALS_ENABLED=true` et les portes existantes `GENERATIONS_ENABLED`/`generation_control` permettent les nouveaux lancements. Sans clé, quota ou budget, le refus reste explicite.

Pour fermer les **nouveaux** essais : `trial_policy.enabled=0` ou `ANONYMOUS_TRIALS_ENABLED=false`. Pour fermer les nouvelles générations gratuites : `free_enabled=0`. Les consultations, claims et téléchargements des traitements déjà engagés restent autorisés selon leur propriété et leur crédit ; on ne supprime ni artefacts ni allocations pour arrêter les lancements. Garder le code/migration de lecture compatibles avec les jobs existants.

## Vérification distante restante

La base, le widget, les secrets, le nouveau renderer et le web sont publiés et les portes de lancement sont ouvertes sous la coupure à 45 € : [contrôles déjà effectués](preuves/accueil/DEPLOIEMENT-29-09.md). Il reste à observer **un seul** parcours complet avec un vrai défi Turnstile résolu par un humain, un lien autorisé, un import, texte/voix français réels, master + dérivée Containers, puis lecture des deux fichiers. Vérifier ensuite Google et e-mail de bout en bout (annulation, confirmation d’adresse, même navigateur, autre navigateur sans preuve), compte neuf à deux crédits après récupération, replay sans nouvel appel, accès étranger refusé et renouvellement/compte épuisé. Rapprocher temps CPU, RAM/disque, import, tokens, caractères TTS, stockage et erreurs avec la facture. Téléphone physique et écoute humaine de ce nouveau rendu restent séparés de la recette locale automatisée.

Sources runtime consultées : [D1 batch transactionnel](https://developers.cloudflare.com/d1/worker-api/d1-database/), [clés étrangères D1](https://developers.cloudflare.com/d1/sql-api/foreign-keys/), [validation Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [transactions Durable Objects](https://developers.cloudflare.com/durable-objects/api/legacy-kv-storage-api/). Versions locales : Next 16.3.6, Better Auth 1.7.6, Wrangler 4.142.0, Remotion 4.0.529.
