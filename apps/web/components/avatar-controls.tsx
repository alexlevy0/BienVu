'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {AvatarCatalog,defaultAvatarCustomization,avatarVoiceWarning,avatarFrameStyle,avatarContentStyle,avatarCreditCost,avatarSupportsCutout,avatarCutoutStatus,catalogAvatarLook,AVATAR_SECONDS_PER_CREDIT,type AvatarCustomization,type AvatarLook,type AvatarPreviewClip} from '@bienvu/contracts';
import {measureAvatarElement} from '../lib/avatar-placement';
import {HomeIcon} from './home-icons';
import {trackProductEvent} from '../lib/product-analytics';
import {AvatarPicker} from './avatar-picker';

const catalogCache=new Map<string,{value:AvatarCatalog;expires:number}>(),catalogRequests=new Map<string,Promise<AvatarCatalog>>();
export function useAvatarCatalog(enabled=true,selected?:string){
  const [catalog,setCatalog]=useState<AvatarCatalog|null>(null),[error,setError]=useState('');
  useEffect(()=>{if(!enabled){setCatalog(null);return;}let alive=true,version=0;const key=selected??'';
    function load(force=false){
      const requestVersion=++version;if(force){catalogCache.clear();catalogRequests.delete(key);}const cached=catalogCache.get(key);
      if(cached&&cached.expires>Date.now()){setCatalog(cached.value);setError('');return;}
      let pending=catalogRequests.get(key);
      if(!pending){pending=fetch('/api/avatars'+(selected?'?'+new URLSearchParams({selected}):''),{cache:'no-store'}).then(async response=>{
        if(!response.ok)throw Error('Les présentateurs ne sont pas disponibles actuellement.');
        const value=AvatarCatalog.parse(await response.json()),newer=catalogCache.get(key);if(newer&&newer.value.revision>value.revision)return newer.value;catalogCache.set(key,{value,expires:Date.now()+15000});if(catalogCache.size>16)catalogCache.delete(catalogCache.keys().next().value!);return value;
      }).finally(()=>{if(catalogRequests.get(key)===pending)catalogRequests.delete(key);});catalogRequests.set(key,pending);}
      void pending.then(value=>{if(alive&&requestVersion===version){setCatalog(value);setError('');}}).catch(cause=>{if(alive&&requestVersion===version)setError(cause.message);});
    }
    load();const refresh=()=>load(true),channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('bienvu-avatar-publication');
    if(channel)channel.onmessage=refresh;window.addEventListener('focus',refresh);window.addEventListener('bienvu:avatars-published',refresh);
    return()=>{alive=false;channel?.close();window.removeEventListener('focus',refresh);window.removeEventListener('bienvu:avatars-published',refresh);};
  },[enabled,selected]);return {catalog,error};
}
export function AvatarWarning({avatar,voice,catalog}:{avatar?:AvatarCustomization;voice:string;catalog:AvatarCatalog|null}){
  const look=catalogAvatarLook(catalog,avatar?.lookId),message=avatar&&!avatar.hidden&&look?avatarVoiceWarning(voice,look.gender):null;
  return message?<p className="avatar-warning" role="status"><HomeIcon name="user" size={18}/>{message}</p>:null;
}
export function AvatarControls(p:{avatar?:AvatarCustomization;onChange(value:AvatarCustomization|undefined):void;voice:string;voiceEnabled:boolean;
  onEnableVoice?():void;authenticated:boolean;durationSeconds:number;busy?:boolean;catalog?:AvatarCatalog|null}){
  const loaded=useAvatarCatalog(p.catalog===undefined,p.avatar?.lookId),catalog=p.catalog??loaded.catalog;
  const look=catalogAvatarLook(catalog,p.avatar?.lookId),active=Boolean(p.avatar&&!p.avatar.hidden),patch=(next:Partial<AvatarCustomization>)=>p.avatar&&p.onChange({...p.avatar,...next});
  useEffect(()=>{if(active&&look&&p.avatar?.appearance==='cutout'&&!avatarSupportsCutout(look,p.avatar.engine))p.onChange({...p.avatar,appearance:'circle'});},[active,look,p.avatar,p.onChange]);
  const credits=avatarCreditCost(p.avatar?{...p.avatar,hidden:false}:undefined,p.durationSeconds)||1;
  function enable(){if(active){patch({hidden:true});return;}const id=p.avatar?.lookId??catalog?.defaultLookId??catalog?.looks[0]?.id;if(!id)return;
    const selected=catalogAvatarLook(catalog,id);if(!selected)return;
    const engine=p.avatar?.engine&&selected.engines.includes(p.avatar.engine)&&(p.avatar.engine==='avatar_iii'||catalog?.allowPremium)?p.avatar.engine:selected.engines.includes('avatar_iii')?'avatar_iii':'avatar_iv';
    p.onEnableVoice?.();p.onChange({...p.avatar??defaultAvatarCustomization(id),engine,hidden:undefined,maxSeconds:Math.min(p.avatar?.maxSeconds??6,catalog!.maxSeconds)});
    trackProductEvent('editor_action',{action:'avatar_enabled'});
  }
  return <section className="avatar-controls" aria-label="Avatar IA">
    <div className="avatar-intro"><div><h3>Présentateur IA</h3><p>Votre narration, incarnée par un avatar.</p></div><span className="avatar-credit" role="status">+ {credits} crédit{credits>1?'s':''}</span></div>
    <label className="customizer-checkbox"><input type="checkbox" checked={active} disabled={p.busy||!p.authenticated||!active&&(!catalog?.enabled||!catalog.looks.length&&!catalog.current)} onChange={enable}/>Ajouter un avatar IA</label>
    {!p.authenticated&&<p className="customizer-hint">Connectez-vous pour ajouter un avatar.</p>}
    {loaded.error&&!catalog&&<p className="customizer-error" role="alert">{loaded.error}</p>}
    {catalog&&!catalog.enabled&&<p className="customizer-hint">Les présentateurs seront disponibles prochainement.</p>}
    {active&&p.avatar&&<>
      {!look&&catalog&&<p className="avatar-warning" role="status">Ce présentateur n’est plus disponible. Choisissez-en un autre ou désactivez l’avatar.</p>}
      {!p.voiceEnabled&&<p className="avatar-warning" role="status">Activez la voix off pour synchroniser le présentateur.</p>}
      <AvatarPicker looks={catalog?.looks??[]} current={catalog?.current} selected={p.avatar.lookId} busy={p.busy} onSelect={item=>patch({lookId:item.id,
        engine:item.engines.includes(p.avatar!.engine)&&(p.avatar!.engine==='avatar_iii'||catalog?.allowPremium)?p.avatar!.engine:item.engines.includes('avatar_iii')?'avatar_iii':'avatar_iv',
        appearance:p.avatar!.appearance==='cutout'&&!avatarSupportsCutout(item)?'circle':p.avatar!.appearance})}/>
      <div className="avatar-fields">
        <label>Apparition<select value={p.avatar.moments} disabled={p.busy} onChange={e=>patch({moments:e.target.value as AvatarCustomization['moments']})}><option value="full">Pendant toute la vidéo</option><option value="both">Au début et à la fin</option><option value="intro">Au début</option><option value="outro">À la fin</option></select></label>
        <label>Présentation<select value={p.avatar.appearance} disabled={p.busy} onChange={e=>patch({appearance:e.target.value as AvatarCustomization['appearance']})}><option value="circle">Médaillon rond</option><option value="card">Cadre portrait</option>{avatarSupportsCutout(look,p.avatar.engine)&&<option value="cutout">Silhouette sans fond</option>}</select></label>
        {catalog?.allowPremium&&look?.engines.length===2&&<label>Qualité<select value={p.avatar.engine} disabled={p.busy} onChange={e=>patch({engine:e.target.value as AvatarCustomization['engine']})}><option value="avatar_iii">Standard</option><option value="avatar_iv">Avancée</option></select></label>}
        {p.avatar.moments!=='full'&&<label>Durée par passage<select value={p.avatar.maxSeconds} disabled={p.busy} onChange={e=>patch({maxSeconds:Number(e.target.value)})}>{[3,4,5,6,7,8].filter(n=>n<=(catalog?.maxSeconds??6)).map(n=><option key={n} value={n}>{n} secondes</option>)}</select></label>}
        {([['x','Position horizontale',10,90],['y','Position verticale',15,85],['width','Taille',15,100]] as const).map(([key,label,min,max])=><label key={key}>{label} · {p.avatar![key]} %<input type="range" min={min} max={max} disabled={p.busy} value={p.avatar![key]} onChange={e=>patch({[key]:Number(e.target.value)})}/></label>)}
      </div>
      {p.avatar.appearance==='cutout'&&look&&avatarCutoutStatus(look)==='unknown'&&<p className="customizer-hint">La transparence n’a pas encore été confirmée pour ce présentateur. Si aucun passage d’avatar n’est ajouté, le supplément est restitué.</p>}
      <p className="customizer-hint">{p.avatar.moments==='full'?`1 crédit par tranche de ${AVATAR_SECONDS_PER_CREDIT} secondes.`:'1 crédit pour les passages choisis, sans rallonger la vidéo.'} Si aucun avatar n’est ajouté, le supplément est remboursé.</p>
    </>}
  </section>;
}
export function AvatarPoster(p:{avatar?:AvatarCustomization;look?:AvatarLook;frame:number;total:number;width:number;height:number}){
  const image=useRef<HTMLImageElement>(null),[content,setContent]=useState<ReturnType<typeof measureAvatarElement>>(null);
  function measure(element:HTMLImageElement){if(p.avatar?.appearance!=='cutout')return;try{const measured=measureAvatarElement(element);if(measured&&(measured.bounds.width<measured.width||measured.bounds.height<measured.height))setContent(measured);}catch{/* Opaque catalogue thumbnails retain their existing framing. */}}
  useEffect(()=>{setContent(null);if(image.current?.complete)measure(image.current);},[p.look?.thumbnail,p.avatar?.appearance]);
  if(!p.avatar||p.avatar.hidden||!p.look?.thumbnail)return null;
  const intro=p.frame<Math.min(p.avatar.maxSeconds*30,p.total/4),outro=p.frame>=p.total-Math.min(p.avatar.maxSeconds*30,p.total/4);
  if(p.avatar.moments!=='full'&&!(intro&&p.avatar.moments!=='outro'||outro&&p.avatar.moments!=='intro'))return null;
  const cutout=p.avatar.appearance==='cutout',placement=avatarFrameStyle(p.avatar,p.width,p.height,cutout);
  return <div className="avatar-preview-poster" style={placement as CSSProperties}><img ref={image} src={p.look.thumbnail} alt="Présentateur : aperçu de placement" onLoad={event=>measure(event.currentTarget)} style={cutout&&content?avatarContentStyle(content.bounds,content.width,content.height,placement.width,placement.height):{width:'100%',height:'100%',objectFit:'cover'}}/><span>Aperçu de placement</span></div>;
}
export type {AvatarPreviewClip};
