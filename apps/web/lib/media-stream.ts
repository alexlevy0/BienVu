import type {VideoAsset} from '@bienvu/contracts';
import {RequestFailure} from './http';
export async function streamPrivateAsset(request:Request,bucket:Pick<R2Bucket,'head'|'get'>,asset:VideoAsset,prefix:string){
 if(!asset.objectKey.startsWith(prefix))throw new RequestFailure('NOT_FOUND');
 const head=await bucket.head(asset.objectKey);if(!head||head.size!==asset.sizeBytes||head.customMetadata?.sha256!==asset.sha256)throw new RequestFailure('NOT_FOUND');
 let offset=0,end=head.size-1;const range=request.headers.get('range');
 if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);
  if(!match||!match[1]&&!match[2])return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});
  if(match[1]){offset=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}else offset=Math.max(0,head.size-Number(match[2]));
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(end)||offset<0||offset>=head.size||end<offset)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});
 }
 const length=end-offset+1,headers={'Content-Type':asset.mime,'Content-Length':String(length),'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${offset}-${end}/${head.size}`}:{})};
 if(request.method==='HEAD')return new Response(null,{status:range?206:200,headers});
 const object=await bucket.get(asset.objectKey,{range:{offset,length}});if(!object)throw new RequestFailure('NOT_FOUND');
 return new Response(object.body,{status:range?206:200,headers});
}
