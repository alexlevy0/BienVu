import {readShowcase,readShowcaseItems} from '@bienvu/db';
import {readPropertyGroups} from './properties';
import {showcasePath,showcaseAsset,type ShowcaseEnv} from './showcases';

export async function publicShowcaseSitemap(env:ShowcaseEnv){const rows=await env.DB.prepare("SELECT agency_id AS id FROM agency_showcases WHERE status='published' AND published_json IS NOT NULL ORDER BY agency_id LIMIT 1000").all<{id:string}>();
  const entries:{path:string;updatedAt:string;image?:string}[]=[];
  for(const agency of rows.results){const row=await readShowcase(env.DB,agency.id);if(!row?.published||row.status!=='published')continue;const config=row.published,[groups,items]=await Promise.all([readPropertyGroups(env,agency.id),readShowcaseItems(env.DB,agency.id)]),seen=new Set<string>();let firstImage:string|undefined;
    for(const item of items){const selected=item.published,group=groups.find(g=>g.summary.id===item.propertyId||g.aliases.includes(item.propertyId));if(item.removed||!selected||!group||group.summary.archived||seen.has(group.summary.id)||!config.keepSold&&['sold','rented'].includes(selected.settings.status))continue;
      const cover=selected.photos.find(p=>p.sourceHash===selected.settings.coverPhotoId)??selected.photos[0],asset=cover?await showcaseAsset(env,agency.id,cover.id):null;if(!asset||!await env.MEDIA.head(asset.objectKey))continue;seen.add(group.summary.id);
      const image=`/api/vitrines/${config.slug}/biens/${item.id}/media/${asset.id}`;firstImage??=image;entries.push({path:showcasePath(config.slug,item.id),updatedAt:group.summary.updatedAt,image});
    }
    const cover=config.coverAssetId?await showcaseAsset(env,agency.id,config.coverAssetId):null;entries.push({path:showcasePath(config.slug),updatedAt:row.updatedAt,image:cover&&await env.MEDIA.head(cover.objectKey)?`/api/vitrines/${config.slug}/media/${cover.id}`:firstImage});
  }return entries;}

export async function cleanupShowcases(env:ShowcaseEnv,now=Date.now()){
  const cutoff=new Date(now-86400000).toISOString(),assets=await env.DB.prepare(`SELECT a.id,a.agency_id AS agencyId,a.object_key AS objectKey FROM showcase_assets a WHERE a.created_at<?
    AND NOT EXISTS(SELECT 1 FROM agency_showcases s WHERE s.agency_id=a.agency_id AND a.id IN (json_extract(s.draft_json,'$.logoAssetId'),json_extract(s.draft_json,'$.coverAssetId'),json_extract(s.published_json,'$.logoAssetId'),json_extract(s.published_json,'$.coverAssetId')))
    AND NOT EXISTS(SELECT 1 FROM showcase_properties p,json_tree(p.draft_json) j WHERE p.agency_id=a.agency_id AND j.key='id' AND j.value=a.id)
    AND NOT EXISTS(SELECT 1 FROM showcase_properties p,json_tree(p.published_json) j WHERE p.agency_id=a.agency_id AND j.key='id' AND j.value=a.id)
    ORDER BY a.created_at LIMIT 50`).bind(cutoff).all<{id:string;agencyId:string;objectKey:string}>();
  for(const asset of assets.results){if(!asset.objectKey.startsWith(`agencies/${asset.agencyId}/showcase/`))continue;await env.MEDIA.delete(asset.objectKey);await env.DB.prepare('DELETE FROM showcase_assets WHERE id=? AND agency_id=?').bind(asset.id,asset.agencyId).run();}
  const piiCutoff=new Date(now-180*86400000).toISOString(),statsCutoff=new Date(now-90*86400000).toISOString().slice(0,10);
  await env.DB.batch([env.DB.prepare('DELETE FROM showcase_leads WHERE created_at<?').bind(piiCutoff),env.DB.prepare('DELETE FROM showcase_contact_intents WHERE created_at<?').bind(piiCutoff),
    env.DB.prepare('DELETE FROM showcase_daily WHERE day<?').bind(statsCutoff),env.DB.prepare('DELETE FROM showcase_event_keys WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM showcase_limits WHERE expires_at<?').bind(now)]);
  return{unusedAssetsRemoved:assets.results.length};
}

export function protectShowcaseResponse(request:Request,response:Response){const path=new URL(request.url).pathname;if(!path.startsWith('/agences/')&&!/^\/ma-vitrine(?:\/|$)/.test(path))return response;
  // Dynamic HTML, RSC, redirects and 404s all recheck publication. A stale CDN
  // response must never keep a removed storefront or authenticated preview live.
  const next=new Response(response.body,response);next.headers.set('Cache-Control','private, no-store, max-age=0');next.headers.set('CDN-Cache-Control','no-store');next.headers.set('Cloudflare-CDN-Cache-Control','no-store');
  if(path.startsWith('/ma-vitrine'))next.headers.set('X-Robots-Tag','noindex, nofollow');
  if(path==='/ma-vitrine/apercu'){next.headers.set('X-Frame-Options','SAMEORIGIN');next.headers.set('Content-Security-Policy',"frame-ancestors 'self'");}return next;}
