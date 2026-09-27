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
