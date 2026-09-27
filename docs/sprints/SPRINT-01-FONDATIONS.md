# Sprint 01 — Installer les fondations du projet

**Dépendance : sprint 00, avec architecture retenue documentée. Statut initial : à faire.**

**État au 27/09/2026 : livré et vérifié en local.** Alex a demandé d’avancer sans attendre son activation de Workers Paid. Cette avance conserve l’architecture retenue et laisse la recette Containers du sprint 00 ouverte. Contrôles, limites et commandes dans le [rapport](../preuves/sprint-01/RAPPORT.md), le [guide local](../DEVELOPPEMENT.md) et le [suivi](../SUIVI.md). Aucun déploiement de cette tranche ni exécution GitHub Actions.

## Objectif

Transformer les preuves techniques en un dépôt cohérent, exécutable localement et prêt pour les fonctions métier. Aucun parcours ne doit donner l'impression de produire une vraie vidéo tant que le pipeline n'est pas intégré.

Références : [ARCHITECTURE.md](../ARCHITECTURE.md), [CONTRATS.md](../CONTRATS.md), [CONSIGNES-CODEX.md](../CONSIGNES-CODEX.md).

## Travail à réaliser

- [x] **01.1 — Organiser le dépôt.** Initialiser pnpm et les emplacements utiles du monorepo proposé. Épingler les versions démontrées au sprint 00 et conserver un lockfile. Documenter la version de Node et les commandes d'installation. Ne pas créer de packages vides sans responsabilité.
- [x] **01.2 — Séparer les runtimes.** Isoler le renderer Node, la composition React et les Workers. Les schémas partagés doivent être utilisables sans API Node native. Empêcher l'import accidentel de Chromium ou de l'encodeur dans le bundle web.
- [x] **01.3 — Préparer D1 et R2.** Écrire des migrations versionnées pour les premières entités, avec identifiants d'agence, contraintes d'unicité et index d'accès. Prévoir jobs, réservations et coûts sans inventer une transaction interactive. Préparer des buckets privés et des noms d'environnements distincts ; ne pas créer des ressources facturées sans nécessité.
- [x] **01.4 — Définir les contrats.** Implémenter la validation runtime des URL, annonces, faits, photos, jobs et manifestes. Définir les erreurs publiques françaises et les diagnostics internes. Ajouter des fixtures synthétiques pour vente, location, donnée absente et donnée contradictoire.
- [x] **01.5 — Construire la coque produit.** Préparer une interface française responsive : connexion, tableau de bord, identité d'agence, génération, historique et abonnement. Les écrans non fonctionnels restent explicitement en développement. Le tableau de bord met en avant le champ de lien et l'action de génération.
- [x] **01.6 — Rendre le développement reproductible.** Fournir scripts de développement, build, vérification TypeScript et migrations locales. Configurer une CI sans appels payants par défaut. Créer `.env.example` sans identifiants réels et documenter les bindings/secrets requis par environnement.
- [x] **01.7 — Poser l'observabilité.** Générer un identifiant de requête, prévoir les identifiants de job/étape et un journal de coûts. Masquer cookies, clés et paramètres sensibles. Préparer un indicateur permettant de suspendre les générations coûteuses côté serveur.

## Critères d'acceptation

1. Un clone propre s'installe et exécute les commandes documentées ; les migrations créent la base locale sans correction manuelle.
2. La vérification des types et le build adapté Cloudflare passent avec les versions retenues.
3. Les contrats rejettent une URL dangereuse, une unité incohérente et un manifeste invalide avec des erreurs compréhensibles.
4. Les fixtures et mocks sont identifiables et ne sont jamais annoncés comme un résultat d'import réel.
5. Aucun secret, bucket public ou endpoint de rendu non protégé n'est introduit.

## Livrables et fin du sprint

Dépôt structuré, scripts, migrations initiales, contrats, fixtures, interface de base et guide de démarrage. Noter les commandes réellement exécutées et les contrôles distants restants dans [SUIVI.md](../SUIVI.md).

Le paiement et la génération publique restent désactivés. La couverture de tests se concentre ici sur les contrats et le build ; ne pas écrire de tests qui reproduisent simplement des composants visuels statiques.
