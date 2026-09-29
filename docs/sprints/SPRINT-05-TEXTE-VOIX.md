# Sprint 05 — Écrire une présentation fidèle et produire la voix

**Dépendance : sprint 04 ; une source d'agence fonctionnelle suffit pour la recette. Statut : terminé, recette réelle Cloudflare validée le 28/09/2026.**

Le 28/09, Alex choisit Google Cloud **Chirp 3 HD**, configure l'accès puis valide l'écoute d'Aoede sur villes, montants et surface décimale. Le test complet suivant réussit : **un appel OpenAI, cinq synthèses Google**, script factuel validé, D1/R2 locaux privés et reprise sans nouvel appel. Annonce synthétique, vrais fournisseurs depuis le Mac ; bundle workerd vérifié séparément avec mocks. Alex juge les pauses initiales trop longues : timing réduit de 30 à **20 s** sans régénérer les pistes. [Guide](../NARRATION.md) · [preuves, coûts et limites](../preuves/sprint-05/RAPPORT.md). Puis le Worker Cloudflare produit réellement cinq voix et un script, conserve D1/R2 privés et reprend après redéploiement sans nouvel appel : **20,37 s**, provenance manuelle conservée. [Preuve distante et fermeture](../preuves/sprint-05/CLOUDFLARE.md). La réserve 04.3 de Bien’ici reste ouverte ; aucune compatibilité de portail n'est déduite de cette recette.

## Objectif

Produire automatiquement une présentation française agréable à écouter, fondée uniquement sur les informations de l'annonce enregistrée : faits importés `verified` ou données manuelles `user_provided`, sans transformer ces dernières en faits vérifiés sur un site. Générer des pistes vocales par scène pour permettre une synchronisation fiable dans la vidéo. Cette prise en compte de la saisie manuelle reprend la décision d'Alex du 28/09.

Références : [CONTRATS.md](../CONTRATS.md), [CADRAGE.md](../CADRAGE.md), [BUDGET-ET-OFFRES.md](../BUDGET-ET-OFFRES.md), sources OpenAI de [SOURCES.md](../SOURCES.md).

## Travail à réaliser

- [x] **05.1 — Définir un script structuré.** Prévoir quatre à six scènes avec phrase de narration, texte affiché, photo et références aux faits. Utiliser une accroche factuelle, les caractéristiques disponibles et une conclusion avec les coordonnées choisies. Si seules trois photos conviennent, leur réutilisation sobre est permise ; ne pas inventer une quatrième photo.
- [x] **05.2 — Encadrer la rédaction IA.** Fournir seulement les faits normalisés et le contexte utile, avec schéma de sortie strict et limites de tokens. Interdire l'invention d'un quartier, d'une vue, d'une proximité, d'une performance énergétique ou d'une rentabilité. Une description source ne peut pas changer les instructions de génération ni déclencher d'outils.
- [x] **05.3 — Valider avant la voix.** Contrôler chiffres, unités, références de faits et cohérence vente/location. Refuser une assertion non soutenue ; autoriser au plus une correction structurée bornée. Si la correction reste invalide, échouer explicitement plutôt que produire une vidéo trompeuse. Les limites de coût incluent ces appels supplémentaires.
- [x] **05.4 — Intégrer le TTS.** Choisir une voix française de qualité parmi les voix disponibles et vérifier le modèle candidat au moment de l'implémentation. Garder modèle et voix configurables. Produire une piste par scène, stockée en privé avec empreinte du texte et version des paramètres. Ne pas régénérer une piste validée lors d'une reprise identique.
- [x] **05.5 — Préparer le timing.** Mesurer la durée réelle des pistes dans l'environnement Node prévu, puis calculer les frames et pauses. Durée adaptée dans la plage de 20 à 35 secondes : après écoute d'Alex, ne pas étirer artificiellement une narration courte jusqu'à 30 secondes. Un texte trop long peut être raccourci une seule fois ; aucune phrase n'est coupée artificiellement.
- [x] **05.6 — Rendre les coûts visibles.** Journaliser modèles, versions de prompt, identifiants de requête, usage retourné, durée audio et erreurs. Marquer les coûts inconnus comme inconnus, sans les ramener à zéro. Prévoir des réponses mocks pour la CI.

## Critères d'acceptation

1. Des cas synthétiques vérifient vente, location, champ absent, gros montant, décimale de surface et instruction malveillante dans une description.
2. Chaque fait chiffré prononcé ou affiché correspond aux données de l'annonce et conserve sa provenance importée/manuelle ; aucun champ absent n'est remplacé par une supposition. Tester les deux modes de création.
3. Une écoute réelle confirme l'intelligibilité du français, des montants, des unités et des noms de ville sur un petit échantillon.
4. L'échec TTS, un retour invalide et un dépassement de durée sont bornés et propagés proprement au job.
5. Les pistes et scripts restent privés et une reprise identique n'entraîne pas d'appels déjà évitables.

## Résultats d'acceptation

| Critère | État et preuve |
|---|---|
| 1 — Variété des cas | Vente/location, champ absent, gros montant, décimale et injection couverts par les tests déterministes |
| 2 — Faits et provenance | Compilation/validation canonique, mocks URL et manuel ; scénarios synthétiques avec vrais fournisseurs : URL depuis le Mac, manuel depuis Cloudflare ; aucune promotion de `user_provided` |
| 3 — Écoute | Premier échantillon validé par Alex ; nouvelle narration Cloudflare avec phrasé oral et transitions courtes : Alex confirme « Oui, c’est plus naturel et le rythme convient ». [Comparaison](../preuves/sprint-05/NATUREL.md) |
| 4 — Échecs bornés | Erreurs et journal privé par job vérifiés ; traduction vers le statut global et réservation client par le futur Workflow (sprint 07) |
| 5 — Privé et reprise | D1/R2 locaux et Cloudflare privés ; isolation, corruption/concurrence sur fixtures ; reprise distante après redéploiement sans nouvel appel ni récupération de données |

Les travaux du sprint sont implémentés et vérifiés localement puis sur Cloudflare. La migration 0011, les secrets, les appels réels, le stockage privé et la reprise sont éprouvés. Restent aux sprints suivants : manifeste/rendu (06), Workflow/budget produit/purge (07/09). Aucun accès client aux voix ni pipeline public ouvert ; Worker opérateur remis en pause après recette. L’écoute d’un MP4 complet, avec contrôle du rythme sur images, appartient au sprint 06.

## Livrables et fin du sprint

Générateur de script, validateur factuel, adaptateur TTS, mesure audio, fixtures et échantillons autorisés. Préparer la mention compréhensible de voix synthétique pour le lecteur et la vidéo. Mettre à jour [SUIVI.md](../SUIVI.md) avec résultats d'écoute et coûts observés.

Pas de clonage vocal, musique, traduction, avatar ou édition du texte par le client dans cette version.
