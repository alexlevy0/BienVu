import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {defaultVideoCustomization,createEditorDocument,captureAgencyTemplate,applyAgencyTemplate,GoogleVoiceConfig} from '../packages/contracts/src/index';
import {ensureAgency,admitGeneration,findCreationDraft,memberAgency,agencyMemberships} from '../packages/db/src/index';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {fixtureImportTransport} from '../scripts/import-fixtures';
import {createPrivateImport} from '../apps/web/lib/imports';
import {customizeImportedListing,patchCreationDraft} from '../apps/web/lib/creation-drafts';
import {workspaceAction,workspaceSummary,reviewView,reviewResponse,reviewVideo} from '../apps/web/lib/agency-workspace';
import {teamAction} from '../apps/web/lib/teams';
import {prepareJobNarration} from '../apps/pipeline/src/narration';
import {prepareJobVideo} from '../apps/pipeline/src/video-manifest';
import {videoReport} from '../fixtures/video';
async function fixture(t:{after(fn:()=>Promise<void>):void}){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
 const at=new Date(Date.now()-1000).toISOString();for(const id of ['team-owner','team-editor','team-viewer','team-foreign'])await env.DB.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind(id,id,id+'@example.com',at,at).run();
 const agency=await ensureAgency(env.DB,{id:'team-owner',email:'team-owner@example.com'}),foreign=await ensureAgency(env.DB,{id:'team-foreign',email:'team-foreign@example.com'});await env.DB.prepare("INSERT INTO agency_members VALUES(?,?,'owner',?)").bind(agency.id,'team-owner',at).run();
 await env.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9500,0)').bind(at.slice(0,7)).run();await env.DB.exec('UPDATE generation_control SET enabled=1; UPDATE trial_policy SET free_enabled=1');
 const source=await createPrivateImport(env,agency.id,'https://fixtures.bienvu.example/vente','workspace-source-key00',fixtureImportTransport()),draft=await customizeImportedListing(env,agency.id,source.id,'workspace-draft-key00',AbortSignal.timeout(20000));
 return {env,agency,foreign,source,draft,at};
}
test('modèles : charte et cadrages réutilisés sans photos, prix ou narration du bien précédent',()=>{
 const doc=createEditorDocument([{sourceOrder:0},{sourceOrder:2},{sourceOrder:4}],{title:'Ancien bien',locality:'Paris',priceCents:38500000,area:65,rooms:3},{agencyName:'Ancienne agence',logo:true});doc.clips[0].camera={motion:'pan-right',intensity:'subtle',start:{x:20,y:50,scale:1.1},end:{x:80,y:50,scale:1.1}};
 const template=captureAgencyTemplate({...defaultVideoCustomization(),editor:doc,narration:['Phrase de l’ancien bien'],photoOrder:[0,2,4],runwayPhotos:[2],voiceSourceId:'old-voice'});
 const result=applyAgencyTemplate(template,[{sourceOrder:1},{sourceOrder:3},{sourceOrder:6}],{title:'Nouvelle maison',locality:'Lyon',priceCents:20000000,area:90,rooms:4},{name:'Notre agence'});
 assert.equal(result.editor.clips[0].photoSlot,1);assert.equal(result.editor.clips[0].camera?.motion,'pan-right');assert.ok(result.editor.layers.some(l=>l.id==='title'&&l.text==='Nouvelle maison'));
 assert.ok(result.editor.layers.some(l=>l.id==='price'&&l.text.includes('200')));assert.equal(result.editor.layers.some(l=>l.text.includes('Ancien')),false);assert.equal(result.editor.layers.some(l=>l.kind==='logo'),false);
 assert.equal(result.narration,undefined);assert.equal(result.voiceSourceId,undefined);assert.deepEqual(result.runwayPhotos,[]);
});
test('Dossiers et modèles : isolation des agences, versions vérifiées et export classé automatiquement',async t=>{
 const f=await fixture(t),{env,agency,foreign}=f;
 const project=await workspaceAction(env,agency.id,{action:'project',name:'Maison à Lyon'});await workspaceAction(env,agency.id,{action:'attach',projectId:project.id,kind:'draft',id:f.draft.id});
 await assert.rejects(workspaceAction(env,foreign.id,{action:'attach',projectId:project.id,kind:'draft',id:f.draft.id}));
 const editor=createEditorDocument(f.draft.photos,f.draft.data.fields,{voiceEnabled:false,subtitlesEnabled:false}),draft=await patchCreationDraft(env.DB,agency.id,f.draft.id,{version:f.draft.version,changes:{},confirm:[],videoCustomization:{...defaultVideoCustomization(),editor}});
 await assert.rejects(workspaceAction(env,agency.id,{action:'template',name:'Notre style',draftId:draft.id,version:draft.version-1,isDefault:true}));
 await workspaceAction(env,agency.id,{action:'template',name:'Notre style',draftId:draft.id,version:draft.version,isDefault:true});assert.equal((await workspaceSummary(env,agency.id)).templates[0].isDefault,1);assert.equal((await workspaceSummary(env,foreign.id)).templates.length,0);
 const job=await admitGeneration(env.DB,agency.id,'workspace-export-key00',{listingId:f.source.id,voiceEnabled:false,subtitlesEnabled:false},'true');await env.DB.prepare('INSERT INTO editor_exports VALUES(?,?,?,?,?)').bind(agency.id,draft.id,draft.version,job.jobId,f.at).run();
 const summary=await workspaceSummary(env,agency.id);assert.ok((summary.links as {kind:string;id:string}[]).some(l=>l.kind==='job'&&l.id===job.jobId));
});
test('Validation client : lien opaque privé, MP4 borné, commentaires et validation d’une version figée',async t=>{
 const f=await fixture(t),{env,agency,source}=f,job=await admitGeneration(env.DB,agency.id,'workspace-review-key00',{listingId:source.id,voiceEnabled:false,subtitlesEnabled:false,customization:{...defaultVideoCustomization(),narration:['Découvrez cet appartement à Lyon.','La visite se poursuit en images.','Retrouvez les informations du bien.','Contactez votre agence pour une visite.']}},'true');
 await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting',listing_id=? WHERE id=?").bind(source.id,job.jobId).run();
 await prepareJobNarration(env,agency.id,job.jobId,{mode:'mock',script:{model:'gpt-5.4-mini',plan:async()=>{throw Error('NO_OPENAI');}},voice:{config:GoogleVoiceConfig.parse({projectId:'fixture',voice:'fr-FR-Chirp3-HD-Aoede'}),synthesize:async()=>{throw Error('NO_TTS');}}});
 const prepared=await prepareJobVideo(env,agency.id,job.jobId),report=videoReport(prepared.hash,prepared.manifest),key=`agencies/${agency.id}/jobs/${job.jobId}/video/output.mp4`;
 await env.MEDIA.put(key,new Uint8Array(report.sizeBytes),{customMetadata:{sha256:report.sha256}});await env.DB.batch([env.DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(job.jobId,key,JSON.stringify(report),f.at),env.DB.prepare("UPDATE jobs SET status='ready',lease_until=NULL WHERE id=?").bind(job.jobId)]);
 await assert.rejects(workspaceAction(env,f.foreign.id,{action:'review',jobId:job.jobId}));
 const link=await workspaceAction(env,agency.id,{action:'review',jobId:job.jobId});assert.ok('url' in link);const token=String(link.url).split('/').at(-1)!;
 const view=await reviewView(env,token);assert.equal(view.hash,prepared.hash);assert.equal('email' in view,false);
 await assert.rejects(reviewView(env,'a'.repeat(64)));
 assert.equal((await reviewVideo(env,new Request('https://test/video',{headers:{range:'bytes=0-15'}}),token)).status,206);
 await reviewResponse(env,token,{action:'comment',name:'Client',text:'À 4 secondes, le séjour est très clair.',time:4,hash:view.hash});
 const approved=await reviewResponse(env,token,{action:'approve',name:'Client',text:'',time:null,hash:view.hash});assert.equal(approved.status,'approved');assert.equal(approved.comments.length,2);
 await assert.rejects(reviewResponse(env,token,{action:'comment',name:'Client',text:'Autre version',time:null,hash:'f'.repeat(64)}));
 await assert.rejects(env.DB.prepare('UPDATE client_reviews SET manifest_hash=? WHERE id=?').bind('a'.repeat(64),link.id).run(),/IMMUTABLE/);
 await workspaceAction(env,agency.id,{action:'revoke-review',id:link.id});await assert.rejects(reviewView(env,token));assert.equal((await findCreationDraft(env.DB,agency.id,f.draft.id))!.status,'needs_input');
});
test('Équipe : adresse confirmée, permissions, révocation, propriétaire et espace sélectionné',async t=>{
 const f=await fixture(t),owner={id:'team-owner',email:'team-owner@example.com'},editor={id:'team-editor',email:'team-editor@example.com'};
 const invited=await teamAction(f.env,f.agency.id,owner,'owner',{action:'invite',email:editor.email,role:'editor'});assert.ok('url' in invited);const token=new URL(String(invited.url),'https://test').searchParams.get('invitation')!;
 await assert.rejects(teamAction(f.env,f.foreign.id,{id:'team-viewer',email:'team-viewer@example.com'},'owner',{action:'accept',token}));
 const accepted=await teamAction(f.env,f.foreign.id,editor,'owner',{action:'accept',token});assert.deepEqual(accepted,{agencyId:f.agency.id});assert.equal((await memberAgency(f.env.DB,editor.id,f.agency.id))!.role,'editor');
 assert.equal((await agencyMemberships(f.env.DB,editor.id)).some(m=>m.id===f.agency.id),true);
 await assert.rejects(teamAction(f.env,f.agency.id,editor,'editor',{action:'invite',email:'another@example.com',role:'admin'}));
 await assert.rejects(teamAction(f.env,f.agency.id,owner,'owner',{action:'remove',userId:owner.id}));
 await teamAction(f.env,f.agency.id,owner,'owner',{action:'remove',userId:editor.id});assert.equal(await memberAgency(f.env.DB,editor.id,f.agency.id),null);
 await assert.rejects(teamAction(f.env,f.foreign.id,editor,'owner',{action:'switch',agencyId:f.agency.id}));
 await assert.rejects(f.env.DB.prepare('DELETE FROM agency_members WHERE agency_id=? AND user_id=?').bind(f.agency.id,owner.id).run(),/OWNER_REQUIRED/);
});

test('Permissions centrales : lecture autorisée, création réservée aux éditeurs et facturation aux administrateurs',async()=>{
 const {canAgencyAction}=await import('../packages/contracts/src/access');
 assert.equal(canAgencyAction('viewer','GET','/api/imports/a/draft'),true);assert.equal(canAgencyAction('viewer','POST','/api/imports/a/editor-export'),false);assert.equal(canAgencyAction('viewer','DELETE','/api/imports/a/draft'),false);
 assert.equal(canAgencyAction('editor','POST','/api/imports/a/editor-export'),true);assert.equal(canAgencyAction('editor','POST','/api/billing/checkout'),false);assert.equal(canAgencyAction('editor','PUT','/api/agency'),false);
 assert.equal(canAgencyAction('admin','POST','/api/billing/checkout'),true);assert.equal(canAgencyAction('owner','PUT','/api/agency'),true);
});
