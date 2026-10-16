import {readFile} from 'node:fs/promises';
import type {AvatarLook} from '../packages/contracts/src/index';
export async function avatarPublicationFixture(db:D1Database,ids:string[],defaultLookId=ids[0]??null){
  if(!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='avatar_publication'").first())
    await db.exec((await readFile(new URL('../packages/db/migrations/0077_avatar_publication.sql',import.meta.url),'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  const rows=await db.prepare('SELECT look_json AS data FROM avatar_looks').all<{data:string}>(),looks=new Map(rows.results.map(row=>{const look=JSON.parse(row.data) as AvatarLook;return [look.id,look];}));
  const publication={groups:ids.map(id=>({id,name:looks.get(id)!.name.slice(0,100),lookIds:[id],recommended:id===defaultLookId})),defaultLookId};
  await db.prepare('UPDATE avatar_publication SET publication_json=? WHERE id=1').bind(JSON.stringify(publication)).run();
}
