# Narration sur toute la durée — 02/10/2026

## Problème confirmé

Le dernier job prêt du compte d’Alex, demandé à 40 secondes, contenait quatre pistes totalisant **12,947 secondes** pour **35 mots**. L’ancien timing distribuait le temps restant dans les scènes, d’où les longs blancs. Le snapshot et le MP4 existants sont conservés ; aucune régénération ni consommation du quota client pendant cette recette.

## Changement

Les nouvelles demandes avec durée choisie utilisent `description-copy/2` / `narration-fr/3`. Un catalogue de variantes en quatre paragraphes combine les clauses utiles de la description et les faits structurés exacts. La sélection vise environ **50 / 77 / 104 mots** pour **20 / 30 / 40 secondes**, avec plafonds **60 / 90 / 120 mots**. Les conditions d’état, négations et suppléments restent attachés à leurs clauses ; données administratives, injonctions et chiffres contradictoires sont filtrés. Les phrases sont complètes, jamais remplies de caractéristiques inventées ou de répétitions.

Après synthèse, la durée des échantillons WAV est mesurée. Une adaptation du texte est permise, persistée en version 2 avant les appels suivants. Les paragraphes inchangés réutilisent leurs pistes. Le pipeline peut ensuite choisir gratuitement une variante plus complète composée uniquement de paragraphes déjà synthétisés et mesurés. Cette dernière sélection n’effectue aucun appel TTS. Le montage ajoute quatre frames entre pistes (environ 0,13 s, plus arrondi) et garde les respirations internes de la voix ; les paroles ne sont ni coupées ni accélérées. Les frames totalisent exactement la durée choisie.

Les narrations modifiées par l’utilisateur restent intactes et ne sont jamais développées automatiquement. Les champs acceptent désormais 500 caractères par passage, avec plafond global de 900 caractères / 120 mots. L’interface conseille une longueur correspondant à la durée choisie. Les versions historiques conservent leur catalogue, hash et timing reproductibles.

Une description très pauvre peut ne pas fournir assez de matière pour parler pendant toute la durée : le système garde les faits disponibles plutôt que d’inventer ou répéter des atouts. Un texte utilisateur trop long pour la voix choisie reste refusé sans couper sa dernière phrase.

## Mesure réelle et écoute

Une campagne isolée utilise la même description que le job d’Alex, sans modifier ses dossiers, ses réservations ou ses fichiers. **Un appel réel OpenAI et six appels réels Fish Audio Manon** ont produit les pistes initiales et les deux paragraphes adaptés. Le header `s2.1-pro-free` reste explicite, conformément à l’autorisation d’Alex.

Le texte initial de 104 mots donnait 43,016 s de WAV ; l’adaptation à 90 mots donnait 34,588 s. La sélection des paragraphes déjà mesurés remplit une variante de **98 mots et 39,394 s de WAV** dans **40,000 s**, sans aucun nouvel appel réseau. Pistes finales : **2,923 / 14,255 / 20,872 / 1,344 s**. Frames : **92 / 432 / 631 / 45**, total 1 200. Les espaces ajoutés après les pistes sont de **0,144 / 0,145 / 0,161 / 0,156 s**.

La composition finale a été rejouée en D1/R2 isolés avec les réponses API et WAV réellement enregistrés : ce sont des enregistrements réels réutilisés, pas des sons de fixture. Reprise préparée : **zéro appel fournisseur**. Aucun nouveau MP4 Cloudflare n’a été exporté pendant cette recette audio ; le manifeste utilise le renderer déjà déployé.

Détection indépendante sur le PCM final : RMS par tranches de 10 ms, seuil −40 dBFS, silences suivis à partir de 400 ms. La plus longue pause détectée mesure **0,78 s**, à l’intérieur d’une piste Manon ; le dernier silence mesure 0,34 s. Cette mesure ne remplace pas la validation du timbre et de la compréhension. **Alex a écouté l’échantillon de 40 secondes et confirmé que le rythme convient.**

## Vérifications

- Six tests de couverture réussis : longueur selon durée, conditions conservées, IDs étrangers refusés, adaptation bornée, sélection de cache mesuré, WAV complets, texte personnel intact, reprise sans fournisseur et quota client inchangé.
- Tests existants de narration, voix Google/Fish, durée, personnalisation et Workflow exécuté par workerd, dont admission 40 s avec/sans voix et retour d’erreur explicite.
- Le script historique réel `description-copy/1` est recompilé à l’identique, avec hash inchangé.
- Typecheck, frontières Workers/renderer (197 fichiers) et build OpenNext ; compilation Wrangler des deux Workers. La campagne élargie compte 61 tests distincts ; deux échecs initiaux ont été revérifiés dans une reprise ciblée de 6 tests réussis (assertion du hash de configuration corrigée pour respecter l’ordre des clés JSON ; préparation personnalisée réussie en exécution isolée après un échec de stockage pendant les builds concurrents).
- Interface Voix et texte inspectée en local puis sur la version publiée à 1536/390 px : champs de 500 caractères, conseil de 120 mots à 40 s, description conservée, aucun débordement ni appel fournisseur (API navigateur de fixture).
- Les fournisseurs et le renderer des tests Workflows sont simulés ; les appels OpenAI/Manon de la mesure ci-dessus sont réels et locaux.

## Budget

Avant campagne : **44,05 €** engagés (base D1 34,05 € + imports 10 €), coupure mensuelle à 90 €, enveloppe autorisée 100 €. Provision supplémentaire réservée atomiquement avant les API : **0,80 €**, soit **44,85 € engagés** à cet instant. L’enveloppe API locale de 0,70 € contient sept réservations de 0,05 €, **0,35 € déjà inclus** dans cette campagne ; la réutilisation finale n’ajoute aucun appel. Estimation OpenAI : **0,003481 USD** avant remise de cache ; Fish free : estimation 0 USD. Facture, conversion et frais d’infrastructure non rapprochés. Aucun achat de crédit ni nouvel abonnement.

Les sources, réponses, journaux, WAV et captures de recette restent dans `evidence/local/narration-coverage/`, ignoré par Git ; fichiers privés à permissions restreintes. Aucune clé ni cookie dans cette preuve.

## Publication

Versions et vérifications après publication consignées dans le suivi. Les nouveaux jobs utilisent le nouveau catalogue ; les médias déjà exportés gardent leur narration d’origine. Renderer 13 conservé, aucune reconstruction ou relance du conteneur pour ce changement audio.
