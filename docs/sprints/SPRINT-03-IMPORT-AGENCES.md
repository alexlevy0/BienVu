# Sprint 03 — Importer les annonces des sites d'agences

**Dépendance : sprint 02. Terminé, portage et recette Cloudflare validés le 28/09/2026.** Les trois agences réelles, la description, la saisie manuelle et le fallback JavaScript passent sur bienvu.online. Réseau privé/redirections refusés ; six sessions Browser Run fermées ; conteneur distinct du renderer mis en sommeil. Purge automatique et protection des fichiers liés à un job vérifiées. [Rapport distant](../preuves/sprint-03/CLOUDFLARE.md) · [Guide](../IMPORTS.md) · [ADR](../adr/0003-transport-import-cloudflare.md).

Les tests de l'infrastructure Cloudflare utilisant des pages/photos ou horloges synthétiques sont identifiés séparément des trois annonces réelles. La recette de purge périodique est consignée dans le rapport ; aucune vidéo produit ni API IA n'est revendiquée.

## Objectif

Transformer un lien d’annonce d’agence en données fiables et photos utilisables. Depuis la demande d’Alex du 28/09/2026, offrir aussi un formulaire manuel dépliant avec upload des photos. Le résultat est une annonce privée, pas encore une vidéo ; une saisie manuelle ne prouve pas la compatibilité d’un site.

Références : [CONTRATS.md](../CONTRATS.md), [ARCHITECTURE.md](../ARCHITECTURE.md), [BUDGET-ET-OFFRES.md](../BUDGET-ET-OFFRES.md).

## Travail à réaliser

- [x] **03.1 — Protéger les URL.** Contrôler schéma HTTPS, hôte, port, résolution et redirections. Appliquer les protections SSRF aux images, sous-requêtes et navigations du navigateur. Vérifier la politique réellement applicable dans Cloudflare ; une regex du champ de saisie seule ne suffit pas. Refuser un cas dont la sûreté n'est pas établie.
- [x] **03.2 — Extraire en TypeScript.** Commencer par JSON-LD, données embarquées et DOM ; utiliser Browser Run lorsque la page l'exige. Structurer des extracteurs testables séparés de l'accès réseau. Garder la provenance des faits et la version de l'extracteur. Le contenu de la page reste une donnée, jamais une instruction système.
- [x] **03.3 — Identifier le bon bien.** Distinguer vente et location, prix, unités, surface, pièces et localisation. Écarter recommandations de biens voisins et éléments publicitaires. Omettre les informations absentes ; une identité, un prix ou une surface contradictoire produit un échec conforme au contrat.
- [x] **03.4 — Récupérer la galerie.** Gérer lazy loading et `srcset`, vérifier les fichiers et dimensions, dédupliquer par contenu et conserver l'ordre utile. Rejeter logos, avatars, vignettes inutilisables et visuels étrangers au bien. Respecter les limites de taille et de nombre ; trois photos distinctes constituent le minimum proposé.
- [x] **03.5 — Stocker et nettoyer.** Copier les images validées dans R2 privé avec des clés stables par import. Ne pas rendre directement depuis des liens sources susceptibles d'expirer. Nettoyer les imports abandonnés sans supprimer les assets d'un job actif.
- [x] **03.6 — Constituer la recette.** Choisir au moins trois sites d'agences reposant sur des structures différentes, avec des liens publics utilisables et des fixtures expurgées. Vérifier manuellement le rattachement des données et des photos au bien. Noter date, URL, succès, durée et coût ; ne pas déduire une couverture nationale de cet échantillon.
- [x] **03.7 — Rendre l'échec utile.** Fournir des codes stables et des messages français. Expliquer le blocage ; proposer un autre lien du même bien ou la saisie manuelle autorisée depuis le 28/09/2026.
- [x] **03.8 — Importer la description du bien (demande d’Alex).** Conserver le texte source, ses paragraphes et sa provenance, le sauvegarder avec l’annonce et l’afficher sans éditeur. Ignorer descriptions d’agence et biens voisins ; garder `null` lorsque la description manque. La description ne devient pas automatiquement un ensemble de faits vérifiés.
- [x] **03.9 — Saisie manuelle (demande d’Alex).** Bouton sous l’URL, formulaire titre/type/transaction/localisation/prix/surface/pièces/description et 3–12 photos, stockage privé et consultation ; pas d’éditeur vidéo. Fonctionnement validé en local et sur Cloudflare avec données/photos synthétiques ; décodage hébergé et relecture privée vérifiés. [Recette et utilisation](../SAISIE-MANUELLE.md).

## Critères d'acceptation

1. Les fixtures couvrent vente, location, prix absent, contradictions, galerie avec doublons et page hors annonce.
2. Des imports réels de l'échantillon d'agences produisent des faits vérifiés et au moins trois photos propres, ou un échec explicite et documenté.
3. URL locale, redirection dangereuse et URL d'image non sûre sont rejetées sans récupération de la ressource ciblée.
4. La session Browser Run se ferme après succès, timeout et exception ; les plafonds médias sont appliqués avant saturation mémoire.
5. Aucun appel IA n'est nécessaire au chemin nominal des fixtures structurées.
6. La description extraite reste lisible après sauvegarde et relecture ; une absence est explicite, le HTML est affiché uniquement comme texte et la troncature éventuelle est signalée.
7. La saisie manuelle conserve champs et photos après sauvegarde/relecture, isole les agences et distingue les informations `user_provided` des faits importés `verified`.

## Livrables et fin du sprint

Importeur générique, adaptateurs utiles, tests d'extraction/SSRF, fixtures minimales et matrice de couverture dans [SUIVI.md](../SUIVI.md). Tout test distant non exécuté reste indiqué comme tel. Les métriques servent au dimensionnement, pas à une affirmation « tous les sites fonctionnent ».

## Recette distante

- [x] Transport Node/TLS à IP épinglée dans un Container Cloudflare privé ; vrais refus IPv4/IPv6, DNS loopback, redirection et sous-requête navigateur privées.
- [x] Décodage/réencodage Sharp borné pour les photos URL et manuelles ; aucun Sharp dans Workers.
- [x] Browser Run branché : annonce JavaScript synthétique importée, fermeture réelle sur succès/exception/expiration/livraison tardive de la session. Historique fournisseur : six fermetures normales, aucune session restante.
- [x] Purge périodique hébergée : cron réel du 28/09 à 13:30 UTC, abandon D1/R2 supprimé et dossier lié à un job synthétique conservé. Répétition sans effet, refus d'écriture tardive et compteurs non remboursés ; fixtures retirées ensuite.
- [x] Trois annonces réelles : 12/11/7 photos, descriptions et empreintes R2 relues ; saisie manuelle : trois photos, provenance déclarée, reprise et refus inter-agences.

Les locations et la page exigeant JavaScript sont des fixtures ; l'échantillon réel couvre trois ventes, sans garantie de couverture nationale. La vidéo et la facturation restent les sprints suivants. Les cinq imports ont atteint le plafond global quotidien ; la purge ne le remet pas à zéro. Le budget est suivi séparément des crédits clients.
