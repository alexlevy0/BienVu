# Extension du sprint 03 — saisie manuelle avec photos

**28 septembre 2026, Europe/Paris.** À la demande d’Alex, ajout d’un bouton sous l’import URL qui déplie un formulaire de création d’annonce. Cette décision remplace l’exclusion initiale de la saisie et des uploads manuels. Fonctionnement vérifié en local, sans déploiement ni achat.

## Livré

Titre, type de bien, vente/location, localisation, prix ou loyer avec charges, surface, nombre de pièces, description et 3 à 12 photos. Aperçus, retrait d’un fichier avant envoi, champs conservés lorsque le formulaire est replié, progression réelle par fichier et erreurs françaises. Annonce sauvegardée dans l’espace privé et consultable après rechargement, avec mention de provenance manuelle. Aucun crédit ni vidéo créé.

Contrat `ManualListingInput`, provenance `user_provided`, `sourceKind=manual` et sources web `null` ; migration `0008`, journal d’uploads, publication après réception de tous les fichiers, routes protégées et garde locale. Photos décodées/réencodées par Sharp via le pont Node local authentifié, jamais chargé dans le bundle Worker. Le manifeste borne nombre, taille, type et contenu des fichiers ; les images identiques sont refusées après normalisation.

Fichiers principaux : `packages/contracts/src/manual-listing.ts` et `product.ts`, `packages/db/src/imports.ts` et migration `0008_manual_listings.sql`, `apps/web/lib/manual-listings.ts`, routes `api/imports/manual`, `uploads/:index`, `complete`, formulaire `manual-listing-form.tsx`, `GenerationForm`, CSS, pont `serve-imports.ts`, sondes, tests et CI. Documents de cadrage, consignes, contrats et parcours mis en accord avec la demande. [Guide et limites](../../SAISIE-MANUELLE.md).

## Vérifications exécutées

- 89 tests réussis (`docs/preuves/sprint-03/manual-check.log`), frontières Node/Workers et types réussis. 21 tests ciblés (`docs/preuves/sprint-03/manual-tests-targeted.log`) couvrent notamment provenance, unités, validation, clés réutilisées, isolation inter-agences, fichier modifié, faux JPEG, doublons normalisés, `put` interrompu/repris, finalisation concurrente, expiration et purge sans rendre les tentatives.
- Migration sur base habituelle (`docs/preuves/sprint-03/manual-migrations.log`), réapplication sans changement (`docs/preuves/sprint-03/manual-migrations-reapply.log`), puis migrations sur base isolée vierge (`docs/preuves/sprint-03/manual-isolated-migrations.log`) réussies. Anciennes annonces URL conservées et compatibles avec le nouveau contrat.
- Build OpenNext final (`docs/preuves/sprint-03/manual-build-final.log`) réussi après les ajustements visuels ; avertissement fast-png amont déjà connu, sans échec. TypeScript des tests et outils opérateur également vérifié.
- HTTP workerd (`docs/preuves/sprint-03/manual-http-report.json`) : import URL toujours fonctionnel, création manuelle de location à 950 €/mois charges comprises, trois fichiers transmis par PUT puis réencodés en JPEG, finalisation et relecture. Refus visiteur, CSRF, autre agence, corps falsifié et publication incomplète. Rejeux sans doublon. Journal (`docs/preuves/sprint-03/manual-http.log`).
- Navigateur (`docs/preuves/sprint-03/manual-inspection-ui.json`), 1 280×720 et 390×844 : sélecteur de fichiers réellement utilisé, aperçus, retrait/réajout, repli et valeurs conservées. Une vente est créée via le formulaire : 275 000 €, 82,5 m², 4 pièces, description en deux paragraphes. Après redémarrage du Worker et rechargement, données et trois JPEG privés relus. Aucun débordement horizontal observé. Les erreurs se retirent à la modification du champ et le bouton d’ajout reste clair après sélection.

Commandes : tests ciblés, `pnpm check`, `pnpm db:migrate` puis réapplication, `pnpm build:web` avant puis après corrections d’interface, `pnpm exec tsc -p tsconfig.tests.json`, preview, `pnpm probe:imports --manual --keep`, ouverture de session de recette, inspection navigateur, `pnpm probe:imports --cleanup`. La CI inclut désormais `--manual`, sans exécution GitHub vérifiée ici.

## Fixtures, échecs initiaux et nettoyage

**Utilisateurs, données immobilières et photos synthétiques.** D1/R2, routes HTTP, décodage Sharp et navigateur réels sur le poste. Aucune nouvelle annonce publique consultée, aucun test distant Cloudflare, aucune nouvelle session Browser Run ou rendu vidéo.

Le premier test ciblé a révélé un ancien test de quota dépendant de l’heure : sa simulation ajoutait 700 secondes à une heure proche de minuit UTC et franchissait un nouveau jour de quota. Il utilise désormais midi UTC ; le comportement produit n’a pas été modifié pour contourner la limite. La recette complète passe ensuite.

La première sonde HTTP sur la base habituelle a reçu `429` : cinq tentatives existaient déjà pour le jour UTC. Aucun compteur utilisateur remis à zéro. La recette a été exécutée avec `--persist-to` dans un état D1/R2 séparé et `BIENVU_LOCAL_STATE` pour les accès opérateur. Les données créées par la sonde et par le navigateur ont été nettoyées (`docs/preuves/sprint-03/manual-cleanup.json`) : zéro compte, import, annonce, objet journalisé, ligne de compteur ou job restant dans cet état isolé. Les suppressions R2 ont réussi.

La preview habituelle au port 8787 et le pont d’import local au port 8791, configuré pour les sources HTTPS réelles, ont été rétablis. État habituel (`docs/preuves/sprint-03/manual-usual-state.json`) : quatre imports URL réussis, un échec et les cinq tentatives du 27/09 conservés. Onglet de recette fermé et taille du navigateur rétablie.

## Limites et coût

Les uploads manuels dépendent encore du service natif **local**. Staging reste fermé ; décodage hébergé, CPU, facture, purge périodique et liaison de l’annonce manuelle au futur pipeline vidéo restent à vérifier. Le formulaire n’améliore pas artificiellement les chiffres de compatibilité des importeurs.

**0 € fournisseur supplémentaire attendu**, aucune API payante, aucun R2 distant, Docker, e-mail réel, abonnement ou déploiement. Facture non consultée, matériel local non mesuré. Aucun commit/push de cette extension.
