# Voix Fish Audio

Ajout du 2 octobre 2026 : Manon, Lucas et Camille dans **Personnaliser → Voix et texte**, en plus des trois voix Google existantes. **Manon est la voix par défaut** pour les nouvelles vidéos, y compris les créations directes sans personnalisation et les essais anonymes. Le choix explicite d’une autre voix reste prioritaire et les brouillons déjà personnalisés conservent leur voix. Le choix est sauvegardé dans le brouillon puis figé dans la demande de génération. Désactiver la voix off empêche toute synthèse et désactive les sous-titres. Le défaut des sondes opérateur Google reste indépendant.

## Offre retenue

Modèle **`s2.1-pro-free`**, envoyé explicitement dans l’en-tête `model` de chaque appel à `https://api.fish.audio/v1/tts`. Le contrat refuse les autres modèles ; aucune relance ou bascule payante automatique. Le tarif publié au 02/10 est zéro USD par million d’octets UTF-8. L’offre relève du Fair Use, sans garantie de disponibilité ni de latence, et les requêtes peuvent être conservées pour améliorer les modèles.

Alex a déclaré le 02/10 avoir reçu l’autorisation d’utiliser l’offre gratuite pour BienVu. Cette confirmation autorise l’activation demandée ; BienVu n’a pas vérifié un contrat distinct. Les conditions publiques distinguent l’évaluation gratuite de la licence commerciale payante. Si cet accord ou l’offre change, désactiver `FISH_TTS_ENABLED` et réévaluer les conditions avant de changer le modèle.

- [Offre gratuite](https://fish.audio/fr/blog/s2-1-pro-free-api/)
- [Tarifs et limites](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits)
- [Contrat de synthèse](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech)
- [Conditions](https://fish.audio/terms/)

## Voix françaises

| Voix BienVu | Référence Fish | Origine observée le 02/10 |
| --- | --- | --- |
| Manon | `10a3a20742114a4ea6dd441e7591850f` | Fish Official, `voice_design`, français |
| Lucas | `f69bca092b674168a8d02d61ca20943c` | Fish Official, `voice_design`, français |
| Camille | `3b8f4121a0d04a85bd3627ed73864f1a` | Fish Official, `voice_design`, français |

Il s’agit de voix conçues par l’auteur officiel, pas de clones communautaires. Elles n’ont pas le drapeau `licensed` réservé aux voix humaines licenciées ; ne pas les présenter comme telles. Le script opérateur contrôle leur auteur, source, langue et état avant l’enregistrement des démos.

## Configuration

Copier `.env.fish.example` dans `.env.fish`, puis définir `FISH_API_KEY` localement. Ce fichier est ignoré par Git. Le pipeline Cloudflare nécessite le secret serveur `FISH_API_KEY` et la variable `FISH_TTS_ENABLED=true`. Ajouter la clé au Worker de génération via Wrangler, sans exposer sa valeur dans une commande, un journal ou un binding `NEXT_PUBLIC_*`. Le fichier local n’active pas Cloudflare.

Appliquer la migration `0030_fish_audio.sql` avant le nouveau pipeline. Elle préserve les lignes, provisions, clés de cache et objets audio existants. L’enregistrement des appels distingue `fish`, `google` et `openai`. Les douze appels vocaux maximum par job s’appliquent ensemble à Fish et Google. La provision conservatrice de cinq centimes par appel réel demeure distincte du coût Fish estimé à zéro ; elle appartient à l’enveloppe vidéo déjà réservée.

## Audio et reprise

Synthèse WAV PCM16 mono à 24 kHz, qualité `normal`, vitesse 1 et normalisation du volume. Fish renvoie des longueurs WAV indéfinies (`0xffffff24` / `0xffffff00`) : elles sont corrigées seulement pour ces marqueurs connus, puis le PCM est mesuré et contrôlé. Taille limitée à 7 Mio, durée maximale de piste 35 s, silence et audio invalide refusés. Le délai de 60 s couvre aussi la lecture du flux. Redirections refusées, erreurs expurgées, aucun diagnostic privé dans les logs.

La voix, le fournisseur, le modèle et la version participent à la clé de cache. Les clés Google historiques restent identiques. Les résultats privés D1/R2 sont vérifiés avant un rejeu ; les appels incertains restent bloqués pour revue. Le rendu vidéo reçoit des WAV vérifiés et ne dépend pas du fournisseur : l’image du renderer existante reste compatible.

## Préécoutes fixes

Trois MP3 publics enregistrés une seule fois : `apps/web/public/audio/voice-previews/fish-v1/`. Même texte que les démos Google, sans données d’une annonce. Le manifeste conserve taille, SHA-256, durée et volume mesuré. Ces fichiers sont versionnés et servis avec un cache immuable d’un an. Aucun appel TTS au clic ; arrêt de l’extrait lors d’un changement de voix, d’onglet ou de désactivation.

```sh
pnpm exec tsx scripts/prepare-fish-previews.ts --check
pnpm exec tsx scripts/prepare-fish-previews.ts --real
pnpm exec tsx scripts/prepare-fish-previews.ts --replay
```

`--real` réutilise les enregistrements terminés. Un journal `pending` ou `failed` interdit une relance implicite. `--replay` fonctionne sans clé et sans appel fournisseur. Ne pas écraser une URL publique immuable : utiliser une nouvelle version pour changer la démo.

Le panneau Super admin affiche le fournisseur, le modèle, le coût estimé, les octets UTF-8, la durée et l’identifiant de requête lorsqu’il est présent. Une facture effective inconnue reste inconnue. La politique de confidentialité mentionne Fish et la rétention possible des textes.

[Recette du 02/10](preuves/maintenance/VOIX-FISH-02-10.md).
