import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {receiveMail} from '../apps/mail/src/receive';
import {adminMailboxRequest,enqueueMail,sendMailboxOutbox,uploadMailAttachment,cleanupMailUploads,type MailboxEnv} from '../apps/web/lib/mailbox';
import {mailThreadDetail,findMailThread,findMailMessage,listMailThreads,changeMailThread,ensureAgency} from '../packages/db/src/index';
import {MailSendRequest,MAILBOX_LIMITS,mailFileName,mailMessageIds} from '../packages/contracts/src/index';
import {createAuth} from '../apps/web/lib/auth';

async function fixture(t:TestContext){
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',
    compatibilityDate:'2026-10-03',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const bindings=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(bindings.DB);
  const calls:EmailMessageBuilder[]=[],env:MailboxEnv={...bindings,PROBE_MODE:'local',SUPER_ADMIN_EMAIL:'owner@example.com',
    BETTER_AUTH_URL:'http://localhost:8787',BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',AUTH_EMAIL_MODE:'local',
    MAILBOX_ADDRESS:'contact@bienvu.online',MAILBOX_ENABLED:'true',SUPPORT_EMAIL:{async send(value:EmailMessage|EmailMessageBuilder){
      assert.ok('subject' in value);calls.push(value);return {messageId:`<sent-${calls.length}@bienvu.online>`};}}};
  const context=await createAuth(env).$context,cookies:string[]=[],users=[];
  for(const [i,email] of ['owner@example.com','client@example.com','unverified@example.com'].entries()){
    const user={id:crypto.randomUUID(),name:'Client '+i,email,emailVerified:i<2};users.push(user);
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
  return {env,calls,cookies,users,request,deliver};
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
