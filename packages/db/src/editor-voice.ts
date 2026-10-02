import {EditorVoiceSource} from '@bienvu/contracts';
import type {Database} from './index';
export {EditorVoiceSource} from '@bienvu/contracts';
export async function findEditorVoiceSource(db:Database,agencyId:string,importId:string,id:string):Promise<EditorVoiceSource|null>{
  const row=await db.prepare(`SELECT v.source_json AS source FROM editor_voice_sources v JOIN listing_imports i ON i.id=v.import_id AND i.agency_id=v.agency_id
    WHERE v.agency_id=? AND v.import_id=? AND v.id=? AND i.status!='deleting' AND i.expires_at>?`)
    .bind(agencyId,importId,id,new Date().toISOString()).first<{source:string}>();
  if(!row)return null;
  const parsed=EditorVoiceSource.safeParse(JSON.parse(row.source));
  if(!parsed.success||parsed.data.preview.id!==id||parsed.data.audio.some(a=>!a.objectKey.startsWith(`agencies/${agencyId}/imports/${importId}/voice/`)))return null;
  return parsed.data;
}
