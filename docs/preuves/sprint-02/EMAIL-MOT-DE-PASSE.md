# Extension du sprint 02 — e-mail et mot de passe

Demande d’Alex du 28 septembre 2026 : proposer e-mail/mot de passe en plus de Google. Better Auth/D1 conservé. Aucun nouveau fournisseur de comptes, abonnement, déploiement ou envoi externe.

## Résultat

Inscription avec confirmation d’adresse obligatoire, connexion, renvoi de confirmation et récupération du mot de passe. Le formulaire garde Google. Mot de passe de 12 à 128 caractères, hachage scrypt de Better Auth, aucun accès à l’agence avant confirmation. Le reset est à usage unique (30 minutes) et révoque les sessions précédentes ; confirmation valable 60 minutes sans connexion automatique. Un utilisateur Google peut définir un mot de passe par récupération sans seconde agence ni second essai.

Le transport Cloudflare Email Service est préparé et simulé par Wrangler en local. En staging, la préparation le désactive sans expéditeur vérifié et plan Paid explicitement indiqués. Limites d’envoi atomiques en D1, 50/jour et 3/adresse/10 minutes ; corps JSON stricts, origine vérifiée, retours imposés, réponses sans jetons et messages de récupération identiques pour les comptes existants/inconnus.

## Vérifications

| Contrôle | Résultat et nature de la preuve |
|---|---|
| `pnpm check` | 52 tests réussis, frontières runtime et TypeScript. Nouveaux tests avec D1 local réel et transport mail capturé en mémoire. [Journal](email-check.log) |
| `pnpm build:web` | Build Next/OpenNext réussi. Avertissement fast-png déjà présent, sans échec. [Journal](email-build.log) |
| Migrations | `0005_auth_mail_limits.sql` appliquée localement ; bases vierges également créées dans les tests |
| `pnpm probe:auth-email` | Inscription HTTP sans insertion préalable de compte, hachage scrypt sous workerd, messages **simulés par le binding**, confirmation, cookie et agence persistants, reset, refus du rejeu/ancien secret/ancienne session, CSRF, déconnexion, zéro allocation. Compte nettoyé. [Rapport expurgé](email-workerd.json), [journal](email-probe.log) |
| Régression des sondes | `probe:accounts`, `probe:foundations`, `probe:web` réussies après l’ajout ; D1/R2 réels locaux, identités synthétiques |
| Interface | Recette navigateur synthétique : inscription, confirmation, connexion, agence après rechargement, déconnexion, récupération ; versions ordinateur/mobile inspectées. [Relevé](email-inspection-ui.json) |

Le test Google → mot de passe utilise une identité fournisseur **synthétique en D1**. L’autre sens exige le même e-mail vérifié localement et chez Google dans le code ; il ne constitue pas une preuve d’échange OAuth réel. Aucune liaison à un compte local non vérifié n’est autorisée par la configuration.

Fichiers principaux : `components/login.tsx`, `lib/auth.ts`, `auth-handler.ts`, `auth-email.ts`, route `api/auth`, contrats `auth.ts`, migration `0005`, tests `auth-email.test.ts`, sonde `probe-auth-email.mjs`, configuration Wrangler/types, préparation staging et CI. La documentation produit remplace l’ancienne exclusion des mots de passe, conformément à la demande d’Alex.

## Restant et coût

**0 € de nouvel essai externe**, aucun Docker lancé, ni mail réel envoyé. Workers Paid et un domaine expéditeur vérifié restent nécessaires à la livraison aux utilisateurs. Configurer aussi le client Google. Exécuter ensuite la recette décrite dans [AUTHENTIFICATION.md](../../AUTHENTIFICATION.md) : livraison/spam, erreurs d’envoi, connexions Google réelles, même agence entre modes, cookies HTTPS, révocation, CPU du scrypt et coûts du Worker déployé. Aucun résultat local ne valide ces points distants. La faisabilité Containers du sprint 00 reste séparée.

[Contrôle des secrets et liens](email-secret-scan.json) : aucune fuite de secret connu ni lien documentaire cassé. [Nettoyage du compte de recette](email-cleanup.json) confirmé.

Travail non committé sur `main` ; aucun push de cette extension.
