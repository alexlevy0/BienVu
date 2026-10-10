import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {AvatarLook,DEFAULT_AVATAR_SETTINGS,prioritizeAvatarFavorites} from '../packages/contracts/src/index';
import {avatarFavorites,setAvatarFavorite,avatarGallery,avatarCatalog} from '../packages/db/src/index';
import {avatarFavoritesRequest} from '../apps/web/lib/avatar-favorites';
import {createAuth} from '../apps/web/lib/auth';

test('Favoris personnels : sessions signées, isolation, idempotence, origine et visibilité du catalogue',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());
  const DB=await mf.getD1Database('DB');await migrateNarrationProbe(DB);
  const env={DB,PROBE_MODE:'local',BETTER_AUTH_URL:'http://localhost:8787',BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',AUTH_EMAIL_MODE:'local'};
  const context=await createAuth(env).$context,users=Array.from({length:4},()=>crypto.randomUUID()),cookies:string[]=[];
  for(const [i,id] of users.entries()){
    await DB.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind(id,'Fixture',`avatar-${i}@example.com`,i===2?0:1,Date.now(),Date.now()).run();
    const token=randomBytes(32).toString('hex');await DB.prepare('INSERT INTO auth_session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),Date.now()+(i===3?-1000:86400_000),token,Date.now(),Date.now(),id).run();
    cookies.push(context.authCookies.sessionToken.name+'='+encodeURIComponent(token+'.'+createHmac('sha256',env.BETTER_AUTH_SECRET).update(token).digest('base64')));
  }
  const looks=['alpha','default','zeta','disabled','private','premium'].map(id=>AvatarLook.parse({id,name:id,gender:'female',type:'studio_avatar',engines:id==='premium'?['avatar_iv']:['avatar_iii'],
    enabled:id!=='disabled',ownership:id==='private'?'private':'public',thumbnail:'/portrait',preview:'/preview',transparentVerified:false,updatedAt:new Date().toISOString()}));
  await DB.batch(looks.map(look=>DB.prepare('INSERT INTO avatar_looks(id,look_json,source_json,enabled,updated_at) VALUES(?,?,?,?,?)').bind(look.id,JSON.stringify(look),JSON.stringify({image:'SECRET_PROVIDER_URL',video:null}),look.enabled?1:0,new Date().toISOString())));
  await DB.prepare('UPDATE avatar_settings SET settings_json=? WHERE id=1').bind(JSON.stringify({...DEFAULT_AVATAR_SETTINGS,enabled:true,defaultLookId:'default'})).run();
  const request=(cookie=cookies[0],body?:unknown,headers:Record<string,string>={})=>new Request(env.BETTER_AUTH_URL+'/api/avatars/favorites',{
    method:body===undefined?'GET':'PUT',headers:{cookie,origin:env.BETTER_AUTH_URL,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const call=(...args:Parameters<typeof request>)=>avatarFavoritesRequest(request(...args),env);
  await t.test('lecture et écriture réservées aux utilisateurs vérifiés, cookies falsifiés ou expirés refusés',async()=>{
    for(const cookie of ['',cookies[0]+'tampered',cookies[2],cookies[3]]){
      assert.equal((await call(cookie)).status,401);assert.equal((await call(cookie,{lookId:'zeta',favorite:true})).status,401);
    }
  });
  await t.test('ajout et retrait idempotents, aucune donnée du compte voisin ni URL fournisseur',async()=>{
    for(let i=0;i<2;i++)assert.equal((await call(cookies[0],{lookId:'zeta',favorite:true})).status,200);
    const response=await call();assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(await response.json(),{ids:['zeta']});
    assert.deepEqual(await (await call(cookies[1])).json(),{ids:[]});
    assert.equal((await call(cookies[1],{lookId:'alpha',favorite:true})).status,200);
    assert.deepEqual(await avatarFavorites(DB,users[0]),{ids:['zeta']});assert.deepEqual(await avatarFavorites(DB,users[1]),{ids:['alpha']});
    for(let i=0;i<2;i++)assert.equal((await call(cookies[0],{lookId:'alpha',favorite:false})).status,200);
    assert.deepEqual(await avatarFavorites(DB,users[1]),{ids:['alpha']});
    assert.equal((await DB.prepare('SELECT count(*) AS n FROM avatar_favorites WHERE user_id=? AND look_id=?').bind(users[0],'zeta').first<{n:number}>())?.n,1);
  });
  await t.test('CSRF, injection, usurpation du compte et corps non borné refusés',async()=>{
    const hostileOrigins:Record<string,string>[]=[{origin:'https://evil.example'},{'sec-fetch-site':'cross-site'}];
    for(const headers of hostileOrigins)assert.equal((await call(cookies[0],{lookId:'alpha',favorite:true},headers)).status,403);
    for(const body of [{lookId:'alpha',favorite:true,userId:users[1]},{lookId:"' OR 1=1 --",favorite:true},{lookId:'alpha',favorite:'true'}])assert.equal((await call(cookies[0],body)).status,422);
    assert.equal((await call(cookies[0],{lookId:'alpha',favorite:true},{'content-length':'10000'})).status,413);
    assert.deepEqual(await avatarFavorites(DB,users[0]),{ids:['zeta']});
  });
  await t.test('avatars privés, désactivés, moteurs indisponibles et identifiants inconnus refusés',async()=>{
    for(const lookId of ['disabled','private','premium','missing'])assert.notEqual((await call(cookies[0],{lookId,favorite:true})).status,200);
    const catalog=await avatarCatalog(DB),gallery=await avatarGallery(DB,{query:'',gender:'all',offset:0});
    assert.deepEqual(catalog.looks.map(look=>look.id),['default','alpha','zeta']);assert.deepEqual(gallery.looks.map(look=>look.id),['default','alpha','zeta']);
    assert.deepEqual(prioritizeAvatarFavorites(catalog.looks,(await avatarFavorites(DB,users[0])).ids).map(look=>look.id),['zeta','default','alpha']);assert.equal(catalog.defaultLookId,'default');
    await DB.prepare('UPDATE avatar_looks SET enabled=0 WHERE id=?').bind('zeta').run();assert.deepEqual(await avatarFavorites(DB,users[0]),{ids:[]});
    assert.equal((await call(cookies[0],{lookId:'zeta',favorite:true})).status===200,false);
    assert.equal((await call(cookies[0],{lookId:'zeta',favorite:false})).status,200);
    await setAvatarFavorite(DB,users[1],{lookId:'default',favorite:true});await DB.prepare('DELETE FROM auth_user WHERE id=?').bind(users[1]).run();
    assert.equal((await DB.prepare('SELECT count(*) AS n FROM avatar_favorites WHERE user_id=?').bind(users[1]).first<{n:number}>())?.n,0);
  });
});
test('Priorité des favoris : partition stable, doublons et favoris absents sans changer le catalogue',()=>{
  const looks=['default','alpha','beta','zeta'].map(id=>({id}));assert.deepEqual(prioritizeAvatarFavorites(looks,['zeta','beta','beta','missing']).map(look=>look.id),['beta','zeta','default','alpha']);
  assert.deepEqual(prioritizeAvatarFavorites(looks,[]),looks);assert.deepEqual(looks.map(look=>look.id),['default','alpha','beta','zeta']);
});
