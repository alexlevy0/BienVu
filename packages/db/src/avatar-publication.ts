import {AvatarPublication,AvatarLook,AvatarGallery,groupAvatarPublication,type AvatarGalleryQuery,type AdminAvatarCatalogQuery} from '@bienvu/contracts';
import type {Database} from './index';

export async function readAvatarPublication(db:Database){
  const row=await db.prepare('SELECT publication_json AS data,revision FROM avatar_publication WHERE id=1').first<{data:string;revision:number}>();
  const publication=await groupedPublication(db,AvatarPublication.parse(row?JSON.parse(row.data):{groups:[],defaultLookId:null}));
  return {publication,revision:row?.revision??1};
}
async function groupedPublication(db:Database,publication:AvatarPublication){
  const row=await db.prepare(`SELECT json_group_array(json_object('id',a.id,'groupId',json_extract(a.look_json,'$.groupId'),'groupName',json_extract(a.look_json,'$.groupName'))) AS data
    FROM json_each(?) g JOIN json_each(g.value,'$.lookIds') v JOIN avatar_looks a ON a.id=v.value`)
    .bind(JSON.stringify(publication.groups)).first<{data:string}>();
  const rows=JSON.parse(row?.data??'[]') as {id:string;groupId:string|null;groupName:string|null}[];
  return groupAvatarPublication(publication,rows.map(row=>({id:row.id,groupId:row.groupId??undefined,groupName:row.groupName??undefined})));
}
function available(alias:string,premium:boolean){return `${alias}.enabled=1 AND json_extract(${alias}.look_json,'$.ownership')='public' AND EXISTS(SELECT 1 FROM json_each(${alias}.look_json,'$.engines') WHERE value IN (${premium?"'avatar_iii','avatar_iv'":"'avatar_iii'"}))`;}
function preview(alias:string){return `json_object('id',${alias}.id,'name',json_extract(${alias}.look_json,'$.name'),'thumbnail',json_extract(${alias}.look_json,'$.thumbnail'),'preview',json_extract(${alias}.look_json,'$.preview'))`;}

export async function avatarIdentities(db:Database){
  const row=await db.prepare(`SELECT json_group_array(json_object('id',id,'groupId',json_extract(look_json,'$.groupId'),'groupName',json_extract(look_json,'$.groupName'))) AS data FROM avatar_looks`).first<{data:string}>();
  return (JSON.parse(row?.data??'[]') as {id:string;groupId:string|null;groupName:string|null}[])
    .map(row=>({id:row.id,groupId:row.groupId??undefined,groupName:row.groupName??undefined}));
}

export async function publishedAvatarLooks(db:Database,groups:AvatarPublication['groups'],premium:boolean,summaries=false,gender='all'){
  const row=await db.prepare(`SELECT json_group_array(json(record)) AS data FROM (SELECT ${summaries?"json_set(record,'$.variantsCount',variants,'$.groupPreviews',json(previews))":'record'} AS record FROM (
    SELECT json_set(a.look_json,'$.publication',json_object('presenterId',json_extract(g.value,'$.id'),'name',json_extract(g.value,'$.name'),
      'recommended',json(IIF(json_extract(g.value,'$.recommended')=1,'true','false')))) AS record,
      row_number() OVER(PARTITION BY g.key ORDER BY CAST(v.key AS INTEGER)) AS position,
      count(*) OVER(PARTITION BY g.key) AS variants,CAST(g.key AS INTEGER) AS group_order,CAST(v.key AS INTEGER) AS look_order,
      json_group_array(${preview('a')}) OVER(PARTITION BY g.key ORDER BY CAST(v.key AS INTEGER) ROWS BETWEEN CURRENT ROW AND 2 FOLLOWING) AS previews,
      json_extract(g.value,'$.recommended') AS recommended
    FROM json_each(?) g JOIN json_each(g.value,'$.lookIds') v JOIN avatar_looks a ON a.id=v.value
    WHERE ${available('a',premium)} AND (?='all' OR json_extract(a.look_json,'$.gender')=?)
  ) ${summaries?'WHERE position=1':''} ORDER BY recommended DESC,group_order,look_order)`).bind(JSON.stringify(groups),gender,gender).first<{data:string}>();
  return (JSON.parse(row?.data??'[]') as unknown[]).map(value=>AvatarLook.parse(value));
}
export async function publishedAvatarGallery(db:Database,input:AvatarGalleryQuery,premium:boolean){
  const {publication,revision}=await readAvatarPublication(db),query='%'+input.query.replace(/[\\%_]/g,'\\$&')+'%';
  if(input.groupId){
    const group=publication.groups.find(group=>group.id===input.groupId);
    const looks=group?await publishedAvatarLooks(db,[group],premium):[];
    return AvatarGallery.parse({looks:looks.slice(input.offset,input.offset+32),total:looks.length,offset:input.offset,hasMore:input.offset+32<looks.length,revision});
  }
  const where=`EXISTS(SELECT 1 FROM json_each(g.value,'$.lookIds') v JOIN avatar_looks a ON a.id=v.value
    WHERE ${available('a',premium)} AND (?='all' OR json_extract(a.look_json,'$.gender')=?)
    AND (json_extract(g.value,'$.name') LIKE ? ESCAPE '\\' OR json_extract(a.look_json,'$.name') LIKE ? ESCAPE '\\'))`;
  const params=[JSON.stringify(publication.groups),input.gender,input.gender,query,query];
  const [count,page]=await Promise.all([
    db.prepare(`SELECT count(*) AS total FROM json_each(?) g WHERE ${where}`).bind(...params).first<{total:number}>(),
    db.prepare(`SELECT json_group_array(json(record)) AS data FROM (SELECT g.value AS record FROM json_each(?) g WHERE ${where}
      ORDER BY json_extract(g.value,'$.recommended') DESC,CAST(g.key AS INTEGER) LIMIT 32 OFFSET ?)`).bind(...params,input.offset).first<{data:string}>()
  ]);
  const groups=JSON.parse(page?.data??'[]') as AvatarPublication['groups'];
  const looks=(await publishedAvatarLooks(db,groups,premium,true,input.gender)).filter(look=>input.gender==='all'||look.gender===input.gender);
  return AvatarGallery.parse({looks,total:count?.total??0,offset:input.offset,hasMore:input.offset+groups.length<(count?.total??0),revision});
}
export async function publishAvatarSelection(db:Database,actor:string,input:unknown,revision:number){
  const publication=await groupedPublication(db,AvatarPublication.parse(input));
  await db.prepare('INSERT INTO avatar_publication_events(id,actor_id,expected_revision,publication_json,created_at) VALUES(?,?,?,?,?)')
    .bind(crypto.randomUUID(),actor,revision,JSON.stringify(publication),new Date().toISOString()).run();
  return readAvatarPublication(db);
}
export async function adminAvatarCatalog(db:Database,input:AdminAvatarCatalogQuery,premium:boolean){
  const query='%'+input.query.replace(/[\\%_]/g,'\\$&')+'%',identity="coalesce(json_extract(a.look_json,'$.groupId'),a.id)";
  const where=`(?='all' OR json_extract(a.look_json,'$.gender')=?)
    AND (?='all' OR json_extract(a.look_json,'$.type')=?)
    AND (json_extract(a.look_json,'$.name') LIKE ? ESCAPE '\\' OR json_extract(a.look_json,'$.groupName') LIKE ? ESCAPE '\\')
    AND (?='all' OR (?='available' AND ${available('a',premium)}) OR (?='unavailable' AND NOT (${available('a',premium)})))
    AND (? IS NULL OR ${identity}=?)`;
  const params=[input.gender,input.gender,input.type,input.type,query,query,input.availability,input.availability,input.availability,input.groupId??null,input.groupId??null];
  const [count,page]=await Promise.all([
    db.prepare(`SELECT count(${input.groupId?'*':`DISTINCT ${identity}`}) AS total FROM avatar_looks a WHERE ${where}`).bind(...params).first<{total:number}>(),
    db.prepare(`SELECT json_group_array(json(record)) AS data FROM (SELECT ${input.groupId?'look_json':"json_set(look_json,'$.variantsCount',variants,'$.groupPreviews',json(previews))"} AS record FROM (
      SELECT a.look_json,coalesce(json_extract(a.look_json,'$.groupName'),json_extract(a.look_json,'$.name')) AS name,a.id,
        row_number() OVER(PARTITION BY ${identity} ORDER BY ${available('a',premium)} DESC,a.id) AS position,
        json_group_array(${preview('a')}) OVER(PARTITION BY ${identity} ORDER BY ${available('a',premium)} DESC,a.id ROWS BETWEEN CURRENT ROW AND 2 FOLLOWING) AS previews,
        count(*) OVER(PARTITION BY ${identity}) AS variants FROM avatar_looks a WHERE ${where}
    ) ${input.groupId?'':'WHERE position=1'} ORDER BY name COLLATE NOCASE,id LIMIT 32 OFFSET ?)`).bind(...params,input.offset).first<{data:string}>()
  ]);
  const looks=JSON.parse(page?.data??'[]');return AvatarGallery.parse({looks,total:count?.total??0,offset:input.offset,hasMore:input.offset+looks.length<(count?.total??0)});
}
