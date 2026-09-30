# Dépôt de photos dans la saisie principale — 30 septembre 2026

## Comportement livré

Le survol de la saisie principale avec des fichiers affiche une zone pointillée verte, une icône animée et « Déposez vos photos ici ». Les passages entre ses éléments internes ne font pas clignoter la zone. Un glissement de texte ne l’active pas.

Après dépôt, les photos apparaissent en miniatures, avec un bouton pour les retirer. Le formulaire reste fermé. Entrée, « Compléter mon annonce » ou « Saisie manuelle » ouvre ensuite le formulaire guidé et y transfère les photos une seule fois, dans leur ordre. De nouveaux dépôts peuvent compléter la sélection. Les photos refusées par un brouillon déjà plein restent dans la saisie principale, accompagnées du message d’erreur.

La sélection avant Entrée est uniquement en mémoire dans l’onglet : elle n’est ni envoyée ni conservée après rechargement. Après transfert, le formulaire réutilise son stockage existant : brouillon local temporaire pour un visiteur, brouillon et upload privés pour une agence connectée. Préparer le formulaire reste possible sans crédit vidéo ; la création conserve ses contrôles serveur.

Limites identiques au formulaire : JPEG, PNG, WebP ; 12 photos maximum, 10 Mio par photo et 50 Mio au total ; minimum 640 × 360 pixels et maximum 16 millions de pixels. Le contrôle serveur reste obligatoire. La génération nécessite toujours au moins trois photos différentes. Les nouvelles animations respectent `prefers-reduced-motion`.

Fichiers : composants `home-create.tsx`, `manual-listing-form.tsx`, helper navigateur `manual-photos.ts`, styles `landing.css`, sonde `probe-photo-drop.mjs`. Aucune migration, clé API ou nouvelle ressource.

## Recette locale sur fixtures

- Nouvelle sonde navigateur : **4 parcours réussis**, visiteur/agence à **1536 et 390 px**. Survol, entrée/sortie imbriquée, miniatures, retrait, dépôt supplémentaire, fichiers refusés, véritable touche Entrée, ordre des photos et restauration après Annuler/réouverture. Aucun débordement global ; captures inspectées.
- Aucun POST/PUT avant Entrée. Après Entrée, zéro upload pour le visiteur ; un brouillon et trois uploads **simulés** pour l’agence, sans doublon après réouverture.
- Contrôles de type, dimensions et nombre sur les quatre parcours ; limites de 10/50 Mio et ajout à un brouillon plein vérifiés dans le parcours visiteur de bureau, sans perte des nouvelles miniatures.
- Régression du workflow : **8 cas** réussis pour animation descendante, mouvement réduit et suppression de brouillons ; **4 cas** réussis pour prix « 200k€ », description et conservation de la demande originale.
- Tests serveur ciblés `manual-listings.test.ts` et `draft-delete.test.ts` : **9/9** réussis. Types web, frontières sur **179 fichiers**, build Next/OpenNext, `git diff --check` et dry-run Wrangler réussis. Avertissement préexistant `fast-png` non bloquant.

Les images de cette recette sont les illustrations de démonstration existantes, sans prétendre être des photos d’une vraie annonce. Les comptes et les réponses d’upload sont des fixtures navigateur ; aucun OpenAI, Google, import immobilier ni rendu vidéo n’est appelé. La nouvelle sonde a été ajustée pour attendre le chargement du compte, envoyer l’événement clavier complet et utiliser une agence de fixture avec un contact valide avant son passage final réussi.

Journaux et captures ignorés dans `evidence/local/photo-drop/` : `report.json`, `probe-final.log`, `regression-drafts.log`, `regression-price.log`, `tests.log`, `boundaries.log`, `build.log`, `dry-run.log`, captures `guest-*` et `auth-*`. Le serveur local utilise un Worker sans services payants et sans génération activée.

## Publication et vérifications réelles

Worker **bienvu-web-probe-staging**, version **`3c8ea13b-de48-4f63-a18d-e43d9de3b541`**, publié à **100 %** sur **bienvu.online** avec `--keep-vars --strict`. Version précédente : `c7621f57-eefa-441d-b83c-dabdc52b9663`. Bindings, variables, secrets, compatibilité et modèle d’usage contrôlés avant/après et conservés.

Chargement de l’accueil dans la vraie session Chrome du propriétaire : quota et activités visibles, saisie principale disponible, styles de transition présents et aucun débordement. Capture `production-home.png` ignorée. Cette inspection distante ne simule pas un dépôt de fichiers dans la session réelle.

L’accueil et `robots.txt` répondent 200 ; l’API réelle `/api/admin?section=overview` refuse l’accès anonyme avec 401. Le JavaScript public contient les nouvelles classes du dépôt et des miniatures. Les premiers contrôles de publication ont été rectifiés : recherche d’une chaîne accentuée échappée par le bundler, puis chemin d’API administrateur incorrect. Aucun second déploiement n’a été nécessaire. Snapshots opérateur protégés `production-before.json` / `production-after.json`, rapport `production-report.json` et journal `deploy.log` ignorés.

Avant/après publication : D1 réel inchangé, **5 jobs, 2 comptes, 0 abonnement**. Provision du mois **44,30 €** dans D1, plus provision historique hors D1 **0,05 €** : suivi prudent **44,35 €/50 €**, marge **0,65 € avant coupure à 45 €**. Aucun essai de génération supplémentaire n’est nécessaire à cette maintenance. Les petites consommations d’infrastructure ne sont pas assimilées à une facture mesurée ni annoncées gratuites.

Les parcours complets de dépôt/transfert sont prouvés sur fixtures locales. Ils ne constituent pas une recette d’un nouvel upload R2 ou d’une vidéo distante. Le serveur local de recette est arrêté. Aucun commit/push demandé pour cette maintenance ; les travaux antérieurs du panel restent conservés.
