# Workflow de création — vérification locale du 29/09/2026

Ce document consigne la **recette locale avant publication**. La version a ensuite été publiée sur `bienvu.online` après la hausse de budget autorisée : [contrôles et limites de la publication](DEPLOIEMENT-29-09.md). Elle réutilise les imports, l'admission des jobs, Workflows, R2, les crédits, l'essai anonyme et le partage volontaire existants. Les anciennes annonces prêtes et les jobs existants gardent leurs accès.

## Fonctionnement livré

- Import URL strict inchangé lorsqu'il est complet. Si seuls certains faits ou médias sont exploitables, l'import privé devient un brouillon `needs_input` sous le même identifiant, sans navigateur ni conteneur en attente. Un refus de sécurité ou de plafond reste un refus.
- Description soumise explicitement : un seul appel OpenAI Responses borné et validé par preuve textuelle, puis cinq sections adaptatives. Le texte d'origine subsiste si le fournisseur échoue. L'extraction ne lance ni voix, ni rendu, ni réservation vidéo. Le visiteur anonyme utilise sa session HttpOnly, Turnstile et des plafonds D1 ; le compte utilise sa propre déduplication. Chaque tentative est provisionnée à 0,05 € sous le plus bas des plafonds D1 existants : pilote 30 € / coupure 25 €, ou ancien registre 40 € / 35 €.
- Photos authentifiées : vérification locale puis upload immédiat vers R2 privé, statut par fichier, retry ciblé et annulation persistée ; les photos déjà reçues se relisent au rafraîchissement. Les fichiers invités restent dans IndexedDB pendant une heure et sont transférés après connexion. Pas de base64 dans localStorage.
- Une seule action de lancement au terme de Validation. Le brouillon reste accessible par Récentes/Mes vidéos ; les jobs actifs alimentent un suivi commun et continuent côté Workflow après navigation. Notification discrète lors d'une transition observée vers « Prête », jamais en masse au premier chargement.
- Résultat privé avec téléchargement selon les droits existants. Signalement accessible dans le résultat et l'historique, propriétaire vérifié, enregistré en D1 avec limites et idempotence. Aucun partage public ni message externe implicite.

## Vérifications réellement effectuées

| Nature | Résultat |
|---|---|
| Fixtures + D1/R2 locaux | `tests/creation-workflow.test.ts` : extraction exacte/absente/contradictoire, texte hostile, import sans photo, import avec données manquantes, version concurrente, upload retiré pendant l'envoi, quota vidéo intact avant admission, isolation entre agences, rapport persisté/idempotent, session anonyme/Turnstile et plafond pilote plus strict que l'ancien registre. |
| Suite locale complète | `tsx --test --test-concurrency=2 tests/*.test.ts` : **175 tests réussis** ; journal local ignoré `evidence/local/workflow-full-tests.log`. Les fournisseurs et rendus de cette suite sont simulés, tandis que D1/R2/Workflows locaux sont exercés selon les tests. |
| Navigateur sur fixtures | `node scripts/probe-workflow-ui.mjs` sur build local : 1536 et 390 px, import partiel, trois uploads immédiats, validation, une admission, navigation Explorer, notification, rechargement Mes vidéos, résultat ; description connectée et anonyme (Turnstile simulé), sans admission ; réponse d'extraction tardive ignorée après modification du texte ; URL sans localisation avec trois photos conservées ; fournisseur invité indisponible avec texte préservé ; échec réseau puis retry d'un signalement en conservant le commentaire. Pas de débordement horizontal. Captures et rapport sous `evidence/local/workflow-ui/` (ignorés). |
| Fournisseur **réel** | Un seul appel OpenAI Responses avec clé locale, sur l'annonce **fictive** « Appartement à vendre à Lyon 6, 65 m², 3 pièces, 280 000 € ». Résultat : Appartement, Vente, Lyon 6, 65 m², 3 pièces, 28 000 000 centimes ; chambres et DPE absents. Usage retourné : 382 tokens d'entrée, 101 de sortie. `scripts/probe-description.ts` et preuve locale ignorée `evidence/local/workflow-description/real-provider.json`. Aucun rendu ni TTS. |
| Compilation | Types des packages/apps/tests, frontières, build Next 16 en mode standalone, bundle OpenNext, dry-run Wrangler web et génération. Le dry-run génération a construit puis supprimé son image Docker locale ; rien n'a été déployé. |

Le coût facturé de l'unique appel OpenAI réel n'est pas certifié par cette sonde ; 0,05 € sont provisionnés prudemment dans le [budget](../../BUDGET-ET-OFFRES.md) et dans son rapport local, soit 29,90 € au total connu. Les tests ordinaires ne représentent pas des appels fournisseur, une recette sur Cloudflare, une facture contrôlée ni une lecture sur téléphone physique.

## Liste de contrôle établie avant activation sur bienvu.online

1. Rapprocher la facture et la marge sous le **pilote 30 €/mois, coupure 25 €** demandé le 29/09. Le registre historique 40 €/35 € reste conservé, mais l'extraction utilise le plafond le plus strict. Le cumul prudent est 29,90 € : **aucune marge actuellement pour un appel via le parcours hébergé**. Vérifier le mois actif de `hosted_import_budget` : l'absence d'une ligne non pausée ferme l'extraction.
2. Sauvegarder D1, appliquer 0019, puis publier ensemble le Worker de génération et le web avec leurs secrets et Service Bindings existants. Cette tâche n'a exécuté aucune migration distante et aucun déploiement.
3. Sur un compte de recette autorisé, vérifier une annonce URL vraiment partielle et son complément sans second scraping, ainsi qu'un texte soumis depuis le domaine. Vérifier une session anonyme réelle avec Turnstile, puis sa connexion et la récupération du **même** job filigrané ; ne pas lancer une série de rendus payants.
4. Constater D1/R2, crédit unique, navigation et notification sur le domaine, puis déposer un signalement de recette et le consulter en D1 administratif. Vérifier Safari/téléphone physique séparément. Les refus actuels de certains portails restent des refus ; cette fonction ne garantit pas leur acquisition.

Les signalements privés se consultent avec les accès administratifs D1 par `SELECT id,job_id,category,comment,status,created_at FROM generation_reports WHERE status='new' ORDER BY created_at;`. Ne jamais exporter les commentaires dans Explorer ou dans des logs publics.
