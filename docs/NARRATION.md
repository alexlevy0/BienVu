# Texte factuel et voix par scène

**Couverture audio du 02/10/2026 :** `description-copy/2` adapte la narration aux 20/30/40 secondes (cibles 50/77/104 mots, plafonds 60/90/120). Une adaptation bornée après mesure des WAV, puis une sélection gratuite des paragraphes déjà mesurés, réduisent les blancs. Les pistes s’enchaînent avec quatre frames de marge ; textes utilisateur et snapshots historiques restent conservés. Recette réelle Manon : **39,394 s de WAV sur 40 s**, rythme validé par Alex, sans nouvel export MP4 pour cette recette. [Mesures, tests, coûts et limites](preuves/maintenance/NARRATION-COUVERTURE-02-10.md).

**Première maintenance du 02/10/2026, remplacée pour les nouvelles vidéos par la couverture ci-dessus :** les vidéos de 20/30/40 s utilisent les passages utiles de la description et un maximum de 40/60/75 mots. Les phrases complètes et les réserves d'état sont conservées ; les chiffres structurés priment sur ceux du texte. La proposition dans Personnaliser s'adapte à la durée tant que l'utilisateur ne l'a pas modifiée. Une narration modifiée reste prioritaire. Le pipeline, le renderer Linux et l'interface sont publiés ; tests sur fixtures et vraies API locales sont distingués dans le [compte rendu](preuves/maintenance/NARRATION-DESCRIPTION-02-10.md). Une nouvelle vidéo complète Cloudflare et l'écoute humaine de cette narration restent à observer. Les résultats historiques du sprint 05 ci-dessous ne valident pas implicitement cette nouvelle tranche.

Le sprint 05 prépare un `PreparedNarration` privé à partir d'une annonce enregistrée et de la charte d'agence. **La recette est validée avec les vraies API depuis le Mac puis depuis Cloudflare.** Le Worker produit cinq scènes et cinq WAV, persiste D1/R2 privés et reprend après redéploiement sans appel supplémentaire. L'assemblage distant dure **20,37 secondes**. Alex a validé la clarté d'Aoede sur les échantillons locaux ; ses remarques sur les pauses ont conduit au timing adaptatif. Le Worker opérateur est remis en pause après recette. Le parcours public et la vidéo produit restent aux sprints 06–07. [Rapport local](preuves/sprint-05/RAPPORT.md) · [preuves Cloudflare](preuves/sprint-05/CLOUDFLARE.md).

## Configuration et commandes

Utiliser Node 24.17.0 et les dépendances épinglées du dépôt. Configurer Google selon [VOIX-GOOGLE.md](VOIX-GOOGLE.md), puis copier `.env.script.example` vers `.env.script` sans écraser un fichier déjà configuré :

```dotenv
OPENAI_API_KEY=
SCRIPT_MODEL=gpt-5.4-mini-2026-03-17
SCRIPT_PROBE_BUDGET_MONTH=
SCRIPT_PROBE_OTHER_PROVISIONS_CENTS=
```

La clé reste serveur, hors Git et hors `NEXT_PUBLIC_*`. Protéger les fichiers `.env.script`, `.env.voice` et `.secrets/google-tts.json` avec le mode 0600. `--check` contrôle la configuration sans réseau. Les valeurs du modèle acceptées sont le snapshot ci-dessus et son alias `gpt-5.4-mini` ; tout changement de modèle/prix demande une revue du connecteur et de son budget.

```sh
pnpm probe:narration --check
pnpm probe:narration --mock
pnpm probe:narration:worker
# Une fois la campagne réelle provisionnée globalement :
pnpm probe:narration --real
# Relecture du résultat réel, appels fournisseurs interdits :
pnpm probe:narration --replay
```

`--mock` utilise une annonce fictive et des signaux sinusoïdaux, sans API externe. `probe:narration:worker` construit un bundle Wrangler en dry-run et le lance sous workerd local, sans `nodejs_compat`, avec le vrai `fetch` workerd et ses sorties interceptées par des réponses synthétiques ; aucun réseau fournisseur. Il ne déploie rien.

`--real` utilise la même annonce fictive, mais les vrais fournisseurs. Il écrit le script, chaque WAV, un aperçu audio et un rapport dans `evidence/local/sprint-05/narration-probe/real/`. L'aperçu assemble les pistes et les pauses ; ce n'est pas une vidéo. Le sous-dossier `storage/` conserve D1/R2 entre processus. **Ne pas supprimer ce stockage ni ses journaux pour relancer un essai.** Un rapport sans journal D1 provoque `NARRATION_REVIEW_REQUIRED`. Une modification du texte, de la voix ou du modèle du même job est refusée plutôt que facturée silencieusement.

## Budget avant tout essai réel

La sonde réserve 0,05 € avant chaque appel et garde cette réservation après erreur. Maximum par job : deux appels texte (une seule correction) et douze synthèses (six scènes, un seul raccourcissement), soit **0,70 € de campagne**. La migration ne crée aucun budget réel ouvert. La CLI opérateur crée uniquement son enveloppe locale isolée, après contrôle du mois UTC et de `SCRIPT_PROBE_OTHER_PROVISIONS_CENTS + 70 <= 2500`.

Avant une nouvelle campagne, relire les dépenses/provisions globales et y réserver ces 0,70 € ; ce n'est pas automatique entre la sonde et le contrôleur d'import hébergé. Pour la première recette locale de septembre 2026, **cette campagne était déjà provisionnée** : base D1 1 665 → 1 735 centimes, plus 600 centimes d'imports, total **23,35 €**, marge 6,65 € sur 30 €. La valeur locale hors campagne est 2 265 centimes. Les 0,30 € des six appels réussis sont compris dans les 0,70 €, sans double addition. Alex confirme 0 € de crédits OpenAI achetés ce mois-ci. Ces valeurs historiques ne doivent pas être réutilisées aveuglément un autre mois. [Suivi budgétaire](BUDGET-ET-OFFRES.md).

La campagne Cloudflare suivante ajoute **0,80 €** (0,70 € API, 0,10 € infrastructure), par mise à jour conditionnelle du budget distant. Total actuel **24,15 €**, marge 5,85 € sur 30 €. Son journal conserve 0,35 € de réservations, comprises dans la campagne, y compris la première tentative échouée. Le Worker et son enveloppe sont en pause. Aucun nouveau test ne doit repartir des valeurs historiques sans relire les provisions courantes.

Le rapport distingue tokens retournés par OpenAI, caractères comptés dans les requêtes Google, prix datés, provisions et facture inconnue. La gratuité restante de Google n'est pas supposée disponible et une métrique absente reste `null`.

## Traitement et garanties

1. `packages/narration` construit un catalogue de formulations factuelles depuis les données normalisées. OpenAI choisit quatre à six formulations et photos avec un schéma JSON strict. Les nombres, unités et références sont insérés et revérifiés côté serveur. **Le modèle sélectionne des formulations ; il ne rédige pas librement de nouvelles assertions.** Cette restriction favorise la fidélité, au prix d'une variété rédactionnelle limitée. Depuis le retour d'Alex sur le naturel, `factual-copy/2` emploie des phrases plus orales, virgules, deux-points et questions de conclusion. Les nouveaux snapshots enregistrent cette version ; ceux sans version conservent exactement `factual-copy/1`, son empreinte et ses pistes. Une évolution rédactionnelle ne réécrit donc pas les jobs existants et ne déclenche pas de resynthèse implicite.
2. Pour `description-copy/1`, des clauses complètes filtrées de la description entrent dans le catalogue avec la référence `description` et leur chemin source. Le modèle reçoit seulement ce catalogue et choisit ses identifiants ; titre libre, URL, texte administratif et instructions étrangères à l'annonce ne sont pas transmis. Les versions historiques `factual-copy/1` et `/2` excluent toujours la description. Aucune recherche externe ni aucun outil. Les faits manuels restent `user_provided`, les faits importés conservent leur provenance. Les affirmations du texte commercial ne constituent pas de nouveaux faits vérifiés par BienVu. Les champs absents ne produisent pas de caractéristiques supposées.
3. Intro factuelle, conclusion avec nom et coordonnées de l'agence, au moins trois photos distinctes, aucun doublon de photo adjacent. Vente/location, charges, gros montants et surfaces décimales sont contrôlés. Une sélection invalide autorise une correction au maximum ; une erreur fournisseur ne déclenche pas de retry implicite.
4. Chirp 3 HD Aoede produit du WAV PCM 16 bits par scène. Texte et configuration versionnée déterminent la clé de cache ; contenu, taille, durée et empreinte SHA-256 sont vérifiés après écriture et à chaque relecture.
5. La mesure lit les échantillons PCM, depuis Node comme sous Workers. Les scènes reçoivent leurs frames à 30 fps. Le montage ajoute normalement **0,3 s entre les pistes** et **1,2 s après le contact**, hors arrondi à la frame et pauses internes produites par Google. Le supplément nécessaire pour atteindre le minimum produit de 20 s reste sur la carte finale, plutôt que dans chaque transition. À proximité du plafond de 35 s, les marges peuvent descendre à 0,2 s par scène. Les WAV ne sont ni accélérés ni rognés. Le timing peut être recalculé à la reprise à partir des WAV vérifiés, sans appel API. Si la narration dépasse la limite, un seul raccourcissement factuel est persisté avant de synthétiser les seules pistes modifiées. Aucune phrase coupée.

Les [recommandations de rédaction Google](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd?hl=fr#scripting-and-prompting-tips), consultées le 28/09/2026, motivent ce travail sur le phrasé et la ponctuation. Aucun « euh », rire ou point de suspension systématique n'est ajouté. La voix Aoede et sa vitesse par défaut sont conservées pour la comparaison. Google documente aussi des contrôles de débit et du SSML en aperçu ; cette tranche ne les active pas et n'envoie aucun faux champ de prompt de style. La préférence de timbre/prosodie demande une écoute humaine, distincte de la validation technique.

OpenAI Responses : sortie structurée stricte, 1 200 tokens maximum, 45 s couvrant également la lecture du corps, réponse limitée à 128 Ko, pas d'outil et `store: false`. Les refus et erreurs utilisent des codes stables sans réponse brute ni secret. La mention **« Voix de synthèse générée par intelligence artificielle. »** reste dans le contrat et le manifeste serveur comme donnée de provenance ; elle n'est plus incrustée dans l'image de la vidéo.

## Intégration et migrations

`apps/pipeline/src/narration.ts` expose `prepareJobNarration({DB, MEDIA}, agencyId, jobId, providers)`. L'appelant serveur doit tirer `agencyId` d'un contexte autorisé. Le job doit déjà exister, avec annonce prête, et être en étape `scripting` ou `voicing`. Cette fonction ne crée pas de job et ne débite pas de quota client.

`0011_narration.sql` ajoute les instantanés d'entrée/marque, le script et le résultat privés, les verrous de dix minutes, le numéro de tentative, les appels et les réservations de coût. Les limites sont atomiques en D1. Le journal identifie la clé R2 avant l'écriture. Un appel déjà réservé dont le résultat est incertain exige une revue opérateur, sans second appel automatique. Un échec remonte au caller sous forme d'erreur stable et marque `narration_runs` en échec ; le Workflow du sprint 07 devra traduire cet échec dans `jobs` et libérer la réservation client.

La migration est appliquée automatiquement **aux bases isolées des sondes locales**. Pour le développement applicatif : `pnpm db:migrate` applique les migrations locales manquantes. **0011 est aussi appliquée sur Cloudflare**, dans la base applicative partagée et dans la base isolée de recette. Aucun budget n'est ouvert par la migration elle-même. La recette opérateur provisionne explicitement son enveloppe, après réservation globale ; son budget est désormais en pause. Le Workflow, le contrôle de génération et le budget du parcours produit restent à intégrer au sprint 07.

Les fichiers sont sous `agencies/{agencyId}/jobs/{jobId}/audio/`, sans URL publique. Une expiration de trente jours est enregistrée ; la suppression automatique des narrations et objets interrompus reste à raccorder à la purge produit aux sprints 07/09. `PreparedNarration` est distinct du manifeste technique du sprint 00 ; la conversion vers le manifeste vidéo et les nouveaux types de scènes/références appartient au sprint 06. `narration_calls` conserve les coûts texte/Google. La campagne opérateur est provisionnée dans le budget global ; le raccordement automatique au journal produit reste au sprint 07.

## Worker Cloudflare et procédure opérateur

`apps/pipeline/src/narration-worker.ts` utilise le même module de préparation que la recette locale. `wrangler.narration.jsonc` décrit les bindings/types, sans identifiant ni secret distant. La configuration `wrangler.staging.narration.jsonc` est générée et ignorée par Git. L'authentification protège toutes les routes, puis le couple `NARRATION_AGENCY_ID`/`NARRATION_JOB_ID` borne leur portée :

| Route | Fonction |
|---|---|
| `GET /status` | Runtime et état d'activation, sans secret |
| `POST /agencies/{agencyId}/jobs/{jobId}/prepare` | Corps vide, script et voix avec vrais fournisseurs uniquement |
| `GET /agencies/{agencyId}/jobs/{jobId}` | Résultat privé persistant |
| `GET /agencies/{agencyId}/jobs/{jobId}/audio/{audioId}` | WAV privé contrôlé par taille, durée et SHA-256 |

Sans jeton : 401 ; autre agence/job : 404 ; paramètres client : 400 ; préparation en pause : 503. Aucun endpoint HTTP ne permet d'ouvrir un budget ou de changer le modèle. Les logs applicatifs contiennent identifiant de requête, statut, temps mural, compteurs et code stable ; pas de texte, clé ni corps fournisseur.

La base **`bienvu-narration-probe-staging`** est séparée de la base applicative : la fixture ne consomme pas les dix imports du jour du site. Le bucket R2 reste privé, sous des préfixes uniques. Le budget global continue à être réservé dans la base partagée. Les limites du journal de recette ne sont pas des quotas d'abonnement client.

La campagne conservée est déjà exécutée et fermée. Pour relire sa fermeture, sans appel fournisseur :

```sh
pnpm exec wrangler whoami
pnpm probe:narration:cloudflare verify-paused --natural
```

Procédure de **première installation**, après rapprochement du budget ; ne pas effacer un journal existant pour la rejouer :

```sh
pnpm probe:narration:cloudflare configure
# Créer seulement si cette base n'existe pas encore ; conserver son UUID.
pnpm exec wrangler d1 create bienvu-narration-probe-staging --location weur --update-config=false
pnpm probe:narration:cloudflare isolate <UUID_D1_DE_RECETTE>
pnpm exec wrangler d1 migrations apply DB --remote --config apps/pipeline/wrangler.staging.narration.jsonc
pnpm probe:narration:cloudflare reserve
pnpm probe:narration:cloudflare seed
# Bootstrap fermé, puis secrets par stdin ; aucune clé en argument.
pnpm exec wrangler deploy --config apps/pipeline/wrangler.staging.narration-bootstrap.jsonc
pnpm probe:narration:cloudflare secrets
pnpm probe:narration:cloudflare enable
pnpm exec wrangler deploy --config apps/pipeline/wrangler.staging.narration.jsonc
pnpm probe:narration:cloudflare run
# Vérifier la persistance après un nouveau déploiement.
pnpm exec wrangler deploy --config apps/pipeline/wrangler.staging.narration.jsonc
pnpm probe:narration:cloudflare verify
pnpm probe:narration:cloudflare pause
pnpm exec wrangler deploy --config apps/pipeline/wrangler.staging.narration.jsonc
pnpm probe:narration:cloudflare verify-paused
```

`run` écrit un marqueur avant l'appel et refuse un second essai aveugle. Après timeout ou erreur, inspecter le journal D1 et les fichiers privés avant toute reprise ; ne pas supprimer les appels ou réservations. La commande `review-runtime-retry` est réservée au défaut workerd précis documenté dans le [rapport](preuves/sprint-05/CLOUDFLARE.md), après reproduction hors réseau ; elle est limitée à une seule reprise et garde le premier échec. Ce n'est pas un mécanisme général de retry du produit.

La comparaison de naturel utilise le sous-dossier privé `evidence/remote/sprint-05/naturalness/` et le suffixe `--natural` sur les actions. `prepare-naturalness --natural` exige une campagne initiale fermée, le même mois, au moins 0,35 € encore disponible dans son enveloppe API et un budget global sous la coupure. Elle crée une autre fixture avec de nouveaux identifiants, conserve tous les fichiers/appels précédents et ne remet aucun compteur à zéro. Ensuite : `seed --natural`, `enable --natural`, déploiement, `run --natural`, `verify --natural`, `pause --natural`, redéploiement fermé, `verify-paused --natural`. Le Worker n'autorise que le couple agence/job actif ; les anciens objets restent privés. Une seconde exécution de `prepare-naturalness` est refusée si son état existe. L'estimation de cette comparaison est consignée séparément, sans réserver deux fois l'enveloppe globale.

Les fichiers de recette sont sous `evidence/remote/sprint-05/`, hors Git, et les credentials restent dans `.env.script`, `.env.voice`, `.secrets/` et les secrets Worker. Les providers utilisent `redirect: manual`, refusent tous les 3xx et appellent le fetch natif sans contexte `this` emprunté à l'objet d'options. Le test workerd intercepte le transport après le vrai fetch, afin de couvrir ces contraintes du runtime.

Sources : [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [modèle et prix GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [Google Chirp 3 HD](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd).

## Voix Fish Audio — 02/10/2026

Manon, Lucas et Camille sont proposées en plus de Google. Synthèse serveur `s2.1-pro-free` exclusivement, préécoutes MP3 fixes, suivi par fournisseur et octets UTF-8. Le texte et le timing restent gérés par la narration existante. Migration additive `0030_fish_audio.sql`, cache Google historique préservé et reprise sans appel. Alex déclare avoir l’autorisation d’utiliser le mode gratuit pour BienVu. [Configuration](VOIX-FISH.md) · [Recette](preuves/maintenance/VOIX-FISH-02-10.md).

## Sélections descriptives du même type — 02/10/2026

Une sélection OpenAI de plusieurs extraits `gallery` ou `location` pouvait être réduite à trois scènes par la déduplication, puis refusée par le contrat de quatre scènes minimum. Le compilateur complète désormais les seuls plans trop courts avec une autre entrée du catalogue : passage sélectionné équivalent d’un autre type en priorité, puis passage descriptif ou factuel court. Aucun texte libre ni fait supposé n’est ajouté ; limites de mots, réserves sur l’état du bien, identifiants de photos et provenance restent validés. Les scripts historiques valides et narrations utilisateur conservent leur comportement.

`SCRIPT_INVALID` est maintenant une erreur publique de rédaction, propagée par le Workflow avec libération du crédit. Pour un ancien job échoué avec `GENERATION_FAILED`, la lecture récupère ce diagnostic précis depuis son `narration_runs` de la même agence, sans réécrire le job terminal ni ses coûts. Les diagnostics internes inconnus restent masqués. [Cause, contrôles et publication](preuves/maintenance/ECHEC-NARRATION-02-10.md).
