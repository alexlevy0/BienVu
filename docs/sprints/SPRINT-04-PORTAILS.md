# Sprint 04 — Étendre l'import et mesurer la couverture des portails

**Dépendance : sprint 03. État au 28/09/2026 : tranche déployée et recettée sur Cloudflare, couverture complète des portails non validée. Sprint non clôturé.** [Rapport daté, résultats réels et limites](../preuves/sprint-04/RAPPORT.md).

## Objectif

Évaluer et prendre en charge autant que démontré Le Figaro Immobilier, SeLoger, Leboncoin et Bien'ici, en conservant le chemin générique pour les sites d'agences. Le sprint produit une couverture mesurée, pas une garantie universelle.

Références : [CADRAGE.md](../CADRAGE.md), [CONTRATS.md](../CONTRATS.md), [SOURCES.md](../SOURCES.md). Le lien Le Figaro partagé par Alex est un cas de recette possible ; sa disponibilité doit être revérifiée.

## Travail à réaliser

- [x] **04.1 — Créer le registre d'adaptateurs.** Sélectionner un adaptateur à partir d'un hôte et d'un chemin validés, avec gestion explicite des variantes de domaine. Un domaine inconnu peut tenter l'import générique protégé ; il n'est pas déclaré compatible d'avance. Éviter les tests d'hôte vulnérables aux sous-chaînes.
- [x] **04.2 — Évaluer chaque portail.** Tester un petit échantillon d'annonces actuelles, idéalement vente et location lorsqu'elles sont disponibles. Récupérer données et galerie accessibles dans le cadre prévu. Enregistrer blocages, galerie incomplète, retrait d'annonce et variation de structure séparément.
- [ ] **04.3 — Implémenter les adaptateurs démontrables.** Isoler sélecteurs et extraction des données embarquées. Conserver les mêmes validations de faits, photos, sécurité et budget que pour les agences. Un adaptateur ne doit pas rendre acceptable un import ambigu simplement pour afficher un succès.
- [x] **04.4 — Encadrer les échecs.** Identifier challenge, demande de connexion et limitation explicite. Ne pas lancer de boucle de rafraîchissement, de service de résolution de CAPTCHA ou de proxy payant automatique. Documenter une alternative pertinente, par exemple un accès autorisé ou le lien du site de l'agence, sans l'activer silencieusement.
- [x] **04.5 — Tester les régressions.** Préparer des fixtures minimales pour les formats réellement observés et vérifier que les adaptateurs ne dégradent pas l'import générique. Couvrir une page de recherche et une page retirée pour éviter de les transformer en fausse annonce.
- [x] **04.6 — Exposer une information honnête.** Préparer les états de couverture destinés au produit : testé sur un échantillon daté, import générique à tenter, momentanément indisponible. Un domaine testé ne promet pas que toutes ses annonces sont importables. Éviter des badges « compatible » fondés uniquement sur une fixture.

## Critères d'acceptation

1. Les quatre portails figurent dans le registre avec résultat, date, nombre de liens tentés et motif d'échec éventuel ; aucun n'est omis pour simplifier le rapport.
2. Chaque succès réel satisfait les mêmes exigences de provenance et de galerie que le sprint 03.
3. Un blocage explicite donne une erreur stable, sans retry automatique et sans frais techniques non bornés.
4. Les fixtures d'agences continuent de passer et les URL trompeuses ne choisissent pas un adaptateur incorrect.
5. Les textes publics correspondent aux preuves disponibles, notamment si un portail ne fonctionne pas.

## Livrables et fin du sprint

Registre, adaptateurs réalisables, fixtures, tests ciblés et matrice datée dans [SUIVI.md](../SUIVI.md). Ajouter pour chaque limitation la prochaine option concrète et son coût éventuel.

Un portail bloqué n'empêche pas de construire la vidéo et le parcours sur les sources fonctionnelles. Il reste une limite explicite du produit et du lancement ; ne pas le marquer « pris en charge » ni supprimer l'objectif de couverture demandé par Alex.

## Résultat du 28 septembre 2026

- 04.1 : registre partagé à hôtes/chemins exacts, alias et CDN explicites ; générique conservé pour les domaines inconnus. Fragments de suivi SeLoger connus nettoyés sans élargir la validation réseau.
- 04.2 : sept annonces réelles consultées en HTTPS local sur les quatre portails, zéro import complet validé. Figaro 0/3, SeLoger 0/1, Leboncoin 0/1, Bien’ici 0/2. Deux recherches de découverte séparées ; vente/location couvertes seulement pour Figaro et Bien’ici.
- 04.3 **reste ouverte** : adaptateur Bien’ici du DOM public observé, extraction de vente vérifiée hors ligne ; location refusée pour contradiction de prix. Essai Cloudflare Bien’ici arrêté par le garde-fou réseau ; galerie admissible et persistance complète non prouvées. Les trois autres portails restent bloqués, aucun adaptateur inventé depuis une maquette.
- 04.4 : codes publics stables et motifs privés, absence de relance sur refus/challenge/recherche/retrait ; alternatives lien d’agence/saisie manuelle documentées. Aucun contournement.
- 04.5 : fixtures minimales expurgées, 117 tests locaux réussis dont 13 groupes portails et une migration de quota, régressions agences conservées. Recette HTTP sur fixtures et vérifications de build détaillées dans le rapport.
- 04.6 : page `/sources`, indication sous le champ URL et lien FAQ publiés sur bienvu.online. Les succès d’agences sont datés du sprint 03 ; les quatre portails affichent chacun un essai Cloudflare réel sans succès, aucun succès attribué aux fixtures.

Alex a autorisé **10 imports par jour UTC** le 28/09 : migration `0010` appliquée localement et sur Cloudflare sans remise à zéro, plafond mensuel 30 et budget financier conservés. Quatre essais hébergés réels supplémentaires : Figaro/SeLoger/Leboncoin refusés, Bien’ici arrêté par le garde-fou du navigateur. Zéro import complet, une session Browser Run fermée normalement, conteneur endormi, données de recette nettoyées. Compteur final 9/10 ce jour, provisions totales 22 € sur 30 €.

**Reste 04.3 :** pour Bien’ici, identifier les dépendances JS rejetées puis démontrer l’acquisition automatique, les trois photos admissibles et la persistance. Aucun contournement ni promesse de compatibilité des trois portails qui refusent l’accès. Crawlee étudié, pas installé ni testé : aucune amélioration d’accès démontrée. Le sprint reste explicitement non clôturé ; les sources d’agences et la saisie manuelle permettent d’avancer ensuite sur la vidéo.
