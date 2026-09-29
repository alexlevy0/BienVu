# Voix française — Google Cloud Chirp 3 HD

Alex a choisi Chirp 3 HD le 28/09/2026 et confirmé l'activation de **Cloud Text-to-Speech** et l'ajout d'un compte de facturation. Le projet configuré est `video-maker-382208`. Après un refus initial `BILLING_DISABLED`, Alex obtient la liste des 30 voix françaises. **Le premier appel de synthèse réel réussit le 28/09 à 18:05 UTC** avec Aoede : WAV de 19,52 secondes, 347 caractères, écoute humaine validée. Cette API produit la voix (TTS) ; aucune transcription STT n'est nécessaire pour les sous-titres par scène.

Le connecteur fonctionne depuis le Mac et depuis un vrai Worker Cloudflare. Le script factuel, cinq pistes Chirp 3 HD, D1/R2 privés et une reprise après redéploiement sont vérifiés : [guide complet](NARRATION.md), [recette locale](preuves/sprint-05/RAPPORT.md) et [recette Cloudflare](preuves/sprint-05/CLOUDFLARE.md). Le Worker opérateur est remis en pause ; le Workflow public reste au sprint 07. Les commandes ci-dessous concernent le premier échantillon vocal isolé.

**Naturel de la narration :** le catalogue `factual-copy/2` écrit désormais pour l'oral, avec des phrases comme « Vous disposez ici de… » et « Envie d'en savoir plus ? ». Prix, surfaces et charges restent exacts. Aoede et son débit par défaut sont conservés ; le montage ajoute normalement 0,3 s entre les pistes et place l'attente supplémentaire sur la carte de contact. Les pauses internes de Google restent présentes. Les anciens jobs conservent leurs formulations et leurs WAV. Cette évolution suit les [conseils Google sur le phrasé et la ponctuation](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd?hl=fr#scripting-and-prompting-tips) ; elle demande une comparaison à l'écoute, sans promettre une voix indiscernable d'un humain.

## Configurer l'accès local

1. Dans le sélecteur de projet Google Cloud, relever l'**ID du projet**, par exemple `bienvu-123456`, distinct du nom BienVu.
2. Ouvrir **IAM et administration → Comptes de service → Créer un compte de service**. Nom suggéré : `bienvu-tts`. Utiliser un compte dédié à BienVu.
3. Donner le rôle **Consommateur d'utilisation du service** (`roles/serviceusage.serviceUsageConsumer`), qui contient `serviceusage.services.use`. Ne pas accorder les rôles Propriétaire ou Éditeur. L'accès effectif sera contrôlé par la commande `--voices` avant toute synthèse.
4. Ouvrir ce compte → **Clés → Ajouter une clé → Créer une clé → JSON**. Enregistrer le fichier sous `/Users/alexlevy0/Dev/BienVu/.secrets/google-tts.json`. Le dossier `.secrets/` est ignoré par Git. Ne jamais coller la clé dans une conversation, un commit ou une variable `NEXT_PUBLIC_*`. Si la création de clés est interdite par l'organisation, utiliser ensuite une identité fédérée ; ne pas désactiver cette politique pour le test.
5. Compléter `.env.voice` à la racine (déjà préparé, ignoré par Git), à partir de `.env.voice.example` :

```dotenv
GOOGLE_CLOUD_PROJECT=bienvu-123456
GOOGLE_APPLICATION_CREDENTIALS=.secrets/google-tts.json
GOOGLE_TTS_VOICE=fr-FR-Chirp3-HD-Aoede
```

Le connecteur utilise le protocole OAuth de compte de service et une clé PKCS#8, avec endpoints Google fixes. Le fichier JSON reste local. Pour un futur Worker, injecter le contenu via un **secret serveur**, jamais dans Wrangler versionné ; la publication n'est pas réalisée dans cette tranche. Google recommande les identités fédérées pour les déploiements hors Google Cloud ; le fournisseur de jeton est séparé du TTS pour permettre cette évolution.

Depuis le dépôt :

```sh
chmod 600 .secrets/google-tts.json
pnpm probe:voice --check
pnpm probe:voice --voices
```

`--check` valide la configuration et la clé localement, sans réseau. `--voices` vérifie l'authentification et la liste française disponible ; aucun texte n'est synthétisé. La voix Aoede est configurable ; Alex a validé sa clarté lors des écoutes du 28/09.

### Si Google renvoie `VOICE_BILLING_DISABLED`

La clé est acceptée, mais Google considère la facturation inactive pour le projet de la requête. Sélectionner **`video-maker-382208`** dans la console, puis **Facturation → Associer un compte de facturation** (`Billing → Link a billing account`). Choisir le compte créé et vérifier qu'il est actif. Si le compte est déjà associé, vérifier son état et les éventuelles étapes de validation du paiement. Une modification récente peut nécessiter un délai avant propagation ; relancer ensuite `pnpm probe:voice --voices`.

Créer un compte de facturation et le rattacher au projet sont deux opérations distinctes. Le compte doit également être actif. Le diagnostic API observé ne permet pas de distinguer un rattachement manquant, un compte inactif ou un délai de propagation. La lecture supplémentaire de Cloud Billing a été refusée parce que **l'API Cloud Billing** est désactivée ; cela ne signifie pas que l'API Text-to-Speech est désactivée et n'impose pas d'activer une autre API pour corriger le rattachement via la console. [Vérifier la facturation d'un projet](https://docs.cloud.google.com/billing/docs/how-to/verify-billing-enabled).

`VOICE_API_DISABLED` désigne séparément le motif `SERVICE_DISABLED` renvoyé par Text-to-Speech. `VOICE_AUTH_FAILED` reste le refus d'accès générique. Seuls les motifs Google explicitement reconnus sont traduits ; aucun corps d'erreur, clé ou jeton n'est affiché.

## Premier échantillon réel

Avant `--real`, rapprocher le budget courant dans [BUDGET-ET-OFFRES.md](BUDGET-ET-OFFRES.md) et le contrôleur hébergé. Reporter dans `.env.voice` le mois UTC et les provisions externes **hors nouvelles réservations de cette sonde** :

```dotenv
# État connu au 28/09/2026 seulement, à relire avant un essai ultérieur.
VOICE_PROBE_BUDGET_MONTH=2026-09
VOICE_PROBE_OTHER_PROVISIONS_CENTS=2250
```

La sonde réserve **0,05 € par tentative**, au plus **3 tentatives et 3 000 caractères par mois**, y compris les échecs. Elle refuse un budget total estimé supérieur à 25 €. Ces réservations locales ne mettent pas à jour automatiquement le contrôleur D1 des imports : avant le premier essai, provisionner aussi les **0,15 € maximum de cette campagne** dans le budget global et conserver cette provision jusqu'au rapprochement. **Cette provision a déjà été ajoutée le 28/09 à 18:05 UTC : ne pas la réserver à nouveau.** La base du contrôleur passe de 1 650 à 1 665 centimes, avec 600 centimes d'imports déjà présents, soit **22,65 € au total**. Les 0,05 € de l'appel réalisé sont compris dans cette enveloppe de 0,15 €, pas additionnés une seconde fois. Les chiffres sont un instantané à relire avant une autre campagne. Ce contrôleur global reste à unifier avec les jobs au sprint 07. Ne pas supprimer le journal pour contourner les limites.

```sh
# Après rapprochement et provision globale par l'opérateur :
pnpm probe:voice --real
```

Un texte fixe fictif teste Lyon, Saint-Étienne, 42,06 m², 379 000 € et un loyer mensuel de 1 200 € charges comprises. Ce texte est écrit à la main : il ne prouve pas la qualité du futur générateur de scripts. La commande produit un WAV privé et un rapport dans `evidence/local/sprint-05/google-tts/real/`. Écouter le WAV, puis consigner intelligibilité, prix, unités et noms de ville. Une piste réussie est réutilisée à l'identique (empreinte du texte et paramètres). Une erreur ou un appel interrompu bloque le rejeu automatique : inspecter le journal avant toute nouvelle tentative.

Le premier essai produit un WAV PCM 16 bits, mono 24 kHz, 937 004 octets, RMS −20,50 dBFS. Son rejeu avec `fetch` interdit réutilise le même fichier sans réseau ni nouvelle réservation. Les 19,52 secondes mesurent cet échantillon isolé ; elles ne valident pas encore le timing d'une vidéo à 4–6 scènes. Prix brut estimé avant gratuité : **0,01041 USD** ; facture et quota gratuit restant inconnus.

Un appel dure au plus 45 secondes, texte limité à 1 000 caractères, réponse à environ 9,4 Mio et WAV à 7 Mio. La mesure portable lit les vrais échantillons PCM 16 bits, rejette les fichiers incohérents, silencieux ou supérieurs à 35 secondes. Le calcul de timing prépare 4–6 scènes sans couper la narration. Après le retour d'Alex sur les pauses, il ne remplit plus systématiquement 30 secondes : durée adaptée, minimum 20 s, plafond 35 s. Le raccourcissement unique du script et la réutilisation des pistes inchangées sont implémentés dans [l'étape narration](NARRATION.md).

## Fixtures sans coût fournisseur

```sh
pnpm exec tsx --test tests/voice.test.ts
pnpm probe:voice --mock
pnpm probe:voice:worker
```

`--mock` intercepte l'appel dans le processus et retourne un signal sinusoïdal synthétique d'une seconde. Aucune connexion à Google et aucune voix réelle. Résultats dans un dossier `mock/` séparé ; les réservations de ce dossier sont elles-mêmes simulées. Les tests couvrent aussi le verrou concurrent, les réponses excessives, la signature RSA réelle avec clé éphémère et le refus d'une clé appartenant à un autre projet.

La sonde `probe:voice:worker` construit un bundle avec Wrangler en `--dry-run`, puis l'exécute sous **workerd local**, sans compatibilité Node. Signature OAuth, conversion base64 et TTS fonctionnent sur une fixture, avec toute sortie réseau interdite. Aucun Worker n'est déployé et aucun accès réel à Google n'est déduit de ce test.

## Tarifs et suivi

Tarif public vérifié le 28/09/2026 : **1 million de caractères gratuits par mois pour Chirp 3 HD**, puis **30 USD par million**, facturation activée. La capture de console fournie par Alex affiche **25,746 EUR par million après 1 million** ; ce prix affiché n'est pas une facture. Le quota gratuit restant du compte n'est pas connu du connecteur.

Le rapport distingue caractères envoyés, octets UTF-8, prix daté avant gratuité, provision et facture inconnue (`null`). L'API ne renvoie pas un compteur d'usage facturé dans la réponse de synthèse. Une absence de compteur ne vaut pas zéro euro. Les identifiants fournisseur absents restent `null`. Les erreurs sont des codes stables sans corps Google, clés ni jetons.

Sources primaires : [activation](https://docs.cloud.google.com/text-to-speech/docs/get-started), [authentification](https://docs.cloud.google.com/text-to-speech/docs/authentication), [OAuth de compte de service](https://developers.google.com/identity/protocols/oauth2/service-account), [Chirp 3 HD](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd), [REST synthesize](https://docs.cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize), [quotas](https://docs.cloud.google.com/text-to-speech/quotas), [tarifs](https://cloud.google.com/text-to-speech/pricing).
