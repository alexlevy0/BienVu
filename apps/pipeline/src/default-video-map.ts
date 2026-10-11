import {VideoMap,GenerationRequest,NormalizedListing,automaticMapLocation,ConfirmedVideoMap,mapPublicLocation} from '@bienvu/contracts';
import {findDefaultGenerationMap,findImport,findGenerationMapConfirmation,createGenerationMapConfirmation,expireGenerationMapConfirmation,type GenerationRow} from '@bienvu/db';
import {geocodeMapCandidates,prepareMapImage,MapFailure,type MapEnvironment} from '@bienvu/maps';

export class MapConfirmationRequired extends Error {
  constructor(readonly expiresAt:string){super('MAP_CONFIRMATION_REQUIRED');}
}

export async function prepareGenerationMap(env:MapEnvironment,row:GenerationRow,transport:typeof fetch=fetch){
  const input=GenerationRequest.parse(JSON.parse(row.input));
  if(input.customization?.map?.location){
    const map=ConfirmedVideoMap.parse(input.customization.map);
    await prepareMapImage(env,map.location,input.aspectRatio??'9:16',transport,map.view,{zoomStart:map.zoomStart,zoomEnd:map.zoomEnd});
    return map;
  }
  return prepareDefaultGenerationMap(env,row,transport);
}

// Geocoding and plate preparation happen before narration and paid animations.
// A missing/unavailable default is omitted once; retries keep the same decision.
export async function prepareDefaultGenerationMap(env:MapEnvironment,row:GenerationRow,transport:typeof fetch=fetch,now=Date.now()){
  if(!row.defaultMap)return null;
  const existing=await env.DB.prepare('SELECT job_id FROM generation_map_resolutions WHERE agency_id=? AND job_id=?')
    .bind(row.agencyId,row.jobId).first();
  if(existing)return findDefaultGenerationMap(env.DB,row.agencyId,row.jobId);
  const input=GenerationRequest.parse(JSON.parse(row.input)),policy=VideoMap.parse(JSON.parse(row.defaultMap));
  const imported=row.listingId?await findImport(env.DB,row.agencyId,row.listingId):null;
  const listing=imported?.result?NormalizedListing.parse(JSON.parse(imported.result)):null;
  if(!listing||listing.agencyId!==row.agencyId)throw Error('GENERATION_MAP_LISTING_MISSING');
  const query=listing.facts.locality.value?.trim();
  let map:ConfirmedVideoMap|null=null,reason:'location_missing'|'ambiguous_location'|'map_unavailable'|null=query?'ambiguous_location':'location_missing';
  if(query)try{
    let confirmation=await findGenerationMapConfirmation(env.DB,row.agencyId,row.jobId);
    if(confirmation?.state==='pending'&&confirmation.expiresAt<=new Date(now).toISOString())confirmation=await expireGenerationMapConfirmation(env.DB,row.agencyId,row.jobId,now);
    if(confirmation?.state==='pending')throw new MapConfirmationRequired(confirmation.expiresAt);
    const saved=confirmation;
    let location=saved?.state==='selected'?saved.options.find(c=>c.id===saved.selectedId)!.location:null;
    if(!confirmation){
      const candidates=await geocodeMapCandidates(query,transport,true);
      location=automaticMapLocation(query,candidates.map(c=>c.location));
      if(!location){
        const unique=[...new Map(candidates.filter(c=>c.location.sourceType==='municipality').map(c=>[`${c.location.latitude.toFixed(3)}:${c.location.longitude.toFixed(3)}`,c])).values()];
        if(unique.length){
          confirmation=await createGenerationMapConfirmation(env.DB,row,unique.map((c,i)=>({id:`city-${i}`,label:`${c.location.label} · ${c.postalCode??`${c.location.latitude.toFixed(3)}, ${c.location.longitude.toFixed(3)}`}`,location:mapPublicLocation(c.location)})),now);
          if(confirmation?.state==='pending')throw new MapConfirmationRequired(confirmation.expiresAt);
          const confirmed=confirmation;
          if(confirmed?.state==='selected')location=confirmed.options.find(c=>c.id===confirmed.selectedId)!.location;
        }
      }
    }
    if(location){map=ConfirmedVideoMap.parse({...policy,location});
      await prepareMapImage(env,location,input.aspectRatio??'9:16',transport,map.view,{zoomStart:map.zoomStart,zoomEnd:map.zoomEnd});reason=null;}
  }catch(cause){if(!(cause instanceof MapFailure))throw cause;map=null;reason='map_unavailable';}
  await env.DB.prepare('INSERT INTO generation_map_resolutions(job_id,agency_id,map_json,reason,created_at) VALUES(?,?,?,?,?) ON CONFLICT(job_id) DO NOTHING')
    .bind(row.jobId,row.agencyId,map?JSON.stringify(map):null,reason,new Date(now).toISOString()).run();
  return findDefaultGenerationMap(env.DB,row.agencyId,row.jobId);
}
