import {z} from 'zod';
import {EntityId,Timestamp,Sha256} from './product';

const photo='/images/studio-home/paris.webp',movie='/videos/studio-home/paris.mp4';
export const homepageSlots=[
  {id:'hero.visual',group:'En haut de page',label:'Visuel principal',kind:'visual',src:photo},
  {id:'hero.video',group:'En haut de page',label:'Vidéo du bouton Lecture',kind:'video',src:movie},
  {id:'discover.paris.visual',group:'À découvrir sur BienVu',label:'Première inspiration · visuel',kind:'visual',src:photo},
  {id:'discover.paris.video',group:'À découvrir sur BienVu',label:'Première inspiration · vidéo',kind:'video',src:movie},
  {id:'discover.sud.visual',group:'À découvrir sur BienVu',label:'Deuxième inspiration · visuel',kind:'visual',src:'/images/studio-home/sud.webp'},
  {id:'discover.sud.video',group:'À découvrir sur BienVu',label:'Deuxième inspiration · vidéo',kind:'video',src:'/videos/studio-home/sud.mp4'},
  {id:'discover.lyon.visual',group:'À découvrir sur BienVu',label:'Troisième inspiration · visuel',kind:'visual',src:'/images/studio-home/lyon.webp'},
  {id:'discover.lyon.video',group:'À découvrir sur BienVu',label:'Troisième inspiration · vidéo',kind:'video',src:'/videos/studio-home/lyon.mp4'},
  {id:'discover.bordeaux.visual',group:'À découvrir sur BienVu',label:'Quatrième inspiration · visuel',kind:'visual',src:'/images/studio-home/bordeaux.webp'},
  {id:'discover.bordeaux.video',group:'À découvrir sur BienVu',label:'Quatrième inspiration · vidéo',kind:'video',src:'/videos/studio-home/bordeaux.mp4'},
  {id:'life.photo',group:'Vos photos prennent vie',label:'Photo de départ',kind:'image',src:photo},
  {id:'life.visual',group:'Vos photos prennent vie',label:'Couverture de la vidéo',kind:'visual',src:photo},
  {id:'life.video',group:'Vos photos prennent vie',label:'Vidéo de démonstration',kind:'video',src:movie},
  {id:'life.editor',group:'Vos photos prennent vie',label:'Fond de la démonstration de texte',kind:'visual',src:photo},
  {id:'kit.reel.visual',group:'Un mandat, sept contenus',label:'Reel Instagram · visuel',kind:'visual',src:photo},
  {id:'kit.reel.video',group:'Un mandat, sept contenus',label:'Reel Instagram · vidéo',kind:'video',src:movie},
  {id:'kit.story.visual',group:'Un mandat, sept contenus',label:'Story Instagram · visuel',kind:'visual',src:photo},
  {id:'kit.story.video',group:'Un mandat, sept contenus',label:'Story Instagram · vidéo',kind:'video',src:movie},
  {id:'kit.tiktok.visual',group:'Un mandat, sept contenus',label:'TikTok · visuel',kind:'visual',src:'/images/studio-home/lyon.webp'},
  {id:'kit.tiktok.video',group:'Un mandat, sept contenus',label:'TikTok · vidéo',kind:'video',src:'/videos/studio-home/lyon.mp4'},
  {id:'kit.landscape.visual',group:'Un mandat, sept contenus',label:'Vidéo horizontale · visuel',kind:'visual',src:photo},
  {id:'kit.landscape.video',group:'Un mandat, sept contenus',label:'Vidéo horizontale · vidéo',kind:'video',src:movie},
  {id:'kit.facebook.visual',group:'Un mandat, sept contenus',label:'Post Facebook · photo ou vidéo',kind:'visual',src:photo},
  {id:'kit.price.visual',group:'Un mandat, sept contenus',label:'Visuel prix / surface · photo ou vidéo',kind:'visual',src:photo},
  {id:'share.social.visual',group:'Plusieurs façons de la partager',label:'Réseaux sociaux · visuel',kind:'visual',src:photo},
  {id:'share.social.video',group:'Plusieurs façons de la partager',label:'Réseaux sociaux · vidéo',kind:'video',src:movie},
  {id:'share.client.visual',group:'Plusieurs façons de la partager',label:'Message client · visuel',kind:'visual',src:photo},
  {id:'share.client.video',group:'Plusieurs façons de la partager',label:'Message client · vidéo',kind:'video',src:movie},
  {id:'share.site.visual',group:'Plusieurs façons de la partager',label:'Site d’agence · visuel',kind:'visual',src:photo},
  {id:'share.site.video',group:'Plusieurs façons de la partager',label:'Site d’agence · vidéo',kind:'video',src:movie},
  {id:'editor.salon',group:'Démonstration de l’Éditeur',label:'Premier plan · séjour',kind:'visual',src:photo},
  {id:'editor.interieur',group:'Démonstration de l’Éditeur',label:'Deuxième plan · intérieur',kind:'visual',src:'/images/landing/interieur.webp'},
  {id:'editor.loft',group:'Démonstration de l’Éditeur',label:'Troisième plan · loft',kind:'visual',src:'/images/studio-home/lyon.webp'},
  {id:'editor.terrasse',group:'Démonstration de l’Éditeur',label:'Quatrième plan · terrasse',kind:'visual',src:'/images/studio-home/sud.webp'},
] as const;
export type HomepageSlot=typeof homepageSlots[number]['id'];
export const HomepageSlotId=z.enum(homepageSlots.map(slot=>slot.id));
export const HomepageSelections=z.partialRecord(HomepageSlotId,EntityId.nullable());
export type HomepageSelections=z.infer<typeof HomepageSelections>;
export const HomepageSource=z.object({kind:z.enum(['photo','video','animation','library']),id:EntityId}).strict();
export type HomepageSource=z.infer<typeof HomepageSource>;
export const HomepageQuery=z.object({kind:z.enum(['all','photo','video','animation']).default('all'),q:z.string().trim().max(120).default(''),
  agency:EntityId.optional(),cursor:z.string().max(2048).optional()}).strict();
export const HomepageAsset=z.object({id:EntityId,kind:z.enum(['image','video']),title:z.string().max(220),agency:z.string().max(200).nullable(),
  locality:z.string().max(200).nullable(),mime:z.enum(['image/jpeg','image/png','image/webp','video/mp4']),sha256:Sha256,
  sizeBytes:z.number().int().positive().max(256*1024*1024),durationMs:z.number().int().positive().nullable(),width:z.number().int().positive().nullable(),height:z.number().int().positive().nullable(),
  url:z.string(),posterUrl:z.string().nullable(),createdAt:Timestamp}).strict();
export type HomepageAsset=z.infer<typeof HomepageAsset>;
export type HomepageCandidate=HomepageAsset&{source:HomepageSource;available:boolean};
export type HomepageLibrary={items:HomepageCandidate[];nextCursor:string|null;total:number};
export type HomepageConfig={version:number;slots:Partial<Record<HomepageSlot,HomepageAsset>>};
export type HomepageAdmin={revision:number;publishedVersion:number;publishedAt:string|null;updatedAt:string;
  draft:HomepageSelections;published:HomepageSelections;assets:Record<string,HomepageAsset>;history:{action:string;createdAt:string}[]};
export const HomepageCommand=z.discriminatedUnion('action',[
  z.object({action:z.literal('assign'),revision:z.number().int().nonnegative(),slot:HomepageSlotId,source:HomepageSource.nullable(),requestId:z.uuid()}).strict(),
  z.object({action:z.literal('publish'),revision:z.number().int().nonnegative()}).strict(),
  z.object({action:z.literal('discard'),revision:z.number().int().nonnegative()}).strict(),
]);
