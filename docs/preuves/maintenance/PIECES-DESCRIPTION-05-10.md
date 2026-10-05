# Nombre de pièces depuis une description — 5 octobre 2026

La phrase « Je vend une maison à Lyon a 200000€ pour un 3 pieces » était analysée, mais le validateur rejetait la preuve `3 pieces` : il n’acceptait que `pièce` et `pièces` avec l’accent. Le nombre ne parvenait donc pas au formulaire. La preuve de transaction `vend` était également rejetée.

Le contrôle de preuve accepte désormais `piece`, `pieces`, `pièce`, `pièces`, les majuscules et l’accent Unicode décomposé. Les verbes de vente au présent `vend` et `vends` sont reconnus. Le nombre doit toujours correspondre à un extrait exact du texte source et à la valeur retournée. Aucune conversion du nombre de chambres en nombre de pièces, aucun relâchement des schémas ou des confirmations d’ambiguïtés. Le schéma de sortie, les appels fournisseur et les règles de crédits sont conservés.

## Validation

- L’exemple exact est reproduit avant correction avec `rooms: null`, puis vérifié après correction avec **3 pièces**, maison, vente, Lyon et **200 000 €**. La surface reste absente et le texte d’origine est conservé.
- **7 tests de parcours réussis**, incluant les deux nouvelles régressions : accents/pluriels/casse, vente au présent, réponse structurée simulée de l’API, chambres, preuve absente ou valeur différente, ambiguïté à confirmer, mot « Vendredi » qui n’indique pas une vente. Les tests existants de prix, brouillons D1/R2, reprise, isolation et limites budgétaires passent.
- TypeScript narration/pipeline et tests, contrôle des frontières des 345 fichiers et dry-run Wrangler génération réussis.
- Les réponses fournisseur sont simulées dans la recette. Aucun appel OpenAI réel, génération vidéo, débit de crédit ou nouveau conteneur.

```sh
node --import tsx --test tests/creation-workflow.test.ts
pnpm check:boundaries
pnpm --filter @bienvu/narration --filter @bienvu/pipeline typecheck
pnpm exec tsc -p tsconfig.tests.json
pnpm --filter @bienvu/pipeline exec wrangler deploy --config wrangler.staging.partial-generation.jsonc --containers-rollout none --keep-vars --strict --dry-run
git diff --check
```

## Mise en ligne

Le service `bienvu-generation-development`, utilisé pour l’extraction connectée et invitée, est publié avec la version **`9388456e-5fc8-4711-8552-60de73b0c143`**. Déploiement avec `--containers-rollout none --keep-vars --strict` : aucune construction ni mise à jour de conteneur. Aucun déploiement web/import, migration ou modification de budget.

Les empreintes des variables, secrets et bindings sont identiques avant/après : web (43), import (9), génération (28). Contrôle distant en lecture seule réussi : accueil et Mes biens HTTP 200 ; endpoint interne d’extraction sans authentification HTTP 401. L’exemple fourni est testé sur réponse fournisseur simulée, sans nouvelle analyse réelle payante. Les résultats déjà enregistrés ne sont pas réécrits : une nouvelle analyse depuis l’accueil bénéficie du correctif.

Les preuves et logs restent ignorés dans `evidence/local/rooms-description-20261005/`.
