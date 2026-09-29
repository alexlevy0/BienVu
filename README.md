# BienVu

SaaS immobilier en construction : un lien d’annonce ou une saisie avec photos → une vidéo verticale avec voix off, aperçu et téléchargement, sans éditeur vidéo. Les décisions produit restent dans [docs/CADRAGE.md](docs/CADRAGE.md).

**Sprints 02–03 : comptes et imports vérifiés sur Cloudflare.** Connexions e-mail et Google, même agence, marque persistante et isolation validées. Trois annonces réelles importées avec 12/11/7 photos et descriptions ; saisie manuelle et fallback JavaScript vérifiés séparément sur fixtures. [Guide des imports](docs/IMPORTS.md) · [Rapport Cloudflare](docs/preuves/sprint-03/CLOUDFLARE.md) · [Bilan des sprints](docs/BILAN-SPRINTS.md).

[Site de développement](https://bienvu.online) · [Importer ou saisir une annonce](https://bienvu.online/generer) · [Connexion](https://bienvu.online/connexion). Plafonds de recette : dix imports par jour UTC et trente par mois, toutes agences confondues, et budget suivi. Le parcours vidéo durable est validé sur Cloudflare et déployé sous accès de développement (un crédit pour Alex). Les paiements et l’essai public restent au sprint 08. Les dix imports du 28/09 UTC sont consommés : reprise le 29/09 à 02:00 Paris. [Parcours, budget et limites](docs/GENERATIONS.md). Le MP4 technique du sprint 00 est validé, son renderer reste en pause ; facture à rapprocher.

## Démarrer localement

Prérequis : Node **24.17.0**, pnpm **10.33.2**. Aucun Docker ni secret Cloudflare/OpenAI nécessaire aux fondations. Docker sert aux recettes Linux du renderer et du transport d’import ; les tests unitaires et le rendu natif local restent utilisables séparément.

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

## Vidéo locale et parcours Cloudflare

**Sprint 05 terminé : texte et voix validés sur Cloudflare.** Le Worker a produit cinq scènes avec les vrais fournisseurs OpenAI et Chirp 3 HD, puis relu le script D1 et les pistes R2 privées. Reprise après redéploiement sans nouvel appel ; assemblage naturel de 20 s approuvé par Alex. Recette sur annonce synthétique, Worker ensuite remis en pause. Le sprint 06 assemble cette narration en vidéo ; le parcours durable est validé au sprint 07, sous accès de développement. [Guide narration et commandes](docs/NARRATION.md) · [Configuration Google](docs/VOIX-GOOGLE.md) · [Preuves Cloudflare](docs/preuves/sprint-05/CLOUDFLARE.md).

`pnpm probe:narration --mock` et `pnpm probe:narration:worker` fonctionnent sans API payante. L'essai réel est réservé à l'opérateur après configuration des secrets et du budget ; `pnpm probe:narration --replay` relit le résultat enregistré en interdisant les appels fournisseurs.

**Sprints 06 et 07 terminés.** Vidéo de 20 secondes avec photos, marque, voix, sous-titres, conclusion et droit au filigrane figé côté serveur. Deux nouveaux MP4 entièrement produits sur Cloudflare, accessibles depuis l’historique privé et téléchargeables ; image et voix du MP4 URL approuvées par Alex. **158 tests**, types et build réussis ; lecture desktop/mobile émulé. Facture et appareil physique non vérifiés. [Recette du parcours](docs/preuves/sprint-07/RAPPORT.md). [Guide vidéo](docs/VIDEO.md) · [Preuves et limites](docs/preuves/sprint-06/RAPPORT.md).

Pour les fixtures utilisant les WAV privés déjà validés :

```sh
pnpm fixtures:video
pnpm --filter @bienvu/renderer bundle
pnpm render:video evidence/local/sprint-06/job-video-trial
pnpm render:video evidence/local/sprint-06/job-video-paid
pnpm preview:video
```

Les tests CI ne dépendent pas de ces WAV privés : ils utilisent leurs propres fixtures sans fournisseur. Les commandes historiques ci-dessous concernent le modèle technique du sprint 00.

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
| `packages/contracts`, `packages/importers`, `packages/video` | Schémas, extraction bornée, composition produit et fixtures explicites |
| `packages/db` | Migrations D1 métier, accès limités par agence, journal de coûts et pause |
| `packages/narration`, `packages/voice` | Script factuel, connecteurs OpenAI/Google, mesure audio portable et timing |
| `packages/observability` | Identifiants de requête et journaux sur liste blanche |
| `scripts`, `tests`, `fixtures` | Commandes reproductibles et tests sans API payante |
| `docs/preuves/sprint-00` | Rapports et procédure versionnés ; sorties brutes conservées localement |
| `docs/preuves/sprint-01` | Contrôles locaux, limites et inspection de l'interface |
| `docs/preuves/sprint-02` | Sessions, marque et isolation locales ; e-mails et connexion Google réels validés |
| `docs/preuves/sprint-03` | Imports privés, sécurité, fixtures et trois sources réelles depuis le poste |
| `evidence/local`, `evidence/remote` | Sorties datées, ignorées par Git |

Les documents initiaux restent dans `docs/` pour conserver leurs liens. Les versions directes sont exactes et les dépendances transitives figurent dans `pnpm-lock.yaml`.

Voir [le suivi](docs/SUIVI.md), [l'ADR](docs/adr/0001-hebergement-sprint-00.md) et [la procédure de vérification](docs/preuves/sprint-00/PROCEDURE.md).
