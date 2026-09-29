# Sprint 05 — recette réelle Cloudflare, 28 septembre 2026

**Sprint 05 terminé pour la préparation privée du texte et des voix.** Le 28/09 à 19:09 UTC, un Worker Cloudflare appelle réellement OpenAI puis Google Cloud, conserve le script dans D1 et cinq pistes dans R2. Après redéploiement, la reprise restitue le même résultat sans appel fournisseur. La génération publique et la vidéo produit appartiennent aux sprints 06–07.

Cette recette utilise une **annonce manuelle synthétique**, des coordonnées fictives et des métadonnées de photos de fixture. Aucune extraction de portail ni image de bien n'est testée ici. Les fournisseurs, le réseau Workers, D1 et R2 sont réels ; aucun mock fournisseur dans le Worker déployé. La réserve Bien’ici 04.3 reste ouverte.

## Déploiement et isolation

- Worker `bienvu-narration-staging`, entrée `apps/pipeline/src/narration-worker.ts`, sans `nodejs_compat`, sans Container, cron ou Workflow. Chaque requête de préparation reste ouverte jusqu'au résultat ; aucun traitement détaché dans `waitUntil`.
- Secrets `NARRATION_TOKEN`, `OPENAI_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON` transmis par stdin à Wrangler. Aucune clé dans les configurations, arguments de processus ou journaux versionnés.
- Toutes les routes exigent le jeton opérateur ; un seul couple agence/job, fixé dans les variables serveur, est autorisé. Aucun texte, modèle, voix ou mode mock accepté depuis le client. Réponses privées `Cache-Control: no-store`.
- D1 de recette **`bienvu-narration-probe-staging`**, région WEUR, migrations 0001 à 0011 appliquées. R2 **`bienvu-s00-private`**, préfixes d'agence/job uniques. Ce Worker n'est pas branché au parcours public de bienvu.online.
- La migration 0011 a aussi été appliquée à `bienvu-s00-staging` ; son enveloppe narration est en pause, aucun appel ni job de cette recette dans cette base partagée.

Le plafond d'import public était déjà atteint (10/jour). L'insertion initiale de fixture a été refusée atomiquement dans la base partagée. Une base de recette séparée a donc été créée, sans antidater la fixture, augmenter la limite ou remettre les compteurs à zéro. Les compteurs publics restent **10/10 ce jour et 11/30 ce mois**. Le budget global de la campagne demeure suivi dans la base partagée.

## Résultat réel

| Mesure | Observation |
|---|---|
| Préparation HTTP | 200, 10 343 ms de temps mural côté opérateur, pas une mesure CPU |
| Texte | 1 appel OpenAI, `gpt-5.4-mini-2026-03-17`, 957 tokens d'entrée / 87 de sortie, 0 token d'entrée en cache |
| Voix | 5 appels Google `fr-FR-Chirp3-HD-Aoede`, 267 caractères |
| Script | Version 1, 5 scènes, aucune correction/réduction, provenance `user_provided` conservée |
| Durées WAV | 2 920 / 3 840 / 3 080 / 2 000 / 3 440 ms, PCM 24 kHz mono |
| Timing | 118 / 146 / 123 / 90 / 134 frames à 30 fps : **611 frames, 20,37 s** |
| Parole / pauses | 15,28 s de parole, environ 5,09 s de pauses ; aucune phrase coupée |
| Stockage | Script D1 relu, cinq WAV téléchargés par route privée, taille/durée/SHA-256 identiques |
| Reprise après redéploiement | 0 appel OpenAI, 0 appel Google, résultat identique, journal de coût inchangé |

Les phrases portent sur l'appartement à Lyon, 42,06 m², 379 000 €, une transition de galerie et l'agence fictive. La description hostile de la fixture n'est pas envoyée au modèle. La narration et les chiffres résultent du catalogue factuel validé, sans assertions libres ajoutées.

La voix Aoede et les chiffres/villes ont déjà été écoutés et validés par Alex dans la [recette locale](RAPPORT.md). Il avait jugé les premières pauses trop longues ; le timing adaptatif est utilisé ici. Cet assemblage distant est fourni pour écoute, **sans prétendre à une nouvelle validation humaine de son rythme** ni à une inspection de MP4.

## Défauts détectés et corrigés

1. **Migration distante :** la variante du trigger contenant `CASE ... END` échoue avec `incomplete input`. La migration est annulée, absence de tables partielles contrôlée. Deux conditions explicites gardent les plafonds de 2 appels texte / 12 voix ; migration distante et neuf tests de stockage réussis ensuite.
2. **HTTP Workers :** la première tentative distante échoue avec `SCRIPT_UNAVAILABLE`, avant toute voix. Le mode `redirect: 'error'` est refusé par le workerd installé, malgré sa présence dans la documentation Request consultée. Ce refus est reproduit sans réseau. Les connecteurs utilisent désormais `manual` et rejettent les 3xx, sans suivre la redirection ni transmettre les secrets à une autre origine.
3. **Appel Google :** le nouveau test natif workerd détecte aussi `Illegal invocation` quand le fetch natif est appelé comme méthode de l'objet d'options. Appel détaché corrigé, défaut découvert sans requête Google réelle supplémentaire.

La première tentative distante et ses 0,05 € de provision restent conservées. Après diagnostic et correction, une reprise **opérateur unique** crée un nouveau job synthétique ; l'ancien job reste en échec, sa réservation d'essai fictive est libérée et son journal n'est ni effacé ni remis à zéro. Il ne s'agit pas d'un retry automatique des erreurs fournisseur.

La sonde workerd appelle maintenant le **vrai `fetch` du runtime**, dont les seules sorties sont interceptées par des réponses synthétiques. Les mocks injectés directement dans les connecteurs n'auraient pas détecté ces incompatibilités. Les simulations demeurent distinctes de l'essai distant réussi.

## Budget

Avant les essais, la provision globale passe de **23,35 à 24,15 €** : 0,70 € pour les appels et 0,10 € pour Worker/D1/R2. Mise à jour conditionnelle de la base de budget de 1 735 à 1 815 centimes ; 600 centimes d'import conservés. Marge **5,85 € sur 30 €**, coupure à 25 €. Aucun achat de crédit ni changement de facturation.

Le journal D1 isolé conserve **7 réservations, 0,35 €** : une tentative échouée et six appels terminés. Ces 0,35 € sont inclus dans les 0,70 € de campagne, sans double comptage. La reprise n'ajoute aucune provision. L'enveloppe n'est pas remboursée sur la seule base des estimations.

Estimation du succès distant : **0,001110 USD de texte + 0,008010 USD de voix = 0,009120 USD**, avant gratuité Google. Cumul des trois essais vocaux réussis (échantillon, narration locale, narration distante) : **0,028425 USD**. Facture réelle, TTC, change et allocation Google restante inconnus. Le refus runtime initial n'a pas de métrique fournisseur exploitable ; sa provision est conservée. La provision infrastructure ne constitue pas une mesure facturée.

## Vérifications et fermeture

- `pnpm check` : 145 tests, types complets et 96 fichiers de frontières ; scénarios vente/location/manuels, injection, erreurs, limites, concurrence, interruption et persistance.
- `pnpm probe:narration:worker` : 11 contrôles HTTP sous workerd, fetch natif, 5 sorties interceptées, zéro réseau fournisseur ; 1 texte / 4 voix simulés, reprise 0/0, pause effective.
- Worker construit et déployé par Wrangler 4.142.0. Version du succès réel `b121e9f7-6804-42f7-ab64-448e0cfff2ab` ; version finale en pause `92547d71-5ad0-4acd-9ab7-9e1349171fea`. Requête distante sans jeton : 401 ; autre agence : 404 ; paramètres fournisseur imposés par le client : 400, sans dépense.
- Script et voix privés : 200 avec l'autorisation correcte, 401 sans jeton, 404 pour l'autre agence ; cinq empreintes relues. Nouvelle version du Worker déployée avant le rejeu 0/0.
- Contrôle final du dépôt : `git diff --check` réussi, **265 liens relatifs** sans cible manquante et **324 fichiers candidats Git** sans correspondance des secrets OpenAI/Google/jeton opérateur. Les environnements, journaux et configurations staging sont bien ignorés.
- Après recette : budget narration **paused=1** et **`NARRATION_ENABLED=false`** déployé ; POST de préparation 503, GET privé 200, compteurs inchangés. Génération publique toujours désactivée.

Les fichiers privés sont conservés sous `evidence/remote/sprint-05/` : configurations d'exécution dans `state.json`, budgets, migrations/déploiements, premier échec et diagnostic, `run.json`, `script.txt`, cinq WAV et `narration-cloudflare.wav`. Les secrets restent dans les fichiers ignorés et Cloudflare. Les preuves lisibles seules sont versionnables ; aucun commit/push effectué dans cette tranche.

Les deux agences/jobs sont des fixtures dans la base isolée, sans compte client ni lancement en file d'attente. Le résultat préparé reste disponible en lecture privée ; l'expiration de trente jours est enregistrée. La purge physique des narrations et le rapprochement du journal produit seront intégrés aux sprints 07/09 ; aucun nettoyage automatique fictif n'est revendiqué.

## Suite

Sprint 06 : assembler cette structure avec les vraies photos, charte, sous-titres, coordonnées et filigrane, puis inspecter et écouter le MP4. Sprint 07 : Workflow durable, transitions du job, réservations client, budget produit et restitution dans l'interface. Ces intégrations ne sont pas présentées comme livrées par la recette opérateur du sprint 05.
