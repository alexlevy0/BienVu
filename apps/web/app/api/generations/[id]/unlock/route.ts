import {fundOwnedTrial,generationView} from '@bienvu/db';
import {requireOwner} from '../../../../../lib/owner';
import {respond,assertSameOrigin} from '../../../../../lib/http';
import {trialResponse} from '../../../../../lib/trials';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return respond(()=>trialResponse(async()=>{const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);return Response.json(generationView(await fundOwnedTrial(env.DB,agency.id,(await params).id)));}));}
