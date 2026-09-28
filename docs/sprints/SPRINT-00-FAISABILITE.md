# Sprint 00 — Prouver la faisabilité dans le budget

**Dépendance : aucune. Statut initial : à faire.**

**État au 28/09/2026 : validation technique terminée, rapprochement financier ouvert.** Web et import d’agence démontrés chez Cloudflare ; MP4 natifs 6/30 s, Linux 6 s et Containers 30 s produits. Transfert R2 privé, empreinte, sommeil et limites contrôlés ; Alex confirme la lecture et l’audio du MP4 distant. Cinq tentatives consommées, appels désactivés, 19,50 € disponibles selon la provision prudente. Les métriques complètes et la facture restent à rapprocher. Voir la [recette Paid](../preuves/sprint-00/CONTAINERS-PAID.md) et le [suivi](../SUIVI.md).

## Objectif

Vérifier les trois risques avant de développer le SaaS : importer une vraie annonce depuis Cloudflare, faire tourner une application Next.js sur Workers et produire un MP4 avec audio dans Cloudflare Containers. Le budget global reste de 30 €/mois ; ce sprint ne possède pas une enveloppe supplémentaire.

Lire [CADRAGE.md](../CADRAGE.md), [ARCHITECTURE.md](../ARCHITECTURE.md), [BUDGET-ET-OFFRES.md](../BUDGET-ET-OFFRES.md) et [SOURCES.md](../SOURCES.md). Inspecter les instructions du dépôt avant toute modification.

## Travail à réaliser

- [x] **00.1 — Préparer des sondes minimales.** Créer un dossier de preuves reproductibles, une configuration locale, un exemple de variables sans secrets et un relevé des versions. Réutiliser ensuite les sondes utiles ; éviter un prototype complet jetable.
- [x] **00.2 — Tester Next.js sur Workers.** Vérifier les versions actuellement compatibles avec OpenNext, puis le build de production, un route handler, un binding D1/R2 et une lecture/écriture de cookie. Comparer au besoin avec la recommandation vinext documentée, sans changer silencieusement de framework. Enregistrer une ADR courte.
- [x] **00.3 — Tester Browser Run.** Depuis un Worker TypeScript utilisant le package Cloudflare documenté, récupérer une page d'agence avec galerie, puis tenter le lien Le Figaro fourni dans les sources. Fermer le navigateur même après erreur. Relever durée, faits retrouvés, photos exploitables et blocage éventuel. Une annonce retirée doit être signalée ; chercher un autre exemple public autorisé sans présenter son résultat comme celui du lien initial.
- [x] **00.4 — Tester le renderer.** Construire une image Linux avec les dépendances Remotion nécessaires. Produire d'abord localement une courte vidéo avec des images synthétiques et une piste audio autorisée, puis vérifier le même chemin dans Containers vers R2 privé. Tester ensuite une vidéo de durée cible. Distinguer acceptation du travail et fin effective ; observer le démarrage et la mise en sommeil. Les quatre essais distants courts ont échoué ; le cinquième, de durée cible, valide le chemin après corrections.
- [x] **00.5 — Mesurer et borner.** Commencer par 3 à 5 rendus réels maximum. Relever temps actif, taille d'instance, erreurs, stockage et consommation disponible. Compter les essais ratés. Vérifier l'éligibilité de l'organisation à la licence Remotion gratuite ; ne pas considérer un achat de licence comme acquis. Cinq tentatives, une instance, budget persistant et arrêt vérifiés ; facture non certifiée et métriques fournisseur encore partielles.
- [x] **00.6 — Conclure avec preuves.** Écrire un rapport daté : commandes, versions, environnements, métadonnées du MP4, résultats d'import, estimations et dépenses réelles connues. Actualiser le registre de couverture et de dépenses de [SUIVI.md](../SUIVI.md).

## Critères d'acceptation

1. Le build Next.js adapté répond en environnement Workers ; un simple `next dev` ne valide pas ce point.
2. Au moins une annonce d'agence fournit les données et trois photos distinctes utilisables. Le résultat Le Figaro est documenté, y compris s'il est bloqué.
3. Un rendu exécuté dans Containers donne un MP4 lisible, vertical, avec audio audible ; un rendu Docker local seul ne valide pas Cloudflare.
4. Les services inutilisés s'arrêtent, les fichiers restent privés et l'enveloppe restante est visible.
5. La recommandation distingue « démontré », « à vérifier » et « non faisable dans ces conditions ».

Si des accès manquent, livrer les sondes locales et les commandes exactes de vérification distante. Le sprint reste « code prêt à vérifier ». Si Containers ou le budget échoue, livrer une alternative chiffrée et son incidence, sans migrer automatiquement vers un autre hébergeur. Les portails bloqués ne justifient ni une promesse de compatibilité ni un contournement automatique.

## Livrables

Sondes exécutables, configuration d'exemple, ADR d'hébergement, rapport de faisabilité et suivi actualisé. Aucun paiement client, site commercial ou éditeur n'est attendu ici.
