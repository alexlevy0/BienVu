'use client';
import {useEffect,useRef,useState} from 'react';
import {usePathname,useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {useAccount} from './account';
import {ANALYTICS_CONSENT_KEY,analyticsPath,type AnalyticsConsent,type AnalyticsConfig} from '../lib/analytics-policy';
import {configureProductAnalytics,openPrivacyPreferences,setAnalyticsConsent,storedAnalyticsConsent,suspendProductAnalytics,trackProductEvent} from '../lib/product-analytics';

export function CookiePreferencesButton(){return <button type="button" className="privacy-settings-link" onClick={openPrivacyPreferences}>Choix des cookies</button>;}
export function ProductAnalytics(){
  const {me,loading}=useAccount(),pathname=usePathname(),params=useSearchParams();
  const [config,setConfig]=useState<AnalyticsConfig|null>(null),[choice,setChoice]=useState<AnalyticsConsent|null>(null),[loaded,setLoaded]=useState(false);
  const [preferences,setPreferences]=useState(false),[analytics,setAnalytics]=useState(false),[replay,setReplay]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLElement|null>(null);
  const excluded=pathname.startsWith('/admin'),internal=me?.isSuperAdmin===true;
  useEffect(()=>{setChoice(storedAnalyticsConsent());setLoaded(true);
    const controller=new AbortController();
    void fetch('/api/analytics/config',{signal:controller.signal}).then(r=>r.ok?r.json() as Promise<AnalyticsConfig>:null).then(value=>{
      if(!controller.signal.aborted&&value?.enabled===true&&typeof value.token==='string'&&value.host==='https://eu.i.posthog.com')setConfig(value);
    }).catch(()=>{});return()=>controller.abort();
  },[]);
  useEffect(()=>{
    if(config&&loaded)configureProductAnalytics(config,choice,{ready:!loading,excluded,internal,userId:me?.user.id??null});
    else suspendProductAnalytics();
  },[config,loaded,choice,loading,excluded,internal,me?.user.id,pathname,params]);
  useEffect(()=>{
    const open=()=>{trigger.current=document.activeElement as HTMLElement;setAnalytics(choice?.analytics??false);setReplay(choice?.replay??false);setPreferences(true);};
    const storage=(event:StorageEvent)=>{if(event.key!==ANALYTICS_CONSENT_KEY&&event.key!==null)return;suspendProductAnalytics();setChoice(storedAnalyticsConsent());};
    window.addEventListener('bienvu:privacy-preferences',open);window.addEventListener('storage',storage);
    return()=>{window.removeEventListener('bienvu:privacy-preferences',open);window.removeEventListener('storage',storage);};
  },[choice]);
  useEffect(()=>{if(preferences){dialog.current?.showModal();}else{dialog.current?.close();trigger.current?.focus();}},[preferences]);
  function choose(analytics:boolean,replay:boolean){
    const next:AnalyticsConsent={version:2,analytics,replay:analytics&&replay,at:Date.now()};
    setAnalyticsConsent(next);setChoice(next);setPreferences(false);
    trackProductEvent('preferences_updated');
  }
  useEffect(()=>{
    const clicks=(e:MouseEvent)=>{
      if(!(e.target instanceof Element))return;
      const control=e.target.closest('a,button,input,select,textarea');
      if(control&&!control.closest('.privacy-banner,.privacy-dialog,.privacy-settings-link')){
        const areas=[['.home-navigation','navigation'],['.home-composer','composer'],['.video-customizer','customizer'],['.editor-media','editor_media'],['.editor-timeline','editor_timeline'],['.editor-preview','editor_preview'],['.agency-form','agency'],['.property-library,.property-detail','properties'],['.social-dialog,.social-calendar','publications'],['.partners-page','partners'],['.offers-page','offers']] as const;
        const control_area=areas.find(([selector])=>control.closest(selector))?.[1]??'page';
        trackProductEvent('control_interacted',{control_area,control_type:control.tagName.toLowerCase()==='a'?'link':control.tagName.toLowerCase()});
      }
      const link=e.target.closest<HTMLAnchorElement>('a[href]');if(!link)return;
      if(link.hasAttribute('download')||/\/download(?:[?#]|$)/.test(link.pathname))trackProductEvent('video_download_clicked');
      else if(link.origin===window.location.origin){const destination=analyticsPath(link.href);if(destination)trackProductEvent('navigation_clicked',{destination});}
    };
    const plays=(e:Event)=>{if(e.target instanceof HTMLVideoElement)trackProductEvent('video_played');};
    document.addEventListener('click',clicks);document.addEventListener('play',plays,true);
    return()=>{document.removeEventListener('click',clicks);document.removeEventListener('play',plays,true);};
  },[]);
  if(!loaded||loading||excluded)return null;
  return <>
    {config?.enabled&&!choice&&!preferences&&analyticsPath(window.location.href)&&<aside className="privacy-banner" aria-label="Vos choix de confidentialité" data-analytics-private>
      <h2>Votre expérience, vos choix.</h2><p>Avec votre accord, nous mesurons l’utilisation de BienVu et enregistrons les pages et interactions pour améliorer le service. Les textes, photos, aperçus et champs renseignés sont visibles dans ces enregistrements. Les mots de passe restent masqués. <Link href="/confidentialite#cookies">En savoir plus</Link></p>
      <div className="privacy-actions"><button type="button" className="privacy-choice" onClick={()=>choose(false,false)}>Tout refuser</button><button type="button" className="privacy-choice" onClick={()=>choose(true,true)}>Tout accepter</button><button type="button" className="privacy-customize" onClick={openPrivacyPreferences}>Personnaliser</button></div>
    </aside>}
    <dialog ref={dialog} className="privacy-dialog" onCancel={()=>setPreferences(false)} aria-labelledby="privacy-title" data-analytics-private>
      <h2 id="privacy-title">Vos choix de confidentialité</h2><p>Les cookies nécessaires à la connexion et à la sécurité restent actifs. Vous pouvez modifier vos autres choix à tout moment.</p>
      <label className="privacy-option"><span><strong>Mesure d’audience et actions</strong><small>Pages consultées, clics, import, création, éditeur et publication.</small></span><input type="checkbox" checked={analytics} onChange={e=>{setAnalytics(e.target.checked);if(!e.target.checked)setReplay(false);}}/></label>
      <label className="privacy-option"><span><strong>Enregistrement des sessions</strong><small>Les pages, textes, champs renseignés, photos et aperçus sont visibles par l’équipe BienVu. Les mots de passe sont masqués. Conservé 30 jours par PostHog en Europe.</small></span><input type="checkbox" checked={replay} disabled={!analytics} onChange={e=>setReplay(e.target.checked)}/></label>
      <div className="privacy-actions"><button type="button" className="privacy-choice" onClick={()=>choose(false,false)}>Tout refuser</button><button type="button" className="privacy-choice" onClick={()=>choose(true,true)}>Tout accepter</button></div>
      <button type="button" className="privacy-save" onClick={()=>choose(analytics,replay)}>Enregistrer mes choix</button>
      {choice&&<button type="button" className="privacy-customize" onClick={()=>setPreferences(false)}>Fermer</button>}
    </dialog>
  </>;
}
