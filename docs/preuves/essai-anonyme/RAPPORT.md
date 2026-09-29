# Essai anonyme — recette locale du 29 septembre 2026

**Implémenté localement, non déployé, nouveaux essais désactivés.** Le code utilise Better Auth, les allocations/réservations D1, l’outbox/Workflow, le contrôleur de rendu et R2 existants. Aucun service acheté, aucun appel fournisseur payant ni aucune mutation Cloudflare distante pendant cette tâche. Les modifications UI présentes avant cette tâche sont conservées.

[Configuration et architecture](../../ESSAI-ANONYME.md) · [Suivi](../../SUIVI.md) · [Budget](../../BUDGET-ET-OFFRES.md).

## Ce qui est livré

- Session opaque HttpOnly persistée, reprise du même job, Turnstile vérifié côté serveur, limites durables et IP sous HMAC à rétention courte. Connecteurs anonymes limités à Century 21, Orpi et Espaces Atypiques, protections réseau du pipeline conservées.
- Master privé créé une fois, dérivée avec filigrane incrusté par FFmpeg et audio copié. L’anonyme n’accède qu’à la dérivée ; le paramètre de variante n’accorde aucun droit.
- Récupération atomique après authentification vérifiée, pendant ou après le rendu. Même identifiant, une entrée privée dans Mes vidéos, une réservation/consommation ; aucun import, texte, voix ou rendu déclenché par le téléchargement.
- Trois crédits gratuits par période mensuelle ancrée à l’inscription UTC, sans cumul ; fin de mois rabattue au dernier jour puis retour à l’anniversaire initial. Priorité et périodes des allocations existantes conservées. Compte épuisé : propriété conservée, aperçu accessible, master verrouillé jusqu’à affectation d’un crédit.
- Streaming privé avec GET/HEAD/Range et contrôle du crédit, origine contrôlée, retour d’authentification fixe, aucune publication automatique. Nettoyage des essais non récupérés après 24 h, arbitrage atomique contre la récupération, reprise de purge et conservation des ressources encore référencées.
- Accueil et retour de connexion dans le studio existant, étapes réelles sans faux pourcentage, aperçu complet, expiration et CTA explicites. Saisie manuelle invitée préexistante conservée.

Fichiers principaux : migrations `0017_anonymous_trials.sql` et `0018_anonymous_budget_ceiling.sql`, `packages/db/src/anonymous.ts`/`credits.ts`/`generation.ts`, `apps/web/lib/trials.ts`/`generations.ts`, routes `/api/trial`, composants `anonymous-trial.tsx`/`trial-return.tsx`/`generation-detail.tsx`, `apps/pipeline/src/trial-cleanup.ts`, adaptation du Workflow/contrôleur vidéo et `apps/renderer/src/listing-render.ts`.

## Tests automatisés : services externes simulés

Les tests ordinaires utilisent de vrais runtimes **workerd, D1, R2, Durable Objects et Workflows locaux** selon le scénario. Les réponses de portails, Google, OpenAI, Turnstile et du moteur vidéo sont simulées dans ces tests ; leurs octets MP4 de fixture ne prouvent pas un rendu.

| Risque | Vérification |
|---|---|
| Doubles soumissions et callbacks | Admission concurrente, unicité du job/coût, deux claims simultanés, un seul crédit, un seul propriétaire |
| Connexion pendant le rendu | Allocation réservée au claim et consommée à la fin ; échec libérant la réservation, coût/tentative conservés |
| Période mensuelle | 31 janvier, février bissextile/non bissextile, retour au 31 mars ; règlement sur la période originale |
| Quota épuisé et abonnements | Vidéo privée verrouillée, affectation ultérieure idempotente, aucun repli gratuit autour d’un abonnement existant |
| Reprise du traitement | Outbox avant lancement, publication R2 interrompue puis récupérée, mêmes appels et fichiers, pas de seconde génération |
| Autorisation média | Anonyme/autre session/autre agence refusés, variante forcée inefficace, requêtes partielles, cache privé, contrôle du crédit |
| Coût et anti-abus | Session/IP/jour/mois/concurrence, jeton Turnstile invalide/expiré/autre hostname/action/rejoué, source interdite et garde-fous SSRF existants |
| Budget du pilote | Ancien plafond à 35 € sans effet sur la coupure anonyme à 25 € ; les 0,50 € du futur import entrent dans le contrôle ; refus sans provision supplémentaire |
| Expiration et purge | Claim contre transition d’expiration, effacement R2 et charges utiles non référencées, fichier récupéré conservé, empreinte/proof expirées inutilisables |
| Migration | Base peuplée avant 0017, ancien MP4 et crédit consommé, job ancien actif, propriétaires/périodes/compteurs conservés, clés étrangères cohérentes |
| Confidentialité | Aucun partage Explorer au claim ; événements idempotents sans token, URL complète, adresse ou IP brute |

Commande complète retenue : `pnpm check:boundaries`, puis `pnpm exec tsx --test --test-concurrency=1 tests/*.test.ts`, puis `pnpm typecheck`. **173 tests réussis, zéro échec**, en 85,4 s ; frontières sur 143 fichiers et TypeScript complet réussis. Exécution en série pour ne pas saturer workerd avec le navigateur et Docker. Les premiers essais parallèles avaient subi des resets/timeouts de runtimes locaux ; aucun succès de `pnpm check` en parallèle n’est revendiqué. Les erreurs initiales des nouvelles fixtures ont été corrigées avant la recette finale.

Il n’existe pas de script lint/ESLint dans ce dépôt. Frontières, TypeScript des packages/applications/tests, build et diff constituent les contrôles statiques disponibles.

## Vrais MP4 locaux, médias d’entrée synthétiques

`pnpm probe:trial:video --docker-ffmpeg bienvu-video:sprint-06-final` a réellement rendu le master avec Remotion natif puis la dérivée avec FFmpeg de l’image Linux déjà disponible. Aucun pull, aucune construction d’image et aucun réseau dans le conteneur. FFmpeg 5.1.9 complet est nécessaire : le binaire allégé livré par Remotion sur ce Mac ne possède pas le filtre overlay.

L’annonce, les trois images de couleur et le signal audio sont des **fixtures synthétiques**. Les textes français sont ceux du scénario de test, pas la preuve d’un nouvel appel de voix française. Le signal permet de vérifier présence, niveau et identité de l’audio ; aucune nouvelle écoute humaine de narration n’est revendiquée.

Mesure finale du 29/09 à 12:27 UTC, Node 24.17.0 / Remotion 4.0.529 :

| Mesure | Master | Aperçu |
|---|---:|---:|
| Dimensions / cadence | 1080 × 1920 / 30 fps | 1080 × 1920 / 30 fps |
| Images / durée conteneur | 603 / 20,16 s | 603 / 20,16 s |
| Codecs / faststart | H.264, AAC / oui | H.264, AAC / oui |
| Taille | 916 863 octets | 900 461 octets |
| Rendu/post-traitement et vérification | 120,19 s | 45,68 s |
| Volume audio mesuré | −22,845 dB | −22,845 dB |
| Filigrane incrusté | absent | présent |

Le flux AAC extrait est strictement identique par SHA-256. Les images 0, 301 et 602 ont été extraites et inspectées : filigrane visible sur toute la séquence échantillonnée, absent du master, texte/captions conservés. L’overlay n’a pas de condition temporelle : il s’applique à toutes les frames. Les différences moyennes de pixels dans sa zone sont respectivement 61,43 / 88,08 / 61,51. La carte finale neutre n’invente pas de coordonnées d’agence.

SHA-256 master : `f4f569973ee785995a4c527dd2f0227b44b3f5839bb10ce6b4c1235ad72dc460`.

SHA-256 aperçu : `cfe24baaee06d414616c1f19c835ca08b6bb201f1848a519dc20d43fd0ed49ab`.

Une première exécution locale avait mesuré 86,43 s et 46,26 s. Le second passage ci-dessus utilise le manifeste final (provision de dérivée et couleurs neutres). Ce sont des temps muraux locaux variables, **pas des mesures de CPU ou de facture Cloudflare**. Les deux exports ne sont jamais refaits au téléchargement.

## Les vrais fichiers à travers les routes privées

`pnpm probe:trial:media` réussi à 12:29 UTC : ces deux fichiers exacts sont chargés dans **R2 local** avec D1/workerd et servis par les véritables fonctions de streaming. Identité, propriété initiale et état du job sont semés comme fixtures ; aucun OAuth ni vrai Turnstile dans cette sonde.

- Cookie anonyme : réponse égale au SHA-256 de l’aperçu, même avec `variant=master&download=1`, disposition inline et cache privé.
- Master refusé avant récupération ; autre session sans preuve et autre propriétaire refusés.
- Deux claims simultanés puis deux téléchargements : SHA-256 du master conservé, **deux crédits restants, une entrée d’historique et zéro partage public**.
- Après attribution, l’ancienne route anonyme refuse le fichier ; la route du compte continue à le servir. Une plage de 1 024 octets correspond exactement au début du master.

Les premières tentatives de cette nouvelle sonde ont révélé un commentaire SQL mal aplati par le chargeur de fixture et une configuration auth synthétique incomplète. Corrections locales, aucun appel externe ; le passage final ci-dessus réussit.

## Interface et build

La sonde `pnpm probe:trial:ui` utilise Chromium en **1536 × 1024 et 390 × 844**, les vraies pages du studio et les MP4 locaux. Ses API, son compte et son widget Turnstile sont **simulés**. Son localStorage appartient uniquement au harnais de test, jamais à la preuve de propriété de l’application.

Scénarios : soumission au clavier, défi, état de rendu, rechargement sans second lancement, lecture réelle du média dans le navigateur, aperçu sans bouton de téléchargement anonyme, annulation OAuth et retour à l’aperçu, connexion e-mail simulée puis même résultat avec CTA de téléchargement, absence de preuve dans un autre navigateur et message de limite. **Passage final réussi sur les deux formats à 12:34 UTC**, sans débordement horizontal ; captures d’aperçu et de téléchargement mobile inspectées. L’attente du jeton simulé a été synchronisée avec le rendu React après une course du harnais de test sur le build de production. Pas de téléphone physique ni de Safari déclaré testé.

Build **OpenNext réussi**, bundle Remotion réussi, typegen Wrangler réussi. Dry-runs Wrangler web et pipeline génération réussis, sans déploiement ; l’option de non-construction Containers préserve l’image distante. Avertissement non bloquant de bundle upstream `fast-png` consigné ; aucune erreur de build. Aucun nouveau package tiers ajouté.

## Configuration, migrations et coût

Les migrations 0017/0018 sont appliquées **localement uniquement**, après export de sauvegarde D1 dans le dossier de preuves ignoré. Contrôle final : `enabled=0`, `free_enabled=0`, `budget_ceiling_cents=2500`, `PRAGMA foreign_key_check` sans erreur ; configuration web `ANONYMOUS_TRIALS_ENABLED=false`. Les clés Turnstile et le secret `TRIAL_IP_HMAC_SECRET` ne sont pas renseignés dans l’environnement local de l’application. Le refus est explicite, sans faux résultat produit.

La nouvelle demande fixe 30 € pour l’ensemble du service. Dernier total documenté : **29,85 € de provisions**, pas une facture rapprochée. La migration 0018 ajoute une coupure anonyme configurable à **25 €** sur le registre global existant, sans effacement des anciennes réservations ni relèvement du plafond. Une URL anonyme réserve prudemment **2 €** (1,20 € génération + 0,30 € dérivée + 0,50 € import). Les sous-journaux voix/rendu font partie de ce total. La provision dérivée n’est pas présentée comme son coût réel.

Cette tâche : **0 achat, 0 appel OpenAI/Google/Browser Run/Containers distant**. Les provisions existantes ne sont pas remises à zéro. Aucune nouvelle génération payante ne doit être ouverte sur les 0,15 € théoriques restants.

## Vérification externe restant à réaliser

Après choix d’un environnement, capacité budgétaire rapprochée et instruction de déploiement :

1. Configurer un widget Turnstile Managed pour le hostname exact, sitekey/secret et un secret HMAC serveur ; conserver la vérification d’adresse et les retours Google existants.
2. Sauvegarder D1 distante, appliquer 0017/0018, livrer ensemble web, pipeline et image renderer. Ouvrir explicitement les portes de lancement et sous-enveloppes uniquement dans cet environnement.
3. Limiter la recette à un lien de connecteur autorisé : vrai Turnstile, import, script/voix français, master et dérivée sur Containers/R2 ; écouter et inspecter les deux fichiers.
4. Rejouer Google et e-mail réels avec ce nouvel essai : annulation, confirmation d’adresse, récupération pendant/après rendu, compte neuf à deux crédits, compte épuisé, autre navigateur sans preuve, rejeu sans nouvelle dépense et téléchargement étranger refusé.
5. Mesurer les ressources/couts du pipeline complet et de la dérivée, rapprocher la facture et contrôler le cron distant. Vérifier un téléphone réel avant de déclarer cette recette mobile complète.

Les succès Google, e-mail, narration et Containers des sprints précédents ne démontrent pas cette combinaison nouvelle. **La faisabilité distante complète de l’essai anonyme n’est pas déclarée validée.**

Contrôles finaux : `git diff --check` réussi, 325 liens documentaires relatifs sans cible manquante ; 446 fichiers candidats Git, dont 432 textuels, examinés par recherche de formats de secrets. Trois correspondances de marqueur PEM vérifiées : construction de clés éphémères de fixture et expression de validation, aucune clé réelle détectée. Ce contrôle ciblé n’est pas une preuve d’audit exhaustif. Serveur de recette arrêté et aucun conteneur Docker de recette conservé.

Preuves locales ignorées : `evidence/local/anonymous-video/` (MP4, captures, manifeste, rapports et accès), `evidence/local/trial-ui/` (captures/rapport navigateur), `evidence/local/trial-migration/before.sql` (sauvegarde privée). Seul ce compte rendu expurgé est destiné à Git.
