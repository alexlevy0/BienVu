# E-mails d'inscription et locations Orpi — 30 septembre 2026

## Causes confirmées

- **E-mail :** le Worker web publié conservait `allowed_destination_addresses` limité à la boîte du testeur initial. Le nouveau compte signalé était présent, créé à 12 h 29 Paris, avec un compte mot de passe et `emailVerified=0`. Le domaine d'envoi était activé. Aucun mot de passe, adresse personnelle ni lien de confirmation n'est inclus dans ce rapport.
- **Orpi :** les deux liens signalés sont des locations. Le registre n'autorisait que `/annonce-vente-…-UUID/`, donc l'essai anonyme les refusait avant le réseau avec `TRIAL_SOURCE_UNSUPPORTED`. Le slash final était aussi obligatoire ; ce second défaut est corrigé sans le présenter comme la cause des deux essais signalés.

## Correction publiée

- Binding e-mail limité à l'expéditeur vérifié `connexion@bienvu.online`, sans filtre des destinataires. Préparation explicite `BIENVU_AUTH_EMAIL_AUDIENCE=public` ; la configuration de recette conserve son mode `test` et le script refuse de mélanger public et destinataire de test.
- Journalisation `auth_email_submitted`, `auth_email_failed`, `auth_email_limited` : finalité et code sur liste blanche, aucune donnée du destinataire, corps, lien, jeton ou message fournisseur brut. Les plafonds 50/jour et 3/adresse/10 minutes sont conservés, y compris sur échec de transport.
- Registre Orpi vente/location, slash final optionnel, transaction recoupée avec le titre. Extraction du loyer principal avec période mensuelle et charges explicites ; dépôt, honoraires et biens voisins exclus. Prix omis si période/charges non établies, contradiction refusée. Référence URL/galerie et protections réseau conservées. Une page de recherche d'un portail autorisé est distinguée d'une source extérieure au pilote.
- Web : `74306ad2-3b7c-4957-b996-482d15d8ebbb`. Génération : `4b892844-6912-4cc3-8064-224ef89aa5bb`. Déploiements `--keep-vars --strict`, secrets conservés. Génération publiée avec `--containers-rollout=none`, sans construire ni changer l'image du renderer. Un job utilisateur en cours a terminé avant la publication de ce Worker ; aucune admission suspendue, aucun job annulé.

## Vérifications locales / fixtures

`pnpm check` final : **183 tests réussis**, types et frontières (162 fichiers). Typegen web, build Next/OpenNext et dry-runs Wrangler web/génération réussis. Les erreurs initiales de typage du test (`rooms` optionnel), puis de concurrence entre build et lecture des types `.next`, ont été corrigées et les vérifications finales sont vertes.

La fixture `orpi-rent.html` est synthétique. Elle vérifie vente/location, absence et contradiction de charges, absence du prix/période, exclusion des autres montants et des voisins, variante sans slash et conservation des contrôles d'identité. Le transport mail des tests est capturé en mémoire, avec erreurs fournisseur simulées ; aucun message réel n'est envoyé par ces tests.

## Vérifications réelles

Les deux HTML ont été récupérés via le transport HTTPS natif borné. Après publication, deux appels réels à `/api/imports` sur bienvu.online ont utilisé une identité synthétique isolée, des données Orpi réelles et le transport Cloudflare/Container existant. **Aucune vidéo n'a été créée par cette recette.**

| Annonce fournie | Résultat Cloudflare | Loyer | Surface / pièces | Photos |
|---|---|---|---|---:|
| [Chevilly-Larue](https://www.orpi.com/annonce-location-appartement-t1-chevilly-larue-94550-1f8c2c09-b7cc-4eb4-8de1-dbcb20ed03e0/) | `ready` | 833 €/mois charges comprises | 22,41 m² / 1 | 5 |
| [Issy-les-Moulineaux](https://www.orpi.com/annonce-location-appartement-t2-issy-les-moulineaux-92130-e042f263-7553-4214-b80e-4e58eb105d61/) | `ready` | 1 178 €/mois charges comprises | 37,23 m² / 2 | 7 |

Relecture de chaque import identique à la réponse initiale ; chaque photo privée a été relue par l'API, empreinte SHA-256 vérifiée et JPEG décodé, sans EXIF. Accès anonyme aux annonces refusé (401). Aucun test visuel du cadrage de ces photos ni génération d'une vidéo de location effectué. Les tests locaux antérieurs restent la preuve de refus inter-agences ; cette recette distante n'a pas ajouté une seconde agence.

Nettoyage distant terminé : compte et agence synthétiques, deux imports et leurs douze photos supprimés. Les compteurs d'import et réservations financières avant/après nettoyage sont identiques (`cleanup.json` hors Git). Aucun compte ou job utilisateur supprimé.

Le binding public a été relu auprès de Cloudflare : seul `allowed_sender_addresses` reste présent. `/`, `/connexion` et `/api/auth/status` répondent 200, Google/e-mail disponibles et transport configuré. Ce contrôle n'est pas une preuve de réception du nouvel e-mail. L'utilisateur a été invité à demander un nouveau lien depuis « Renvoyer l'e-mail de confirmation ». Aucun envoi à son père ni réinitialisation du compte n'a été déclenché par l'agent.

Preuves brutes et identité synthétique hors Git : `evidence/local/email-orpi-30-09/` et `evidence/remote/email-orpi-30-09/`.

## Coûts et limite restante

Avant les deux imports : 29,40 € de base D1 + 10 € de réservations = 39,40 €. Après : base inchangée + 11 € = **40,40 €**, plus les 0,05 € OpenAI historiques hors D1, soit **40,45 € provisionnés sur 50 €**, marge **4,55 € avant coupure à 45 €**. Ajout de cette recette : **1 € de provisions**, pas une facture. Compteur du 30/09 : 1 → 3 tentatives ; aucune remise à zéro ou restitution des coûts. Aucun nouvel appel OpenAI, Google TTS ou e-mail ; facture et usage infrastructure du déploiement non rapprochés.

Restant : confirmation de réception du nouveau mail par la personne concernée. Les deux imports complets sont validés sur Cloudflare ; une vidéo avec ces annonces n'a pas été testée et n'est pas assimilée à cette preuve.
