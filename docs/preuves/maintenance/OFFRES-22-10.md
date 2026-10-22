# Offres et crédits — 22 octobre 2026

Publication demandée par Alex, avec conservation explicite de Solo. Les montants sont HT.

| Offre | Mensuel | Crédits mensuels | Annuel, payé en une fois | Premier mois avec code bonus |
| --- | ---: | ---: | ---: | ---: |
| Solo | 50 € | 50 | 540 € | 60 crédits |
| Agence | 100 € | 120 | 1 080 € | 144 crédits |
| Équipe | 200 € | 250 | 2 160 € | 300 crédits |
| Réseau | 500 € | 650 | 5 400 € | 780 crédits |

L’annuel conserve sa réduction de 10 % et ses douze attributions mensuelles. Le bonus de 20 % reste limité à la première mensualité payée, y compris pour l’annuel, sans report. Le programme partenaires conserve 15 % des paiements HT encaissés pendant douze mois à partir du premier paiement. Aucun changement des recharges ou du barème de consommation vidéo/animations/avatar.

Le catalogue partagé alimente les cartes, le comparatif, les équivalences vidéo, les montants Checkout et les quotas attribués après facture vérifiée. L’estimateur affiche désormais une fourchette selon l’offre ; l’ancienne équivalence fixe d’un crédit à un euro ne convenait plus. Conditions, guide budget, page explicative, métadonnées et `llms.txt` sont actualisés.

## Migration et données

Migration **0084_subscription_credit_offers.sql** appliquée à la D1 **bienvu-s00-staging**, utilisée par le domaine. Elle accepte les nouveaux bonus 24/50/130 et conserve les montants des réservations historiques. Les anciennes valeurs restent acceptées pendant la bascule du serveur. Index d’unicité et protections d’immutabilité conservés.

Sauvegarde SQL privée avant intervention ; répétition sur sa copie : **164 tables et 9 418 lignes conservées**, vue financière lisible et aucune erreur de clé étrangère. Test D1 supplémentaire avec un bonus déjà attribué et une réservation historique à 20 crédits : lignes, références et protections conservées. Après migration distante, les journaux financiers conservent leurs effectifs et `PRAGMA foreign_key_check` est vide. Aucun abonnement n’était enregistré au contrôle préalable.

## Correctifs nécessaires à la publication

L’audit GitHub a signalé des vulnérabilités dans Next.js et DOMPurify. Versions publiées : **Next.js 16.4.1**, **DOMPurify 3.4.17**, **OpenNext Cloudflare 1.20.13**, **Wrangler 4.148.0**. L’adaptateur est mis à jour pour reconnaître le nouveau manifeste `preview-props.json` de Next.js 16.4 ; l’ancienne version compilait mais retournait 500 dans le Worker local. Le minificateur OpenNext reçoit **glob 10.5.0** via une substitution limitée à sa version vulnérable. Audit final : **aucune vulnérabilité connue**, sans exclusion d’avis.

Les sondes de pages acceptent aussi l’attribut de release placé avant `lang="fr"`. Les sondes d’offres et de promos sont actualisées avec le catalogue, la cadence Checkout et les médias de démonstration versionnés.

Références : [correctif Next.js](https://github.com/advisories/GHSA-673q-mjm6-r5xr), [correctif DOMPurify](https://github.com/advisories/GHSA-cg2g-xh64-v4q7), [manifeste Next.js et OpenNext](https://github.com/opennextjs/opennextjs-cloudflare/issues/1355).

## Validation et publication

- **905 tests métier validés** : 892 au premier passage, puis les 13 échecs de connexion locale `EADDRNOTAVAIL` relancés avec succès. **66 tests ciblés supplémentaires** après la mise à jour Next.js : comptes, facturation, report, analytique et suivi des erreurs.
- Types de tous les workspaces et des tests, frontières, build Next/OpenNext et préparation du bundle final réussis. Sourcemaps envoyées à PostHog ; identifiant du chunk serveur recoupé avec le binding publié.
- Worker complet local : protections et parcours publics vérifiés ; **51 pages SEO** contrôlées après mise à jour de l’adaptateur.
- Recette des composants dans Chrome : offres à **1536/900/390/320 px**, promos et administration à **1536/390/320 px**. Paiements simulés ; quotas, bonus, cadence, reprise et absence de débordement vérifiés.
- Après activation : **11 contrôles HTTP**, dont les huit offres mensuelles/annuelles en JSON-LD, les pages éditoriales, le programme partenaires, les API privées refusées sans session et une navigation RSC depuis l’ancienne release. Chrome sur le domaine à **1536/390 px**, mensuel et annuel : prix et crédits exacts, aucune exception JavaScript ni débordement ; captures inspectées.

Release **95706519f0bf**, commit produit **95706519f0bfa9bc96d3d560309fb938113d2ae0**, poussé sur `main`. Worker **bienvu-web-probe-staging**, version **0d263f6d-8046-4e92-9f3b-c32ad5a9c49d**, activée à **100 %**. Déploiement **c3203de6-2284-4d7f-a4e6-de15b2348cfd**, inscrit dans le suivi du superadmin.

Les **64 bindings**, domaines, crons et paramètres de runtime sont conservés, hors identifiants de release et sourcemap. Génération et conteneurs inchangés. **Stripe reste en mode test** ; les contrôles n’effectuent aucun achat réel ni appel de génération payant.

[CI sécurité](https://github.com/alexlevy0/BienVu/actions/runs/39855681409) réussie, audit et contrôles des conteneurs inclus. [CI fonctionnelle complète](https://github.com/alexlevy0/BienVu/actions/runs/39855681438) encore en cours au moment de ce relevé. Preuves brutes, captures, sauvegarde et configurations privées sous `evidence/local/pricing-20261022/`, ignorées par Git.
