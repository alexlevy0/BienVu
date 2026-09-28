# ADR 0002 — Import fonctionnel local, transport Cloudflare fermé

Date : 28 septembre 2026. Statut : retenu pour la tranche locale du sprint 03 ; choix du transport de production non arrêté.

## Contexte

Les URL d’annonce sont fournies par un utilisateur authentifié, mais restent arbitraires. Le sprint exige de refuser une destination dont la sûreté n’est pas démontrée. Alex a demandé de poursuivre en local en attendant Workers Paid ; l’hébergement cible reste Cloudflare autant que possible.

## Constats documentaires

- [Guardrails Browser Run](https://developers.cloudflare.com/browser-run/features/guardrails/) : restrictions de domaines. Cette capacité ne prouve pas à elle seule la classification et l’épinglage des IP de chaque connexion.
- [Request Workers](https://developers.cloudflare.com/workers/runtime-apis/request/) : `resolveOverride` dépend de restrictions de zone ; ce n’est pas un mécanisme générique d’épinglage des IP pour les annonces arbitraires.
- [Limitations Workers](https://developers.cloudflare.com/workers/platform/known-issues/) : un `fetch` vers une IP n’est pas une substitution générique utilisable ici.
- [HTTPS Node](https://nodejs.org/api/https.html) : transport natif permettant un `lookup` contrôlé, avec nom TLS et certificat vérifiés. La mise en œuvre est exercée localement.

## Décision

Conserver extraction et orchestration TypeScript portables. Ajouter un outil Node **de développement**, HTTPS/IP épinglée et Sharp, accessible au Worker local par un pont loopback authentifié. Aucun nouvel hébergeur, proxy externe ou service payant. Configurations versionnées et staging : `IMPORT_MODE=disabled`.

Le fallback Browser Run préparé requiert le même contrat de transport sûr et remplit les réponses interceptées ; il reste non branché. Les tests injectés démontrent la fermeture du cycle de vie local, pas le comportement réel du navigateur hébergé.

## Conséquences

Le parcours local, les imports réels depuis le Mac, D1/R2 privés, l’isolation et la purge peuvent être livrés et mesurés. La recette ne prouve pas l’accès depuis Cloudflare, l’hydratation JavaScript ni la consommation CPU du décodage dans Workers. Ces points restent explicitement ouverts dans [IMPORTS.md](../IMPORTS.md#cloudflare--vérification-restante), sans publier une fausse réussite de sécurité. La contrainte Cloudflare ne change pas ; le pont local n’est pas une architecture de production implicite.
