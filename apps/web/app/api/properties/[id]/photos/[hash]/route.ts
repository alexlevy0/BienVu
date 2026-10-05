import {requireOwner} from '../../../../../../lib/owner';
import {respond} from '../../../../../../lib/http';
import {propertyPhoto} from '../../../../../../lib/properties';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string;hash:string}>}){return respond(async()=>{
  const {env,agency}=await requireOwner(request),{id,hash}=await params;
  return propertyPhoto(env,agency.id,id,hash,request);});}
