# Étapes de génération de l’avatar et de la carte — 09/10/2026

## Résultat

La page d’accueil et le suivi dans Mes biens utilisent le même état d’avancement. La liste contient les informations, les photos, la carte si prévue, la narration, l’avatar si demandé, les animations des photos si sélectionnées, puis l’assemblage. « Voix off prête » est cochée dès que les pistes sont préparées, même si HeyGen travaille encore. Sans voix, le libellé devient « Texte prêt ».

Les états `working`, `ready` et `skipped` sont conservés en D1 dans `generation_preparation_steps`. Les options non demandées ne créent pas de ligne. Un passage non disponible affiche « Carte non ajoutée », « Avatar non ajouté » ou « Photos sans animation » ; il n’est pas coché comme une réussite. Le pourcentage reste celui du renderer, uniquement pendant l’assemblage. Aucun pourcentage fournisseur inventé.

Les noms des étapes Workflows et les états historiques des jobs restent identiques. Les tâches déjà en cours peuvent utiliser leurs checkpoints existants de narration, d’avatar, de carte et de manifeste. Les cartes confirmées sont préparées au même moment que les cartes automatiques, avant les appels de narration et d’avatar. Le manifeste réutilise les plaques en cache, avec les mêmes coordonnées, réglages et durées.

## Validation réalisée

- `pnpm exec tsx --test --test-concurrency=1 tests/generation-preparation.test.ts tests/default-video-map.test.ts` : **10 tests** réussis. Conditions d’affichage, aucune fausse réussite, options, état réellement préparé, cache des cartes confirmées, reprise, tentative périmée et isolation entre agences.
- `pnpm exec tsx --test --test-concurrency=1 tests/generation-workflow.test.ts` : **4 tests** réussis dans workerd, fournisseurs simulés. Avec/sans voix, narration invalide, avatar indisponible et supplément restitué, checkpoints conservés après redémarrage.
- `node scripts/probe-generation-progress-ui.mjs` : **6 scénarios à 1536 et 390 px**, composants réels, liste et titre concordants, voix cochée pendant l’avatar, étapes facultatives et non ajoutées, pourcentage d’assemblage, aucun débordement ni erreur JavaScript. Captures inspectées.
- Sauvegarde SQL privée avant migration ; répétition de **0062** sur cette copie : **122 tables existantes identiques**, aucune erreur de clé étrangère et aucune modification de montant, narration, média ou coût. Nouvelle table initialement vide.
- Types contrats, DB, pipeline et tests réussis ; build OpenNext avec TypeScript web réussi ; frontières **479 fichiers** et `git diff --check` réussis.
- Aucun appel payant, génération cliente, message ou publication sociale déclenché par cette recette. Les images d’interface sont des fixtures locales.

## Publication

Migration **0062 appliquée**. Génération **`88717e8a-d93a-4fe2-956e-abdcd5a88351`** et web **`fe55aabf-69ce-4cec-9053-54e2d8d69809`**, publiés à **100 %**. **32 bindings génération et 56 web conservés**, image renderer inchangée. Home, Mes biens et Éditeur répondent 200 ; endpoints privés 401 sans session. Nouveau chunk **`7363-9c68819f39179f6c.js`** servi identiquement au build local par SHA-256.

Lecture directe de la dernière génération existante, sans lancement ni appel fournisseur : état prêt, narration prête, carte prête et avatar prêt ; requête avec une autre agence vide. Aucune erreur FK après migration. Les preuves locales, logs, sauvegardes et captures sont dans `evidence/local/generation-progress-2026-10-09/`, hors Git. Le premier essai de migration a échoué sur une erreur de connexion ; son absence a été vérifiée avant la reprise réussie. Le build interrompu lors de la reprise de la conversation a été relancé et terminé.

Pas de nouvelle image renderer nécessaire. Les coûts, les prix et les comportements de repli HeyGen/Runway sont conservés. Aucune nouvelle génération réelle n’est lancée pour vérifier seulement l’affichage du suivi.
