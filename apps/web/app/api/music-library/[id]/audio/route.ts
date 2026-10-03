import {requireOwner} from '../../../../../lib/owner';
import {respond} from '../../../../../lib/http';
import {libraryMusicAudio} from '../../../../../lib/music-library';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return respond(async()=>{
  const {env}=await requireOwner(request);return libraryMusicAudio(env,(await params).id,request);
});}
