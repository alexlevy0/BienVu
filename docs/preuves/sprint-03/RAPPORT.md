# Sprint 03 — imports d’agences en local

> Rapport historique local. La recette distante du 28/09 est maintenant décrite dans le [rapport Cloudflare](CLOUDFLARE.md).

> Rapport historique de la tranche initiale. Revue du 28/09 : le code web et les migrations `0001`–`0008` sont depuis déployés pour les comptes, mais les imports URL/manuels restent fermés. La CI GitHub du dépôt est vérifiée réussie ; cela ne valide pas le transport Cloudflare. Voir le [bilan actuel](../../BILAN-SPRINTS.md), incluant les extensions description et saisie manuelle.

Date : **28 septembre 2026, Europe/Paris**. Les horodatages UTC des premiers essais réels sont encore au 27 septembre. Code et parcours local livrés ; **transport Cloudflare et Browser Run de cette tranche non validés**. Aucun déploiement, abonnement, Docker, paiement, appel IA ou e-mail réel.

Extension demandée ensuite par Alex : [description du bien importée, sauvegardée et affichée](DESCRIPTION.md), 81 tests au total et trois nouvelles lectures de pages réelles. Les résultats ci-dessous conservent la recette initiale (77 tests) ; les preuves de cette extension sont séparées.

Nouvelle décision d’Alex : [saisie manuelle avec photos](SAISIE-MANUELLE.md), formulaire dépliant sous l’import URL, 89 tests au total et recette HTTP/navigateur locale. Elle remplace l’exclusion initiale du formulaire manuel évoquée dans l’historique ci-dessous.

## Résultat utilisable

Après connexion, `/generer` importe un lien public, affiche les faits sourcés et une galerie privée, puis permet de retrouver l’import. Les photos sont réellement décodées, normalisées et stockées dans R2 local. L’agence vient de la session ; aucun identifiant d’agence fourni par le client n’est accepté. Il n’y a ni éditeur, ni ajout manuel de photos, ni génération de vidéo dans cette tranche. Le droit d’essai reste disponible.

Le transport natif local épingle l’IP publique vérifiée et contrôle chaque redirection. Le Worker distant reste fermé : une vérification DNS suivie d’un `fetch` par nom ne suffirait pas à établir la sûreté de la connexion. [Procédure](../../IMPORTS.md) · [décision technique](../../adr/0002-import-local-et-egress.md).

## Vérifications sur fixtures

- **77 tests réussis**, frontières Node/Workers et TypeScript réussis. Les fixtures couvrent vente, location, charges/période, prix absent, identité/prix/surface contradictoires, page hors annonce, références JSON-LD, microdata, lazy loading, `srcset`, doublons et trois adaptateurs. Journal (`docs/preuves/sprint-03/check-final.log`).
- DNS mixte, adresses réservées IPv4/IPv6, redirections et photos dangereuses refusés avant la cible ; connexion IP injectée contrôlée. Les JPEG/PNG/WebP synthétiques sont réellement décodés. Corruption, faux MIME, petites images, bombes de pixels et budget de flux échoués testés. Ces attaques contrôlées ne sont pas envoyées à des réseaux tiers.
- D1/R2 tournent réellement dans Miniflare : isolation, rejeu/double clic, un seul import actif, échec du deuxième `put`, journal de nettoyage, purge d’abandon et protection d’un job. Le plafond persiste après une purge produit. Recette ciblée finale (`docs/preuves/sprint-03/storage-final.log`).
- Routes workerd réellement appelées par HTTP : session, CSRF, corps strict, import dédupliqué, lecture D1/R2, décodage du JPEG retourné, refus visiteur/autre agence, contradiction persistée et zéro job. Les sources et comptes sont synthétiques ; le pont de cette sonde n’a aucune sortie vers les agences. Rapport HTTP (`docs/preuves/sprint-03/http-report.json`), journal (`docs/preuves/sprint-03/http-final.log`).
- Interface inspectée à 1 280×900 et 390×844 : refus d’URL locale, ouverture d’un import existant, import de location à 950 €/mois charges comprises, trois photos chargées, conservation annoncée, erreur française et autre lien proposé. Aucun débordement horizontal observé à 390 px. Inspection (`docs/preuves/sprint-03/inspection-ui.json`).
- Migrations locales appliquées puis réappliquées sans modification ; build Next.js/OpenNext terminé. Migrations (`docs/preuves/sprint-03/migrations.log`), réapplication (`docs/preuves/sprint-03/migrations-repeat.log`), build final (`docs/preuves/sprint-03/build-final.log`).
- Après les ajustements d’interface, tests D1/R2 ciblés, build et TypeScript final (`docs/preuves/sprint-03/types-final.log`) réussis. Sondes de régression fondations (`docs/preuves/sprint-03/foundations.log`), web (`docs/preuves/sprint-03/web.log`) et comptes (`docs/preuves/sprint-03/accounts.log`) réussies. Données synthétiques nettoyées (`docs/preuves/sprint-03/cleanup.json`), pont de fixtures arrêté ; preview 8787 et pont HTTPS réel 8791 conservés pour Alex. Contrôle ciblé des secrets (`docs/preuves/sprint-03/secret-scan.json`), liens relatifs (`docs/preuves/sprint-03/doc-links.json`).

Les deux tests de fermeture de navigateur utilisent une instance injectée factice (succès/exception/timeout et lancement tardif). Ils **ne valident pas une session Browser Run réelle**. Le fallback préparé n’est pas branché au parcours utilisateur. La CI a été complétée avec la sonde synthétique ; son exécution sur GitHub n’a pas été vérifiée ici.

## Imports réels depuis le poste

Une tentative mesurée par annonce, trois photos retenues, sans relance automatique. HTTPS natif depuis le Mac, D1/R2 Miniflare isolés, relecture des fichiers puis destruction du stockage isolé. Les durées ci-dessous proviennent du moteur d’import (chargement, extraction et stockage/relecture des photos) et ne comprennent pas l’initialisation de Miniflare. Mesures expurgées (`docs/preuves/sprint-03/real-sources.json`), inspection des photos (`docs/preuves/sprint-03/inspection-photos.json`).

| Source et structure | Faits retenus | Photos / durée | Résultat et limite |
|---|---|---|---|
| [Espaces Atypiques 14713](https://www.espaces-atypiques.com/ventes/69007-lyon-ancien-renove-au-coeur-du-7eme-14713/) — données embarquées + DOM et galerie par référence | Appartement, Lyon, vente 470 000 €, 4 pièces | 3 / 1 195 ms | Succès ; trois angles du séjour, surface omise car définitions non assimilées |
| [Orpi, Paris 12](https://www.orpi.com/annonce-vente-appartement-t2-paris-12-75012-ddbf1828-1eb9-4ebe-885c-85f7e30057f1/) — en-tête DOM, UUID et galerie CDN | Appartement, vente 379 000 €, 42,06 m², 2 pièces | 3 / 1 449 ms | Succès ; deux intérieurs et une vue extérieure, filigranes source conservés |
| [Century 21, Lyon 69008](https://www.century21.fr/trouver_logement/detail/16965965448/) — DOM et carrousel sans JavaScript | Appartement, vente 190 000 €, 61 m², 3 pièces | 3 / 853 ms | Succès ; séjour, cuisine, salle de bains ; définition 640×480, qualité du futur recadrage à vérifier |

Les faits ont été rapprochés des pages consultées et les neuf JPEG relus ont été inspectés visuellement par Codex. Cela ne vaut pas une approbation humaine d’Alex, ni une validation de droits de réutilisation commerciale. Les photos, HTML complets et sorties brutes restent hors Git dans `evidence/local/sprint-03/`. Seuls les faits bornés, dimensions et SHA-256 sont versionnés ; paramètres de signature CDN supprimés des preuves publiables. Les fixtures reprennent uniquement des marqueurs de structure, avec données remplacées.

L’échantillon ne couvre que **trois annonces de vente**. La location fonctionne sur fixtures, pas encore sur une annonce réelle. Les autres modèles de ces sites, portails, pages exigeant JavaScript, protections antibot et CDN non autorisés restent non couverts. Aucun résultat de cette table ne prouve l’accès depuis Cloudflare.

## Corrections issues de la recette

Le premier test HTTP a échoué : workerd n’accepte pas `redirect: 'error'`. La liaison locale utilise désormais `manual` et refuse les réponses non réussies, sans suivre leur destination. La recette a ensuite réussi. OpenNext signalait également une copie impossible du package d’import à cause de la forme courte de `exports` ; passage à la forme objet et déclaration dans `transpilePackages`, puis build propre pour ce point. L’avertissement amont fast-png sur `??` demeure déjà présent au sprint 02, sans échec du build.

Les flux interrompus conservent une réservation conservatrice de taille, pour ne pas permettre de dépasser le plafond via des images invalides. Le dernier téléchargement est limité au reliquat. Après une coupure, le journal D1 garde les clés R2 à réconcilier ; la purge locale attend le bail et cinq minutes de grâce, et refuse toute annonce référencée par un job.

## Coût et reprise distante

**0 appel facturable effectué dans cette tranche**, trois essais HTTPS publics depuis le poste, neuf photos, 2 241 658 octets normalisés stockés temporairement en local. Les consultations de pages nécessaires au choix des liens ont également eu lieu depuis le poste. Aucun temps Browser Run, token IA, rendu Containers ou objet R2 distant ajouté. Coût fournisseur supplémentaire des essais : 0 € ; Internet, électricité et matériel local non mesurés. Facture Cloudflare non relue, budget global de 30 € non certifié par ces chiffres.

Reste précisément à réaliser : transport sûr et décodage borné compatibles Cloudflare ; recette contrôlée DNS/redirections/sous-requêtes/navigations ; vrais cycles Browser Run et mesure CPU/temps/coût ; migration et recette des trois sources sur staging ; purge périodique hébergée. Le simple passage à Workers Paid ne démontre pas ces propriétés. Les recettes Google/e-mails du sprint 02 et Containers du sprint 00 restent distinctes. [Liste de reprise](../../IMPORTS.md#cloudflare--configuration-et-exploitation).
