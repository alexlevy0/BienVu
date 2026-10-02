import type {Metadata} from 'next';
import Link from 'next/link';
import {LegalDocument, LegalSection} from '../../../components/legal-document';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description: 'Comment BienVu utilise les données du compte, la connexion Google, les annonces, les photos et les vidéos, et comment exercer vos droits.',
  alternates: {canonical: '/confidentialite'},
};

const contents = [
  {id: 'responsable', title: 'BienVu et vos données'},
  {id: 'donnees', title: 'Les données utilisées'},
  {id: 'google', title: 'La connexion Google'},
  {id: 'finalites', title: 'Pourquoi les utiliser'},
  {id: 'prestataires', title: 'Accès et prestataires'},
  {id: 'conservation', title: 'Durées de conservation'},
  {id: 'cookies', title: 'Cookies et fréquentation'},
  {id: 'droits', title: 'Vos droits et contact'},
] as const;

export default function Page() {
  return <LegalDocument kind="confidentialite" title="Politique de confidentialité" introduction="Les données nécessaires à votre studio, les services qui les traitent et les choix qui restent entre vos mains." contents={contents}>
    <LegalSection {...contents[0]}>
      <p>Cette politique concerne <a href="https://bienvu.online">bienvu.online</a>. BienVu est le nom du projet en accès anticipé, sans société constituée à ce jour. Pour toute question sur le traitement de vos données par BienVu, contactez <a href="mailto:contact@bienvu.online">contact@bienvu.online</a>.</p>
      <div className="legal-callout">Vos créations restent privées par défaut. Leur publication dans Explorer est un choix explicite. La connexion Google est facultative : vous pouvez aussi utiliser votre adresse e-mail et un mot de passe.</div>
    </LegalSection>
    <LegalSection {...contents[1]}>
      <ul>
        <li><strong>Compte :</strong> adresse e-mail, nom de profil, état de vérification de l’adresse et identifiants nécessaires à la connexion. Pour la connexion par mot de passe, une empreinte cryptographique est stockée, pas le mot de passe en clair.</li>
        <li><strong>Agence :</strong> nom, logo, couleurs, ville et coordonnées que vous renseignez. Les champs facultatifs peuvent rester vides.</li>
        <li><strong>Créations :</strong> liens d’annonces, informations du bien, descriptions, photos, brouillons, textes de narration, pistes audio et vidéos. Les informations importées proviennent du lien demandé ; les informations manuelles sont celles que vous transmettez.</li>
        <li><strong>Fonctionnement :</strong> quotas, dates, états et erreurs des générations, consommation estimée des prestataires et traces des traitements nécessaires au suivi des créations.</li>
        <li><strong>Sécurité :</strong> informations de session, adresse IP et navigateur associés à la connexion, limites de requêtes et résultats des contrôles anti-abus. Pour l’essai anonyme, une empreinte IP protégée sert à limiter les tentatives.</li>
      </ul>
      <p>Pour créer un compte ou une vidéo, certaines informations sont nécessaires au fonctionnement de la demande. Les autres champs sont signalés comme facultatifs. Évitez d’ajouter des données personnelles de tiers dans les photos ou les descriptions si elles ne sont pas nécessaires et autorisées.</p>
    </LegalSection>
    <LegalSection {...contents[2]}>
      <p>Si vous choisissez « Continuer avec Google », BienVu demande uniquement les autorisations de connexion <code>openid</code>, <code>email</code> et <code>profile</code>. Google transmet l’identifiant de votre compte, votre adresse e-mail et son état de vérification, votre nom et, lorsqu’elle est disponible, votre image de profil.</p>
      <p>Ces informations servent à vous identifier, créer ou retrouver votre compte BienVu et lui associer votre agence. Elles sont conservées avec les données du compte sur l’infrastructure Cloudflare. Les jetons Google sont utilisés pendant l’authentification puis ne sont pas conservés dans les enregistrements de compte BienVu.</p>
      <p>BienVu ne reçoit pas votre mot de passe Google et ne demande aucun accès à votre messagerie Gmail, vos fichiers Drive, vos contacts ou votre calendrier. Votre identifiant Google, votre image de profil et vos jetons de connexion ne sont pas envoyés aux services de rédaction ou de voix. Les données de connexion ne sont ni vendues ni utilisées pour du ciblage publicitaire.</p>
      <p>L’adresse e-mail du compte initialise aussi le champ de contact de votre agence. Vous pouvez le modifier dans Mon agence. Si vous utilisez cette adresse ou d’autres coordonnées dans votre charte ou vos textes, elles peuvent figurer dans la vidéo et être traitées avec les informations de création, comme décrit ci-dessous.</p>
      <p>Vous pouvez retirer l’autorisation BienVu depuis les paramètres de votre compte Google. Ce retrait empêche une nouvelle connexion Google autorisée mais ne supprime pas automatiquement votre compte BienVu ; contactez-nous pour sa suppression ou utilisez la connexion par e-mail si vous avez défini un mot de passe.</p>
      <p>L’utilisation de ces données respecte la <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, y compris les exigences de « Limited Use » lorsqu’elles s’appliquent.</p>
    </LegalSection>
    <LegalSection {...contents[3]}>
      <div className="legal-table-scroll"><table><thead><tr><th scope="col">Usage</th><th scope="col">Fondement du traitement</th></tr></thead><tbody>
        <tr><th scope="row">Compte, agence et vidéos</th><td>Exécution du service demandé : vous authentifier, préparer une annonce, créer une vidéo, gérer les crédits et fournir vos fichiers.</td></tr>
        <tr><th scope="row">Publication dans Explorer</th><td>Exécution de la fonction de partage que vous demandez volontairement. Vous pouvez retirer la publication.</td></tr>
        <tr><th scope="row">Protection et assistance</th><td>Intérêt légitime de BienVu à protéger le service, limiter les abus, comprendre les incidents et répondre aux demandes d’aide.</td></tr>
        <tr><th scope="row">Obligations applicables</th><td>Respect d’une obligation légale lorsqu’une conservation ou une communication est requise.</td></tr>
      </tbody></table></div>
      <p>Les e-mails envoyés servent à confirmer votre adresse et à gérer votre mot de passe. BienVu ne propose actuellement ni newsletter ni ciblage publicitaire. Aucune décision automatisée produisant un effet juridique sur vous n’est proposée.</p>
    </LegalSection>
    <LegalSection {...contents[4]}>
      <p>L’administration autorisée de BienVu peut accéder aux informations utiles au support, à la sécurité et au suivi des coûts. Les autres utilisateurs n’ont pas accès à votre espace privé. Si vous publiez une vidéo dans Explorer, sa vidéo, sa page et les informations d’agence qui y figurent deviennent publiques.</p>
      <ul>
        <li><strong>Cloudflare</strong> fournit l’hébergement, la base de données, le stockage des médias, les e-mails transactionnels, certains imports et les contrôles Turnstile. Ces services traitent les données nécessaires à ces fonctions. <a href="https://www.cloudflare.com/privacypolicy/">Politique de Cloudflare</a>.</li>
        <li><strong>Google</strong> fournit la connexion facultative décrite ci-dessus. <a href="https://policies.google.com/privacy?hl=fr">Politique de Google</a>.</li>
        <li><strong>OpenAI</strong> reçoit les textes et informations du bien nécessaires à leur structuration ou à la rédaction de la narration, y compris les données personnelles que vous auriez incluses dans ces textes. Les requêtes API de BienVu désactivent le stockage des réponses. Selon OpenAI, les données API ne servent pas à l’entraînement par défaut ; des journaux de prévention des abus peuvent toutefois subsister jusqu’à trente jours, avec des exceptions légales ou de sécurité. <a href="https://developers.openai.com/api/docs/guides/your-data">Traitement des données API OpenAI</a>.</li>
        <li><strong>Google Cloud Text-to-Speech</strong> reçoit le texte de narration pour produire la voix française. Selon sa documentation, ce service ne journalise pas les textes ni les fichiers audio des clients. L’audio produit est ensuite conservé par BienVu avec les médias de la création. <a href="https://docs.cloud.google.com/text-to-speech/docs/data-logging?hl=en">Traitement des données Text-to-Speech</a>.</li>
        <li><strong>Fish Audio</strong> reçoit le texte de narration si vous choisissez une voix Fish Audio. Son offre gratuite S2.1 Pro peut conserver les requêtes et les utiliser pour améliorer ses modèles. BienVu lui transmet le texte à prononcer, sans votre compte ni vos identifiants de connexion. L’audio produit est conservé avec votre création. <a href="https://fish.audio/privacy/">Politique de Fish Audio</a> et <a href="https://fish.audio/fr/blog/s2-1-pro-free-api/">Conditions de l’offre gratuite</a>.</li>
        <li><strong>Runway</strong> reçoit une ou deux photos sélectionnées si vous activez l’animation Runway avant génération. Une instruction de mouvement de caméra accompagne ces images, sans identifiants de connexion. Les clips produits sont ensuite copiés dans le stockage privé de BienVu et suivent la conservation de votre création. <a href="https://runwayml.com/privacy-policy">Politique de Runway</a>.</li>
      </ul>
      <p>Ces prestataires peuvent traiter des données hors de l’Union européenne, notamment aux États-Unis. Leurs conditions de protection des données décrivent les garanties de transfert applicables, dont les clauses contractuelles types lorsqu’elles sont utilisées. BienVu ne garantit pas un traitement exclusivement en France ou dans l’Union européenne. Contactez-nous si vous souhaitez des précisions sur un prestataire ou un transfert.</p>
      <p>BienVu ne vend pas vos données. Une communication peut aussi être nécessaire à une autorité compétente lorsque la loi l’exige.</p>
    </LegalSection>
    <LegalSection {...contents[5]}>
      <div className="legal-table-scroll"><table><thead><tr><th scope="col">Données</th><th scope="col">Durée ou règle actuelle</th></tr></thead><tbody>
        <tr><th scope="row">Compte et identité d’agence</th><td>Tant que votre compte est utilisé pour le service, puis traitement de votre demande de fermeture et de suppression, sous réserve des obligations applicables.</td></tr>
        <tr><th scope="row">Session de connexion</th><td>Validité de sept jours ; elle peut être renouvelée lors de l’utilisation du compte. La déconnexion ferme la session concernée.</td></tr>
        <tr><th scope="row">Brouillons et imports enregistrés</th><td>Échéance de trente jours ; les médias sont ensuite soumis au nettoyage des imports. Vous pouvez supprimer un brouillon avant cette échéance.</td></tr>
        <tr><th scope="row">Médias d’une vidéo de compte</th><td>Généralement sept jours. Un essai récupéré peut bénéficier d’un délai prolongé. La date affichée pour la vidéo indique son échéance ; le nettoyage suit son expiration.</td></tr>
        <tr><th scope="row">Essai anonyme non récupéré</th><td>Médias disponibles vingt-quatre heures après leur préparation, puis nettoyage. La preuve de session du navigateur reste valable trente jours.</td></tr>
        <tr><th scope="row">Empreinte IP d’une génération anonyme</th><td>Effacée au nettoyage des générations datant de plus de quarante-huit heures.</td></tr>
        <tr><th scope="row">Fréquentation agrégée</th><td>Environ trente et un jours, avec une purge quotidienne.</td></tr>
        <tr><th scope="row">Historique et traces de traitement</th><td>Les états, informations du bien, narrations, traces de coûts et extractions de texte peuvent subsister après les fichiers. Les traces d’extraction peuvent aussi contenir une empreinte IP protégée. Aucune purge automatique générale de ces métadonnées n’est encore appliquée pendant l’accès anticipé. Leur suppression peut être demandée.</td></tr>
      </tbody></table></div>
      <p>L’expiration d’un média n’équivaut donc pas à l’effacement de toutes les informations de la création. Les durées propres aux prestataires sont distinctes et décrites dans leurs politiques. BienVu ne constitue pas un service d’archivage : sauvegardez vos fichiers avant leur échéance.</p>
    </LegalSection>
    <LegalSection {...contents[6]}>
      <p>Des cookies nécessaires permettent de maintenir la connexion, sécuriser l’authentification et retrouver un essai anonyme dans le même navigateur. Les contrôles Turnstile de Cloudflare traitent des signaux techniques de sécurité. BienVu n’installe pas de cookie publicitaire ni d’identifiant analytique de visiteur.</p>
      <p>Le lien d’une annonce peut être gardé dans l’onglet pendant une heure. Pour reprendre une annonce manuelle, les champs et photos peuvent être conservés localement dans ce navigateur pendant une heure, lorsque son stockage est autorisé. Ils sont effacés après enregistrement ou lors d’une visite suivant leur expiration. Les photos simplement déposées dans l’input restent en mémoire avant leur ajout au brouillon.</p>
      <p>Les statistiques du site comptent les pages vues par jour, page publique et pays d’origine réseau communiqué par Cloudflare. Ces agrégats n’enregistrent ni adresse IP, ni identifiant de visiteur, ni référent. Ils n’indiquent pas votre position précise et ne comptent pas des visiteurs uniques. Les données techniques utilisées pour la sécurité des connexions restent un traitement distinct.</p>
      <p>Vous pouvez effacer les cookies et le stockage du site depuis votre navigateur. Cela peut fermer votre session, supprimer un brouillon local ou empêcher de retrouver un essai anonyme.</p>
    </LegalSection>
    <LegalSection {...contents[7]}>
      <p>Selon votre situation et le traitement concerné, vous pouvez demander l’accès, la rectification, l’effacement ou la portabilité de vos données, la limitation d’un traitement ou vous y opposer. Certains droits ont des conditions et peuvent être limités par une obligation légale.</p>
      <p>Écrivez à <a href="mailto:contact@bienvu.online">contact@bienvu.online</a> en indiquant l’adresse de votre compte et votre demande. Ne transmettez pas votre mot de passe. Nous pouvons demander une vérification proportionnée de votre identité si nécessaire. Une réponse est apportée dans le délai applicable, en principe un mois ; si une prolongation autorisée est nécessaire, vous en êtes informé.</p>
      <p>Vous pouvez également saisir la <a href="https://www.cnil.fr/fr/plaintes">CNIL</a>. Les <a href="https://www.cnil.fr/fr/mes-demarches/les-droits-pour-maitriser-vos-donnees-personnelles">informations de la CNIL sur vos droits</a> précisent leurs modalités.</p>
      <p>Cette politique sera mise à jour si les pratiques de BienVu évoluent. Sa date est affichée en haut de la page ; toute évolution importante de l’utilisation de vos données fera l’objet d’une information appropriée. Consultez aussi les <Link href="/conditions">conditions d’utilisation</Link>.</p>
    </LegalSection>
  </LegalDocument>;
}
