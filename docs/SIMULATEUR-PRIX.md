# Simulateur de prix BienVu

L’outil se trouve dans **Super admin → Simulateur de prix**, avec accès direct par `/admin?view=pricing`. Il compare des hypothèses commerciales ; il ne modifie ni les offres publiques, ni Stripe, ni les crédits ou les budgets de génération.

## Prendre une décision

1. Dans **Données observées**, choisir la période et le mode financier. Les appels fournisseurs réels peuvent appartenir à une vidéo financée par un paiement de test : ces deux notions restent distinctes.
2. Examiner le nombre de vidéos et d’appels mesurés. Copier volontairement le temps de rendu, la taille du MP4, le taux de réutilisation, les crédits recharge disponibles ou un coût moyen de rédaction/voix. Les factures se rapprochent dans l’onglet **Rentabilité**.
3. Dans **Coûts de production**, vérifier les tarifs fournisseurs, le taux de change supporté et les ressources Cloudflare allouées. Remplacer les coûts et volumes d’exemple par des mesures représentatives.
4. Dans **Profils d’usage**, définir une répartition totalisant 100 % des vidéos : montage classique, deux photos animées, animation intensive, avec ou sans voix/carte. Les parts portent sur les vidéos, pas sur les crédits.
5. Dans **Packs & abonnements**, comparer les prix, les crédits, les bonus et le volume de ventes. Le prix cible correspond à la marge demandée après production intégrale, paiement et charges partagées. « Simuler ce prix » ne change que le scénario ouvert.
6. Dans **Volume & frais**, ajuster consommation, croissance, essais offerts, rétention, crédits déjà vendus, stockage existant, frais de paiement, TVA, acquisition, remboursements, litiges et support.
7. Dans **Prévisions & sensibilité**, regarder le résultat mensuel, le cumul après provision des crédits encore disponibles, le stockage, les paliers voix et la capacité de rendu. Comparer notamment consommation intégrale, toutes les photos animées, change/fournisseurs défavorables et promotion.
8. Nommer, sauvegarder ou dupliquer un scénario. Le JSON permet de le reprendre ; le CSV contient les offres, prévisions, comparaisons et hypothèses pour une discussion commerciale.

Les simulations sont sauvegardées avec un numéro de version. Une mise à jour concurrente produit un conflit explicite, sans écrasement. Une copie reste possible pour conserver une autre hypothèse. Un brouillon valide est conservé sept jours dans le navigateur, sous une clé propre au compte superadmin. Les données brutes observées et les secrets ne sont pas stockés dans ce brouillon.

## Catalogue et hypothèses initiales

Le catalogue est lu depuis les contrats produits : recharges **10/7 € HT**, **30/19 € HT**, **100/59 € HT**, Plus **40/19 € HT mensuels**, Pro **120/49 € HT mensuels**. Les prix libres de la simulation ne remplacent pas ces tarifs.

Le mix initial est un **exemple** : 60 % de montages classiques, 30 % de vidéos avec deux photos animées, 10 % avec six photos animées. Les durées de rendu, tailles de médias, rédaction, imports, support et volumes sont des hypothèses modifiables. Les quantités initiales ne sont pas des ventes constatées.

Tarifs unitaires revérifiés le 7 octobre 2026 :

| Poste | Paramétrage initial | Source |
|---|---|---|
| Runway Gen-4 Turbo | 5 crédits API/s ; 5 s/clip ; 0,01 USD/crédit API | [Runway](https://docs.dev.runwayml.com/guides/pricing/) |
| Cartesia | Free 0 USD, ~27 min ; Pro 5 USD, ~133 min ; Startup 49 USD, ~1 667 min ; Scale 299 USD, ~10 667 min/mois | [Cartesia](https://www.cartesia.ai/pricing) |
| Containers | 0,000020 USD/s CPU ; 0,0000025 USD/GiB-s RAM ; 0,00000007 USD/Go-s disque | [Containers](https://developers.cloudflare.com/containers/platform/pricing/) |
| Rendu standard-2 | 1 vCPU, 6 GiB RAM, 12 Go disque ; 30 s d’inactivité après rendu | [Types d’instances](https://developers.cloudflare.com/containers/platform/instance-types/) |
| Quotas Containers | 22 500 s CPU, 90 000 GiB-s RAM, 720 000 Go-s disque/mois | [Containers](https://developers.cloudflare.com/containers/platform/pricing/) |
| R2 Standard | 10 Go inclus ; 0,015 USD/Go-mois ; classe A 1 M incluse puis 4,50 USD/M ; classe B 10 M incluses puis 0,36 USD/M | [R2](https://developers.cloudflare.com/r2/pricing/) |
| Workers Paid | 5 USD/mois ; 10 M requêtes et 30 M ms CPU incluses ; dépassements 0,30 USD/M requêtes et 0,02 USD/M ms CPU | [Workers](https://developers.cloudflare.com/workers/platform/pricing/) |
| Paiement | Carte standard EEE : 1,5 % + 0,25 EUR ; Billing : 0,7 % supplémentaire pour les abonnements | [Stripe France](https://stripe.com/fr/pricing) |

Les minutes Cartesia sont approximatives : la facturation dépend notamment des crédits/caractères. Le choix automatique simule un palier disposant d’une licence commerciale. Le Free reste sélectionnable, avec ses limites de capacité et de licence visibles ; le coût prudent utilise une référence commerciale plutôt qu’un coût nul. Un contrat personnalisé permet de remplacer ces allocations. Cette sélection ne souscrit aucun forfait et ne change pas le fournisseur ou la voix du produit.

**1 USD = 1 EUR est une hypothèse**, pas un taux de marché. Le taux reste editable, frais de conversion compris. Les frais de litige initiaux sont une hypothèse manuelle à vérifier avec le compte Stripe ; les tarifs du tableau ne couvrent pas tous les pays/types de cartes ou contrats négociés.

## Méthode de calcul

### Production à consommation intégrale

- Crédits BienVu moyens par vidéo : **1 + nombre moyen de nouvelles animations**. Une réutilisation diminue à la fois les appels IA et les crédits produit, conformément aux règles existantes de génération.
- Animation : nouvelles animations × secondes/clip × crédits API/s × USD/crédit × change × coefficient de tentatives supplémentaires facturées.
- Rendu : CPU configuré pendant le temps actif ; RAM et disque alloués pendant le temps actif et l’inactivité. Les réexports/reprises et le supplément carte sont comptés. Les imports utilisent une référence basic (0,25 vCPU, 1 GiB RAM, 4 Go disque), avec temps CPU et durée de vie séparés.
- Voix : allocation du forfait par minute de référence, ou coût manuel par vidéo. Les régénérations supplémentaires sont provisionnées.
- Médias : MP4 final + photos + clips sélectionnés + audio. La réutilisation ne fait pas disparaître les médias employés. Cette approximation par génération est prudente : elle peut compter plusieurs fois des fichiers physiquement mutualisés.
- S’ajoutent rédaction, imports par navigateur, opérations R2/Workers, support et autres coûts variables.
- La conservation finie est provisionnée sur toute la durée choisie, même au-delà de la prévision. La conservation permanente est provisionnée sur l’horizon choisi, avec une indication que les coûts continuent ensuite.

Le coût prudent n’utilise pas les quotas gratuits. Il sert à vérifier un tarif lorsqu’ils sont épuisés. Les frais communs (hébergement, frais fixes, acquisition, essais offerts, part inutilisée du forfait voix, crédits déjà vendus et certains arrondis) sont répartis au prorata des crédits vendus par le mix commercial saisi. Un changement de volumes peut donc modifier le prix cible.

### Paiements, prix cible et marge

Pour une offre : `P` est son prix HT, `t` la TVA, `f` le taux de frais de paiement (Billing ajouté pour un abonnement), `l` la fraction des achats remboursés/perdus, `m` l’objectif de marge.

`Marge EUR = P × (1 − l) − production intégrale − charges partagées − frais fixes par transaction − P × (1 + t) × f − autres coûts par achat − frais de litige attendus`

`Marge % = Marge EUR / [P × (1 − l)]`

`Prix cible HT = [production + charges partagées + frais fixes par transaction + autres coûts par achat + frais de litige attendus] / [(1 − l) × (1 − m) − (1 + t) × f]`

Les taux sont des fractions dans ces formules. Le prix cible est arrondi au centime supérieur. Si le dénominateur n’est pas positif ou si aucun crédit n’est vendu, aucun faux prix cible n’est fourni. La remise maximale respecte ce prix cible. La marge est rapportée aux recettes HT conservées, et n’est pas un taux de majoration du coût.

La TVA collectée est présentée séparément. Les frais de paiement sont engagés sur le TTC d’origine, même en cas de remboursement. Le coût de production n’est pas annulé par un remboursement. Les montants sont des euros décimaux de prévision ; ils n’ajoutent aucune écriture au grand livre financier en micro-euros.

### Prévision mensuelle

Les volumes évoluent selon la croissance choisie. Une recharge ajoute ses crédits au stock reporté ; le taux de consommation s’applique à ce stock disponible. Une allocation d’abonnement non consommée ne se reporte pas. Les crédits vendus avant la simulation génèrent un coût lors de leur consommation, sans nouvelle recette.

La prévision soustrait les quotas mensuels disponibles **une seule fois** du total calculé. Le pourcentage disponible modélise la part déjà utilisée par d’autres activités du même compte Cloudflare. R2 arrondit séparément stockage payant au Go supérieur et opérations payantes à chaque million supérieur. Les quotas Workers sont également appliqués au total mensuel.

Le stockage s’accumule par cohortes et tient compte de la rétention. Le stock existant reste conservé sur l’horizon ; les essais gratuits sont proratisés selon leur durée de conservation. Pour rester prudent, les nouveaux médias sont comptés dès le début du mois. Les essais sont modélisés comme des vidéos classiques de 20 s, six photos et voix off.

Le coût futur des recharges disponibles est estimé avec le coût prudent par crédit. Le **cumul après provision indicative** déduit ce coût du résultat cumulé. Il aide à voir les engagements restants et ne constitue pas un résultat comptable ou une reconnaissance du revenu de crédits prépayés.

Le point mort est une approximation au mix de ventes saisi, calculée hors quotas gratuits. Il ne résout pas exactement tous les paliers de forfait, pics de trafic ou évolutions du mix. La capacité de rendu utilise le temps d’occupation des instances sur 30 jours ; la compatibilité mensuelle ne garantit pas un délai aux heures de pointe.

## Observations et limites

- Moyennes de rendu/MP4 : rapports enregistrés de vidéos terminées, valeurs numériques valides seulement. Le temps de rendu est une durée de travail mesurée, pas une mesure exacte de CPU facturé par Cloudflare ; l’utiliser comme temps actif est une approximation prudente.
- Estimations fournisseurs : uniquement appels `real`, avec métriques de coût USD valides. Moyenne par vidéo seulement si toutes les requêtes de ce fournisseur sont mesurées et la vidéo est terminée. Les appels échoués mesurés contribuent au total, mais pas à la moyenne de vidéos terminées.
- Coûts rapprochés : écritures fournisseurs affectées à des vidéos terminées et marquées comme couvrant le fournisseur. Une provision de budget ou un achat prépayé non affecté n’est pas un coût réel par vidéo.
- Une absence reste inconnue ; zéro explicitement mesuré reste zéro. Les payloads, prompts, clés et chemins privés ne sont pas exposés.
- Les fournisseurs de voix peuvent concerner des durées/régénérations différentes. Copier une moyenne ne dispense pas d’ajuster le profil ou le coefficient de reprises.
- Recettes et frais de paiement connus proviennent des reçus financiers, avec nombre de frais restant à rapprocher. Test/live sont filtrables. Les dépenses et contrats hors échantillon ne sont pas déduits automatiquement.
- D1, Durable Objects, logs, trafic de médias anciens, licences, salaires et autres services peuvent être provisionnés dans les coûts complémentaires. Les charges fiscales, TVA déductible, amortissement et décalages de trésorerie ne sont pas modélisés comme une comptabilité complète.

## Architecture et vérifications

Contrats versionnés dans `packages/contracts/src/pricing-simulation.ts`. Moteur pur partagé navigateur/API/export dans `apps/web/lib/pricing-calculator.ts`. API `/api/admin/pricing` protégée par session superadmin vérifiée, réponses `private, no-store`, contrôle d’origine en écriture et JSON strict borné.

Migration **0052** : scénarios, versions, suppression réversible, journal immuable, maximum 100 scénarios actifs et 10 mutations/minute/acteur, plus index pour les observations. Les modifications et leur audit sont atomiques ; aucune table de paiement, droit client ou budget n’est modifiée par une simulation.

Vérifications reproductibles :

```sh
pnpm exec tsx --test --test-concurrency=2 tests/pricing-calculator.test.ts tests/pricing-simulator.test.ts
pnpm probe:pricing:ui
pnpm check
pnpm build:web
```

Les 24 tests ciblés vérifient des montants connus, crédits reportés, prix cible arrondi, frais TTC/Billing, remboursements, réutilisation, paliers voix, quotas et arrondis R2, durée de stockage, états inconnus, authentification, tailles de requête, sauvegardes concurrentes et audit. La sonde UI utilise le composant réel avec des réponses HTTP locales de recette, en 1536/390 px : six onglets, champs invalides, sauvegarde pendant saisie, conflit/récupération, exports/import et restauration du brouillon. Elle n’authentifie pas un compte sur le site publié et ne déclenche aucun fournisseur payant.
