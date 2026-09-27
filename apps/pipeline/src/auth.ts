import {timingSafeEqual} from 'node:crypto';
export const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function authorized(request:Request,token?:string) {
  const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
  return !!token&&token.length>=32&&Buffer.byteLength(supplied)===Buffer.byteLength(token)&&timingSafeEqual(Buffer.from(supplied),Buffer.from(token));
}
export async function smallJson(request:Request) {
  const reader=request.body?.getReader();if(!reader)throw new Error('EMPTY_BODY');
  let result='';try {while(true){const part=await reader.read();if(part.done)break;result+=new TextDecoder().decode(part.value);if(result.length>2048)throw new Error('BODY_TOO_LARGE');}}finally{await reader.cancel();}
  return JSON.parse(result) as unknown;
}
