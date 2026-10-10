# Recharges de crédits et rentabilité — 03/10/2026

Décisions d’Alex : packs de **10 crédits / 7 € HT**, **30 / 19 € HT**, **100 / 59 € HT**. Achat ponctuel, sans modification de l’abonnement. L’option proposée sans expiration est retenue en l’absence de préférence différente. Les abonnements restent à 3 / 40 / 120 crédits mensuels ; l’essai anonyme reste à 1 crédit offert. Stripe reste en **mode test**, aucun encaissement réel activé.

## Portefeuille et paiement

- Les crédits mensuels sont utilisés en premier ; les recharges sont ensuite consommées par ordre d’achat. Une seule génération peut réserver plusieurs sources.
- Le règlement atomique restitue les crédits inutilisés dans leur source d’origine. La réussite d’une nouvelle animation reste facturée même en cas d’échec de l’export, conformément au fonctionnement précédent.
- Les achats survivent au renouvellement de l’abonnement. Une suspension du service, le budget du pilote et les limites de génération restent applicables.
- Checkout hébergé par Stripe ouvert directement après le choix du pack, sans case intermédiaire ; conditions et confidentialité accessibles près du bouton. Prix serveur et clé d’idempotence conservés. Seuls propriétaire et administrateurs d’agence peuvent acheter après connexion. Un retour de navigateur ne crée aucun crédit.
- Le webhook vérifie la signature sur le corps brut, puis relit le Checkout payé, son client, ses lignes, sa devise, son prix et son PaymentIntent. `checkout.session.completed` et `checkout.session.async_payment_succeeded` sont pris en charge. Des notifications répétées convergent vers un seul lot.
- Les remboursements révoquent une quantité de crédits proportionnelle, arrondie au supérieur. Un litige bloque la dépense jusqu’à son règlement. Si des crédits déjà consommés sont remboursés, la dette bloque aussi les autres sources ; le rapprochement vérifie l’état actuel auprès de Stripe et ne dépend pas de l’ordre des notifications.
- Un paiement terminé libère le verrou du Checkout suivant. Historique des 50 derniers achats, solde mensuel et solde des recharges séparés dans les offres.

Migrations : `0039_credit_topups.sql` et `0040_video_profitability.sql`. Les anciens journaux, requêtes, réservations et périodes restent utilisables ; les nouveaux financements sont distingués par `funding_version=1`. Le mode financier de chaque nouvelle vidéo est enregistré à son admission.

Variables Stripe supplémentaires : `STRIPE_TOPUP_PRICE_10`, `STRIPE_TOPUP_PRICE_30`, `STRIPE_TOPUP_PRICE_100`. Les trois prix doivent être en EUR, achat unique, montant HT exact, `tax_behavior=exclusive`. La politique D1 `credit_payment_policy.mode` et le mode des clés doivent correspondre. `topup_valid_days=0` signifie sans expiration ; la validité est figée lors de la commande. Aucun changement de validité rétroactif n’est prévu.

Le webhook conserve ses événements d’abonnement et ajoute les événements de paiement ponctuel, charge, remboursement et litige. La taxe automatique reste désactivée dans ce sandbox ; l’ouverture commerciale réelle doit utiliser les informations fiscales et le compte appropriés.

## Rentabilité dans Super admin

Onglet **Rentabilité** : filtres test/réel, dates, recherche, vidéos paginées, agences, justificatifs, journal financier et export CSV de la page affichée. Le détail d’une vidéo affiche ses coûts justifiés et sa marge contributive. Les recettes du tableau commercial incluent abonnements et recharges, remboursements déduits.

La recette d’une vidéo est **affectée** au prorata des crédits consommés sur chaque paiement, sur le nombre original de crédits achetés. Ce n’est pas une vente Stripe distincte par vidéo. Les arrondis sont conservés en micro-euros pour ne jamais attribuer plus que le paiement, même si un quota est augmenté administrativement. Les remboursements réduisent la recette HT proportionnellement au montant TTC remboursé ; les avoirs fiscaux détaillés restent du ressort de la facturation.

Les frais de paiement sont lus dans les `BalanceTransaction` des charges et remboursements Stripe, dans la devise de règlement EUR. Un montant indisponible reste inconnu, jamais remplacé par un taux estimé ou par zéro. Les frais des litiges sont inclus uniquement lorsque leurs transactions de solde sont disponibles et vérifiées. Un litige encore ouvert garde le rapprochement incomplet ; une perte confirmée réduit les recettes. Les autres frais périodiques Stripe et frais généraux peuvent être ajoutés comme justificatifs.

Les fournisseurs (OpenAI, Google, Fish, Runway, Cloudflare et autres) sont rapprochés à partir d’un justificatif réellement payé, de sa référence et du montant réellement débité en EUR. Aucun taux USD/EUR supposé n’est utilisé. Les journaux existants d’estimations et de provisions sont conservés séparément. Les factures fournisseurs ne sont pas récupérées automatiquement : leurs APIs de facturation ne sont pas configurées dans ce projet.

Un justificatif de consommation ou un coût fixe peut être réparti entre plusieurs vidéos, à parts égales ou selon des unités de consommation renseignées. Un achat de crédits API prépayés conserve un stock non affecté ; seul le coût des unités affectées devient un coût de vidéo. Exemple : 1 000 unités achetées, 25 affectées à un clip ; seule la quote-part de 25 unités est retenue. Les affectations ultérieures vérifient le stock et l’ordre d’écriture atomiquement, afin d’éviter les doubles affectations concurrentes.

Une dépense peut être déclarée comme couvrant entièrement un fournisseur pour une vidéo. Même un coût nul nécessite un justificatif (gratuité constatée). Les appels réels de narration et d’animation déterminent les fournisseurs attendus ; Cloudflare est attendu pour chaque vidéo. **La marge demeure inconnue tant qu’un fournisseur ou des frais Stripe manquent.** Un solde partiel ne constitue pas une marge nette comptable.

Les justificatifs et affectations sont immuables. Une correction passe par une annulation motivée puis une nouvelle entrée. Le journal conserve l’acteur et la date. Lecture et modification sont limitées au compte Super admin confirmé ; Same-Origin obligatoire, JSON borné, requêtes et synchronisations limitées. Aucun secret, numéro de carte ou objet brut de paiement n’est enregistré dans les réponses ou les traces.

## Exploitation

Sauvegarder D1 avant migration, couper brièvement les admissions, attendre zéro job actif, appliquer les deux migrations puis publier les Workers web et génération. Ajouter les trois identifiants de prix au Worker web. Le service de génération doit utiliser le nouveau portefeuille lors de l’admission ; une publication du web seul ne suffit pas. Conserver les variables existantes et l’image du renderer (`--keep-vars`, `--containers-rollout none`). Rétablir les admissions et vérifier les soldes, le budget et les données historiques. Les changements ne nécessitent aucune nouvelle image du renderer et ne modifient pas le montage vidéo.

Un bouton « Rapprocher Stripe » relit au plus 20 paiements de l’environnement courant, en privilégiant les frais encore manquants. Les notifications restent la source principale ; la relecture manuelle ne crée ni paiement ni remboursement. Après passage au réel, mettre à jour ensemble les clés, prix, politiques et événements du webhook ; les crédits et recettes du sandbox restent séparés.

Voir les preuves et limites dans [la recette](preuves/maintenance/RECHARGES-03-10.md).
