import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ANALYTICS_CONSENT_KEY,CONSENT_DURATION_MS,analyticsConfiguration,analyticsPath,analyticsUrl,readAnalyticsConsent,replayAllowed,replayAttribute,replayUrl,safeAnalyticsProperties} from '../apps/web/lib/analytics-policy';

test('analytics is disabled without a valid EU project configuration',()=>{
  assert.equal(analyticsConfiguration({}).enabled,false);
  assert.equal(analyticsConfiguration({POSTHOG_ENABLED:'true',POSTHOG_PROJECT_TOKEN:'phx_personal_secret'}).enabled,false);
  assert.equal(analyticsConfiguration({POSTHOG_ENABLED:'true',POSTHOG_PROJECT_TOKEN:'phc_public_fixture_project_key',POSTHOG_HOST:'https://us.i.posthog.com'}).enabled,false);
  assert.equal(analyticsConfiguration({POSTHOG_ENABLED:'true',POSTHOG_PROJECT_TOKEN:'phc_public_fixture_project_key'}).enabled,true);
  assert.equal(analyticsConfiguration({POSTHOG_ENABLED:'true',POSTHOG_PROJECT_TOKEN:'phc_public_fixture_project_key',POSTHOG_ERROR_TRACKING_ENABLED:'false'}).errorTracking,false);
});
test('consent expires, rejects contradictory choices, and never implies agreement',()=>{
  const now=20000000000;
  for(const raw of [null,'invalid','{}',JSON.stringify({version:1,analytics:true,replay:true,at:now}),JSON.stringify({version:2,analytics:false,replay:true,at:now}),JSON.stringify({version:2,analytics:true,replay:true,at:now+1}),JSON.stringify({version:2,analytics:true,replay:true,at:now-CONSENT_DURATION_MS})])assert.equal(readAnalyticsConsent(raw,now),null);
  const rejected={version:2,analytics:false,replay:false,at:now};assert.deepEqual(readAnalyticsConsent(JSON.stringify(rejected),now),rejected);
  assert.equal(ANALYTICS_CONSENT_KEY,'bienvu:privacy:v2');
});
test('public pages retain their names but all private identifiers, query strings and hashes are removed',()=>{
  assert.equal(analyticsPath('/partenaires?email=client@example.fr#formulaire'),'/partenaires');
  assert.equal(analyticsUrl('/editeur?draft=264c088b-5fe7-49f5-aca7-ff4332bc5531'),'https://bienvu.online/editeur');
  assert.equal(analyticsPath('/biens/listing%3A264c088b-5fe7-49f5-aca7-ff4332bc5531'),'/biens/[id]');
  assert.equal(analyticsPath('/historique/264c088b-5fe7-49f5-aca7-ff4332bc5531'),'/historique/[id]');
  assert.equal(analyticsPath('/blog'),'/blog');
});
test('admin, private validation links and OAuth/reset URLs are excluded',()=>{
  for(const url of ['/admin','/admin/boite','/api/social/oauth/callback?code=secret','/validation/private-secret','/agence?grant=private-secret','/connexion#token=secret','/agence?socialError=SOCIAL_PAGE_ACCESS','/laboratoire']){
    assert.equal(analyticsPath(url),null,url);assert.equal(replayAllowed(url),false,url);
  }
  assert.equal(replayAllowed('/connexion'),true);
  assert.equal(replayAllowed('/editeur?draft=private-id'),true);
});
test('event properties contain only bounded counts and known classifications',()=>{
  const safe=safeAnalyticsProperties({source_kind:'url',mode:'later',destination_count:2,subtitles_enabled:true,page:'/biens/private-id',email:'client@example.fr',url:'https://agency.fr/mandat',caption:'PRIVATE_TEXT',job_id:'private-id',photo_count:Infinity,description:{text:'PRIVATE_TEXT'},tab:'private-text',error_code:'UNSAFE_URL',duration_seconds:20});
  assert.deepEqual(safe,{source_kind:'url',mode:'later',destination_count:2,subtitles_enabled:true,page:'/biens/[id]',error_code:'UNSAFE_URL',duration_seconds:20});
  assert.deepEqual(safeAnalyticsProperties({photo_count:-1,duration_seconds:4000000,error_code:'personal text'}),{});
});
test('replay keeps visible labels, ordinary form values, styles and media',()=>{
  for(const name of ['value','placeholder','title','data-name','aria-label'])assert.equal(replayAttribute(name,'VISIBLE_TEXT'),'VISIBLE_TEXT',name);
  assert.equal(replayAttribute('href','/editeur?draft=property-id'),'https://bienvu.online/editeur?draft=property-id');
  assert.equal(replayAttribute('href','mailto:client@example.fr'),'mailto:client@example.fr');
  const style='width:200px;background-image:url(/api/photos);color:#fff;content:"VISIBLE_TEXT"';
  assert.equal(replayAttribute('style',style),style);
  assert.equal(replayAttribute('src','/api/imports/project/photos/photo'),'https://bienvu.online/api/imports/project/photos/photo');
});
test('replay never exposes credentials in resource URLs or secret attributes',()=>{
  assert.equal(replayUrl('/editeur?draft=property-id&access_token=SECRET#token=SECRET'),'https://bienvu.online/editeur?draft=property-id');
  assert.equal(replayUrl('https://user:SECRET@assets.example.fr/photo.jpg?signature=SECRET'),'https://assets.example.fr/photo.jpg');
  assert.equal(replayAttribute('data-access-token','SECRET'),'');
  assert.equal(replayAttribute('src','data:image/jpeg;base64,aGVsbG8='),'data:image/jpeg;base64,aGVsbG8=');
});
