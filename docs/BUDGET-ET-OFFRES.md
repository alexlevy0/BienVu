# BienVu — budget des tests et hypothèses commerciales

**Contrainte confirmée : maximum 30 € par mois avant les premiers clients, hébergement et API compris.** Les montants en euros ci-dessous sont des enveloppes de travail, pas des devis. Les tarifs fournisseurs sont en dollars ; prévoir conversion et taxes effectives.

## Enveloppe initiale proposée

| Poste | Enveloppe de travail mensuelle |
|---|---:|
| Workers Paid, conversion et taxes estimées | 8 € |
| Consommation Cloudflare supplémentaire : navigateur, conteneurs, D1/R2, Workflows, logs | 7 € |
| API texte et voix pour les tests | 5 € |
| Marge pour écarts, opérations non anticipées ou prépaiement minimal | 10 € |
| Total maximal visé | **30 €** |

Commencer sur les domaines de développement fournis. Aucun achat de domaine, abonnement de scraping, proxy payant, abonnement musical ou deuxième plateforme d'hébergement n'est prévu dans cette enveloppe. Si un domaine est acheté, compter son paiement réel dans le budget du mois et réduire les tests en conséquence. Un abonnement ChatGPT ne remplace pas les crédits API ; comptabiliser les crédits prépayés effectivement achetés ainsi que la consommation, sans les compter deux fois.

## Tarifs officiels consultés le 27 septembre 2026

| Service | Repère tarifaire | Source |
|---|---|---|
| Workers Paid | Minimum de 5 USD/mois au niveau du compte, puis dépassements éventuels | S08 |
| Browser Run gratuit | 10 minutes de navigateur/jour, 3 navigateurs simultanés | S04 |
| Browser Run avec Workers Paid | 10 heures/mois incluses, puis 0,09 USD/heure ; facturation de concurrence au-delà de l'allocation prévue | S04 |
| Containers | Réservé à Workers Paid ; allocations de calcul incluses et dépassements CPU, RAM, disque, réseau | S07 |
| Remotion | Gratuit si éligible, notamment personne seule ou équipe jusqu'à 3 selon les conditions ; sinon chiffrer la licence avant de conclure sur le budget | S17 |
| OpenAI TTS | Le modèle candidat `gpt-4o-mini-tts` est facturé en tokens texte/audio ; ne pas le traiter comme un tarif fixe par vidéo | S13–S15 |

Le plan gratuit Browser Run aide à tester le scraping. Le rendu sur Cloudflare Containers nécessite le plan Workers Paid : le produit complet n'est donc pas un hébergement intégralement gratuit.

**Ajout confirmé le 28/09/2026 : e-mail/mot de passe en plus de Google.** [Cloudflare Email Service](https://developers.cloudflare.com/email-service/platform/pricing/) exige Workers Paid pour envoyer aux adresses des utilisateurs : 3 000 e-mails/mois inclus par compte, puis 0,35 USD/1 000 (tarif consulté le 28/09/2026). La préparation utilise cet hébergement déjà prévu, avec un plafond applicatif de 50 messages/jour et 3 par adresse/10 minutes. Les essais locaux coûtent 0 € et n’envoient rien. L’expéditeur exige un domaine vérifié : domaine existant à confirmer ou achat à compter dans les 30 €, sans achat autorisé par cette tranche. Le coût CPU du hachage des mots de passe reste à mesurer sur le Worker distant. Les limites applicatives ne couvrent pas d’autres applications utilisant les allocations du compte Cloudflare.

### Calcul du rendu, à remplacer par des mesures

Après allocations incluses, les tarifs consultés pour Containers sont : 0,000020 USD par vCPU-seconde utilisée, 0,0000025 USD par GiB-seconde de RAM provisionnée, 0,00000007 USD par GB-seconde de disque provisionné. Les allocations sont notamment 375 vCPU-minutes, 25 GiB-heures et 200 GB-heures par mois. RAM et disque sont facturés selon le type d'instance et son temps actif, pas seulement selon les octets occupés [S07].

Formule indicative du coût brut d'une session de conteneur, avant allocations et autres frais :

```text
cpu_seconds × cpu_rate
+ uptime_seconds × provisioned_memory_GiB × memory_rate
+ uptime_seconds × provisioned_disk_GB × disk_rate
```

Ajouter le démarrage, le téléchargement des médias, le traitement audio, le rendu, l'upload et le temps avant mise en sommeil. Les allocations étant partagées au compte, ne pas les soustraire une fois par service ou une fois par vidéo. Workers, Durable Objects, stockage, transferts et journaux peuvent s'ajouter.

## Mesures exigées

Chaque tentative enregistre temps de navigateur, tentatives, tokens texte, appels TTS, durée audio, durée active du conteneur, type d'instance, volume de stockage, erreurs et coût estimé. Réconcilier régulièrement avec les tableaux de facturation.

```text
coût effectif par vidéo utilisable =
  toutes les dépenses variables des tentatives de l'échantillon
  / nombre de vidéos utilisables produites
```

Le rapport sépare coût marginal estimé, coût après allocations disponibles et facture totale. Une vidéo ratée coûte potentiellement de l'argent sans consommer le quota du client.

## Limites applicatives proposées avant les premiers clients

- 30 générations réelles maximum par mois de test et 5 par jour, hors fixtures locales ; commencer par 3 à 5 rendus au sprint 00.
- Un seul rendu simultané ; fermer les sessions navigateur ; arrêter les conteneurs inutilisés rapidement après vérification de l'absence de rendu actif.
- Réserver une estimation conservatrice avant chaque job. Valeur initiale proposée : 0,50 € par tentative complète, à remplacer par les mesures ; inclure les jobs déjà en cours dans le budget engagé.
- Alerte à 20 € d'engagement estimé mensuel ; pause des nouvelles générations payantes en coûts à 25 € pour garder 5 € de marge. L'interface et les téléchargements existants restent disponibles.
- Postes distincts pour frais fixes, dépenses réellement facturées, prépaiements et réservations ; aucun calcul de solde uniquement en mémoire.
- Limiter taille des médias, tokens d'entrée/sortie, durée des jobs et nombre de retries. Les mocks sont le mode par défaut de la CI.
- Ajouter une commande ou un contrôle opérateur permettant de couper immédiatement nouvelles sessions navigateur, voix et rendus.

**Ces contrôles ne constituent pas une garantie de plafond de facture fournisseur.** Une consommation déjà engagée, des données de facturation retardées ou du trafic extérieur peuvent dépasser les estimations. Le plafond de 30 € impose aussi le suivi des comptes, les limites réellement disponibles chez les fournisseurs et l'arrêt des tests à temps. Ne pas confondre alerte budgétaire et coupure automatique.

## Offres proposées, non validées par Alex

| Code | Nom provisoire | Prix mensuel proposé HT | Vidéos par période |
|---|---|---:|---:|
| `decouverte` | Découverte | 29 € | 10 |
| `agence` | Agence | 59 € | 30 |
| `volume` | Volume | 99 € | 60 |

Chaque palier conserve la même qualité vidéo et l'identité d'agence. Un seul essai à vie après inscription, avec filigrane, hors abonnement. Pas d'offre annuelle, de dépassement automatique, de report de crédits ou de packs supplémentaires dans cette version.

Cette grille sert aux fixtures Stripe et à l'implémentation configurable. Ne pas activer ces prix en production comme s'ils avaient déjà été acceptés. Au moment de préparer la vente, présenter la grille, les mesures de coût, les prix TTC applicables et les textes contractuels comme éléments concrets à finaliser.

Pour vérifier la viabilité, chiffrer au quota entièrement utilisé : revenu net après taxes et paiement, moins frais fixes alloués, générations réussies et ratées, essais gratuits, stockage et support. Ne pas déduire une marge garantie à partir du seul prix du TTS.
