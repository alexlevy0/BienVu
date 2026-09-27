# Sprint 04 — Étendre l'import et mesurer la couverture des portails

**Dépendance : sprint 03. Statut initial : à faire.**

## Objectif

Évaluer et prendre en charge autant que démontré Le Figaro Immobilier, SeLoger, Leboncoin et Bien'ici, en conservant le chemin générique pour les sites d'agences. Le sprint produit une couverture mesurée, pas une garantie universelle.

Références : [CADRAGE.md](../CADRAGE.md), [CONTRATS.md](../CONTRATS.md), [SOURCES.md](../SOURCES.md). Le lien Le Figaro partagé par Alex est un cas de recette possible ; sa disponibilité doit être revérifiée.

## Travail à réaliser

- [ ] **04.1 — Créer le registre d'adaptateurs.** Sélectionner un adaptateur à partir d'un hôte et d'un chemin validés, avec gestion explicite des variantes de domaine. Un domaine inconnu peut tenter l'import générique protégé ; il n'est pas déclaré compatible d'avance. Éviter les tests d'hôte vulnérables aux sous-chaînes.
- [ ] **04.2 — Évaluer chaque portail.** Tester un petit échantillon d'annonces actuelles, idéalement vente et location lorsqu'elles sont disponibles. Récupérer données et galerie accessibles dans le cadre prévu. Enregistrer blocages, galerie incomplète, retrait d'annonce et variation de structure séparément.
- [ ] **04.3 — Implémenter les adaptateurs démontrables.** Isoler sélecteurs et extraction des données embarquées. Conserver les mêmes validations de faits, photos, sécurité et budget que pour les agences. Un adaptateur ne doit pas rendre acceptable un import ambigu simplement pour afficher un succès.
- [ ] **04.4 — Encadrer les échecs.** Identifier challenge, demande de connexion et limitation explicite. Ne pas lancer de boucle de rafraîchissement, de service de résolution de CAPTCHA ou de proxy payant automatique. Documenter une alternative pertinente, par exemple un accès autorisé ou le lien du site de l'agence, sans l'activer silencieusement.
- [ ] **04.5 — Tester les régressions.** Préparer des fixtures minimales pour les formats réellement observés et vérifier que les adaptateurs ne dégradent pas l'import générique. Couvrir une page de recherche et une page retirée pour éviter de les transformer en fausse annonce.
- [ ] **04.6 — Exposer une information honnête.** Préparer les états de couverture destinés au produit : testé sur un échantillon daté, import générique à tenter, momentanément indisponible. Un domaine testé ne promet pas que toutes ses annonces sont importables. Éviter des badges « compatible » fondés uniquement sur une fixture.

## Critères d'acceptation

1. Les quatre portails figurent dans le registre avec résultat, date, nombre de liens tentés et motif d'échec éventuel ; aucun n'est omis pour simplifier le rapport.
2. Chaque succès réel satisfait les mêmes exigences de provenance et de galerie que le sprint 03.
3. Un blocage explicite donne une erreur stable, sans retry automatique et sans frais techniques non bornés.
4. Les fixtures d'agences continuent de passer et les URL trompeuses ne choisissent pas un adaptateur incorrect.
5. Les textes publics correspondent aux preuves disponibles, notamment si un portail ne fonctionne pas.

## Livrables et fin du sprint

Registre, adaptateurs réalisables, fixtures, tests ciblés et matrice datée dans [SUIVI.md](../SUIVI.md). Ajouter pour chaque limitation la prochaine option concrète et son coût éventuel.

Un portail bloqué n'empêche pas de construire la vidéo et le parcours sur les sources fonctionnelles. Il reste une limite explicite du produit et du lancement ; ne pas le marquer « pris en charge » ni supprimer l'objectif de couverture demandé par Alex.
