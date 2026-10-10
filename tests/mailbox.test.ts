import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {receiveMail} from '../apps/mail/src/receive';
import {adminMailboxRequest,enqueueMail,sendMailboxOutbox,uploadMailAttachment,cleanupMailUploads,type MailboxEnv} from '../apps/web/lib/mailbox';
import {mailThreadDetail,findMailThread,findMailMessage,listMailThreads,changeMailThread,ensureAgency} from '../packages/db/src/index';
import {MailSendRequest,MAILBOX_LIMITS,mailFileName,mailMessageIds} from '../packages/contracts/src/index';
import {createAuth} from '../apps/web/lib/auth';
import {isAdmin,isSuperAdmin} from '../apps/web/lib/admin-access';
import {adminRequest,adminJobRequest} from '../apps/web/lib/admin';
import {financeRequest} from '../apps/web/lib/profitability';
import {adminAiQualityRequest} from '../apps/web/lib/ai-quality';
import {adminVideoMapRequest} from '../apps/web/lib/video-map-settings';

async function fixture(t:TestContext,staff=false){
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',
    compatibilityDate:'2026-10-03',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const bindings=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(bindings.DB);
  const calls:EmailMessageBuilder[]=[],env:MailboxEnv={...bindings,PROBE_MODE:'local',SUPER_ADMIN_EMAIL:'owner@example.com',
    BETTER_AUTH_URL:'http://localhost:8787',BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',AUTH_EMAIL_MODE:'local',
    ...(staff?{ADMIN_EMAIL:'vonlanthen.greg@gmail.com',MAILBOX_ADDRESSES:JSON.stringify(['contact@bienvu.online','alex@bienvu.online','greg@bienvu.online'])}:{}),
    MAILBOX_ADDRESS:'contact@bienvu.online',MAILBOX_ENABLED:'true',SUPPORT_EMAIL:{async send(value:EmailMessage|EmailMessageBuilder){
      assert.ok('subject' in value);calls.push(value);return {messageId:`<sent-${calls.length}@bienvu.online>`};}}};
  const context=await createAuth(env).$context,cookies:string[]=[],users=[];
  for(const [i,email] of ['owner@example.com','client@example.com','unverified@example.com',...(staff?['vonlanthen.greg@gmail.com','vonlanthen.greg@gmail.com.evil']:[])].entries()){
    const user={id:crypto.randomUUID(),name:'Client '+i,email,emailVerified:i!==2};users.push(user);
    await env.DB.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)')
      .bind(user.id,user.name,user.email,user.emailVerified?1:0,Date.now(),Date.now()).run();
    const token=randomBytes(32).toString('hex');await env.DB.prepare('INSERT INTO auth_session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)')
      .bind(crypto.randomUUID(),Date.now()+86400000,token,Date.now(),Date.now(),user.id).run();
    cookies.push(context.authCookies.sessionToken.name+'='+encodeURIComponent(token+'.'+createHmac('sha256',env.BETTER_AUTH_SECRET).update(token).digest('base64')));
  }
  const request=(method:string,path='',body?:unknown,cookie=cookies[0],origin=env.BETTER_AUTH_URL)=>new Request(env.BETTER_AUTH_URL+'/api/admin/mailbox'+path,
    {method,headers:{cookie,origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const deliver=async(raw:string,from='client@example.com',to='contact@bienvu.online',alternateEnv=env)=>{
    const bytes=new TextEncoder().encode(raw),rejections:string[]=[];
    const result=await receiveMail({from,to,headers:new Headers(),raw:new Response(bytes).body!,rawSize:bytes.length,setReject(reason){rejections.push(reason);}},alternateEnv);
    return {result,rejections};
  };
  return {env,calls,cookies,users,request,deliver,bindings};
}
function plain(key:string,body='Bonjour, pouvez-vous m’aider ?',headers:string[]=[]){
  return [`From: Client <client@example.com>`,`To: contact@bienvu.online`,`Subject: Mon annonce`,`Message-ID: <${key}@example.com>`,
    'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8',...headers,'',body].join('\r\n');
}

test('Messagerie : MIME, réception durable, déduplication, accès privés et suivi client',async t=>{
  const {env,deliver,request,cookies,users}=await fixture(t),agency=await ensureAgency(env.DB,users[1]);
  const mime=['From: =?UTF-8?B?Q2zDqW1lbnQ=?= <client@example.com>','To: contact@bienvu.online','Subject: =?UTF-8?B?Qm9uam91ciDDqQ==?=',
    'Message-ID: <mime@example.com>','Reply-To: assistance@example.com','MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="bienvu"','',
    '--bienvu','Content-Type: text/html; charset=UTF-8','','<h1>Bonjour é</h1><p>Question sur mon annonce.</p><img src="https://evil.example/pixel"><script>alert(1)</script>',
    '--bienvu','Content-Type: application/pdf','Content-Disposition: attachment; filename="annonce.pdf"','Content-Transfer-Encoding: base64','','JVBERi0xLjc=',
    '--bienvu--',''].join('\r\n');
  const incoming=await deliver(mime);assert.equal(incoming.rejections.length,0);assert.ok(incoming.result);
  const detail=(await mailThreadDetail(env.DB,incoming.result.threadId))!;
  assert.equal(detail.thread.unread,1);assert.equal(detail.thread.messageCount,1);assert.equal(detail.thread.subject,'Bonjour é');assert.equal(detail.thread.peerName,'Clément');
  assert.equal(detail.client?.agencyId,agency.id);assert.equal(detail.client?.email,'client@example.com');
  assert.ok(detail.messages[0].text.includes('Question sur mon annonce.'));assert.ok(!detail.messages[0].text.includes('<script>'));
  assert.equal(detail.messages[0].replyTo,'assistance@example.com');assert.equal(detail.messages[0].hasOriginal,true);
  assert.equal(detail.messages[0].attachments[0].name,'annonce.pdf');
  assert.ok(!JSON.stringify(detail).includes('mailbox/messages/'));assert.ok(!JSON.stringify(detail).includes('objectKey'));
  assert.equal((await deliver(mime)).result?.duplicate,true);assert.equal((await findMailThread(env.DB,detail.thread.id))?.messageCount,1);
  const file=detail.messages[0].attachments[0];
  for(const [cookie,status] of [['',401],[cookies[1],403],[cookies[2],401]] as const){
    for(const [method,target] of [['GET',undefined],['GET',{threadId:detail.thread.id}],['GET',{messageId:incoming.result.id,fileId:file.id}],
      ['POST',undefined],['PATCH',{threadId:detail.thread.id}],['PUT',{uploadId:crypto.randomUUID()}]] as const){
      const response=await adminMailboxRequest(request(method,'',undefined,cookie),env,target);
      assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'private, no-store');
    }
  }
  assert.equal((await adminMailboxRequest(request('PATCH','',{action:'archive'},cookies[0],'https://evil.example'),env,{threadId:detail.thread.id})).status,403);
  const downloaded=await adminMailboxRequest(request('GET'),env,{messageId:incoming.result.id,fileId:file.id});
  assert.equal(downloaded.status,200);assert.equal(downloaded.headers.get('content-type'),'application/octet-stream');
  assert.equal(downloaded.headers.get('x-content-type-options'),'nosniff');assert.match(downloaded.headers.get('content-security-policy')! ,/sandbox/);
  assert.equal(await downloaded.text(),'%PDF-1.7');
  const original=await adminMailboxRequest(request('GET'),env,{messageId:incoming.result.id,fileId:'original'});assert.equal(await original.text(),mime);
  assert.equal((await adminMailboxRequest(request('GET'),env,{messageId:incoming.result.id,fileId:'../../../secret'})).status,404);
  assert.equal((await adminMailboxRequest(request('GET','?cursor=../private'),env)).status,422);
  assert.equal((await listMailThreads(env.DB,{q:"' OR 1=1 --",folder:'all'})).items.length,0);
  assert.equal((await listMailThreads(env.DB,{q:'Question sur mon annonce',folder:'inbox'})).items.length,1);
  assert.equal((await deliver(plain('wrong'),undefined,'elsewhere@bienvu.online')).rejections[0],'Mailbox unavailable');
  await assert.rejects(deliver(plain('failed'),undefined,undefined,{...env,MEDIA:{...env.MEDIA,put:async()=>{throw Error('R2_UNAVAILABLE');}}}),/R2_UNAVAILABLE/);
  assert.equal((await listMailThreads(env.DB,{q:'',folder:'all'})).items.length,1,'Une panne de stockage ne produit pas un faux message reçu');
  const tooLarge:string[]=[];await receiveMail({from:'client@example.com',to:env.MAILBOX_ADDRESS!,headers:new Headers(),raw:new Response('x').body!,
    rawSize:MAILBOX_LIMITS.rawBytes+1,setReject(reason){tooLarge.push(reason);}},env as MailboxEnv&{MAILBOX_ENABLED:string;MAILBOX_ADDRESS:string});
  assert.equal(tooLarge.length,1);
});

test('Conversations : références, isolation, arrivée pendant la lecture, archives et pagination',async t=>{
  const {env,deliver,users}=await fixture(t),first=(await deliver(plain('first'))).result!;
  const snapshot=(await mailThreadDetail(env.DB,first.threadId))!;
  const next=(await deliver(plain('next','Deuxième message',['In-Reply-To: <first@example.com>','References: <first@example.com>']))).result!;
  assert.equal(next.threadId,first.threadId);
  await env.DB.prepare('UPDATE mailbox_messages SET created_at=? WHERE id=?').bind(new Date(Date.now()+1000).toISOString(),next.id).run();
  const read=await changeMailThread(env.DB,first.threadId,users[0].id,{action:'read',through:snapshot.readThrough!});assert.equal(read?.unread,1,'Le nouvel email, absent de l’écran, reste non lu');
  await changeMailThread(env.DB,first.threadId,users[0].id,{action:'archive'});
  await deliver(plain('reopen','Réponse',['In-Reply-To: <first@example.com>']));assert.equal((await findMailThread(env.DB,first.threadId))?.folder,'inbox');
  await changeMailThread(env.DB,first.threadId,users[0].id,{action:'spam'});
  await deliver(plain('spam','Encore',['References: <first@example.com>']));assert.equal((await findMailThread(env.DB,first.threadId))?.folder,'spam');
  const unrelated=(await deliver(plain('other','Autre contact',['In-Reply-To: <first@example.com>']).replaceAll('client@example.com','stranger@example.com'),'stranger@example.com')).result!;
  assert.notEqual(unrelated.threadId,first.threadId,'Une référence appartenant à un autre expéditeur ne donne pas accès à sa conversation');
  for(let i=0;i<21;i++)await deliver(plain('history-'+i,'界'.repeat(100000),['In-Reply-To: <first@example.com>']));
  const latest=(await mailThreadDetail(env.DB,first.threadId))!;assert.equal(latest.messages.length,20);assert.ok(latest.olderCursor);
  assert.ok(latest.messages.filter(m=>m.text.length===100000).length>=18,'Une conversation de plusieurs Mo reste lisible sans fusionner les textes dans une seule ligne SQL');
  const older=(await mailThreadDetail(env.DB,first.threadId,latest.olderCursor!))!;assert.equal(older.olderCursor,null);
  assert.equal(new Set([...latest.messages,...older.messages].map(m=>m.id)).size,25);
  for(let i=0;i<21;i++)await deliver(plain('separate-'+i,'Conversation '+i));
  const page=await listMailThreads(env.DB,{q:'',folder:'all'}),more=await listMailThreads(env.DB,{q:'',folder:'all',cursor:page.nextCursor!});
  assert.equal(page.items.length,20);assert.ok(page.nextCursor);assert.equal(more.nextCursor,null);assert.equal(new Set([...page.items,...more.items].map(m=>m.id)).size,23);
});

test('Envoi : pièces jointes privées, réponse, idempotence et concurrence de la file durable',async t=>{
  const {env,calls,deliver,users,request}=await fixture(t),actor=users[0].id,first=(await deliver(plain('reply','Bonjour',['Reply-To: answer@example.com']))).result!;
  const fileId=crypto.randomUUID(),bytes=new TextEncoder().encode('document confidentiel'),file=await uploadMailAttachment(env,actor,fileId,'../épreuve.pdf','application/pdf',bytes);
  assert.equal(file.name,'.._épreuve.pdf');assert.deepEqual(await uploadMailAttachment(env,actor,fileId,'../épreuve.pdf','application/pdf',bytes),file);
  await assert.rejects(uploadMailAttachment(env,users[1].id,fileId,file.name,file.mime,bytes),/CONFLICT/);
  await assert.rejects(uploadMailAttachment(env,actor,fileId,file.name,file.mime,new TextEncoder().encode('autre')),/CONFLICT/);
  const payload={id:crypto.randomUUID(),threadId:first.threadId,replyMessageId:first.id,text:'Voici votre réponse.',attachments:[fileId]};
  const [a,b]=await Promise.all([enqueueMail(env,actor,payload),enqueueMail(env,actor,payload)]);assert.equal(a.id,b.id);
  assert.equal(a.toEmail,'answer@example.com');assert.equal(a.delivery,'queued');assert.ok(!JSON.stringify(a).includes('objectKey'));
  await assert.rejects(enqueueMail(env,actor,{...payload,text:'Autre texte'}),/CONFLICT/);
  await assert.rejects(enqueueMail(env,actor,{...payload,id:crypto.randomUUID()}),/NOT_FOUND/);
  await Promise.all([sendMailboxOutbox(env),sendMailboxOutbox(env)]);assert.equal(calls.length,1);
  assert.equal((await findMailMessage(env.DB,a.id))?.delivery,'sent');assert.equal((await enqueueMail(env,actor,payload)).delivery,'sent');
  assert.deepEqual(calls[0].from,{email:'contact@bienvu.online',name:'BienVu'});assert.equal(calls[0].replyTo,'contact@bienvu.online');
  assert.equal(calls[0].headers?.['In-Reply-To'],'<reply@example.com>');assert.equal(calls[0].headers?.References,'<reply@example.com>');
  assert.equal(calls[0].attachments?.[0].content,btoa('document confidentiel'));assert.equal(calls[0].attachments?.[0].filename,file.name);
  const replyBack=(await deliver(plain('back','Merci',['References: <sent-1@bienvu.online>']).replaceAll('client@example.com','answer@example.com'),'answer@example.com')).result!;
  assert.equal(replyBack.threadId,first.threadId);
  const sent=await listMailThreads(env.DB,{q:'',folder:'sent'});assert.equal(sent.items.length,1);
  assert.equal((await adminMailboxRequest(request('POST','',{...payload,id:crypto.randomUUID(),text:'x'.repeat(20001)}),env)).status,422);
  assert.equal((await adminMailboxRequest(request('POST','',payload),{...env,MAILBOX_ENABLED:'false'})).status,503);
  assert.equal((await adminMailboxRequest(request('GET'),{...env,MAILBOX_ENABLED:'false'})).status,200);
  const temp=await uploadMailAttachment(env,actor,crypto.randomUUID(),'temp.txt','text/plain',bytes);
  await env.DB.prepare("UPDATE mailbox_uploads SET created_at='2020-01-01T00:00:00.000Z'").run();await cleanupMailUploads(env);
  assert.equal(await env.DB.prepare('SELECT id FROM mailbox_uploads WHERE id=?').bind(temp.id).first(),null);
  assert.ok(await env.DB.prepare('SELECT id FROM mailbox_uploads WHERE id=?').bind(fileId).first(),'Les pièces jointes envoyées sont conservées');
});

test('Envoi : refus explicite, relance limitée, résultat incertain et protection du débit',async t=>{
  const {env,users,request}=await fixture(t),actor=users[0].id,make=()=>({id:crypto.randomUUID(),to:'client@example.com',subject:'Assistance',text:'Réponse'});
  const refused={...env,SUPPORT_EMAIL:{async send(){throw Object.assign(Error('Refus'),{code:'E_RECIPIENT_NOT_ALLOWED'});}}};
  const queued=await enqueueMail(env,actor,make());await sendMailboxOutbox(refused,queued.id);
  assert.equal((await findMailMessage(env.DB,queued.id))?.delivery,'failed');
  for(let i=0;i<2;i++){
    assert.equal((await adminMailboxRequest(request('POST'),env,{messageId:queued.id,retry:true})).status,202);
    await sendMailboxOutbox(refused,queued.id);
  }
  assert.equal((await findMailMessage(env.DB,queued.id))?.attempts,3);assert.equal((await adminMailboxRequest(request('POST'),env,{messageId:queued.id,retry:true})).status,409);
  const ambiguous=await enqueueMail(env,actor,make()),broken={...env,SUPPORT_EMAIL:{async send(){throw Error('NETWORK_TIMEOUT');}}};
  await sendMailboxOutbox(broken,ambiguous.id);assert.equal((await findMailMessage(env.DB,ambiguous.id))?.delivery,'uncertain');
  assert.equal((await adminMailboxRequest(request('POST'),env,{messageId:ambiguous.id,retry:true})).status,409);
  await sendMailboxOutbox(env,ambiguous.id);assert.equal((await findMailMessage(env.DB,ambiguous.id))?.attempts,1,'Un résultat incertain n’est jamais renvoyé automatiquement');
  const crashed=await enqueueMail(env,actor,make());await env.DB.prepare("UPDATE mailbox_messages SET delivery='sending',updated_at='2020-01-01T00:00:00.000Z' WHERE id=?").bind(crashed.id).run();
  await sendMailboxOutbox(env);assert.equal((await findMailMessage(env.DB,crashed.id))?.delivery,'uncertain');
  for(let i=0;i<7;i++)await enqueueMail(env,actor,make());
  await assert.rejects(enqueueMail(env,actor,make()),/RATE_LIMITED/);
  assert.equal((await listMailThreads(env.DB,{q:'',folder:'all'})).items.length,10,'Un refus de débit ne crée pas de conversation vide visible');
  assert.equal(MailSendRequest.safeParse({...make(),subject:'Sujet\r\nBcc: other@example.com'}).success,false);
  assert.equal(mailFileName('a\r\nb/../x'),'a__b_.._x');assert.deepEqual(mailMessageIds('<ok@host>\r\nX-Test: injected'),['<ok@host>']);
});

test('Admin Greg : identité vérifiée, suivi en lecture et isolation des trois boîtes',async t=>{
  const {env,users,cookies,deliver,request,calls,bindings}=await fixture(t,true);
  assert.equal(isAdmin(env,users[3]),true);assert.equal(isSuperAdmin(env,users[3]),false);
  assert.equal(isAdmin(env,{...users[3],emailVerified:false}),false);assert.equal(isAdmin(env,users[4]),false);
  const greg=(method:string,path='',body?:unknown)=>request(method,path,body,cookies[3]);
  const boxes=['contact@bienvu.online','alex@bienvu.online','greg@bienvu.online'];
  const incoming=[];
  for(const box of boxes){const received=await deliver(plain('shared-message-id','Privé '+box),undefined,box);assert.ok(received.result);incoming.push(received.result);}
  assert.equal(new Set(incoming.map(r=>r.threadId)).size,3,'Le même Message-ID livré à trois adresses reste isolé');
  assert.equal((await deliver(plain('shared-message-id'),undefined,boxes[2])).result?.duplicate,true);
  const mine=await adminMailboxRequest(greg('GET'),env);assert.equal(mine.status,200);
  const page=await mine.json() as {address:string;mailboxes:string[];items:{id:string}[];counts:{inbox:number}};
  assert.equal(page.address,boxes[2]);assert.deepEqual(page.mailboxes,[boxes[2]]);assert.equal(page.counts.inbox,1);assert.deepEqual(page.items.map(r=>r.id),[incoming[2].threadId]);
  const alex=await adminMailboxRequest(request('GET','?mailbox=alex%40bienvu.online'),env);assert.equal(alex.status,200);
  assert.deepEqual((await alex.json() as {mailboxes:string[]}).mailboxes,boxes.slice(0,2));
  for(const path of ['?mailbox=contact%40bienvu.online','?mailbox=alex%40bienvu.online'])assert.equal((await adminMailboxRequest(greg('GET',path),env)).status,403);
  assert.equal((await adminMailboxRequest(request('GET','?mailbox=greg%40bienvu.online'),env)).status,403);
  assert.equal((await adminMailboxRequest(request('GET','',undefined,cookies[4]),env)).status,403);
  for(const entry of incoming.slice(0,2)){
    assert.equal((await adminMailboxRequest(greg('GET'),env,{threadId:entry.threadId})).status,404);
    assert.equal((await adminMailboxRequest(greg('GET'),env,{messageId:entry.id,fileId:'original'})).status,404);
    assert.equal((await adminMailboxRequest(greg('GET'),env,{messageId:entry.id,html:true})).status,404);
    assert.equal((await adminMailboxRequest(greg('PATCH','',{action:'archive'}),env,{threadId:entry.threadId})).status,404);
    assert.equal((await adminMailboxRequest(greg('POST','',{id:crypto.randomUUID(),threadId:entry.threadId,replyMessageId:entry.id,text:'Réponse'}),env)).status,404);
  }
  assert.equal((await listMailThreads(env.DB,{q:'Privé contact@',folder:'all',address:boxes[2]})).items.length,0);
  assert.equal((await listMailThreads(env.DB,{q:'',folder:'all',cursor:incoming[0].threadId,address:boxes[2]})).items.length,0);
  const reply=await deliver(plain('greg-reply','Suite',['In-Reply-To: <shared-message-id@example.com>']),undefined,boxes[2]);
  assert.equal(reply.result?.threadId,incoming[2].threadId);
  const fileId=crypto.randomUUID();await uploadMailAttachment(env,users[0].id,fileId,'test.txt','text/plain',new TextEncoder().encode('local'),boxes[1]);
  await assert.rejects(enqueueMail(env,users[0].id,{id:crypto.randomUUID(),to:'client@example.com',subject:'Autre boîte',text:'Local',attachments:[fileId]},boxes[0]));
  const outgoing=[];
  for(let i=0;i<boxes.length;i++){
    const cookie=i===2?cookies[3]:cookies[0],response=await adminMailboxRequest(request('POST','?mailbox='+encodeURIComponent(boxes[i]),{id:crypto.randomUUID(),to:'client@example.com',subject:'Fixture',text:'Simulation locale'},cookie),env);
    assert.equal(response.status,202);outgoing.push(await response.json());
  }
  await Promise.all([sendMailboxOutbox(env),sendMailboxOutbox(env)]);
  assert.equal(calls.length,3);assert.deepEqual(calls.map(c=>typeof c.from==='string'?c.from:c.from.email).sort(),boxes.slice().sort());
  assert.deepEqual(calls.map(c=>c.replyTo).sort(),boxes.slice().sort());
  const sent=(outgoing[2] as {id:string});assert.equal((await adminMailboxRequest(request('POST','?mailbox=alex%40bienvu.online',{id:sent.id,to:'client@example.com',subject:'Fixture',text:'Simulation locale'}),env)).status,409);
  await env.DB.prepare("UPDATE mailbox_messages SET delivery='failed' WHERE id=?").bind(sent.id).run();
  assert.equal((await adminMailboxRequest(request('POST','?mailbox=alex%40bienvu.online'),env,{messageId:sent.id,retry:true})).status,409);
  const adminEnv={...env,AUTH_EMAIL_MODE:'local',MEDIA:bindings.MEDIA,SUPER_ADMIN_EMAIL:env.SUPER_ADMIN_EMAIL??'',GENERATIONS_ENABLED:'true',ANONYMOUS_TRIALS_ENABLED:'true',IMPORT_MODE:'disabled'};
  const req=(path:string,method='GET')=>new Request(env.BETTER_AUTH_URL+path,{method,headers:{cookie:cookies[3],origin:env.BETTER_AUTH_URL}});
  await ensureAgency(env.DB,users[1]);const video=await seedNarrationFixture(env.DB,'staff-read');
  for(const section of ['users','agencies','videos']){
    const response=await adminRequest(req('/api/admin?section='+section),adminEnv);assert.equal(response.status,200);
    assert.doesNotMatch(await response.text(),/"(sessions|providers|plan|reservedCents|creditsUsed|creditGift|expiresAt)"/);
  }
  for(const section of ['overview','subscriptions','quotas','imports','reports','audit','seo','commercial','traffic'])assert.equal((await adminRequest(req('/api/admin?section='+section),adminEnv)).status,403);
  assert.equal((await adminRequest(req('/api/admin','POST'),adminEnv)).status,403);
  for(const response of [await financeRequest(req('/api/admin/finance'),adminEnv),await adminAiQualityRequest(req('/api/admin/ai-quality'),adminEnv),await adminVideoMapRequest(req('/api/admin/video-map'),adminEnv)])assert.equal(response.status,403);
  const detail=await adminJobRequest(req('/api/admin/jobs/'+video.jobId),adminEnv,video.jobId);assert.equal(detail.status,200);
  const videoDetail=await detail.json() as {calls:unknown[];animations:unknown[]};assert.deepEqual(videoDetail.calls,[]);assert.deepEqual(videoDetail.animations,[]);
  await env.DB.prepare('UPDATE auth_user SET emailVerified=0 WHERE id=?').bind(users[3].id).run();
  assert.equal((await adminMailboxRequest(greg('GET'),env)).status,401);assert.equal((await adminRequest(req('/api/admin?section=users'),adminEnv)).status,401);
});

test('HTML des emails : boutons et liens actifs, scripts, formulaires et traçage neutralisés',async t=>{
  const {env,deliver,request}=await fixture(t);
  const html='<table><tr><td style="background-color:#e8efdf;padding:20px"><h1>Votre annonce</h1><a href="https://example.com/annonce?id=42&amp;lang=fr" style="background-color:#255133;color:white;padding:12px">Voir mon annonce</a></td></tr></table><a href="mailto:client@example.com">Écrire</a><a href="javascript:alert(1)">Danger</a><img src="https://evil.example/pixel"><script>parent.hacked=true</script><iframe src="https://evil.example"></iframe><form action="https://evil.example"><input name="secret"></form><div onclick="alert(1)" style="background-image:url(https://evil.example/pixel)">Bonjour</div>';
  const raw=['From: client@example.com','To: contact@bienvu.online','Subject: Boutons','Message-ID: <buttons@example.com>','MIME-Version: 1.0','Content-Type: text/html; charset=UTF-8','',html].join('\r\n');
  const result=await deliver(raw);assert.ok(result.result);
  const response=await adminMailboxRequest(request('GET'),env,{messageId:result.result.id,html:true});assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'text/html; charset=utf-8');assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');
  const policy=response.headers.get('content-security-policy')!;assert.match(policy,/sandbox allow-popups allow-popups-to-escape-sandbox/);assert.doesNotMatch(policy,/allow-scripts|allow-same-origin/);assert.match(policy,/frame-ancestors 'self'/);
  const rendered=await response.text();assert.match(rendered,/href="https:\/\/example.com\/annonce\?id=42&amp;lang=fr"/);assert.match(rendered,/target="_blank" rel="noopener noreferrer"/);assert.match(rendered,/background-color:#255133/);assert.match(rendered,/href="mailto:client@example.com"/);
  assert.doesNotMatch(rendered,/<script|<iframe|<form|<input|onclick|javascript:|evil\.example|parent\.hacked|background-image/);
  assert.ok((await findMailMessage(env.DB,result.result.id))?.body_text.includes('https://example.com/annonce'),'La variante texte conserve aussi l’adresse du bouton');
  const text=await deliver(plain('text-link','Consulter https://example.com/annonce'));assert.ok(text.result);
  const textPreview=await adminMailboxRequest(request('GET'),env,{messageId:text.result.id,html:true});assert.match(await textPreview.text(),/<a href="https:\/\/example.com\/annonce"/);
});

test('HeyGen : tri des messages anciens et nouveaux de Contact, compteurs, lecture et archivage',async t=>{
  const {env,deliver,request,users,calls}=await fixture(t,true);
  const received=async(key:string,sender:string,box='contact@bienvu.online',headers:string[]=[])=>{
    const raw=plain(key,'Votre avatar est prêt · '+key,headers).replace('Client <client@example.com>',`HeyGen <${sender}>`).replace('Subject: Mon annonce','Subject: Avatar '+key);
    const result=(await deliver(raw,sender,box)).result!;assert.ok(result);return {...result,raw};
  };
  // These messages already exist when the new view is first opened.
  const root=await received('heygen-root','notifications@heygen.com'),sub=await received('heygen-sub','NoReply@EMAIL.HEYGEN.COM');
  const ordinary=(await deliver(plain('ordinary','Une question sur mon avatar HeyGen'))).result!;
  for(const [i,sender]of['notice@notheygen.com','notice@heygen.com.evil','receipt@stripe.com'].entries())await received('unrelated-'+i,sender);
  const incoming=await listMailThreads(env.DB,{q:'',folder:'inbox'});
  assert.equal(incoming.items.length,4);assert.ok(incoming.items.every(r=>r.category==='general'));
  assert.ok(incoming.items.some(r=>r.id===ordinary.threadId));assert.equal(incoming.counts.inbox,4);assert.equal(incoming.counts.unread,4);
  assert.equal(incoming.counts.heygen,2);assert.equal(incoming.counts.heygenUnread,2);
  const view=await adminMailboxRequest(request('GET','?folder=heygen'),env);assert.equal(view.status,200);assert.equal(view.headers.get('cache-control'),'private, no-store');
  const page=await view.json() as {items:{id:string;category:string}[]};assert.deepEqual(new Set(page.items.map(r=>r.id)),new Set([root.threadId,sub.threadId]));assert.ok(page.items.every(r=>r.category==='heygen'));
  assert.equal((await listMailThreads(env.DB,{q:'ordinary',folder:'heygen'})).items.length,0);
  assert.equal((await listMailThreads(env.DB,{q:'heygen-sub',folder:'heygen'})).items.length,1);
  const detail=(await mailThreadDetail(env.DB,root.threadId))!;assert.equal(detail.thread.category,'heygen');
  await changeMailThread(env.DB,root.threadId,users[0].id,{action:'read',through:detail.readThrough!});
  const read=await listMailThreads(env.DB,{q:'',folder:'heygen'});assert.equal(read.counts.heygenUnread,1);assert.equal(read.counts.unread,4);
  await changeMailThread(env.DB,root.threadId,users[0].id,{action:'archive'});
  assert.equal((await listMailThreads(env.DB,{q:'',folder:'heygen'})).items.length,1);
  assert.equal((await listMailThreads(env.DB,{q:'',folder:'archived'})).items[0].category,'heygen');
  await received('heygen-reply','notifications@heygen.com','contact@bienvu.online',['In-Reply-To: <heygen-root@example.com>']);
  assert.equal((await findMailThread(env.DB,root.threadId))?.folder,'inbox');assert.equal((await listMailThreads(env.DB,{q:'',folder:'heygen'})).items.length,2);
  await changeMailThread(env.DB,sub.threadId,users[0].id,{action:'spam'});
  await received('heygen-spam-reply','noreply@email.heygen.com','contact@bienvu.online',['References: <heygen-sub@example.com>']);
  assert.equal((await findMailThread(env.DB,sub.threadId))?.folder,'spam');assert.equal((await listMailThreads(env.DB,{q:'',folder:'heygen'})).items.length,1);
  await changeMailThread(env.DB,sub.threadId,users[0].id,{action:'restore'});
  const latest=await received('heygen-future','notifications@email.heygen.com');
  assert.ok((await listMailThreads(env.DB,{q:'',folder:'heygen'})).items.some(r=>r.id===latest.threadId));
  assert.equal((await listMailThreads(env.DB,{q:'',folder:'all'})).items.length,7,'Le tri ne supprime aucune conversation');
  const original=await adminMailboxRequest(request('GET'),env,{messageId:root.id,fileId:'original'});assert.equal(await original.text(),root.raw);
  assert.equal(calls.length,0,'Le tri n’envoie aucun e-mail');
  assert.equal((await adminMailboxRequest(request('GET','?folder=heygen',undefined,''),env)).status,401);
});

test('HeyGen : pagination, recherche et isolation de Contact par rapport aux boîtes Alex et Greg',async t=>{
  const {env,deliver,request,cookies}=await fixture(t,true);
  for(let i=0;i<23;i++)await deliver(plain('provider-'+i,'Notification '+i).replace('client@example.com','no-reply@email.heygen.com'),'no-reply@email.heygen.com');
  for(const box of['alex@bienvu.online','greg@bienvu.online'])await deliver(plain('provider-private-'+box).replace('client@example.com','no-reply@email.heygen.com'),'no-reply@email.heygen.com',box);
  const first=await listMailThreads(env.DB,{q:'',folder:'heygen'}),next=await listMailThreads(env.DB,{q:'',folder:'heygen',cursor:first.nextCursor!});
  assert.equal(first.items.length,20);assert.equal(next.items.length,3);assert.equal(next.nextCursor,null);assert.equal(new Set([...first.items,...next.items].map(r=>r.id)).size,23);
  assert.equal(first.counts.heygen,23);assert.equal(first.counts.inbox,0);assert.equal(first.counts.unread,0);
  assert.equal((await listMailThreads(env.DB,{q:'Notification 22',folder:'heygen'})).items.length,1);
  for(const box of['alex@bienvu.online','greg@bienvu.online']){const own=await listMailThreads(env.DB,{q:'',folder:'inbox',address:box});assert.equal(own.items.length,1);assert.equal(own.items[0].category,'general');assert.equal(own.counts.heygen,0);assert.equal((await listMailThreads(env.DB,{q:'',folder:'heygen',address:box})).items.length,0);}
  assert.equal((await adminMailboxRequest(request('GET','?folder=heygen&mailbox=contact%40bienvu.online',undefined,cookies[3]),env)).status,403);
  const greg=await adminMailboxRequest(request('GET','?folder=heygen',undefined,cookies[3]),env);assert.equal(greg.status,200);assert.equal((await greg.json() as {items:unknown[]}).items.length,0);
  assert.equal((await listMailThreads(env.DB,{q:'',folder:'heygen',cursor:first.items[0].id,address:'greg@bienvu.online'})).items.length,0);
});
