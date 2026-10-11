import {publishProgressiveVideo} from '../apps/pipeline/src/progressive-video';
import {generationStream} from '../apps/web/lib/progressive-video';
import {ownGeneration} from '../apps/web/lib/generations';
export default {async fetch(request:Request,env:CloudflareEnv){
 const url=new URL(request.url);
 try{
  if(url.pathname==='/publish'){
   const body=await request.json() as {manifest:any;hash:string;stream:any;bytes:number[];corrupt?:boolean};
   await publishProgressiveVideo(env.MEDIA,async path=>path.endsWith('/stream')?Response.json(body.stream):
     new Response(new Uint8Array(body.corrupt?[9,9,9]:body.bytes)),body.manifest,body.hash);
   return Response.json({ok:true});
  }
  const row=await ownGeneration(env,url.searchParams.get('agency')!,url.searchParams.get('job')!);
  return await generationStream(request,env,row,url.searchParams.get('file')??undefined);
 }catch(error){return Response.json({error:(error as Error).message},{status:404});}
}};
