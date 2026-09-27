# Sprint 00 — procédure reproductible

Toutes les commandes partent de `/Users/alexlevy0/Dev/BienVu`. **Le staging web/import, D1 et R2 ont été créés et testés le 27/09/2026** ; consulter le rapport pour leurs résultats. Les commandes de création sont destinées à une première installation : ne pas recréer les ressources existantes. Le renderer Cloudflare reste non déployé et exige Workers Paid. Ne jamais coller un secret dans Git, un argument CLI, un rapport ou une capture.

**Reprise avec Workers Free :** Alex a activé R2 après le premier refus `10042`. L'accès a ensuite réussi. `prepare-staging.mjs` prévoit le plan gratuit par défaut et retire la limite CPU personnalisée du Worker navigateur : la limite Free de 10 ms s'applique alors. Utiliser `BIENVU_WORKERS_PLAN=paid` uniquement si ce forfait est déjà activé. Le fichier du renderer reste préparé avec les appels désactivés et **ne doit pas être déployé sur Free**. Un rendu local ne valide pas Containers.

## 1. Tests locaux sans facturation API

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm fixtures
pnpm test
pnpm --filter @bienvu/web typegen
pnpm --filter @bienvu/pipeline typegen
pnpm typecheck
pnpm build:web
pnpm --filter @bienvu/web exec wrangler d1 migrations apply DB --local
pnpm --filter @bienvu/web preview
# second terminal
pnpm probe:web
```

Pour Linux, utiliser les deux commandes `docker run` du README. Construire avec `--platform linux/amd64` comme la cible Containers. Conserver logs de build, versions Chromium/FFmpeg de l'image et rapports JSON. Le tag local peut évoluer pendant les corrections ; consigner aussi le digest de l'image effectivement rendue.

Pour contrôler séparément le protocole HTTP du service Node natif, après réussite du bundle (FFmpeg/FFprobe Remotion détectés automatiquement sur macOS) :

```sh
pnpm --filter @bienvu/renderer bundle
pnpm render:local local-short short
pnpm render:local local-target target
pnpm serve:renderer
# second terminal : cette sonde tente un véritable rendu local court
node scripts/probe-render-server.mjs
```

Ce contrôle ne remplace ni Linux ni Containers. Les 17 tests `pnpm test` sont distincts : le test HTTP du journal d'échec utilise un serveur simulé et ne lance aucun rendu.

## 2. Browser Run local et sources réelles

```sh
pnpm --filter @bienvu/pipeline exec wrangler dev --port 8788 --local --var ALLOW_REAL_BROWSER:true
# second terminal : une seule tentative de chaque cas
pnpm probe:browser agency
pnpm probe:browser figaro
```

Le rapport porte `browserLocation: local` et **ne valide pas une exécution chez Cloudflare**. La sonde ne reçoit qu'un nom de cas, jamais une URL libre. Les hôtes des ressources autorisées sont dans `apps/pipeline/src/browser-cases.ts`. Un domaine inconnu est bloqué, pas ajouté automatiquement pour contourner une protection. Aucun CAPTCHA n'est résolu.

Le cas agence est une annonce publique repérée le 27/09/2026. L'adaptateur contrôle la référence de la page, la galerie et la concordance du prix. Les trois photos doivent être réellement téléchargées, décodées et dédupliquées ; examiner également leur contenu. Une galerie de logos, plans ou pièces d'une autre annonce ne valide pas l'import.

Une réservation R2 conditionnelle empêche une seconde tentative du même cas, même si la première a échoué. Les cas `agency` et `figaro` ont été consommés. Trois contre-vérifications fixes ont été ajoutées : `agency-gallery-check` après diagnostic du carrousel, `agency-static-check` pour limiter les ressources auxiliaires, puis `agency-keepalive-check` après un arrêt fournisseur `BrowserIdle`. Cinq sessions maximum dans cette révision, avec réservations et échecs conservés. Le délai d’inactivité vaut maintenant 60 s, comme la limite de session active, et la collecte s’arrête à trois photos. Le diagnostic HTTP `/photo-diagnostic`, limité à un seul appel et une URL fixe, n'ouvre pas de navigateur. Pour refaire un test local après correction, supprimer **seulement** son objet de réservation locale, puis consigner la tentative additionnelle. Ne pas effacer les réservations distantes pour obtenir des retries illimités.

## 3. Préparer le staging

Le plafond de 30 € couvre les frais fixes, APIs et taxes. Dépense déclarée initiale : 0 €. Enveloppe proposée : 8 € pour Workers Paid et conversion/taxes, 0,50 € par tentative de rendu. Arrêt applicatif à 25 € engagés ; marge de 5 €. Avant activation, contrôler les allocations déjà consommées au niveau du compte et la facture réelle.

```sh
pnpm exec wrangler login
pnpm exec wrangler whoami
# Après contrôle du compte et autorisation des ressources/frais :
pnpm exec wrangler d1 create bienvu-s00-staging
pnpm exec wrangler r2 bucket create bienvu-s00-private
```

Ne pas activer de domaine public ni de `r2.dev` sur ce bucket. La règle de rétention de 30 jours du préfixe `probes/` a été créée. Les commandes `wrangler r2 bucket dev-url get bienvu-s00-private`, `domain list` et `lifecycle list` ont vérifié respectivement l'accès public désactivé, l'absence de domaine public et la rétention active. Exporter les preuves utiles avant la purge.

Renseigner l'identifiant D1 réel dans la variable **non secrète** `BIENVU_D1_ID`, puis :

```sh
node scripts/prepare-staging.mjs
pnpm --filter @bienvu/web exec wrangler d1 migrations apply DB --config wrangler.staging.jsonc --remote
pnpm --filter @bienvu/web exec wrangler secret put PROBE_TOKEN --config wrangler.staging.jsonc
pnpm --filter @bienvu/pipeline exec wrangler secret put PROBE_TOKEN --config wrangler.staging.jsonc
pnpm --filter @bienvu/pipeline exec wrangler secret put PROBE_TOKEN --config wrangler.staging.render.jsonc
pnpm --filter @bienvu/pipeline exec wrangler secret put RENDER_TOKEN --config wrangler.staging.render.jsonc
```

Les secrets sont saisis dans les invites Wrangler, pas dans les arguments. Le contrôleur transmet uniquement `RENDER_TOKEN` au service Node. Il ne transmet au navigateur ni clé R2, ni secret agence, ni secret opérateur.

## 4. Prouver les trois chemins distants

Web :

```sh
pnpm build:web
pnpm --filter @bienvu/web exec wrangler deploy --config wrangler.staging.jsonc
# Renseigner WEB_PROBE_URL avec l'URL réellement retournée et PROBE_TOKEN dans le shell.
pnpm probe:web
```

Browser Run :

```sh
pnpm --filter @bienvu/pipeline exec wrangler deploy --config wrangler.staging.jsonc --var ALLOW_REAL_BROWSER:true
# Renseigner BROWSER_PROBE_URL avec l'URL réellement retournée.
node scripts/probe-browser-status.mjs
pnpm probe:browser agency
pnpm probe:browser figaro
node scripts/probe-browser-status.mjs
```

Conserver chaque échec et la source exacte. Le Figaro 108944355 a refusé l'accès durant cette recette ; rien ne permet de le dire retiré. L'historique retourné par `/status` permet de comparer `sessionId`, durée, `NormalClosure`, sessions actives et temps de navigateur consommé. Après cette recette, les cas sont réservés et les appels désactivés : ne pas relancer mécaniquement les commandes ci-dessus.

Containers :

```sh
pnpm --filter @bienvu/pipeline exec wrangler deploy --config wrangler.staging.render.jsonc --var ALLOW_PAID_PROBES:true
# Renseigner RENDER_PROBE_URL avec l'URL réellement retournée.
node scripts/operator.mjs budget 800
pnpm probe:renderer short remote-short-01
pnpm probe:renderer target remote-target-02
pnpm probe:renderer target remote-target-03
# Au maximum 5 tentatives totales, échecs inclus ; aucune boucle de retry.
node scripts/operator.mjs state
```

Remplacer `800` par l'engagement fixe + autres dépenses réellement retenu si différent. L'initialisation est unique : pas de remise à zéro au restart. Le changement de mois bloque les nouvelles réservations jusqu'à réconciliation explicite ; ces sondes ne constituent pas encore le registre comptable du SaaS.

Après 40 s sans requête de rendu, relire `/state` : le conteneur doit être arrêté. Le téléchargement d'un MP4 terminé doit passer par R2 et ne pas le réveiller. Comparer la taille et le SHA-256 local au rapport ; vérifier visuellement début/milieu/fin, mouvement, filigrane et lecture complète, puis écouter l'audio. Le signal de test ne valide pas le TTS français.

Vérifier aussi une lecture `GET /jobs/:id` pendant le démarrage : le statut doit rester `accepted`, sans faux `RENDER_INTERRUPTED`. Deux lectures simultanées lors de la fin doivent obtenir le même artefact sans écraser `ready` par un échec. La sonde de rendu conserve désormais un rapport daté même après erreur ou timeout ; un timeout de transport ne prouve ni l'arrêt du conteneur ni l'absence de frais.

Mesures à ajouter : démarrage à froid, temps de rendu, upload, sommeil effectif, durée active totale, CPU facturé (pas seulement le CPU Node), type d'instance, stockage, frais fixes, taxes/change, erreurs et facture. Le budget après allocations partagées est distinct du coût marginal brut. Ne pas déduire une facture réelle d'un calcul local.

## 5. Arrêt et nettoyage

```sh
node scripts/operator.mjs pause
pnpm --filter @bienvu/pipeline exec wrangler deploy --config wrangler.staging.jsonc --var ALLOW_REAL_BROWSER:false
pnpm --filter @bienvu/pipeline exec wrangler deploy --config wrangler.staging.render.jsonc --var ALLOW_PAID_PROBES:false
```

La pause interdit les **nouveaux** rendus ; un job accepté continue jusqu'au résultat vérifié ou à son délai maximal. Vérifier `/state` après l'arrêt. Exporter les preuves et réconcilier la facturation avant de supprimer des ressources ; une suppression de Worker ne résilie pas Workers Paid. Pour supprimer les ressources de ce sprint, utiliser leurs noms exacts et ne toucher à aucun autre projet du compte.

## Limites conscientes

Pas d'auth client, pas de réservation de quota d'abonnement, pas d'orchestration Workflow, pas de TTS réel dans ce lot. Reprise après destruction du conteneur : échec explicite, réservation de dépense conservée, pas de rerendu automatique. Le contrôleur n'est pas encore le pipeline produit. L'import générique couvre les structures JSON-LD reconnues ; le DOM ciblé ne démontre pas la couverture d'autres agences. La sécurité d'une entrée URL client générale doit encore être éprouvée au sprint 03.
