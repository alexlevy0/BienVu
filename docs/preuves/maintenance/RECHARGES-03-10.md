# Recharges et rentabilité — recette du 03/10/2026

Alex confirme les trois packs : **10 crédits / 7 € HT**, **30 / 19 € HT**, **100 / 59 € HT**. Stripe reste en mode test. Sans préférence différente sur la validité, les recharges sont sans expiration ; les crédits mensuels sont utilisés en premier. Aucun encaissement réel n’est activé.

## Résultat et protections

La page des offres propose un achat ponctuel, le consentement aux conditions, les soldes mensuel/recharges et l’historique des achats. Le portefeuille réserve atomiquement plusieurs sources et restitue les crédits dans leur source d’origine. Prix, client, mode, paiement et signature sont vérifiés côté serveur ; les notifications répétées n’accordent qu’un seul lot. Un remboursement révoque les crédits correspondants ; les litiges et dettes bloquent de nouvelles dépenses.

L’onglet **Super admin → Rentabilité** présente vidéos, agences, justificatifs, journal et CSV, avec séparation test/réel. Les recettes HT sont affectées aux crédits consommés, plafonnées au paiement original même après augmentation administrative du quota. Les frais Stripe proviennent des transactions de solde vérifiées, remboursements et pertes sur litiges déduits. Les dépenses fournisseurs utilisent le montant réellement payé en EUR et des références de justificatifs. Les stocks API prépayés ne deviennent des coûts de vidéo qu’après affectation.

Les coûts incomplets restent explicitement « À rapprocher » ; aucune estimation n’est présentée comme une facture et aucune marge inconnue n’est affichée comme un bénéfice nul ou positif. Les écritures financières sont auditées et les justificatifs immuables, avec annulation motivée. Les fournisseurs attendus proviennent des appels réels, auxquels s’ajoute Cloudflare.

## Vérifications locales

- Suite globale : **285 réussites sur 286**, avec une erreur de transport local Miniflare `ECONNRESET`. Les 19 tests concernés et d’accès/paiement repassent en exécution séquentielle, sans affaiblissement d’assertions.
- Après les derniers garde-fous, **10/10 tests ciblés** réussissent : prix/consentement, paiement asynchrone, replay concurrent, sources multiples, restitution/animations conservées, remboursement/dette/litige, frais inconnus, factures/stock/affectations/audit, plafonnement du revenu après cadeau de quota, migration d’une facture historique à quota modifié, abonnements et signatures.
- Typage des packages et des tests, frontières **257 fichiers**, build OpenNext et dry-runs web/génération réussis. Aucune nouvelle image de rendu n’est nécessaire.
- Chromium **1536/390/320 px** : packs, consentement, soldes, finance, justificatif et vue agence ; captures inspectées, aucun débordement. APIs de recette interceptées, aucune écriture lancée dans cette recette visuelle.

## API Stripe réelle de test

Configuration des trois prix à achat unique sur le compte sandbox, mêmes montants HT et EUR. Les événements du webhook existant sont conservés, avec ajout des recharges, paiements, remboursements et litiges. Secret webhook inchangé, clés/exports locaux hors Git, permissions 0600.

Un Checkout créé par BienVu est confirmé avec la fixture officielle Stripe CLI et `tok_visa`, uniquement en mode test. Son état est relu auprès de Stripe, ainsi que sa notification réelle. Le webhook signé est livré deux fois à une D1 locale isolée : **10 crédits accordés une seule fois**, recette HT **7 €**, frais Stripe de test **0,47 €**, rapprochement complet. Aucun crédit n’est créé dans la D1 de production par cette recette. La recette API réelle de l’abonnement est également répétée : facture test **19 €**, quota **40 crédits**, replay sans doublon, abonnement ensuite annulé.

Le formulaire hébergé Stripe a été chargé dans Chromium, mais sa confirmation automatisée par saisie de carte n’a pas abouti. Le paiement réussi est prouvé par la fixture officielle et l’API réelle, pas par un parcours humain complet du formulaire. Les API fournisseurs de narration/animation ne sont pas appelées et aucun paiement d’argent réel n’est effectué.

## Limites

Les factures OpenAI, Google, Fish, Runway et Cloudflare ne sont pas importées automatiquement : le Super admin renseigne leurs justificatifs et le montant effectivement débité. Les estimations/provisions historiques demeurent séparées. La marge affichée est une marge contributive, après les coûts affectés et les frais vérifiés ; les autres frais Stripe périodiques et charges générales nécessitent également un justificatif.

Les paiements commerciaux nécessitent les clés/prix/webhook live, les informations légales et une configuration fiscale adaptée. Les plafonds du pilote restent applicables aux crédits achetés en sandbox. Cette livraison ne modifie ni les crédits anonymes offerts, ni les abonnements, ni les vidéos déjà exportées.

## Publication

Sauvegarde SQL D1 avant migration, permissions **0600**, **876 440 octets**, SHA-256 `2cd8550fbd4c85060e6401882ae7ea91b182a5a952c50e7c6101f0eab236821b`. Admissions suspendues avec zéro job actif, puis migrations **0039–0040** appliquées et Workers web/génération publiés. Comparaison des colonnes originales : **13 tables / 291 lignes historiques identiques** avant et après. Zéro défaut de clé étrangère ; admissions rétablies à 1, **15 jobs / zéro actif**.

| Service | Version à 100 % |
|---|---|
| Web | `852014a8-7c50-46a5-adef-bda00caf4f75` |
| Génération | `76d6c210-ccd1-4f3a-a8d2-0e7971ca348a` |
| Import, inchangé | `dc96f411-4491-4c4f-8627-9d0b58a018f4` |

Bindings d’origine strictement conservés : web **32 → 35** (trois prix supplémentaires), génération **28**, import **9**. Dates/flags/variables/secrets précédents conservés. Renderer **v16**, image `478ed742a9b9fa18734e98cacad16ff7891b569b38509477057ce04bd354e667` et configuration identiques ; aucun rollout, aucune nouvelle image.

Budget octobre inchangé : base **37,25 €**, imports provisionnés **12,50 €**, total engagé **49,75 €**, coupure **90 €**, enveloppe autorisée **100 €**, aucune pause. Aucun appel fournisseur payant ni crédit client dépensé pour cette recette. Les frais de calcul/déploiement restent à rapprocher de la facture Cloudflare ; l’absence d’appel fournisseur n’est pas assimilée à une facture nulle.

HTTP publié : accueil, connexion, offres et conditions **200** ; nouvelles routes finance et recharges, GET/POST, ainsi que crédits/abonnement privés **401**, réponses `no-store` sans connexion. Chromium sur bienvu.online à **1536/390/320 px** : trois packs, consentement requis, soldes, aucun débordement. Cette recette visuelle utilise des APIs interceptées et ne lance aucune écriture distante.

Le vrai rapport financier est exécuté en lecture seule sur la D1 publiée : **15 vidéos de test**, **15 coûts fournisseurs à rapprocher**, marge inconnue, **zéro paiement réel / zéro vidéo live**. Aucun coût de facture fictive n’est injecté dans le panel de production. Les données fournisseur attendues sont issues des journaux historiques conservés.

Commandes : `pnpm check`, tests séquentiels ciblés, `pnpm typecheck`, `tsc -p tsconfig.tests.json`, `pnpm check:boundaries`, `pnpm build:web`, dry-runs, `wrangler d1 export`, migrations, `wrangler secret bulk`, déploiements `--keep-vars` et génération `--containers-rollout none`. Scan des **717 fichiers non ignorés**, aucune clé Stripe longue détectée ; `git diff --check` réussi. Navigateurs et serveurs de recette fermés, utilisateur/session de recette locale supprimés. Les traces privées sont dans `evidence/local/topups/` et ne sont pas versionnées. Aucun commit/push n’a été demandé pour cette livraison.

Pour revenir aux Workers précédents : suspendre les admissions, attendre zéro job actif, restaurer le web `c5139089-3e90-4f37-9658-0c26f58e99c5` et la génération `e0d8c664-ac27-458f-b7a4-1da4948a62af`. Garder les migrations additives et les données intervenues depuis. Un ancien service de génération ne dépense pas les nouveaux portefeuilles à sources multiples ; rouvrir seulement après contrôle de compatibilité, sans restaurer une sauvegarde ancienne sur de nouvelles écritures.
