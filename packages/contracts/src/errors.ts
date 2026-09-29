import {z} from 'zod';

export const publicErrors = {
  ANONYMOUS_UNAVAILABLE: [503, 'L’essai sans compte est momentanément indisponible. Vous pouvez vous connecter.'],
  TRIAL_USED: [429, 'L’essai de ce navigateur a déjà été utilisé. Connectez-vous pour retrouver vos vidéos.'],
  TRIAL_LIMIT: [429, 'La limite des essais est atteinte. Réessayez plus tard ou connectez-vous.'],
  TRIAL_EXPIRED: [410, 'Cet essai a expiré. Aucun nouveau traitement ne sera lancé automatiquement.'],
  TRIAL_SOURCE_UNSUPPORTED: [422, 'Pour l’essai sans compte, utilisez une annonce Espaces Atypiques, Orpi ou Century 21. Connectez-vous pour utiliser les autres imports ou vos photos.'],
  BOT_VERIFICATION_FAILED: [422, 'La vérification a expiré ou échoué. Validez à nouveau puis réessayez.'],
  INVALID_URL: [422, 'Le lien de l’annonce est invalide.'],
  UNSAFE_URL: [422, 'Ce lien ne peut pas être consulté en toute sécurité.'],
  SOURCE_BLOCKED: [422, 'Ce site refuse actuellement l’accès à cette annonce. Essayez un autre lien autorisé.'],
  SOURCE_UNAVAILABLE: [422, 'L’annonce est momentanément inaccessible.'],
  NOT_A_LISTING: [422, 'Ce lien ne permet pas d’identifier une annonce immobilière.'],
  INCOMPLETE_LISTING: [422, 'Les informations de l’annonce sont insuffisantes pour créer une vidéo.'],
  CONFLICTING_FACTS: [422, 'Des informations contradictoires empêchent la création de la vidéo.'],
  INSUFFICIENT_PHOTOS: [422, 'Au moins trois photos distinctes du bien sont nécessaires.'],
  INVALID_PHOTO: [422, 'Photo invalide : utilisez un JPEG, PNG ou WebP de 640 × 360 pixels minimum, 16 millions de pixels maximum.'],
  PHOTO_TOO_LARGE: [413, 'Une photo dépasse la limite de 10 Mo.'],
  DUPLICATE_PHOTO: [422, 'Ces photos contiennent une image identique. Choisissez des photos différentes du bien.'],
  IMPORT_TIMEOUT: [422, 'L’annonce met trop de temps à répondre. Réessayez plus tard.'],
  IMPORTS_UNAVAILABLE: [503, 'L’import des annonces est momentanément indisponible. Réessayez plus tard.'],
  IMPORT_LIMIT: [429, 'La limite des imports de test est atteinte. Réessayez plus tard.'],
  VALIDATION_ERROR: [422, 'Les données fournies sont incomplètes ou incohérentes.'],
  UNAUTHORIZED: [401, 'Connectez-vous pour accéder à votre espace.'],
  FORBIDDEN: [403, 'Cette demande n’est pas autorisée. Rechargez la page et réessayez.'],
  AUTH_UNAVAILABLE: [503, 'La connexion Google n’est pas encore disponible. Réessayez plus tard.'],
  AUTH_FAILED: [400, 'La connexion n’a pas abouti. Réessayez depuis la page de connexion.'],
  AUTH_CREDENTIALS: [400, 'L’adresse e-mail ou le mot de passe est incorrect.'],
  EMAIL_UNAVAILABLE: [503, 'L’envoi des e-mails est momentanément indisponible. Réessayez plus tard.'],
  EMAIL_NOT_VERIFIED: [403, 'Confirmez votre adresse e-mail avant de vous connecter. Vous pouvez demander un nouveau lien.'],
  AUTH_LINK_INVALID: [400, 'Ce lien est invalide ou expiré. Demandez un nouveau lien.'],
  FILE_TOO_LARGE: [413, 'Le fichier dépasse la limite de 2 Mo.'],
  INVALID_LOGO: [422, 'Choisissez une image PNG ou JPEG valide, de 16 à 1 024 pixels par côté et de 2 Mo maximum.'],
  LOGO_STORAGE_FULL: [409, 'La capacité de stockage des versions de logo est atteinte. Contactez le support.'],
  RATE_LIMITED: [429, 'Trop de demandes. Patientez une minute avant de réessayer.'],
  NOT_FOUND: [404, 'Cet élément est introuvable.'],
  CONFLICT: [409, 'Cette opération entre en conflit avec un traitement existant.'],
  QUOTA_EXHAUSTED: [429, 'Votre quota de vidéos est épuisé pour cette période.'],
  GENERATIONS_PAUSED: [503, 'La génération de vidéos est temporairement indisponible. Aucun crédit n’a été utilisé.'],
  GENERATION_BUSY: [409, 'Une vidéo est déjà en préparation. Retrouvez-la dans votre historique.'],
  GENERATION_BUDGET_LIMIT: [429, 'Le budget des générations de développement est atteint.'],
  GENERATION_FAILED: [422, 'La vidéo n’a pas pu être terminée. Votre crédit vidéo a été libéré.'],
  GENERATION_TIMEOUT: [422, 'La préparation a dépassé le délai autorisé. Votre crédit vidéo a été libéré.'],
  FEATURE_UNAVAILABLE: [503, 'Cette fonctionnalité est en cours de développement.'],
  INTERNAL_ERROR: [500, 'Une erreur est survenue. Réessayez plus tard.'],
} as const;
export type PublicErrorCode = keyof typeof publicErrors;

export function publicFailure(code: PublicErrorCode, requestId: string) {
  const [status, message] = publicErrors[code];
  return {status, body: {error: {code, message, requestId}}};
}

export function parseContract<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const explicit = result.error.issues.find(issue => issue.code === 'custom')?.message;
    // Ne jamais renvoyer l'entrée, un diagnostic SQL ou une stack au client.
    throw new Error(explicit ?? publicErrors.VALIDATION_ERROR[1]);
  }
  return result.data;
}
