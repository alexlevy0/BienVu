# BienVu — Du mandat au marketing

Film de lancement **v1.0.0**, 36 secondes, 1920 × 1080, 30 images/s, 16:9.

Le film suit une annonce du Rouret : import par lien, photos animées, voix française et avatar, éditeur, vitrine, formats et publications. Les photos, animations Runway, avatar HeyGen et extrait de voix proviennent de la vidéo autorisée `5641e717-c133-4852-9153-06c206d5919f`. Les interfaces présentées sont des compositions graphiques pour le film, et non des captures de sessions utilisateurs. Les autres images du catalogue proviennent des visuels de démonstration du site.

La musique **BienVu Momentum** est une composition instrumentale originale synthétisée localement en Python/NumPy, à 120 BPM, sans échantillons musicaux tiers. Le montage suit la même horloge : chaque temps dure 15 images. La musique baisse pendant l'extrait parlé ; l'extrait s'arrête dans le silence après la première phrase, avant la suivante. Aucune nouvelle génération IA ni API payante n'est nécessaire.

## Fichiers

- `campaigns/2026-10-launch.json` : chronologie, durée, version et référence source.
- `src/scenes.tsx` : les sept scènes du montage et leurs animations déterministes.
- `src/design.tsx` : identité graphique, logo, polices et éléments réutilisables.
- `scripts/compose-music.py` : composition et mixage de la musique originale.
- `campaigns/assets-provenance.json` : empreintes SHA-256 des médias utilisés, sans adresse de stockage privée.
- `renders/BienVu-marketing-v1-1080p.mp4` : fichier de livraison H.264/AAC.
- `renders/delivery.json` : validation du format et empreinte de la livraison.

Les médias privés, la musique dérivée, le bundle et les rendus sont exclus de Git. Le code, le scénario et la recette musicale sont versionnables. Conserver le dossier local ou son archive de production pour retrouver exactement les médias et la livraison.

## Reproduire

Depuis la racine du dépôt, avec Node 24 et pnpm :

```sh
pnpm install --frozen-lockfile
NODE_OPTIONS=--dns-result-order=ipv4first node apps/marketing-video/scripts/fetch-source.mjs
python3 apps/marketing-video/scripts/compose-music.py
pnpm --filter @bienvu/marketing-video typecheck
pnpm --filter @bienvu/marketing-video studio
pnpm --filter @bienvu/marketing-video render --stills
pnpm --filter @bienvu/marketing-video render
```

La récupération des médias requiert l'authentification Cloudflare Wrangler existante du projet et un accès en lecture à ses médias privés. Le script réutilise les fichiers locaux dont l'empreinte est correcte. Le script musical requiert NumPy ; un Python avec NumPy est également fourni par le runtime local Codex. Le rendu local utilise Chrome sur macOS ; pour une autre installation, définir `REMOTION_BROWSER_EXECUTABLE`.

Les polices Inter Tight et Newsreader, leurs licences OFL et la texture sont reprises des ressources existantes du site. Le film reste indépendant des applications web, pipeline et renderer de production.
