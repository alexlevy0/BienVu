'use client';
import {useEffect,useState,type CSSProperties} from 'react';
import {AvatarCatalog,defaultAvatarCustomization,avatarVoiceWarning,avatarFrameStyle,avatarCreditCost,AVATAR_SECONDS_PER_CREDIT,type AvatarCustomization,type AvatarLook,type AvatarPreviewClip} from '@bienvu/contracts';
import {HomeIcon} from './home-icons';
import {trackProductEvent} from '../lib/product-analytics';
import {AvatarPicker} from './avatar-picker';

let catalogCache:{value:AvatarCatalog;expires:number}|null=null;
let catalogRequest:Promise<AvatarCatalog>|null=null;
export function useAvatarCatalog(enabled=true){
  const [catalog,setCatalog]=useState<AvatarCatalog|null>(null),[error,setError]=useState('');
  useEffect(()=>{if(!enabled)return;let alive=true;
    if(catalogCache&&catalogCache.expires>Date.now()){setCatalog(catalogCache.value);return;}
    catalogRequest??=fetch('/api/avatars',{cache:'no-store'}).then(async response=>{
      if(!response.ok)throw Error('Les présentateurs ne sont pas disponibles actuellement.');
      const value=AvatarCatalog.parse(await response.json());catalogCache={value,expires:Date.now()+30000};return value;
    }).finally(()=>{catalogRequest=null;});
    void catalogRequest.then(value=>{if(alive){setCatalog(value);setError('');}}).catch(cause=>{if(alive)setError(cause.message);});
    return()=>{alive=false;};
  },[enabled]);return {catalog,error};
}
export function AvatarWarning({avatar,voice,catalog}:{avatar?:AvatarCustomization;voice:string;catalog:AvatarCatalog|null}){
  const look=catalog?.looks.find(a=>a.id===avatar?.lookId),message=avatar&&!avatar.hidden&&look?avatarVoiceWarning(voice,look.gender):null;
  return message?<p className="avatar-warning" role="status"><HomeIcon name="user" size={18}/>{message}</p>:null;
}
export function AvatarControls(p:{avatar?:AvatarCustomization;onChange(value:AvatarCustomization|undefined):void;voice:string;voiceEnabled:boolean;
  onEnableVoice?():void;authenticated:boolean;durationSeconds:number;busy?:boolean;catalog?:AvatarCatalog|null}){
  const loaded=useAvatarCatalog(p.catalog===undefined),catalog=p.catalog??loaded.catalog;
  const look=catalog?.looks.find(a=>a.id===p.avatar?.lookId),active=Boolean(p.avatar&&!p.avatar.hidden),patch=(next:Partial<AvatarCustomization>)=>p.avatar&&p.onChange({...p.avatar,...next});
  const credits=avatarCreditCost(p.avatar?{...p.avatar,hidden:false}:undefined,p.durationSeconds)||1;
  function enable(){if(active){patch({hidden:true});return;}const id=p.avatar?.lookId??catalog?.defaultLookId??catalog?.looks[0]?.id;if(!id)return;
    const selected=catalog?.looks.find(a=>a.id===id);if(!selected)return;
    const engine=p.avatar?.engine&&selected.engines.includes(p.avatar.engine)&&(p.avatar.engine==='avatar_iii'||catalog?.allowPremium)?p.avatar.engine:selected.engines.includes('avatar_iii')?'avatar_iii':'avatar_iv';
    p.onEnableVoice?.();p.onChange({...p.avatar??defaultAvatarCustomization(id),engine,hidden:undefined,maxSeconds:Math.min(p.avatar?.maxSeconds??6,catalog!.maxSeconds)});
    trackProductEvent('editor_action',{action:'avatar_enabled'});
  }
  return <section className="avatar-controls" aria-label="Avatar IA">
    <div className="avatar-intro"><div><h3>Un présentateur pour votre bien</h3><p>La même voix que votre vidéo, avec un avatar sur toute la durée ou sur quelques passages.</p></div><span className="avatar-credit" role="status">+ {credits} crédit{credits>1?'s':''}</span></div>
    <label className="customizer-checkbox"><input type="checkbox" checked={active} disabled={p.busy||!p.authenticated||!catalog?.enabled||!catalog.looks.length} onChange={enable}/>Ajouter un avatar IA</label>
    {!p.authenticated&&<p className="customizer-hint">Connectez-vous pour utiliser un présentateur. L’option reste désactivée pour l’essai sans compte.</p>}
    {loaded.error&&!catalog&&<p className="customizer-error" role="alert">{loaded.error}</p>}
    {catalog&&!catalog.enabled&&<p className="customizer-hint">Les présentateurs seront disponibles prochainement.</p>}
    {active&&p.avatar&&<>
      {!p.voiceEnabled&&<p className="avatar-warning" role="status">Activez la voix off pour synchroniser le présentateur.</p>}
      <AvatarPicker looks={catalog?.looks??[]} selected={p.avatar.lookId} busy={p.busy} onSelect={item=>patch({lookId:item.id,
        engine:item.engines.includes(p.avatar!.engine)&&(p.avatar!.engine==='avatar_iii'||catalog?.allowPremium)?p.avatar!.engine:item.engines.includes('avatar_iii')?'avatar_iii':'avatar_iv',
        appearance:p.avatar!.appearance==='cutout'&&!item.transparentVerified?'circle':p.avatar!.appearance})}/>
      <div className="avatar-fields">
        <label>Apparition<select value={p.avatar.moments} disabled={p.busy} onChange={e=>patch({moments:e.target.value as AvatarCustomization['moments']})}><option value="full">Pendant toute la vidéo</option><option value="both">Au début et à la fin</option><option value="intro">Au début</option><option value="outro">À la fin</option></select></label>
        <label>Présentation<select value={p.avatar.appearance} disabled={p.busy} onChange={e=>patch({appearance:e.target.value as AvatarCustomization['appearance']})}><option value="circle">Médaillon rond</option><option value="card">Cadre portrait</option>{look?.transparentVerified&&<option value="cutout">Silhouette sans fond</option>}</select></label>
        <label>Qualité<select value={p.avatar.engine} disabled={p.busy} onChange={e=>patch({engine:e.target.value as AvatarCustomization['engine']})}>{look?.engines.includes('avatar_iii')&&<option value="avatar_iii">Standard</option>}{catalog?.allowPremium&&look?.engines.includes('avatar_iv')&&<option value="avatar_iv">Avancée</option>}</select></label>
        {p.avatar.moments!=='full'&&<label>Durée maximale par passage<select value={p.avatar.maxSeconds} disabled={p.busy} onChange={e=>patch({maxSeconds:Number(e.target.value)})}>{[3,4,5,6,7,8].filter(n=>n<=(catalog?.maxSeconds??6)).map(n=><option key={n} value={n}>{n} secondes</option>)}</select></label>}
        {([['x','Position horizontale',10,90],['y','Position verticale',15,85],['width','Taille',15,100]] as const).map(([key,label,min,max])=><label key={key}>{label} · {p.avatar![key]} %<input type="range" min={min} max={max} disabled={p.busy} value={p.avatar![key]} onChange={e=>patch({[key]:Number(e.target.value)})}/></label>)}
      </div>
      <p className="customizer-hint">{p.avatar.moments==='full'?`Le présentateur reste visible pendant les ${p.durationSeconds} secondes de la vidéo et suit toute la voix off, avec ses pauses. Supplément : 1 crédit par tranche de ${AVATAR_SECONDS_PER_CREDIT} secondes.`:'L’avatar suit les phrases d’ouverture et de conclusion, sans rallonger la vidéo. Une phrase trop longue laisse le passage sans avatar ; elle est conservée intégralement en voix off.'} Les clips compatibles déjà générés avec le même texte, la même voix et le même rythme sont réutilisés ; leur supplément est restitué.</p>
    </>}
  </section>;
}
export function AvatarPoster(p:{avatar?:AvatarCustomization;look?:AvatarLook;frame:number;total:number;width:number;height:number}){
  if(!p.avatar||p.avatar.hidden||!p.look?.thumbnail)return null;
  const intro=p.frame<Math.min(p.avatar.maxSeconds*30,p.total/4),outro=p.frame>=p.total-Math.min(p.avatar.maxSeconds*30,p.total/4);
  if(p.avatar.moments!=='full'&&!(intro&&p.avatar.moments!=='outro'||outro&&p.avatar.moments!=='intro'))return null;
  return <div className="avatar-preview-poster" style={avatarFrameStyle(p.avatar,p.width,p.height) as CSSProperties}><img src={p.look.thumbnail} alt="Présentateur : aperçu de placement" style={{width:'100%',height:'100%',objectFit:'cover'}}/><span>Aperçu de placement</span></div>;
}
export type {AvatarPreviewClip};
