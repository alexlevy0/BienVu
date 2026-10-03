import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {ensureAgency,admitGeneration,creditBalance} from '../packages/db/src/index';
import {defaultVideoCustomization,GoogleVoiceConfig,SocialPublicationRequest} from '../packages/contracts/src/index';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {createPrivateImport} from '../apps/web/lib/imports';
import {fixtureImportTransport} from '../scripts/import-fixtures';
import {prepareJobNarration} from '../apps/pipeline/src/narration';
import {prepareJobVideo} from '../apps/pipeline/src/video-manifest';
import {videoReport} from '../fixtures/video';
import {sealSocial,openSocial,socialMediaSignature,verifySocialMediaSignature,randomSocialToken,socialHmac,verifyMetaSignedRequest,socialOAuthStartInput,socialOAuthReturn} from '../apps/web/lib/social-crypto';
import {MetaSocial,safeSocialPermalink} from '../apps/web/lib/meta-social';
import {socialFacebookPageId} from '../apps/web/lib/social-client';
import {startSocialOAuth,finishSocialOAuth,socialOAuthChoices,selectSocialConnections,socialConnections,createSocialPublication,
  socialPublication,socialOverview,socialVideo,socialFetchUrl,changeSocialPublication,socialScheduleDate,disconnectSocial,cleanupSocial,revokeMetaUser,type SocialEnv} from '../apps/web/lib/social';
import {runSocialBatch} from '../apps/web/lib/social-publisher';

const at=()=>new Date().toISOString();
function metaFixture(options:{loseInstagramResponse?:boolean;loseFacebookResponse?:boolean;facebookPermissionError?:boolean;untrustedUpload?:boolean;failCreating?:boolean}={}){
  const calls:string[]=[],published=new Set<string>(),uploaded=new Set<string>();
  const fetcher:typeof fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),body=new URLSearchParams(typeof init?.body==='string'?init.body:init?.body instanceof URLSearchParams?init.body:undefined);
    calls.push(`${init?.method??'GET'} ${url.pathname} ${body.get('upload_phase')??body.get('creation_id')??''}`);
    assert.ok(['graph.facebook.com','rupload.facebook.com'].includes(url.hostname));assert.equal(init?.redirect,'manual');
    const json=(value:unknown,code=200)=>Response.json(value,{status:code});
    if(url.pathname.endsWith('/oauth/access_token'))return json({access_token:'long-token-fixture-only',expires_in:60*86400});
    if(url.pathname.endsWith('/debug_token'))return json({data:{is_valid:true,app_id:'123456789',user_id:'12345',expires_at:Math.floor(Date.now()/1000)+60*86400,scopes:['pages_show_list','pages_read_engagement','pages_manage_posts','instagram_basic','instagram_content_publish']}});
    if(url.pathname.endsWith('/me/accounts'))return json({data:[{id:'1001',name:'Agence témoin',access_token:'page-token-fixture-only',tasks:['CREATE_CONTENT'],instagram_business_account:{id:'2001',username:'agence.test',name:'Agence témoin IG'}},{id:'1002',name:'Lecture uniquement',access_token:'readonly-token-fixture',tasks:['ANALYZE']}]});
    if(url.pathname.endsWith('/me')){const token=new Headers(init?.headers).get('Authorization');return json({id:token==='Bearer page-token-authorized-fixture'?'1005':token==='Bearer page-token-fixture-only'?'1001':'12345'});}
    if(url.pathname.endsWith('/2001/media'))return options.failCreating?json({error:{code:4}},429):json({id:'3001'});
    if(url.pathname.endsWith('/1001/video_reels')){
      if(options.facebookPermissionError)return json({error:{code:200}},403);
      if(body.get('upload_phase')==='start')return json({video_id:'4001',upload_url:options.untrustedUpload?'https://attacker.example/upload':'https://rupload.facebook.com/video-upload/v25.0/4001'});
      published.add('4001');if(options.loseFacebookResponse)throw Error('SIMULATED_RESPONSE_LOST');return json({success:true});
    }
    if(url.hostname==='rupload.facebook.com'){assert.ok(new Headers(init?.headers).get('file_url')?.includes('/api/social/media/'));uploaded.add('4001');return json({success:true});}
    if(url.pathname.endsWith('/2001/media_publish')){
      assert.equal(body.get('creation_id'),'3001');published.add('3001');
      if(options.loseInstagramResponse)throw Error('SIMULATED_RESPONSE_LOST');return json({id:'5001'});
    }
    if(url.pathname.endsWith('/3001'))return json({id:'3001',status_code:published.has('3001')?'PUBLISHED':'FINISHED'});
    if(url.pathname.endsWith('/4001')){
      if(url.searchParams.get('fields')==='permalink_url')return json({permalink_url:'https://www.facebook.com/reel/4001'});
      return json({id:'4001',status:{uploading_phase:{status:uploaded.has('4001')?'complete':'not_started'},publishing_phase:{status:published.has('4001')?'complete':'not_started'}}});
    }
    if(url.pathname.endsWith('/5001'))return json({permalink:'https://www.instagram.com/reel/fixture/'});
    throw Error(`UNEXPECTED_META_FIXTURE_PATH:${url.pathname}`);
  };
  return {fetcher,calls};
}
async function fixture(t:{after(fn:()=>Promise<void>):void}){
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-10-03',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const bindings=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>(),env:SocialEnv={...bindings,BETTER_AUTH_URL:'https://bienvu.example',SOCIAL_ENABLED:'true',META_APP_ID:'123456789',META_APP_SECRET:'fake-meta-secret-for-tests',META_GRAPH_VERSION:'v25.0',SOCIAL_TOKEN_ENCRYPTION_KEY:randomSocialToken()};
  const {DB,MEDIA}=env;await migrateNarrationProbe(DB);
  for(const id of ['social-user','social-foreign'])await DB.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind(id,'Recette',id+'@example.com',at(),at()).run();
  const agency=await ensureAgency(DB,{id:'social-user',email:'social@example.com'}),foreign=await ensureAgency(DB,{id:'social-foreign',email:'foreign@example.com'});
  await DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9500,0)').bind(at().slice(0,7)).run();await DB.exec('UPDATE generation_control SET enabled=1; UPDATE trial_policy SET free_enabled=1');
  const listing=await createPrivateImport(env,agency.id,'https://fixtures.bienvu.example/vente','social-listing-key-001',fixtureImportTransport());
  const job=await admitGeneration(DB,agency.id,'social-video-key-001',{listingId:listing.id,voiceEnabled:false,subtitlesEnabled:false,customization:{...defaultVideoCustomization(),narration:['Découvrez cet appartement à Lyon.','La visite se poursuit en images.','Retrouvez les informations du bien.','Contactez votre agence pour une visite.']}},'true');
  await DB.prepare("UPDATE jobs SET status='scripting',stage='scripting',listing_id=? WHERE id=?").bind(listing.id,job.jobId).run();
  await prepareJobNarration(env,agency.id,job.jobId,{mode:'mock',script:{model:'gpt-5.4-mini',plan:async()=>{throw Error('NO_OPENAI');}},voice:{config:GoogleVoiceConfig.parse({projectId:'fixture',voice:'fr-FR-Chirp3-HD-Aoede'}),synthesize:async()=>{throw Error('NO_TTS');}}});
  const prepared=await prepareJobVideo(env,agency.id,job.jobId),bytes=new Uint8Array([1,2,3,4,5,6,7,8]),report=videoReport(prepared.hash,prepared.manifest,bytes),key=`agencies/${agency.id}/jobs/${job.jobId}/video/output.mp4`;
  await MEDIA.put(key,bytes,{customMetadata:{sha256:report.sha256}});await DB.batch([DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(job.jobId,key,JSON.stringify(report),at()),DB.prepare("UPDATE jobs SET status='ready',lease_until=NULL WHERE id=?").bind(job.jobId)]);
  const meta=metaFixture(),started=await startSocialOAuth(env,agency.id,'social-user','owner'),state=new URL(started.url).searchParams.get('state')!;
  const grant=await finishSocialOAuth(env,agency.id,'social-user','owner',state,started.browser,'fixture-code',new MetaSocial(env,meta.fetcher));
  await selectSocialConnections(env,agency.id,'social-user','owner',{grantId:grant,ids:['facebook:1001','instagram:2001']});
  const connections=await socialConnections(env,agency.id);
  const body={jobId:job.jobId,connectionIds:connections.map(c=>c.id),caption:'Appartement à Lyon\n\n#Immobilier',scheduledAt:null,timezone:'Europe/Paris'};
  return {env,agency:agency.id,foreign:foreign.id,jobId:job.jobId,body,connections,bytes,key,meta};
}
async function pump(env:SocialEnv,fetcher:typeof fetch,cycles=7){for(let n=0;n<cycles;n++){
  await env.DB.prepare("UPDATE social_targets SET next_attempt_at=? WHERE status='processing'").bind(new Date(Date.now()-1000).toISOString()).run();
  await Promise.all([runSocialBatch(env,fetcher),runSocialBatch(env,fetcher)]);
}}
test('Réseaux : chiffrement lié à l’agence, URL vidéo signée et callback Meta authentique',async()=>{
  const key=randomSocialToken(),cipher=await sealSocial('secret-page-token',key,'connection:agency-a:one');
  assert.ok(!cipher.includes('secret-page-token'));assert.equal(await openSocial(cipher,key,'connection:agency-a:one'),'secret-page-token');
  await assert.rejects(openSocial(cipher,key,'connection:agency-b:one'));await assert.rejects(openSocial(cipher,randomSocialToken(),'connection:agency-a:one'));
  const expires=Math.floor(Date.now()/1000)+3600,signature=await socialMediaSignature(key,'post-a',expires);
  assert.equal(await verifySocialMediaSignature(key,'post-a',expires,signature),true);assert.equal(await verifySocialMediaSignature(key,'post-b',expires,signature),false);assert.equal(await verifySocialMediaSignature(key,'post-a',expires,signature,Date.now()+7200000),false);
  const payload=Buffer.from(JSON.stringify({algorithm:'HMAC-SHA256',user_id:'12345',issued_at:Math.floor(Date.now()/1000)})).toString('base64url'),signed=Buffer.from(await socialHmac('meta-secret',payload)).toString('base64url')+'.'+payload;
  assert.equal(await verifyMetaSignedRequest(signed,'meta-secret'),'12345');await assert.rejects(verifyMetaSignedRequest(signed,'wrong-secret'));
  assert.equal(safeSocialPermalink('instagram','https://www.instagram.com/reel/demo/'),'https://www.instagram.com/reel/demo/');assert.equal(safeSocialPermalink('instagram','https://www.instagram.com.evil.example/test'),null);
  assert.equal(safeSocialPermalink('facebook','https://attacker@example.com/test'),null);
  assert.throws(()=>socialScheduleDate(new Date(Date.now()-1000).toISOString(),'Europe/Paris'));assert.throws(()=>socialScheduleDate(new Date(Date.now()+31*86400000).toISOString(),'Europe/Paris'));assert.throws(()=>socialScheduleDate(null,'Wrong/Fuseau'));
  assert.equal(SocialPublicationRequest.safeParse({jobId:'job-a',connectionIds:['account-a','account-a'],caption:'',scheduledAt:null,timezone:'UTC'}).success,false);
});
test('OAuth : état à usage unique, navigateur et agence vérifiés, choix explicite, jetons absents des réponses',async t=>{
  const f=await fixture(t),started=await startSocialOAuth(f.env,f.agency,'social-user','owner'),state=new URL(started.url).searchParams.get('state')!;
  await assert.rejects(startSocialOAuth(f.env,f.agency,'social-user','editor'),/FORBIDDEN/);
  await assert.rejects(finishSocialOAuth(f.env,f.foreign,'social-user','owner',state,started.browser,'code',new MetaSocial(f.env,f.meta.fetcher)),/SOCIAL_STATE/);
  await assert.rejects(finishSocialOAuth(f.env,f.agency,'social-user','owner',state,randomSocialToken(),'code',new MetaSocial(f.env,f.meta.fetcher)),/SOCIAL_STATE/);
  const grant=await finishSocialOAuth(f.env,f.agency,'social-user','owner',state,started.browser,'code',new MetaSocial(f.env,f.meta.fetcher));
  await assert.rejects(finishSocialOAuth(f.env,f.agency,'social-user','owner',state,started.browser,'code',new MetaSocial(f.env,f.meta.fetcher)),/SOCIAL_STATE/);
  const choices=await socialOAuthChoices(f.env,f.agency,'social-user','owner',grant);assert.equal(choices.length,2);assert.ok(!JSON.stringify(choices).includes('token'));
  await assert.rejects(socialOAuthChoices(f.env,f.foreign,'social-user','owner',grant));
  await selectSocialConnections(f.env,f.agency,'social-user','owner',{grantId:grant,ids:['instagram:2001']});await assert.rejects(selectSocialConnections(f.env,f.agency,'social-user','owner',{grantId:grant,ids:['facebook:1001']}));
  const serialized=JSON.stringify(await socialConnections(f.env,f.agency));assert.ok(!serialized.includes('page-token'));assert.ok(!serialized.includes('cipher'));assert.equal((await socialConnections(f.env,f.foreign)).length,0);
});
test('OAuth : erreurs fournisseur distinctes, état contrôlé avant diagnostic et aucune fuite du retour Meta',async t=>{
  const f=await fixture(t),events:Record<string,unknown>[]=[];
  t.mock.method(console,'warn',(message:unknown)=>events.push(JSON.parse(String(message))));
  t.mock.method(console,'info',(message:unknown)=>events.push(JSON.parse(String(message))));
  const secret='private-provider-oauth-code',url='https://provider.example/?access_token=private-provider-token';
  const cases:Array<{params:Record<string,string>;failure:string}>=[
    {params:{error:'access_denied',error_reason:'user_denied',error_code:'200'},failure:'SOCIAL_CANCELLED'},
    {params:{error:'server_error'},failure:'SOCIAL_CONNECT_TEMPORARY'},
    {params:{error:'temporarily_unavailable'},failure:'SOCIAL_CONNECT_TEMPORARY'},
    {params:{error:'invalid_scope'},failure:'SOCIAL_CONNECT_CONFIGURATION'},
    {params:{error:'unauthorized_client'},failure:'SOCIAL_CONNECT_CONFIGURATION'},
    {params:{error:secret,error_reason:url,error_code:'190'},failure:'SOCIAL_CONNECT_FAILED'},
    {params:{error_code:'190'},failure:'SOCIAL_CONNECT_FAILED'},
    {params:{},failure:'SOCIAL_CONNECT_FAILED'},
  ];
  for(const [index,item] of cases.entries()){
    const started=await startSocialOAuth(f.env,f.agency,'social-user','owner'),state=new URL(started.url).searchParams.get('state')!;
    const params=new URLSearchParams({...item.params,error_description:`${secret} ${url}`});
    if(index!==cases.length-1)params.set('code',secret);
    const outcome=socialOAuthReturn(params),calls=f.meta.calls.length,prior=events.length;
    await assert.rejects(finishSocialOAuth(f.env,f.agency,'social-user','owner',state,randomSocialToken(),outcome,new MetaSocial(f.env,f.meta.fetcher)),{message:'SOCIAL_STATE'});
    assert.equal(events.length,prior,'Une tentative étrangère ne journalise pas son retour fournisseur');
    await assert.rejects(finishSocialOAuth(f.env,f.agency,'social-user','owner',state,started.browser,outcome,new MetaSocial(f.env,f.meta.fetcher)),{message:item.failure});
    assert.equal(f.meta.calls.length,calls,'Un retour en erreur ne doit pas échanger le code ni rechercher de compte');
    assert.equal(events.at(-1)?.event,'social_oauth_provider_failed');assert.equal(events.at(-1)?.code,item.failure);
    await assert.rejects(finishSocialOAuth(f.env,f.agency,'social-user','owner',state,started.browser,secret,new MetaSocial(f.env,f.meta.fetcher)),{message:'SOCIAL_STATE'});
  }
  for(const key of ['code','error','error_reason','error_code']){
    const params=new URLSearchParams({code:secret});params.append(key,'server_error');params.append(key,'invalid_scope');
    const outcome=socialOAuthReturn(params);assert.notEqual(typeof outcome,'string');
    assert.equal(typeof outcome==='object'&&outcome.providerError,'malformed_response');
  }
  assert.equal(socialOAuthReturn(new URLSearchParams({code:secret})),secret);
  const diagnostic=JSON.stringify(events);assert.ok(!diagnostic.includes(secret));assert.ok(!diagnostic.includes(url));assert.ok(!diagnostic.includes('private-provider-token'));assert.ok(!diagnostic.includes('error_description'));
  assert.ok(events.some(event=>event.metaCode===190));assert.ok(events.some(event=>event.providerError==='other'&&event.providerReason==='other'));
});
test('OAuth Business : configuration Meta utilisée sans mélanger les permissions du parcours classique',async t=>{
  const f=await fixture(t),env={...f.env,META_LOGIN_CONFIG_ID:'9876543210'};
  const started=await startSocialOAuth(env,f.agency,'social-user','owner','1001'),url=new URL(started.url);
  assert.equal(url.origin,'https://www.facebook.com');assert.equal(url.pathname,'/v25.0/dialog/oauth');
  assert.equal(url.searchParams.get('config_id'),env.META_LOGIN_CONFIG_ID);assert.equal(url.searchParams.get('client_id'),env.META_APP_ID);
  assert.equal(url.searchParams.get('redirect_uri'),'https://bienvu.example/api/social/oauth/callback');assert.equal(url.searchParams.get('response_type'),'code');
  assert.equal(url.searchParams.has('scope'),false);assert.equal(url.searchParams.has('auth_type'),false);assert.equal(url.searchParams.has('pageId'),false);
  assert.match(url.searchParams.get('state')!,/^[A-Za-z0-9_-]{43}$/);assert.ok(started.pageHint&&!started.pageHint.includes('1001'));
  const grant=await finishSocialOAuth(env,f.agency,'social-user','owner',url.searchParams.get('state')!,started.browser,'fixture-code',new MetaSocial(env,f.meta.fetcher),started.pageHint);
  assert.equal((await socialOAuthChoices(env,f.agency,'social-user','owner',grant)).length,2);
  assert.equal((await socialConnections(env,f.agency)).length,f.connections.length,'Le parcours Business conserve la sélection explicite des comptes');
  const fallback=await startSocialOAuth(env,f.agency,'social-user','owner','1001','facebook'),facebook=new URL(fallback.url);
  assert.equal(facebook.searchParams.has('config_id'),false);assert.equal(facebook.searchParams.get('auth_type'),'rerequest');
  assert.deepEqual(facebook.searchParams.get('scope')!.split(',').sort(),['pages_show_list','pages_read_engagement','pages_manage_posts','instagram_basic','instagram_content_publish'].sort());
  assert.equal(facebook.searchParams.get('redirect_uri'),url.searchParams.get('redirect_uri'));assert.notEqual(facebook.searchParams.get('state'),url.searchParams.get('state'));
  await assert.rejects(finishSocialOAuth(env,f.agency,'social-user','owner',facebook.searchParams.get('state')!,started.browser,'fixture-code',new MetaSocial(env,f.meta.fetcher),fallback.pageHint),{message:'SOCIAL_STATE'});
  const fallbackGrant=await finishSocialOAuth(env,f.agency,'social-user','owner',facebook.searchParams.get('state')!,fallback.browser,'fixture-code',new MetaSocial(env,f.meta.fetcher),fallback.pageHint);
  assert.equal((await socialOAuthChoices(env,f.agency,'social-user','owner',fallbackGrant)).length,2);
  assert.equal((await socialConnections(env,f.agency)).length,f.connections.length,'La connexion alternative ne connecte pas les comptes automatiquement');
});
test('Meta dans workerd : connexion et publication compatibles avec le runtime déployé, redirections refusées',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'bienvu-meta-runtime-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const require=createRequire(import.meta.url),wrangler=createRequire(require.resolve('wrangler/package.json'));
  const esbuild=await import(pathToFileURL(wrangler.resolve('esbuild')).href),entry=path.join(directory,'fixture.ts'),out=path.join(directory,'worker.mjs');
  await writeFile(entry,`import {MetaSocial} from ${JSON.stringify(path.resolve('apps/web/lib/meta-social.ts'))};
    import {socialOAuthStartInput} from ${JSON.stringify(path.resolve('apps/web/lib/social-crypto.ts'))};
    export default {async fetch(request,env){const api=new MetaSocial(env);try{
      if(new URL(request.url).pathname==='/start-input')return Response.json(await socialOAuthStartInput(request));
      if(['/connect','/connect-direct'].includes(new URL(request.url).pathname)){const choices=await api.exchange('fixture-code','https://bienvu.example/api/social/oauth/callback',new URL(request.url).pathname==='/connect-direct'?'1005':undefined);return Response.json({choices:choices.map(({id,platform})=>({id,platform}))});}
      const ig=await api.create('instagram','2001','page-token-fixture-only','https://bienvu.example/api/social/media/fixture','Légende');
      await api.status('instagram',ig.id,'page-token-fixture-only');await api.publish('instagram','2001',ig.id,'page-token-fixture-only','Légende');
      const fb=await api.create('facebook','1001','page-token-fixture-only','https://bienvu.example/api/social/media/fixture','Légende');
      await api.upload(fb.id,'page-token-fixture-only',fb.uploadUrl,'https://bienvu.example/api/social/media/fixture');
      await api.publish('facebook','1001',fb.id,'page-token-fixture-only','Légende');return Response.json({published:true});
    }catch(error){return Response.json({code:error.code},{status:502});}}};`);
  await esbuild.build({entryPoints:[entry],outfile:out,bundle:true,platform:'neutral',mainFields:['module','main'],format:'esm',target:'es2022',external:['cloudflare:*','node:*'],conditions:['workerd','worker','browser']});
  const meta=metaFixture();let redirect=false,redirectCalls=0;
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(out,'utf8'),compatibilityDate:'2026-09-27',compatibilityFlags:['nodejs_compat'],
    bindings:{META_APP_ID:'123456789',META_APP_SECRET:'fake-meta-secret-for-tests',META_GRAPH_VERSION:'v25.0'},outboundService:async request=>{
      assert.ok(['graph.facebook.com','rupload.facebook.com'].includes(new URL(request.url).hostname),'Les jetons restent sur les hôtes Meta autorisés');
      if(redirect){redirectCalls++;return new Response(null,{status:302,headers:{Location:'https://attacker.example/steal-token'}});}
      if(new URL(request.url).pathname.endsWith('/1005'))return Response.json({id:'1005',name:'Page directe',access_token:'page-token-authorized-fixture',can_post:false,instagram_business_account:{id:'2005'}});
      return meta.fetcher(request.url,{method:request.method,headers:Object.fromEntries(request.headers.entries()),body:request.method==='POST'?await request.text():undefined,redirect:'manual'});
    }}));t.after(()=>mf.dispose());
  const emptyStart=await mf.dispatchFetch('https://runtime.invalid/start-input',{method:'POST'});assert.equal(emptyStart.status,200);assert.deepEqual(await emptyStart.json(),{});
  const pageStart=await mf.dispatchFetch('https://runtime.invalid/start-input',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageId:'1005'})});assert.equal(pageStart.status,200);assert.deepEqual(await pageStart.json(),{pageId:'1005'});
  const facebookStart=await mf.dispatchFetch('https://runtime.invalid/start-input',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageId:'1005',flow:'facebook'})});assert.equal(facebookStart.status,200);assert.deepEqual(await facebookStart.json(),{pageId:'1005',flow:'facebook'});
  const connection=await mf.dispatchFetch('https://runtime.invalid/connect');assert.equal(connection.status,200);assert.deepEqual(await connection.json(),{choices:[{id:'facebook:1001',platform:'facebook'},{id:'instagram:2001',platform:'instagram'}]});
  const direct=await mf.dispatchFetch('https://runtime.invalid/connect-direct');assert.equal(direct.status,200);assert.deepEqual(await direct.json(),{choices:[{id:'facebook:1001',platform:'facebook'},{id:'instagram:2001',platform:'instagram'},{id:'facebook:1005',platform:'facebook'},{id:'instagram:2005',platform:'instagram'}]});
  const publication=await mf.dispatchFetch('https://runtime.invalid/publish');assert.equal(publication.status,200);assert.deepEqual(await publication.json(),{published:true});
  assert.equal(meta.calls.filter(call=>call.includes('video-upload')).length,1);assert.equal(meta.calls.filter(call=>call.includes('media_publish')).length,1);
  redirect=true;const blocked=await mf.dispatchFetch('https://runtime.invalid/connect');assert.equal(blocked.status,502);assert.deepEqual(await blocked.json(),{code:'SOCIAL_CONNECT_FAILED'});assert.equal(redirectCalls,1);
});
test('OAuth : reprise des lectures temporaires, code à usage unique et champs Instagram facultatifs',async t=>{
  const f=await fixture(t),base=metaFixture();let extensions=0,reads=0,codes=0;
  const fetcher:typeof fetch=async(input,init)=>{const url=new URL(String(input));
    if(url.pathname.endsWith('/oauth/access_token')){if(url.searchParams.has('code'))codes++;
      else if(++extensions===1)return Response.json({error:{code:2,is_transient:true}},{status:503});}
    if(url.pathname.endsWith('/me/accounts')){if(++reads===1)throw new TypeError('Temporary test transport failure');
      const response=await base.fetcher(input,init),json=await response.json() as {data:Record<string,unknown>[]};json.data.push({id:'1003',name:'Sans Instagram',access_token:'page-token-other-fixture',tasks:['CREATE_CONTENT'],instagram_business_account:null});return Response.json(json);}
    return base.fetcher(input,init);
  };
  const choices=await new MetaSocial(f.env,fetcher).exchange('fixture-code','https://bienvu.example/api/social/oauth/callback');
  assert.deepEqual(choices.map(c=>c.id),['facebook:1001','instagram:2001','facebook:1003']);assert.equal(codes,1);assert.equal(extensions,2);assert.equal(reads,2);
  let failedCodes=0;await assert.rejects(new MetaSocial(f.env,async()=>{failedCodes++;throw new TypeError('Lost response containing secrets must not be logged');}).exchange('fixture-code','https://bienvu.example/api/social/oauth/callback'),/SOCIAL_CONNECT_TEMPORARY/);assert.equal(failedCodes,1);
});
test('OAuth : droits de gestion des nouvelles Pages et accès en lecture seule',async()=>{
  const env={BETTER_AUTH_URL:'https://bienvu.example',META_APP_ID:'123456789',META_APP_SECRET:'fake-meta-secret-for-tests'},base=metaFixture();
  const fetcher:typeof fetch=async(input,init)=>{const response=await base.fetcher(input,init),url=new URL(String(input));
    if(!url.pathname.endsWith('/me/accounts'))return response;
    const json=await response.json() as {data:Record<string,unknown>[]};json.data[0]!.tasks=['PROFILE_PLUS_MANAGE'];
    json.data[1]!.tasks=['PROFILE_PLUS_ANALYZE','PROFILE_PLUS_MANAGE_LEADS'];return Response.json(json);
  };
  const choices=await new MetaSocial(env,fetcher).exchange('fixture-code','https://bienvu.example/api/social/oauth/callback');
  assert.deepEqual(choices.map(c=>c.id),['facebook:1001','instagram:2001']);
});
test('OAuth : diagnostic distinct des Pages absentes, droits insuffisants et liaison Instagram absente',async t=>{
  const env={BETTER_AUTH_URL:'https://bienvu.example',META_APP_ID:'123456789',META_APP_SECRET:'fake-meta-secret-for-tests'},logs:string[]=[];
  t.mock.method(console,'warn',(value:string)=>logs.push(value));
  for(const scenario of ['no-pages','readonly','unlinked'] as const){const base=metaFixture();
    const fetcher:typeof fetch=async(input,init)=>{const response=await base.fetcher(input,init),json=await response.json() as {data:Record<string,unknown>|Record<string,unknown>[]},url=new URL(String(input));
      if(scenario==='unlinked'&&url.pathname.endsWith('/debug_token'))(json.data as Record<string,unknown>).scopes=['pages_show_list','pages_read_engagement','instagram_basic','instagram_content_publish'];
      if(url.pathname.endsWith('/me/accounts'))json.data=scenario==='no-pages'?[]:[{id:'1001',name:'Private Page name',access_token:'secret-private-page-token',tasks:scenario==='readonly'?['ANALYZE']:['CREATE_CONTENT'],instagram_business_account:null}];
      return Response.json(json);
    };
    const code=scenario==='no-pages'?'SOCIAL_NO_ACCOUNTS':scenario==='readonly'?'SOCIAL_PAGE_ACCESS':'SOCIAL_INSTAGRAM_LINK';
    await assert.rejects(new MetaSocial(env,fetcher).exchange('private-oauth-code','https://bienvu.example/api/social/oauth/callback'),{message:code});
    const diagnostic=JSON.parse(logs.at(-1)!);assert.equal(diagnostic.event,'social_oauth_accounts_empty');assert.equal(diagnostic.code,code);
    assert.equal(diagnostic.pagesReturned,scenario==='no-pages'?0:1);assert.equal(diagnostic.pagesWithPublishingAccess,scenario==='unlinked'?1:0);assert.equal(diagnostic.linkedInstagramAccounts,0);
  }
  const serialized=logs.join('\n');for(const privateValue of ['1001','Private Page name','secret-private-page-token','private-oauth-code','fake-meta-secret-for-tests'])assert.ok(!serialized.includes(privateValue));
});
test('OAuth : récupérer une Page explicitement autorisée mais absente de la liste Meta',async()=>{
  const env={BETTER_AUTH_URL:'https://bienvu.example',META_APP_ID:'123456789',META_APP_SECRET:'fake-meta-secret-for-tests'},base=metaFixture(),pageReads:string[]=[];
  const fetcher:typeof fetch=async(input,init)=>{const url=new URL(String(input));
    if(url.pathname.endsWith('/1005')){pageReads.push(url.pathname);assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer long-token-fixture-only');assert.equal(url.searchParams.get('fields')?.includes('can_post'),false);
      return Response.json({id:'1005',name:'Agence autorisée',access_token:'page-token-authorized-fixture',instagram_business_account:{id:'2005',username:'agence.test'}});}
    const response=await base.fetcher(input,init),json=await response.json() as {data:Record<string,unknown>|unknown[]};
    if(url.pathname.endsWith('/debug_token'))(json.data as Record<string,unknown>).granular_scopes=[{scope:'pages_show_list',target_ids:['1005']},{scope:'pages_read_engagement',target_ids:['1005']},{scope:'instagram_basic',target_ids:['2999']}];
    if(url.pathname.endsWith('/me/accounts'))json.data=[];return Response.json(json);
  };
  const choices=await new MetaSocial(env,fetcher).exchange('fixture-code','https://bienvu.example/api/social/oauth/callback');
  assert.deepEqual(choices.map(c=>c.id),['facebook:1005','instagram:2005']);assert.deepEqual(pageReads,['/v25.0/1005']);
});
test('OAuth : la découverte directe reste bornée et refuse les Pages en lecture seule',async t=>{
  const env={BETTER_AUTH_URL:'https://bienvu.example',META_APP_ID:'123456789',META_APP_SECRET:'fake-meta-secret-for-tests'},base=metaFixture(),reads:string[]=[];
  t.mock.method(console,'warn',()=>{});
  const fetcher:typeof fetch=async(input,init)=>{const url=new URL(String(input));
    if(url.pathname.endsWith('/me'))return Response.json({id:new Headers(init?.headers).get('Authorization')!.split('-').at(-1)});
    if(/^\/v25\.0\/1\d{3}$/.test(url.pathname)){const id=url.pathname.split('/').at(-1)!;reads.push(id);return Response.json({id,name:'Lecture uniquement',access_token:`readonly-token-fixture-${id}`,tasks:['ANALYZE'],can_post:true,instagram_business_account:{id:'2005'}});}
    const response=await base.fetcher(input,init),json=await response.json() as {data:Record<string,unknown>|unknown[]};
    if(url.pathname.endsWith('/debug_token'))(json.data as Record<string,unknown>).granular_scopes=[{scope:'pages_show_list',target_ids:Array.from({length:25},(_,i)=>String(1100+i))}];
    if(url.pathname.endsWith('/me/accounts'))json.data=[];return Response.json(json);
  };
  await assert.rejects(new MetaSocial(env,fetcher).exchange('fixture-code','https://bienvu.example/api/social/oauth/callback'),{message:'SOCIAL_PAGE_ACCESS'});
  assert.equal(reads.length,10);assert.equal(new Set(reads).size,10);
});
test('OAuth direct : can_post ne remplace pas le jeton de Page, l’identité et les permissions Meta',async t=>{
  const env={BETTER_AUTH_URL:'https://bienvu.example',META_APP_ID:'123456789',META_APP_SECRET:'fake-meta-secret-for-tests'};
  t.mock.method(console,'warn',()=>{});
  for(const scenario of ['can-post-false','wrong-token','wrong-identity','missing-permissions'] as const){const base=metaFixture();
    const fetcher:typeof fetch=async(input,init)=>{const url=new URL(String(input));
      if(url.pathname.endsWith('/me/accounts'))return Response.json({data:[]});
      if(url.pathname.endsWith('/1005'))return Response.json({id:'1005',name:'Page autorisée',access_token:scenario==='wrong-token'?'long-token-fixture-only':'page-token-authorized-fixture',can_post:false,instagram_business_account:{id:'2005'}});
      if(url.pathname.endsWith('/me')){assert.equal(url.searchParams.get('fields'),'id');
        if(scenario==='wrong-identity')return Response.json({id:'1006'});
        return base.fetcher(input,init);}
      const response=await base.fetcher(input,init);
      if(scenario==='missing-permissions'&&url.pathname.endsWith('/debug_token')){const json=await response.json() as {data:{scopes:string[]}};json.data.scopes=['pages_show_list','pages_read_engagement'];return Response.json(json);}
      return response;
    },exchange=new MetaSocial(env,fetcher).exchange('fixture-code','https://bienvu.example/api/social/oauth/callback','1005');
    if(scenario==='can-post-false')assert.deepEqual((await exchange).map(c=>c.id),['facebook:1005','instagram:2005']);
    else await assert.rejects(exchange,{message:'SOCIAL_PERMISSIONS'});
  }
});
test('OAuth : métadonnées de cibles invalides ignorées, réponse de Page incohérente refusée',async t=>{
  const env={BETTER_AUTH_URL:'https://bienvu.example',META_APP_ID:'123456789',META_APP_SECRET:'fake-meta-secret-for-tests'},base=metaFixture();let reads=0;
  t.mock.method(console,'warn',()=>{});
  for(const invalid of [true,false]){
    const fetcher:typeof fetch=async(input,init)=>{const url=new URL(String(input));
      if(url.pathname.endsWith('/1005')){reads++;return Response.json({id:'1006',name:'Wrong Page',access_token:'page-token-fixture-only',can_post:true});}
      const response=await base.fetcher(input,init),json=await response.json() as {data:Record<string,unknown>|unknown[]};
      if(url.pathname.endsWith('/debug_token'))(json.data as Record<string,unknown>).granular_scopes=[{scope:'pages_show_list',target_ids:invalid?['https://attacker.example']:['1005']}];
      if(url.pathname.endsWith('/me/accounts'))json.data=[];return Response.json(json);
    };
    await assert.rejects(new MetaSocial(env,fetcher).exchange('fixture-code','https://bienvu.example/api/social/oauth/callback'),{message:invalid?'SOCIAL_NO_ACCOUNTS':'SOCIAL_PERMISSIONS'});
    assert.equal(reads,invalid?0:1);
  }
});
test('OAuth : une Page indiquée retrouve son Instagram même sans liste ni cibles de permissions',async t=>{
  const env={BETTER_AUTH_URL:'https://bienvu.example',META_APP_ID:'123456789',META_APP_SECRET:'fake-meta-secret-for-tests'},base=metaFixture(),reads:string[]=[];
  t.mock.method(console,'warn',()=>{});let denied=false;
  const fetcher:typeof fetch=async(input,init)=>{const url=new URL(String(input));
    if(url.pathname.endsWith('/1005')){reads.push(url.pathname);assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer long-token-fixture-only');
      return denied?Response.json({error:{code:200}},{status:403}):Response.json({id:'1005',name:'Page indiquée',access_token:'page-token-authorized-fixture',can_post:true,instagram_business_account:{id:'2005',username:'agence.directe'}});}
    const response=await base.fetcher(input,init);if(url.pathname.endsWith('/me/accounts'))return Response.json({data:[]});return response;
  };
  const choices=await new MetaSocial(env,fetcher).exchange('fixture-code','https://bienvu.example/api/social/oauth/callback','1005');
  assert.deepEqual(choices.map(c=>c.id),['facebook:1005','instagram:2005']);assert.deepEqual(reads,['/v25.0/1005']);
  denied=true;await assert.rejects(new MetaSocial(env,fetcher).exchange('fixture-code','https://bienvu.example/api/social/oauth/callback','1005'),{message:'SOCIAL_PERMISSIONS'});
  const prior=base.calls.length;await assert.rejects(new MetaSocial(env,fetcher).exchange('fixture-code','https://bienvu.example/api/social/oauth/callback','https://attacker.example'),{message:'SOCIAL_STATE'});assert.equal(base.calls.length,prior);
});
test('OAuth : la Page facultative reste liée à la tentative, sans connexion automatique ni réutilisation',async t=>{
  const f=await fixture(t),base=metaFixture();let directReads=0;
  const fetcher:typeof fetch=async(input,init)=>{const url=new URL(String(input));
    if(url.pathname.endsWith('/1005')){directReads++;return Response.json({id:'1005',name:'Page indiquée',access_token:'page-token-authorized-fixture',can_post:true,instagram_business_account:{id:'2005'}});}
    const response=await base.fetcher(input,init);return url.pathname.endsWith('/me/accounts')?Response.json({data:[]}):response;
  },api=new MetaSocial(f.env,fetcher);
  const first=await startSocialOAuth(f.env,f.agency,'social-user','owner','1005'),state=new URL(first.url).searchParams.get('state')!;
  assert.ok(first.pageHint&&!first.pageHint.includes('1005'));assert.equal(new URL(first.url).searchParams.has('pageId'),false);
  const grant=await finishSocialOAuth(f.env,f.agency,'social-user','owner',state,first.browser,'fixture-code',api,first.pageHint);
  assert.deepEqual((await socialOAuthChoices(f.env,f.agency,'social-user','owner',grant)).map(c=>c.id),['facebook:1005','instagram:2005']);assert.equal(directReads,1);
  assert.equal((await socialConnections(f.env,f.agency)).length,f.connections.length,'La Page indiquée ne connecte aucun compte avant sélection');
  const prior=base.calls.length,second=await startSocialOAuth(f.env,f.agency,'social-user','owner','1005'),otherState=new URL(second.url).searchParams.get('state')!;
  await assert.rejects(finishSocialOAuth(f.env,f.agency,'social-user','owner',otherState,second.browser,'fixture-code',api,first.pageHint),{message:'SOCIAL_STATE'});assert.equal(base.calls.length,prior);
  await assert.rejects(finishSocialOAuth(f.env,f.agency,'social-user','owner',state,first.browser,'fixture-code',api,first.pageHint),{message:'SOCIAL_STATE'});assert.equal(directReads,1);
  await assert.rejects(startSocialOAuth(f.env,f.agency,'social-user','owner','https://attacker.example'),{message:'VALIDATION_ERROR'});
  const third=await startSocialOAuth(f.env,f.agency,'social-user','owner'),thirdState=new URL(third.url).searchParams.get('state')!;
  assert.equal(third.pageHint,null);
  const invalid=await sealSocial('not-a-page',f.env.SOCIAL_TOKEN_ENCRYPTION_KEY,`oauth-page:${third.browser}`);
  await assert.rejects(finishSocialOAuth(f.env,f.agency,'social-user','owner',thirdState,third.browser,'fixture-code',api,invalid),{message:'SOCIAL_STATE'});assert.equal(base.calls.length,prior);
});
test('Réseaux : extraire seulement un identifiant de Page numérique depuis un lien Facebook sûr',()=>{
  for(const value of [' 1005 ','https://www.facebook.com/profile.php?id=1005','https://facebook.com/1005/','https://m.facebook.com/profile.php?id=1005#about'])assert.equal(socialFacebookPageId(value),'1005');
  for(const value of ['', 'https://facebook.com.example/profile.php?id=1005','https://user:pass@www.facebook.com/profile.php?id=1005','http://facebook.com/1005','https://www.facebook.com:8443/1005','https://www.facebook.com/nom-de-page','https://www.facebook.com/profile.php?id=https://attacker.example','1'.repeat(41),'https://www.facebook.com/profile.php?id=1005&data='+'a'.repeat(2048)])assert.equal(socialFacebookPageId(value),null);
});
test('OAuth : accepter un POST vide et refuser les corps de connexion mal formés ou trop grands',async()=>{
  const url='https://bienvu.example/api/social/oauth/start';
  assert.deepEqual(await socialOAuthStartInput(new Request(url,{method:'POST'})),{});
  assert.deepEqual(await socialOAuthStartInput(new Request(url,{method:'POST',body:new ReadableStream({start(controller){controller.close();}}),duplex:'half'} as RequestInit)),{});
  assert.deepEqual(await socialOAuthStartInput(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})),{});
  assert.deepEqual(await socialOAuthStartInput(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"pageId":"1005","flow":"facebook"}'})),{pageId:'1005',flow:'facebook'});
  await assert.rejects(socialOAuthStartInput(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"flow":"https://attacker.example"}'})));
  assert.deepEqual(await socialOAuthStartInput(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"pageId":"1005"}'})),{pageId:'1005'});
  for(const body of ['{','{"pageId":"https://attacker.example"}','{"pageId":"1005","extra":true}'])await assert.rejects(socialOAuthStartInput(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body})));
  await assert.rejects(socialOAuthStartInput(new Request(url,{method:'POST',body:'not-json'})),/VALIDATION_ERROR/);
  await assert.rejects(socialOAuthStartInput(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:' '.repeat(1025)})),/FILE_TOO_LARGE/);
});
test('Publication : copie figée, idempotence, isolation, contrôle des crédits et accès vidéo borné',async t=>{
  const f=await fixture(t),balance=await creditBalance(f.env.DB,f.agency),post=await createSocialPublication(f.env,f.agency,'social-user','editor','social-publish-key-001',f.body);
  assert.equal(post.targets.length,2);assert.equal((await createSocialPublication(f.env,f.agency,'social-user','editor','social-publish-key-001',f.body)).id,post.id);
  await assert.rejects(createSocialPublication(f.env,f.agency,'social-user','editor','social-publish-key-001',{...f.body,caption:'autre version'}),/SOCIAL_CONFLICT/);
  await assert.rejects(createSocialPublication(f.env,f.foreign,'other','owner','social-publish-key-002',f.body));await assert.rejects(createSocialPublication(f.env,f.agency,'social-user','viewer','social-publish-key-002',f.body),/FORBIDDEN/);
  await assert.rejects(socialPublication(f.env,f.foreign,post.id));assert.deepEqual(await creditBalance(f.env.DB,f.agency),balance);
  await f.env.MEDIA.delete(f.key);await f.env.DB.prepare("UPDATE generation_runs SET expires_at=? WHERE job_id=?").bind(new Date(Date.now()-1000).toISOString(),f.jobId).run();
  const video=await socialVideo(f.env,new Request('https://test/video',{headers:{Range:'bytes=2-5'}}),post.id,f.agency);assert.equal(video.status,206);assert.deepEqual(new Uint8Array(await video.arrayBuffer()),f.bytes.slice(2,6));
  assert.equal((await socialVideo(f.env,new Request('https://test/video',{method:'HEAD'}),post.id,f.agency)).headers.get('Content-Length'),'8');
  const url=await socialFetchUrl(f.env,post.id);await assert.rejects(socialVideo(f.env,new Request(url),post.id));
  await f.env.DB.prepare("UPDATE social_targets SET status='processing' WHERE post_id=?").bind(post.id).run();assert.equal((await socialVideo(f.env,new Request(url),post.id)).status,200);
  await assert.rejects(socialVideo(f.env,new Request(url.replace(/signature=[^&]+/,'signature=wrong')),post.id));
  await assert.rejects(f.env.DB.prepare('UPDATE social_posts SET object_key=? WHERE id=?').bind('private/foreign.mp4',post.id).run(),/IMMUTABLE/);
});
test('Planification : pas de publication anticipée, modification et annulation privées, aucun appel Meta après annulation',async t=>{
  const f=await fixture(t),scheduled=new Date(Date.now()+3600000).toISOString(),post=await createSocialPublication(f.env,f.agency,'social-user','owner','social-schedule-key-001',{...f.body,scheduledAt:scheduled});
  const meta=metaFixture();await runSocialBatch(f.env,meta.fetcher);assert.equal(meta.calls.length,0);
  const edited=await changeSocialPublication(f.env,f.agency,'social-user','editor',post.id,{action:'edit',caption:'Nouvelle légende',scheduledAt:new Date(Date.now()+7200000).toISOString(),timezone:'Europe/Paris'});assert.equal(edited.caption,'Nouvelle légende');
  await assert.rejects(changeSocialPublication(f.env,f.foreign,'other','owner',post.id,{action:'cancel'}));
  const cancelled=await changeSocialPublication(f.env,f.agency,'social-user','editor',post.id,{action:'cancel'});assert.ok(cancelled.targets.every(t=>t.status==='cancelled'));await pump(f.env,meta.fetcher);assert.equal(meta.calls.length,0);
});
test('Envoi réel simulé : Instagram et Facebook indépendants, leases concurrents et reprise sans double publication',async t=>{
  const f=await fixture(t),post=await createSocialPublication(f.env,f.agency,'social-user','owner','social-success-key-001',f.body),meta=metaFixture();
  await pump(f.env,meta.fetcher);const result=await socialPublication(f.env,f.agency,post.id);assert.ok(result.targets.every(t=>t.status==='published'));
  assert.ok(result.targets.every(t=>t.permalink));assert.equal(meta.calls.filter(c=>c.includes('media_publish')).length,1);assert.equal(meta.calls.filter(c=>c.includes('video_reels finish')).length,1);
  assert.equal(meta.calls.filter(c=>c.includes('video-upload')).length,1);
  const n=meta.calls.length;await pump(f.env,meta.fetcher);assert.equal(meta.calls.length,n);
  await assert.rejects(changeSocialPublication(f.env,f.agency,'social-user','owner',post.id,{action:'cancel'}),/SOCIAL_CONFLICT/);
  await assert.rejects(socialVideo(f.env,new Request(await socialFetchUrl(f.env,post.id)),post.id));
});
test('Réponse finale perdue : aucune relance automatique, confirmation obligatoire après vérification du compte',async t=>{
  const f=await fixture(t),post=await createSocialPublication(f.env,f.agency,'social-user','owner','social-uncertain-key-001',{...f.body,connectionIds:[f.connections.find(c=>c.platform==='instagram')!.id]}),meta=metaFixture({loseInstagramResponse:true});
  await pump(f.env,meta.fetcher);let result=await socialPublication(f.env,f.agency,post.id);assert.equal(result.targets[0].status,'uncertain');assert.equal(meta.calls.filter(c=>c.includes('media_publish')).length,1);
  await assert.rejects(changeSocialPublication(f.env,f.agency,'social-user','owner',post.id,{action:'retry',targetId:result.targets[0].id}),/SOCIAL_UNCERTAIN/);
  result=await changeSocialPublication(f.env,f.agency,'social-user','owner',post.id,{action:'confirm-published',targetId:result.targets[0].id,permalink:'https://www.instagram.com/reel/already-published/'});assert.equal(result.targets[0].status,'published');
  await pump(f.env,meta.fetcher);assert.equal(meta.calls.filter(c=>c.includes('media_publish')).length,1);
});
test('Échec partiel : conserver le succès Instagram, reconnecter uniquement Facebook, nettoyer les copies expirées',async t=>{
  const f=await fixture(t),post=await createSocialPublication(f.env,f.agency,'social-user','owner','social-partial-key-001',f.body),meta=metaFixture({facebookPermissionError:true});
  await pump(f.env,meta.fetcher);const result=await socialPublication(f.env,f.agency,post.id),fb=result.targets.find(t=>t.platform==='facebook')!;
  assert.equal(result.targets.find(t=>t.platform==='instagram')!.status,'published');assert.equal(fb.status,'failed');assert.equal(fb.errorCode,'SOCIAL_PERMISSIONS');
  await assert.rejects(changeSocialPublication(f.env,f.agency,'social-user','owner',post.id,{action:'retry',targetId:fb.id}),/SOCIAL_RECONNECT/);
  await f.env.DB.prepare('UPDATE social_posts SET expires_at=? WHERE id=?').bind(new Date(Date.now()-1000).toISOString(),post.id).run();await cleanupSocial(f.env);
  await assert.rejects(socialVideo(f.env,new Request('https://test/video'),post.id,f.agency));assert.ok(await f.env.MEDIA.head(f.key));
});
test('Déconnexion et suppression Meta : retirer les jetons, annuler les envois et préserver les vidéos sources',async t=>{
  const f=await fixture(t),post=await createSocialPublication(f.env,f.agency,'social-user','owner','social-revoke-key-001',f.body);
  await assert.rejects(disconnectSocial(f.env,f.agency,f.connections[0].id,'editor'),/FORBIDDEN/);
  await disconnectSocial(f.env,f.agency,f.connections[0].id,'owner');assert.equal((await socialPublication(f.env,f.agency,post.id)).targets.filter(t=>t.status==='cancelled').length,1);
  await revokeMetaUser(f.env,'12345',true);assert.equal((await socialConnections(f.env,f.agency)).length,0);await assert.rejects(socialPublication(f.env,f.agency,post.id));assert.ok(await f.env.MEDIA.head(f.key));
  assert.equal((await f.env.DB.prepare('PRAGMA foreign_key_check').all()).results.length,0);
});
test('Calendrier : pagination complète au-delà de 200 publications, curseur validé et agences isolées',async t=>{
  const f=await fixture(t),post=await createSocialPublication(f.env,f.agency,'social-user','owner','social-calendar-key-001',f.body);
  await f.env.DB.prepare(`WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM numbers WHERE n<202)
    INSERT INTO social_posts(id,agency_id,job_id,idempotency_key,input_hash,created_by,title,caption,scheduled_at,timezone,manifest_hash,object_key,size_bytes,sha256,width,height,duration_seconds,prepared,expires_at,created_at,updated_at)
    SELECT 'calendar-'||n,agency_id,job_id,'calendar-key-'||n,input_hash,created_by,title,caption,scheduled_at,timezone,manifest_hash,object_key,size_bytes,sha256,width,height,duration_seconds,1,expires_at,created_at,updated_at FROM social_posts,numbers WHERE id=?`).bind(post.id).run();
  const from=new Date(Date.now()-86400000).toISOString(),to=new Date(Date.now()+86400000).toISOString(),ids:string[]=[],pages:number[]=[];let cursor:string|null=null;
  do{const page=await socialOverview(f.env,f.agency,from,to,cursor);ids.push(...page.publications.map(p=>p.id));pages.push(page.publications.length);cursor=page.nextCursor;}while(cursor);
  assert.deepEqual(pages,[100,100,3]);assert.equal(new Set(ids).size,203);assert.equal((await socialOverview(f.env,f.foreign,from,to)).publications.length,0);
  await assert.rejects(socialOverview(f.env,f.agency,from,to,'invalide'),/VALIDATION_ERROR/);await assert.rejects(socialOverview(f.env,f.agency,from,to,JSON.stringify({date:to,id:post.id})),/VALIDATION_ERROR/);
});
test('Concurrence : une publication prise par le cron ne peut plus être déplacée ou annulée',async t=>{
  const f=await fixture(t),post=await createSocialPublication(f.env,f.agency,'social-user','owner','social-fence-key-001',f.body);
  await f.env.DB.prepare("UPDATE social_targets SET lease_token='fixture-lease',lease_until=? WHERE id=?").bind(new Date(Date.now()+60000).toISOString(),post.targets[0].id).run();
  await assert.rejects(changeSocialPublication(f.env,f.agency,'social-user','owner',post.id,{action:'cancel'}),/SOCIAL_CONFLICT/);
  await assert.rejects(changeSocialPublication(f.env,f.agency,'social-user','owner',post.id,{action:'edit',caption:'Modification concurrente',scheduledAt:new Date(Date.now()+3600000).toISOString(),timezone:'Europe/Paris'}),/SOCIAL_CONFLICT/);
  const after=await socialPublication(f.env,f.agency,post.id);assert.equal(after.caption,post.caption);assert.ok(after.targets.every(t=>t.status==='scheduled'));
});
test('Facebook : une réponse finale perdue est retrouvée sans nouvel appel de publication',async t=>{
  const f=await fixture(t),post=await createSocialPublication(f.env,f.agency,'social-user','owner','social-fb-lost-key-001',{...f.body,connectionIds:[f.connections.find(c=>c.platform==='facebook')!.id]}),meta=metaFixture({loseFacebookResponse:true});
  await pump(f.env,meta.fetcher);assert.equal((await socialPublication(f.env,f.agency,post.id)).targets[0].status,'published');assert.equal(meta.calls.filter(c=>c.includes('video_reels finish')).length,1);
});
test('Transport Meta : URL d’upload étrangère rejetée et limitation temporaire reprise avant publication',async t=>{
  const f=await fixture(t),api=new MetaSocial(f.env,metaFixture({untrustedUpload:true}).fetcher);
  await assert.rejects(api.create('facebook','1001','page-token-fixture','https://bienvu.example/video','Légende'),/SOCIAL_MEDIA/);
  await assert.rejects(api.upload('4001','page-token-fixture','https://attacker.example/upload','https://bienvu.example/video'),/SOCIAL_MEDIA/);
  const post=await createSocialPublication(f.env,f.agency,'social-user','owner','social-safe-retry-key-001',{...f.body,connectionIds:[f.connections.find(c=>c.platform==='instagram')!.id]}),limited=metaFixture({failCreating:true});
  await runSocialBatch(f.env,limited.fetcher);assert.equal((await socialPublication(f.env,f.agency,post.id)).targets[0].status,'processing');assert.ok(!limited.calls.some(c=>c.includes('media_publish')));
  const recovered=metaFixture();await pump(f.env,recovered.fetcher);assert.equal((await socialPublication(f.env,f.agency,post.id)).targets[0].status,'published');assert.equal(recovered.calls.filter(c=>c.includes('media_publish')).length,1);
});
test('Déconnexion pendant la préparation : abandon avant l’appel final et révocation du fichier signé',async t=>{
  const f=await fixture(t),post=await createSocialPublication(f.env,f.agency,'social-user','owner','social-disconnect-active-001',{...f.body,connectionIds:[f.connections.find(c=>c.platform==='instagram')!.id]}),meta=metaFixture();
  await runSocialBatch(f.env,meta.fetcher);assert.equal((await socialPublication(f.env,f.agency,post.id)).targets[0].status,'processing');
  await disconnectSocial(f.env,f.agency,post.targets[0].connectionId!,'owner');await pump(f.env,meta.fetcher);assert.equal((await socialPublication(f.env,f.agency,post.id)).targets[0].status,'cancelled');
  assert.ok(!meta.calls.some(c=>c.includes('media_publish')));await assert.rejects(socialVideo(f.env,new Request(await socialFetchUrl(f.env,post.id)),post.id));
});
