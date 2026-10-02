# Coche de l'onglet Détails — 02/10/2026

## Correction

`sectionComplete(2)` retournait systématiquement `true` : l'onglet Détails affichait donc une coche dès l'ouverture d'un formulaire vide.

Dans `apps/web/components/manual-listing-form.tsx`, la coche nécessite désormais au moins un détail renseigné et aucune erreur sur les champs de cette section selon `ManualListingInput`. Prix, surface, pièces, description et charges en location sont pris en compte ; les espaces seuls et les placeholders ne sont pas des informations renseignées. Effacer les valeurs ou entrer un détail invalide retire la coche. Les champs restent facultatifs et « Passer cette étape » reste utilisable.

## Vérifications effectuées

- Typage web, syntaxe de la sonde navigateur, build OpenNext et `git diff --check` réussis.
- Chrome **local puis bienvu.online publié**, à **1536, 390 et 320 px** : formulaire initial vide et étape passée sans coche ; prix de vente valide avec coche ; valeur effacée, zéro et prix non numérique sans coche ; description seule avec coche, espaces seuls sans coche ; loyer sans indication des charges sans coche, charges précisées avec coche ; surface invalide retirant la coche puis valeur corrigée la rétablissant.
- Captures vide/rempli inspectées ; aucun débordement horizontal. Données de recette fictives saisies dans un brouillon local du navigateur jetable. Aucun import, upload, inscription ou vidéo soumis ; **zéro requête API d'écriture et zéro fournisseur**. Ce contrôle n'est pas une recette du backend authentifié ou de Turnstile ; les API locales de compte/essai ne sont pas validées par ces tests.
- Web **`181f1ef7-3eb6-44e0-b820-b7569551e2f2`** publié à **100 %**, avec `--keep-vars`. **25 bindings**, secrets/variables et compatibilité conservés ; accueil/connexion **200**, admin visiteur **401**. Pipeline et moteur vidéo inchangés.
- Registre octobre conservé à **36,95 € provisionnés**, coupure **90 €**, enveloppe **100 €**. Aucun nouvel appel IA ni réservation fournisseur. Serveur local 3020 arrêté, aucun conteneur lancé, aucun commit/push.

```sh
pnpm --filter @bienvu/web typecheck
BIENVU_HOME_URL=http://localhost:3020 node scripts/probe-manual-details-ui.mjs
node --check scripts/probe-manual-details-ui.mjs
pnpm build:web
pnpm exec wrangler deploy --config apps/web/wrangler.staging.jsonc --keep-vars
BIENVU_HOME_URL=https://bienvu.online node scripts/probe-manual-details-ui.mjs
git diff --check
```

Traces privées ignorées : `evidence/local/manual-details/`, avec captures, rapports et instantanés avant/après. Les premiers essais de sonde ont été corrigés pour attendre la fin du chargement de l'interface et isoler les brouillons entre les trois largeurs ; les traces sont conservées. [Parcours de saisie manuelle](../../SAISIE-MANUELLE.md).
