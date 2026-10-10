# Chat d’assistance Tawk.to

Widget fourni par Alex : propriété `6aca2b0398b9c934c10c477e`, widget `1k4irg1cl`. Ces identifiants publics ne sont pas des clés API.

`TawkChat` est monté une fois dans le layout principal avec `next/script`, stratégie `lazyOnload` : chargement après les ressources de la page, sans bloquer l’hydratation. L’API est préparée avant le script. Le widget fonctionne pour les visiteurs et les comptes connectés, indépendamment du consentement PostHog. Aucun nom, e-mail ou contenu d’annonce n’est injecté depuis le compte BienVu.

Le superadmin, les validations privées, routes API et URLs contenant des paramètres d’authentification sont exclus. La connexion du widget est arrêtée avant une navigation App Router vers ces écrans ; un chargement différé vérifie de nouveau la destination avant de démarrer. Le script reste unique lors des changements de page. Le z-index 40 laisse le bandeau de confidentialité et les dialogues au premier plan.

## Réglages dans Tawk.to

La couleur, la langue, le texte d’accueil, les agents, horaires et messages hors ligne se règlent dans le dashboard Tawk.to, sans modifier BienVu. Les conversations sont reçues dans Tawk.to, pas dans la messagerie du superadmin.

Le formulaire de consentement natif est géré dans **Administration → Chat Widget → Consent Form**. Pour le proposer à tous les visiteurs, activer le formulaire européen et sélectionner **All visitors**, puis renseigner `https://bienvu.online/confidentialite`. Ce réglage n’est pas modifiable par le script d’intégration et n’est pas présumé activé. Quand il est actif, Tawk.to indique ne déposer ses cookies/stockages qu’après acceptation. Les préférences PostHog restent séparées.

La page Confidentialité décrit les données du chat et son prestataire. Aucune durée de conservation non confirmée n’est annoncée ; les durées du fournisseur et le traitement des demandes de suppression restent distincts de D1.

## Vérification

Tests ciblés : `node --import tsx --test tests/tawk-chat.test.ts`. Ils protègent l’exclusion des liens privés et le démarrage différé après navigation. `node scripts/probe-tawk-chat.mjs` teste le vrai layout Next.js et ses navigations avec un widget local simulé, à 1536/390 px : un chargement unique, arrêt sur une URL privée et aucun chargement initial sur un lien contenant un jeton.

Le vrai widget a aussi été vérifié dans Chrome avec fenêtre, sur la home construite localement et la version publiée. Tawk.to refuse le User-Agent du navigateur headless avec une réponse 403 ; aucune falsification de cet en-tête n’est utilisée. Les événements de disponibilité initiaux permettent de démarrer explicitement le widget avec `autoStart=false`, avant son `onLoad`. Aucun message de chat n’est envoyé pour la recette. Captures et résultats locaux/distants dans `evidence/local/tawk-2026-10-10/`, hors Git.

Documentation officielle : [API JavaScript](https://developer.tawk.to/jsapi/), [consentement natif](https://help.tawk.to/article/enabling-and-managing-your-consent-form), [cookies](https://help.tawk.to/article/what-are-tawkto-cookies-and-what-do-they-do).
