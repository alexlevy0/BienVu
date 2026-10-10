# Favoris personnels des avatars — 11 octobre 2026

Sur `/avatar`, les utilisateurs connectés disposent d’un cœur en haut à droite de chaque portrait : contour pour un avatar ordinaire, cœur plein pour un favori. Le bouton est accessible au clavier, annonce son état et attend la confirmation du serveur. L’ajout et le retrait sont idempotents ; une erreur conserve le dernier état confirmé avec une action de reprise.

Les favoris sont personnels au compte Better Auth, indépendants de l’agence active. Ils sont enregistrés en D1 et restent disponibles après rechargement et sur un autre appareil. La galerie publique conserve son ordre stable et son défilement infini. Le sélecteur partagé par « Personnaliser » et l’Éditeur place les favoris en tête et les identifie visuellement ; l’ordre relatif du catalogue, l’avatar par défaut et les sélections existantes sont conservés.

La migration additive `0068_avatar_favorites.sql` crée une table avec clé composée utilisateur/avatar et suppressions en cascade. L’API `/api/avatars/favorites` accepte GET et PUT, exige une session vérifiée et déduit l’utilisateur exclusivement de cette session. Toute mutation exige l’origine BienVu et un corps JSON strict et borné. Les réponses privées ne sont pas mises en cache. Les avatars privés, désactivés ou incompatibles avec les moteurs disponibles ne peuvent pas être ajoutés et sont exclus de la lecture des favoris.

Le contexte React est séparé du catalogue public partagé. Il charge les identifiants personnels une fois à l’identification du compte et synchronise les composants sans refaire un inventaire HeyGen. Il annule les requêtes lors d’un changement d’identité, ignore les anciennes réponses, efface immédiatement la visibilité des favoris à la déconnexion et réconcilie les modifications lors du retour sur l’onglet. Les portraits restent chargés à proximité de l’écran ; aucun extrait n’est téléchargé par la gestion des favoris.

## Vérifications locales

`tsx --test tests/avatar-favorites.test.ts tests/avatar-gallery.test.ts tests/avatar-catalog.test.ts` : **13 tests passent**. La nouvelle recette utilise les migrations réelles dans D1 Miniflare et des sessions Better Auth signées. Isolation entre deux comptes, ajout/retrait idempotents, compte non vérifié, session expirée, signature falsifiée, CSRF, usurpation du compte dans le corps, données invalides, volume borné, profils indisponibles, disparition des favoris désactivés et cascade à la suppression d’un compte. La partition stable des favoris conserve le catalogue public et son choix par défaut.

`node scripts/probe-avatar-favorites-ui.mjs` : vrais composants React à 1 536 et 390 px, identités et serveur de recette synthétiques. Ajout par cœur, persistance après rechargement, tri du sélecteur sans changement de sélection, filtres, favoris d’une page suivante, scroll automatique, échec d’écriture/reprise, écritures simultanées, réponses retardées lors d’un changement de compte et déconnexion. Aucun débordement ni erreur navigateur ; captures inspectées.

Les sondes existantes `probe-avatar-gallery-ui.mjs` (six largeurs de 320 à 1 536 px) et `probe-avatar-picker-ui.mjs` (desktop/mobile) passent : chargement progressif, survol prolongé, toucher, lecture silencieuse, arrêt, recherche, filtres, pagination/reprise et absence de téléchargement initial des vidéos. TypeScript contrats, base, web et tests validé ; build OpenNext et contrôles des frontières exécutés.

## Production

Avant migration, les bindings du Worker web, la configuration du renderer et le budget ont été sauvegardés dans les preuves privées ignorées. Le bookmark Time Travel D1 est conservé. La liste distante ne contenait que la migration 0068 ; son application a réussi (table, index et suivi de migration). Le code public précédent reste compatible avec cette table additive.

Build final, types web/tests et frontières sur **508 fichiers** validés. Préparation avec `pnpm prepare:web --config apps/web/wrangler.staging.avatar-favorites.jsonc`, puis déploiement du Worker final avec sa configuration `.open-next/posthog-worker/wrangler.jsonc`, `--keep-vars --strict`. Sourcemaps privées Next/Worker envoyées à PostHog. Version web **`2b4e44b0-6437-423f-b20b-e2eba4b69e31`**, **100 % du trafic**, **60 bindings conservés**, **330 assets sans sourcemap publique**. Chunk des favoris téléchargé et comparé aux octets construits ; table distante présente, lectures et écritures anonymes refusées avec 401 et `private, no-store`, galerie publique disponible avec ses 32 cartes serveur et sa pagination. Budget et configuration du renderer quatre cœurs comparés avant/après, identiques ; pipeline inchangé.

Recette réelle sur `bienvu.online` à 1 536 et 390 px avec `BIENVU_AVATAR_URL=https://bienvu.online node scripts/probe-avatar-gallery-ui.mjs` : scroll automatique, recherche/filtres, survol/toucher et absence de débordement passent. Huit/deux portraits téléchargés initialement, aucun extrait initial, captures publiées inspectées. Le cœur reste absent pour le visiteur déconnecté. Vérification distante conservée dans `production-proof.json`.

Les vérifications authentifiées d’ajout/retrait utilisent des fixtures locales ; aucune session cliente ni donnée de favoris de production n’a été fabriquée pour les tests. Aucun appel de génération HeyGen, Runway ou voix, aucune génération ou consommation de crédit BienVu.

Preuves ignorées : `evidence/local/avatar-favorites/`, `evidence/local/avatar-favorites-ui.log`, `evidence/local/avatar-favorites-build.log`, `evidence/local/public-avatars-scroll/favorites-regression.log`. Configuration opérateur : `apps/web/wrangler.staging.avatar-favorites.jsonc`. Retour arrière : rétablir la version précédente du Worker web ; garder la table additive et les préférences enregistrées.
