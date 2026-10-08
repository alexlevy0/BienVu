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
