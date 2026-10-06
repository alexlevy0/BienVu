# Cartesia et catalogue de voix BienVu

Cartesia est intégré avec le modèle figé `sonic-3.6-2026-08-27` et la version d’API `2026-08-14`. Le catalogue contient les 41 voix publiques accessibles au compte Free le 6 octobre 2026, actives et natives en français de France avec l’accent `parisian`. Les voix multilingues sans accent parisien natif, les voix privées et les voix réservées aux offres supérieures sont exclues. Le client ne peut pas fournir un autre modèle, une voix arbitraire, du SSML ou un accent différent.

## Configuration

Définir `CARTESIA_API_KEY` comme secret serveur et `CARTESIA_TTS_ENABLED=true` sur le Worker web et le Worker de génération, après application de `0048_cartesia_voices.sql`. Le fichier local `.env.cartesia` est ignoré ; le modèle est dans `.env.cartesia.example`. Aucun secret ne doit être préfixé `NEXT_PUBLIC_` ou embarqué dans un asset. Les configurations versionnées gardent l’activation désactivée ; l’activation distante préserve tous les bindings existants.

Le Worker web utilise les secrets Fish et Google existants uniquement pour les comparaisons du superadmin. Le Worker de génération initialise seulement le fournisseur choisi : Cartesia et Fish ne dépendent pas d’un credential Google. L’intégration ne crée aucun abonnement fournisseur ni repli automatique vers une offre payante.

## Superadmin → Voix off

Les voix sont regroupées par fournisseur : Cartesia, Fish Audio et Google. Le panneau propose les 30 dernières annonces enregistrées, compose un texte factuel à partir de leurs informations et permet de le modifier, jusqu’à 1 000 caractères. Tous les fournisseurs lisent le même texte. Les premières écoutes appellent le fournisseur ; les suivantes réutilisent l’extrait privé conservé en R2, identifié par le texte, la voix et la configuration.

Le bouton « Choisir par défaut » enregistre un réglage global audité, avec contrôle de révision contre les modifications concurrentes. Inès est la valeur initiale. Les nouveaux projets utilisent ce réglage ; les choix enregistrés dans les brouillons et vidéos restent prioritaires. La voix est figée au lancement d’un job pour qu’une reprise ou un changement du défaut ne modifie pas son audio.

Les API du panneau et chaque fichier d’extrait exigent la session du superadmin avec adresse vérifiée. Les écritures contrôlent l’origine et la taille du JSON. Un catalogue public distinct expose uniquement noms, fournisseurs et défaut, sans texte d’annonce ni clé privée.

## Limite Free et coût

Un registre D1 atomique, commun aux générations et aux comparaisons, provisionne le nombre de caractères **avant** chaque appel Cartesia. Il bloque au-delà de 20 000 caractères sur 31 jours glissants et limite à deux appels simultanés. Cette fenêtre est conservatrice : le solde affiché est un plafond interne, pas une interrogation du solde fournisseur. Un usage extérieur à BienVu ou des règles de comptage fournisseur différentes peuvent réduire le solde réel ; les refus de l’API restent traités.

Les appels échoués ou incertains restent provisionnés. Aucun retry automatique n’est lancé après un résultat incertain. Les extraits ont aussi un plafond de 60 créations par administrateur et jour. Un refus de quota avant tout appel permet une tentative ultérieure ; une réponse ambiguë demande une vérification.

La gratuité n’est pas une facture : les métriques Cartesia conservent `actualBilledMicros=null`. Le rapprochement financier accepte Cartesia comme fournisseur pour affecter d’éventuelles factures réelles. Le quota de caractères fournisseur reste distinct des crédits BienVu.

## Audio et vérification

L’API renvoie du WAV PCM16 mono à 24 kHz. Le code contrôle taille, durée, absence de silence et empreinte, puis conserve les pistes sous les préfixes privés du job. Les bandes-son existantes et leurs clés de cache sont conservées. Une comparaison de texte long autorise jusqu’à cinq minutes dans le panneau, dans la limite commune de 7 Mio ; la limite historique par clip de génération reste de 35 secondes.

Les aperçus courts accessibles aux utilisateurs sont des fichiers MP3 déjà enregistrés, sans génération à chaque écoute. `scripts/prepare-cartesia-voice-previews.ts --check` vérifie leur présence sans appel fournisseur. `--one` et `--real` sont des opérations explicites d’enregistrement, avec provision Free et journal local avant appel.

Tests : `tests/cartesia-voice.test.ts`, scénarios complets de workflow, essais anonymes et régressions de crédits. Les résultats réels et les limites sont consignés dans [la recette du 6 octobre](preuves/cartesia-2026-10-06/RESULTATS.md).

Références officielles : [modèle Sonic 3.6](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest), [API](https://docs.cartesia.ai/api-reference/tts/bytes), [offres Cartesia](https://cartesia.ai/pricing). L’autorisation d’utiliser Free pour des essais ne remplace pas les conditions de licence du fournisseur pour un usage commercial.
