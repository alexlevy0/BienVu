# Échec de génération : narration — 2 octobre 2026

## Cause constatée

Essai du brouillon `e05ca09f-153f-4ae8-a520-34eed5b0641e`, job `c6eecb88-4a23-4193-b691-fb0c3458e3d3`, demandé à **15:23:54 UTC**, interrompu à **15:24:08 UTC**. Durée demandée : **40 secondes**. L’annonce était disponible ; l’échec est en étape `scripting`, avec `narration_runs.error_code = SCRIPT_INVALID`. Aucun appel voix, animation ou rendu n’avait commencé. La réservation client est `released`.

Les deux appels OpenAI ont terminé et renvoyé une sélection d’introduction, trois passages `gallery` de la description, puis contact. Le compilateur dédupliquait les types de scène et réduisait ce plan à trois scènes, sous le minimum contractuel de quatre. La correction OpenAI proposait le même plan. Le Workflow masquait ensuite `SCRIPT_INVALID` derrière `GENERATION_FAILED`.

## Correction

- `packages/narration/src/script.ts` complète les plans descriptifs trop courts avec une autre entrée autorisée du catalogue. Les passages déjà sélectionnés et leurs équivalents d’un autre type sont prioritaires ; des passages courts sourcés/factuels servent de repli. Limites de mots, qualificatifs, provenance et photos restent contrôlés. Aucun texte libre ni appel fournisseur supplémentaire pour cette adaptation.
- `packages/contracts/src/errors.ts` expose un message de rédaction précis pour `SCRIPT_INVALID`, repris par le Workflow, la conversation et Mes vidéos.
- `packages/db/src/generation.ts` rattache le diagnostic de narration de la même agence à la lecture des anciens échecs génériques. Aucun job terminal ni journal financier n’est réécrit ; les diagnostics inconnus restent masqués.
- Régressions dans `tests/narration-description.test.ts`, `tests/generation-workflow.test.ts` et la fixture Worker.

## Contrôles exécutés

```sh
pnpm exec tsx --test --test-concurrency=2 tests/narration*.test.ts tests/generation*.test.ts
pnpm typecheck
pnpm check:boundaries
pnpm build:web
git diff --check
```

**28 tests passent**, dont plusieurs passages du même type pour **20/30/40 s**, identifiants étrangers refusés, reprise et isolation, et Workflow workerd avec sélection invalide : erreur publique précise, crédit libéré, aucun appel TTS ni artefact vidéo. Typage complet, frontières de **197 fichiers**, build OpenNext et dry-runs des deux Workers réussis.

Les **deux réponses OpenAI réellement enregistrées** pour cet essai sont rejouées hors ligne contre le compilateur corrigé : chacune donne **4 scènes, 31 mots**, validées. Les deux passages descriptifs conservés restent issus du catalogue de l’annonce. Aucun nouvel appel API dans ce rejeu ; aucune génération complète de MP4 n’est déclarée validée par ce contrôle.

Chrome **local puis sur bienvu.online**, à **1536/390 px**, avec compte et job simulés : message précis, mention du crédit libéré, persistance après actualisation, aucun débordement ni POST de génération. Captures inspectées. Cette recette d’interface utilise les assets publiés, sans session du client ni impersonation.

## Publication et contrôle distant

Déploiement avec `--keep-vars --strict`, pipeline avec `--containers-rollout none` :

- Génération **`d8f6af0c-bfb5-4ad6-a310-9074a5f1c6e1`**, web **`81c8f1a1-360f-415d-957d-572bcc728123`**, chacun **100 %**.
- **28/25 bindings**, variables, secrets et compatibilité conservés. Image renderer **v13 / `9ba35b60…48bcdc`** inchangée, aucune migration ni remise à zéro.
- Accueil/connexion **200**, API admin visiteur **401**. Le chunk client modifié servi par le domaine correspond au SHA-256 du build.
- Relecture du vrai job D1 avec la même requête applicative `findGeneration` puis projection `generationView` : ancien code stocké `GENERATION_FAILED`, diagnostic public obtenu **`SCRIPT_INVALID`**, crédit toujours `released`. Contrôle opérateur en lecture seule ; l’API de ce compte n’a pas été appelée avec une session utilisateur.

Registre d’octobre avant/après : **42,35 € provisionnés**, coupure **90 €**, enveloppe autorisée **100 €**. Aucun nouvel appel OpenAI/Fish/Google/Runway, rendu ou crédit client consommé. Les coûts du premier essai échoué restent enregistrés ; facture d’infrastructure non rapprochée. **Nouvelle génération complète Cloudflare après correctif restant à observer** ; l’ancienne tentative n’est pas relancée automatiquement.

Journaux, réponses privées, captures et rapports : `evidence/local/generation-sanary/`, hors Git. Serveur local 8790 arrêté. Aucun commit/push pour cette correction.
