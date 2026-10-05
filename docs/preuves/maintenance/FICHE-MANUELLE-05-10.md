# Fiche de saisie manuelle — 5 octobre 2026

La saisie de l’accueil utilise désormais une fiche unique inspirée de la maquette « Fiche immobilière avec aperçu vidéo ». Le type de bien, la transaction, la ville et les valeurs facultatives sont accessibles directement. Les photos sont numérotées ; la première sert de couverture, l’ordre se modifie par glisser-déposer ou avec des boutons accessibles au clavier. La description et le titre modifiable sont dans un volet repliable. Sans titre saisi, un titre est proposé à partir des informations déclarées.

L’aperçu montre la couverture et les valeurs saisies, et suit le format vertical ou horizontal. La barre inférieure regroupe les réglages existants (format, durée, voix, sous-titres, personnalisation), le coût en crédits et la création. Les cartes se placent côte à côte sur ordinateur et se superposent sur mobile. Le même formulaire est adapté à la colonne de l’ancien écran `/generer`.

Les routes serveur, quotas, crédits, formats d’upload et provenance des informations restent ceux du produit. Les références des photos et des animations ne sont pas recréées lors d’un réordonnancement. La saisie invitée et ses fichiers passent toujours par la conservation locale avant inscription, puis reprennent dans le brouillon privé. Les fichiers identiques sont détectés avant upload ; les contrôles serveur des doublons normalisés restent actifs. La sauvegarde automatique est suspendue pendant l’envoi, afin de ne pas relire des contrôles temporairement désactivés.

## Validation

- **21 tests ciblés réussis**, avec D1/R2 locaux et photos synthétiques : validation des champs et unités, uploads interrompus et repris, doublons, ownership, suppression, versionnement, personnalisation et calcul/réservation/libération des crédits.
- Recette navigateur locale connectée et invitée à **1536 et 390 px**, sur APIs de fixtures : aperçu dynamique, erreurs de champ, charges du loyer, rejet d’un doublon, couverture par glisser-déposer et clavier, retrait, réglages, personnalisation, conservation après retour au lien, inscription simulée et une seule admission de génération simulée. Aucun appel de génération réelle ni fournisseur payant.
- **8 scénarios d’upload** sur fixtures : budget atteint, erreur puis double clic sur réessai, retrait pendant l’envoi et réponse tardive, saisie et personnalisation, connecté/invité, desktop/mobile. **2 imports partiels** reconstruits conservent prix, surface, pièces, ville et description. **3 visites sans fixture API**, en lecture seule à 1536/390/320 px, valident les champs et le volet de réglages. **2 visites de l’écran `/generer`** sur fixtures vérifient ses trois photos, sa colonne unique et l’absence de débordement.
- Compilation Next/OpenNext avec vérification TypeScript et contrôle des frontières des **333 fichiers**. Les traces et captures restent ignorées dans `evidence/local/manual-sheet-20261005/`.

```sh
pnpm exec tsx --test --test-concurrency=1 tests/manual-listings.test.ts tests/creation-workflow.test.ts tests/video-customization.test.ts tests/draft-delete.test.ts tests/product-credits.test.ts
pnpm check:boundaries
pnpm build:web
node scripts/probe-manual-sheet-ui.mjs
BIENVU_HOME_URL=http://localhost:8790 node scripts/probe-manual-details-ui.mjs
BIENVU_HOME_URL=http://localhost:8790 node scripts/probe-photo-upload-ui.mjs
node --import tsx scripts/probe-import-partial-ui.mjs
git diff --check
```

Les sondes ciblées de champs, d’erreurs d’upload et d’import partiel suivent maintenant la fiche unique. La nouvelle sonde `probe-manual-sheet-ui.mjs` remplace le parcours en cinq étapes pour la recette complète de cette fiche. Les anciens rapports datés décrivent leur interface historique.

## Mise en ligne

Le Worker web `bienvu-web-probe-staging`, servi sur **bienvu.online**, est déployé avec la version **`39922f77-bfe4-4904-9860-19a566c13b81`**. Les variables, secrets et bindings ont été comparés avant et après : identiques sur le web (43), l’import (9) et la génération (28). Aucune migration, nouvelle ressource ou publication des conteneurs.

La recette publique en lecture seule à **1536, 390 et 320 px** réussit : fiche unique, validations, charges du loyer, précisions repliables, réglages, clavier et absence de débordement horizontal. Aucun POST/PUT/PATCH/DELETE ni appel de fournisseur pendant ces visites. L’accueil et `/sources` répondent HTTP 200. Le serveur local de cette recette est arrêté après validation. Aucun commit ou push n’est effectué pour cette demande.

```sh
pnpm --filter @bienvu/web exec wrangler deploy --config wrangler.staging.jsonc --keep-vars --strict --message 'Redesign manual listing entry with live cover preview'
BIENVU_HOME_URL=https://bienvu.online node scripts/probe-manual-details-ui.mjs
```
