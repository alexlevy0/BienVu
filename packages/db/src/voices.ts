import {VideoVoice,DEFAULT_VIDEO_VOICE,VoiceFailure,VoiceText,CARTESIA_FREE_CHARACTERS} from '@bienvu/contracts';
import type {Database} from './index';

export async function voiceSettings(db:Database){
  const row=await db.prepare('SELECT voice_id AS voice,revision,updated_at AS updatedAt FROM voice_settings WHERE id=1').first<{voice:string;revision:number;updatedAt:string}>();
  return {voice:VideoVoice.parse(row?.voice??DEFAULT_VIDEO_VOICE),revision:row?.revision??1,updatedAt:row?.updatedAt??null};
}
export async function setDefaultVoice(db:Database,actorId:string,voice:unknown,revision:number,now=Date.now()){
  const current=await voiceSettings(db),selected=VideoVoice.parse(voice);
  await db.prepare('INSERT INTO voice_setting_events(id,actor_id,previous_voice,voice_id,expected_revision,created_at) VALUES(?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),actorId,current.voice,selected,revision,new Date(now).toISOString()).run();
  return voiceSettings(db);
}
export async function cartesiaFreeUsage(db:Database,now=Date.now()){
  const since=new Date(now-31*86400_000).toISOString(),at=new Date(now).toISOString();
  const row=await db.prepare(`SELECT coalesce(sum(characters),0) AS used,count(*) AS calls,
    coalesce(sum(CASE WHEN state='pending' AND lease_until>? THEN 1 ELSE 0 END),0) AS active FROM cartesia_usage WHERE created_at>?`)
    .bind(at,since).first<{used:number;calls:number;active:number}>();
  return {limit:CARTESIA_FREE_CHARACTERS,used:row?.used??0,remaining:Math.max(0,CARTESIA_FREE_CHARACTERS-(row?.used??0)),active:row?.active??0,windowDays:31};
}
export async function reserveCartesiaVoice(db:Database,id:string,input:unknown,now=Date.now()){
  const text=VoiceText.parse(input),at=new Date(now).toISOString();
  try{await db.prepare("INSERT INTO cartesia_usage(id,characters,created_at,lease_until,state) VALUES(?,?,?,?,'pending')")
    .bind(id,text.length,at,new Date(now+90_000).toISOString()).run();
  }catch(cause){const code=String(cause);
    throw new VoiceFailure(code.includes('VOICE_FREE_LIMIT')?'VOICE_FREE_LIMIT':code.includes('VOICE_BUSY')?'VOICE_BUSY':'VOICE_PROBE_REVIEW_REQUIRED');}
}
export async function finishCartesiaVoice(db:Database,id:string,success:boolean){
  await db.prepare("UPDATE cartesia_usage SET state=? WHERE id=? AND state='pending'").bind(success?'done':'failed',id).run();
}
