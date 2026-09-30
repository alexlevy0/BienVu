// Each request stays paginated; the browser follows cursors for its own workspace.
export async function readRecentPages<T extends {id:string}>(path:string,key:'jobs'|'imports',
  parse:(value:unknown)=>T,isCurrent:()=>boolean,fetcher:typeof fetch=fetch):Promise<T[]|null>{
  const entries=new Map<string,T>(),cursors=new Set<string>();let cursor:string|null=null;
  do{
    if(!isCurrent())return null;
    const params=new URLSearchParams(path.split('?')[1]);if(cursor)params.set('cursor',cursor);
    const url=path.split('?')[0]+(params.size?'?'+params.toString():'');
    const response=await fetcher(url,{cache:'no-store'});if(!response.ok)throw new Error('RECENTS_UNAVAILABLE');
    const data=await response.json() as Record<string,unknown>;if(!isCurrent())return null;
    if(!Array.isArray(data[key]))throw new Error('RECENTS_INVALID');
    for(const value of data[key]){const entry=parse(value);if(!entries.has(entry.id))entries.set(entry.id,entry);}
    const next=data.nextCursor??null;
    if(next!==null&&(typeof next!=='string'||!next||next.length>512||cursors.has(next)))throw new Error('RECENTS_CURSOR_INVALID');
    cursor=next as string|null;if(cursor)cursors.add(cursor);
  }while(cursor);
  return [...entries.values()];
}
