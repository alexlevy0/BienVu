# Biome et formatage — 23 octobre 2026

Installation de **`@biomejs/biome@2.6.2`**, version exacte dans le manifest et le lockfile. Le formatage initial ne change aucune dépendance applicative ; le correctif Zod détecté avant publication est décrit ci-dessous. Le lockfile conserve sa sérialisation pnpm.

## Changements

- Configuration racine `biome.jsonc` pour applications, packages, scripts, tests, fixtures de code, configurations, styles et documentation pris en charge.
- Formatage global : deux espaces, largeur préférée de 120 caractères, apostrophes JavaScript/TypeScript ; `.editorconfig` pour les éditeurs.
- Commandes `lint`, `lint:fix`, `format` et `format:check` ; lint et formatage intégrés à `check`, déjà exécuté en CI. Les avertissements de lint sont bloquants.
- Imports nettoyés, types précisés, callbacks React stabilisés et dépendances sûres complétées. Types explicites des boutons, rôles et attributs ARIA, alternatives textuelles et fontes de repli corrigés.
- Les boutons natifs d’envoi restent des boutons `submit`, et le libellé « Position » garde son apparence sans employer un `<label>` dépourvu de contrôle.
- Les imports React des points d’entrée Node/Remotion restent des imports de runtime grâce à l’override JSX classique. Leur suppression avait été détectée par le test de référence de mise en page puis corrigée.

Le socle reste `recommended`, avec les choix de projet et les exceptions ponctuelles expliqués dans la configuration et près du code. Les effets intentionnellement liés à une identité, une révision ou une transition conservent ces déclenchements pour protéger les saisies, les transferts et les ressources audio/vidéo. Ces exceptions préservent une dette de revue ciblée ; elles ne constituent pas un audit complet des hooks ou de l’accessibilité.

Les déclarations générées Wrangler/Next, `pnpm-lock.yaml`, les exclusions Git et les HTML tiers synthétiques de `fixtures/imports/` ne sont pas reformatés. Ces HTML comprennent volontairement des défauts utilisés dans les tests d’import.

## Vérifications exécutées

| Contrôle                          | Résultat                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm lint`                       | Aucune erreur ni aucun avertissement                                               |
| `pnpm lint:fix` après nettoyage   | Aucune modification supplémentaire ; imports React conservés                       |
| `pnpm format:check`               | Formatage conforme et idempotent                                                   |
| `pnpm check:boundaries`           | Frontières Workers/Node et contrats conservées                                     |
| `pnpm typecheck`                  | Tous les workspaces et les tests compilent                                         |
| `pnpm check`, puis reprise ciblée | 898/905 au premier passage, puis 7/7 en reprise isolée ; 905 cas distincts validés |
| Références des scènes vidéo       | 36 empreintes HTML identiques ; fixture de référence inchangée                     |
| Installation figée hors ligne     | `pnpm install --frozen-lockfile --offline --ignore-scripts` réussie                |
| Audit des dépendances             | Aucune vulnérabilité connue à la date du contrôle                                  |
| Offres en navigateur local        | Chrome, largeurs 320/390/900/1536 ; sans débordement ni erreur JavaScript          |

Le premier `pnpm check` s’est arrêté avant TypeScript après les tests : un défaut d’import React corrigé et six erreurs de connexions locales `EADDRNOTAVAIL` lors des scénarios Runway/vitrine. La table ne présente pas cette première commande comme une exécution intégrale réussie. Les sept tests concernés ont tous été rejoués avec `--test-concurrency=1` ; TypeScript a été exécuté séparément avec succès.

La sonde navigateur utilise les composants de production avec des données et écritures simulées. Offres mensuelles/annuelles, estimation, achats et portail simulés, double clic, reprises, stockage indisponible et droits sont contrôlés. Les captures desktop et mobile ont été relues. Elle ne crée aucun paiement réel.

Commandes, rapports et captures bruts conservés localement dans `evidence/local/biome/` et `evidence/local/topups-direct-checkout-2026-10-10/`, ignorés par Git. Les contrôles de test n’appellent aucun fournisseur IA payant.

## Livraison

Alex a ensuite autorisé commit, push et déploiement. Commits poussés sur `main` :
- **`87014cf1cacd23f1ef22361b9074ca91da46b35a`** : Biome, lint et formatage global.
- **`6d834b8d984b0664d72fbea90f97b5e2c796d8c6`** : sonde SEO compatible avec les attributs accessibles du footer ; la classe n’est plus supposée être le premier attribut.
- **`648cbc865920f4bb02ad502da6b1506990d930d0`** : correctif Zod ; release publiée **`648cbc865920`**.

GitHub a signalé [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), actualisé le 23 octobre, alors que l’audit du registre npm ne le remontait pas encore. Zod **4.6.6** remplace **4.6.5** dans les trois dépendances directes. Un override borné remplace aussi **4.5.4** chez Remotion, sans bloquer les versions supérieures au correctif. Le graphe installé et le lockfile ne contiennent plus que **4.6.6**. Installation figée hors ligne, **45 tests ciblés** distincts, types complets, lint, formatage, frontières et audit réussis ; GitHub ne rapporte plus d’alerte Dependabot ouverte après ce push.

Build Next/OpenNext de production et préparation du Worker réussis ; sourcemaps privées navigateur/serveur envoyées à PostHog et déploiement du bundle préparé avec `no_bundle`. Publication des quatre Workers avec `--keep-vars --strict`, et `--containers-rollout none` pour génération/import :

| Worker                                     | Version active à 100 %                 | Bindings / secrets |
| ------------------------------------------ | -------------------------------------- | ------------------ |
| Web `bienvu-web-probe-staging`             | `ef7b877f-809e-49b9-a535-830f8dcbe2bd` | 64 / 23            |
| Génération `bienvu-generation-development` | `7a9d5b06-7a2a-422c-b3b1-48a40b8d77a8` | 36 / 10            |
| Import `bienvu-import-staging`             | `9af821e6-a125-41d2-a5c2-e49a4376864c` | 9 / 2              |
| Messagerie `bienvu-mail-staging`           | `8077c3d1-764e-48c9-b741-a8a428e5178a` | 5 / 0              |

Le SHA-256 de chacun des quatre modules distants est identique au module local préparé. Pour le web : **`ca5ebe5a6412bf7cd43de8f58d57992919ad1b076c97bd7ed14796a1b598096f`**. Les bindings, secrets, domaines, crons, Workflow, namespaces Durable Objects et paramètres de runtime sont conservés ; seuls les identifiants web de release/sourcemap changent. Les images et configurations des conteneurs restent celles déjà actives, renderer **v37** et import **v8** : cette publication ne reconstruit pas les images hébergées. Le correctif Zod est publié dans les Workers ; le contrôle du nouveau graphe local ne constitue pas un nouvel audit des paquets des anciennes images. Aucune migration distante ni remplacement de secret ; aucun job actif avant/après, et aucune erreur de clé étrangère au contrôle.

Worker local : fondations, **51 pages SEO** et sonde D1/R2 réussis. Après activation sur **https://bienvu.online** : huit pages **200**, trois API privées et les deux services internes **401**, redirection Beta **302**, configuration analytique active, HTML et réponse RSC identifiant la nouvelle release. Deux scripts publics comparés octet pour octet, leurs maps publiques **404**. Les **51 pages SEO distantes** passent aussi.

Chrome en production : offres mensuelles/annuelles vérifiées à **1536 et 390 px**, crédits **50 / 120 / 250 / 650**, prix et remise annuelle inchangés, aucun débordement ni erreur JavaScript ; captures desktop/mobile relues. Les achats sont bloqués dans cette recette. **Stripe reste en mode test.** Aucun appel fournisseur de génération payant ni email de test envoyé. Publication inscrite dans l’historique du superadmin après lecture de l’activation effective.

[CI sécurité du code publié](https://github.com/alexlevy0/BienVu/actions/runs/40019065282) **réussie**, audit, construction des deux images Linux et vrai rendu synthétique de six secondes inclus. [CI fonctionnelle du code publié](https://github.com/alexlevy0/BienVu/actions/runs/40019065258) en cours au relevé ; résultat à actualiser avant clôture. Preuves brutes et configurations privées sous `evidence/local/biome-deploy/`, ignorées par Git, notamment `verification.json` et `browser-verification.json`.

Retour arrière sans migration vers les versions sauvegardées : web **`0d263f6d-8046-4e92-9f3b-c32ad5a9c49d`**, génération **`4081a1f5-eacb-469a-ae3a-d7afe7a37e52`**, import et mail dans leurs snapshots privés `*-before.json`. Un retour arrière réintroduirait les anciennes dépendances et supprimerait les correctifs publiés.

Les commandes quotidiennes et la politique d’exceptions sont détaillées dans [Développement local](../../DEVELOPPEMENT.md#lint-et-formatage).
