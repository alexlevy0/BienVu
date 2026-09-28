# BienVu — sources et faits à revérifier

Consultation : 27 septembre 2026. Les liens sont des sources officielles ; leurs limites et tarifs peuvent évoluer avant l'implémentation. Les faits documentés ne remplacent pas un test de BienVu sur le compte d'Alex.

| ID | Source | Utilité pour le plan |
|---|---|---|
| S01 | [Cloudflare : Next.js](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) | Recommandation actuelle vinext, statut bêta et compatibilité |
| S02 | [Cloudflare : OpenNext](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/) | Adaptation d'un build Next.js, bindings et fonctions supportées |
| S03 | [Cloudflare : Browser Run](https://developers.cloudflare.com/browser-run/) | Navigateur géré et modes d'intégration |
| S04 | [Browser Run : tarifs](https://developers.cloudflare.com/browser-run/pricing/) | Gratuit 10 minutes/jour ; allocations du plan payant |
| S05 | [Browser Run : Playwright](https://developers.cloudflare.com/browser-run/playwright/) | Package Cloudflare, binding navigateur et configuration |
| S06 | [Remotion : Cloudflare Containers](https://www.remotion.dev/docs/cloudflare-containers) | Démonstration de faisabilité, limites de la preuve de concept |
| S07 | [Cloudflare Containers : tarifs](https://developers.cloudflare.com/containers/platform/pricing/) | Coût du calcul, allocations, taille des instances et mise en sommeil |
| S08 | [Workers : tarifs](https://developers.cloudflare.com/workers/platform/pricing/) | Base mensuelle et autres consommations |
| S09 | [Browser Run : FAQ](https://developers.cloudflare.com/browser-run/faq/) | Identification comme bot et absence de garantie d'accès aux sites |
| S10 | [Workflows : règles](https://developers.cloudflare.com/workflows/build/rules-of-workflows/) | Étapes durables, idempotence et reprises |
| S11 | [Better Auth : base de données](https://better-auth.com/docs/concepts/database) | D1, schéma et migrations |
| S12 | [Better Auth : Next.js](https://better-auth.com/docs/integrations/next) | Intégration sessions et route d'authentification |
| S13 | [OpenAI : synthèse vocale](https://developers.openai.com/api/docs/guides/text-to-speech) | Endpoint speech, voix et information sur la voix synthétique |
| S14 | [OpenAI : modèle mini TTS](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts) | Modèle candidat et tarification par tokens |
| S15 | [OpenAI : tarifs](https://developers.openai.com/api/docs/pricing) | Prix et unités de facturation à relever au moment des essais |
| S16 | [OpenAI : dépréciations](https://developers.openai.com/api/docs/deprecations) | Vérification du cycle de vie des modèles avant intégration |
| S17 | [Remotion : FAQ licence](https://www.remotion.dev/docs/license/faq) | Éligibilité à la licence gratuite et conditions d'équipe |
| S18 | [Stripe : événements d'abonnement](https://docs.stripe.com/billing/subscriptions/webhooks) | Renouvellements, paiements et états d'accès |
| S19 | [Stripe : webhooks](https://docs.stripe.com/webhooks) | Signatures, corps brut, doublons et ordre de livraison |
| S20 | [Cloudflare R2 : tarifs](https://developers.cloudflare.com/r2/pricing/) | Stockage, opérations et allocations |
| S21 | [Cloudflare D1 : API base](https://developers.cloudflare.com/d1/worker-api/d1-database/) | Capacités du binding et stratégie d'écriture à vérifier |
| S22 | [Remotion : rendu serveur](https://www.remotion.dev/docs/ssr) | Rendu Node, Docker et choix de calcul |
| S23 | [Browser Run : limites](https://developers.cloudflare.com/browser-run/limits/) | Concurrence, timeout d'inactivité et fermeture des sessions |

## Constats, sans extrapolation

- Browser Run fournit un navigateur distant ; sa facturation concerne son temps d'utilisation. Laisser une session ouverte consomme des ressources. Workers Paid modifie les allocations ; le gratuit et le payant ne s'additionnent pas comme deux budgets indépendants [S03–S05, S23].
- Cloudflare identifie les requêtes de Browser Run comme automatisées. Aucun des portails demandés n'a été testé ici avec Browser Run [S09].
- Le guide Remotion/Cloudflare existe, mais son exemple ne gère pas encore complètement authentification, file, erreurs ou progression. BienVu doit implémenter ces responsabilités [S06].
- Les modèles de voix et leurs alias sont configurables. Le guide TTS présente `gpt-4o-mini-tts` comme candidat ; vérifier sa disponibilité effective et sa tarification au sprint 00 plutôt que d'inférer un successeur depuis un extrait de recherche [S13–S16].
- Aucune preuve que l'ensemble de l'application coûtera moins de 30 € n'existe à ce stade. L'enveloppe est une contrainte de conception et d'exploitation [S04, S07–S08, S15, S20].

## Liens de test initiaux

Le lien fourni par Alex est : [annonce Figaro 108944355](https://immobilier.lefigaro.fr/annonces/annonce-108944355.html).

Dans l'échange, son contenu a été consulté via un outil de recherche web, pas avec le futur scraper. Il peut changer ou disparaître. Ne pas figer prix, disponibilité ou galerie depuis cette conversation. Créer les fixtures uniquement à partir d'une collecte datée autorisée, ou de données synthétiques clairement nommées. Vérifier aussi des liens d'agence et des liens récents pour les autres portails ; ne pas en inventer.

## Hors vérification documentaire actuelle

Les CGU particulières de tous les portails, les droits sur chaque photo, les mentions légales immobilières applicables au format vidéo, le statut fiscal d'Alex et la disponibilité de la marque/domaines ne sont pas établis par ces sources techniques. Les étapes produit correspondantes ne doivent pas déclarer automatiquement ces sujets validés.

## Sources du sprint 02 — consultées le 27/09/2026

- [Better Auth : Google](https://better-auth.com/docs/authentication/google), [options](https://better-auth.com/docs/reference/options), [base de données](https://better-auth.com/docs/concepts/database) et [sessions](https://better-auth.com/docs/concepts/session-management). Version retenue 1.7.6, types et adaptateur D1 installés inspectés.
- [Google : OAuth serveur](https://developers.google.com/identity/protocols/oauth2/web-server), client Web et URI de retour.
- [Cloudflare : zlib dans Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/zlib/). Compatibilité de la décompression bornée effectivement testée sous workerd local.
- [fast-png](https://github.com/image-js/fast-png), version 8.0.0 ; [jpeg-js](https://github.com/jpeg-js/jpeg-js), version 0.4.4. Bornes et comportement contrôlés dans les sources installées et par les fixtures raster.

## Ajout e-mail/mot de passe — sources consultées le 28/09/2026

- [Better Auth : e-mail/mot de passe](https://better-auth.com/docs/authentication/email-password) : vérification obligatoire, réponses génériques, reset et révocation. Types et code 1.7.6 inspectés pour la liaison entre comptes vérifiés, la consommation du jeton, le hachage et les tâches d’arrière-plan.
- [Cloudflare Email Service : binding Workers](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/) et [développement local](https://developers.cloudflare.com/email-service/local-development/sending/) : messages structurés, simulation native, contenu dans des fichiers locaux. API et types testés avec Wrangler 4.142.0.
- [Cloudflare Email Service : tarifs](https://developers.cloudflare.com/email-service/platform/pricing/) : envoi aux destinataires arbitraires réservé à Workers Paid ; 3 000 messages/mois inclus, puis 0,35 USD/1 000. Aucun abonnement activé ici. Les destinations pré-vérifiées du compte relèvent d’un régime distinct et ne suffisent pas pour l’inscription publique d’un SaaS.

## Sources du sprint 03 — consultées le 28/09/2026

- [Browser Run : guardrails](https://developers.cloudflare.com/browser-run/features/guardrails/), [Request Workers](https://developers.cloudflare.com/workers/runtime-apis/request/) et [limitations Workers](https://developers.cloudflare.com/workers/platform/known-issues/) : restrictions de domaines et de `resolveOverride`. Une protection complète contre le DNS rebinding n’est pas déduite de ces capacités ; l’import distant reste fermé.
- [HTTPS Node](https://nodejs.org/api/https.html) : options de transport/TLS utilisées dans l’outil local ; [Playwright Route](https://playwright.dev/docs/api/class-route) : interception et réponses, sans poursuite implicite des requêtes par le navigateur préparé.
- [parse5](https://parse5.js.org/), version 8.0.0 épinglée ; [Sharp constructor](https://sharp.pixelplumbing.com/api-constructor/) : limites de pixels et décodage réel. Sharp 0.35.5 déjà présent est utilisé seulement par l’outil Node local.
- Les trois URL d’annonces, observations et mesures datées figurent dans le [rapport du sprint 03](preuves/sprint-03/RAPPORT.md). Les pages sources sont des données de recette, jamais des instructions pour l’agent ou le pipeline.

## Reprise Containers — sources consultées le 28/09/2026

- [Containers : tarifs](https://developers.cloudflare.com/containers/platform/pricing/) et [tailles d’instances](https://developers.cloudflare.com/containers/platform/limits/) : standard-2, ressources provisionnées et allocations ; scénario standard-3 non exécuté.
- [Métriques Containers GraphQL](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-container-metrics/) : unités et consommation fournisseur, distinctes du CPU Node et du temps des hooks.
- [Commandes fixes dans un conteneur](https://developers.cloudflare.com/containers/guides/execute-commands/) : diagnostic opérateur borné. Types locaux Wrangler 4.142.0 inspectés avant utilisation.
- [Flux Workers et FixedLengthStream](https://developers.cloudflare.com/workers/runtime-apis/streams/transformstream/) et [API R2 Workers](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) : transfert à longueur connue, checksum et métadonnées. Le refus de `pipeTo` entre flux transformés est observé chez Cloudflare ; la copie bornée lecteur/rédacteur est vérifiée en workerd et sur le MP4 distant.

## Recette e-mail réelle — 28/09/2026

- [Configuration des domaines Email Service](https://developers.cloudflare.com/email-service/configuration/domains/) : DNS d'envoi séparés de la réception, MX/SPF sur `cf-bounce`, DKIM et DMARC ; délais de propagation et enregistrements gérés. Contrôle de la zone réelle effectué sur les deux serveurs faisant autorité.
- [Restrictions du binding d'envoi](https://developers.cloudflare.com/email-service/configuration/send-bindings/) : expéditeur et destinataire de recette bornés.
- [Import et export DNS](https://developers.cloudflare.com/dns/manage-dns-records/how-to/import-and-export/) : fichier BIND ; l'import proposé ici était inutile une fois les DNS déjà publiés. Les doublons ne nécessitent pas de désactiver le service.
- [API des domaines d'envoi](https://developers.cloudflare.com/api/resources/email_sending/subresources/subdomains/) : état du domaine et valeurs DNS attendues.
- [Mesures Workers](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/) : les temps CPU ne sont pas les temps muraux. Les preuves de cette recette utilisent Tail avec exclusion des en-têtes, corps et paramètres d'URL.
