# Prix abrégés et description — 30 septembre 2026

## Correction

L'extraction reconnaissait le prix, mais son contrôle de preuve n'acceptait que les montants écrits entièrement devant « € » ou « euros ». Une preuve `200k€` était donc rejetée. Le champ de description recopiait ensuite systématiquement la demande de l'utilisateur.

`packages/narration/src/extraction.ts` vérifie maintenant les milliers (`k`/`K`), les millions avec devise euro, les décimales et les montants EUR usuels. Un prix de vente abrégé, unique et explicite peut être récupéré à partir du texte si le modèle l'a omis. Les devises étrangères, nombres négatifs et abréviations non monétaires reconnues ne sont pas convertis en euros. Plusieurs montants différents, une transaction absente ou une ambiguïté déclarée empêchent cette récupération automatique. Un prix ambigu retenu continue à demander confirmation. Le prompt rappelle la conversion en centimes, sans modifier le schéma Responses ni ajouter d'appel.

La reformulation locale remplace le début des demandes usuelles « Je voudrais/veux/souhaite… vendre/louer un appartement/une maison/un bien » par une présentation, puis normalise la localisation et le prix acceptés. Les autres détails restent ceux du texte fourni. Une description déjà rédigée reste conservée ; il n'y a pas de génération libre d'adjectifs ou de caractéristiques.

Exemple réel vérifié :

> Je voudrais vendre un appartement a Lyon a 200k€

Prix : **200 000 €**, soit 20 000 000 centimes. Description : **« Découvrez cet appartement à vendre à Lyon, au prix de 200 000 €. »** Surface et nombre de pièces : **absents**, sans invention. `originalText` conserve la phrase exacte ; `apps/web/components/home-create.tsx` l'utilise pour la bulle de demande, indépendamment de la description modifiable.

La recette navigateur a aussi révélé un problème propre au chargement invité : deux identifiants de brouillon absents étaient considérés comme une même version distante, ce qui préservait la demande brute au lieu de la description extraite. `apps/web/components/manual-listing-form.tsx` exige maintenant la présence des deux brouillons avant cette comparaison ; les modifications d'un vrai brouillon déjà sauvegardé restent conservées.

Les brouillons déjà enregistrés et les résultats d'extraction déjà dédupliqués ne sont pas réécrits. Une nouvelle demande depuis l'accueil bénéficie du correctif ; les modifications manuelles restent conservées.

## Vérifications locales

- `pnpm exec tsx --test --test-concurrency=1 tests/creation-workflow.test.ts` : **4 tests réussis**, dont les nouveaux cas de prix abrégés, décimales, millions, omission par le fournisseur, description avec balcon/cave conservés, devise étrangère, kcal/abonnés, montant négatif, contradiction et absence de loyer mensuel. Le test existant exerce aussi les brouillons, versions concurrentes, uploads/reprise, isolation, signalements et garde budgétaire invité sur D1/R2 locaux. Le premier passage du cas non monétaire a montré qu'un `200k abonnés` pouvait être confondu avec un prix ; la lecture de l'unité dans le texte complet a été ajoutée, puis les quatre tests ont passé. Aucun contrat ou garde budgétaire assoupli.
- `pnpm -r typecheck` et `pnpm exec tsc -p tsconfig.tests.json` : réussis.
- `pnpm check:boundaries` : réussi, 163 fichiers.
- Dry-run Wrangler génération avec `--containers-rollout=none` : réussi.
- `pnpm build:web` : compilation Next/OpenNext et typage web réussis après la correction du chargement invité ; dry-run Wrangler web réussi.
- `node scripts/probe-workflow-ui.mjs --price-only` : **4 parcours réussis**, connecté/invité à **1536/390 px**, sur le build de production local. Champ prix égal à `200000`, description reformulée, demande d'origine dans la bulle, surface/pièces vides, aucun POST vidéo et aucun débordement horizontal. Captures ordinateur et mobile inspectées. Fournisseurs, authentification et Turnstile simulés ; aucun test OAuth ou téléphone physique revendiqué.

Les premiers passages de la nouvelle sonde ont permis d'isoler deux situations : un brouillon local hérité du cas connecté empêchait le cas invité de démarrer, puis la session neuve a exposé le défaut de chargement décrit ci-dessus. La sonde isole désormais chaque nouvelle saisie dans son navigateur de fixtures et attend le chargement de l'essai. Une tentative après recompilation a démarré avant l'écoute du serveur local et a échoué avec `ERR_CONNECTION_REFUSED` ; après son état « Ready », les quatre parcours ont réussi. Aucun effacement du navigateur utilisateur ou de données distantes, aucun contrat assoupli.

Les réponses fournisseur des tests sont simulées. Ces tests ne constituent pas des appels Google/OpenAI réels ni un rendu vidéo. Le format de réponse strict existant est conservé ; la [documentation officielle OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs) rappelle qu'un schéma structuré ne garantit pas l'exactitude des valeurs, d'où les contrôles textuels et numériques locaux.

## Test réel et publication du service

Worker de génération **44a79aa9-3040-412d-8054-615917b3856b** publié avec `--keep-vars --strict --containers-rollout=none`. Variables distantes relues avant publication, image existante du renderer conservée, zéro job actif constaté avant déploiement. Aucune construction Docker, modification ou démarrage de Container pour ce test.

**Un seul appel réel** au endpoint authentifié `/extract` de ce Worker, sur la phrase fictive ci-dessus : réponse 200, prix 20 000 000 centimes, description reformulée, Lyon, surface/pièces nulles, texte original conservé. OpenAI retourne **431 tokens d'entrée / 93 de sortie**. Cette vérification concerne le Worker Cloudflare et le vrai fournisseur, sans session utilisateur ni nouveau brouillon HTTP de production. Aucun job vidéo, import de portail, synthèse vocale ou e-mail ; compteurs de crédits d'Alex identiques avant/après. L'interface est vérifiée séparément sur fixtures.

Une provision de **0,05 €** a été ajoutée **avant** l'appel par mise à jour conditionnelle du budget existant, sous le plus bas des plafonds global et pilote, en conservant les compteurs. Au contrôle préalable, le registre était passé à base 30,70 € + imports 12,50 € + provision historique hors D1 0,05 € = **43,25 €** ; ce changement antérieur n'est pas attribué au présent test. Après l'appel : base 30,75 € + imports 12,50 € + historique 0,05 € = **43,30 €/50 €**, marge **1,70 € avant coupure à 45 €**. Aucun achat de crédits ; montant réellement facturé non mesuré. La réservation n'est pas restituée ni additionnée une seconde fois.

Worker web **db558de3-5d99-402c-a93f-ffd0ed3e8407** publié sur `bienvu.online` avec `--keep-vars --strict`. Les variables, services et binding d'envoi e-mail existants ont été relus avant publication. Contrôle Cloudflare réel à **13:48 UTC** : versions web et génération déployées à 100 %, accueil et historique en HTTP 200, image Containers identique à celle relevée avant la maintenance, budget toujours à **43,30 €** avec la provision historique. Aucun nouvel appel fournisseur lors de ces contrôles. Le serveur local de recette sur 8790 a été arrêté ; le serveur utilisateur sur 8787 n'a pas été touché. `git diff --check` et syntaxe de la sonde réussis.

Preuves brutes sous `evidence/local/price-description/` (fichiers protégés et ignorés), captures/rapport de recette sous `evidence/local/workflow-ui/`. La configuration de déploiement temporaire `apps/pipeline/wrangler.staging.price-description.jsonc` est ignorée ; les secrets n'ont pas été modifiés ni affichés.
