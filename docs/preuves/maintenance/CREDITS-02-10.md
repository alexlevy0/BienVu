# Crédits BienVu — 2 octobre 2026

Barème confirmé par Alex : 1 crédit par vidéo, plus 1 par photo animée avec Runway. Gratuit 3/mois, Plus 40/mois à 19 € HT, Pro 120/mois à 49 € HT. Aucun report. Essai anonyme : 1 crédit offert, sans Runway ; récupération après connexion sans débit supplémentaire. Paiements non ouverts.

## Implémentation

Contrat partagé de tarification, sélection par photo (jusqu’aux 12 photos déjà admises), coût affiché avant lancement, compteur dans la barre latérale, portefeuille et historique privé paginé sur la page des offres, détails des crédits dans Super admin. Choix des animations conservé lors du réordonnancement ; retirer une photo retire son animation.

La migration `0031_product_credits.sql` réserve atomiquement le maximum dans l’allocation d’origine. La fin réussie débite 1 + le nombre d’animations effectivement figées dans le manifeste ; un échec libère toute la réservation. Le règlement terminal est unique, les versions de barème et montants réservés sont immuables. La restitution ne recharge pas une période suivante. Les provisions fournisseurs, le stock Runway et les contrôles mensuels restent séparés.

Les anciennes demandes gardent leur version 0, leur coût initial d’un crédit, leurs réservations, leurs empreintes et leurs fichiers. Les nouveaux essais anonymes version 1 utilisent leur cadeau de session ; leur rattachement donne les droits sur le master sans financer une nouvelle réservation. Les anciens essais gardent le déblocage historique. Les routes privées vérifient toujours le propriétaire et la rétention. Le partage public demeure explicite, jamais automatique.

Les périodes gratuites sont ancrées à l’inscription vérifiée. Les allocations payantes historiques sont conservées. Les futurs renouvellements Plus/Pro restent à connecter à la facturation du sprint 08 ; sélectionner une offre dans l’interface ne crée aucun droit payant.

## Vérifications

Tests D1/workerd/R2 : réservation/rejeu concurrent, budget insuffisant, remboursement partiel et complet, journal fournisseur conservé, cadeau anonyme, propriété, récupérations privées par plages, compatibilité des essais anciens, migration sur base remplie. Trois animations par photo sont préparées sur fournisseur simulé et intégrées au manifeste avec une timeline complète ; reprises sans nouvel appel. Les limites API prépayées incluent toujours les vérifications externes.

Chromium local à 1536, 390 et 320 px sur APIs interceptées : sélection/réordonnancement, coût de 3 crédits pour deux animations, requête exacte, nouvelle page d’offres 3/40/120, calculateur quatre animations = cinq crédits, historique et absence de débordement. Captures inspectées. Aucun fournisseur réel ni crédit utilisateur dépensé dans ces parcours.

Build OpenNext, bundle Remotion, types complets et frontières (199 fichiers) réussis. Nouvelle image Linux amd64 : trois images rendues aux frames 30/250/450, sous utilisateur `node`, sans réseau ; captures inspectées. Trois occurrences d’un clip déjà payé sont utilisées comme fixture de lecture : cette fixture ne prouve pas trois nouvelles animations d’annonce. Aucun nouvel appel OpenAI, Fish, Google ou Runway. Traces et sauvegardes D1 privées sous `evidence/local/product-credits/`, hors Git.

La première suite a signalé trois fixtures obsolètes et une priorité d’erreur : schema arrêté avant la migration nouvelle, réponse d’historique sans son nouveau solde, durée fixe ancienne et pause masquée par le quota épuisé. Corrections apportées, tests ciblés repassés. La suite générale finale exécute 264 tests : 262 réussis, deux erreurs de transport workerd/R2 dans un contexte de forte charge locale build/Docker/tests. Les trois fichiers concernés, y compris les quatre nouveaux tests financiers, sont ensuite exécutés seuls : **15/15 réussis**. Le contrôle Linux réussit également après séparation des tâches. Pas de limite produit élargie pour masquer ces erreurs ; un passage unique `pnpm check` entièrement vert n’est pas revendiqué.

Après publication, Chromium charge les vrais assets du site à 1536/390/320 px sur APIs de recette interceptées : sélection par photo, coût affiché, réordonnancement, requête finale, offres/calculateur/historique sans débordement. Écritures réelles bloquées, aucun fournisseur sollicité. Les prix et crédits sont également relus dans le HTML public réel, sans simulation.

## Publication

Publication à **100 %** : génération `2f629984-6ae4-42fa-a1de-eca2b89a0e06`, web `08c8c53f-c071-4ba6-b6f8-5336608d980a`. Renderer **14**, rollout `completed`, digest `38e9be45b1e99e461b26214531ec03063afb7c0f1ab46c3cf1e99aca48feea53` ; une instance maximum `standard-2` conservée.

Sauvegarde D1 exportée avant migration. Générations suspendues puis rétablies via deux actions administratives auditées, aucun job actif. Seule la migration 0031 était en attente et a été appliquée. **259 lignes dans 13 tables historiques** comparées par empreinte de leurs colonnes originales avant/après : identiques, y compris allocations, requêtes, fichiers, coûts et animation réelle. Aucun défaut de clé étrangère. **28/25 bindings** et paramètres de compatibilité strictement conservés, secrets inchangés.

État final : 13 jobs, aucun actif, une animation Runway, aucun abonnement commercial ; 3 crédits gratuits configurés. Provisions du service **45,35 € avant/après**, coupure 90 €, enveloppe autorisée 100 €. Aucun achat ni appel fournisseur. Accueil/offres/connexion 200 ; historique de crédits et admin anonymes 401. Une nouvelle génération complète sur Cloudflare avec débit de plusieurs crédits n’a pas été lancée pour cette recette ; la réservation et le règlement sont validés en D1/workerd locaux avec fournisseurs simulés.

Commandes : `pnpm check`, `pnpm typecheck`, tests ciblés avec `tsx --test --test-concurrency=1`, `pnpm build:web`, bundle renderer, dry-run pipeline, Docker Linux sans réseau, `wrangler d1 migrations apply DB --remote`, déploiement moteur avec `--keep-vars --containers-rollout immediate`, puis web avec `--keep-vars`. Références : [migrations D1](https://developers.cloudflare.com/d1/reference/migrations/) et [commandes Containers](https://developers.cloudflare.com/containers/reference/wrangler-commands/).
