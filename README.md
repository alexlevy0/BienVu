# BienVu

SaaS immobilier en construction : un lien d’annonce ou une saisie avec photos → une vidéo verticale avec voix off, aperçu et téléchargement, sans éditeur vidéo. Les décisions produit restent dans [docs/CADRAGE.md](docs/CADRAGE.md).

**Sprints 02–03 : comptes et imports vérifiés sur Cloudflare.** Connexions e-mail et Google, même agence, marque persistante et isolation validées. Trois annonces réelles importées avec 12/11/7 photos et descriptions ; saisie manuelle et fallback JavaScript vérifiés séparément sur fixtures. [Guide des imports](docs/IMPORTS.md) · [Rapport Cloudflare](docs/preuves/sprint-03/CLOUDFLARE.md) · [Bilan des sprints](docs/BILAN-SPRINTS.md).

[Site de développement](https://bienvu.online) · [Importer ou saisir une annonce](https://bienvu.online/generer) · [Connexion](https://bienvu.online/connexion). Plafonds de recette : cinq imports par jour UTC, toutes agences confondues, et budget suivi. La vidéo produit, les paiements et l'essai public restent à construire. Le MP4 technique du sprint 00 est validé, son renderer reste en pause ; facture à rapprocher.

## Démarrer localement

Prérequis : Node **24.17.0**, pnpm **10.33.2**. Aucun Docker ni secret Cloudflare/OpenAI nécessaire aux fondations. Docker sert uniquement à la recette de rendu Linux du sprint 00.

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm fixtures
pnpm --filter @bienvu/web typegen
pnpm --filter @bienvu/pipeline typegen
pnpm check
pnpm db:migrate
pnpm build:web
pnpm preview
```

Dans un second terminal : `pnpm probe:foundations`, puis `pnpm probe:web` et `pnpm probe:accounts`. L’accueil public est sur `http://localhost:8787` et la vue d’ensemble du studio sur `http://localhost:8787/studio`. Le build est exécuté par **workerd**. Les sondes vérifient les pages, le refus des générations, puis D1/R2 et le cookie opérateur, et nettoient leurs objets. Les tests D1 locaux couvrent aussi les clés d'agence, les contraintes et le rollback ; la sonde comptes vérifie sessions et isolation avec des identités synthétiques, sans valider Google OAuth réel ni le pipeline métier complet.

Pour importer une vraie annonce en local, lancer `pnpm dev:imports` dans un second terminal puis utiliser `/generer` après connexion. Pour la recette synthétique, arrêter ce pont puis lancer `pnpm probe:imports` : la sonde démarre son propre transport sans réseau extérieur. Les deux modes sont distincts ; [limites, sécurité, nettoyage et recette réelle](docs/IMPORTS.md).

Sous l’import par URL, **Saisir mon annonce manuellement** permet aussi d’enregistrer les informations du bien et 3 à 12 photos. En local, ce parcours utilise le pont Node ; sur Cloudflare, un conteneur privé prépare les images ; [guide de saisie et vérifications](docs/SAISIE-MANUELLE.md).

Pour travailler seulement sur l'interface : `pnpm dev` (`http://localhost:3000`). Ne pas exécuter le build et TypeScript simultanément : Next régénère ses types. Guide détaillé, bindings, arrêt des générations et reproduction depuis une copie propre : [DEVELOPPEMENT.md](docs/DEVELOPPEMENT.md).

## Vidéo locale

Le chemin natif fonctionne sur ce Mac sans Docker. Sur macOS, le lanceur utilise les binaires FFmpeg/FFprobe déjà fournis par Remotion ; sur Linux, ils doivent être installés dans le système.

```sh
pnpm fixtures
pnpm --filter @bienvu/renderer bundle
pnpm render:local local-short short
pnpm render:local local-target target
# Service HTTP asynchrone, puis sonde dans un second terminal :
pnpm serve:renderer
node scripts/probe-render-server.mjs
```

Les variables facultatives `BIENVU_FFMPEG_PATH` et `BIENVU_FFPROBE_PATH` permettent des exécutables absolus personnalisés. Le contrôle audio décode la piste AAC en WAV/PCM et mesure son niveau RMS ; l'écoute humaine du signal de test reste distincte.

Pour vérifier la cible Linux amd64 :

```sh
docker build --platform linux/amd64 -t bienvu-renderer:sprint-00 -f apps/renderer/Dockerfile .
mkdir -p evidence/local/renderer
docker run --rm --platform linux/amd64 --cpus=1 --memory=6g \
  -v "$PWD/evidence/local/renderer:/app/evidence/local/renderer" \
  bienvu-renderer:sprint-00 pnpm --filter @bienvu/renderer render local-short short
docker run --rm --platform linux/amd64 --cpus=1 --memory=6g \
  -v "$PWD/evidence/local/renderer:/app/evidence/local/renderer" \
  bienvu-renderer:sprint-00 pnpm --filter @bienvu/renderer render local-target target
```

Les sorties MP4 et JSON sont dans `evidence/local/renderer/`. Images géométriques et signal sonore générés localement ; aucun TTS ni photo d'annonce. Le code vérifie H.264/AAC, 1080×1920, 30 fps, durée, volume sonore et SHA-256.

Le service Node accepte aussi des jobs via `POST /jobs`, renvoie `202`, puis expose leur statut et leur fichier. Le contrôleur Worker ajoute une réservation persistante, un seul slot, R2 privé et une mise en sommeil après 30 s sans travail actif.

## Organisation

| Dossier | Rôle |
|---|---|
| `apps/web` | Next.js + OpenNext, coque produit, laboratoire et sondes protégées |
| `apps/pipeline` | Worker Browser Run, contrôleur Containers et limites du sprint |
| `apps/importer` | Transport HTTPS à IP épinglée et Sharp, Container Cloudflare privé |
| `apps/renderer` | Node/Linux, Remotion, FFmpeg, HTTP asynchrone |
| `packages/contracts`, `packages/importers`, `packages/video` | Schémas, extraction bornée et composition synthétique |
| `packages/db` | Migrations D1 métier, accès limités par agence, journal de coûts et pause |
| `packages/observability` | Identifiants de requête et journaux sur liste blanche |
| `scripts`, `tests`, `fixtures` | Commandes reproductibles et tests sans API payante |
| `docs/preuves/sprint-00` | Rapports et procédure versionnés ; sorties brutes conservées localement |
| `docs/preuves/sprint-01` | Contrôles locaux, limites et inspection de l'interface |
| `docs/preuves/sprint-02` | Sessions, marque et isolation locales ; e-mails et connexion Google réels validés |
| `docs/preuves/sprint-03` | Imports privés, sécurité, fixtures et trois sources réelles depuis le poste |
| `evidence/local`, `evidence/remote` | Sorties datées, ignorées par Git |

Les documents initiaux restent dans `docs/` pour conserver leurs liens. Les versions directes sont exactes et les dépendances transitives figurent dans `pnpm-lock.yaml`.

Voir [le suivi](docs/SUIVI.md), [l'ADR](docs/adr/0001-hebergement-sprint-00.md) et [la procédure de vérification](docs/preuves/sprint-00/PROCEDURE.md).
