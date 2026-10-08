// Node-only previews. Originals and generation assets are never modified.
import sharp from 'sharp';
import {ImportFailure} from '../packages/contracts/src/index';
import {IMPORT_LIMITS} from '../packages/importers/src/network';

export async function photoPreview(bytes:Uint8Array,mime:string){
  if(mime!=='image/jpeg'||!bytes.length||bytes.length>IMPORT_LIMITS.imageBytes)
    throw new ImportFailure('INSUFFICIENT_PHOTOS','Invalid preview input.');
  try{
    const image=sharp(bytes,{limitInputPixels:2048*2048,failOn:'warning',animated:false}).timeout({seconds:5});
    const meta=await image.metadata();
    if(meta.format!=='jpeg'||!meta.width||!meta.height||(meta.pages??1)>1)throw new Error('INVALID_IMAGE');
    const {data,info}=await image.rotate().resize({width:640,height:640,fit:'inside',withoutEnlargement:true})
      .webp({quality:65,effort:3}).toBuffer({resolveWithObject:true});
    if(data.length>256*1024)throw new Error('PREVIEW_TOO_LARGE');
    return {bytes:new Uint8Array(data),width:info.width,height:info.height,mime:'image/webp'};
  }catch{throw new ImportFailure('INSUFFICIENT_PHOTOS','Preview image unavailable.');}
}

// Gallery previews may wait for a slot; scraping keeps its existing immediate
// concurrency limit. Admission and waiting are bounded and cancellable.
export class ImportWorkSlots{
  private active=0;
  private waiting:Array<{take():void;cancel():void}>=[];
  constructor(private maximum=2,private maximumWaiting=12){}
  tryAcquire():(()=>void)|undefined{
    if(this.active>=this.maximum)return undefined;
    this.active++;let released=false;
    return()=>{if(released)return;released=true;this.active--;this.waiting.shift()?.take();};
  }
  async acquire(signal:AbortSignal):Promise<()=>void>{
    signal.throwIfAborted();const release=this.tryAcquire();if(release)return release;
    if(this.waiting.length>=this.maximumWaiting)throw new ImportFailure('SOURCE_UNAVAILABLE','Preview queue full.');
    return new Promise((resolve,reject)=>{
      const entry={take:()=>{signal.removeEventListener('abort',entry.cancel);resolve(this.tryAcquire()!);},
        cancel:()=>{this.waiting=this.waiting.filter(item=>item!==entry);reject(signal.reason);}};
      this.waiting.push(entry);signal.addEventListener('abort',entry.cancel,{once:true});
    });
  }
}
