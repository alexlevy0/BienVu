# Extension — description du bien

28 septembre 2026, Europe/Paris. Demande d’Alex : importer aussi la description de l’annonce. Extension livrée et vérifiée **en local** ; import Cloudflare toujours désactivé.

## Résultat

La description provient du bien identifié en JSON-LD/microdata ou du bloc dédié d’Espaces Atypiques, Orpi et Century 21 (adaptateurs 3.2). Paragraphes et provenance conservés ; scripts, styles, formulaires et navigation exclus. Les descriptions générales d’agence et de biens voisins ne sont pas reprises. Aucun HTML n’est exécuté.

Le contrat ajoute `description: {text, sourcePath, truncated} | null`, séparé des faits vérifiés. Limite : 20 000 caractères, coupure signalée avec accès à la source. Une absence est affichée comme indisponible et ne bloque pas l’import. Le texte apparaît sous la galerie, sans éditeur, et reste accessible dans « Vos derniers imports ».

La migration `0007_listing_description.sql` ajoute `listings.description_json` et maintient les protections de publication atomique. Le texte est aussi conservé dans le résultat privé. Les anciens imports restent compatibles avec `null` par défaut : réimporter leur lien pour obtenir la description. Aucun enrichissement silencieux ni réseau pendant la migration.

Fichiers principaux : contrat produit, `packages/importers/src/description.ts` et `listing.ts`, migration `0007`, `GenerationForm` et CSS, fixtures, tests d’extraction/stockage, sonde HTTP et `scripts/probe-import-descriptions.ts`.

## Fixtures et exécution locale

- 81 tests réussis (`docs/preuves/sprint-03/description-check.log`), frontières et TypeScript réussis : paragraphes/entités, contenu actif exclu, absence/limites, ancien contrat, provenance, voisinage et trois adaptateurs ; sauvegarde et relecture dans D1.
- HTTP workerd (`docs/preuves/sprint-03/description-http-report.json`) : vraies routes et D1/R2 locaux, comptes et sources synthétiques. Description exacte conservée après POST, GET et lecture SQL. Refus inter-agences toujours vérifié, aucun réseau vers les agences.
- Inspection UI (`docs/preuves/sprint-03/description-inspection-ui.json`) en 1 280×720 et 390×844 : paragraphes lisibles, rechargement puis réouverture réussis, aucun débordement horizontal observé. Zéro enfant HTML dans le paragraphe, `white-space: pre-wrap`.
- Migration (`docs/preuves/sprint-03/description-migrations.log`), réapplication (`docs/preuves/sprint-03/description-migrations-reapply.log`), build OpenNext (`docs/preuves/sprint-03/description-build.log`) et TypeScript final réussis. Une incompatibilité de types Node/ChildNode a été corrigée après le premier contrôle. Avertissement fast-png amont déjà connu, sans échec du build.
- Fixtures nettoyées (`docs/preuves/sprint-03/description-cleanup.json`). Pont de fixtures arrêté ; preview 8787 et transport HTTPS réel local 8791 disponibles.

Commandes : tests ciblés, `pnpm check`, `pnpm db:migrate` puis réapplication, `pnpm build:web`, `pnpm exec tsc -p tsconfig.tests.json`, `pnpm preview`, `pnpm probe:imports --keep`, inspection navigateur, `pnpm probe:imports --cleanup`, `pnpm dev:imports`.

## Pages réelles

`pnpm exec tsx scripts/probe-import-descriptions.ts --real` : trois pages publiques depuis le Mac, une tentative par page, sans relance ni photo téléchargée. Mesures (`docs/preuves/sprint-03/description-real-sources.json`). Ce contrôle d’extraction est distinct du stockage testé sur fixtures et des imports complets du [rapport initial](RAPPORT.md).

| Source | Description | Durée page + extraction | Troncature |
|---|---:|---:|---|
| Espaces Atypiques 14713 | 2 141 caractères | 345 ms | Non |
| Orpi, Paris 12 | 1 456 caractères | 867 ms | Non |
| Century 21 16965965448 | 1 251 caractères | 424 ms | Non |

HTML et textes complets restent dans `evidence/local/sprint-03/descriptions/`, hors Git. Le rapport versionné contient URL, version, provenance, taille, durée et empreinte. Cet échantillon ne prouve pas la prise en charge de toutes les annonces.

**0 € fournisseur supplémentaire**, zéro appel payant, IA, Browser Run, Containers ou R2 distant. Facture non consultée ; réseau et matériel local non mesurés. Aucun déploiement, commit ou push. [Recette Cloudflare restante](../../IMPORTS.md#cloudflare--configuration-et-exploitation) inchangée.
