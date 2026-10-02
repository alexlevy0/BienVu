# Narration depuis la description et selon la durée — 02/10/2026

## Comportement livré

Les nouvelles vidéos de 20, 30 et 40 secondes utilisent la description enregistrée du bien pour sélectionner les informations utiles à la visite. La narration automatique respecte respectivement **40, 60 et 75 mots maximum**, avec des phrases complètes. Une durée supérieure autorise davantage d'informations sans obliger à remplir tout le temps par de la parole. Les photos continuent à couvrir la durée choisie ; les pistes ne sont ni accélérées ni coupées.

Le catalogue conserve les qualificatifs du texte source : garage en supplément, travaux à prévoir, cuisine pouvant s'ouvrir et négations. Une réserve identifiée sur l'état du bien est imposée dans la sélection finale. Mentions d'agent, immatriculation, appels au contact et instructions étrangères à l'annonce sont exclus. Les prix, surfaces et pièces issus des champs structurés priment sur les chiffres arrondis de la description. Sans passage exploitable, la narration utilise les faits disponibles et des transitions neutres.

OpenAI choisit des identifiants dans ce catalogue fermé, avec une sortie structurée stricte. Le serveur ajuste la sélection à la durée en retirant des phrases entières, contrôle les références et fixe les photos. Aucune caractéristique nouvelle n'est rédigée librement. Les informations du texte commercial restent des affirmations de leur auteur, pas une expertise de BienVu sur le bien.

Dans **Personnaliser → Voix et texte**, la proposition locale s'adapte aussi à la durée et à la description, gratuitement. Entrer dans ce panneau ne transforme pas la proposition automatique en narration imposée. Une narration modifiée par l'utilisateur est conservée lorsqu'il change la durée et est prononcée telle quelle ; une narration personnalisée trop longue échoue explicitement. « Reprendre le texte proposé » rétablit le mode automatique.

`description-copy/1` / `narration-fr/2` sont persistés avec la description, la durée et leur empreinte. Les snapshots `factual-copy/1`, `factual-copy/2` et les anciennes requêtes sans durée explicite conservent leur comportement et leur cache. Aucun ancien WAV ou MP4 n'est régénéré implicitement. Le bouton Voix off coupé conserve zéro appel Google.

## Vérifications locales sur fixtures

- **243 tests complets réussis**, dont cinq régressions spécifiques : extraits et qualificatifs, chiffres structurés prioritaires, propositions 20/30/40, identité et anciennes versions, narration personnalisée prioritaire, sélection raccourcie, reprise D1/R2 sans fournisseur. Typage complet et contrôle des frontières réussis.
- Sonde de narration isolée à 20/40 s : D1/R2 réels locaux, réponses OpenAI et WAV sinusoïdaux simulés. 22/36 mots, 600/1 200 frames. Les anciens journaux de développement restent conservés ; la fixture finale utilise un dossier séparé `mock-v3`.
- Chrome de fixture à **1536, 390 et 320 px** : proposition plus détaillée à 40 s, retour au texte automatique, conservation du texte manuel après changement de durée, requête finale et options existantes contrôlées. Captures inspectées.
- **Image de production Linux/amd64 reconstruite depuis le Dockerfile du dépôt** : contrat `factRefs: ['description']` accepté et véritable PNG de sous-titres rendu à la frame 382. Réseau coupé, utilisateur `node`, 2 CPU/3 Gio, assets privés déjà disponibles réutilisés. Le texte sur les travaux est lisible. Ce test ne crée pas de nouveau MP4 complet et son audio réutilisé n'est pas une nouvelle synchronisation validée.
- Build OpenNext, bundle Remotion et dry-runs web/pipeline réussis. Aucun schéma D1 nouveau nécessaire.

## Essais avec les vraies API

La description fournie par Alex est reprise dans une annonce de recette aux identifiants et contacts fictifs, dans une base D1/R2 locale isolée. Aucun compte, quota, annonce ou vidéo client n'est modifié.

| Vidéo choisie | Mots | Scènes | Parole WAV mesurée | Aperçu audio assemblé |
|---|---:|---:|---:|---:|
| 20 secondes | 30 | 4 | 12,440 s | 600 frames / 20 s |
| 40 secondes | 49 | 6 | 17,680 s | 1 200 frames / 40 s |

Le texte de 20 s présente l'appartement à Lyon 9, le séjour exposé sud avec balcon, le rafraîchissement à prévoir et le contact. Celui de 40 s ajoute des informations de proximité et les valeurs exactes de surface/prix. Les phrases et les réserves source restent complètes. Aoede, sa configuration et le modèle `gpt-5.4-mini-2026-03-17` sont conservés.

Les deux résultats réussis demandent **deux appels OpenAI et dix Google TTS**. Deux premières tentatives de sélection à 20 s ont été rejetées avant TTS : réserve d'état omise puis sélection trop longue. Le serveur a été renforcé pour imposer la réserve et ajuster les phrases complètes. Ces **quatre appels texte échoués** restent dans le journal et dans la provision. Total de campagne : **six OpenAI + dix Google**, 0,80 € de sous-réservations incluses dans la provision globale, pas ajoutées une seconde fois.

La relecture finale des deux résultats produit **zéro appel OpenAI et zéro Google**, avec contrôle du script et des WAV privés. Les preuves audio sont sous `evidence/local/narration-description/real/narration-20.wav` et `narration-40.wav`. **Écoute humaine de ces deux nouveaux échantillons non effectuée.** Les contrôles ci-dessus ne constituent pas une nouvelle génération complète de vidéo sur Cloudflare.

## Publication et budget

- Web **`cdd42432-de8c-40f4-92b8-75275fecb1be`** et génération **`a7b3a15c-f6cb-4505-a523-fe10aade3d8b`** publiés à **100 %**.
- Renderer **v12**, image immuable **`registry.cloudflare.com/5fd251f918593d6bd7594889c4ec8343/bienvu-renderer@sha256:3670125939769db2f7a0118b9e843f351aa83a42387bb0c827b2da2044e40aed`**. Un seul conteneur autorisé, 1 CPU/6 Gio et disque 12 Go conservés.
- Tous les bindings, secrets et variables web/pipeline comparés à l'état antérieur et inchangés. Aucun job actif avant la courte pause atomique des admissions ; état exact du contrôle rétabli après les deux déploiements. Accueil et connexion **200**, API super admin anonyme **401**, zéro job actif après publication.
- Chrome sur **le site publié** à **1536/390/320 px** : choix de durée, préférence dans l'onglet, libellés barrés et dépendance des sous-titres à la voix vérifiés ; aucun débordement ni requête API d'écriture. Les propositions de narration depuis la description sont exercées par la recette locale sur fixtures, distincte de ce contrôle public sans génération.
- Provision de campagne globale **2,20 €**, enregistrée avant les appels (1,50 € puis 0,70 € de réserve supplémentaire). Budget octobre : base **28,05 → 30,25 €** + imports **6,50 €** = **36,75 € provisionnés**, marge **53,25 €** avant la coupure de 90 € ; enveloppe 100 € inchangée. Les provisions ne sont pas une facture fournisseur rapprochée.

La première nouvelle génération utilisateur sur Cloudflare reste à observer de bout en bout : sélection depuis sa description, voix réelle, assemblage, sous-titres éventuels, aperçu anonyme et lecture. Aucune nouvelle admission vidéo publique ou anonyme n'a été déclenchée pour cette maintenance. Aucun nouvel appel Runway, achat, e-mail ou commit/push.

## Commandes et traces

```sh
pnpm test
pnpm typecheck
pnpm check:boundaries
pnpm exec tsx scripts/probe-description-narration.ts --mock
# Après réservation globale déjà enregistrée ; ne pas relancer une campagne incertaine :
pnpm exec tsx scripts/probe-description-narration.ts --real
pnpm exec tsx scripts/probe-description-narration.ts --replay
node scripts/probe-video-customizer.mjs
pnpm build:web
docker build --platform linux/amd64 -f apps/renderer/Dockerfile -t bienvu-renderer:description-20261002 .
node --import tsx scripts/probe-description-linux.mjs
pnpm exec wrangler containers push bienvu-renderer:description-20261002 --config apps/pipeline/wrangler.staging.runway-generation.jsonc
pnpm exec wrangler deploy --config apps/pipeline/wrangler.staging.runway-generation.jsonc --containers-rollout immediate --keep-vars
pnpm exec wrangler deploy --config apps/web/wrangler.staging.jsonc --keep-vars
```

Artefacts privés ignorés : `evidence/local/narration-description/` et captures de fixture dans `evidence/local/video-customizer/`. Journaux, réservations et tentatives rejetées conservés. La publication est entourée par la pause conditionnelle et sa restauration ; ne pas employer les commandes ci-dessus pour effacer ou réinitialiser des compteurs.

Référence du connecteur consultée pendant cette maintenance : [OpenAI — Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
