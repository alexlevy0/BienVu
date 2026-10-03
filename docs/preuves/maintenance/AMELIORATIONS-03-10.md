# Montage, confiance, agence et paiement — 3 octobre 2026

Les quatre étapes demandées par Alex sont implémentées et publiées, dans l’ordre : montage, aperçu/crédits/imports, usage d’agence, puis paiement/équipes/suivi commercial. Stripe reste en **mode test**. Cette livraison n’ouvre aucun encaissement réel.

## Fonctionnement livré

- **Montage :** cadrage et mouvement par photo, départ/arrivée personnalisés, normalisation mesurée de la voix et de la musique, fondus, baisse de musique pendant la parole, contrôle des médias et textes avant export. La caméra et les enveloppes de mixage sont partagées entre aperçu et renderer. Les WAV d’origine ne sont pas réécrits.
- **Confiance et crédits :** « Aperçu complet » prépare le MP4 final après confirmation du coût et des droits. Une même version sauvegardée retrouve son export sans deuxième réservation. La bibliothèque privée réutilise les animations compatibles pendant 90 jours, sans nouvel appel Runway ni supplément. Chaque export conserve sa copie. Un téléchargement de photo bloqué expire après huit secondes sans perdre les faits et les autres photos de l’annonce ; les contrôles de sécurité restent applicables.
- **Agence :** `/projets` propose dossiers par bien, modèles d’agence et validations client privées. Les exports suivent le dossier de leur brouillon. Les modèles remplacent les champs du bien et la marque, sans importer les médias et la narration d’une autre annonce. Les liens de validation sont révocables, limités à sept jours et liés à un manifeste figé ; commentaires horodatés et approbation. Aucun e-mail n’est envoyé automatiquement.
- **Commercial :** `/equipe` propose invitations par adresse confirmée, rôles lecteur/éditeur/administrateur/propriétaire et choix de l’agence active. Les données, médias et crédits restent séparés par agence. `/abonnement` ouvre Checkout et le portail Stripe. Super admin → Conversion & recettes distingue paiements réels et de test, cohortes de comptes et essais, activité des agences, réutilisation des animations et coûts connus.

La nouvelle tarification réserve **1 crédit vidéo + 1 par nouvelle animation**. Une animation réussie est conservée et débitée même si le montage échoue ; le crédit vidéo et les animations échouées sont libérés. Une animation réutilisée n’est pas refacturée. Les anciennes générations conservent leur barème et leurs empreintes. Les coûts fournisseurs, les provisions en euros et le portefeuille client restent distincts.

Le contrôle des textes estime leurs dimensions ; il ne remplace pas la relecture visuelle. Le solde commercial affiché est partiel : frais Stripe, remboursements, coûts d’hébergement non rapprochés et montants USD ne deviennent pas une marge nette ou un taux de change inventé.

## Stripe configuré

Compte de test vérifié : `acct_1UMFD2ElEcMhrWtb`. Plus : **19 € HT/mois et 40 crédits** ; Pro : **49 € HT/mois et 120 crédits**. Pas de report mensuel. Le portail permet coordonnées, moyen de paiement, factures et résiliation à l’échéance ; les changements de formule passent encore par le support.

Webhook créé : `we_1UMFm0ElEcMhrWtb1NZhz6pm`, destination **`https://bienvu.online/api/billing/webhook`**. Son secret est enregistré dans `.env.billing` (0600, hors Git) et dans les secrets serveur Cloudflare, avec la clé test, les deux prix et la configuration du portail. Aucun secret n’est présent dans ce document ou dans les fichiers exemples.

Les outils MCP Stripe n’étaient pas exposés dans cette conversation malgré le plugin installé ; la configuration autorisée a utilisé le SDK officiel **23.0.0**, API **2026-09-30.endive**, avec la clé fournie. Checkout fixe `managed_payments.enabled=false` pour cette intégration, sans modifier le réglage global du compte. `BILLING_MODE=test`, `STRIPE_AUTOMATIC_TAX=false` : aucune inscription fiscale n’a été vérifiée.

Le webhook vérifie corps brut, signature, délai et mode, puis récupère facture et abonnement auprès de Stripe. Seule une facture payée, EUR, associée au client de l’agence, au prix approuvé et à une période mensuelle complète crée l’allocation. Le retour Checkout ne suffit pas. Journal d’événements, facture unique et période unique protègent du rejeu ; annuler conserve les crédits de la période payée jusqu’à son échéance.

## Vérifications

**`pnpm check` final : 282/282 tests, zéro échec**, frontières de 250 fichiers, typage de tous les packages et des tests. Builds OpenNext, bundle de rendu et dry-runs réussis. Un passage précédent avait deux erreurs de transport workerd sous charge locale ; les 12 contrôles concernés puis la suite complète ont repassé sans modifier les limites produit ni affaiblir les assertions.

Les tests protègent réservation/restitution/rejeu, conservation des anciens jobs, bibliothèque et purge, isolation D1/R2, factures et renouvellements, équipes et révocation, modèles, liens client et conflits d’édition. La réutilisation des animations vérifie également le réordonnancement des photos et le partage d’une animation par des plans scindés.

**API Stripe réelle en test :** Checkout idempotent, moyen de paiement `tok_visa`, abonnement Plus et facture effectivement payée **1 900 centimes** récupérée auprès de Stripe. Livraison signée dans une **D1 locale isolée** : 40 crédits, une seule facture après rejeu. Ouverture réelle du portail. Abonnement de recette annulé et Checkout fermé ensuite. Aucun paiement réel ni allocation payante dans la D1 publiée.

**Site publié :** sept pages 200, neuf routes privées 401 sans connexion. Webhook sans signature ou avec mauvaise signature 403, événement test signé sans effet financier 200, rejeu 200 avec une seule ligne de journal, événement du mauvais mode 403. Cette sonde confirme la signature et le journal dans le runtime hébergé ; elle ne prétend pas livrer la facture de recette à la base publiée.

**Navigateur local puis publié :** Éditeur à 1536/1280/390 px ; dossiers, modèles, équipe, paiement et validation client à 1536/390 px. Aucun débordement horizontal ; captures desktop et mobile inspectées. Lecture HTMLAudio, une seule piste vocale à la fois, pause/seek, reprise de la voix, sous-titres, caméra, mixage, confirmation de l’aperçu complet, sauvegarde/rechargement, conflits, photos et musique. Dossier créé, onglets parcourus, invitation copiée, agence sélectionnée, mention Stripe test et consentement explicite vérifiés ; lecteur client et approbation. **Les comptes, API et médias de ces parcours navigateur sont interceptés** : aucune invitation, modification de compte, facture ou génération publique n’a été créée par ces fixtures.

**Vrai MP4 natif :** 1080 × 1920, H.264/AAC, 600 frames, 20,053333 s, fast-start, 12 720 582 octets, volume moyen mesuré −24,17 dB. Captures inspectées. Les médias et la voix proviennent de ressources existantes ; une musique technique sert à vérifier le mixage. Les faits édités et la narration de fixture ne correspondent pas tous : ce fichier est une preuve technique, pas une démonstration fidèle d’un bien.

**Docker Linux/amd64 réel :** utilisateur non privilégié, réseau coupé, rendus vertical/horizontal, trois références à une animation déjà disponible et MP4 musique seule de 2,048 s. Le délai de la sonde a été porté à 120 s pour l’émulation locale ; les limites applicatives ne changent pas. Aucun nouvel appel OpenAI, Fish/Google ou Runway.

**Lecture commerciale distante :** les six requêtes du panneau sont exécutées sur la D1 publiée, sans écriture : trois comptes confirmés, deux avec vidéo terminée, sept essais anonymes dont six terminés, aucune facture réelle ou de test attribuée à une agence. Les résultats sont des cohortes applicatives, pas des visiteurs uniques.

## Publication et conservation

Sauvegarde SQL distante avant migration, puis migrations additives **0034 à 0038**. Comparaison par empreintes des colonnes originales : **13 tables / 292 lignes historiques identiques**, zéro erreur de clé étrangère. Les anciens médias, allocations, réservations, journaux de coûts et manifestes sont conservés.

Admission suspendue durant la migration et le déploiement, puis rétablie. **15 jobs, zéro actif** au contrôle final. Les budgets et plafonds sont strictement inchangés : base octobre **37,25 €**, imports réservés **12,50 €**, engagement **49,75 €**, coupure **90 €**, enveloppe autorisée **100 €**, aucune pause. Aucun crédit client dépensé par la recette. Les coûts de déploiement et de calcul restent soumis au rapprochement de la facture Cloudflare ; aucun surcoût fournisseur n’est assimilé à une facture nulle.

| Service | Version publiée à 100 % |
|---|---|
| Web | `c5139089-3e90-4f37-9658-0c26f58e99c5` |
| Génération | `e0d8c664-ac27-458f-b7a4-1da4948a62af` |
| Import | `dc96f411-4491-4c4f-8627-9d0b58a018f4` |

Renderer **v16**, digest `478ed742a9b9fa18734e98cacad16ff7891b569b38509477057ce04bd354e667`, rollout `f72e9770-a275-4091-b515-adfe84afa94d` terminé, une instance saine. Capacité inchangée : maximum une instance, 1 vCPU, 6 GiB, disque 12 GB. Image d’import inchangée. Anciens bindings, secrets, dates et flags conservés ; web **25 → 32** pour cinq secrets Stripe et deux variables de mode/taxe, génération **28**, import **9**.

## Commandes et preuves privées

Commandes exécutées : `pnpm check`, `pnpm typecheck`, `pnpm build:web`, tests ciblés, bundle Remotion, Docker Linux, publication du digest au registre Cloudflare, `wrangler d1 export DB --remote`, `wrangler d1 migrations apply DB --remote`, `wrangler secret bulk`, déploiements avec `--keep-vars` et rollout immédiat du renderer.

Preuves hors Git dans `evidence/local/roadmap/` : `ledger-before/after.json`, `deployment-before/after.json`, `d1-before.sql`, `stripe-real-test.json`, `http-published.json`, `commercial-live-read.json`, `ui-published/report.json`, `workspace-ui-published/report.json`, `render/report.json` et `render/linux-result/linux/report.json`. Les scripts de recette réelle Stripe et de vérification publiés sont dans ce même dossier privé. `.env.billing` et la sauvegarde SQL sont de permissions 0600. Serveurs de recette, navigateurs automatisés et conteneurs de vérification fermés.

## Limites et reprise

Aucun nouvel export complet payant n’a été relancé sur Cloudflare pour cette recette. Le MP4 natif/Linux, les tests de workflow et les contrôles du runtime publié sont des preuves distinctes. Aucune nouvelle écoute humaine de cette recette n’est revendiquée. Les protections du pilote, dont limites de lancement et budget mensuel, restent applicables aux abonnements de test.

L’encaissement réel nécessite la configuration Stripe live, son webhook, les informations légales et le traitement fiscal adaptés. Il n’est pas activé par la présence de clés de test. Les courriels d’invitation et de validation ne sont pas automatisés.

Pour un retour arrière, suspendre les admissions et attendre la fin des jobs, puis restaurer les versions web `9d4b05a8-4754-4811-92ac-11005bfda0ae`, génération `d1641b69-0b66-4c48-bf91-4af334bc2085`, import `a8b9e204-2585-4bb4-81cb-79099467dd01` et l’image renderer v15 `af3e3ba5724a357b6db5670af70ebe8d33df97c83cd85c79d4a2d28519d8ef72`. Conserver les migrations additives, les budgets et les écritures intervenues depuis ; ne pas restaurer une sauvegarde ancienne par-dessus de nouvelles données. Vérifier compatibilité et droits avant de rouvrir. Aucun commit/push de cette livraison n’a encore été demandé.
