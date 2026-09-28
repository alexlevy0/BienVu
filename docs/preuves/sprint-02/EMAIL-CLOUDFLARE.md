# Recette réelle des e-mails — 28 septembre 2026

**Résultat : le parcours e-mail fonctionne dans Cloudflare Workers.** Alex confirme les deux réceptions en boîte principale, l'ouverture des liens, le changement de mot de passe et la connexion avec le mot de passe choisi. Cette validation ne couvre pas Google OAuth ni l'ensemble du sprint 02.

## Vérifications réellement effectuées

| Étape | Résultat |
|---|---|
| Domaine et expéditeur | `bienvu.online` actif ; `connexion@bienvu.online` configuré dans Email Sending |
| DNS | Trois MX, SPF, DKIM et DMARC conformes sur les deux serveurs Cloudflare faisant autorité |
| Inscription | HTTP 200, hash salé en D1, aucune session ni agence avant vérification |
| Connexion avant confirmation | HTTP 403, `EMAIL_NOT_VERIFIED` |
| Confirmation | Lien réellement reçu et ouvert par Alex ; adresse vérifiée, sans connexion automatique |
| Connexion de recette | HTTP 200, cookie `Secure; HttpOnly; SameSite=Lax`, agence accessible |
| Récupération | Second message reçu ; Alex choisit son mot de passe et se connecte avec succès |
| Révocation | Ancienne session HTTP 401, ancien mot de passe HTTP 400 ; agence conservée |
| Livraison fournisseur | Deux événements `delivered`, compteur d'envoi 0 → 2 ; réceptions Gmail confirmées séparément |

Preuves expurgées : parcours et retour humain (`docs/preuves/sprint-02/email-cloudflare.json`), livraison Cloudflare (`docs/preuves/sprint-02/email-cloudflare-delivery.json`), événements et mesures (`docs/preuves/sprint-02/email-cloudflare-events.json`), configuration et budget (`docs/preuves/sprint-02/email-domain-setup.json`).

Le premier contrôle DNS récursif renvoyait `ENOTFOUND`. L'import manuel proposé a ensuite signalé des TXT identiques et des MX gérés par Cloudflare ; le contrôle direct des deux serveurs a confirmé les six DNS attendus. Le fichier DNS public (`docs/preuves/sprint-02/bienvu.online-email-dns.txt`) reste un relevé historique, pas une opération à répéter. Les champs d'authentification SPF/DKIM/DMARC des événements d'envoi valent `none` ; ils ne constituent pas une inspection des en-têtes Gmail.

## Déploiement et contrôles locaux

Le Worker existant `bienvu-web-probe-staging` utilise D1/R2 de staging, un secret distinct, le bypass à `false` et un binding limité à la boîte autorisée. Version : `84a0f420-90bc-4c34-89fc-fc72b3ebc1bf`. Les huit migrations sont appliquées. Les triggers des migrations `0006`–`0008` ont été reformulés avec `SELECT RAISE … WHERE` après une erreur `incomplete input` au premier passage distant ; leurs règles de quotas/publication sont inchangées. Aucune base réinitialisée.

**Local :** 14 tests auth/configuration et 16 tests imports/saisie manuelle réussis ; types web et tests, frontières, build OpenNext et dry-run réussis. Ces tests utilisent des identités/images synthétiques et des e-mails capturés en mémoire ; ils sont distincts des deux messages réels ci-dessus. La suite complète de 96 tests avait passé avant cette tranche ; seuls les contrôles concernés ont été réexécutés ici.

**Mesures réelles :** 115 ms CPU pour l'inscription, 113 ms pour la connexion de recette et 124 ms pour le reset. Les temps muraux incluent les accès D1 et, dans Tail, les tâches d'arrière-plan. Ce petit échantillon n'est ni un test de charge ni une mesure statistique de délivrabilité.

La capture Tail temporaire est arrêtée. Mot de passe provisoire et cookie opérateur retirés du fichier privé. Le compte, l'agence et la session d'Alex sont conservés. Aucun mot de passe choisi par Alex n'a été communiqué à l'agent. Ni corps d'e-mail, ni lien, ni cookie, ni adresse personnelle dans les preuves versionnées.

## Coût et limites

Deux messages dans l'offre Paid existante : surcoût e-mail estimé **0 €**, sans facture consultée. Domaine payé par Alex : **4,99 USD** ; provision **6 €** jusqu'au débit en euros. Engagement prudent mensuel **16,50 €**, solde **13,50 €** sur 30 €. Aucun rendu, Browser Run ou appel IA/TTS ajouté.

Le staging conserve la restriction à un seul destinataire : il n'est pas ouvert aux inscriptions publiques. Imports/générations restent suspendus ; renderer et compteur des cinq tentatives inchangés. Google OAuth, liaison entre méthodes, logos distants et tests de charge restent à réaliser. Expiration et replay du reset sont prouvés localement uniquement.

[Procédure de reproduction](../../AUTHENTIFICATION.md#staging-après-reprise-autorisée-des-essais-distants) · [Site de test](https://bienvu-web-probe-staging.alexlevy0.workers.dev/connexion).
