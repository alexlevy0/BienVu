# Qualité IA et PostHog

## Fonctionnement sans nouvelle génération

Le suivi lit les journaux des traitements réellement demandés par les utilisateurs. Il ne lance aucune nouvelle requête OpenAI, Cartesia, Fish, Google TTS ou Runway. Aucune clé de juge LLM n'est nécessaire. Les évaluations natives PostHog sont exclusivement de type `hog` : elles lisent les contrôles calculés par BienVu. Les coûts ordinaires d'infrastructure et les quotas PostHog restent ceux des services existants.

Le superadmin dispose d'un onglet **Qualité IA** : filtres par période, source et origine ; couverture des contrôles ; générations à examiner ; description source, faits confirmés, narration finale et texte réellement envoyé au TTS ; lecture privée de la vidéo et des pistes ; verdict humain et jeu de référence exportable.

## Ce qui est contrôlé

Les contrôles versionnés `bienvu-quality/1` portent sur le snapshot de narration, jamais sur une fiche modifiée après la génération. Les prix en euros, surfaces et nombres de pièces numériques sont comparés aux faits confirmés. Les chambres ne deviennent pas des pièces. Le type vente/location, certains suppléments et négations explicites, les paragraphes strictement répétés, le timing des pistes, le niveau RMS, la saturation PCM et la présence du rapport de vérification du rendu sont suivis.

Une alerte ne bloque pas la vidéo et n'affirme pas qu'elle est erronée : une surface annexe ou un prix de garage peut être légitime. Les nuances de description, la prononciation, l'esthétique et la fidélité visuelle des animations demandent une écoute ou un visionnage humain. Les anciennes synthèses ne sont pas régénérées pour obtenir des mesures manquantes.

**Dénominateurs :** conformité = conformes / (conformes + alertes). Les N/A, erreurs techniques et contrôles en attente sont comptés séparément. Un taux de conformité ne mesure pas la qualité globale et ne remplace pas le verdict humain. Le réglage d'échantillonnage concerne uniquement les relectures proposées, par tirage stable ; il n'entraîne aucun appel IA.

## Événements et traces

| Événement | Signification |
| --- | --- |
| `$ai_generation` | Une requête LLM existante d'extraction ou de sélection de narration, avec usage lorsqu'il est connu. |
| `$ai_trace`, `$ai_span` | Traitement vidéo et étapes voix, animation, compilation finale, carte et rendu. Les fournisseurs non LLM ne deviennent pas de fausses générations. |
| `ai_quality_run` | Une tentative terminée, réussie ou échouée, et son bilan. |
| `ai_quality_check` | Un contrôle versionné et son résultat pass/fail/na/error. |
| `ai_quality_review` | Verdict humain : problème, faux positif, choix volontaire, validation. |
| `ai_stage_completed` | Durée mesurée disponible d'une étape. |
| `ai_import_completed`, `ai_publication_completed` | Résultat serveur d'un import ou d'une destination sociale. Le délai de publication comprend l'attente d'une programmation. |

La trace vidéo est stable par job/tentative. Une requête fournisseur reste dédoublonnée par son identifiant de journal, même lors d'une reprise. Les appels historiques sans prompt conservé sont explicitement marqués comme reconstruits ; leur contexte ne prétend pas être le prompt original. Les nouvelles requêtes conservent leur entrée/sortie exacte, expurgée des secrets avant transport. La narration finale compilée est présentée séparément de la sélection LLM brute.

Les événements historiques conservent leur date et le marqueur `bv_historical`. `bv_test` distingue les fournisseurs simulés. Les graphiques et évaluations excluent les tests ; ils incluent les générations historiques réelles et permettent de comparer sources, voix et versions de prompt. Les définitions sont opérationnelles, non approuvées dans le catalogue de métriques.

## Fiabilité et accès

La migration `0057_ai_quality.sql` crée les réglages, snapshots de qualité, audit, jeu de référence et file d'envoi D1. La collecte se fait dans le cron web existant. Les erreurs de suivi sont isolées de l'admission, du débit de crédits et de la génération. Une file durable utilise des baux exclusifs, un identifiant d'ingestion stable et des reprises espacées ; après douze échecs, le superadmin peut relancer la file.

Les routes `/api/admin/ai-quality` et `/api/admin/ai-quality/:id/audio` exigent un superadmin vérifié. Les mutations exigent la même origine. Les médias restent privés, avec contrôle du chemin agence/job, taille, hash et lecture partielle. Les secrets, liens privés, coordonnées de contact et en-têtes ne sont pas transmis dans les traces. Une session replay est rattachée seulement si le navigateur a donné son consentement valide ; la collecte technique serveur reste indépendante du SDK navigateur.

La conservation locale est réglable (90 jours initialement) et ne modifie pas la conservation dans PostHog. Les cas revus ajoutés au jeu de référence gardent leurs faits et attentes figés après suppression du snapshot opérationnel. Leur export est privé.

## Coûts et décisions

Les estimations USD connues sont séparées des montants facturés inconnus. Un coût partiel n'est jamais un coût réel nul. Les montants EUR rapprochés avec **Rentabilité** apparaissent avec leur couverture fournisseur ; il faut couvrir tous les fournisseurs attendus pour afficher un coût rapproché complet. L'économie liée à une animation réutilisée est une estimation au tarif du clip, pas une mesure de facture. Les comparaisons de coût entre voix, modèles ou sources doivent tenir compte de cette couverture et des différences de durée/options.

## Recette et exploitation

- `pnpm test` inclut le jeu de 63 cas contrôlés (montants, unités, pièces/chambres, conditions et villes) et les tests D1 de reprise, consentement, accès et verdicts.
- `pnpm typecheck` et `pnpm check:boundaries` vérifient les interfaces Workers et les dépendances.
- Aucun essai de génération fournisseur n'est nécessaire pour cette recette. Les essais D1 et navigateur locaux utilisent des données fictives ; le suivi distant utilise uniquement les journaux existants.
- Le bouton **Analyser les journaux** complète le suivi et essaie de livrer la télémétrie, sans créer de contenu.
- Dashboard : [Qualité IA BienVu](https://eu.posthog.com/project/299212/dashboard/1010344).
- Retour arrière : désactiver la collecte dans les réglages, désactiver les évaluations Hog, puis redéployer la version web précédente si nécessaire. La migration additive ne modifie pas les tables de facturation ou les jobs.

Documentation : [AI Evals](https://posthog.com/docs/ai-evals), [capture manuelle](https://posthog.com/docs/ai-observability/installation/manual-capture).
