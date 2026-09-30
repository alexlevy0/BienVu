# Brouillons supprimables et mouvement de la saisie — 30 septembre 2026

## Résultat et fichiers

Le menu `…` des brouillons de « Récentes » ouvre « Supprimer ». Il fonctionne au clavier (focus, Échap), à la souris et dans la navigation mobile. Un verrou synchrone bloque le double clic. Une erreur conserve l'entrée et permet de réessayer ; une réponse 404 retire aussi une ancienne entrée déjà absente du serveur. Une vidéo terminée ne reçoit pas ce menu.

- `apps/web/components/studio-sidebar.tsx`, `home-icons.tsx`, `generation-store.tsx`, `apps/web/app/landing.css` : menu, état de suppression, retrait immédiat et filtrage des réponses de liste arrivées tardivement.
- `apps/web/components/home-create.tsx`, `manual-listing-form.tsx`, `apps/web/lib/listing-draft.ts` : fermeture du brouillon supprimé lorsqu'il est ouvert, retrait du paramètre `draft` et suppression ciblée dans IndexedDB/sessionStorage/localStorage. Une sauvegarde locale déjà lancée ne peut pas le rétablir dans cet onglet ; un autre brouillon reste conservé. Les anciens repères de session sans identifiant sont aussi traités. Les nouveaux repères partagent le même horodatage et le même identifiant que leur copie IndexedDB.
- `apps/web/app/api/imports/[id]/draft/route.ts`, `apps/web/lib/creation-drafts.ts`, `packages/db/src/creation-drafts.ts` : DELETE avec session d'agence et contrôle d'origine, exclusion des imports finalisés et des annonces liées à un job, effacement des photos connues et contrôle après les uploads R2.
- `packages/db/migrations/0022_draft_extraction_usage.sql` : journal agrégé des tentatives d'analyse, indépendant de la cascade de suppression du brouillon. Reprise des compteurs existants, mêmes plafonds et mêmes provisions ; aucun remboursement automatique ni nouvel appel fournisseur.

L'ancienne ouverture cumulait une fermeture animée du titre et une disparition différée de la galerie. Ces deux changements déplaçaient successivement le formulaire. `landing-page.tsx` change maintenant le layout en une seule mise à jour. `home-create.tsx` mesure la position du compositeur avant/après cette mise à jour, avant le premier affichage, puis anime sa translation pendant 460 ms. L'ouverture descend directement ; la préférence « réduire les animations » désactive cette translation. Le champ reste monté.

## Garanties de suppression

Le brouillon est immédiatement masqué et ses accès privés sont refusés dès sa transition en `deleting`. L'effacement physique complet n'est pas promis immédiatement si un upload est interrompu : le parent et le journal restent au moins cinq minutes, puis le cron existant (toutes les dix minutes, lots bornés) les reprend. Un upload finissant après la suppression efface sa propre clé et ne retourne pas de photo utilisable. Si R2 est indisponible, la suppression logique reste acquise et le cron réessaie. Une répétition du DELETE ne prolonge pas la fenêtre de nettoyage.

## Vérifications locales

- `pnpm exec tsx --test --test-concurrency=1 tests/draft-delete.test.ts tests/creation-workflow.test.ts tests/import-storage.test.ts` : **13 tests réussis**, D1/R2/workerd locaux. Migration avec reprise d'un appel antérieur, isolation entre agences, refus de modification/lecture des photos, upload tardif, interruption après un put, panne R2, réconciliation après cinq minutes, protection d'un import finalisé, zéro job/crédit/réservation créé. Après purge : appels privés supprimés, compteur agrégé de cinq tentatives et provision conservés, sixième analyse refusée.
- `pnpm typecheck` : tous les packages/apps et les types des tests réussis, après correction d'un code d'observabilité hors contrat (`SERVICE_UNAVAILABLE` remplacé par `INTERNAL_ERROR`).
- `pnpm check:boundaries` : réussi, **163 fichiers**.
- `pnpm build:web` puis `pnpm exec wrangler deploy --dry-run --config apps/web/wrangler.staging.jsonc` : réussis. L'avertissement déjà présent dans le bundle de `fast-png` concernant `??` reste inchangé.
- `node scripts/probe-workflow-ui.mjs --draft-actions-only` : **8 parcours réussis** à **1536/390 px** sur le build de production local. Quatre vérifient connecté/invité : mouvement descendant échantillonné image par image, 25 à 28 positions intermédiaires, préférence de mouvement réduit et aucun débordement horizontal. Quatre vérifient la suppression : erreur réseau simulée puis reprise, double clic unique, fermeture du brouillon ouvert, autre brouillon ouvert préservé, repère de session ancien, navigation/rechargement sans retour du brouillon supprimé et vidéo existante préservée. Captures ordinateur/mobile inspectées ; aucun POST vidéo.
- `node scripts/probe-workflow-ui.mjs --price-only` : **4 parcours de régression réussis**, connecté/invité à 1536/390 px, prix 200 000 €, description reformulée, demande d'origine conservée, surface/pièces absentes et aucun POST vidéo.
- `node --check scripts/probe-workflow-ui.mjs` et `git diff --check` : réussis.

Le premier passage navigateur a trouvé une réouverture intempestive après suppression : les repères de session avaient un horodatage différent de la copie IndexedDB. Correction du repère et traitement des anciens formats, puis reprise de la recette avec ce cas explicite. Aucun contrat serveur assoupli.

Les réponses d'authentification et d'API de la sonde navigateur sont des fixtures. Les tests locaux n'envoient aucun e-mail, ne contactent aucun portail/OpenAI/Google TTS et ne rendent aucune vidéo. Ils ne constituent pas une suppression authentifiée dans le navigateur de production.

## Publication et contrôles distants

Export complet de la D1 distante effectué avant modification, fichier protégé en mode 600 et ignoré par Git. Une première lecture de la liste des migrations a retourné une erreur Cloudflare interne 7500 ; une reprise après la fin de l'export a confirmé que seule `0022_draft_extraction_usage.sql` restait à appliquer. Migration appliquée avec succès par Wrangler 4.142.0, puis vérification réelle de **4 tentatives existantes reprises**, nombre égal aux appels privés encore présents. Budgets identiques avant/après migration.

Worker web **`762edf2f-336a-470a-9755-e4329492df0d`** publié sur `bienvu.online` avec `--keep-vars --strict`. Contrôle réel à **14:34 UTC** : déploiement à 100 %, accueil et historique HTTP 200, nouveau DELETE sans session HTTP 401 avec `private, no-store`, variables et noms des secrets préservés. Le Worker de génération et les Containers n'ont pas été redéployés ; le cron de purge existant sait déjà traiter les imports marqués `deleting`.

La suppression authentifiée et ses courses d'upload sont vérifiées sur les bindings D1/R2 locaux ; la suppression depuis une session utilisateur de production n'a pas été rejouée. Aucun brouillon réel d'utilisateur supprimé par la recette. Pas d'appel externe payant, d'e-mail, d'import de portail, de synthèse vocale ou de rendu vidéo : registre D1 inchangé à **43,25 €**, avec la provision historique hors D1 de **0,05 €**, total prudent **43,30 €/50 €** et marge **1,70 € avant coupure à 45 €**. Facture non rapprochée.

Le serveur de recette sur 8790 est arrêté après vérification ; le serveur utilisateur sur 8787 est conservé. Les changements antérieurs du dépôt restent présents ; aucun commit/push n'est exécuté dans cette maintenance.

Références d'implémentation : [mesure avant affichage avec React](https://react.dev/reference/react/useLayoutEffect), [animation d'un élément](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate), [effacement R2 depuis un Worker](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).

Preuves brutes protégées et ignorées : `evidence/local/draft-actions/`. Captures et rapports de fixtures : `evidence/local/workflow-ui/`. L'export D1 contient des données privées et reste hors Git.
