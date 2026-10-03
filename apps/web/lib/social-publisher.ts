import type {SocialPlatform} from '@bienvu/contracts';
import {MetaSocial,MetaFailure,type MetaFetcher} from './meta-social';
import {openSocial,socialConfigured,SocialFailure} from './social-crypto';
import {socialFetchUrl,socialEvent,type SocialEnv} from './social';

type Pending={id:string;post_id:string;connection_id:string|null;platform:SocialPlatform;status:string;stage:string;
  remote_id:string|null;upload_url:string|null;attempts:number;polls:number;final_started_at:string|null;
  caption:string;agency_id:string;expires_at:string;connection_status:string|null;token_cipher:string|null;
  connection_expiry:string|null;account_id:string|null;lease_token:string};
const iso=(now=Date.now())=>new Date(now).toISOString();
async function update(env:SocialEnv,row:Pending,assignments:string,values:(string|number|null)[]){
  const result=await env.DB.prepare(`UPDATE social_targets SET ${assignments},lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=? AND status='processing'`)
    .bind(...values,iso(),row.id,row.lease_token).run();
  return result.meta.changes===1;
}
async function finish(env:SocialEnv,row:Pending,status:'failed'|'uncertain',code:string){
  if(await update(env,row,"status=?,stage='done',error_code=?",[status,code]))await socialEvent(env,row.agency_id,row.post_id,status,null,row.id,code);
}
async function confirmed(env:SocialEnv,row:Pending,publishedId:string,token:string,api:MetaSocial){
  // L'identifiant et le succès sont persistés AVANT de chercher le permalien.
  if(!await update(env,row,"status='published',stage='done',remote_id=?,published_at=?,error_code=NULL,permalink=?",[publishedId,iso(),row.platform==='facebook'?`https://www.facebook.com/reel/${publishedId}`:null]))return;
  await socialEvent(env,row.agency_id,row.post_id,'published',null,row.id);
  try{const permalink=await api.permalink(row.platform,publishedId,token);if(permalink)await env.DB.prepare("UPDATE social_targets SET permalink=? WHERE id=? AND status='published' AND remote_id=?").bind(permalink,row.id,publishedId).run();}
  catch{/* Un manque de permalien ne transforme jamais une publication réussie en échec. */}
}
async function runTarget(env:SocialEnv,row:Pending,api:MetaSocial){
  try{
    if(row.expires_at<=iso())throw new SocialFailure('SOCIAL_EXPIRED');
    if(row.connection_status!=='active'||!row.token_cipher||!row.connection_id||!row.account_id||row.connection_expiry&&row.connection_expiry<=iso())throw new SocialFailure('SOCIAL_RECONNECT');
    const token=await openSocial<string>(row.token_cipher,env.SOCIAL_TOKEN_ENCRYPTION_KEY,`connection:${row.agency_id}:${row.connection_id}`);
    if(typeof token!=='string'||token.length<10||token.length>4096)throw new SocialFailure('SOCIAL_RECONNECT');
    if(row.stage==='publishing'){
      if(!row.remote_id){await finish(env,row,'uncertain','SOCIAL_UNCERTAIN');return;}
      const state=await api.status(row.platform,row.remote_id,token);
      if(state.published){
        if(row.platform==='facebook')await confirmed(env,row,row.remote_id,token,api);
        else await finish(env,row,'uncertain','SOCIAL_UNCERTAIN'); // Container publié, ID du média non reçu : vérification humaine.
      }else if(state.failed)await finish(env,row,'failed','SOCIAL_MEDIA');
      else if(row.final_started_at&&Date.parse(row.final_started_at)<Date.now()-30*60_000)await finish(env,row,'uncertain','SOCIAL_UNCERTAIN');
      else await update(env,row,'next_attempt_at=?,polls=polls+1',[iso(Date.now()+60000)]);
      return;
    }
    if(row.stage==='queued'||row.stage==='creating'){
      if(row.attempts>=6){await finish(env,row,'failed','SOCIAL_TEMPORARY');return;}
      // Une création interrompue produit seulement un conteneur privé, jamais une publication.
      const creating=await env.DB.prepare("UPDATE social_targets SET stage='creating',attempts=attempts+1 WHERE id=? AND lease_token=? AND status='processing'").bind(row.id,row.lease_token).run();
      if(creating.meta.changes!==1)return;
      const container=await api.create(row.platform,row.account_id,token,await socialFetchUrl(env,row.post_id),row.caption);
      await update(env,row,'remote_id=?,upload_url=?,stage=?,polls=0,next_attempt_at=?',[container.id,container.uploadUrl,row.platform==='facebook'?'uploading':'processing',iso()]);return;
    }
    if(!row.remote_id)throw new SocialFailure('SOCIAL_MEDIA');
    if(row.stage==='uploading'){
      // Si une réponse d'upload a été perdue, consulter l'ID connu avant une reprise.
      const state=await api.status(row.platform,row.remote_id,token);
      if(!state.ready){if(row.attempts>=6)throw new SocialFailure('SOCIAL_TIMEOUT');
        const increment=await env.DB.prepare("UPDATE social_targets SET attempts=attempts+1 WHERE id=? AND lease_token=? AND status='processing'").bind(row.id,row.lease_token).run();if(increment.meta.changes!==1)return;
        await api.upload(row.remote_id,token,row.upload_url!,await socialFetchUrl(env,row.post_id));}
      await update(env,row,"stage='processing',polls=0,next_attempt_at=?",[iso(Date.now()+15000)]);return;
    }
    const state=await api.status(row.platform,row.remote_id,token);
    if(state.published){if(row.platform==='facebook')await confirmed(env,row,row.remote_id,token,api);else await finish(env,row,'uncertain','SOCIAL_UNCERTAIN');return;}
    if(state.failed)throw new SocialFailure('SOCIAL_MEDIA');
    if(!state.ready){if(row.polls>=30)throw new SocialFailure('SOCIAL_TIMEOUT');
      await update(env,row,'polls=polls+1,next_attempt_at=?',[iso(Date.now()+60000)]);return;}
    // Point de non-retour persisté. Après une perte de réponse, on ne republie PAS.
    const intent=await env.DB.prepare("UPDATE social_targets SET stage='publishing',final_started_at=? WHERE id=? AND lease_token=? AND status='processing' AND EXISTS(SELECT 1 FROM social_connections WHERE id=? AND agency_id=? AND status='active' AND token_cipher=? AND (expires_at IS NULL OR expires_at>?))")
      .bind(iso(),row.id,row.lease_token,row.connection_id,row.agency_id,row.token_cipher,iso()).run();
    if(intent.meta.changes!==1)return;
    row.stage='publishing';row.final_started_at=iso();
    const id=await api.publish(row.platform,row.account_id,row.remote_id,token,row.caption);
    if(row.platform==='instagram'){await confirmed(env,row,id,token,api);}
    else await update(env,row,"stage='publishing',next_attempt_at=?",[iso(Date.now()+15000)]);
  }catch(error){
    const code=error instanceof SocialFailure?error.code:'SOCIAL_TEMPORARY';
    if(code==='SOCIAL_RECONNECT'||code==='SOCIAL_PERMISSIONS'){
      if(row.connection_id)await env.DB.prepare("UPDATE social_connections SET status='reconnect',token_cipher=NULL,updated_at=? WHERE id=? AND agency_id=?").bind(iso(),row.connection_id,row.agency_id).run();
    }
    if(row.stage==='publishing'){
      // Une erreur Graph explicite non transitoire prouve que l'appel a été refusé.
      if(error instanceof MetaFailure&&!error.retryable&&!error.uncertain)await finish(env,row,'failed',code);
      else if(code==='SOCIAL_RECONNECT'||code==='SOCIAL_PERMISSIONS'||code==='SOCIAL_EXPIRED'||row.final_started_at&&Date.parse(row.final_started_at)<Date.now()-30*60_000)await finish(env,row,'uncertain','SOCIAL_UNCERTAIN');
      else await update(env,row,"error_code='SOCIAL_UNCERTAIN',next_attempt_at=?",[iso(Date.now()+60000)]);
    }else if(error instanceof MetaFailure&&error.retryable&&row.attempts<6){
      await update(env,row,'error_code=?,next_attempt_at=?,attempts=attempts+1',[code,iso(Date.now()+Math.min(3600_000,60000*2**Math.min(row.attempts,5)))]);
    }else await finish(env,row,'failed',code);
    console.log(JSON.stringify({event:'social_publication_step',targetId:row.id,code}));
  }
}
export async function runSocialBatch(env:SocialEnv,fetcher:MetaFetcher=fetch){
  if(!socialConfigured(env))return;
  const at=iso(),rows=await env.DB.prepare(`SELECT t.id FROM social_targets t JOIN social_posts p ON p.id=t.post_id
    WHERE p.prepared=1 AND p.media_deleted_at IS NULL AND t.status IN ('scheduled','processing') AND t.next_attempt_at<=?
    AND (t.lease_until IS NULL OR t.lease_until<?) ORDER BY t.next_attempt_at,t.id LIMIT 10`).bind(at,at).all<{id:string}>();
  const api=new MetaSocial(env,fetcher);
  // Deux vagues bornées ; aucune attente de traitement de vidéo dans une requête HTTP.
  for(let start=0;start<rows.results.length;start+=5)await Promise.all(rows.results.slice(start,start+5).map(async ref=>{
    const lease=crypto.randomUUID(),claimed=await env.DB.prepare("UPDATE social_targets SET lease_token=?,lease_until=?,status='processing',updated_at=? WHERE id=? AND status IN ('scheduled','processing') AND next_attempt_at<=? AND (lease_until IS NULL OR lease_until<?) RETURNING id")
      .bind(lease,iso(Date.now()+180000),at,ref.id,at,at).first();
    if(!claimed)return;
    const row=await env.DB.prepare(`SELECT t.*,p.caption,p.agency_id,p.expires_at,c.status AS connection_status,c.token_cipher,
      c.expires_at AS connection_expiry,c.remote_id AS account_id FROM social_targets t JOIN social_posts p ON p.id=t.post_id
      LEFT JOIN social_connections c ON c.id=t.connection_id AND c.agency_id=p.agency_id WHERE t.id=? AND t.lease_token=? AND t.status='processing'`).bind(ref.id,lease).first<Pending>();
    if(row)await runTarget(env,row,api);
  }));
}
