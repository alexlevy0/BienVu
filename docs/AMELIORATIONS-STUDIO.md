# Éditeur, bibliothèque d’agence et abonnements

## Montage et aperçu

L’Éditeur propose un cadrage par photo, des mouvements prédéfinis ou un départ et une arrivée personnalisés. La courbe de caméra est partagée avec le renderer. Le mixage comprend une normalisation mesurée sur les WAV, des fondus et une baisse de la musique pendant la parole. L’aperçu utilise un gain Web Audio, y compris pour une amplification supérieure à 1. Les pistes d’origine restent copiées et vérifiées sans modifier leurs octets.

Le contrôle avant export signale les photos manquantes ou petites, les textes risquant de sortir du cadre et certains déséquilibres audio. Les dimensions du texte sont estimées : ce contrôle ne remplace pas une vérification visuelle et une écoute.

« Aperçu complet » prépare le MP4 final après confirmation des crédits et des droits. Cette préparation suit le même pipeline que l’export. Une même version sauvegardée retrouve son job existant ; lire ou télécharger cette version n’engage aucun deuxième crédit. Une modification crée une nouvelle version et un nouvel export. Un job échoué peut être relancé explicitement avec une nouvelle intention serveur.

## Animations et imports

La bibliothèque privée conserve les animations réussies 90 jours, par agence, empreinte de photo, format, modèle et mode. Une animation conservée est réutilisée sans nouvel appel Runway ni supplément de crédit. La vidéo originale et chaque nouvel export possèdent leur propre copie privée vérifiée.

Pour les nouvelles générations, le coût réservé est **1 crédit vidéo + 1 par nouvelle animation demandée**. Les animations réussies sont débitées et conservées même si le montage échoue ; le crédit vidéo et les suppléments des animations échouées sont libérés. Les anciens jobs gardent leur tarification historique. Le budget fournisseur reste indépendant du solde de crédits produit.

La purge verrouille les entrées expirées avant de supprimer leurs copies de bibliothèque. Les animations admises par un job actif sont protégées jusqu’à sa fin ; les copies déjà présentes dans les exports ne sont pas supprimées par cette purge.

Chaque téléchargement de photo dispose d’un délai propre de huit secondes, dans l’enveloppe globale d’import. Une photo inaccessible n’empêche pas de conserver les informations et les autres photos. Un import incomplet affiche un avertissement. Les refus de sécurité restent fermés ; aucun nouveau contournement des protections des portails n’est ajouté.

## Usage d’agence

`/projets` regroupe dossiers, modèles et validations client. Un dossier contient brouillons et exports ; un nouvel export d’un brouillon classé rejoint le même dossier. L’archivage ferme le classement de nouveaux éléments dans ce dossier sans effacer les créations.

Un modèle conserve la mise en page, les cadrages et le mixage. Les champs du bien et la marque sont remplacés par ceux du projet courant ; photos, musique, narration, source vocale et sélection Runway ne sont pas copiées. Les textes ajoutés librement restent dans le modèle et doivent être relus. Le modèle par défaut s’applique à l’ouverture d’un projet sans document d’édition dans l’Éditeur.

La validation client est un lien opaque privé, valable au maximum sept jours et jamais au-delà de la vidéo. Il autorise lecture, commentaires horodatés et validation d’un manifeste figé. Une validation ne s’étend pas aux exports suivants. Le lien est révocable et ne publie rien dans Explorer. Les destinataires sont contactés par l’utilisateur : aucun message n’est envoyé automatiquement.

`/equipe` permet d’inviter jusqu’à 20 membres par agence. L’invitation est liée à une adresse confirmée et valable sept jours. Lecteur : consultation ; éditeur : création et export ; administrateur : charte, paiement et gestion des éditeurs/lecteurs ; propriétaire : nomination des administrateurs. Le choix d’agence utilise un cookie sécurisé et l’appartenance à l’agence est vérifiée à chaque requête. Une révocation retire l’accès dès la prochaine requête. Le quota et les crédits sont ceux de l’agence active.

## Stripe en mode test

Les secrets sont dans `.env.billing`, ignoré par Git et de permissions 0600. `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` sont uniquement côté serveur. Les autres champs configurés sont `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`, `STRIPE_PORTAL_CONFIGURATION` et `BILLING_MODE=test`.

Le compte vérifié est le sandbox BienVu `acct_1UMFD2ElEcMhrWtb`. Les tarifs sont Plus **19 € HT / 40 crédits par mois** et Pro **49 € HT / 120 crédits par mois**. Checkout utilise le prix serveur, une intention persistante et une clé stable. Il demande une adresse de facturation et permet les identifiants fiscaux. Les moyens de paiement restent dynamiques. `managed_payments.enabled=false` est explicite pour ce Checkout classique, sans changer le réglage global du compte. `automatic_tax.enabled=false` : aucune inscription fiscale n’a été vérifiée.

Le webhook `/api/billing/webhook` lit le corps brut, contrôle la signature et le mode, récupère la facture et l’abonnement auprès de Stripe, puis écrit un journal idempotent en batch D1. Seule une facture effectivement payée, EUR, associée au client de l’agence et au tarif approuvé ouvre une période de crédits. Un retour Checkout ou un événement rejoué ne crédite rien de plus. Les périodes ne se cumulent pas et une annulation laisse les crédits de la période payée accessibles jusqu’à son échéance.

Le portail propose factures, moyen de paiement, coordonnées de facturation et résiliation à la fin de la période. Le changement direct de formule reste fermé ; contacter le support. Le mode test est affiché dans l’interface. L’encaissement réel nécessite un compte et un webhook de production, les informations légales et la configuration fiscale adaptées ; il n’est pas activé par cette livraison.

Les événements Stripe de recettes réelles et de test sont séparés. La synthèse Super admin présente les cohortes de nouveaux comptes et essais anonymes, les animations réutilisées, les recettes HT et les différentes catégories de coûts. Le solde EUR affiché est partiel, pas une marge nette : frais Stripe, remboursements, coûts non rapprochés et montants USD restent séparés. Aucun taux de change ou nombre de visiteurs uniques n’est inventé.

## Livraison et vérification

Migrations additives `0034` à `0038`. L’empreinte des tables historiques est comparée avant et après migration, sur les colonnes originales. Les documents et manifestes existants n’acquièrent pas de champs par défaut qui changeraient leurs empreintes.

`pnpm check` couvre les règles D1/R2, la réutilisation et la purge, les droits d’équipe, les modèles, les liens client, les signatures Stripe, les doublons et les renouvellements. Le rendu natif et le conteneur Linux sont vérifiés séparément. Les captures et preuves locales sont sous `evidence/local/roadmap/`, sans secrets à versionner. Le test réel Stripe utilise le compte de test avec une base D1 locale isolée ; les souscriptions et Checkout de recette sont ensuite fermés. Aucun appel payant OpenAI, TTS ou Runway n’est nécessaire à cette recette.

Publication et contrôle final du 03/10 : **282 tests réussis**, renderer v16, admission rouverte, données et provisions historiques conservées. [Versions, commandes, résultats et limites de la recette](preuves/maintenance/AMELIORATIONS-03-10.md).
