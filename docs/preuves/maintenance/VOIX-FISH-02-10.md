# Fish Audio — recette du 2 octobre 2026

## Résultat vérifié

- Catalogue : trois voix françaises synthétiques Fish Official (`voice_design`) inspectées via API authentifiée : Manon, Lucas, Camille. Identifiants fixes documentés dans `VOIX-FISH.md`.
- Quatre appels gratuits locaux au total : premier Manon reçu mais refusé avant correction de son en-tête WAV ; un second Manon diagnostique sauvegardé puis normalisé sans troisième appel ; Lucas et Camille enregistrés ensuite. Le journal du premier échec est conservé.
- Démonstrations réelles : Manon et Lucas 6 685 ms, Camille 6 871 ms ; WAV PCM16 mono 24 kHz, non silencieux. MP3 décodés et SHA-256 vérifiés. Relecture navigateur des six voix (Google et Fish), sans synthèse au clic.
- Un appel réel supplémentaire depuis un Worker Cloudflare temporaire authentifié, texte de démonstration fixe : modèle `s2.1-pro-free`, PCM16 24 kHz, durée 3 898 ms, coût tarifaire estimé zéro. Une première requête de sonde a été rejetée avant synthèse par le contrôle du corps POST vide ; contrôle corrigé. Le Worker de sonde a été supprimé après vérification.
- Tous les appels Fish envoient explicitement le modèle gratuit. Aucune recharge ni appel au modèle payant.

## Contrôles

- Frontières Node/Workers : vérifiées par `pnpm check`.
- Suite existante et nouveaux tests : **249 tests passent**. Typecheck monorepo corrigé puis réussi. Six tests Fish ciblés passent également après ajout du contrôle de plafond commun Google/Fish.
- Tests Fish : modèle/reférence autorisés, aucun modèle payant, cache Google historique conservé, séparation des voix, octets UTF-8, normalisation des marqueurs de flux, audio invalide/silencieux/trop long, erreur expurgée, taille et timeout couvrant le corps, pas de relance, mode muet sans clé Fish, D1/R2, rejeu sans fournisseur, coût admin, migration sur journal existant et plafond de douze appels vocaux.
- Build OpenNext et dry-run du pipeline réussis.
- Navigateur réel local : 1 536, 390 et 320 px, six démos décodées et jouées, arrêt à la désactivation/changement/onglet, rejeu et arrêt explicite, fin de lecture, panne de transport simulée puis reprise. Pas de préchargement audio, débordement horizontal, écriture API ou requête fournisseur depuis le navigateur. Captures bureau et mobile inspectées.
- Migration distante `0030_fish_audio.sql` : **48 journaux inchangés**, aucun défaut de clé étrangère. Générations brièvement suspendues pendant la migration, aucun job actif avant l’opération.

## Coût et limites

Tarif publié `s2.1-pro-free` : zéro USD par million d’octets UTF-8 ; montant réellement facturé par appel non fourni. Le portefeuille consulté avant les essais avait zéro crédit et zéro recharge. L’autorisation d’usage gratuit pour BienVu est déclarée par Alex dans cette conversation.

Les tests de persistance du pipeline utilisent des signaux audio simulés ; les démos et l’appel du Worker sont de véritables synthèses Fish. Aucune nouvelle vidéo complète ni écoute humaine qualitative des trois nouvelles voix n’est revendiquée par cette recette. Les WAV ont le format déjà accepté par le renderer publié.

Les journaux opérateur, captures, résultats JSON et identifiants privés se trouvent dans `evidence/local/fish*`, ignoré par Git. Seuls le compte rendu, le code et les démos génériques publiques sont versionnables.

## Publication vérifiée

- Web : version `c5e91f84-34a3-41a1-8614-9a8c4ffe38ad` à 100 %. Les 25 bindings existants sont inchangés ; aucun secret Fish dans le Worker web ou son bundle.
- Pipeline : version `863fbcf0-fa6f-492e-adc8-399f29b4f2d7` à 100 %. Les 26 bindings antérieurs sont conservés ; ajout du secret serveur et de `FISH_TTS_ENABLED=true`. Digest du renderer inchangé.
- Site publié : mêmes contrôles navigateur sur trois largeurs avec les six voix, aucun appel fournisseur ni écriture API. MP3 Fish HTTP 200, `audio/mpeg`, SHA-256 identiques et cache immuable d’un an. Accueil, connexion et confidentialité HTTP 200 ; administration anonyme HTTP 401.
- Budget engagé après essais : **36,95 €**, plafond de coupure 90 € et enveloppe mensuelle 100 € conservés, imports et générations ouverts. Portefeuille Fish après essais : zéro crédit et zéro recharge, comme avant.
- Rejeu opérateur Google et Fish : zéro synthèse, fichiers publics identiques. Clé absente des 616 fichiers versionnables contrôlés et du bundle web. Les copies temporaires de secrets ont été supprimées.
