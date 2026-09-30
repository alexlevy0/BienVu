# Quota et compteur du studio — 30 septembre 2026

## Cause et correction réelle

Le compte d'Alex utilisait encore `s07-alex-development`, allocation de développement contrôlée avec quota 1 et validité jusqu'au 5 octobre. Une vidéo prête avait consommé ce crédit. La tentative échouée précédente avait une réservation `released` : elle n'avait pas consommé de deuxième crédit. La valeur zéro était donc conforme à l'ancien quota de recette, mais pas aux trois vidéos attendues par Alex.

Une mise à jour D1 conditionnelle a porté **uniquement ce quota de 1 à 3** : vérification préalable de l'agence, de l'accès activé, de l'absence d'abonnement commercial actif, de la limite précédente, de `reserved=0` et de `consumed=1`, puis un unique `UPDATE … RETURNING`. Relecture après correction et après publication : **quota 3, réservé 0, consommé 1, disponible 2**. Validité, accès, jobs, artefacts et réservations conservés. L'allocation reste techniquement `paid` dans l'ancien dispositif de développement ; cela ne prouve aucun achat d'abonnement et ne change pas les droits commerciaux des autres comptes.

Ce correctif ponctuel n'est pas une migration globale ni un mécanisme de rechargement automatique. Le script d'ouverture de développement conserve son quota prudent de recette ; il n'écrase pas une allocation existante. Les offres et le renouvellement des comptes gratuits sont inchangés.

## Interface

- `apps/web/components/home-create.tsx` : suppression du solde et de la date de renouvellement sous la saisie principale pour le compte connecté ; les indications utiles aux invités, brouillons et générations en cours restent disponibles.
- `apps/web/components/studio-sidebar.tsx` : nombre de vidéos disponibles au-dessus de « Découvrir les offres », en bas de la navigation, sur toutes les vues du studio connecté.
- `apps/web/components/account.tsx`, `generation-store.tsx` : relecture des droits après ajout d'un job et transition vers un état terminal. Le rafraîchissement garde l'identité et les informations d'agence, sans réinitialiser la conversation. Une réponse d'une autre agence ou d'un autre utilisateur est ignorée. En cas de problème réseau, le dernier solde connu reste visible ; l'admission serveur continue à contrôler les crédits.
- `scripts/probe-workflow-ui.mjs` : assertions sur la position du compteur, l'absence du bloc sous la saisie et les mises à jour après réservation et échec.

## Vérifications locales et fixtures

Commandes exécutées avec Node 24 et pnpm 10.33.2 du projet :

- `pnpm --filter @bienvu/web typecheck` : réussi.
- `pnpm exec tsx --test --test-concurrency=1 tests/generation-storage.test.ts tests/accounts.test.ts` : **12 tests réussis**, dont admission atomique, réservation unique, libération idempotente après échec, consommation unique après disponibilité et isolation entre agences. D1/R2/workerd locaux ; identités et fournisseurs simulés.
- `pnpm check:boundaries` : réussi, 163 fichiers.
- `pnpm build:web` : build Next/OpenNext réussi.
- `pnpm exec wrangler deploy --config apps/web/wrangler.staging.jsonc --dry-run` : réussi.
- `pnpm --filter @bienvu/web exec wrangler dev --port 8790 --local`, puis `node scripts/probe-workflow-ui.mjs` : recette à **1536 × 980 et 390 × 844**, solde initial 2, note sous la saisie masquée et absence de date, admission simulée ramenant le compteur à 1, bibliothèque épuisée à 0 puis libération à 1 après échec sans rechargement ni nouveau job. Les autres parcours de la sonde existante passent : saisie guidée, photos, notification de disponibilité, navigation et signalement avec reprise. APIs, comptes et Turnstile interceptés par des fixtures, aucune génération réelle. Inspection visuelle de la capture d'accueil desktop : compteur en bas à gauche, bloc retiré sous la saisie ; pas de débordement horizontal aux deux largeurs.

Le premier test de libération a échoué parce que la nouvelle fixture envoyait `stage='failed'`, étape interdite par le contrat. Le statut terminal reste `failed` mais l'étape est maintenant `rendering`, comme un assemblage échoué réel. La sonde finale réussit sans modification du contrat ou des protections serveur.

Journaux, JSON et captures sous `evidence/local/quota-sidebar/` et `evidence/local/workflow-ui/`, ignorés par Git. La suite complète de 184 tests avait réussi pour la maintenance précédente ; cette modification utilise les contrôles ciblés ci-dessus et ne revendique pas une nouvelle exécution complète. Serveur de recette 8790 arrêté après les contrôles, port libre confirmé ; serveur utilisateur préexistant conservé. `git diff --check` réussi.

## Publication et coût

`pnpm exec wrangler deploy --config apps/web/wrangler.staging.jsonc --keep-vars --strict` : Worker web existant, version **4524e41f-4932-48cd-a7ad-29060374f107**, publié sur `bienvu.online`. Variables et bindings conservés, aucun changement du pipeline Containers.

Contrôles réels après publication : version active confirmée via Cloudflare ; `/` et `/historique` répondent 200 ; solde D1 relu à **2 vidéos disponibles**. La page authentifiée d'Alex n'a pas été relue en production dans le navigateur : l'accès natif nécessitait des permissions indisponibles. Un rechargement de son studio doit afficher le nouveau compteur ; aucun mot de passe, cookie privé ou nouveau rendu n'a été demandé pour ce contrôle.

Aucun nouvel import, rendu, appel OpenAI/Google TTS, e-mail ou achat. Registre distant inchangé : base 29,40 € + imports 11,00 €, plus 0,05 € déjà provisionné hors registre = **40,45 € sur 50 €**, coupure à 45 € et marge **4,55 €** avant coupure. Le quota n'efface ni les provisions de coût ni les plafonds d'admission ; facture non rapprochée.
