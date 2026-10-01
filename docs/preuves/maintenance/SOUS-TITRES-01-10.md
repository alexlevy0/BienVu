# Réglage des sous-titres — 1 octobre 2026

## Résultat

Le bouton **Sous-titres**, sélectionné par défaut dans la saisie principale, permet de choisir les sous-titres de la voix off pour les nouvelles vidéos. Il utilise `aria-pressed` et reste accessible au clavier. La voix, les photos, les grands titres du bien, les faits affichés, la carte de contact et les droits au filigrane sont conservés.

Le choix est conservé dans `sessionStorage` dans le même onglet, lors d'un rechargement, d'une navigation ou du retour de connexion. Sans stockage disponible, le choix courant fonctionne et un nouvel écran reprend la valeur activée par défaut. Il est transmis pour l'import URL, l'annonce manuelle enregistrée, l'essai anonyme après Turnstile et l'ancien formulaire `/studio`. Il est verrouillé pendant l'envoi et la génération ; les vidéos déjà créées ne sont pas recalculées.

`subtitlesEnabled` est un booléen facultatif strict dans `GenerationInput` et `VideoManifest`. Son absence signifie « activé » au moment du rendu, sans injecter de champ dans les anciens contrats : leurs empreintes d'admission et de manifeste restent identiques. Chaque nouvelle préparation fige le choix du `generation_runs.input_json` ; une reprise réutilise le manifeste immuable. Le renderer des modèles `/1` et `/2` masque uniquement le bloc de sous-titres si le booléen vaut `false`. Aucun schéma D1, quota, allocation ou budget modifié.

Fichiers : contrats `product.ts`/`video.ts`, pipeline `video-manifest.ts`, composition `listing.tsx`, web `video-settings.ts`, `home-create.tsx`, `home-icons.tsx`, `anonymous-trial.tsx`, `generation-form.tsx`, `trials.ts` et `landing.css`. Recette : six fichiers de tests ciblés, `probe-workflow-ui.mjs` et `probe-subtitle-render.ts`. Les changements antérieurs de suppression de brouillons sont conservés.

## Vérifications locales

```sh
pnpm typecheck
pnpm check:boundaries
pnpm exec tsx --test --test-concurrency=1 tests/video.test.ts tests/video-storage.test.ts tests/generation-storage.test.ts tests/generation-workflow.test.ts tests/trial-api.test.ts tests/trial-workflow.test.ts
pnpm build:web
pnpm --filter @bienvu/renderer bundle
docker build --platform linux/amd64 -f apps/renderer/Dockerfile -t bienvu-renderer:subtitles-20261001 .
node scripts/probe-workflow-ui.mjs --subtitles-only
pnpm exec tsx scripts/probe-subtitle-render.ts
pnpm exec wrangler deploy --config apps/web/wrangler.staging.jsonc --keep-vars --strict --dry-run
pnpm exec wrangler deploy --config apps/pipeline/wrangler.staging.product-generation.jsonc --keep-vars --strict --dry-run --containers-rollout none
git diff --check
```

- Types complets, frontières sur **185 fichiers**, build Next/OpenNext, bundle Remotion, image **linux/amd64**, deux dry-runs et diff réussis. Le dry-run du pipeline omet le conteneur ; le déploiement réel le publie bien.
- **14 tests serveur réussis** : booléens stricts et anciens hashes, persistance D1, intention modifiée avec la même clé rejetée, préparation du manifeste, redémarrages des Workflows, essai anonyme et récupération après connexion. D1/R2/workerd sont locaux ; les fournisseurs et exports de ces tests sont simulés.
- **8 parcours navigateur sur fixtures**, à **1536×980 et 390×844** : URL activée par défaut, URL désactivée, import incomplet vers saisie manuelle désactivée, essai anonyme désactivé avec Turnstile simulé. Choix conservé au rechargement, un seul envoi avec le bon booléen, verrouillage pendant le job et absence de débordement. Captures ordinateur/mobile inspectées.
- **8 véritables PNG Remotion natifs**, deux modèles × activé/désactivé × introduction/contact. Annonce et signal audio synthétiques, photos de démonstration existantes. Comparaison des pixels : seul le rectangle des sous-titres change ; titres/faits/contact et reste du cadre identiques. Empreintes des manifestes distinctes. Captures avec et sans sous-titres inspectées.
- Les premières sondes Chromium ont expiré pendant les builds concurrents sur le Mac de 8 Gio (VM Docker de 4 Gio). Les reprises séparées, après la fin de la construction, réussissent. Ces échecs initiaux restent dans les logs ; ils ne sont pas comptés comme succès.

Ces images et fixtures ne constituent pas une nouvelle vidéo MP4 produite sur Cloudflare. Aucun appel OpenAI ou Google ajouté. Les traces, instantanés privés, médias et rapports JSON restent ignorés sous `evidence/local/subtitles` et `evidence/local/workflow-ui`.

## Publication et preuves Cloudflare réelles

Déploiement du pipeline avec `--keep-vars --strict --containers-rollout immediate`, puis du web avec `--keep-vars --strict` :

- **bienvu-generation-development** : version **698f5039-5fc0-4acd-b2f1-4b2aa829b3bc**, **100 %**.
- **bienvu-web-probe-staging**, domaine **bienvu.online** : version **7659f76f-3564-4bf1-9828-54dcb78d7fec**, **100 %**.
- Image poussée au registre Cloudflare, digest **354290e83528a0598ec9e665c95ba38bacb4b02c2971c0c97c9805650686edce** ; application **a0302315-6859-4e3c-9254-891604aee659**, instance `standard-2`, maximum **1**, ressources inchangées.
- Accueil **200** ; ses **14 CSS/JS** réels sont en **200** et identiques par SHA-256 au build local ; le bundle publié contient le bouton et le paramètre de génération.
- **3 manifestes existants** relus dans D1 et vérifiés avec le nouveau contrat : leurs empreintes stockées restent valides.
- Bindings, variables, secrets, date/flags de compatibilité et modèle d'usage conservés pour les deux Workers.
- **5 jobs, 0 actif, 2 comptes, 0 abonnement, 10 imports** conservés. Registre de septembre inchangé : base **30,80 €**, engagement **44,80 €**, coupure **45 €**, pause désactivée. Aucune nouvelle provision, ouverture d'octobre ou remise à zéro.

Le rollout **fc6ca98a-54d1-4a39-b488-6e2f15a7b241** est **`completed` à 08:32 UTC**, version d'image **5**, **100 % d'instances cibles et zéro ancienne version**. L'image effective de l'application correspond au digest publié. La lecture initiale à 08:29 UTC indiquait encore `progressing` ; cette attente a été suivie jusqu'à son terme, conformément à [la distinction entre publication et fin du rollout documentée par Cloudflare](https://developers.cloudflare.com/containers/configuration/rollouts/). La liste distante ne contient **aucune instance physique** ; le GET opérateur, sans lancer de rendu, confirme le contrôleur inactif et le conteneur **stopped**. Une lecture a reçu 404 lorsque l'identifiant de rollout actif a disparu après sa fin ; la lecture par son identifiant fixe confirme le succès.

**Vérification distante restante :** sur une prochaine génération autorisée, vérifier que le manifeste a le choix voulu et que son MP4 possède ou omet les sous-titres tout en gardant la voix, les textes du bien, la carte de contact et le filigrane applicable. La fin du rollout est vérifiée, mais un nouveau rendu MP4 dans cette image n'est pas revendiqué. Aucun nouveau rendu facturé n'a été lancé pour cette recette ; aucun crédit supplémentaire consommé. La facture réelle reste distincte des provisions suivies. Serveur de recette local arrêté après vérification.

## Harmonisation des paramètres actifs — 1 octobre

À la demande d'Alex après publication, **Vertical 9:16** et **Voix française** reprennent le fond, la bordure et la couleur de texte de **Sous-titres** sélectionné. L'espacement mobile est harmonisé. Une même règle CSS applique le style actif ; ces deux paramètres fixes restent actifs quand les sous-titres sont désactivés. Modification limitée à `apps/web/app/landing.css`.

Build web et dry-run réussis. Inspection du navigateur local à **1536×980 et 390×844**, sans génération : styles calculés identiques pour les trois pastilles activées (fond `#f2f6ee`, bordure `#9db593`, texte `#394639`, même rayon/padding/taille/gap), clic Sous-titres fonctionnel, autres pastilles conservées, aucun débordement. Les deux captures ont été inspectées. Aucun nouveau test unitaire ajouté pour ce changement de style ; sondes et captures ignorées sous `evidence/local/active-format-tags`.

Publication web **1f62d29b-4cc1-4009-96b9-2a081c042287** à **100 %** avec `--keep-vars --strict`. Accueil et **14 assets réels en 200**, hashes identiques au build, règle active partagée présente dans le CSS distant ; configuration conservée. La première sonde de présence attendait un ordre exact des sélecteurs, alors que la minification les trie : contrôle corrigé pour vérifier leur appartenance et les couleurs, puis réussi. Pipeline/image vidéo conservés ; aucun appel fournisseur, nouveau crédit ou rendu ajouté. Serveur local arrêté.
