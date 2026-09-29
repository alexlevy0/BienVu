# Accueil studio — 29 septembre 2026

## Résultat

Remplacement de l’accueil marketing par l’interface studio de la nouvelle maquette d’Alex : navigation latérale, titre serif, import vert sauge et galerie de quatre ambiances. Sur mobile, la navigation se replie dans un panneau accessible au clavier et les cartes passent sur deux colonnes.

Le profil et les deux créations récentes proviennent du compte connecté. Sans session, la page présente une invitation à se connecter. Aucun compte ou historique fictif n’est injecté dans l’application déployée. Les démonstrations et les noms d’agences de la galerie sont explicitement fictifs.

Depuis le 29/09, un visiteur peut aussi remplir l’annonce manuelle et choisir ses photos avant de se connecter : [recette complémentaire](SAISIE-MANUELLE-INVITE.md).

Le formulaire URL appelle le parcours de génération existant pour les comptes autorisés, avec idempotence conservée après une réponse interrompue et verrou contre le double clic. Un visiteur conserve son lien dans l’onglet puis rejoint l’inscription. La saisie manuelle reste dépliable sous l’import. Quotas, essai avec filigrane et accès de développement restent contrôlés par le serveur.

## Fichiers

- `apps/web/components/landing-page.tsx`, `home-create.tsx`, `home-icons.tsx`, `apps/web/app/landing.css` et `page.tsx` : interface et métadonnées.
- `apps/web/lib/generation-client.ts` : admission partagée avec `generation-form.tsx`. Réponse validée par le contrat, clé de rejeu conservée si l’appel échoue.
- `generation-progress.tsx` : ancres pour les créations récentes ; réponse d’historique ignorée après changement d’agence.
- Quatre WebP et quatre MP4 publics dans `apps/web/public/{images,videos}/studio-home/`. [Origine, prompts et préparation des assets](../../design/ACCUEIL-STUDIO-ASSETS.md).
- `scripts/prepare-home-demos.mjs` : encodage local des démonstrations silencieuses.
- `scripts/probe-home-studio.mjs` : recette Chromium locale sur fixtures, ou lecture seule d’un accueil distant.

## Recette locale

Les fixtures sont limitées à localhost/127.0.0.1. Le compte, l’historique et les réponses de génération sont simulés dans le navigateur, sans créer de compte ou de job en D1. Le mode distant de la sonde ne soumet aucune génération.

- Chromium en 1536, 390 et 320 px : quatre visuels chargés, aucun débordement horizontal ; captures inspectées.
- Quatre vrais fichiers MP4 lus : 28/32/27/30 s, 600 × 800, pas de piste audio. Ce sont des animations de photos synthétiques, pas une nouvelle validation du moteur vidéo produit.
- Aide, filtres de galerie, lecteur, navigation mobile, fermeture Échap ; formulaire manuel avec description et upload présent.
- URL vide refusée sans requête ; perte de réponse puis reprise avec la même clé ; double soumission simultanée n’ajoute pas de troisième requête.
- Visiteur : navigation effective vers `/connexion?mode=signup` et lien conservé dans `sessionStorage`, aucun appel de génération.

Commandes exécutées :

```sh
node scripts/prepare-home-demos.mjs
node scripts/probe-home-studio.mjs --fixtures
pnpm build:web
pnpm check
pnpm exec wrangler deploy --config apps/web/wrangler.staging.jsonc --dry-run
pnpm preview
BIENVU_HOME_URL=http://localhost:8787 node scripts/probe-home-studio.mjs --fixtures
pnpm probe:foundations
```

Résultats : **158 tests réussis**, types complets et frontières sur **113 fichiers** ; build OpenNext et dry-run réussis. Sonde fondations sur neuf pages workerd réussie, API anonymes refusées. La recette navigateur passe aussi sur le build de production servi localement par workerd. Les traces et captures restent hors Git dans `evidence/local/home-studio/` et `evidence/remote/home-studio/`.

## Déploiement et limites

Le Worker existant `bienvu-web-probe-staging` dessert `bienvu.online`. Configuration distante relue avant publication : variables, D1, R2, services privés et domaine concordants ; cinq secrets existants conservés. Aucun changement de schéma, de compte ou de facturation.

Publication effectuée avec `pnpm exec wrangler deploy --config apps/web/wrangler.staging.jsonc`, version **`e221cb59-d7b8-4072-9ea3-8c5954e3279a`**, à 100 %. La comparaison après déploiement confirme les mêmes bindings, variables, noms de secrets, routes, paramètres d’observabilité et fermeture des URL workers.dev/preview. Aucun secret n’a été modifié.

Vérification réelle avec `BIENVU_HOME_URL=https://bienvu.online node scripts/probe-home-studio.mjs` : navigation, modales, menu mobile et quatre lecteurs sur le vrai site, **sans fixtures ni écriture**. Accueil/connexion/générer/historique/agence répondent 200, API compte/historique 401 sans session. Les quatre WebP et quatre MP4 distants ont les mêmes empreintes SHA-256 que les assets locaux. Inspection des captures en 1536/390/320 px ; elles attendent le décodage des images et la fin de l’animation du menu. Les serveurs de développement et preview ouverts pour cette refonte ont été arrêtés.

L’authentification et la génération réelle sont les preuves des sprints précédents. Cette recette d’interface ne consomme aucun crédit de développement et ne relance pas d’import, de narration ou de rendu client. Aucun téléphone physique ou Safari n’est déclaré testé. La galerie est une sélection fixe de démonstrations, pas un partage communautaire.

Budget : quatre images créées par l’outil intégré, encodage local et trafic de recette web limité. Zéro appel OpenAI/Google du projet et aucun nouvel achat ; les provisions du projet ne sont pas réinitialisées. La facture finale reste à rapprocher.

Références de déploiement consultées : [OpenNext sur Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/opennext/), [rôles Wrangler](https://developers.cloudflare.com/workers/authorization/workers/). L’adaptateur existant et la version verrouillée de Wrangler sont conservés.
