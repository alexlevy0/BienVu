import {propertyFacts,propertyPrice,type PropertySummary} from '@bienvu/contracts';

export async function propertyVisual(property:PropertySummary):Promise<Blob>{
  if(!property.coverUrl)throw new Error('Ajoutez une photo au bien pour créer ce visuel.');
  const image=new Image();image.src=property.coverUrl;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=900;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Le téléchargement du visuel est indisponible.');
  const scale=Math.max(canvas.width/image.naturalWidth,canvas.height/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;
  ctx.drawImage(image,(1200-w)/2,(900-h)/2,w,h);
  ctx.fillStyle='#fffffff0';ctx.fillRect(100,570,1000,255);ctx.textAlign='center';ctx.fillStyle='#171914';
  const fit=(text:string,size:number,y:number,font='Georgia')=>{ctx.font=`${size}px ${font}`;while(ctx.measureText(text).width>930&&size>18)ctx.font=`${--size}px ${font}`;ctx.fillText(text,600,y);};
  fit(property.fields.locality??property.title,27,617,'Arial');fit(propertyPrice(property.fields)||property.title,72,704);
  fit(propertyFacts({...property.fields,locality:null}),30,766,'Arial');
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Le visuel n’a pas pu être préparé.')),'image/png'));
}
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
// STORE records: videos and PNGs are already compressed. A standard ZIP keeps
// accents in file names and requires no server-side copies of private media.
export function propertyZip(files:{name:string;bytes:Uint8Array}[]):Blob{
  const chunks:BlobPart[]=[],central:BlobPart[]=[];let offset=0,centralSize=0;
  for(const file of files){const name=new TextEncoder().encode(file.name),crc=crc32(file.bytes),header=new Uint8Array(30+name.length),h=new DataView(header.buffer);
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);
    h.setUint32(18,file.bytes.length,true);h.setUint32(22,file.bytes.length,true);h.setUint16(26,name.length,true);header.set(name,30);
    const directory=new Uint8Array(46+name.length),d=new DataView(directory.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);
    d.setUint16(14,33,true);d.setUint32(16,crc,true);d.setUint32(20,file.bytes.length,true);d.setUint32(24,file.bytes.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);directory.set(name,46);
    chunks.push(header,file.bytes as Uint8Array<ArrayBuffer>);central.push(directory);offset+=header.length+file.bytes.length;centralSize+=directory.length;
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
  return new Blob([...chunks,...central,end],{type:'application/zip'});
}
export async function boundedDownload(url:string,remaining:number,signal:AbortSignal){
  const response=await fetch(url,{signal,cache:'no-store'});if(!response.ok)throw new Error('Un contenu n’est plus disponible. Actualisez le bien.');
  if(Number(response.headers.get('content-length'))>remaining){await response.body?.cancel();throw new Error('Téléchargez les vidéos individuellement : cet ensemble dépasse 200 Mo.');}
  const reader=response.body?.getReader();if(!reader)throw new Error('Le téléchargement n’a pas pu démarrer.');
  const chunks:Uint8Array[]=[];let size=0;try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;
    if(size>remaining){await reader.cancel();throw new Error('Téléchargez les vidéos individuellement : cet ensemble dépasse 200 Mo.');}chunks.push(part.value);}}
  finally{reader.releaseLock();}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
