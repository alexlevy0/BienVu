# Sprint 05 — phrasé oral et rythme, 28/09/2026

À la demande d'Alex, application des [conseils de rédaction Chirp 3 HD](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd?hl=fr#scripting-and-prompting-tips). Cette comparaison conserve **Aoede**, le débit standard et les mêmes faits synthétiques que la recette Cloudflare initiale. Elle ne prétend pas reproduire une voix humaine à l'identique.

## Changement livré

- Catalogue `factual-copy/2` : formulations orales et ponctuation, sans adjectifs non vérifiés ni faits ajoutés. « Ce bien présente une surface de… » devient « Vous disposez ici de… » ; la conclusion emploie une question courte. Les chiffres, captions et références de provenance restent exacts.
- Version du catalogue figée dans le snapshot. Les snapshots antérieurs sans version utilisent encore `factual-copy/1` ; leurs empreintes et leurs WAV sont conservés, même en reprise après interruption. Aucun job existant n'est réécrit en v2.
- Environ 0,3 s de marge entre les pistes. L'attente supplémentaire pour atteindre 20 s est réservée à la carte finale. WAV inchangés, sans accélération ni suppression de phonèmes. Les pauses internes à la synthèse sont distinctes de ces marges.

## Vérifications locales, fournisseurs simulés

`pnpm exec tsx --test tests/narration-script.test.ts tests/narration-storage.test.ts tests/voice.test.ts` : **30 tests réussis**. Contrôle de l'empreinte historique v1, reprise d'un snapshot sans version, coût/cache, fidélité des faits et timing sans troncature. `pnpm typecheck`, `pnpm check:boundaries` (96 fichiers), contrôle syntaxique de la sonde et `git diff --check` réussis.

`pnpm probe:narration:worker` : build puis runtime **workerd local**, vrai fetch avec sorties interceptées, aucun réseau fournisseur. Onze contrôles HTTP ; 1 texte/4 voix simulés, puis reprise 0/0. Quatre scènes, 663 frames ; le résultat utilise bien `factual-copy/2`. Ces pistes sont des signaux de fixture, pas des voix humaines ou un test réel Google.

## Essai réel depuis Cloudflare

Déploiement `fc9c2de6-6694-4f0d-9488-443d95581cdd`, Worker privé `bienvu-narration-staging`. Nouvelle agence/annonce de fixture dans la D1 isolée, même bucket R2 privé ; aucun compte ni import public modifié. Les fichiers de la première recette sont conservés dans leur dossier d'origine. La nouvelle campagne conserve l'intégralité du journal de coûts existant.

Essai lancé à **19:29 UTC**, réponse 200, 83 682 ms de temps mural. Un appel OpenAI, cinq appels Google réels, aucune correction ni réduction du texte. OpenAI : 972 tokens d'entrée, 86 de sortie, zéro token en cache. Google : **284 caractères**, cinq WAV PCM 24 kHz mono, empreintes et mesures relues depuis R2.

| Scène | Narration réellement synthétisée | Durée WAV | Frames de scène |
|---|---|---:|---:|
| Introduction | Direction Lyon, pour découvrir cet appartement à vendre. | 3,68 s | 120 |
| Surface | Vous disposez ici de quarante-deux virgule zéro six mètres carrés. | 4,08 s | 132 |
| Prix | Son prix : trois cent soixante-dix-neuf mille euros. | 2,52 s | 85 |
| Photos | Prenons un instant pour découvrir les lieux en images. | 2,80 s | 93 |
| Contact | Envie d'en savoir plus ? Contactez BienVu Démonstration. | 3,84 s | 170 |

Résultat : **600 frames / 20 s**, dont 16,92 s dans les WAV et 3,08 s ajoutées au montage. Transitions de 0,30–0,32 s après arrondi ; 1,83 s après la conclusion. La version précédente durait 20,37 s, dont 15,28 s dans les WAV et 5,09 s ajoutées. Le fichier écoutable est `evidence/remote/sprint-05/naturalness/narration-cloudflare.wav` ; script, rapport et pistes restent hors Git, permissions privées. Photos/annonce synthétiques : ce n'est pas une vidéo ni un import de portail.

## Coût et validation d'écoute

Avant essai, contrôleur global relu à **24,15 €** et enveloppe API distante à 0,70 €, dont 0,35 € déjà réservés. La comparaison consomme six nouvelles réservations de 0,05 €, soit **0,30 € dans cette enveloppe existante**. Aucun compteur remis à zéro et aucune provision globale ajoutée. Total du journal distant : 0,65 € ; il reste 0,05 € dans cette campagne, sans rouvrir d'appel automatique.

Estimation brute de la comparaison : **0,001116 USD texte + 0,008520 USD voix = 0,009636 USD**, avant gratuité. Cumul des essais API réussis : **0,038061 USD**. Coût effectivement facturé, conversion, taxes et gratuité restante inconnus. Les provisions globales restent à 24,15 € sur 30 €, coupure à 25 €.

Reprise distante vérifiée à 19:31 UTC : **0 appel texte / 0 appel voix**, résultat identique et journal de coûts inchangé. Script et toutes les pistes relus, accès anonyme et autre agence refusés, empreintes vérifiées.

Fermeture vérifiée à **19:34 UTC**, après redéploiement `65002047-58a8-4501-8a19-92b7bc627bf4` : Worker désactivé, enveloppe API en pause, préparation refusée en 503, lecture privée en 200 avec résultat inchangé après redéploiement. Générations publiques toujours désactivées, journal de coûts inchangé, budget global relu à 24,15 €. Les 89 liens relatifs des documents modifiés sont valides ; WAV et journaux privés ignorés par Git, WAV en mode 0600.

L'échantillon de 20 secondes est présenté à Alex. **Écoute validée : « Oui, c’est plus naturel et le rythme convient ».** Cette validation concerne la narration audio ; la recette sur les images du MP4 reste au sprint 06.
