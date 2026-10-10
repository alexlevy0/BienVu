import {VideoMap,GenerationRequest,NormalizedListing,automaticMapLocation,ConfirmedVideoMap} from '@bienvu/contracts';
import {findDefaultGenerationMap,findImport,type GenerationRow} from '@bienvu/db';
import {geocodeMap,prepareMapImage,MapFailure,type MapEnvironment} from '@bienvu/maps';

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
export async function prepareDefaultGenerationMap(env:MapEnvironment,row:GenerationRow,transport:typeof fetch=fetch){
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
    const location=automaticMapLocation(query,await geocodeMap(query,transport,true));
    if(location){map=ConfirmedVideoMap.parse({...policy,location});
      await prepareMapImage(env,location,input.aspectRatio??'9:16',transport,map.view,{zoomStart:map.zoomStart,zoomEnd:map.zoomEnd});reason=null;}
  }catch(cause){if(!(cause instanceof MapFailure))throw cause;map=null;reason='map_unavailable';}
  await env.DB.prepare('INSERT INTO generation_map_resolutions(job_id,agency_id,map_json,reason,created_at) VALUES(?,?,?,?,?) ON CONFLICT(job_id) DO NOTHING')
    .bind(row.jobId,row.agencyId,map?JSON.stringify(map):null,reason,new Date().toISOString()).run();
  return findDefaultGenerationMap(env.DB,row.agencyId,row.jobId);
}
