import {requireOwner} from '../../../lib/owner';
import {respond} from '../../../lib/http';
import {propertyPage,readPropertyGroups} from '../../../lib/properties';
export const dynamic='force-dynamic';
export async function GET(request:Request){return respond(async()=>{const {env,agency}=await requireOwner(request);
  return Response.json(propertyPage(await readPropertyGroups(env,agency.id),new URL(request.url).searchParams));});}
