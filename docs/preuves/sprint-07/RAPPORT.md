# Sprint 07 — parcours durable validé sur Cloudflare

Recette le 28 septembre 2026 UTC, clôture dans la nuit du 28 au 29 septembre à Paris. Sprint terminé sous accès de développement contrôlé. L'essai public et les abonnements restent au sprint 08. [Suivi](../../SUIVI.md) · [Architecture et commandes](../../GENERATIONS.md).

## Résultat livré

Une soumission URL lance l'import, la rédaction, la voix puis le rendu sans confirmation intermédiaire. Une annonce manuelle sauvegardée peut aussi lancer ce parcours. Le navigateur consulte les étapes persistées ; le traitement continue après sa fermeture. L'historique permet de lire et télécharger le même MP4 privé pendant sept jours.

L'agence provient de la session, les crédits d'une allocation serveur et la marque d'un snapshot figé. L'admission réserve atomiquement quota, budget et intention de lancement. Le Workflow a un identifiant stable. Les checkpoints évitent de refaire les appels déjà validés ; les résultats tardifs ne rouvrent pas un échec et ne deviennent pas accessibles après restitution d'un crédit.

Fichiers principaux : contrat `packages/contracts/src/generation.ts`, migration `0014_generation_workflow.sql`, accès D1 `packages/db/src/generation.ts`, `generation-worker.ts` et `generation-import.ts` dans le pipeline, annulation dans `video-coordinator.ts`, routes privées et composants de génération/historique dans le web. Configurations et sondes opérateur documentées dans le guide. La migration est appliquée à la D1 applicative et à la base isolée de recette sans remise à zéro.

## Deux vidéos réellement produites à distance

Une campagne isolée dispose de deux crédits et d'une provision globale de 3,50 € réservée avant les appels. Elle protège les données et compteurs de la base principale ; ses dépenses restent incluses dans le budget global. Workers, Workflow, D1, R2 et Containers sont réels, tout comme les appels OpenAI et Google. Aucune exécution locale de Remotion n'est présentée comme un rendu hébergé.

| Mesure | URL d'agence réelle | Annonce manuelle synthétique |
|---|---|---|
| Entrée | [Century 21, annonce 16965965448](https://www.century21.fr/trouver_logement/detail/16965965448/) | Annonce sauvegardée avec photos synthétiques |
| Admission UTC | 21:42:35.401 | 21:46:16.629 |
| Vidéo prête UTC | 21:45:56.970 | 21:49:27.020 |
| Temps total | 201,569 s | 190,391 s |
| Rendu et vérification | 164,165 s | 159,056 s |
| MP4 | 2 837 898 octets | 7 008 391 octets |
| Fournisseurs | 1 OpenAI + 5 Google | 1 OpenAI + 5 Google |
| Format | 20,054 s, 600 frames, 1080 × 1920, H.264/AAC, faststart | Identique |

L'import Century 21 a ramené sept photos : huit requêtes, 513 798 octets source, sans Browser Run. Les filigranes présents dans les photos source sont conservés. Les crédits de recette ont le droit de sortie payé, donc pas de filigrane BienVu ; le filigrane d'essai reste démontré au sprint 06.

La seconde entrée a été préparée par la sonde dans D1/R2, puis soumise par la vraie API web authentifiée avec `listingId`. Ce test démontre la génération depuis une annonce manuelle enregistrée ; il ne constitue pas une nouvelle recette complète du sélecteur de fichiers. L'upload manuel hébergé a été recetté au [sprint 03](../sprint-03/CLOUDFLARE.md). Le formulaire dépliable, la description et sa disposition sont à nouveau inspectés à 1440 et 390 px.

Empreintes SHA-256 des MP4 :

```text
URL    5d01ce19a8267e79eba8fec490036bbfafa91156b6500e5e5512bf4b1d66ba27
Manuel 156d4b7f81522cdfb7b154a690c2d6bb2548bb493f7d731993d1926dbda56b01
```

## Lecture, accès et reprise réels

- Les deux fichiers sont lus entièrement depuis l'historique authentifié en Chromium ordinateur et mobile émulé : 600 frames, audio décodé, fin atteinte, pas de débordement de page. Le MP4 URL perd dix frames sur ordinateur, zéro sur mobile ; le manuel zéro dans les deux modes. Captures inspectées visuellement. Aucun test sur téléphone physique ou Safari/iOS revendiqué.
- Alex confirme « Oui, image et voix sont bonnes » à la question portant sur textes, voix et carte finale du nouveau MP4 URL Cloudflare. Cela clôt la réserve humaine du renderer du sprint 06 ; ce n'est pas une nouvelle lecture du premier export d'essai ni une validation humaine séparée du MP4 manuel.
- GET/HEAD 200, Range 206, plage invalide 416, téléchargement avec la même empreinte. Sans connexion 401 ; autre agence 404 pour statut/vidéo, historique vide. Champs client étrangers 422, origine étrangère 403, crédits épuisés 429.
- Même clé et même entrée : même job, sans second crédit ni appel fournisseur. Même clé avec une autre entrée : 409. Le Worker est redéployé pendant le premier rendu ; le Workflow termine et ne produit qu'un résultat.
- Les deux Workflows sont `complete`. Allocation : deux consommés, zéro réservé ; journal : douze appels fournisseurs et deux tentatives de rendu. Le conteneur est ensuite `stopped`, slot libre.
- Après fermeture de la campagne : nouvelle admission 503, rejeu connu 202 avec le même job, anciennes vidéos lisibles. Compteurs strictement inchangés avant/après ces vérifications. Le verrou D1 et le drapeau du Worker sont désactivés ; le champ `paused` du contrôleur vidéo reste faux, il n'est pas utilisé comme preuve de cette fermeture.

## Tests locaux et pannes injectées

`pnpm check` final : **158 tests, 158 réussis**, TypeScript des applications/packages et tests, frontières sur **110 fichiers**. `pnpm build:web` OpenNext réussi. Les bases D1/R2, Durable Objects et Workflow sont exécutés par workerd local, avec fournisseurs et MP4 **simulés**, sans réseau payant.

Couverture nouvelle : concurrence à l'admission, clé rejouée/modifiée, droit serveur, quota et budget atomiques, isolation, objets photos absents, lecture privée par plages, expiration, pause, restitution/consommation unique, résultat tardif et annulation. Une annulation ancienne ne peut pas arrêter le rendu d'un autre job ; une annulation dont l'arrêt est incertain conserve le slot.

Deux fenêtres d'interruption sont reproduites : admission persistée avant lancement, puis arrêt du runtime après upload du MP4 avant publication. La réconciliation de l'application récupère l'intention ou l'artefact après redémarrage, sans nouveau fournisseur ni crédit supplémentaire. Miniflare ne démontre pas à lui seul un réveil automatique du moteur Workflow après redémarrage : le test appelle explicitement le réconciliateur. La résistance au redéploiement est aussi observée séparément sur le vrai service Cloudflare.

Le plafond d'import déjà atteint est vérifié avant réservation d'une génération URL. Un test local manipule son propre compteur fixture ; aucun compteur distant n'est réinitialisé.

## Budget

Provision globale précédente **26,35 €**, ajout **3,50 €**, total **29,85 € sur 40 €**. Marge **10,15 €**, dont **5,15 € avant coupure à 35 €**. Décomposition de la campagne : texte/voix 1,40 €, rendu 1 €, import 0,50 €, marge infrastructure 0,60 €. Les réservations des sous-journaux sont incluses, pas ajoutées deux fois, et restent comptées après échec.

Pour les deux succès, coûts fournisseurs estimés avant gratuité : OpenAI **0,002964 USD**, Google **0,01626 USD**, total **0,019224 USD**. Le dernier cycle du conteneur dure 168,82 s, soit une borne brute de calcul de **0,0060505088 USD pour ce cycle seulement**. Ce montant n'est ni le coût complet des deux rendus, ni une facture. CPU Workflows, stockage, requêtes, réseau et taxes sont couverts prudemment par la provision ; facture et gratuité restante restent à rapprocher.

Sur la base principale, 2 385 centimes de base + 600 centimes d'import = 2 985. Les dix imports du 28/09 UTC et onze du mois sont conservés. Aucun achat ni nouveau crédit API acheté pendant cette tranche.

## État déployé et limites

Le parcours est sur [bienvu.online/generer](https://bienvu.online/generer), service privé `bienvu-generation-development`. Version pipeline finale `a9e3b5bd-a8d2-4427-a8c0-033d26aa33ef`, web `3767a775-b666-45c1-a648-28f943103bcb`. Accueil/générer/historique 200, API anonymes 401 après déploiement. OAuth, e-mails, domaine et données existantes conservés.

L'agence d'Alex dispose d'**un crédit de développement**, zéro réservé/consommé à la clôture, valable sept jours. Il réserve au plus 1,70 € à son utilisation avec import URL ; aucun coût de génération n'a été ajouté pour cette seule attribution. L'essai public n'est pas attribué et Stripe reste fermé. La nouvelle campagne isolée est désactivée ; le crédit applicatif d'Alex reste actif.

La limite d'import de la base principale est atteinte et Alex n'a pas d'annonce sauvegardée à réutiliser. Les nouveaux imports reprennent le **29 septembre à 02:00, heure de Paris** (00:00 UTC), sous réserve du plafond mensuel de trente. L'interface affiche cette attente et l'API URL refuse avant de réserver le budget vidéo. Une saisie manuelle nouvelle reste aussi soumise au plafond d'import.

Restent distincts de la clôture : téléphone physique/Safari, facture TTC complète, réserve Bien'ici 04.3, essai unique et abonnements au sprint 08, purge physique des anciens médias et exploitation commerciale au sprint 09. Une annonce Century 21 réussie ne valide pas tous les portails.

## Reproduction et traces

Commandes exécutées : tests ciblés puis `pnpm check`, `pnpm build:web`, migrations/deploy Wrangler, `probe:generations` (`init`, `deploy`, `seed`, `enable`, `web`, `run url`, `status`, `pause`), `probe-generation-web.mjs` (`manual`, `verify`, `browser`, `form`), déploiement contrôlé via `deploy-generations-development.mjs`, vérifications finales D1/HTTP. Ne pas rejouer les admissions réelles pour simplement relire les preuves.

Traces privées ignorées : `evidence/local/sprint-07/` et `evidence/remote/sprint-07/` : tests/build, admissions, téléchargements, lecture, captures, réponse humaine, réconciliation, coûts et fermeture. Secrets et sessions restent dans `.secrets/` ; configurations distantes ignorées. Aucun commit/push dans cette tranche ; le prochain push doit être vérifié par la CI.

Vérifications de clôture : `git diff --check`, syntaxe des sondes, 299 liens relatifs valides, 372 fichiers candidats Git (366 textuels) sans correspondance avec les secrets configurés. Aucun conteneur Docker actif ; les navigateurs de recette sont fermés.
