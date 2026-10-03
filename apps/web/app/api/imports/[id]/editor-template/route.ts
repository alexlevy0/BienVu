import {AgencyTemplate,applyAgencyTemplate} from '@bienvu/contracts';
import {findCreationDraft,updateCreationDraft} from '@bienvu/db';
import {requireOwner} from '../../../../../lib/owner';
import {assertSameOrigin,respond,RequestFailure} from '../../../../../lib/http';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return respond(async()=>{
 const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);const id=(await context.params).id,draft=await findCreationDraft(env.DB,agency.id,id);
 if(!draft||draft.expiresAt<=new Date().toISOString())throw new RequestFailure('NOT_FOUND');if(draft.data.videoCustomization?.editor)return Response.json(draft);
 const template=await env.DB.prepare('SELECT template_json AS data FROM agency_templates WHERE agency_id=? AND is_default=1').bind(agency.id).first<{data:string}>();if(!template)return Response.json(draft);
 const settings=applyAgencyTemplate(AgencyTemplate.parse(JSON.parse(template.data)),draft.photos,draft.data.fields,agency);
 if(await updateCreationDraft(env.DB,agency.id,id,draft.version,{...draft.data,videoCustomization:settings})===null)throw new RequestFailure('CONFLICT');
 return Response.json(await findCreationDraft(env.DB,agency.id,id));
});}
