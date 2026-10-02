# Correction des uploads de photos — 02/10/2026

## Incident et correction

Les messages « Envoi interrompu » dans Personnaliser et « Erreur » dans Saisie manuelle masquaient les erreurs HTTP. Une tentative réelle de création de brouillon a renvoyé **429 IMPORT_LIMIT** : compteur d’import du 01/10 UTC à **10/10**, budget financier encore disponible. Le retrait appelait la création du même brouillon indisponible avant de supprimer un fichier local. Personnaliser ne proposait pas de reprise/retrait.

- Migration additive `0028_manual_upload_budget.sql` : plafond **10/jour, 30/mois** appliqué aux imports URL. Les photos personnelles et copies personnalisables gardent **30 dossiers/agence**, **12 photos**, **10 Mio/fichier**, **50 Mio/dossier**, **48 requêtes** et **0,50 € de provision/dossier**. Aucun ancien compteur remis à zéro, aucun quota vidéo modifié.
- Le front ne bloque plus une annonce préparée ou une saisie manuelle sur le plafond de scraping. Erreurs publiques explicites, réessai unique même au double clic, envoi borné à 65 s.
- Retrait sans création de brouillon supplémentaire ; attente de la création déjà engagée uniquement. Boutons Réessayer/Retirer dans les deux vues, état Retrait… et annulation des résultats tardifs.
- Le serveur conserve le journal lors d’une panne de suppression R2 pour permettre son réessai ; un identifiant annulé ne peut plus revenir depuis le cache d’upload.
- Le service de normalisation accepte aussi un import URL suspendu en brouillon, avec les mêmes contrôles d’agence et de budget.

## Vérifications exécutées

- `pnpm check` : **231 tests**, types monorepo et frontières réussis. Après les derniers ajustements : test d’admission à quota de scraping plein, nouveau test du service photo workerd et `tsc -p tsconfig.tests.json` réussis.
- Tests D1/R2 locaux : reprise après PUT interrompu, DELETE interrompu puis repris, identifiant annulé, remplacement de slot et PUT tardif ; brouillon permis à quota URL plein, plafond financier et 30 dossiers conservés.
- `node scripts/probe-photo-upload-ui.mjs` : **8 scénarios fixtures**, desktop **1536 px** et mobile **390 px** ; quota refusé et retrait sans nouveau POST, réessai au double clic, retrait pendant l’envoi, parcours Personnaliser/manuelle et invité, aucun débordement. Exécutés aussi sur le build de production avec `importRetryAt` actif dans la fixture.
- `pnpm build:web` : OpenNext réussi ; dry-runs web/import et `git diff --check` réussis. Avertissement esbuild existant de `fast-png` sur un opérateur `??` ; aucun nouvel échec de build.
- `node scripts/probe-photo-uploads-cloudflare.mjs --keep --batch` : **vrais Workers + D1 + Container de normalisation + R2**. Envoi PNG, lecture JPEG privé, rejeu, retrait, trois uploads concurrents, lecture visiteur refusée **401**, suppression des trois photos : réussite.
- `node scripts/probe-photo-upload-live-ui.mjs` : **vrai navigateur sur bienvu.online**, compte synthétique isolé ; upload puis retrait dans **Personnaliser**, upload puis retrait dans **Saisie manuelle**. Relu depuis l’API : **0 photo restante**. Captures réellement inspectées. Aucun fetch API simulé dans cette sonde.

Les fichiers de recette sont des images synthétiques. Les scénarios d’interruption utilisent des fixtures locales ; ils ne simulent pas une panne du stockage public. Aucun MP4, fournisseur IA, courrier ou compte utilisateur existant n’est utilisé pour cette correction.

## Publication et budget

- Web **`fe06cdf9-3a1b-4f5c-95c7-3d6a0fb749ae`**, import **`2077212d-7341-44bd-bd32-8f44a5f2d5ec`**. Publication import avec `--containers-rollout none` : image et capacité du Container conservées. Renderer/génération inchangés.
- Migration `0028` appliquée sur **bienvu-s00-staging** après les tests de budget locaux. Bindings, noms de secrets et variables web comparés avant/après : identiques.
- Base octobre **25,05 €**, provision imports **4,50 → 5 €**, total prudent de ces deux registres **29,55 → 30,05 €**. **0,50 € supplémentaire** correspond au dossier synthétique et reste conservé après nettoyage. Ce sont des provisions, pas une facture. Enveloppe **100 €** / coupure **90 €** inchangées. Aucun appel OpenAI/Google/Runway ni génération vidéo ; coût effectif Cloudflare non rapproché.
- Zéro job actif avant/après ; photos et compte de recette nettoyés, serveur local au port 3020 arrêté. Preuves brutes dans `evidence/local/photo-upload-fix/`, hors Git. Pas de commit/push demandé pour cette correction.

## Reprise utilisateur

Actualiser bienvu.online pour charger la correction et sélectionner de nouveau les fichiers qui n’avaient pas été reçus. Les nouveaux envois disposent de **Réessayer** et **Retirer** sans devoir recharger la page. Les photos déjà sauvegardées sur le serveur sont conservées. Le quota de scraping reste applicable aux nouveaux imports URL ; la réserve mensuelle et les crédits vidéo restent applicables à la génération.
