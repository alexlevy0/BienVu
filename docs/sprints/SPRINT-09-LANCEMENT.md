# Sprint 09 — Recette et préparation du lancement payant

**Dépendance : sprint 08. Statut : à faire ; préparation partielle de 09.5 anticipée le 28/09/2026 à la demande d’Alex.**

La page d’accueil reprend désormais la maquette fournie : promesse, illustrations synthétiques explicites, tarifs indicatifs et contact. Cette tranche ne clôt pas 09.5 : une vraie vidéo produit, les prix définitifs, l’identité de l’exploitant et les documents commerciaux complets restent à préparer. [Visuels et provenance](../design/ACCUEIL-ASSETS.md).

## Objectif

Préparer une version exploitable et un dossier de lancement vérifiable, avec qualité vidéo, facturation, coûts, limites d'import et procédures de support. Le statut « prêt » doit reposer sur des preuves, pas sur la seule présence des écrans.

Références : tous les documents de référence, notamment [SUIVI.md](../SUIVI.md) et [CONSIGNES-CODEX.md](../CONSIGNES-CODEX.md).

## Travail à réaliser

- [ ] **09.1 — Exécuter la recette complète.** Sur staging, tester inscription, marque, essai, achat Stripe test, vidéo payante, aperçu, téléchargement et gestion d'abonnement. Inclure une annonce importée par URL, une annonce saisie manuellement avec photos, une location, une annonce incomplète, une source bloquée et un rendu raté. Compter ces essais dans le budget mensuel ; privilégier les fixtures pour les répétitions techniques.
- [ ] **09.2 — Contrôler la qualité.** Revoir les vidéos sur mobile avec et sans son : données exactes, cadrage, logo, lisibilité, sous-titres, narration, filigrane d'essai et coordonnées. Vérifier navigation clavier, focus, contrastes et messages d'erreur du parcours principal.
- [ ] **09.3 — Revalider les risques restants.** Vérifier isolation entre agences, SSRF, protections des routes internes, signatures Stripe, quotas et coûts concurrents. Tester un scénario de restauration/réconciliation pertinent. Ne pas multiplier les suites sans lien avec un risque réel ou un critère de recette.
- [ ] **09.4 — Mettre en place conservation et suppression.** Déployer la purge des médias à 30 jours selon le défaut proposé, avec protection des jobs actifs et de leurs assets. Informer de l'expiration et proposer la suppression des vidéos. Documenter la suppression du compte, les traces minimales d'essai et la conservation séparée des éléments comptables ; faire finaliser les durées et obligations applicables avant collecte publique.
- [ ] **09.5 — Préparer les pages commerciales.** Présenter la promesse lien → vidéo, un exemple autorisé, les offres proposées et la couverture réelle. Préparer les informations de confidentialité, les conditions, les coordonnées de l'exploitant et les mentions nécessaires à l'activité, en signalant les informations manquantes. Ne pas inventer de société, d'adresse ou de validation juridique. Expliquer l'usage de photos que le client est autorisé à réutiliser et la voix synthétique.
- [ ] **09.6 — Préparer l'exploitation.** Écrire un runbook : incident d'import, rendu bloqué, événement Stripe manquant, quota incohérent, facture inhabituelle, restauration et rollback. Prévoir consultation des coûts, seuils d'alerte et pause à 25 € engagés pendant les tests. Vérifier l'absence de logs sensibles et de conteneur inutilement actif.
- [ ] **09.7 — Préparer la décision de lancement.** Livrer une checklist factuelle, les variables production, migrations et commandes, la grille tarifaire à finaliser, le budget observé et les limites connues. Préparer tout le travail réversible avant une éventuelle validation finale requise pour publication, achat ou paiements réels. Respecter les autorisations déjà données dans la session d'implémentation.

## Critères d'acceptation

1. Le parcours nominal et les principaux échecs ont des preuves datées et des coûts recensés.
2. Le registre de couverture distingue clairement les sites testés des sites indisponibles ; aucune annonce « tous les sites » ne dépasse les résultats.
3. Une suppression ou une expiration retire l'accès au média sans casser la facturation ni réattribuer l'essai.
4. Les prix finaux, identité de l'exploitant et éléments contractuels non finalisés sont listés avant activation commerciale.
5. Une procédure permet de suspendre les nouvelles dépenses et de diagnostiquer un job sans accès aux secrets.
6. Le statut distingue « staging vérifié », « prêt à publier » et « publié avec paiements actifs ». Aucun état n'est déduit d'un écran simulé.

## Livrables et fin du sprint

Rapport de recette, runbook, configuration de lancement, pages concrètes et [SUIVI.md](../SUIVI.md) actualisé. Livrer les blocages restants avec leur effet sur le lancement. Ne pas déclarer le SaaS lancé tant que déploiement et activation nécessaires n'ont pas réellement été exécutés et vérifiés.
