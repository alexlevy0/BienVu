# Import partiel et Figaro — 1 octobre 2026

## Résultat utilisable et limite centrale

Alex souhaite récupérer au moins les informations d'une annonce quand ses photos sont inaccessibles, puis compléter le formulaire manuel. L'import connecté conserve maintenant les faits et les photos déjà reçues lorsqu'un téléchargement d'image est refusé ou trop lent. Un CDN public non enregistré est ignoré sans requête, au lieu de faire perdre les faits ; les protections contre les URL privées, redirections interdites, résolutions privées et contradictions restent fatales. Le formulaire existant reprend le brouillon et ses champs, puis ouvre la première section nécessaire, notamment Photos.

L'adaptateur Figaro `figaro-dom/4.1` recoupe le titre de fiche, ses métadonnées, les prix adjacents et le produit JSON-LD lié à sa référence canonique. Prix de vente, surface, pièces, transaction et ville gardent leur provenance. Taxes, mensualités de financement et annonces voisines sont exclues. Le loyer exige une période mensuelle et des charges explicites. La description conserve les paragraphes ; la troncature est indiquée, ou remplacée par la description complète cohérente du même JSON-LD. Les médias restent bornés et liés à la fiche.

**L'import automatique du lien Figaro d'Alex n'est pas validé :** `https://immobilier.lefigaro.fr/annonces/annonce-108944355.html` est encore refusé avant extraction par le portail. Le test Cloudflare retourne `SOURCE_BLOCKED`, motif privé `access_denied`, sans contenu d'annonce. L'adaptateur ne transforme pas ce refus en réussite. Un message distinct explique maintenant le refus du site ou un délai dépassé et propose la saisie manuelle. Aucun proxy, cookie de portail, compte tiers, tentative de résolution de challenge ni retry navigateur après refus n'est ajouté.

Cette maintenance améliore le **brouillon connecté** (`POST /api/imports`, `allowPartial`). La génération anonyme conserve son chemin strict et ses règles de crédit/Turnstile : elle ne reçoit pas encore un formulaire partiel automatiquement quand les photos d'une URL échouent. Aucun ancien brouillon ou MP4 n'est recalculé, aucun quota ou budget augmenté.

## Code et recette locale

Fichiers principaux : `packages/importers/src/portals/figaro.ts`, `listing.ts`, `import-listing.ts`, `network.ts`, `packages/contracts/src/import-sources.ts`, message d'erreur dans `apps/web/components/home-create.tsx`, fixture Figaro, `tests/import-partial.test.ts` et sonde UI.

- **64 tests ciblés réussis, zéro échec**, dont huit nouveaux scénarios : faits sans photos, contradictions, JSON-LD sans `businessFunction` mais transaction vérifiée dans le titre, produit/photo étrangers, description complète, loyer/charges, refus et délais d'images, fenêtre photo indépendante, CDN ignoré sans requête, URL privées/annulation/panne de stockage fatales. D1/R2 locaux vérifient la persistance, le rejeu idempotent et l'isolation entre agences sans créer de job.
- **Interface sur fixtures**, en 1536 et 390 px : import sans photos, ouverture automatique de Photos, retour aux Détails, prix **280 000 €**, surface **268 m²**, **12 pièces**, ville et description en deux paragraphes dans leurs champs. Captures inspectées, aucun débordement horizontal. Le HTML de `fixtures/imports/portals/figaro-partial.html` est **reconstruit**, avec une ville et une référence fictives ; ce n'est pas une capture du portail ni une preuve de sa disponibilité.
- TypeScript complet, frontières **188 fichiers**, build Next/OpenNext final, trois dry-runs Wrangler et vérification du diff réussis. Un premier scénario de CDN utilisait trois URL identiques, dédupliquées en une seule : correction de la fixture vers trois URL distinctes puis réexécution réussie des 64 tests. Le premier sélecteur UI visait une métadonnée plutôt que le textarea : sonde corrigée et recette ordinateur/mobile réexécutée.
- Le téléchargement photo dispose de **50 s maximum**, limité au reste des **60 s globales moins 2 s** pour sauvegarder. Les limites existantes restent **20 requêtes, 24 candidats, 12 photos, 50 Mio** ; il faut trois photos distinctes et décodées pour générer. Une ressource échouée garde sa provision d'octets. Aucun nouveau fournisseur ni dépendance ajouté.

Commandes réellement exécutées :

```sh
pnpm exec tsx --test --test-concurrency=2 tests/import*.test.ts tests/creation-workflow.test.ts
pnpm typecheck
pnpm check:boundaries
pnpm build:web
node --import tsx scripts/probe-import-partial-ui.mjs
# Configurations opérateur ignorées : images existantes épinglées.
pnpm exec wrangler deploy --config apps/pipeline/wrangler.staging.partial-import.jsonc --keep-vars --strict --dry-run --containers-rollout none
pnpm exec wrangler deploy --config apps/pipeline/wrangler.staging.partial-generation.jsonc --keep-vars --strict --dry-run --containers-rollout none
pnpm exec wrangler deploy --config apps/web/wrangler.staging.jsonc --keep-vars --strict --dry-run
# Puis les mêmes publications sans --dry-run, séquentiellement.
node evidence/local/import-partiel-01-10/probe-real.mjs
node evidence/local/import-partiel-01-10/verify-remote.mjs
git diff --check
```

## Test réel, publication et budget

Une requête native préalable depuis le Mac reçoit **HTTP 403**, 5 520 octets de page de refus. Le résultat indexé lu séparément n'est pas assimilé à une réponse actuelle de notre importeur. Deux tentatives d'ouverture du navigateur Codex ont expiré sans DOM exploitable ; aucune connexion au portail ou interaction avec un challenge n'a eu lieu.

Un **seul import réel après publication**, à **10:42 UTC**, utilise une identité de recette vérifiée isolée sur le domaine et les vrais Worker/Container/D1/R2. Réponse de BienVu **HTTP 200** contenant un import **failed**, erreur `SOURCE_BLOCKED/access_denied` : ce statut API ne signifie pas que le portail a accepté la lecture. Diagnostics : **4 223 ms**, **1 ressource**, **0 octet exploitable**, **0 photo stockée**, **aucun fallback Browser Run**. Aucun appel OpenAI/Google, e-mail ou génération vidéo n'est déclenché par cette recette.

Versions publiées, chacune **100 %**, configuration/bindings/variables/secrets comparés avant/après et identiques :

| Worker | Version |
|---|---|
| `bienvu-import-staging` | `9a451648-c4af-46c1-80b8-e6f421415d34` |
| `bienvu-generation-development` | `eb2781e5-3ea8-46dc-bd32-bc4536135a9f` |
| `bienvu-web-probe-staging`, domaine `bienvu.online` | `75183891-30c8-4a46-85a3-227c40c141b1` |

Les images Container existantes sont conservées : import **`b58fd9b…5ff8`**, renderer **`60e2c46…f78ead`**. Aucun rebuild ou rollout d'image, aucune migration D1. Accueil/Explorer **200**, **14 CSS/JS distants** identiques au build par SHA-256, API imports/générations/admin sans session **401**. Sept jobs existants, aucun actif, Browser Run sans bail, générations toujours activées.

Le processus du conteneur d'import est ensuite **stopped**, arrêté automatiquement après **30,218 s**. Son estimation brute de calcul est **0,000235096 USD**, distincte des 0,50 € provisionnés pour l'import ; montant réellement facturé inconnu. Aucun arrêt forcé des autres dossiers en préparation.

Budget d'octobre avant/après : **12,50 € → 13,00 € provisionnés**, **90 € de coupure**, **100 € d'enveloppe**. La tentative d'import conserve **0,50 €**, même après échec et nettoyage. Base vidéo/service **11,00 €** inchangée. Septembre **44,80 €/45 €** conservé. Il s'agit de provisions prudentes, pas d'une facture rapprochée ; trafic de publication, D1 et courte exécution du conteneur restent à rapprocher avec Cloudflare.

La sonde a d'abord demandé une suppression avant la fin du bail et du délai de sécurité de cinq minutes ; le produit l'a refusée comme prévu. Nettoyage opérateur limité à **ce dossier synthétique failed**, sans objet ni job : fermeture de son bail, purge par la route privée, puis suppression de son identité/agence et de ses credentials de recette. Coûts et compteurs de tentatives conservés. Aucun compte client ou contenu préexistant modifié.

Les réponses privées, logs, captures, snapshots et configurations restent ignorés dans `evidence/local/import-partiel-01-10` ; le rapport Markdown et la fixture synthétique sont destinés à Git. Aucun commit/push effectué pour cette maintenance.

**Vérification restante :** obtenir une réponse de fiche Figaro autorisée depuis le transport produit, puis comparer chaque champ visible au brouillon et contrôler les images réellement décodées/persistées. Tant que le portail refuse cette lecture, l'extraction de ce lien demeure non validée ; copier les informations et ajouter les photos autorisées via la saisie manuelle reste le parcours disponible. Les nouveaux cas d'extraction et le formulaire sont prouvés par fixtures, pas par un import Figaro réel réussi.

Retour arrière du code Worker : import `f2cdd5a4-b8f1-4c1a-bad4-3fbb87448e3b`, génération `c4ff189c-6177-4eee-8802-1ecd5fd2e6a6`, web `8ee1383f-8cb5-4ffc-a5a6-abe3c794237b`, dans leurs images actuelles. Les données et provisions ne sont pas remises à zéro.
