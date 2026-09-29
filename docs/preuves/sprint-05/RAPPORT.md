# Sprint 05 — texte et voix, recette du 28 septembre 2026

**Rapport historique de la recette locale.** La [recette Cloudflare réalisée ensuite](CLOUDFLARE.md) clôture le sprint 05. Les résultats et limites ci-dessous décrivent le premier essai depuis le Mac. Le résultat est un script factuel et des pistes audio privées, pas encore une vidéo produit ni une génération accessible au client. La réserve Bien’ici du sprint 04 reste ouverte.

## Livré

- Contrats `ScriptPlan`, `ListingScript`, `NarrationAudio`, `PreparedNarration` ; quatre à six scènes, photo, narration, texte affiché, provenance et mention de voix synthétique.
- `packages/narration` : formatage français déterministe, catalogue factuel, sélection OpenAI à sortie JSON stricte, validation avant voix, une correction au maximum et un raccourcissement au maximum. Modèle proposé/configurable `gpt-5.4-mini-2026-03-17`, choisi techniquement pour cette recette ; aucune prétention à un choix commercial confirmé par Alex.
- `packages/voice` : Chirp 3 HD configurable, OAuth Web Crypto, limites et erreurs expurgées, mesure réelle du WAV et calcul de timing. Le renderer réexporte la mesure portable, sans dépendance Node dans le pipeline.
- `packages/db/migrations/0011_narration.sql` et accès D1 : script et marque figés par job, verrou/concurrence, plafond atomique, appels incertains bloqués, R2 privé et relecture des empreintes. Migration uniquement sur les bases de recette locales.
- Étape privée `apps/pipeline/src/narration.ts`, sondes opérateur/Worker, exemples d'environnement, fixtures, CI et [guide de lancement](../../NARRATION.md).

La génération sélectionne des formulations contrôlées : les textes factuels finaux sont compilés côté serveur. Ni description brute ni titre commercial ne deviennent des instructions ou des assertions libres. Cette décision limite la variété stylistique pour rendre les chiffres et la provenance vérifiables.

## Recette avec les vrais fournisseurs

Première synthèse isolée à 18:05 UTC : 347 caractères, 19,52 s avec Aoede. **Alex a écouté et validé** la clarté de la voix, Lyon, Saint-Étienne, 42,06 m², 379 000 € et 1 200 €/mois. Ce texte était écrit à la main. [Mesures historiques](PREPARATION-GOOGLE.md#première-synthèse-réelle--2809-1805-utc).

À **18:29:04 UTC**, `pnpm probe:narration --real` réussit depuis le Mac avec une **annonce synthétique** :

| Mesure | Résultat réel |
|---|---|
| OpenAI | 1 appel, 944 tokens d'entrée, 86 de sortie, 0 token mis en cache retourné |
| Script | 5 scènes, version 1 ; aucune correction ni raccourcissement |
| Google | 5 synthèses Aoede, 260 caractères au total |
| Pistes | PCM 16 bits, 24 kHz mono ; 2 640 / 3 840 / 2 880 / 1 640 / 3 280 ms |
| Parole totale | 14 280 ms ; les pauses et maintiens des images portent le timing à 30 s |
| Frames | 174 / 210 / 181 / 143 / 192, total 900 à 30 fps |
| Faits | Appartement à vendre à Lyon, 42,06 m², 379 000 €, contact d'agence fictif |
| Coûts estimés | OpenAI 0,001095 USD + Google 0,0078 USD, avant gratuité Google |
| Facturation effective | Inconnue ; pas assimilée à zéro |

Les prix/quantités proviennent de la fixture et ne constituent pas la recette d'une annonce de portail. Le script, les cinq WAV et les journaux sont privés et ignorés par Git. Le fournisseur Google ne retourne pas d'identifiant de requête ni d'usage facturé : `null`, avec un identifiant local et les caractères de la requête comptés séparément.

SHA-256 des cinq pistes, dans l'ordre :

```text
179b470e86e527ffdc75f2e4ef9ecc556ff33f919dcd2eca9777e64bedf735bc
43ac643262bb4502c7b3f4cdb027265a1a46937eb994e1193390c016daefea11
82819b4179ca54bfa0276d707bcc6844a6985e08b31850a8296f1a186112e92d
017d68bb0e2f6770d8fcbd1f02ac2c45252fd4e7b4f3b25591440ef73ee173df
cff9817fd3350aec239e5be514cea5bc31060823a9e1b7d4837a7218af253db9
```

Alex écoute aussi cet assemblage et répond **« Voix claire, mais pauses trop longues »**. Le calcul est corrigé pour adapter la durée au texte : sur ces mêmes pistes, **114 / 150 / 121 / 83 / 132 frames**, soit **600 frames / 20 secondes**. La parole reste à 14,28 s et les silences passent de 15,72 à 5,72 s. `--replay` applique ce changement aux WAV vérifiés avec zéro appel OpenAI/Google. L'aperçu actuel `narration-probe/real/narration.wav` contient cette version courte. La clarté vocale est validée ; le nouveau rythme n'a pas encore fait l'objet d'un second retour humain. Le résultat reste distinct d'une vidéo avec sous-titres inspectée visuellement.

## Persistance : défaut de sonde détecté et corrigé

Le premier essai écrit et relit réellement D1/R2 **pendant son processus**. Le contrôle de reprise, effectué avec le réseau fournisseur bloqué, révèle ensuite que Miniflare 5 ignore les anciennes options `d1Persist`/`r2Persist` du convertisseur v4 : l'état disparaît à l'arrêt. Il échoue avant tout nouvel appel externe. Ce premier essai ne prouvait donc pas la persistance entre processus.

La sonde utilise désormais `resourcePersistencePath`. Les fichiers exportés du premier essai et leurs métriques ont permis une récupération locale contrôlée : chaque WAV est vérifié par SHA-256, le script est revalidé, les six appels terminés et leurs 30 centimes réservés sont réinscrits, sans appel fournisseur. Le rapport original est conservé séparément. L'identifiant D1 initial de l'appel texte n'avait pas été exporté : l'identifiant client d'origine est utilisé pour cette récupération ; l'heure du rapport remplace les heures par ligne non exportées. Ce rapprochement est consigné, pas présenté comme une reprise intacte du premier stockage.

Après fermeture complète du runtime de récupération, **`--replay` réussit : zéro appel texte, zéro appel voix, fichiers et script identiques**. Un test indépendant crée un nouveau job avec fournisseurs simulés, ferme entièrement Miniflare, le rouvre et retrouve script/WAV/réservations sans fournisseur. La CLI refuse aussi de dépenser si un rapport réel existe sans journal D1.

## Vérifications et portée

Les tests couvrent vente/location, données manuelles, champs absents, gros montants, décimales, description malveillante, faux faits/photos, refus/réponse invalide/timeout, correction bornée, voix silencieuse/corrompue, durée excessive, budget, isolation, concurrence, instantané d'agence et interruption après réservation.

Le bundle de narration est construit par Wrangler en dry-run puis exécuté sous **workerd local**, avec vrais D1/R2 locaux et réponses OpenAI/Google simulées, sans sortie réseau ni `nodejs_compat`. Premier passage : un appel texte et quatre voix simulés ; deuxième : zéro appel. Il ne démontre pas des appels réels sur le réseau Cloudflare.

Vérification finale : `pnpm check` **145 tests réussis, 0 échec**, types complets et frontières 95 fichiers ; `pnpm probe:narration:worker` réussi (quatre scènes simulées, 720 frames, reprise 0/0), `pnpm build:web` OpenNext réussi et `git diff --check` sans erreur. Contrôle de 253 liens relatifs sans cible manquante et aucune correspondance des identifiants réels OpenAI/Google dans les 97 fichiers candidats Git. Les probes `--mock`, `--real`, `--replay` restent distinguées ; aucun appel facturable dans la CI. [Suivi](../../SUIVI.md).

## Budget, limites et suite

Alex confirme **0 € d'achat de crédits OpenAI ce mois-ci**. Après les 0,15 € de campagne vocale isolée, 0,70 € sont réservés globalement **avant** la campagne texte/voix. Total prudent **23,35 € sur 30 €**, marge 6,65 €, coupure des tests à 25 €. Les 0,30 € du journal local sont inclus dans les 0,70 €, sans double comptage. Estimations cumulées des deux essais API : **0,019305 USD avant gratuité Google**, facture réelle inconnue. Les échecs de reprise réseau bloqué ne créent aucun nouvel usage fournisseur. Aucun achat ni modification de facturation.

Restant à la fin de cette première tranche (le point 1 est depuis validé dans la [recette Cloudflare](CLOUDFLARE.md)) :

1. Appliquer 0011 et tester les vrais connecteurs/secrets depuis Cloudflare dans une campagne bornée ; pas de déploiement dans cette tranche.
2. Sprint 06 : convertir `PreparedNarration` vers le manifeste vidéo, appliquer photos/charte/sous-titres/filigrane et inspecter le MP4 avec son.
3. Sprint 07 : raccorder le Workflow, les statuts/échecs des jobs, libération des réservations client, contrôle global et journal des coûts. `narration_runs` persiste déjà son échec ; l'étape seule ne modifie pas le statut global du job.
4. Raccorder la purge des scripts/WAV à l'expiration enregistrée de trente jours, y compris les objets interrompus, avant exploitation durable.

Preuves ignorées sous `evidence/local/sprint-05/` : `narration-real-first.log`, `narration-real-first-report.json`, `narration-storage-recovery.json`, `narration-real-replay.log`, `narration-campaign-budget.json`, `narration-full-check.log`, `narration-worker/`, `narration-probe/real/`. Aucun secret ni audio ajouté à Git, aucun nouveau serveur/Container durablement lancé, aucun commit/push.
