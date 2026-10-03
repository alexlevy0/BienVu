import {VideoAsset,EntityId,type NormalizedListing,selectedAnimationIndices,type VideoCustomization} from '@bienvu/contracts';
import type {Database} from './index';
import {retainedAnimationLibrarySql} from './retention';
export type AnimationReuse={libraryId:string;photoId:string;sha256:string;index:number};
export async function retainedAnimations(db:Database,agencyId:string,listing:Pick<NormalizedListing,'agencyId'|'photos'>,settings?:VideoCustomization,aspectRatio='9:16',now=Date.now()){
  EntityId.parse(agencyId);if(listing.agencyId!==agencyId)throw Error('ANIMATION_SCOPE_INVALID');
  const found:AnimationReuse[]=[];
  const order=settings?.photoOrder??listing.photos.map(p=>p.sourceOrder);
  for(const position of selectedAnimationIndices(order,settings)){
    const index=listing.photos.findIndex(p=>p.sourceOrder===order[position]);
    if(index<0)throw Error('INVALID_ANIMATION_SELECTION');
    const photo=listing.photos[index],row=await db.prepare(`SELECT id FROM animation_library l WHERE agency_id=? AND source_sha256=? AND aspect_ratio=? AND model='gen4_turbo' AND mode='real' AND state='available' AND (expires_at>? OR ${retainedAnimationLibrarySql})`)
      .bind(agencyId,photo.contentHash,aspectRatio,new Date(now).toISOString()).first<{id:string}>();
    if(row)found.push({libraryId:row.id,photoId:photo.id,sha256:photo.contentHash,index});
  }return found;
}
export async function retainedAnimation(db:Database,agencyId:string,id:string,allowExpired=false){
  EntityId.parse(agencyId);EntityId.parse(id);
  const row=await db.prepare(`SELECT asset_json AS asset,source_sha256 AS sha256,aspect_ratio AS aspectRatio FROM animation_library l WHERE agency_id=? AND id=? AND state='available' AND (?=1 OR expires_at>? OR ${retainedAnimationLibrarySql})`)
    .bind(agencyId,id,allowExpired?1:0,new Date().toISOString()).first<{asset:string;sha256:string;aspectRatio:string}>();
  if(!row)return null;const asset=VideoAsset.parse(JSON.parse(row.asset));
  if(!asset.objectKey.startsWith(`agencies/${agencyId}/imports/animation-library/`))throw Error('ANIMATION_SCOPE_INVALID');
  return {...row,asset};
}
