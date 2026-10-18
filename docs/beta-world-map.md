# Carte des créations sur Beta

La section n’est montée que sur `/beta`. Elle utilise le SDK MapLibre déjà présent, chargé à proximité de la section, et un fond Natural Earth local sans fournisseur de tuiles ni clé API. La page d’accueil principale ne monte pas cette carte.

`GET /api/beta/world` regroupe les générations terminées qui disposent d’une position confirmée enregistrée pendant la création (manifeste, résolution de carte ou choix explicite). Les coordonnées publiques sont arrondies au dixième de degré ; les adresses et identifiants des comptes ne sont pas renvoyés. Les compteurs concernent uniquement ces vidéos géolocalisées, pas l’ensemble des générations.

Les aperçus proviennent des sélections actuellement publiées de la homepage, des vidéos de vitrines encore publiques et valides, et des comptes explicitement autorisés dans `beta_world_map_contributors`. Cette table est vide à la migration. L’accord doit venir du propriétaire de l’agence ; un changement de propriétaire suspend automatiquement cet accès. Les nouvelles vidéos de ce compte sont incluses tant que son accord reste actif.

Le lecteur d’un contributeur revalide à chaque requête l’accord, la propriété, le statut terminé, la conservation, le droit au master et l’objet R2. Il accepte les requêtes partielles et HEAD sans rendre publiques les clés R2. Le poster correspond exclusivement à la première photo du manifeste immuable. Ces réponses ne sont pas mises en cache.

Pour retirer l’accord d’une agence, passer son champ `enabled` à `0`. Les lectures via `/api/beta/world/videos/:id` sont alors refusées immédiatement. Les copies publiées indépendamment sur la homepage ou une vitrine restent gouvernées par leur propre publication.

Le fond est versionné dans `apps/web/public/maps/world-110m.geojson`. `node scripts/prepare-world-map.mjs` permet de le renouveler ; le fichier voisin conserve sa provenance et l’empreinte de la source. Les données Natural Earth sont dans le domaine public.
