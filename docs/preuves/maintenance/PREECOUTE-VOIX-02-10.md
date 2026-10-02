# Préécoute des voix enregistrées — 02/10/2026

## Comportement livré

Dans **Personnaliser → Voix et texte**, « Écouter un extrait » joue la voix sélectionnée parmi Aoede, Kore et Charon. Chaque voix utilise le même texte de démonstration, enregistré une seule fois. Le bouton permet d'arrêter l'écoute et chaque réécoute repart du début. Le changement de voix, la désactivation de la voix off ou la fermeture de l'onglet arrête le son. Une erreur de téléchargement affiche un message et permet de réessayer.

Les trois MP3 sont des assets publics versionnés dans `apps/web/public/audio/voice-previews/v1/`, avec leur manifeste. Ils ne contiennent aucune information utilisateur. `VoicePreview` utilise un lecteur HTML avec `preload="none"` ; aucune clé, synthèse, extraction d'annonce, narration personnalisée ou consommation de crédit vidéo n'est déclenchée à l'écoute. Le cache HTTP est `public, max-age=31536000, immutable` ; un changement des enregistrements doit utiliser une nouvelle version d'URL.

Fichiers principaux : composant `voice-preview.tsx`, catalogue `lib/voice-previews.ts`, intégration `video-customizer.tsx`, icônes/CSS et `_headers`. Le script opérateur `prepare-voice-previews.ts` reste local et séparé des bundles web/Workers. Son journal persiste avant chaque appel et interdit de rejouer une synthèse incertaine. Le mode `--replay` utilise les WAV existants sans authentification ni réseau ; les fichiers publics déjà créés doivent conserver leur empreinte.

## Enregistrements réels

Trois appels Google Cloud Text-to-Speech **réels**, un par voix française Chirp 3 HD, avec **117 caractères chacun** :

> Bonjour, voici un aperçu de ma voix. Avec BienVu, transformez les photos de votre bien en une visite qui donne envie.

| Voix | Durée décodée | MP3 | RMS décodé |
|---|---:|---:|---:|
| Aoede | 7,360 s | 89 324 octets | −21,38 dBFS |
| Kore | 7,280 s | 88 460 octets | −21,62 dBFS |
| Charon | 6,280 s | 76 364 octets | −17,27 dBFS |

FFmpeg/FFprobe Remotion existants : MP3 mono 24 kHz/96 kbit/s, décodage PCM non silencieux et durée proche du WAV original. La préparation finale produit **3 synthèses** ; sa reprise hors ligne produit **0 synthèse**, avec les mêmes hashes et les mêmes fichiers. Les WAV et journaux fournisseur restent privés dans `evidence/local/voice-previews/`, ignoré par Git. Seuls les échantillons applicatifs publics et le manifeste sont versionnés.

**Aucune écoute humaine nouvelle n'est déclarée validée.** Le lecteur navigateur décode et lit les trois vrais enregistrements ; cela ne remplace pas un avis humain sur leur timbre. Les écoutes précédentes validées par Alex ne sont pas attribuées à ces nouveaux extraits.

## Vérifications

- Typage web et scripts réussi ; contrôle des frontières **196 fichiers** réussi ; syntaxe de la sonde navigateur, build OpenNext et `git diff --check` réussis.
- Chrome **local puis site publié**, à **1536/390/320 px** : fichiers réels, durée décodée, temps de lecture qui avance, absence de téléchargement avant le clic, changement de voix sans chevauchement, arrêt à la désactivation et au changement d'onglet, réécoute et bouton Arrêter. Fin réelle du lecteur vérifiée sur ordinateur. Captures inspectées, aucun débordement horizontal.
- **Erreur de transport simulée localement**, distincte de la recette réelle : échec d'une requête MP3, message visible, puis réécoute du vrai fichier après rétablissement. Aucun fournisseur simulé présenté comme voix réelle.
- Zéro requête API d'écriture et zéro requête fournisseur dans la recette navigateur ; aucune génération vidéo ni inscription déclenchée. Le lien Orpi saisi sert uniquement à ouvrir Personnaliser dans l'interface visiteur, sans import réseau.
- Sur le port local 3031, les contrôles d'essai anonyme renvoient 403 car cette origine n'est pas autorisée ; cette recette ne valide pas l'authentification ou le parcours Turnstile. En ligne, l'interface visiteur fonctionne sans ces erreurs.
- Les trois fichiers publiés répondent **200 / audio/mpeg**, tailles et SHA-256 identiques aux assets locaux ; cache immutable et `nosniff` vérifiés. Requêtes conditionnelles avec ETag : **304**. Les requêtes Range reçoivent le fichier complet **200**, pas 206 : la lecture de ces petits fichiers est vérifiée, aucune prise en charge de Range n'est prétendue. Une première assertion exigeant 206 a été corrigée dans le contrôle opérateur sans modifier le produit.
- Accueil et connexion **200**, API admin visiteur **401**. Les **25 bindings**, secrets/variables et compatibilité du Worker sont identiques à l'instantané antérieur.

## Publication et budget

Web **`c159925c-5fad-4f0d-a411-d78c8f1b612a`** publié à **100 %** sur bienvu.online avec `--keep-vars`. Moteur vidéo, pipeline, quotas et capacité Containers inchangés. Le serveur local de cette recette est arrêté ; aucun conteneur n'a été lancé.

Provision globale **0,20 € enregistrée avant les appels**, comprenant 0,15 € de voix et 0,05 € d'infrastructure. Base octobre **30,25 → 30,45 €**, imports **6,50 €**, total **36,75 → 36,95 €**, marge **53,05 €** avant la coupure de 90 €, enveloppe 100 € conservée. Sous-journaux compris dans la provision globale, aucune double addition. Prix brut estimé des 351 caractères : **0,010530 USD avant gratuité**. Gratuité restante, facture et change non rapprochés ; aucune dépense d'achat nouvelle déclarée.

Le premier accès Cloudflare a échoué sur OAuth expiré **avant les synthèses**. L'authentification Wrangler a été rétablie, puis la provision enregistrée une seule fois. Trois synthèses réussies seulement ; les journaux des tentatives de préparation restent conservés. Aucun appel OpenAI ou Runway.

## Commandes exécutées et traces

```sh
pnpm --filter @bienvu/web typecheck
pnpm exec tsc -p tsconfig.tests.json
pnpm check:boundaries
pnpm exec tsx scripts/prepare-voice-previews.ts --check
# Après provision globale déjà enregistrée ; ne pas supprimer le journal :
pnpm exec tsx scripts/prepare-voice-previews.ts --real
pnpm exec tsx scripts/prepare-voice-previews.ts --replay
BIENVU_HOME_URL=http://localhost:3031 node scripts/probe-voice-previews-ui.mjs
pnpm build:web
pnpm exec wrangler deploy --config apps/web/wrangler.staging.jsonc --keep-vars
BIENVU_HOME_URL=https://bienvu.online node scripts/probe-voice-previews-ui.mjs
node --check scripts/probe-voice-previews-ui.mjs
git diff --check
```

Traces privées ignorées : `evidence/local/voice-previews/`, avec réservation, WAV, mesures, logs, captures, rapports navigateur et instantanés Cloudflare avant/après. Aucun commit/push pour cette maintenance.

Sources primaires consultées : [Google — Chirp 3 HD](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd), [tarifs Google TTS](https://cloud.google.com/text-to-speech/pricing), [Cloudflare — en-têtes des assets statiques](https://developers.cloudflare.com/workers/static-assets/headers/).
