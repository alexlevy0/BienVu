import type {GenerationView,Me} from '@bienvu/contracts';

/** Only offer actions for a completed, retained video in the current account. */
export function videoResultActions(job:GenerationView,role:Me['role']|null,now=Date.now()){
 if(!role||job.ownership!=='owned'||job.status!=='ready'||!job.videoUrl||job.retention!=='available'||
   job.expiresAt!==null&&new Date(job.expiresAt).getTime()<=now)return null;
 const downloadUrl=job.masterAccess==='unlocked'?job.downloadUrl:null;
 return {downloadUrl,editorUrl:role==='viewer'?null:`/editeur?video=${encodeURIComponent(job.id)}`,canPublish:role!=='viewer'&&Boolean(downloadUrl)};
}
