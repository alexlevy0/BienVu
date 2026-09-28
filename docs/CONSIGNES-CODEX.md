# BienVu — consignes d'exécution pour Codex

Ces consignes accompagnent le cahier produit. Elles ne remplacent ni les instructions explicites d'Alex ni les règles existantes d'un dépôt.

## Avant de coder

- Lire le cadrage, l'architecture, les contrats, le budget et le sprint courant. Inspecter le dépôt et ses instructions avant tout changement.
- Reprendre les décisions et le travail déjà présents ; ne pas réinitialiser un projet existant.
- Le plan vise un projet neuf, un monorepo TypeScript et Cloudflare. Un prototype local ne prouve pas la compatibilité de déploiement.
- Vérifier uniquement les API, versions et limites nécessaires au sprint auprès des sources officielles. Épingler les versions retenues dans le lockfile et l'image de rendu.
- Identifier ce qui est confirmé par Alex et ce qui constitue une proposition du dossier. Ne pas attribuer à Alex le choix d'un prix, d'un fournisseur d'authentification ou d'un modèle IA non confirmé.

## Pendant le sprint

- Livrer un résultat fonctionnel observable, avec un périmètre limité aux dépendances utiles.
- Favoriser des fonctions courtes, contrats validés, interfaces de fournisseur isolées et erreurs stables. Ne pas créer un framework d'agents pour ce pipeline déterminé.
- Séparer le code compatible Workers du code Node natif. Aucun moteur de rendu vidéo dans le bundle de l'interface.
- Conserver le parcours sans éditeur vidéo. Depuis la demande d’Alex du 28/09/2026, proposer aussi une saisie manuelle dépliable sous l’import URL, avec informations du bien et upload de photos. Cette décision remplace l’exclusion initiale du formulaire ; distinguer les faits importés des informations déclarées par l’utilisateur.
- Ne pas développer une fonction d'achat de crédits, de publication sociale ou de collaboration d'équipe non prévue.
- Ne pas demander de décision sur chaque détail réversible. Choisir les valeurs proposées et documenter les écarts utiles.
- Un accès ou un secret manquant ne doit pas empêcher de terminer les éléments locaux vérifiables. Décrire ensuite exactement la vérification distante restante.
- Respecter les autorisations de la session pour les actions externes. Ne pas créer de frais, de service externe ou de changement de facturation non autorisé ; rendre ces opérations concrètes et révisables avant de demander une action à Alex si elle reste nécessaire.

## Vérifications proportionnées

Exiger des tests lorsqu'ils protègent de vrais risques : mauvaise annonce, images étrangères, URL interne, accès inter-agences, quota concurrent, signature Stripe, replay de webhook et reprise après crash. Une modification de texte ou de style n'exige pas une nouvelle batterie de tests.

Pour l'interface et les vidéos, effectuer aussi une inspection visuelle et une écoute réelles. Une compilation réussie ne prouve ni la lisibilité des sous-titres ni la justesse de la narration. Les tests navigateur, voix et rendu payants sont rares, bornés et enregistrés ; les autres utilisent des fixtures sans accès réseau coûteux.

## Budget et données

- Tous les secrets restent côté serveur et hors Git. Fournir un `.env.example` sans valeur sensible.
- Ne pas enregistrer de cookies de portail, de clés API ou de données complètes de paiement dans les traces.
- Distinguer photos du bien, assets de marque et médias synthétiques de recette. Ne jamais annoncer une démonstration synthétique comme une vraie annonce extraite.
- Contrôler et enregistrer les coûts avant/après les essais réels ; appliquer le budget du dossier.
- Ne pas effectuer de collecte massive ni utiliser de compte tiers de portail pour augmenter artificiellement la couverture.

## Définition d'un sprint terminé

1. Les tâches livrées répondent à son objectif et respectent les contrats partagés.
2. Les critères de validation disposent d'une preuve ou d'un résultat « non validé » explicite.
3. Les contrôles ciblés et le build de l'environnement concerné passent.
4. Les migrations, variables et procédures de lancement sont documentées.
5. Les limites et écarts sont consignés ; un blocage n'est pas masqué par un mock présenté comme réel.
6. `SUIVI.md` est à jour avec fichiers modifiés, commandes réellement exécutées, résultats et coûts des essais externes.

Ne pas marquer tout un sprint terminé si son critère central a seulement été simulé. Une branche « code prêt, vérification distante manquante » est un résultat valide à communiquer, distinct d'une fonctionnalité prouvée.

## Compte rendu de fin de sprint

```text
Sprint :
Résultat utilisable :
Fichiers et changements principaux :
Tests exécutés et résultats :
Vérifications réelles vs fixtures :
Coût mesuré ou estimé des essais :
Décisions prises et raisons :
Limites / accès nécessaires :
Prochaine étape :
```

Avant une mise en production payante, préparer l'ensemble révisable : URL de staging, exemples MP4, grille tarifaire, résultats de recette, dépenses estimées, limites des sources et procédure de retour arrière. Ce dossier n'implique pas qu'un paiement réel ou une publication a déjà été autorisé.
