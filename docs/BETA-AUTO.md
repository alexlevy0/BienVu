# Beta BienVu — studio immobilier et automobile

La demande d’Alex du 25/10/2026 porte sur la maquette fournie et un mode **Auto complet avec import par lien et génération**. Le travail utilise l’origine existante : `beta.bienvu.online` redirige vers `bienvu.online/beta`. Aucune nouvelle infrastructure d’environnement n’est créée.

## Parcours livré

- Accueil Beta inspiré de la référence : sélecteur Immobilier / Auto, grand titre serif, cartes superposées, sources automobiles, sept usages de contenus. Les textes et visuels sociaux ne sont pas présentés comme sept exports automatiques.
- Auto : connexion, import d’une annonce ou saisie manuelle, vérification des informations, ajout et sélection de 3 à 12 photos réelles, ordre, animations facultatives, durée 20/30/40 s, format vertical/horizontal, style, voix et présentateur existants. Le coût est affiché avant le lancement.
- Les informations absentes restent absentes. Les photos de catalogue Aramis `betamodels` sont exclues. Les réserves du vendeur sont conservées dans la narration ; GPT sélectionne un catalogue de paragraphes, sans écrire de caractéristiques libres.
- Le brouillon peut être enregistré et repris. Un retour réseau perdu conserve la même clé d’admission ; la complétion ne se rejoue pas au second clic. Les photos restent privées et leur journal précède R2.
- L’accueil immobilier principal est conservé. Les anciens brouillons Auto sont dirigés vers Beta ; les anciens brouillons immobiliers restent dans leur parcours.

## Sources réellement vérifiées

Échantillon fermé : les trois liens transmis par Alex. Transport HTTPS sécurisé et normalisation native, depuis le Mac ; pas de contournement de refus, CAPTCHA ou authentification de portail.

| Source                                                                                                                                              | Résultat local                                                                       | Suite proposée dans l’interface                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| [AutoScout24 — Peugeot 207](https://www.autoscout24.fr/offres/peugeot-207-1-6-hdi-diesel-gris-cat_ma55mo18797-6571066c-6882-4f91-a7f8-8bad0771c9d8) | Caractéristiques, prix, commentaire et cinq photos normalisées                       | Vérifier puis générer                                  |
| [Aramisauto — Jaecoo 7](https://www.aramisauto.com/voitures/jaecoo/7/exclusive/v352925?vehicleId=1023164)                                           | Caractéristiques et prix ; aucune photo réelle propre au véhicule dans l’échantillon | Ajouter trois photos réelles et, si souhaité, la ville |
| [La Centrale — Audi Q4 e-tron](https://www.lacentrale.fr/auto-occasion-annonce-87103059281.html)                                                    | Refus d’accès HTTP 403                                                               | Saisie manuelle et photos personnelles                 |

La compatibilité d’un domaine n’est pas une garantie pour toutes ses annonces. Le catalogue public `/sources` distingue ces essais locaux des essais Cloudflare. Les hôtes de médias sont explicites ; références, URL canonique, redirections, DNS, tailles et durées restent contrôlés par le transport existant.

## Contrats et conservation des données

`NormalizedListing` accepte une extension optionnelle `category: vehicle` et des caractéristiques avec provenance : marque, modèle, année, kilomètres, énergie, transmission, puissance. Elle n’ajoute aucun champ par défaut aux annonces historiques. Les faits immobiliers restent absents pour un véhicule. Aucune migration SQL n’est nécessaire : ces données restent dans les JSON d’import et de brouillon existants.

Le pipeline conserve admission, crédits, plafonds fournisseurs, journaux, cache et workflow existants. Les scripts Auto portent `narration-auto/1`. Les photos automobiles larges sont conservées dans leur cadre complet. Les habillages utilisent année/km/énergie, et les animations demandent de préserver le véhicule immobile. Les modèles et tarifs fournisseurs ne changent pas.

## Vérifications

- Tests Auto : identification de l’annonce et de la galerie, référence étrangère, page de résultats, zéro kilomètre, image de catalogue, ancien JSON inchangé, provenance, narration 20/30/40 s, photos étrangères refusées, brouillon D1/R2, accès inter-agences et aucun débit à l’import.
- Workflow workerd réel, fournisseurs simulés : Auto avec voix, manifeste automobile, arrêt et reprise du runtime, une seule admission et un seul crédit consommé.
- Navigateur Chrome 1536 et 390 px : import simulé, modification des caractéristiques, ordre `[1,0,2]`, supplément d’animation, trois durées, format horizontal et reprise avec la même clé après une réponse perdue. Aucun débordement ni erreur JavaScript.
- Import HTTPS réel sur les trois exemples ci-dessus. MP4 local de 40 s avec les cinq photos de la Peugeot et une voix **Thomas macOS hors ligne**, distincte de Cartesia. 1200 frames, H.264/AAC, lecture progressive, volume moyen −18,51 dB, durée conteneur 40,043 s.
- Premier `pnpm check` : 915/922 tests réussis. Deux attentes de catalogue nécessitaient les nouvelles sources ; cinq échecs liés aux ports locaux `EADDRNOTAVAIL` ou à leurs conséquences. Les deux attentes sont corrigées ; reprise ciblée en série **50/50 réussie**. La CI complète du commit exact reste à consigner avant publication.
- Typage complet réussi. Audit corrigé : aucune vulnérabilité connue. Node 24.22.1, Undici 7.30.1, postal-mime 4.0.8 et fast-uri 3.1.9 corrigent les alertes qui bloquaient la CI. Images Linux reconstruites avec un digest Node exact, sans modification de facturation.

Les fixtures et rapports bruts sont ignorés dans `evidence/local/beta-auto/`. Aucun appel de génération GPT/Cartesia/HeyGen/Runway ni crédit BienVu n’est utilisé par ces vérifications. Le coût du visuel imagegen n’est pas mesuré ici. La qualité de la voix Cartesia et les sorties payantes HeyGen/Runway ne sont pas revalidées par ce rendu hors ligne.

## Visuel de démonstration

Outil intégré **imagegen**, skill `imagegen`, photographie illustrative générée à partir de la référence de composition. Fichiers finaux : `apps/web/public/images/studio-auto/suv-alpes-480.webp` et `suv-alpes-960.webp`. Ils sont réservés à la démonstration de la page, jamais injectés dans les annonces clients. [Prompt exact](assets/beta-auto-image-prompt.txt).

## Publication et retour arrière

La publication doit attendre la CI du commit exact, puis utiliser les configurations opérateur issues de l’inventaire distant. Conserver les noms, bindings, ressources, crons, limites et secrets. Préparer le web avec ses sourcemaps privées puis publier le bundle `no_bundle`, avec `--keep-vars --strict`. Déployer les nouvelles images import/rendu et le correctif du Worker mail. Enregistrer le déploiement web après vérification.

En cas de problème d’interface, revenir à la version web précédente `bd1d3357-8b79-414a-881b-b9dda7cdcae5`, en conservant les lecteurs génération/import compatibles avec les jobs Auto déjà admis. Avant tout retour arrière de ces lecteurs, inventorier les jobs en cours ; ne pas supprimer leurs JSON, médias ou réservations. Il n’existe aucune migration Auto à annuler.

Versions publiées, CI et contrôles distants : **à compléter après publication réelle**.

Sources des correctifs : [Node 24.22.1](https://nodejs.org/en/blog/release/v24.22.1), [Undici 7.30.1](https://github.com/nodejs/undici/releases/tag/v7.30.1), [postal-mime 4.0.8](https://github.com/postalsys/postal-mime/releases/tag/v4.0.8), [fast-uri 3.1.9](https://github.com/fastify/fast-uri/releases/tag/v3.1.9).
