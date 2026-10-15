import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {AvatarLook,avatarSupportsCutout,avatarCutoutStatus,defaultAvatarCustomization,DEFAULT_AVATAR_SETTINGS} from '../packages/contracts/src/index';
import {heygenClient,AvatarFailure} from '../packages/avatars/src/index';
import {admitAvatar,avatarCatalog,findAvatarLook,saveAvatarLook,setAvatarSettings,recordAvatarTransparency} from '../packages/db/src/index';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {adminAvatarRequest} from '../apps/web/lib/avatars';
import {createAuth} from '../apps/web/lib/auth';
const look=AvatarLook.parse({id:'other-than-default',name:'Autre présentateur',gender:'male',type:'studio_avatar',engines:['avatar_iii','avatar_iv'],enabled:true,
  thumbnail:null,preview:null,transparentVerified:false,ownership:'public',updatedAt:'2026-10-09T12:00:00.000Z'});
test('Silhouette : un avatar non vérifié n’est pas incompatible, sur tous les types et moteurs autorisés',()=>{
  assert.equal(avatarCutoutStatus(look),'unknown');assert.equal(avatarSupportsCutout(undefined),false);
  for(const type of ['studio_avatar','digital_twin','photo_avatar'] as const)for(const engine of ['avatar_iii','avatar_iv'] as const)assert.equal(avatarSupportsCutout({...look,type},engine),true);
  assert.equal(avatarSupportsCutout({...look,engines:['avatar_iii']},'avatar_iv'),false);
  assert.equal(avatarCutoutStatus({...look,transparentVerified:true}),'supported');
  assert.equal(avatarSupportsCutout({...look,transparentVerified:true,transparency:'unsupported'}),false);
});
test('HeyGen : WebM conservé, refus de détourage précis et aucun refus supposé sur panne ou erreur générale',async()=>{
  const input={id:'task',lookId:look.id,engine:'avatar_iii' as const,audioId:'audio',transparent:true};let calls=0;
  const accepted=heygenClient('fixture',async(_url,init)=>{calls++;const body=JSON.parse(init!.body as string);assert.equal(body.avatar_id,look.id);assert.equal(body.output_format,'webm');assert.equal(body.audio_asset_id,'audio');return Response.json({data:{video_id:'video',output_format:'webm'}});});
  assert.equal(await accepted.create(input),'video');assert.equal(calls,1);
  for(const status of [400,422])await assert.rejects(heygenClient('fixture',async()=>Response.json({error:{code:'invalid_parameter',message:'This video avatar does not support webm output. The avatar must be trained with matting enabled.'}},{status})).create(input),error=>error instanceof AvatarFailure&&error.code==='AVATAR_TRANSPARENCY_UNSUPPORTED'&&!error.uncertain);
  await assert.rejects(heygenClient('fixture',async()=>Response.json({error:{code:'invalid_parameter',message:'Audio asset is invalid'}},{status:400})).create(input),error=>error instanceof AvatarFailure&&error.code==='AVATAR_REQUEST_REJECTED');
  await assert.rejects(heygenClient('fixture',async()=>Response.json({error:{message:'This video avatar does not support webm output'}},{status:503})).create(input),error=>error instanceof AvatarFailure&&error.code==='AVATAR_UNCERTAIN'&&error.uncertain);
});
test('D1 : admission d’un autre avatar, refus mémorisé sans modifier ses autres données et décision manuelle protégée',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');await migrateNarrationProbe(db);
  await saveAvatarLook(db,'admin',look,{image:null,video:null});await setAvatarSettings(db,'admin',{...DEFAULT_AVATAR_SETTINGS,enabled:true},1);
  const avatar={...defaultAvatarCustomization(look.id),appearance:'cutout' as const};assert.ok(await admitAvatar(db,avatar,'fish-lucas',true));
  await recordAvatarTransparency(db,look,'unsupported');const denied=(await findAvatarLook(db,look.id))!;
  assert.equal(denied.look.transparency,'unsupported');assert.equal(denied.look.enabled,true);assert.equal(denied.look.transparentVerified,false);assert.deepEqual(denied.look.engines,look.engines);
  await assert.rejects(admitAvatar(db,avatar,'fish-lucas',true),/AVATAR_TRANSPARENCY_UNSUPPORTED/);assert.ok(await admitAvatar(db,{...avatar,appearance:'circle'},'fish-lucas',true));
  assert.equal((await avatarCatalog(db)).looks[0].transparency,'unsupported');
  const audits=()=>db.prepare("SELECT count(*) n FROM avatar_audit WHERE action='transparency_observed'").first<{n:number}>();assert.equal((await audits())!.n,1);
  await recordAvatarTransparency(db,look,'supported');assert.equal((await findAvatarLook(db,look.id))!.look.transparency,'unsupported');assert.equal((await audits())!.n,1,'Une ancienne réponse ne remplace pas un résultat plus récent');
  const manual={...denied.look,transparency:'supported' as const,transparentVerified:true,updatedAt:'2026-12-01T00:00:00.000Z'};await saveAvatarLook(db,'admin',manual,denied.source);
  await recordAvatarTransparency(db,denied.look,'unsupported');assert.equal((await findAvatarLook(db,look.id))!.look.transparentVerified,true);assert.ok(await admitAvatar(db,avatar,'fish-lucas',true));
  await saveAvatarLook(db,'admin',{...look,transparentVerified:true},{image:null,video:null});await recordAvatarTransparency(db,{...look,transparentVerified:true},'supported');assert.equal((await findAvatarLook(db,look.id))!.look.transparentVerified,true,'Le booléen JSON historique reste un booléen');
});
test('Superadmin : trois états persistés, droits et origine contrôlés, état conservé à la synchronisation',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const DB=await mf.getD1Database('DB'),MEDIA=await mf.getR2Bucket('MEDIA') as unknown as R2Bucket;await migrateNarrationProbe(DB);
  const env={DB,MEDIA,PROBE_MODE:'local',BETTER_AUTH_URL:'http://localhost:8787',BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',AUTH_EMAIL_MODE:'local',SUPER_ADMIN_EMAIL:'superadmin@example.com'};
  const context=await createAuth(env).$context,cookies:string[]=[];
  for(const email of ['superadmin@example.com','member@example.com']){
    const id=crypto.randomUUID(),token=randomBytes(32).toString('hex');await DB.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind(id,'Fixture',email,1,Date.now(),Date.now()).run();
    await DB.prepare('INSERT INTO auth_session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),Date.now()+86400_000,token,Date.now(),Date.now(),id).run();
    cookies.push(context.authCookies.sessionToken.name+'='+encodeURIComponent(token+'.'+createHmac('sha256',env.BETTER_AUTH_SECRET).update(token).digest('base64')));
  }
  await saveAvatarLook(DB,'fixture',look,{image:null,video:null});
  const call=(body:unknown,cookie=cookies[0],origin=env.BETTER_AUTH_URL,method='PATCH',target=env)=>adminAvatarRequest(new Request(env.BETTER_AUTH_URL+'/api/admin/avatars',{method,headers:{cookie,origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),target);
  const input={lookId:look.id,enabled:true,transparentVerified:false,transparency:'unsupported'};
  assert.equal((await call(input,'')).status,401);assert.equal((await call(input,cookies[1])).status,403);assert.equal((await call(input,cookies[0],'https://other.example')).status,403);
  assert.equal((await call(input)).status,200);assert.equal((await findAvatarLook(DB,look.id))!.look.transparency,'unsupported');
  assert.equal((await call({...input,enabled:false})).status,200);assert.equal((await call({...input,transparency:undefined})).status,200,'Un ancien client qui réactive conserve le refus connu');assert.equal((await findAvatarLook(DB,look.id))!.look.transparency,'unsupported');
  assert.equal((await call({...input,transparency:'supported',transparentVerified:true})).status,200);assert.equal((await findAvatarLook(DB,look.id))!.look.transparentVerified,true);
  assert.equal((await call({...input,transparentVerified:true})).status,422,'Un état contradictoire est refusé');
  assert.equal((await call({...input,transparency:null})).status,200);assert.equal((await findAvatarLook(DB,look.id))!.look.transparency,undefined);assert.equal((await findAvatarLook(DB,look.id))!.look.transparentVerified,false);
  await call(input);const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let providerCalls=0;
  globalThis.fetch=async url=>{const path=new URL(String(url)).pathname;providerCalls++;assert.equal(path,'/v3/avatars/looks');return Response.json({data:[{id:look.id,name:look.name,avatar_type:'studio_avatar',supported_api_engines:['avatar_iii','avatar_iv'],gender:'male',status:'completed'}],next_token:null});};
  const response=await call({action:'sync',type:'studio_avatar'},cookies[0],env.BETTER_AUTH_URL,'POST',{...env,HEYGEN_API_KEY:'fixture'} as typeof env);assert.equal(response.status,200);assert.equal(providerCalls,1);assert.equal((await findAvatarLook(DB,look.id))!.look.transparency,'unsupported');
});
