import {RequestFailure} from './http';

// Caller checks catalogue visibility before reaching this helper. This serves
// existing public demo clips, never private generated project videos.
export async function streamAvatarCatalogue(request:Request,bucket:Pick<R2Bucket,'head'|'get'>,key:string){
  const head=await bucket.head(key);if(!head||!head.size)throw new RequestFailure('NOT_FOUND');
  const headers=new Headers({'Content-Type':head.httpMetadata?.contentType??'application/octet-stream',
    'ETag':head.httpEtag,'Accept-Ranges':'bytes','Content-Length':String(head.size)});
  if(request.headers.get('if-none-match')?.split(',').map(v=>v.trim()).some(v=>v===head.httpEtag||v==='*')){
    headers.delete('Content-Length');return new Response(null,{status:304,headers});
  }
  const range=request.headers.get('range'),useRange=range&&(!request.headers.has('if-range')||request.headers.get('if-range')===head.httpEtag);
  let offset=0,end=head.size-1;
  if(useRange){const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!match||!match[1]&&!match[2])return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});
    if(match[1]){offset=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
    else {const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});offset=Math.max(0,head.size-suffix);}
    if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(end)||offset<0||offset>=head.size||end<offset)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});
    headers.set('Content-Range',`bytes ${offset}-${end}/${head.size}`);headers.set('Content-Length',String(end-offset+1));
  }
  if(request.method==='HEAD')return new Response(null,{status:useRange?206:200,headers});
  const object=await bucket.get(key,useRange?{range:{offset,length:end-offset+1}}:undefined);if(!object)throw new RequestFailure('NOT_FOUND');
  return new Response(object.body,{status:useRange?206:200,headers});
}
