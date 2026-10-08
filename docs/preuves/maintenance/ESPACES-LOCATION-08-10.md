# Espaces Atypiques — location lyonnaise, 8 octobre 2026

## Résultat vérifié

L’[annonce de location fournie par Alex](https://www.espaces-atypiques.com/locations/69004-lyon-loft-avec-vue-sur-la-saone-dans-une-ancienne-biscuiterie-15088/) est importée une fois dans le produit publié, par `POST https://bienvu.online/api/imports`, dans une agence technique isolée.

Réponse HTTP **200**, statut métier **`ready`**, référence **`15088`**, appartement à **Lyon**, **3 pièces**, loyer **1 900 €/mois charges comprises**, description conservée (**1 381 caractères**) et **11 photos distinctes**. L’appel produit dure **11 292 ms** ; les diagnostics indiquent **12 ressources**, **2 171 416 octets source**, **2 158 882 octets stockés**, aucun rejet, aucun doublon et `browserUsed: false`.

La surface reste absente avec l’avertissement existant : les surfaces Carrez, au sol et pondérées ne sont pas assimilées automatiquement. Elle peut être confirmée dans le formulaire ; cette absence n’empêche pas le statut `ready`. Le loyer ne comprend pas les suppléments facultatifs mentionnés dans la description, et le dépôt de garantie n’est pas assimilé au prix.

## Cause et correctif

Le registre reconnaissait seulement les routes `/ventes/`. L’extracteur attendait ensuite `article.vente`, `status: envente` et `prix_vente`, avec une transaction de vente forcée.

Le registre reconnaît maintenant `/ventes/` et `/locations/`. L’adaptateur **`espaces-atypiques/3.4`** vérifie la cohérence entre la route, la classe de l’article et le statut embarqué. En location, `dataLayer.loyer`, les montants de l’en-tête et le champ principal `Loyer CC`/`HC` sont recoupés. Les centimes sont conservés. Une période annuelle ou hebdomadaire, ou l’absence de traitement explicite des charges, fait omettre le loyer plutôt que d’en inventer un.

Une contradiction de transaction, prix, charges ou référence reste bloquante, même en import partiel. Une redirection vente/location pour la même référence est refusée. La transaction confirmée est aussi transmise à la lecture JSON-LD et microdata : une offre de vente ne peut pas remplacer une location. Les règles de référence renumérotée et de galerie propres à l’annonce restent en place.

Aucun nouvel hôte, joker ou CDN n’est autorisé. Les limites de réseau, TLS/DNS, SSRF, ressources, durée et photos sont conservées ; aucune migration ni nouvelle clé.

## Recette

**32 tests ciblés réussis**, couvrant les locations CC/HC, les centimes, les frais séparés, les montants inconnus, les contradictions, les redirections, les anciennes ventes, le transport avec trois JPEG de fixture et les protections réseau. Fixture HTML synthétique, sans reprise de la description ou des images de l’annonce réelle dans Git.

```sh
pnpm exec tsx --test --test-concurrency=1 tests/import-espaces-atypiques.test.ts tests/import-extraction.test.ts tests/import-description.test.ts tests/import.test.ts tests/import-network.test.ts
pnpm typecheck
pnpm check:boundaries
pnpm build:web
```

Typage complet du monorepo et des tests, frontières sur **425 fichiers**, build Next/OpenNext, trois dry-runs Wrangler stricts et `git diff --check` réussis. La suite générale n’a pas été relancée pour ce correctif ciblé.

L’état précédent, hausse du quota mensuel, est commité et poussé sur `main` avant ces modifications : **`e62727f`**. Sa [CI GitHub Actions](https://github.com/alexlevy0/BienVu/actions/runs/37763358017) est terminée avec succès ; ce résultat concerne ce commit précédent, pas encore le correctif des locations.

Les 11 JPEG privés sont relus par l’API et contrôlés : taille, dimensions, SHA-256 et absence d’EXIF. Le résultat privé relu est identique à la réponse initiale. Les accès sans session au résultat et à une photo répondent **401**. Un rejeu avec la même clé rend le même résultat, sans nouvelle tentative ni provision.

## Publication

| Worker | Version publiée à 100 % | Bindings inchangés |
| --- | --- | --- |
| Web, `bienvu.online` | `a3fa16c3-ac3c-4281-8a2e-9510f6f2771d` | 50 |
| Service d’import | `4ac52bb8-a67b-4b6a-9d46-4fd993e0eff8` | 9 |
| Service de génération | `5a389a95-35a4-44fa-8b4e-b49e1302f333` | 30 |

Comparaison complète des bindings et du runtime avant/après : identiques. Images des conteneurs existantes conservées avec `--containers-rollout none`. Le Worker web contient lui aussi l’extracteur ; le service de génération reçoit le registre pour admettre ces mêmes liens dans l’essai sans compte. Aucune génération anonyme ou connectée n’est déclenchée pour cette recette.

## Budget et nettoyage

Un seul nouvel import URL : usage d’octobre **55 → 56 sur 300**, usage quotidien **1 → 2 sur 20**. Provision d’import **0,50 €**, total mensuel avec baseline **77,25 → 77,75 €**, coupure **90 €** et enveloppe **100 €** conservées. Ces montants sont des provisions, pas une facture fournisseur.

Nettoyage terminé à **10:52:51 UTC**, après le bail d’écriture et les cinq minutes de protection, sans modifier les horodatages, compteurs ou provisions. L’import technique et ses 11 objets privés sont supprimés par la route produit ; zéro objet et zéro génération restent dans cet espace. Sessions et credentials sont révoqués, fichier d’identité supprimé. Seul le propriétaire technique reste pour respecter la protection de l’agence. Les compteurs et provisions sont identiques avant/après nettoyage, et `PRAGMA foreign_key_check` ne remonte aucun défaut.

Traces privées ignorées : `evidence/local/espaces-location-2026-10-08/` et `evidence/remote/espaces-location-2026-10-08/`. Aucun rendu vidéo, synthèse de voix, animation IA, e-mail ou paiement de test.
