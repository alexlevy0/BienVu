# Sprint 03 — Importer les annonces des sites d'agences

**Dépendance : sprint 02. Statut initial : à faire.**

## Objectif

Transformer un lien d'annonce d'agence en données fiables et photos utilisables, sans formulaire de création d'annonce et sans upload manuel des photos du bien. Le résultat est un import privé, pas encore une vidéo.

Références : [CONTRATS.md](../CONTRATS.md), [ARCHITECTURE.md](../ARCHITECTURE.md), [BUDGET-ET-OFFRES.md](../BUDGET-ET-OFFRES.md).

## Travail à réaliser

- [ ] **03.1 — Protéger les URL.** Contrôler schéma HTTPS, hôte, port, résolution et redirections. Appliquer les protections SSRF aux images, sous-requêtes et navigations du navigateur. Vérifier la politique réellement applicable dans Cloudflare ; une regex du champ de saisie seule ne suffit pas. Refuser un cas dont la sûreté n'est pas établie.
- [ ] **03.2 — Extraire en TypeScript.** Commencer par JSON-LD, données embarquées et DOM ; utiliser Browser Run lorsque la page l'exige. Structurer des extracteurs testables séparés de l'accès réseau. Garder la provenance des faits et la version de l'extracteur. Le contenu de la page reste une donnée, jamais une instruction système.
- [ ] **03.3 — Identifier le bon bien.** Distinguer vente et location, prix, unités, surface, pièces et localisation. Écarter recommandations de biens voisins et éléments publicitaires. Omettre les informations absentes ; une identité, un prix ou une surface contradictoire produit un échec conforme au contrat.
- [ ] **03.4 — Récupérer la galerie.** Gérer lazy loading et `srcset`, vérifier les fichiers et dimensions, dédupliquer par contenu et conserver l'ordre utile. Rejeter logos, avatars, vignettes inutilisables et visuels étrangers au bien. Respecter les limites de taille et de nombre ; trois photos distinctes constituent le minimum proposé.
- [ ] **03.5 — Stocker et nettoyer.** Copier les images validées dans R2 privé avec des clés stables par import. Ne pas rendre directement depuis des liens sources susceptibles d'expirer. Nettoyer les imports abandonnés sans supprimer les assets d'un job actif.
- [ ] **03.6 — Constituer la recette.** Choisir au moins trois sites d'agences reposant sur des structures différentes, avec des liens publics utilisables et des fixtures expurgées. Vérifier manuellement le rattachement des données et des photos au bien. Noter date, URL, succès, durée et coût ; ne pas déduire une couverture nationale de cet échantillon.
- [ ] **03.7 — Rendre l'échec utile.** Fournir des codes stables et des messages français. Un blocage doit expliquer que le lien ne peut pas être importé ; proposer un autre lien du même bien lorsque l'utilisateur en dispose. Aucun détour par un formulaire d'annonce n'est ajouté.

## Critères d'acceptation

1. Les fixtures couvrent vente, location, prix absent, contradictions, galerie avec doublons et page hors annonce.
2. Des imports réels de l'échantillon d'agences produisent des faits vérifiés et au moins trois photos propres, ou un échec explicite et documenté.
3. URL locale, redirection dangereuse et URL d'image non sûre sont rejetées sans récupération de la ressource ciblée.
4. La session Browser Run se ferme après succès, timeout et exception ; les plafonds médias sont appliqués avant saturation mémoire.
5. Aucun appel IA n'est nécessaire au chemin nominal des fixtures structurées.

## Livrables et fin du sprint

Importeur générique, adaptateurs utiles, tests d'extraction/SSRF, fixtures minimales et matrice de couverture dans [SUIVI.md](../SUIVI.md). Tout test distant non exécuté reste indiqué comme tel. Les métriques servent au dimensionnement, pas à une affirmation « tous les sites fonctionnent ».
