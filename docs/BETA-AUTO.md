# Beta BienVu — studio immobilier et automobile

La demande d’Alex du 25/10/2026 porte sur la maquette fournie et un mode **Auto complet avec import par lien et génération**. Le travail utilise l’origine existante : `beta.bienvu.online` redirige vers `bienvu.online/beta`. Aucune nouvelle infrastructure d’environnement n’est créée.

## Promotion sur l’accueil principal

Alex précise que **seule la partie Auto** doit reprendre le design Beta sur **`bienvu.online/`**. L’accueil par défaut et `?mode=immo` conservent le composant immobilier original `LandingPage`, ses textes, sa composition et ses sections. Un sélecteur discret dans la barre supérieure ouvre `?mode=auto`, qui utilise le nouveau studio automobile. Le bouton Immobilier de ce studio revient à l’accueil original ; aucun parcours immobilier Beta n’est présenté sur le domaine principal. Les anciens liens `?draft=…` sans catégorie ouvrent d’abord le lecteur immobilier, qui reconnaît et réoriente les brouillons Auto si nécessaire. Les retours de connexion et les changements de lecteur restent sur la route d’origine (`/` ou `/beta`). L’aperçu privé du gestionnaire de médias reste protégé par l’accès administrateur. Métadonnées immobilières d’origine par défaut et automobiles dans le mode Auto, canonique `/`, annonces privées non indexées. Le lien FAQ du mode Auto ouvre l’aide existante.

La première promotion globale (`75c29c8`, sonde `166b0a0`) a été publiée, puis retirée dès cette précision d’Alex : retour vérifié à la version web `6e83155e-ab32-4847-9531-025518949207`, release `39c1f0025d74`, sans modifier les autres services ni les données. Ses CI étaient vertes (**922/922 tests**) ; elles ne constituent pas la preuve de la correction de périmètre qui suit.

Fichiers concernés par la promotion et sa correction : `app/page.tsx`, `app/home-market-switch.css`, `components/landing-page.tsx`, `app/beta/page.tsx`, `components/beta-landing-page.tsx`, `components/auto-create.tsx`, `components/home-create.tsx`, `lib/seo.ts`, sous `apps/web/`, et `scripts/probe-foundations.mjs`. La sonde contrôle séparément le compositeur immobilier original sur `/` et le compositeur Auto sur `/?mode=auto`. Aucun changement de migration, facturation, fournisseur ou configuration de service. Les contrôles et la publication de la correction sont à consigner après exécution. Preuves ignorées dans `evidence/local/homepage-auto-correction/` ; historique de la première promotion dans `evidence/local/homepage-auto/`.

## Parcours livré

- Accueil Beta inspiré de la référence : sélecteur Immobilier / Auto, grand titre serif, cartes superposées, sources automobiles, sept usages de contenus. Les textes et visuels sociaux ne sont pas présentés comme sept exports automatiques.
- Auto : connexion, import d’une annonce ou saisie manuelle, vérification des informations, ajout et sélection de 3 à 12 photos réelles, ordre, animations facultatives, durée 20/30/40 s, format vertical/horizontal, style, voix et présentateur existants. Le coût est affiché avant le lancement.
- Les informations absentes restent absentes. Les photos de catalogue Aramis `betamodels` sont exclues. Les réserves du vendeur sont conservées dans la narration ; GPT sélectionne un catalogue de paragraphes, sans écrire de caractéristiques libres.
- Le brouillon peut être enregistré et repris. Un retour réseau perdu conserve la même clé d’admission ; la complétion ne se rejoue pas au second clic. Les photos restent privées et leur journal précède R2.
- À la première publication Beta, l’accueil immobilier principal était conservé. La promotion demandée ensuite est détaillée ci-dessus ; les anciens brouillons immobiliers restent pris en charge.

## Sources réellement vérifiées

Échantillon fermé : les trois liens transmis par Alex. Transport HTTPS sécurisé et normalisation native, depuis le Mac ; pas de contournement de refus, CAPTCHA ou authentification de portail.

| Source                                                                                                                                              | Résultat local                                                                       | Suite proposée dans l’interface                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| [AutoScout24 — Peugeot 207](https://www.autoscout24.fr/offres/peugeot-207-1-6-hdi-diesel-gris-cat_ma55mo18797-6571066c-6882-4f91-a7f8-8bad0771c9d8) | Caractéristiques, prix, commentaire et cinq photos normalisées                       | Vérifier puis générer                                  |
| [Aramisauto — Jaecoo 7](https://www.aramisauto.com/voitures/jaecoo/7/exclusive/v352925?vehicleId=1023164)                                           | Caractéristiques et prix ; aucune photo réelle propre au véhicule dans l’échantillon | Ajouter trois photos réelles et, si souhaité, la ville |
| [La Centrale — Audi Q4 e-tron](https://www.lacentrale.fr/auto-occasion-annonce-87103059281.html)                                                    | Refus d’accès HTTP 403                                                               | Saisie manuelle et photos personnelles                 |

La compatibilité d’un domaine n’est pas une garantie pour toutes ses annonces. Le catalogue public `/sources` distingue ces essais locaux des essais Cloudflare. Les hôtes de médias sont explicites ; références, URL canonique, redirections, DNS, tailles et durées restent contrôlés par le transport existant.

**Recette réelle en production le 25/10/2026** : le lien AutoScout24 fourni par Alex a aussi été importé depuis la session Chrome connectée, par le transport Cloudflare publié. La revue affiche Peugeot 207, 2007, 198 500 km, Diesel, boîte manuelle, 110 ch, 1 500 €, Sin-le-Noble et cinq photos réelles. Le risque de colmatage du FAP figure dans la description. Le brouillon `fef65d52-391c-4586-86ca-9c5c3897fc6b` est conservé dans le compte d’Alex ; aucune génération n’a été lancée. Aramisauto et La Centrale restent des vérifications HTTPS locales, sans promesse supplémentaire de disponibilité distante.

## Contrats et conservation des données

`NormalizedListing` accepte une extension optionnelle `category: vehicle` et des caractéristiques avec provenance : marque, modèle, année, kilomètres, énergie, transmission, puissance. Elle n’ajoute aucun champ par défaut aux annonces historiques. Les faits immobiliers restent absents pour un véhicule. Aucune migration SQL n’est nécessaire : ces données restent dans les JSON d’import et de brouillon existants.

Le pipeline conserve admission, crédits, plafonds fournisseurs, journaux, cache et workflow existants. Les scripts Auto portent `narration-auto/1`. Les photos automobiles larges sont conservées dans leur cadre complet. Les habillages utilisent année/km/énergie, et les animations demandent de préserver le véhicule immobile. Les modèles et tarifs fournisseurs ne changent pas.

## Vérifications

- Tests Auto : identification de l’annonce et de la galerie, référence étrangère, page de résultats, zéro kilomètre, image de catalogue, ancien JSON inchangé, provenance, narration 20/30/40 s, photos étrangères refusées, brouillon D1/R2, accès inter-agences et aucun débit à l’import.
- Workflow workerd réel, fournisseurs simulés : Auto avec voix, manifeste automobile, arrêt et reprise du runtime, une seule admission et un seul crédit consommé.
- Navigateur Chrome 1536 et 390 px : import simulé, modification des caractéristiques, ordre `[1,0,2]`, supplément d’animation, trois durées, format horizontal et reprise avec la même clé après une réponse perdue. Aucun débordement ni erreur JavaScript.
- Import HTTPS réel sur les trois exemples ci-dessus. MP4 local de 40 s avec les cinq photos de la Peugeot et une voix **Thomas macOS hors ligne**, distincte de Cartesia. 1200 frames, H.264/AAC, lecture progressive, volume moyen −18,51 dB, durée conteneur 40,043 s.
- Premier `pnpm check` local : 915/922 tests réussis. Deux attentes de catalogue nécessitaient les nouvelles sources ; cinq échecs liés aux ports locaux `EADDRNOTAVAIL` ou à leurs conséquences. Les deux attentes sont corrigées ; reprise ciblée en série **50/50 réussie**. La [CI fonctionnelle du commit `39c1f0025d74`](https://github.com/alexlevy0/BienVu/actions/runs/40192228707) est ensuite entièrement verte : **922/922 tests**, lint, formatage, frontières, types, build, 51 pages SEO et sondes du Worker local. La [CI sécurité](https://github.com/alexlevy0/BienVu/actions/runs/40192228874) est également verte, avec construction des deux images et véritable rendu natif Linux.
- Typage complet réussi. Audit corrigé : aucune vulnérabilité connue. Node 24.22.1, Undici 7.30.1, postal-mime 4.0.8 et fast-uri 3.1.9 corrigent les alertes qui bloquaient la CI. Images Linux reconstruites avec un digest Node exact, sans modification de facturation.

Les fixtures et rapports bruts sont ignorés dans `evidence/local/beta-auto/`. Aucun appel de génération GPT/Cartesia/HeyGen/Runway ni crédit BienVu n’est utilisé par ces vérifications. L’import réel de production réserve **50 centimes** dans le plafond interne existant : six requêtes, 1 068 485 octets source, aucun navigateur hébergé. Cette réservation prudente n’est pas une facture fournisseur ; le solde client reste à **27 crédits**. Le coût du visuel imagegen n’est pas mesuré ici. La qualité de la voix Cartesia et les sorties payantes HeyGen/Runway ne sont pas revalidées par ce rendu hors ligne.

Commandes réellement exécutées : `pnpm check` (résultat local détaillé ci-dessus), reprises `pnpm exec tsx --test` ciblées, `pnpm typecheck`, `pnpm audit:dependencies`, `pnpm build:web`, `pnpm prepare:web --config apps/web/wrangler.staging.auto.jsonc`, `pnpm preview`, `pnpm probe:foundations`, `pnpm probe:web`, `pnpm probe:seo` et les quatre `wrangler deploy --dry-run`. Publication via `wrangler deploy --keep-vars --strict` ; images Docker construites en `linux/amd64` avec `--provenance=false` puis poussées au registre Cloudflare. Vérifications distantes avec les scripts privés `deploy/verify.mjs` et `deploy/invariants.mjs`, puis `BIENVU_SEO_URL=https://bienvu.online pnpm probe:seo` : **51 pages de production validées**. `node scripts/record-admin-deployment.mjs` a enregistré la publication active dans le superadmin. Les trois importeurs HTTPS et le rendu local utilisent les scripts de recette ignorés de ce dossier de preuves.

## Visuel de démonstration

Outil intégré **imagegen**, skill `imagegen`, photographie illustrative générée à partir de la référence de composition. Fichiers finaux : `apps/web/public/images/studio-auto/suv-alpes-480.webp` et `suv-alpes-960.webp`. Ils sont réservés à la démonstration de la page, jamais injectés dans les annonces clients. [Prompt exact](assets/beta-auto-image-prompt.txt).

## Publication et retour arrière

**Publié le 25/10/2026**, après succès des deux CI du commit exact **`39c1f0025d740f5827cbce8802010ccf7682946a`**. Release **`39c1f0025d74`**, via les configurations opérateur issues de l’inventaire distant. Les noms, bindings, secrets, domaines, crons, limites et ressources sont conservés. Les sourcemaps privées PostHog ont été envoyées avant publication du web préparé `no_bundle`, avec `--keep-vars --strict`, sans recompilation.

| Worker                          | Version active à 100 %                 |
| ------------------------------- | -------------------------------------- |
| `bienvu-web-probe-staging`      | `6e83155e-ab32-4847-9531-025518949207` |
| `bienvu-generation-development` | `a569467a-5943-4de0-aebe-be37706a7468` |
| `bienvu-import-staging`         | `10538ba5-1008-4a22-a65b-a9ce3aced0b9` |
| `bienvu-mail-staging`           | `01e4e86f-6409-48a5-9e6f-dee04cac1ca7` |

Les quatre modules distants sont identiques par SHA-256 aux bundles préparés. Module web : `6e6aa3e5cc8a31e23c3000acec0e11fdd4572a74834de71399d24a650b272dbd`. Images Linux déployées par digest, renouvellement terminé à 100 % : renderer **v38** (`56a3e7b0230b7cc1c33038d41d3359881d50eb6227aa2692e7ae0655155fee95`), import **v9** (`3c93b456f5a7027a1ea573be614c05048247e8cf2a5c2e2215cf4a2e3ade3238`). Le Worker historique `bienvu-narration-staging` reste inchangé ; la narration automobile est exécutée dans le workflow de génération actuel.

Contrôles distants réussis : pages publiques 200, accès privés 401, redirection Beta 302, release HTML/RSC cohérente, assets identiques, maps publiques 404, analytics actif, huit offres mensuelles/annuelles et commission partenaire conservées. Avant l’import de recette : **163 schémas de tables existants et 16 tables / 424 lignes critiques identiques** avant/après déploiement. Après cet import, ces 16 tables restent identiques ; le parcours d’import ajoute son brouillon, ses médias et sa réservation internes. Migration 0085 conservée, aucune nouvelle migration, aucune erreur de clé étrangère et aucun job actif au contrôle. Stripe reste en mode test.

En cas de problème d’interface, revenir à la version web précédente `bd1d3357-8b79-414a-881b-b9dda7cdcae5`, en conservant les lecteurs génération/import compatibles avec les jobs Auto déjà admis. Avant tout retour arrière de ces lecteurs, inventorier les jobs en cours ; ne pas supprimer leurs JSON, médias ou réservations. Il n’existe aucune migration Auto à annuler.

Preuves locales ignorées : `deploy/verification.json`, `deploy/invariants-before.json`, `deploy/invariants-after.json`, `deploy/rollouts-completed.json`, `deploy/live-import-deltas.json`, `beta-production.png` et `import-production.png` sous `evidence/local/beta-auto/`. Les documents de compte rendu sont mis à jour après publication ; cela ne change pas la release applicative déployée.

Sources des correctifs : [Node 24.22.1](https://nodejs.org/en/blog/release/v24.22.1), [Undici 7.30.1](https://github.com/nodejs/undici/releases/tag/v7.30.1), [postal-mime 4.0.8](https://github.com/postalsys/postal-mime/releases/tag/v4.0.8), [fast-uri 3.1.9](https://github.com/fastify/fast-uri/releases/tag/v3.1.9).
