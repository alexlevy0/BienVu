import {AvatarPublication,AvatarLook,AvatarGallery,type AvatarGalleryQuery,type AdminAvatarCatalogQuery} from '@bienvu/contracts';
import type {Database} from './index';

export async function readAvatarPublication(db:Database){
  const row=await db.prepare('SELECT publication_json AS data,revision FROM avatar_publication WHERE id=1').first<{data:string;revision:number}>();
  return {publication:AvatarPublication.parse(row?JSON.parse(row.data):{groups:[],defaultLookId:null}),revision:row?.revision??1};
}
function available(alias:string,premium:boolean){return `${alias}.enabled=1 AND json_extract(${alias}.look_json,'$.ownership')='public' AND EXISTS(SELECT 1 FROM json_each(${alias}.look_json,'$.engines') WHERE value IN (${premium?"'avatar_iii','avatar_iv'":"'avatar_iii'"}))`;}

export async function publishedAvatarLooks(db:Database,groups:AvatarPublication['groups'],premium:boolean){
  const row=await db.prepare(`SELECT json_group_array(json(record)) AS data FROM (
    SELECT json_set(a.look_json,'$.publication',json_object('presenterId',json_extract(g.value,'$.id'),'name',json_extract(g.value,'$.name'),
      'recommended',json(IIF(json_extract(g.value,'$.recommended')=1,'true','false')))) AS record
    FROM json_each(?) g JOIN json_each(g.value,'$.lookIds') v JOIN avatar_looks a ON a.id=v.value
    WHERE ${available('a',premium)} ORDER BY json_extract(g.value,'$.recommended') DESC,CAST(g.key AS INTEGER),CAST(v.key AS INTEGER)
  )`).bind(JSON.stringify(groups)).first<{data:string}>();
  return (JSON.parse(row?.data??'[]') as unknown[]).map(value=>AvatarLook.parse(value));
}
export async function publishedAvatarGallery(db:Database,input:AvatarGalleryQuery,premium:boolean){
  const {publication,revision}=await readAvatarPublication(db),query='%'+input.query.replace(/[\\%_]/g,'\\$&')+'%';
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
  const looks=(await publishedAvatarLooks(db,groups,premium)).filter(look=>input.gender==='all'||look.gender===input.gender);
  return AvatarGallery.parse({looks,total:count?.total??0,offset:input.offset,hasMore:input.offset+groups.length<(count?.total??0),revision});
}
export async function publishAvatarSelection(db:Database,actor:string,input:unknown,revision:number){
  const publication=AvatarPublication.parse(input);
  await db.prepare('INSERT INTO avatar_publication_events(id,actor_id,expected_revision,publication_json,created_at) VALUES(?,?,?,?,?)')
    .bind(crypto.randomUUID(),actor,revision,JSON.stringify(publication),new Date().toISOString()).run();
  return readAvatarPublication(db);
}
export async function adminAvatarCatalog(db:Database,input:AdminAvatarCatalogQuery,premium:boolean){
  const query='%'+input.query.replace(/[\\%_]/g,'\\$&')+'%',where=`(?='all' OR json_extract(a.look_json,'$.gender')=?)
    AND (?='all' OR json_extract(a.look_json,'$.type')=?) AND json_extract(a.look_json,'$.name') LIKE ? ESCAPE '\\'
    AND (?='all' OR (?='available' AND ${available('a',premium)}) OR (?='unavailable' AND NOT (${available('a',premium)})))`;
  const params=[input.gender,input.gender,input.type,input.type,query,input.availability,input.availability,input.availability];
  const [count,page]=await Promise.all([
    db.prepare(`SELECT count(*) AS total FROM avatar_looks a WHERE ${where}`).bind(...params).first<{total:number}>(),
    db.prepare(`SELECT json_group_array(json(look_json)) AS data FROM (SELECT a.look_json FROM avatar_looks a WHERE ${where}
      ORDER BY json_extract(a.look_json,'$.name') COLLATE NOCASE,a.id LIMIT 32 OFFSET ?)`).bind(...params,input.offset).first<{data:string}>()
  ]);
  const looks=JSON.parse(page?.data??'[]');return AvatarGallery.parse({looks,total:count?.total??0,offset:input.offset,hasMore:input.offset+looks.length<(count?.total??0)});
}
