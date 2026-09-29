# Préparation Google TTS — 28 septembre 2026

**Rapport historique de préparation et du premier échantillon.** Une synthèse réelle réussie avec Aoede, WAV de 19,52 s, cache relu sans réseau, écoute validée par Alex. Les sections ci-dessous conservent leur chronologie. Le script factuel et les pistes par job sont ensuite implémentés et testés : [état actuel et recette complète locale](RAPPORT.md). Les tâches indiquées « à réaliser » ci-dessous décrivent l'état de cette première tranche.

**Résultat initial : connecteur prêt pour un premier essai, aucun appel Google réel pendant sa préparation. Sprint 05 non terminé.** Alex confirme l'API Text-to-Speech et l'ajout d'un compte de facturation dans la console. L'ID du projet et les identifiants serveur manquaient pendant cette première préparation ; ils sont ensuite configurés et vérifiés lors du diagnostic décrit ci-dessous. L'ancien accord de commit/push était conditionné à la fin du sprint 04 ; sa réserve Bien’ici reste ouverte et aucun commit/push n'est effectué ici.

## Livré

- `packages/voice` : adaptateur REST Chirp 3 HD, OAuth de compte de service avec Web Crypto, sélection française configurable, cache du jeton au sein du traitement, timeouts, limite de réponse et erreurs expurgées. Aucun nouveau package tiers ni service d'hébergement.
- `packages/contracts/src/voice.ts` : configuration validée, texte borné et codes d'erreur stables ; mention de voix synthétique préparée.
- `apps/renderer/src/voice-audio.ts` : mesure PCM 16 bits, durée/volume/empreintes, arrondi des frames et pauses pour 4–6 scènes. Pas de durée supposée à partir du texte, pas de coupure artificielle.
- Sonde opérateur : trois appels maximum par mois, texte fixe fictif, provision persistante avant appel, exclusion concurrente, réutilisation du fichier validé, rejeu incertain bloqué. Journaux/sons locaux privés et ignorés par Git ; aucune route publique ajoutée.
- `.env.voice.example`, `.env.voice` local vide et `.secrets/` ignorés ; [guide de configuration](../../VOIX-GOOGLE.md). Architecture et budget reflètent le choix explicite de Google pour la voix ; le texte OpenAI reste une proposition non implémentée.

## Vérifications exécutées

| Contrôle | Résultat | Nature |
|---|---|---|
| `pnpm exec tsx --test tests/voice.test.ts` | 11 tests réussis | Réponses fournisseur simulées, signature RSA et lecture WAV réellement exécutées |
| `pnpm check` | 128 tests, 0 échec ; types et frontières 87 fichiers réussis | Suite locale complète, pas d'API payante |
| `pnpm probe:voice --mock`, deux exécutions | 1 piste créée, puis `cached: true` | Signal synthétique 1 000 ms, 24 kHz mono, RMS −19,34 dBFS ; aucune voix |
| `pnpm probe:voice:worker` | Bundle Wrangler dry-run et exécution workerd réussis | OAuth/TTS simulés ; toute sortie réseau interdite ; aucun `nodejs_compat` |
| `pnpm exec tsc -p tsconfig.tests.json` après la fixture Worker | Réussi | Types de la fixture inclus |
| `pnpm probe:voice --check` | Refus attendu `VOICE_CONFIG_INVALID` | ID et clé serveur non configurés ; aucun appel réseau |
| Git | Clé `.secrets/google-tts.json` et `.env.voice` ignorés ; `git diff --check` réussi | Aucun commit/push ni clé réelle dans les fichiers créés |

Preuves brutes locales : `evidence/local/sprint-05/check.log`, `mock-first.log`, `mock-replay.log`, `check-config.log`, `worker-build/report.json`. La sonde workerd retourne un WAV de 48 044 octets, empreinte `e88bd66a90532dd0694d7d1e87242e21b530148b04eadc12996fd697d8761279`, un échange de jeton et une synthèse **simulés** ; un second accès réutilise le jeton.

## Limites et suite exacte

1. **Accès rétabli :** Alex obtient les 30 voix françaises, Aoede disponible ; le premier appel de synthèse confirme ensuite l'accès réel au TTS.
2. **Premier échantillon réalisé et écouté :** enveloppe de campagne réservée dans D1, une synthèse et son rejeu sans réseau vérifiés. Alex confirme une voix naturelle et les informations intelligibles. Facture et gratuité restante restent inconnues.
3. Implémenter encore script structuré, appel texte et validation factuelle, provenance importée/manuelle, stockage privé par job et reprise D1/R2, raccourcissement borné et propagation aux jobs. Le cache local de la sonde ne prouve pas ces étapes produit.
4. Vérifier ensuite le connecteur avec de vrais secrets sous Cloudflare ; l'exécution workerd avec mocks ne valide pas cette intégration distante. Aucune case du sprint 05 n'est cochée prématurément.

**Coût de cette tranche : aucun appel TTS/LLM distant, aucun nouvel achat ou déploiement. Provisions globales conservées à 22 €, facture inconnue.** Les 0,05 € du journal `mock/` sont une fixture budgétaire, pas une dépense réelle. Le site, les comptes et les compteurs d'import restent inchangés ; générations et renderer toujours en pause. Aucun nouveau serveur ou conteneur n'est laissé actif.

## Diagnostic d'accès réel — 28/09, 17:56–17:58 UTC

Alex signale `VOICE_AUTH_FAILED` sur `pnpm probe:voice --voices`. La configuration locale cible `video-maker-382208`, clé au bon format/projet, permissions fichier 0600, endpoint OAuth Google attendu. **L'échange OAuth réussit en HTTP 200** : la clé n'est pas rejetée. La liste des voix échoue en **403 `PERMISSION_DENIED`, motif `BILLING_DISABLED`**. La lecture de `projects.getBillingInfo` est refusée séparément, car l'API Cloud Billing est désactivée (`SERVICE_DISABLED`) ; il n'est donc pas possible de distinguer par cette lecture un compte non rattaché, inactif ou une propagation récente.

Le connecteur et la CLI traduisent désormais les motifs structurés Google connus en `VOICE_BILLING_DISABLED` et `VOICE_API_DISABLED`. La lecture du diagnostic est plafonnée à 16 Kio, conserve le timeout et ignore les textes libres/métadonnées. Un diagnostic inconnu ou illisible garde le refus générique ; aucune clé, JWT, adresse de compte de service ou réponse brute dans les traces. La nouvelle distinction `VOICE_BILLING_DISABLED` est confirmée sur le vrai fournisseur.

**Vérification du correctif :** 12 tests voix ciblés réussis, types du package/tests et frontières réussis. La suite complète précédente comptait 128 tests ; elle n'est pas présentée comme rejouée pour cette correction ciblée. Preuves : `evidence/local/sprint-05/billing-fix-tests.log` et diagnostic expurgé `google-access-diagnostic.json`.

Deux échanges OAuth et deux lectures de voix, plus une lecture de facturation ont été exécutés pour ce diagnostic. **Zéro synthèse, zéro caractère envoyé au TTS, pas de nouvelle réservation payante** ; provisions inchangées à 22 €. Aucun rôle ou rattachement de facturation modifié. Suite : vérifier dans la console que le projet est lié à un compte de facturation actif, puis refaire `--voices` avant l'échantillon vocal borné.

## Première synthèse réelle — 28/09, 18:05 UTC

Alex fournit un résultat `pnpm probe:voice --voices` réussi : 30 voix françaises et `configuredVoiceAvailable: true`. Le refus de facturation initial est levé. Après rapprochement du budget, `pnpm probe:voice --real` effectue un échange OAuth, une consultation de voix et **une synthèse Google réelle**, sans retry.

| Mesure | Résultat |
|---|---|
| Voix | `fr-FR-Chirp3-HD-Aoede`, `google-chirp3/1` |
| Texte | Fictif, écrit à la main ; 347 caractères, 358 octets UTF-8 |
| Réponse de synthèse | 2 909 ms ; identifiant fournisseur non retourné (`null`) |
| Audio | PCM 16 bits, 24 kHz mono ; 937 004 octets |
| Mesure sur échantillons PCM | 19 520 ms, 468 480 échantillons, RMS −20,50 dBFS |
| SHA-256 audio | `aae90aa593f8618ef338c13270b69d3259f76e92d946b921bc0250a38467a2d4` |
| Cache | Rejeu CLI avec `fetch` interdit : `cached: true`, fichier/rapport identiques, une seule entrée du journal |
| Écoute humaine | Alex confirme : « Oui, la voix et les informations sont claires » pour Lyon, Saint-Étienne, 42,06 m², 379 000 € et 1 200 €/mois |
| Coût | Estimation brute 0,01041 USD avant gratuité ; facture et allocation restante inconnues |

Le WAV et les journaux restent ignorés et privés (WAV 0600), sous `evidence/local/sprint-05/google-tts/real/`. Preuves : `real-first.log`, `real-cache-replay.log`, `real-verification.json`, `google-tts-campaign-budget.json` et `budget-after-real.json`. Aucune clé, adresse de compte de service ou réponse OAuth brute dans ces traces. Les tests workerd précédents restent des **fixtures sans fournisseur réel** ; cet appel réel part du Mac, pas de Cloudflare. La durée de cet échantillon ne prouve pas encore le timing d'une vidéo à plusieurs scènes.

**Budget avant/après :** la relecture D1 trouve 22,50 € avant l'essai, dont 6 € d'imports (0,50 € de plus que le dernier relevé). La campagne TTS ajoute 0,15 € maximum par mise à jour conditionnelle de la base 1 650 → 1 665 centimes, sans modifier la pause, les coûts ou les compteurs. Relecture après essai : **22,65 € provisionnés, 7,35 € de marge sur 30 €**, plafond 25 €, imports 10/10 ce jour et 11/30 ce mois. L'appel consomme une des trois réservations locales de 0,05 €, **déjà incluse** dans les 0,15 € ; aucun double comptage. Le rejeu ne réserve rien de plus.

OAuth Wrangler expiré au premier contrôle D1, rafraîchi via Wrangler puis budget relu avec succès. Aucune migration, déploiement, génération vidéo, inscription ou modification de clé/rôle Google pendant cet essai. Aucun commit/push. `git diff --check` et exclusions Git de la clé, du fichier d'environnement et du journal vérifiés.
