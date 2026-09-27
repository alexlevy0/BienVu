# Sprint 05 — Écrire une présentation fidèle et produire la voix

**Dépendance : sprint 04 ; une source d'agence fonctionnelle suffit pour la recette. Statut initial : à faire.**

## Objectif

Produire automatiquement une présentation française agréable à écouter, fondée uniquement sur les informations vérifiées de l'annonce. Générer des pistes vocales par scène pour permettre une synchronisation fiable dans la vidéo.

Références : [CONTRATS.md](../CONTRATS.md), [CADRAGE.md](../CADRAGE.md), [BUDGET-ET-OFFRES.md](../BUDGET-ET-OFFRES.md), sources OpenAI de [SOURCES.md](../SOURCES.md).

## Travail à réaliser

- [ ] **05.1 — Définir un script structuré.** Prévoir quatre à six scènes avec phrase de narration, texte affiché, photo et références aux faits. Utiliser une accroche factuelle, les caractéristiques disponibles et une conclusion avec les coordonnées choisies. Si seules trois photos conviennent, leur réutilisation sobre est permise ; ne pas inventer une quatrième photo.
- [ ] **05.2 — Encadrer la rédaction IA.** Fournir seulement les faits normalisés et le contexte utile, avec schéma de sortie strict et limites de tokens. Interdire l'invention d'un quartier, d'une vue, d'une proximité, d'une performance énergétique ou d'une rentabilité. Une description source ne peut pas changer les instructions de génération ni déclencher d'outils.
- [ ] **05.3 — Valider avant la voix.** Contrôler chiffres, unités, références de faits et cohérence vente/location. Refuser une assertion non soutenue ; autoriser au plus une correction structurée bornée. Si la correction reste invalide, échouer explicitement plutôt que produire une vidéo trompeuse. Les limites de coût incluent ces appels supplémentaires.
- [ ] **05.4 — Intégrer le TTS.** Choisir une voix française de qualité parmi les voix disponibles et vérifier le modèle candidat au moment de l'implémentation. Garder modèle et voix configurables. Produire une piste par scène, stockée en privé avec empreinte du texte et version des paramètres. Ne pas régénérer une piste validée lors d'une reprise identique.
- [ ] **05.5 — Préparer le timing.** Mesurer la durée réelle des pistes dans l'environnement Node prévu, puis calculer les frames et pauses. La cible est d'environ 30 secondes, dans la plage proposée de 20 à 35 secondes. Un texte trop long peut être raccourci une seule fois ; aucune phrase n'est coupée artificiellement.
- [ ] **05.6 — Rendre les coûts visibles.** Journaliser modèles, versions de prompt, identifiants de requête, usage retourné, durée audio et erreurs. Marquer les coûts inconnus comme inconnus, sans les ramener à zéro. Prévoir des réponses mocks pour la CI.

## Critères d'acceptation

1. Des cas synthétiques vérifient vente, location, champ absent, gros montant, décimale de surface et instruction malveillante dans une description.
2. Chaque fait chiffré prononcé ou affiché correspond aux données vérifiées ; aucun champ absent n'est remplacé par une supposition.
3. Une écoute réelle confirme l'intelligibilité du français, des montants, des unités et des noms de ville sur un petit échantillon.
4. L'échec TTS, un retour invalide et un dépassement de durée sont bornés et propagés proprement au job.
5. Les pistes et scripts restent privés et une reprise identique n'entraîne pas d'appels déjà évitables.

## Livrables et fin du sprint

Générateur de script, validateur factuel, adaptateur TTS, mesure audio, fixtures et échantillons autorisés. Préparer la mention compréhensible de voix synthétique pour le lecteur et la vidéo. Mettre à jour [SUIVI.md](../SUIVI.md) avec résultats d'écoute et coûts observés.

Pas de clonage vocal, musique, traduction, avatar ou édition du texte par le client dans cette version.
