# Mesure produit et enregistrements de sessions

BienVu utilise le projet PostHog EU **299212**, dans l’organisation BienVu. Le SDK `posthog-js` est fixé dans le lockfile. La clé publique d’ingestion `phc_` est une configuration du Worker web, pas une clé personnelle d’administration.

## Configuration

Renseigner `POSTHOG_ENABLED=true`, `POSTHOG_PROJECT_TOKEN` et `POSTHOG_HOST=https://eu.i.posthog.com` dans les variables du Worker web. Le modèle local est `.env.posthog.example`. `/api/analytics/config` retourne uniquement la configuration publique ; la même compilation peut servir plusieurs environnements. Sans configuration valide, aucune initialisation de PostHog n’a lieu. `POSTHOG_ENABLED=false` désactive la collecte au prochain chargement.

Le projet a les enregistrements activés, l’anonymisation IP activée, une conservation des replays de 30 jours et le fuseau `Europe/Paris`. Le SDK conserve les textes, les champs ordinaires, les styles et les médias de l’interface. Les mots de passe, jetons de connexion, champs cachés, corps/en-têtes des requêtes et messages de console restent exclus, même si un réglage distant autorise leur capture.

## Choix du visiteur

Avant accord : aucune initialisation du SDK, aucun événement et aucun enregistrement transmis. Le choix est conservé au maximum 180 jours. Le visiteur peut tout accepter, tout refuser ou accepter les statistiques sans replay. Les boutons de refus et d’acceptation ont le même poids visuel. Le choix peut être modifié depuis « Choix des cookies » dans les pieds de page ou sur la page Confidentialité ; aucun bouton flottant permanent n’est affiché. Le retrait arrête la collecte et supprime les identifiants locaux, sans supprimer rétroactivement les données du projet.

Le choix courant utilise `bienvu:privacy:v2`. L’accord de la version précédente, qui concernait des sessions largement masquées, n’active pas la nouvelle capture : le visiteur doit se prononcer à nouveau. Le bandeau, les préférences et la page Confidentialité précisent que les textes, champs ordinaires et médias affichés peuvent être enregistrés.

Un identifiant anonyme relie les pages d’un parcours après accord. Après connexion, seul l’identifiant technique du compte est utilisé (`user:<id>`) pour son profil analytique, sans nom, e-mail ni coordonnées ajoutés à ce profil. Les changements de compte réinitialisent l’identité. Un superadmin peut être suivi sur les pages du produit et lire ses sessions ; ses événements portent `is_internal=true`. La route `/admin`, les liens privés de validation, callbacks OAuth, liens de réinitialisation et pages inconnues sont exclus.

## Événements

| Parcours | Événements principaux |
| --- | --- |
| Navigation | `$pageview`, `$autocapture` des clics avec leurs libellés, `control_interacted` avec zone et type de commande, `navigation_clicked` |
| Compte | `signup_requested/completed/failed`, `login_requested/redirected/completed/failed`, `logout_completed` |
| Import | `import_requested/completed/failed`, `description_requested/completed/failed`, `manual_form_opened`, `manual_listing_saved/failed` |
| Génération | `generation_requested/accepted/request_failed`, `generation_ready/failed` |
| Éditeur | `editor_opened`, `editor_project_selected`, `editor_action`, `editor_export_requested/accepted/failed` |
| Agence | `agency_saved`, `agency_save_failed` |
| Réseaux | `social_connection_requested/completed/removed`, `publication_requested/created/failed/completed` |
| Paiement | `checkout_requested/opened/failed` |
| Partenaires | `partner_application_started/requested/received/failed` |
| Médias et performances | `video_played`, `video_download_clicked`, `web_vital` |

`publication_created` confirme l’enregistrement dans BienVu, pas une diffusion réussie chez Meta. `publication_completed` signale la transition d’une destination vers publiée quand le calendrier est ouvert. De même, les événements de fin de génération reflètent les transitions observées par le navigateur ; fermer BienVu n’arrête pas le traitement, mais sa fin n’émet pas d’événement client. Les historiques existants ne sont pas comptés comme de nouvelles générations/publications. `checkout_opened` confirme la création du lien de paiement, pas un achat. Aucune transaction réelle n’est lancée pour tester la mesure.

Les propriétés des événements métier sont limitées à des catégories connues, nombres bornés, booléens et codes d’erreur. Le domaine de la source d’import est conservé sous `source_domain`, sans URL complète de l’annonce. Les événements automatiques conservent aussi les libellés des clics, l’appareil, le domaine référent et les paramètres de campagne. Aucun corps de requête n’est journalisé. Les appels de suivi ne modifient ni le résultat ni la politique de reprise d’une action. Les opérations idempotentes et les résultats observés sont dédoublonnés ; la frappe et les glissements continus sont limités à un événement par seconde et catégorie.

## Lisibilité et protection des replays

Les textes, champs du bien, styles, images et éléments vidéo restent visibles. Les valeurs ordinaires de formulaires peuvent donc apparaître, y compris une adresse ou des coordonnées saisies, après accord du visiteur. La capture des canvas est activée à 4 images par seconde pour rendre les cartes et aperçus lisibles. Les iframes externes restent soumises aux restrictions du navigateur ; la présence d’un lecteur dans un replay ne garantit pas l’accès ultérieur au fichier vidéo privé.

Les photos déjà affichées sont mises en cache pour le replay sous forme de petites copies JPEG : dimension maximale 720 px, qualité 0,65, 48 images au plus, 250 000 caractères au plus par copie. Elles permettent de relire des images locales ou authentifiées sans transmettre de cookie ni créer d’URL publique. Aucun téléchargement supplémentaire n’est lancé. Une image provenant d’un domaine sans autorisation CORS garde sa référence d’origine. Ce cache est vidé à l’arrêt ou au retrait de l’enregistrement.

Les mots de passe et codes à usage unique sont masqués. Les entrées `hidden`/`file` et les éléments explicitement marqués `data-analytics-secret` sont bloqués ; `data-analytics-sensitive` permet un masquage ciblé. Les attributs d’authentification et paramètres de jetons sont supprimés des liens avant transport. Les snapshots passent par ce filtrage avant compression. Les URLs des événements analytiques restent normalisées pour ne pas exposer les liens privés des biens ; les références nécessaires à l’affichage du replay conservent leurs chemins ordinaires.

Une navigation App Router suspend la collecte avant l’affichage de la destination ; elle reprend uniquement sur une route autorisée avec l’accord du visiteur. Les statistiques agrégées existantes dans D1 restent indépendantes.

Les anciennes sessions conservent leur masquage : les pixels et textes absents lors de l’enregistrement ne peuvent pas être récupérés après coup.

## Dashboard principal

[BienVu — Pilotage produit et croissance](https://eu.posthog.com/project/299212/dashboard/1008966) est épinglé et défini comme dashboard principal et vue d’accueil du projet. Il rassemble 21 graphiques natifs, une comparaison pour les quatre indicateurs de tête et des sections explicatives. La période par défaut est de 30 jours. Les filtres `is_test != true` et `is_internal != true` s’appliquent à chaque graphique : ces sessions restent consultables dans PostHog, mais ne gonflent pas l’audience client.

| Section | Graphiques |
| --- | --- |
| Indicateurs | Pages consultées ; vidéos prêtes ; diffusions réussies ; checkouts ouverts |
| Acquisition | Audience au fil des jours ; appareils ; pages consultées ; domaines référents |
| Création | Visite → demande → admission → vidéo prête ; formats demandés |
| Fiabilité | Imports réussis/échoués par source ; délai médian et 95e percentile ; erreurs par code |
| Éditeur | Ouverture → personnalisation → export admis ; réglages utilisés |
| Diffusion | Demande → enregistrement → publication observée ; immédiat/programmé |
| Commercial | Connexion → demande d’inscription acceptée ; offres → checkout ; candidatures partenaires ; rétention hebdomadaire |

La collecte commence le 8 octobre 2026. Des graphiques encore vides ne constituent pas une panne : aucun historique ni événement commercial fictif n’a été ajouté pour les remplir. Les entonnoirs mesurent des personnes dans l’ordre indiqué : 24 h pour création/éditeur, 14 jours pour publication et 7 jours pour inscription/checkout/partenaires. Une diffusion sur deux destinations compte deux réussites. Un checkout ouvert n’est pas un paiement encaissé et n’alimente aucun chiffre d’affaires.

Ces indicateurs sont opérationnels : les fins de traitement dépendent de leur observation dans le navigateur. Ils ne remplacent pas un bilan issu des traitements serveur ou de la comptabilité. Les définitions sont documentées dans les descriptions des insights ; elles ne sont pas des métriques approuvées dans le catalogue de données.

## Vérification

`pnpm exec tsx --test tests/product-analytics.test.ts` vérifie configuration, choix, routes, lisibilité des attributs et filtrage des secrets. `node scripts/probe-product-analytics.mjs` utilise le vrai SDK et les vrais composants dans un navigateur, avec des APIs et une ingestion **entièrement locales** : aucun client, paiement, génération ni événement de production. La recette vérifie accord/refus, absence de SDK avant accord, textes et champs lisibles, copie des photos privées, protection des mots de passe et jetons, navigation privée, identité, marquage des visites internes et retrait. Les preuves sont écrites dans `evidence/local/posthog/`, ignoré par Git.

La livraison du 9 octobre 2026 est documentée dans `evidence/remote/posthog-2026-10-09/`. Les 21 graphiques ont été exécutés avec les filtres du dashboard ; leur disposition stockée ne contient aucun chevauchement.

Documentation : [SDK Next.js](https://posthog.com/docs/libraries/next-js), [contrôles des replays](https://posthog.com/docs/session-replay/privacy), [capture des canvas](https://posthog.com/docs/session-replay/canvas-recording), [collecte et consentement](https://posthog.com/docs/privacy/data-collection).

## Error Tracking

[Erreurs BienVu](https://eu.posthog.com/project/299212/error_tracking) reçoit les événements `$exception` du navigateur et du Worker web. Le SDK navigateur capture les erreurs non interceptées et les promesses rejetées après accord pour la mesure d’audience, sans exiger l’accord pour les replays. Les frontières React `error.tsx` et `global-error.tsx` proposent de réessayer et signalent l’interruption. Si le layout principal échoue, le fallback peut réutiliser un consentement encore valide. Aucun accord n’est créé automatiquement. Les exclusions de routes analytiques restent applicables.

Le serveur utilise `posthog-node/edge`, compatible avec workerd. Le hook Next `onRequestError`, les exceptions inattendues converties en HTTP 500 dans `respond()`, les exceptions du Worker externe et celles de son cron sont capturés. Les refus attendus (validation, droits, quotas) ne deviennent pas des exceptions de suivi. Les Workers d’import, de génération et de rendu conservent leurs diagnostics et le suivi Qualité IA existants ; cette installation ne leur ajoute pas de nouveau SDK d’erreurs.

Une portée `AsyncLocalStorage` propre à chaque requête est partagée entre le Worker externe et le bundle Next. Les exceptions répétées sont dédoublonnées par objet, avec cinq signalements maximum par requête. Chaque envoi utilise un client distinct, `ctx.waitUntil`, un délai réseau de 2,5 secondes et aucune relance réseau automatique. Un échec de télémétrie ne change pas la réponse ni la reprise métier. Les erreurs serveur opérationnelles sont envoyées sans cookies analytiques ; le lien avec une session n’est ajouté que si les en-têtes de corrélation consentie sont présents et valides. Ces en-têtes n’accordent aucun accès.

Le filtrage conserve type, message, fichier, ligne, colonne, identifiant de chunk, version et identifiant de diagnostic. Il retire les paramètres/signatures d’URL, clés, mots de passe, e-mails, téléphones, variables des frames et corps/en-têtes de requête. Les messages techniques peuvent encore contenir des noms métier : ne pas y interpoler des données de client. Les `console.error` ne sont pas collectés automatiquement, pour éviter de transformer les diagnostics attendus en bugs. `POSTHOG_ERROR_TRACKING_ENABLED=false` désactive uniquement le suivi d’erreurs au prochain chargement ; `POSTHOG_ENABLED=false` arrête aussi les statistiques.

### Builds et sourcemaps privées

Ajouter `POSTHOG_PERSONAL_API_KEY` dans `.env.posthog` ou dans l’environnement de compilation. Cette clé personnelle doit autoriser « Error tracking : Write » et « Organization : Read » sur le projet 299212. Elle n’est ni une variable `NEXT_PUBLIC_` ni un binding du Worker. Ne jamais versionner `.env.posthog`, les bundles de sonde ou les journaux d’envoi.

1. `pnpm build:web` compile OpenNext avec Webpack et le plugin officiel PostHog, associe la version Git (suffixée pour une arborescence modifiée), envoie les maps à PostHog EU et retire les `.map` Next après l’envoi. Sans clé, la CI reste fonctionnelle mais ne produit pas de sourcemaps de production.
2. Pour une publication Cloudflare avec symboles serveur : `pnpm prepare:web --config apps/web/wrangler.<environment>.jsonc`. La commande compile le Worker final en dry-run, injecte ses identifiants et envoie sa map avec le CLI. Elle prépare une configuration privée `.open-next/posthog-worker/wrangler.jsonc` en conservant les bindings et ajoute `BIENVU_RELEASE` et `BIENVU_WORKER_CHUNK_ID`. Ce dernier rattache les frames du Worker à son bundle final, plutôt qu’aux identifiants des modules Next intermédiaires.
3. Publier exactement ce bundle : `pnpm --filter @bienvu/web exec wrangler deploy --config .open-next/posthog-worker/wrangler.jsonc --keep-vars --strict`. `no_bundle=true` évite de modifier les positions des frames après l’envoi. Un simple déploiement de `worker.ts` sans cette préparation ne bénéficie pas de la map du Worker final.

Les maps navigateur renvoient aux sources TypeScript/TSX. La map finale du Worker résout ses modules originaux ; certains modules internes Next/OpenNext peuvent rester des fichiers JavaScript compilés. Les maps et les sources restent privées dans PostHog, hors des assets publics. La clé personnelle n’est jamais requise au runtime.

### Recette des erreurs

`pnpm exec tsx --test tests/error-tracking.test.ts tests/product-analytics.test.ts` couvre le filtrage, l’isolation de requêtes, les choix du visiteur, la déduplication, les erreurs attendues et un véritable Worker local avec le SDK edge. `node scripts/probe-product-analytics.mjs` teste aussi les erreurs JavaScript, les promesses rejetées, les frontières React et leur récupération dans Chrome, avec ingestion interceptée localement. Après préparation, `node scripts/probe-error-tracking-worker.mjs` exécute le bundle final et sa vraie route Next contre D1/R2 jetables ; `--send-test` vérifie en plus l’ingestion réelle. Les exceptions synthétiques portent `is_test=true`, sont résolues après recette et ne doivent pas servir d’indicateur d’incidents clients.

## Qualité des générations IA

Le suivi serveur et les évaluations Hog sont décrits dans [QUALITE-IA.md](QUALITE-IA.md). Le [dashboard Qualité IA BienVu](https://eu.posthog.com/project/299212/dashboard/1010344) contient 16 graphiques : contrôles, couverture, sources, voix, versions de narration, délais, coûts partiels, réutilisation, imports, publications et verdicts humains. Les requêtes SQL utilisent les filtres de dates du dashboard.

L'onglet **Qualité IA** du superadmin permet la relecture et l'export de références figées. Onze évaluations natives sont actives, exclusivement de type Hog, sans clé fournisseur et sans requête supplémentaire à OpenAI ou aux fournisseurs de média. Le suivi lit les journaux existants ; il ne régénère aucun contenu. Les coûts réels incomplets et les critères non applicables restent explicitement distincts de zéro et des échecs. [Définitions et identifiants](posthog-quality-dashboard.json).
