# Séquence de carte

## Carte par défaut — 9 octobre 2026

Les nouvelles générations par URL, saisie manuelle ou essai sans compte ajoutent une carte **satellite**, de **4 secondes au début**, avec un zoom **12 → 14,5**. La carte est incluse dans la durée totale, sans crédit supplémentaire. Le superadmin règle l’activation, la vue (satellite, plan ou bâtiments 3D), l’emplacement, la durée et les deux zooms dans **Vidéos → Map par défaut**. Les modifications sont journalisées et soumises à une révision pour éviter qu’une sauvegarde écrase une autre modification.

La ville vérifiée de l’annonce est recherchée dans les communes du géocodeur IGN, sans supposer une adresse. Seul un résultat dont le nom correspond et dont la commune est unique est retenu ; une ville introuvable, ambiguë ou une panne cartographique omet la carte automatique et laisse la génération continuer. Les coordonnées restent arrondies pour cette localisation par ville. La carte personnalisée conserve son obligation de confirmation.

La réponse intermittente IGN `LayerNotDefined` sur la couche prévue bénéficie de deux reprises espacées. Les autres erreurs, redirections ou réponses excessives restent refusées ; aucune autre source n’est utilisée silencieusement.

Les réglages sont figés à l’admission, séparément du corps et du hash d’idempotence. La décision de localisation et les fonds sont préparés avant la narration et les animations payantes, puis conservés pour toutes les reprises du job. Un changement de réglages n’ajoute pas de carte aux vidéos historiques ou aux générations déjà admises. Les projets de l’éditeur conservent leur timeline ; une vidéo générée avec une carte la récupère lorsqu’on l’ouvre dans l’éditeur.

**Personnaliser → Carte** affiche la sélection automatique et permet de la désactiver (`mapDisabled` explicite), de modifier vue/zoom/durée/emplacement, ou de passer à un repère à confirmer. Les réglages automatiques particuliers (`mapAutomatic`) restent valides sans confirmation manuelle. Le calendrier de photos et les durées demandées à Runway utilisent la durée réellement réservée à la carte, y compris après son omission éventuelle.

Migration `0056_default_video_map.sql` : réglages globaux, journal immuable, paramétrage figé du job et résolution privée par agence. API publique `/api/video-defaults` pour le formulaire, API `/api/admin/video-map` réservée au superadmin avec contrôle d’origine et révision à la sauvegarde. Aucune nouvelle clé fournisseur ni modification du modèle Runway.

Tests `tests/default-video-map.test.ts`, `tests/video-maps.test.ts` et workflow local. `pnpm exec tsx scripts/probe-video-maps.ts --default-map --render` vérifie les deux formats avec des photographies aériennes IGN et des médias synthétiques, sans appel IA ni génération client. Le renderer existant supporte déjà ces vues et ces niveaux ; aucune modification de sa composition n’est nécessaire.

## Personnalisation manuelle et fonctionnement initial

Dans **Personnaliser → Carte**, choisir l’emplacement de la séquence (début ou fin) et sa durée (3 à 5 secondes, 4 par défaut). Pour un repère personnalisé, rechercher la ville ou une adresse, choisir le résultat, puis confirmer la localisation. Avant l’ajout de la carte automatique, le rendu standard restait sans carte.

Le style **Plan · sans satellite** est proposé par défaut. **Bâtiments en 3D** utilise les emprises et hauteurs connues de la BD TOPO pour créer des volumes sur une carte inclinée. La caméra avance de façon déterministe ; les bâtiments ne sont pas inventés. Une zone sans hauteur connue est signalée dans les réglages. Le troisième style, **Satellite · vue aérienne**, affiche des photographies aériennes BD ORTHO. Les niveaux de zoom au départ et à l’arrivée sont réglables ; les bâtiments 3D restent réservés au style en volume.

La carte est incluse dans les 20, 30 ou 40 secondes choisies, sans crédit supplémentaire. Les photos occupent le temps restant ; toutes restent présentes. La voix, les sous-titres et la musique gardent leur timing. L’éditeur conserve la séquence comme un plan de carte dans la timeline et la réutilise à l’export.

Une ville ou une rue est proposée comme zone approximative. Les coordonnées sont arrondies avant de préparer le fond partagé et le manifeste. Une adresse précise exige un résultat d’adresse ou un repère manuel confirmé. Le niveau de précision est expliqué dans les réglages ; aucun bandeau « Localisation approximative » n’est ajouté à l’image.

## Fond et moteur

- Recherche IGN : `https://data.geopf.fr/geocodage/search`.
- Fond Plan IGN : `https://data.geopf.fr/wms-r`, couche `GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2`, EPSG:3857, JPEG à deux fois les dimensions du rendu. PNG accepté si le service renvoie ce format. Réponse bornée à 8 Mo, dimensions et type vérifiés.
- MapLibre GL JS 6.12.0 est chargé seulement pour le repère interactif et l’aperçu 3D. Ses modules et son worker sont copiés depuis la dépendance verrouillée avant `dev`, `build` et `build:worker`, puis servis par BienVu. Aucun CDN externe.
- Bâtiments : `https://data.geopf.fr/wfs/ows`, couche `BDTOPO_V3:batiment`, seulement géométrie et hauteur, dans une zone de 900 m projetés autour du repère. Réponse bornée à 4 Mo et 2 000 bâtiments, coordonnées/anneaux/hauteurs validés. Aucun champ nominatif conservé, aucune hauteur de remplacement.
- L’export Plan anime une image préparée. La 3D charge le même fond et les bâtiments figés, ainsi que les modules MapLibre locaux, dans Chrome avec ANGLE (Swiftshader sur Linux sans GPU) ; caméra à la frame, une seule concurrence et attente des sources avant chaque frame. Le conteneur reste sans Internet. Les couleurs d’agence s’appliquent au repère, aux volumes et aux informations.
- Aucun crédit fournisseur imprimé sur la carte. La paternité IGN, les sources, la licence et la date de consultation sont conservées dans les métadonnées `copyright` et `comment` du MP4, y compris sa dérivée filigranée, et sous « Crédits cartographiques » dans les réglages. [Licence Ouverte 2.0](https://github.com/etalab/licence-ouverte/blob/master/LO.md), [Plan IGN](https://geoservices.ign.fr/planign), [BD TOPO](https://geoservices.ign.fr/bdtopo), [conditions IGN](https://cartes.gouv.fr/cgu).

## Conservation et limites

Migrations `0049_video_maps.sql` et `0050_map_buildings.sql`. D1 conserve les références, le type, les hashes et la date ; R2 garde le fond et, en 3D, la géométrie publique. Les caches Plan, 3D et Satellite sont séparés, sans repère, texte ou identité client. Le manifeste figé possède sa propre copie sous le préfixe privé du job. Les anciens JSON et hashes ne reçoivent aucun champ par défaut.

Les POST sont de même origine. Les limites sont atomiques dans D1 et indépendantes des imports et des crédits : 12 recherches/préparations par minute et IP pseudonymisée, 50 requêtes par minute et 1 000 par jour globalement, 300 nouveaux fonds par jour. Une réservation avec bail évite les téléchargements concurrents d’un même fond. Aucun texte de recherche ou IP brute n’est conservé dans ces compteurs. Les erreurs ne remplacent jamais silencieusement une carte personnalisée confirmée par un plan photo ; seule la carte automatique peut être omise avec un motif conservé.

## Vérification

`pnpm test` et `pnpm typecheck`. Les tests `tests/video-maps.test.ts` couvrent les droits de génération, le timing, la voix conservée, l’éditeur, les contrôles HTTP, le cache concurrent D1/R2 et les quotas. `pnpm exec tsx scripts/probe-video-maps.ts --render` prépare deux exports locaux (vertical au début, horizontal dans l’éditeur à la fin) avec de vraies cartes IGN et des médias synthétiques ; aucun appel IA ni job client. Preuves dans `evidence/local/maps/` (ignorées par Git).

Ajouter `--3d` au probe vérifie les mêmes formats avec les vrais bâtiments IGN ; preuves dans `evidence/local/maps-3d/`. Les crédits du MP4 sont inspectables avec `ffprobe -show_format`.

## Vue aérienne et zooms

Trois styles sont proposés dans Personnaliser → Carte : Plan, Bâtiments en 3D et Satellite · vue aérienne. Ce dernier utilise les photographies aériennes BD ORTHO de l’IGN (`ORTHOIMAGERY.ORTHOPHOTOS`), avec leurs crédits dans les métadonnées MP4 et les détails des réglages.

Les niveaux de zoom au départ et à l’arrivée se règlent de 12 à 18, par pas de 0,25 ou saisie numérique. Les valeurs basses cadrent plus largement. Des niveaux égaux donnent une vue fixe ; un départ plus élevé que l’arrivée produit un dézoom. Le départ 3D proposé est 15,5, avec une arrivée à 17. Les boutons « Voir le départ » et « Voir l’arrivée » placent l’aperçu au bon instant, même pour une séquence située à la fin.

Jusqu’à sept fonds raster locaux sont préparés selon la plage choisie. Ils partagent le cache par style, coordonnées, format et niveau, y compris pour un zoom inversé. Les réglages précis ne redéclenchent pas une requête s’ils restent dans les mêmes niveaux entiers ; les changements sont temporisés de 450 ms. La préparation télécharge au plus deux niveaux simultanément après le fond principal. La géométrie des bâtiments n’est téléchargée que pour le fond principal. L’aperçu affiche un état de chargement pendant le décodage des images ou la préparation 3D. Les fonds détaillés apparaissent progressivement et sont copiés dans les assets privés du manifeste ; le renderer fonctionne sans réseau. Aucune migration D1 supplémentaire n’est nécessaire.

Les champs de zoom restent facultatifs sans valeur par défaut dans les schémas : anciens manifestes et hashes inchangés, anciens rendus inchangés. Lorsqu’on ouvre les réglages d’une ancienne carte, les valeurs de la nouvelle interface sont enregistrées explicitement. Les tests couvrent aussi la couverture du fond à chaque frame, les zooms inversés et fixes, les limites, le cache des différents niveaux et le réexport privé.

`pnpm exec tsx scripts/probe-video-maps.ts --satellite --render` vérifie la vue aérienne dans les deux formats. `--3d --zooms --render` vérifie le départ 3D plus large ; `--satellite --zoom-out` vérifie le dézoom. Preuves dans `evidence/local/maps-satellite-zoom/`, `maps-3d-zoom/` et `maps-satellite-zoom-out/`.
