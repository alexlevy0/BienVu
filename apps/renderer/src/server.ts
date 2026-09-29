import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile, rm, stat} from 'node:fs/promises';
import {timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {ProbeRender} from '@bienvu/contracts';
import {renderInProcess} from './render-process';
import {outputDir} from './paths';
import {VideoService} from './video-service';

// Un serveur Node et au plus un calcul enfant. L'état durable est dans le contrôleur.
// Les fichiers/états locaux ne sont jamais présentés comme récupérables après destruction.
let active: string | null = null;
const jobs = new Map<string,{fixture:string;status:string;error?:string;report?:unknown}>();
const token = process.env.RENDER_TOKEN;
if (!token || token.length<32) throw new Error('RENDER_TOKEN_REQUIRED');
const bootedAt = new Date().toISOString();
const shutdown=new AbortController();
const videos=new VideoService({root:path.join(outputDir,'videos'),signal:shutdown.signal,
  claim:id=>{if(active)return false;active=id;return true;},release:id=>{if(active===id)active=null;}});
process.once('SIGTERM',()=>{shutdown.abort();setTimeout(()=>process.exit(0),1000).unref();});
createServer(async(req,res)=>{
  const json = (body:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  try {
    const supplied = req.headers.authorization?.replace(/^Bearer /,'')??'';
    if(Buffer.byteLength(supplied)!==Buffer.byteLength(token)||!timingSafeEqual(Buffer.from(token),Buffer.from(supplied))) return json({error:'UNAUTHORIZED'},401);
    const url = new URL(req.url??'/', 'http://localhost');
    if(url.pathname==='/health') return json({ok:true,active,bootedAt,uptimeSeconds:process.uptime()});
    if(await videos.handle(req,res))return;
    if(req.method==='POST'&&url.pathname==='/jobs') {
      let raw=''; for await(const chunk of req) {raw+=chunk.toString();if(raw.length>1024) return json({error:'BODY_TOO_LARGE'},413);}
      const parsed = ProbeRender.safeParse(JSON.parse(raw));
      if(!parsed.success) return json({error:'INVALID_INPUT'},400);
      const {id,fixture} = parsed.data; const known = jobs.get(id);
      if(known) return known.fixture===fixture?json({id,...known},known.status==='ready'?200:202):json({error:'IDEMPOTENCY_CONFLICT'},409);
      if(active) return json({error:'RENDER_BUSY'},409);
      active=id; jobs.set(id,{fixture,status:'rendering'});
      // Le calcul est isolé ; le parent sert le statut et borne la durée du processus.
      void renderInProcess(parsed.data,shutdown.signal).then(report=>jobs.set(id,{fixture,status:'ready',report})).catch(async(error:unknown)=>{
        let report:unknown;try{report=JSON.parse(await readFile(path.join(outputDir,`${id}.failed.json`),'utf8'));}catch{report={error:error instanceof Error?error.message:'RENDER_PROCESS_FAILED',diagnostic:error instanceof Error?error.cause:undefined,synthetic:true};}
        jobs.set(id,{fixture,status:'failed',error:'RENDER_FAILED',report});
      }).finally(()=>{active=null;});
      return json({id,status:'accepted'},202);
    }
    const match=url.pathname.match(/^\/jobs\/([a-z0-9][a-z0-9-]{0,63})(\/file)?$/);
    if(match) {
      const id=match[1]; const job=jobs.get(id);
      if(!job) return json({error:'RENDER_NOT_FOUND'},404);
      if(req.method==='GET'&&!match[2]) return json({id,...job});
      if(req.method==='DELETE'&&!match[2]) {
        if(active===id) return json({error:'RENDER_BUSY'},409);
        await rm(path.join(outputDir,`${id}.mp4`),{force:true});await rm(path.join(outputDir,`${id}.json`),{force:true});jobs.delete(id);
        return json({ok:true});
      }
      if(req.method==='GET'&&match[2]&&job.status==='ready') {
        const file=path.join(outputDir,`${id}.mp4`);
        res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':(await stat(file)).size,'Cache-Control':'no-store'});
        createReadStream(file).pipe(res);return;
      }
    }
    return json({error:'NOT_FOUND'},404);
  }catch {json({error:'INVALID_REQUEST_OR_RENDERER_ERROR'},400);}
}).listen(Number(process.env.PORT??8080),'0.0.0.0');
