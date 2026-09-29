import type {IncomingMessage,ServerResponse} from 'node:http';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,readdir,rename,rm,stat,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {VideoManifest,VideoSubmission,VideoReport,videoAssets,videoAssetFile,videoManifestHash} from '@bienvu/contracts';
import {parseRange} from './listing-render';
import {renderVideoInProcess} from './render-process';

type State={id:string;status:'staging'|'rendering'|'ready'|'failed';startedAt?:string;error?:string;report?:VideoReport};
type Options={root:string;signal?:AbortSignal;claim:(id:string)=>boolean;release:(id:string)=>void;run?:typeof renderVideoInProcess};
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
async function body(req:IncomingMessage,max:number) {
  let size=0;const chunks:Buffer[]=[];
  for await(const chunk of req){size+=chunk.length;if(size>max)throw new Error('VIDEO_BODY_TOO_LARGE');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
const json=(res:ServerResponse,value:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
export class VideoService {
  private readonly initialized:Promise<void>;
  private readonly running=new Map<string,AbortController>();
  constructor(private options:Options) {this.initialized=this.initialize();}
  private dir(id:string){return path.join(this.options.root,id);}
  private async load(id:string):Promise<State|null> {
    try{return JSON.parse(await readFile(path.join(this.dir(id),'state.json'),'utf8')) as State;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  }
  private async save(state:State) {
    const dir=this.dir(state.id),temp=path.join(dir,`.state-${randomUUID()}.json`);
    await writeFile(temp,JSON.stringify(state)+'\n',{mode:0o600});await rename(temp,path.join(dir,'state.json'));
  }
  private async cleanup(id:string) {
    for(const file of await readdir(this.dir(id)))if(!['state.json','manifest.json'].includes(file))await rm(path.join(this.dir(id),file),{force:true,recursive:true});
  }
  private async initialize() {
    await mkdir(this.options.root,{recursive:true,mode:0o700});
    for(const id of await readdir(this.options.root)) {
      if(!/^[a-f0-9]{64}$/.test(id))continue;
      const state=await this.load(id);
      if(state?.status==='rendering'){await this.save({...state,status:'failed',error:'VIDEO_RENDER_INTERRUPTED'});await this.cleanup(id);}
    }
  }
  async handle(req:IncomingMessage,res:ServerResponse):Promise<boolean> {
    const url=new URL(req.url??'/','http://localhost');
    if(!url.pathname.startsWith('/videos'))return false;
    await this.initialized;
    try {
      if(url.pathname==='/videos'&&req.method==='POST') {
        const input=VideoSubmission.parse(JSON.parse((await body(req,64_000)).toString('utf8')));
        if(await videoManifestHash(input.manifest)!==input.id)throw new Error('VIDEO_MANIFEST_HASH_MISMATCH');
        const directory=this.dir(input.id);await mkdir(directory,{recursive:true,mode:0o700});
        try{await writeFile(path.join(directory,'manifest.json'),JSON.stringify(input.manifest),{flag:'wx',mode:0o600});}
        catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
        const stored=VideoManifest.parse(JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8')));
        if(await videoManifestHash(stored)!==input.id)throw new Error('VIDEO_MANIFEST_CONFLICT');
        const previous=await this.load(input.id);
        if(previous){json(res,previous,previous.status==='ready'?200:202);return true;}
        const state:State={id:input.id,status:'staging'};
        try{await writeFile(path.join(directory,'state.json'),JSON.stringify(state),{flag:'wx',mode:0o600});}
        catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
        json(res,await this.load(input.id),202);return true;
      }
      const match=url.pathname.match(/^\/videos\/([a-f0-9]{64})(?:\/(file|start|cancel|assets\/([a-zA-Z0-9_-]{1,64})))?$/);
      if(!match){json(res,{error:'NOT_FOUND'},404);return true;}
      const id=match[1],state=await this.load(id);if(!state){json(res,{error:'NOT_FOUND'},404);return true;}
      const directory=this.dir(id),manifest=VideoManifest.parse(JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8')));
      if(await videoManifestHash(manifest)!==id)throw new Error('VIDEO_MANIFEST_CONFLICT');
      if(!match[2]&&req.method==='GET'){json(res,state);return true;}
      if(match[3]&&req.method==='PUT') {
        if(state.status!=='staging'){json(res,{error:'VIDEO_ALREADY_STARTED'},409);return true;}
        const asset=videoAssets(manifest).find(a=>a.id===match[3]);
        if(!asset){json(res,{error:'VIDEO_ASSET_NOT_FOUND'},404);return true;}
        const bytes=await body(req,asset.sizeBytes);
        if(bytes.length!==asset.sizeBytes||sha(bytes)!==asset.sha256)throw new Error('VIDEO_ASSET_HASH_MISMATCH');
        const file=path.join(directory,videoAssetFile(asset));
        try{await writeFile(file,bytes,{mode:0o600,flag:'wx'});}catch(error){
          if((error as NodeJS.ErrnoException).code!=='EEXIST'||sha(await readFile(file))!==asset.sha256)throw new Error('VIDEO_ASSET_CONFLICT');
        }
        json(res,{ok:true});return true;
      }
      if(match[2]==='start'&&req.method==='POST') {
        if(state.status!=='staging'){json(res,state,state.status==='failed'?409:state.status==='ready'?200:202);return true;}
        if(this.running.has(id)){json(res,{id,status:'rendering'},202);return true;}
        for(const asset of videoAssets(manifest)) {
          const info=await stat(path.join(directory,videoAssetFile(asset))).catch(()=>null);
          if(!info||info.size!==asset.sizeBytes)throw new Error('VIDEO_ASSET_MISSING');
        }
        if(!this.options.claim(id)){json(res,{error:'RENDER_BUSY'},409);return true;}
        const abort=new AbortController();this.running.set(id,abort);
        const signal=this.options.signal?AbortSignal.any([abort.signal,this.options.signal]):abort.signal;
        try{await this.save({id,status:'rendering',startedAt:new Date().toISOString()});}
        catch(error){this.running.delete(id);this.options.release(id);throw error;}
        void (this.options.run??renderVideoInProcess)(directory,id,signal).then(async report=>{
          if(report.id!==id||report.watermarked!==manifest.rights.watermarked)throw new Error('VIDEO_REPORT_INVALID');
          await this.save({id,status:'ready',report});
        }).catch(async(error:unknown)=>{
          const code=error instanceof Error&&/^[A-Z_]{3,64}$/.test(error.message)?error.message:'VIDEO_RENDER_FAILED';
          await this.save({id,status:'failed',error:code});await this.cleanup(id);
        }).finally(()=>{this.running.delete(id);this.options.release(id);}).catch(()=>{/* État rendering récupéré comme interruption au prochain démarrage. */});
        json(res,{id,status:'rendering'},202);return true;
      }
      if(match[2]==='cancel'&&req.method==='POST') {
        this.running.get(id)?.abort();json(res,{id,cancelling:this.running.has(id)});return true;
      }
      if(!match[2]&&req.method==='DELETE') {
        if(this.running.has(id)){json(res,{error:'RENDER_BUSY'},409);return true;}
        await this.cleanup(id);json(res,{ok:true});return true;
      }
      if(match[2]==='file'&&['GET','HEAD'].includes(req.method??'')) {
        if(state.status!=='ready'||!state.report){json(res,{error:'VIDEO_NOT_READY'},409);return true;}
        const file=path.join(directory,'video.mp4'),size=(await stat(file)).size;
        if(size!==state.report.sizeBytes)throw new Error('VIDEO_ARTIFACT_INVALID');
        const range=parseRange(req.headers.range,size);
        if(range===false){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return true;}
        res.writeHead(range?206:200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'no-store',
          'Content-Length':range?range.end-range.start+1:size,...(range?{'Content-Range':`bytes ${range.start}-${range.end}/${size}`}:{})});
        if(req.method==='HEAD')res.end();else createReadStream(file,range||{}).on('error',()=>res.destroy()).pipe(res);
        return true;
      }
      json(res,{error:'METHOD_NOT_ALLOWED'},405);return true;
    }catch(error){json(res,{error:error instanceof Error&&/^[A-Z_]{3,64}$/.test(error.message)?error.message:'VIDEO_INVALID_REQUEST'},400);return true;}
  }
}
