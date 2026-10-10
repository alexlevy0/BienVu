# Budget réglable dans le superadmin — 9 octobre 2026

## Cause et correction

Le formulaire rejetait une enveloppe de **300 €** parce que le contrat d’administration et les contraintes D1 conservaient un maximum de **200 €**. Le message générique évoquait les engagements alors que les **93,45 €** provisionnés étaient bien couverts par la coupure de **180 €**.

Le montant est maintenant choisi et confirmé par le superadmin. Le formulaire, le contrat serveur, D1 et le moteur de rendu partagent les mêmes limites ; la borne technique de saisie est **10 000 €**, avec au moins **5 € de marge**. Cette borne n’est pas une autorisation de dépense ni une ouverture automatique du mois. Les valeurs proposées pour un nouveau mois restent **200 € / coupure 180 €**.

La validation affiche une raison précise pour un champ vide, des centimes invalides, une marge insuffisante ou une coupure inférieure aux engagements. La confirmation, le motif obligatoire, le contrôle de révision, les droits superadmin et l’audit restent actifs. Enveloppe et coupure sont indépendantes : sélectionner 300 € avec une coupure de 180 € garde un arrêt à 180 €.

## Validation

- **29 tests ciblés réussis** : formulaire, budget du renderer, migrations et actions mensuelles atomiques, administration, admission et contrôleur durable. L’action 300 € / 180 € est enregistrée dans une D1 locale ; engagements, historique, refus concurrent et marge sont contrôlés.
- Typage de tout le monorepo, frontières **477 fichiers**, `git diff --check`, build Next/OpenNext et dry-runs génération/web réussis.
- Composant réel dans Chromium local à **1536/390 px**, avec données synthétiques et callback de confirmation isolé : bouton activé pour 300 €, aucune action avant clic, centimes exacts transmis, erreurs de marge et d’engagement précises, défauts du nouveau mois conservés, aucun débordement. Captures inspectées. Aucun enregistrement réel de budget pendant cette recette UI.
- Sauvegarde SQL privée complète avant la migration additive **0060**. Comparaison à la sauvegarde après migration : budgets, paramètres, compteurs d’import, audit, narration, politique anonyme et nombre de générations identiques ; **zéro défaut de clé étrangère**.
- Génération publiée à 100 % : **`3fc52c28-4810-4615-b9c8-acf29b77c0f8`** ; web à 100 % : **`8f0fff2b-04a6-499e-a7be-f12925ec14ac`**. Les **32/56 bindings** restent identiques et l’image du renderer est conservée.
- Lecture publiée : accueil **200**, administration déconnectée **307**, API admin déconnectée **401**. Le JavaScript de la page admin servi par `bienvu.online` possède exactement le SHA-256 du build vérifié.

## Montants et limites de la recette

À **18:06 UTC**, octobre reste à **200 € / coupure 180 €**, révision **2**, avec **93,45 €** provisionnés. Septembre, les dépenses et les neuf lignes d’audit sont conservés. Aucun budget n’est relevé automatiquement par cette correction ; la saisie et la confirmation du nouveau montant dans la session superadmin restent à effectuer par Alex.

Aucun nouvel import, rendu, appel texte/TTS/HeyGen/Runway, achat ou débit de crédit client n’a été déclenché pour cette maintenance. Les sous-plafonds fournisseurs restent distincts et inchangés. Les provisions ne constituent pas des factures rapprochées.

Preuves privées ignorées par Git : `evidence/local/admin-budget-2026-10-09/` (sauvegarde, relevés avant/après, tests, captures, builds, publications et empreinte de l’asset). Aucun secret dans ce rapport. Aucun commit ni push pour cette demande.
