import {AvatarGallery,type AvatarLook} from '@bienvu/contracts';

// Entire groups may span several catalogue pages. Read every page before any
// mutation; never interpret the first 32 looks as the complete person.
export async function loadAdminAvatarGroup(groupId:string,signal:AbortSignal,fetcher:typeof fetch=fetch){
  const looks=new Map<string,AvatarLook>();let offset=0,total:number|undefined;
  for(let page=0;page<157;page++){
    const response=await fetcher('/api/admin/avatars?'+new URLSearchParams({catalog:'1',groupId,offset:String(offset)}),{cache:'no-store',signal});
    if(!response.ok)throw Error('Impossible de charger ce groupe. Réessayez.');
    const data=AvatarGallery.parse(await response.json());
    if(data.offset!==offset||total!==undefined&&data.total!==total||data.looks.some(look=>(look.groupId??look.id)!==groupId)||data.hasMore&&!data.looks.length)throw Error('Le catalogue a changé. Rechargez ce groupe.');
    total=data.total;
    for(const look of data.looks)looks.set(look.id,look);
    if(!data.hasMore){if(looks.size!==total)throw Error('Le catalogue a changé. Rechargez ce groupe.');return [...looks.values()];}offset+=32;
  }
  throw Error('Le groupe dépasse la capacité du catalogue.');
}
