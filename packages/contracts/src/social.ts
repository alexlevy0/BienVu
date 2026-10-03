import {z} from 'zod';
import {EntityId, Timestamp} from './product';

export const SocialPlatform=z.enum(['instagram','facebook']);
export type SocialPlatform=z.infer<typeof SocialPlatform>;
export const SocialStatus=z.enum(['scheduled','processing','published','failed','uncertain','cancelled']);
export type SocialStatus=z.infer<typeof SocialStatus>;
export const SocialConnection=z.object({id:EntityId,platform:SocialPlatform,name:z.string(),username:z.string().nullable(),
  status:z.enum(['active','reconnect','disconnected']),expiresAt:Timestamp.nullable(),profileUrl:z.url().nullable()});
export type SocialConnection=z.infer<typeof SocialConnection>;
export const SocialTarget=z.object({id:EntityId,connectionId:EntityId.nullable(),platform:SocialPlatform,name:z.string(),
  status:SocialStatus,errorCode:z.string().nullable(),permalink:z.url().nullable(),publishedAt:Timestamp.nullable()});
export type SocialTarget=z.infer<typeof SocialTarget>;
export const SocialPublication=z.object({id:EntityId,jobId:EntityId,title:z.string(),caption:z.string(),scheduledAt:Timestamp,
  timezone:z.string(),createdAt:Timestamp,expiresAt:Timestamp,aspectRatio:z.enum(['9:16','16:9']),durationSeconds:z.number(),
  videoUrl:z.string(),targets:z.array(SocialTarget)});
export type SocialPublication=z.infer<typeof SocialPublication>;
export const SocialPublicationRequest=z.object({jobId:EntityId,connectionIds:z.array(EntityId).min(1).max(10),
  caption:z.string().trim().max(2200),scheduledAt:Timestamp.nullable(),timezone:z.string().min(1).max(80)}).strict()
  .refine(p=>new Set(p.connectionIds).size===p.connectionIds.length,'Un compte ne peut être sélectionné qu’une fois.');
export const socialStatusLabels:Record<SocialStatus,string>={scheduled:'Programmée',processing:'Publication en cours',
  published:'Publiée',failed:'Échec',uncertain:'À vérifier',cancelled:'Annulée'};
export const socialErrorMessages:Record<string,string>={
  SOCIAL_DISABLED:'La connexion aux réseaux sociaux sera disponible prochainement.',
  SOCIAL_RECONNECT:'Reconnectez ce compte dans Mon agence avant de publier.',
  SOCIAL_PERMISSIONS:'L’autorisation de publier manque. Reconnectez le compte en autorisant la publication.',
  SOCIAL_CONNECT_TEMPORARY:'Meta n’a pas terminé la connexion. Votre compte n’a pas encore été associé à BienVu. Cliquez sur Connecter pour réessayer.',
  SOCIAL_CONNECT_FAILED:'La connexion à Meta n’a pas pu être finalisée. Réessayez depuis BienVu. Si le problème persiste, contactez-nous.',
  SOCIAL_CONNECT_CONFIGURATION:'Meta a refusé cette demande de connexion. L’équipe BienVu doit vérifier les réglages de l’application avant un nouvel essai.',
  SOCIAL_CANCELLED:'L’autorisation de connexion n’a pas été accordée. Cliquez sur Connecter pour autoriser votre compte.',
  SOCIAL_NO_ACCOUNTS:'Meta n’a transmis aucune Page à BienVu. Vérifiez que votre Page est autorisée dans les réglages de l’intégration BienVu sur Facebook, puis reconnectez-vous.',
  SOCIAL_PAGE_ACCESS:'Votre Page a été trouvée, mais vos droits ne permettent pas d’y publier. Vérifiez votre accès à la création de contenu sur la Page avec le profil Facebook utilisé pour la connexion.',
  SOCIAL_INSTAGRAM_LINK:'Votre Page a été trouvée, mais aucun compte Instagram professionnel associé n’a été transmis à BienVu. Vérifiez la liaison et autorisez ce compte Instagram dans les réglages de l’intégration.',
  SOCIAL_STATE:'La connexion a expiré. Recommencez depuis Mon agence.',
  SOCIAL_MEDIA:'Le réseau n’a pas pu traiter cette vidéo. Vérifiez le fichier avant de réessayer.',
  SOCIAL_UNCERTAIN:'Le réseau n’a pas confirmé le résultat. Vérifiez votre compte avant de relancer pour éviter une double publication.',
  SOCIAL_TEMPORARY:'Le réseau est momentanément indisponible. Une reprise automatique est prévue.',
  SOCIAL_TIMEOUT:'Le réseau a mis trop de temps à préparer la vidéo. Vous pouvez réessayer.',
  SOCIAL_HORIZONTAL:'Les Reels Facebook nécessitent ici une vidéo verticale. Choisissez Instagram ou exportez en 9:16.',
  SOCIAL_EXPIRED:'Cette vidéo n’est plus disponible. Exportez-la à nouveau avant de publier.',
  SOCIAL_INVALID_DATE:'Choisissez une date entre deux minutes et trente jours à partir de maintenant.',
  SOCIAL_CONFLICT:'Cette publication a déjà démarré. Actualisez le calendrier.',
};
