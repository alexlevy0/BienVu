import {requireOwner} from '../../../lib/owner';
import {respond} from '../../../lib/http';
import {listLibraryMusic} from '../../../lib/music-library';
export const dynamic='force-dynamic';
export async function GET(request:Request){return respond(async()=>{
  const {env}=await requireOwner(request);return Response.json(await listLibraryMusic(env,new URL(request.url).searchParams));
});}
