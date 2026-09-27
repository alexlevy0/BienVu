# Bypass local de vérification e-mail — 28/09/2026

Demande d’Alex : une variable pour marquer l’adresse vérifiée et connecter automatiquement l’utilisateur. `AUTH_EMAIL_VERIFICATION_BYPASS=true` est activé sur le poste dans `.dev.vars` (ignoré par Git), avec valeur versionnée `false`.

À l’inscription e-mail, le champ `emailVerified` est persisté à `1` avant la création de session. Le cookie HttpOnly et l’agence sont créés normalement, sans mail. Le navigateur rejoint `/agence` grâce à une réponse minimale `{ok:true, authenticated:true}`, sans jeton exposé. Un compte local déjà en attente peut se connecter avec son mot de passe : la vérification est alors marquée seulement après validation du secret par Better Auth. Aucune validation sur simple fourniture d’une adresse ou sur échec de mot de passe.

L’option exige mode local, origine HTTP localhost/127.0.0.1 et requête sur l’origine configurée. Une requête publique reste refusée même si les variables locales y étaient copiées. La préparation staging force `false`. Le contrôle d’identité Google reste inchangé. Avec `false`/variable absente, la confirmation normale demeure obligatoire pour les nouvelles inscriptions. Une désactivation ne modifie pas rétroactivement les comptes de test déjà vérifiés.

| Vérification | Preuve |
|---|---|
| 56 tests, frontières et TypeScript | [Journal](bypass-check.log) |
| Build Next/OpenNext | [Journal](bypass-build.log) |
| HTTP réel sous workerd local, inscription synthétique sans compte préinséré | [Rapport](bypass-workerd.json), [journal](bypass-probe.log) |
| Inscription navigateur et redirection automatique | [Inspection](bypass-inspection-ui.json) |

La sonde contrôle le champ D1, le hachage, le cookie, l’agence unique, aucun mail, la persistance, le mauvais mot de passe, la réinscription, zéro allocation et la déconnexion. Le compte de sonde est supprimé ensuite. La recette normale avec confirmation reste couverte par les tests ; les preuves HTTP précédentes sont distinctes.

**Fixtures uniquement**, aucune adresse réelle vérifiée par le bypass. 0 € de nouvel appel externe ; aucun mail réel, Docker, abonnement, déploiement ou push. Configuration et reproduction : [AUTHENTIFICATION.md](../../AUTHENTIFICATION.md#bypass-de-vérification-pour-le-développement). Google réel, livraison réelle et recette Containers restent en attente.
