# Catalogue et aperçu des avatars — 09/10/2026

## Livré

Le sélecteur de Personnaliser et de l’Éditeur défile horizontalement, avec recherche, filtre par genre, flèches et navigation au clavier. Un survol de **800 ms** démarre la démonstration dans la carte, muette et en boucle. Un survol bref n’engage aucun téléchargement vidéo. La sortie de la carte annule le délai ou ferme l’aperçu automatique. Un bouton permet la lecture et l’arrêt au toucher. Un seul lecteur est monté, déchargé à sa fermeture ; passer l’onglet en arrière-plan l’arrête également.

**100 avatars studio publics compatibles Avatar III** sont activés, **50 féminins et 50 masculins**, parmi 200 presets administrés. Daphne reste le défaut. Le superadmin garde les activations individuelles et ajoute l’activation des résultats compatibles filtrés par lots de 100. Le catalogue admin affiche les résultats par groupes de 60 et utilise aussi les portraits progressifs et les extraits dans les cartes.

L’activation conserve la transparence réellement vérifiée, les restrictions de moteur, le supplément BienVu et les budgets. Les profils privés ne sont pas proposés. Les lignes fournisseur en attente ou en échec ne sont pas importées. Une génération n’est jamais demandée par le sélecteur ou par la préparation du catalogue.

## Chargement

Les doubles requêtes du catalogue sont supprimées : promesse partagée et cache navigateur de 30 secondes, désactivation de la requête interne quand le parent fournit le catalogue. Aucun catalogue utilisateur partagé entre Workers.

Les portraits sont chargés à proximité du défilement visible, avec dimensions réservées, décodage asynchrone et transition. **6 portraits** chargés au départ sur ordinateur et **3 sur mobile**, sur les 100 proposés dans la recette. Le script opérateur prépare les 100 portraits en WebP de 320 px : **6 619 956 → 738 534 octets**, soit **−88,8 %**. Il prépare aussi les 100 démonstrations, de huit secondes maximum, jusqu’à 320 px sans agrandir la source, sans audio et avec `faststart`. Les médias futurs non préparés peuvent utiliser le fichier fournisseur borné comme repli.

Les dérivés sont versionnés depuis la source dans le R2 existant, sous `catalogue/heygen`, sans toucher aux médias des vidéos clients. Les routes vérifient le preset public activé ou l’accès superadmin avant R2 ; ETag/304, HEAD et Range/206 évitent des transferts inutiles. Cache de cinq minutes pour les médias publics activés seulement ; erreurs et presets admin désactivés sans cache. Une ancienne image publique déjà en cache peut subsister cinq minutes après retrait. Les routes des clips des projets restent privées.

## Vérifications

- **5 tests de catalogue/média** : curseur, moteur et état fournisseur, défaut et visibilité, clés de dérivés, HEAD, Range/suffixe/416/If-Range, ETag/304, erreurs non cachées et média désactivé refusé sans session.
- Les **11 tests existants avatars/continu** passent : crédits, admission, avertissements, timing/audio/cache, isolation, réservations, reprises, remboursements et migrations. Leur exécution initiale était groupée avec le nouveau test d’authentification, dont la fixture D1 incomplète a été corrigée avant la réussite des cinq nouveaux tests.
- `node scripts/probe-avatar-picker-ui.mjs` : composants réels à **1536 et 390 px**, aucun téléchargement vidéo initial, un seul appel catalogue, survol bref annulé, survol prolongé réellement joué et muet, fermeture, toucher, recherche/sélection, filtres, chargement progressif au défilement et aucun débordement ni erreur JavaScript. Captures inspectées.
- Types web et tests, build OpenNext/TypeScript, frontières et `git diff --check` réussis. Les avertissements du bundle PNG préexistants restent sans rapport avec le sélecteur.

## Publication

Worker web **`bec2ea95-0fe7-4567-a951-e5a7cff0de34`** publié. Pas de migration ni de déploiement du renderer ou du pipeline nécessaire. L’opérateur garde une copie privée du catalogue avant changement et audite chaque activation/préparation sous l’identité du superadmin. Il ne modifie pas les réglages de dépenses.

Contrôle distant réussi : version à **100 %**, **56 bindings identiques**, défaut et moteur conservés, catalogue de 100 avatars, presets désactivés et API admin en **401** sans session, aucun défaut FK. Portraits Daphne/Bryce de **11 094/5 666 octets**, 320 px, ETag/304 ; extraits de **19 750/15 838 octets**, HEAD et Range/206 vérifiés. Le chunk **`4120-fd9772ca03aa362e.js`** publié correspond au build par SHA-256. Les composants réels ont également lu ces médias publics de BienVu dans le navigateur à 1536/390 px : démarrage, image visible, son coupé et arrêt contrôlés, sans téléchargement vidéo préalable ni débordement. Ces lectures publiques ne sont pas des générations client.

Traces privées dans `evidence/local/avatar-catalog-2026-10-09/` : catalogue et bindings avant modification, compteurs, poids, logs, tests, captures et contrôle distant. Les URLs source signées et les secrets restent hors Git. Aucun audio, vidéo client, message, publication sociale ou appel de génération HeyGen/Cartesia/OpenAI n’est créé par cette recette.

Pour retirer un avatar, décocher sa proposition dans le superadmin. Pour revenir à l’ancien choix, désactiver les presets ajoutés en conservant Daphne et Bryce ; les médias des vidéos existantes ne doivent pas être supprimés. Les dérivés de catalogue peuvent rester stockés sans être exposés par les routes des presets désactivés.

Références vérifiées : [catalogue HeyGen](https://developers.heygen.com/reference/list-avatar-looks), [API Workers R2](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
