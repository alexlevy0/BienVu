import {z} from 'zod';

export const publicErrors = {
  INVALID_URL: [422, 'Le lien de l’annonce est invalide.'],
  UNSAFE_URL: [422, 'Ce lien ne peut pas être consulté en toute sécurité.'],
  SOURCE_BLOCKED: [422, 'Ce site refuse actuellement l’accès à cette annonce. Essayez un autre lien autorisé.'],
  SOURCE_UNAVAILABLE: [422, 'L’annonce est momentanément inaccessible.'],
  NOT_A_LISTING: [422, 'Ce lien ne permet pas d’identifier une annonce immobilière.'],
  INCOMPLETE_LISTING: [422, 'Les informations de l’annonce sont insuffisantes pour créer une vidéo.'],
  CONFLICTING_FACTS: [422, 'Des informations contradictoires empêchent la création de la vidéo.'],
  INSUFFICIENT_PHOTOS: [422, 'Au moins trois photos distinctes du bien sont nécessaires.'],
  IMPORT_TIMEOUT: [422, 'L’annonce met trop de temps à répondre. Réessayez plus tard.'],
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
