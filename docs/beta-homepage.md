# Homepage bêta

La nouvelle expérience est disponible sur `https://bienvu.online/beta`. Le domaine
`https://beta.bienvu.online` redirige temporairement vers cette page : la connexion,
les cookies d’essai, les crédits et Stripe restent sur leur origine existante.
La homepage `/` continue d’utiliser `LandingPage`.

## Fonctionnement

- `app/beta/page.tsx` lit uniquement les médias **publiés** de la homepage.
- `BetaLandingPage` réutilise le formulaire de création, le comparatif des trois
  rendus, les avatars, l’éditeur et Ma Vitrine. Les styles sont limités à la bêta.
- `HomeCreate` conserve son comportement par défaut ; le variant `beta` adapte
  les libellés, les réglages et l’affichage détaillé des crédits.
- `BetaExample` utilise les copies marketing publiques déjà préparées. Changer
  d’option et lire l’exemple ne déclenche aucun import, aucune réservation de
  crédits ni aucune génération chez les fournisseurs.
- Les voix utilisent les extraits Cartesia existants, sans synthèse à la volée.
- Les avis clients et résultats commerciaux ne sont pas inventés. La vitrine
  d’exemple conserve sa mention d’agence fictive.
- La page porte `noindex`, est exclue du sitemap et figure dans les exclusions
  de `robots.txt`.

## Deuxième itération

- La promesse explicite remplace le titre abstrait ; les textes d’aide et les
  réglages sont plus grands. Le hero distingue l’essai classique des options IA.
- La démo ouvre directement le lecteur et ses trois choix. « Essayer avec mon
  annonce » conserve le rendu via la préférence existante, y compris après connexion.
- Les extraits de voix ont un bouton « Utiliser cette voix ». Seules les voix
  Cartesia du catalogue sont acceptées ; les autres options restent intactes.
- Pour un compte connecté, l’estimation existante affiche la photo, le titre,
  la ville, le nombre total de photos et le coût, avec accès à leur sélection.
  La carte réutilise la préparation et les photos privées autorisées de l’import.
- Le comparatif garde le ratio 9:16. Son sélecteur mobile pilote le carrousel.
- Les destinations utilisent les médias publics déjà publiés, chargés à la demande.
- Le lien FAQ cible `#beta-faq-title`. Le suivi PostHog autorise `/beta` avec le
  consentement existant. Événements : `beta_demo_opened`, `beta_render_selected`,
  `beta_demo_applied`, `beta_voice_applied`. Les propriétés ne contiennent ni texte
  d’annonce, ni URL d’import, ni identifiant de voix.

## Publication Cloudflare

La cible reste `bienvu-web-probe-staging`, dans le compte Cloudflare existant.
Dans la configuration de déploiement, conserver les deux Custom Domains :

```json
"routes": [
  {"pattern": "bienvu.online", "custom_domain": true},
  {"pattern": "beta.bienvu.online", "custom_domain": true}
]
```

Le domaine bêta ne nécessite ni nouvelles clés ni nouvelles bases de données.
`betaHomepageRedirect` n’accepte que GET et HEAD, ne redirige jamais vers un hôte
fourni par le visiteur et ne modifie pas les requêtes du domaine principal.
Conserver ces routes lors des publications suivantes.

## Vérification

Effectuer le typecheck web, les tests existants, `check:boundaries` et le build
OpenNext. Vérifier ensuite sur ordinateur et mobile : le formulaire, les réglages,
la lecture directe de l’exemple, les tarifs 1/3/7, les onglets et la FAQ. Les vérifications
visuelles ne doivent pas lancer de génération payante. Confirmer après publication
que `/` garde son titre et son parcours, et que le domaine bêta ouvre `/beta`.
