# Biome et formatage — 23 octobre 2026

Installation locale de **`@biomejs/biome@2.6.2`**, version exacte dans le manifest et le lockfile. Aucun changement de dépendance applicative. Le lockfile conserve sa sérialisation pnpm.

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

Travail local : aucun commit, push, déploiement, build de production, modification de secret ou migration distante pour cette demande. Les tests et sondes n’établissent pas une nouvelle recette hébergée. La CI exécutera automatiquement les nouveaux contrôles au prochain push.

Les commandes quotidiennes et la politique d’exceptions sont détaillées dans [Développement local](../../DEVELOPPEMENT.md#lint-et-formatage).
