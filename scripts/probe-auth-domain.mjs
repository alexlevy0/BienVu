import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {remoteSql} from './cloudflare-operator.mjs';
const dir='evidence/remote/sprint-02-acceptance',path=`${dir}/email-domain.json`,origin='https://bienvu.online';
const config=JSON.parse(await readFile('apps/web/wrangler.staging.jsonc','utf8'));
assert.equal(config.vars.BETTER_AUTH_URL,origin);assert.equal(config.vars.AUTH_EMAIL_VERIFICATION_BYPASS,'false');
assert.deepEqual(config.send_email[0].allowed_destination_addresses,['alexlevy0@gmail.com']);
const step=process.argv[2];assert.ok(['send','status'].includes(step));
const snapshot=async()=>{
 const [account]=await remoteSql(`SELECT count(DISTINCT u.id) users,count(DISTINCT g.id) agencies,group_concat(DISTINCT a.providerId) providers,
 max(CASE WHEN a.providerId='credential' THEN a.updatedAt ELSE 0 END) credentialUpdatedAt,
 (SELECT count(*) FROM auth_verification v WHERE v.value=u.id AND v.identifier LIKE 'reset-password:%') pendingResetTokens
 FROM auth_user u JOIN auth_account a ON a.userId=u.id LEFT JOIN agencies g ON g.owner_user_id=u.id WHERE u.email='alexlevy0@gmail.com';`);
 return account;
};
if(step==='send'){
 try{await readFile(path);throw new Error('Recette déjà engagée : aucun second envoi automatique.');}catch(e){if(e.code!=='ENOENT')throw e;}
 const before=await snapshot();assert.equal(before.users,1);assert.equal(before.agencies,1);
 const report={at:new Date().toISOString(),origin,requestedEmails:1,before,humanConfirmation:'pending'};
 await mkdir(dir,{recursive:true});await writeFile(path,JSON.stringify(report,null,2),{mode:0o600});
 const res=await fetch(`${origin}/api/auth/request-password-reset`,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({email:'alexlevy0@gmail.com'}),signal:AbortSignal.timeout(30000)});
 report.httpStatus=res.status;report.response=await res.json();report.afterRequest=await snapshot();
 await writeFile(path,JSON.stringify(report,null,2),{mode:0o600});assert.equal(res.status,200);console.log({httpStatus:res.status,accountCount:before.users,agencyCount:before.agencies,providers:before.providers});
}else{
 const report=JSON.parse(await readFile(path,'utf8'));const after=await snapshot();
 Object.assign(report,{after,observedAt:new Date().toISOString(),credentialUpdated:after.credentialUpdatedAt!==report.before.credentialUpdatedAt});
 await writeFile(path,JSON.stringify(report,null,2),{mode:0o600});console.log(report);
}
