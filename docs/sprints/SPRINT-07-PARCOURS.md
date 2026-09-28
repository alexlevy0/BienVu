# Sprint 07 — Relier le lien à l'aperçu et au téléchargement

**Dépendance : sprint 06. Statut initial : à faire.**

## Objectif

Livrer le parcours complet sous accès de développement contrôlé : coller un lien ou utiliser une annonce manuelle sauvegardée, suivre la génération, lire et télécharger la vidéo. Les jobs survivent à la fermeture du navigateur et aux interruptions des traitements.

Références : [CONTRATS.md](../CONTRATS.md), [ARCHITECTURE.md](../ARCHITECTURE.md), [BUDGET-ET-OFFRES.md](../BUDGET-ET-OFFRES.md).

## Travail à réaliser

- [ ] **07.1 — Implémenter l'admission.** Authentifier, déduire l'agence, valider l'URL ou l'annonce manuelle sauvegardée et la clé d'idempotence. Pour une annonce existante, contrôler sa propriété et la présence de toutes les photos sans inventer d'URL source. Vérifier les limites de concurrence et réserver le budget avant tout appel coûteux. Utiliser une allocation de développement côté serveur ; aucun paramètre public ne permet d'obtenir des crédits de test.
- [ ] **07.2 — Créer le job durable.** Persister le job, sa réservation et l'intention de lancement de manière cohérente. Démarrer un Workflow avec identifiant stable ; une coupure entre l'écriture et le lancement doit être réconciliable. Implémenter les états exacts du contrat, sans compter sur la session HTTP du client.
- [ ] **07.3 — Relier les étapes.** Import URL ou chargement d'une annonce manuelle, script, voix et rendu lisent/écrivent des références d'assets privées. Préparer les photos et la copie de marque propres au job, avec leurs empreintes ; les clés d'import ne sont pas directement des clés de manifeste vidéo. Stocker la réussite d'une étape avant de passer à la suivante. Déclencher le rendu une fois, puis attendre son état via une stratégie durable et bornée, sans maintenir une route web ouverte pendant plusieurs minutes.
- [ ] **07.4 — Encadrer les reprises.** Respecter tentatives, délais et erreurs non rejouables. La répétition d'une étape déjà validée réutilise son résultat. Réconcilier jobs bloqués, résultats tardifs et écritures interrompues ; ne pas libérer un crédit puis accepter gratuitement le rendu tardif correspondant.
- [ ] **07.5 — Construire l'expérience.** Champ URL avec alternative manuelle dépliable (décision d’Alex du 28/09/2026), action principale et étapes lisibles. Afficher l’état réel sans pourcentage inventé. Prévoir chargement, source indisponible, quota épuisé et service en pause. Aucun éditeur vidéo ni validation obligatoire après un import URL.
- [ ] **07.6 — Servir la vidéo.** Ajouter historique paginé, lecteur et téléchargement du même artefact privé, avec prise en charge Range. Afficher expiration et mention de voix synthétique. Un retour sur la page retrouve les jobs existants ; un téléchargement ne crée pas de génération.
- [ ] **07.7 — Préparer l'exploitation.** Ajouter un contrôle opérateur de pause et une réconciliation périodique bornée. Rendre consultables étape, erreur, durée et coût par job sans exposer secrets ni données d'autres agences.

## Critères d'acceptation

1. Une annonce réellement importable produit une vidéo après une seule soumission ; une annonce saisie manuellement doit aussi pouvoir lancer la génération une fois ses photos enregistrées.
2. Double clic et relance HTTP avec la même clé retrouvent le même job et la même réservation ; un corps différent avec la même clé est refusé.
3. Fermer la page n'arrête pas la génération ; un restart après import ou après upload du MP4 n'entraîne pas de duplication évitable.
4. Un timeout de rendu et un résultat tardif n'aboutissent ni à un solde incohérent ni à un MP4 accessible sans crédit consommé.
5. Deux agences ne partagent ni statut, ni historique, ni vidéo. Le lecteur et le téléchargement fonctionnent sur mobile.
6. La pause bloque toute nouvelle dépense de génération tout en laissant les vidéos existantes consultables.

## Livrables et fin du sprint

Workflow, routes, interface complète, réconciliation et tests ciblés des interruptions. Consigner la durée et le coût d'une recette complète dans [SUIVI.md](../SUIVI.md). L'essai public et les paiements attendent le sprint 08.
