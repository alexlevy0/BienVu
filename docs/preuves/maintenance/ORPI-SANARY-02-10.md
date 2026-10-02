# Import Orpi Sanary — 2 octobre 2026

## Cause et correction

Annonce : [maison à vendre à Sanary-sur-Mer](https://www.orpi.com/annonce-vente-maison-t5-sanary-sur-mer-83110-6a8bf038-8658-47a4-8b4c-1ba6ef93b7fc/).

Deux tentatives utilisateur à 14:54 UTC échouaient avec `INCOMPLETE_LISTING`. Le transport avait reçu 445 951 octets de HTML : aucun refus du portail ni problème de DNS. Le titre « Maison à vendre 5 pièces • Sanary-sur-Mer » ne contient pas de surface, contrairement au modèle imposé par l’ancien adaptateur.

`orpi-dom/4.2` accepte cette forme en vente et location. La surface reste `missing/null`, modifiable dans le formulaire ; elle n’est pas déduite arbitrairement du texte libre. Identité de fiche, transaction, localisation, prix et rattachement des images restent contrôlés. Une surface mal formée ou sans localisation reste refusée.

Dans l’accueil, un résultat `failed` expose désormais son erreur publique précise et retire la clé d’import mémorisée. Un clic ultérieur peut donc réessayer réellement. Une réponse réseau incertaine conserve sa clé ; aucun retry automatique n’est ajouté.

## Validation locale et interface

```sh
pnpm exec tsx --test --test-concurrency=2 tests/import-portals.test.ts tests/import-extraction.test.ts tests/import-description.test.ts tests/import-partial.test.ts
pnpm typecheck
pnpm check:boundaries
pnpm build:web
node --import tsx evidence/local/orpi-sanary/check-ui.mjs
git diff --check
```

**33 tests réussis**, types et frontières de 197 fichiers validés. Le nouveau test couvre ventes/locations sans surface, champs et galerie conservés, surfaces invalides et référence d’image étrangère refusées. Build OpenNext et dry-run pipeline réussis.

Chrome à **1536 et 390 px** : API simulée à partir des données réellement extraites, premier import échoué, nouveau clic avec nouvelle clé, personnalisation puis Détails. Prix 1 664 000 €, 5 pièces, ville et description préremplis, surface vide. Captures inspectées, aucun débordement ni écriture imprévue. Le « 65 » grisé du champ Surface est son placeholder, pas une valeur importée.

## Cloudflare réel

Génération **`d9465537-5ef3-47de-bee6-b35f80a7059e`**, web **`2193f953-4d22-492e-829c-6c9969f49380`**, chacun à **100 %**. Les **28/25 bindings** sont identiques avant/après ; image d’import et renderer 13 conservés, aucun rollout de conteneur ni migration. Accueil/connexion 200, admin sans session 401.

Une seule tentative d’import réellement exécutée après publication, à **15:11 UTC**, depuis un compte de recette isolé sur bienvu.online. Réponse **HTTP 200, statut `ready`** : prix **1 664 000 €**, maison en vente, **5 pièces**, **Sanary-sur-Mer**, description de **1 042 caractères**, **12 photos** privées. Les 12 fichiers sont téléchargés par leurs routes privées, vérifiés par SHA-256 et décodés par Sharp ; première photo inspectée. L’extraction propose 20 candidats, le plafond existant reste de 12 photos conservées.

Rejeu avec la même clé : même import, compteur inchangé. Lecture sans session : 401. La création du brouillon de personnalisation répond **201** ; les 12 photos et les champs numériques/null sont ensuite relus par son API privée. La sonde attendait initialement 200 à cette étape : assertion corrigée, vérification reprise en lecture seule sur le brouillon déjà créé, sans nouvel import.

Budget avant/après : **40,65 € → 41,15 € engagés**, dont **0,50 €** de provision pour cet import, plafond de coupure **90 €** sur enveloppe **100 €**. Il s’agit d’une provision prudente, pas d’une facture. Aucun e-mail, job vidéo, synthèse vocale, appel OpenAI ou Runway effectué.

Nettoyage terminé : les **24 objets R2** de l’import et de sa copie de personnalisation, les deux dossiers et le compte/agence de recette sont supprimés. Credentials temporaires retirés. Compteurs et provisions sont strictement conservés ; aucune donnée client préexistante n’est modifiée.

Les traces, médias, captures et scripts de recette restent ignorés dans `evidence/local/orpi-sanary/`. La génération complète d’un MP4 pour cette annonce n’est pas testée dans cette maintenance ; le contrôle réel porte sur l’import et la personnalisation.
