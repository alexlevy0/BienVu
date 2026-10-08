# Simulateur de prix — recette du 7 octobre 2026

## Livraison

Le [simulateur du superadmin](https://bienvu.online/admin?view=pricing) est publié avec scénarios de packs/abonnements, coûts modifiables et observés, prix cible, sensibilité, stockage et obligations des crédits reportés. [Méthode et utilisation](../../SIMULATEUR-PRIX.md).

Les scénarios restent indépendants du catalogue commercial et des droits clients. Aucune modification des prix Stripe, de forfait Cartesia, de budget ou des crédits de production.

## Recette locale

| Vérification | Résultat |
|---|---|
| `pnpm check` | **437 tests réussis**, typage monorepo/tests et frontières |
| Tests `pricing-calculator` / `pricing-simulator` après les derniers ajustements | **24/24** : montants connus, calcul HT/TTC, prix arrondi et remises, bonus, crédits reportés, provision, paliers voix, quotas et arrondis R2, rétention longue, données inconnues, accès privés et concurrence |
| `pnpm typecheck` final | Tous les packages et tests réussis |
| `pnpm check:boundaries` final | **424 fichiers**, composition et renderer isolés des Workers |
| `pnpm probe:pricing:ui` | Chromium **1536/390 px**, six onglets, aucune exception JS ni débordement global |
| `pnpm build:web` | Next.js/OpenNext réussis, nouvelle route privée incluse |
| Wrangler dry-run avec configuration publiée | Empaquetage réussi |

La sonde UI utilise le composant réel dans une page HTTP locale avec réponses contrôlées. Elle vérifie sauvegarde avec modifications de saisie en cours, version suivante, copie, conflit 409 et récupération par copie, application des observations, distinction de coûts absents, JSON/CSV, restauration du brouillon et suppression. Les deux réponses 409 présentes dans la console sont intentionnelles. Cette sonde ne prouve pas une connexion d’utilisateur au site publié.

Les tests d’API utilisent Better Auth et les migrations complètes dans une D1 Miniflare isolée : anonyme 401, autre compte 403, e-mail non vérifié 401, origine étrangère 403, données incohérentes 422, taille dépassée 413. Deux sauvegardes sur la même révision donnent une seule écriture et un seul audit. Les plafonds de scénarios et mutations, l’immutabilité de l’audit et les écritures atomiques sont vérifiés. Le calcul seul n’écrit aucune donnée.

Preuves générées ignorées par Git sous `evidence/local/pricing/` et `evidence/local/pricing-*.log` : captures, rapport UI, tests, types, frontières, build et dry-run.

## Publication et vérifications réelles

- Compte Cloudflare déjà configuré et droits Workers/D1 vérifiés. Configuration et ressources actuelles conservées ; aucun nouveau service.
- Sauvegarde SQL privée de la D1 avant migration, **1 327 394 octets**, SHA-256 **`c3d52d2b82508c14d2dc162741c2d930bf9982e3e5958140e934df245e0b169e`**. Le fichier et ses traces restent dans `evidence/remote/pricing/`, ignorés par Git et à accès restreint.
- Seule migration en attente : **0052_pricing_simulations.sql**, appliquée avec succès. Elle ajoute scénarios, audit et index ; aucun prix ou droit client modifié.
- Worker précédent : **`037aaee0-f3d9-4b17-897a-bc27af03452a`**. Worker publié : **`5b93a021-a467-4b89-8e1d-0616be2ff3bf`**, à 100 % sur le domaine personnalisé.
- GET accueil **200** ; GET admin sans session **307 → /connexion** ; GET/POST nouvelles API sans session **401**, données privées absentes et `private, no-store`.
- Les **six requêtes SQL du module d’observation** ont été exécutées sur la base réelle avec période 365 jours et mode tous : **17 admissions, 8 rapports de rendu**, quatre fournisseurs avec estimations ; factures affectées et ventes absentes dans cet échantillon. L’absence n’est pas requalifiée en coût mesuré nul.
- Contrôle FK : **aucune violation**. Aucun scénario de recette créé dans la base publiée.
- Comparaison avant/après : bindings et variables identiques ; budget d’octobre, contrôle de génération, politique de paiement, nombre de jobs et nombre de reçus identiques.

Les tests de lecture distante utilisent les requêtes réelles, sans contourner la protection de l’API. Authentification/sauvegarde superadmin sont vérifiées en local, pas par une nouvelle session artificielle sur le domaine. Le premier scénario de production reste à enregistrer par le superadmin.

## Coûts et limites

Aucun nouveau texte, voix, clip, import, rendu, paiement ou e-mail externe déclenché. Publication, sauvegarde et petites lectures Cloudflare utilisent les ressources existantes ; leur coût exact n’est pas rapproché d’une facture.

Les tarifs initialisés sont sourcés, mais change, volumes, durées de calcul, médias, frais de litige et coûts manuels restent des hypothèses. La simulation n’est pas une comptabilité complète. Les valeurs observées nécessitent un échantillon suffisant et les coûts fournisseurs/frais de paiement restent inconnus tant qu’ils ne sont pas rapprochés.

Pour un retour à l’ancienne interface, redéployer la version précédente sans supprimer les tables de scénarios. La migration additive est compatible avec l’ancien Worker et les scénarios doivent être conservés.
