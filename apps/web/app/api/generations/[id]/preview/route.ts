import {requireOwner} from '../../../../../lib/owner';
import {respond} from '../../../../../lib/http';
import {generationPreview} from '../../../../../lib/generations';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return respond(async()=>{const {env,agency}=await requireOwner(request);return generationPreview(request,env,agency.id,(await params).id);});}
export const HEAD=GET;
