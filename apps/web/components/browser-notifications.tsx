'use client';
import {useEffect,useRef,useState} from 'react';
import {useAccount} from './account';
import {browserNotificationEvent,browserNotificationSettingsEvent,notificationCapability,notificationPreference,saveNotificationPreference,pendingNotificationJobs,
  prepareBrowserNotifications,saveBrowserSubscription,watchBrowserGenerations,disableBrowserNotifications,type NotificationCapability} from '../lib/browser-notification-client';
import './browser-notifications.css';

function Bell(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>;}
export function NotificationSettingsButton(){return <button type="button" onClick={()=>window.dispatchEvent(new CustomEvent(browserNotificationSettingsEvent))}>Notifications</button>;}

export function BrowserNotifications(){
  const {me,loading}=useAccount(),owner=loading?undefined:me?.user.id??'anonymous';
  const [capability,setCapability]=useState<NotificationCapability>('unavailable'),[open,setOpen]=useState(false),[settings,setSettings]=useState(false),
    [enabled,setEnabled]=useState(false),[preparing,setPreparing]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[denied,setDenied]=useState(false);
  const prepared=useRef<Awaited<ReturnType<typeof prepareBrowserNotifications>>|null>(null),opening=useRef<Promise<void>|null>(null),currentOwner=useRef(owner),active=useRef(true);
  currentOwner.current=owner;
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const permission=()=>typeof Notification==='undefined'?'default':Notification.permission;
  async function prepare(){
    if(opening.current)return opening.current;if(prepared.current)return;
    setPreparing(true);setMessage('');
    opening.current=prepareBrowserNotifications().then(value=>{prepared.current=value;}).catch(()=>{if(active.current)setMessage('Les notifications sont momentanément indisponibles. Votre génération continue normalement.');})
      .finally(()=>{opening.current=null;if(active.current)setPreparing(false);});
    return opening.current;
  }
  useEffect(()=>{
    if(loading)return;const capability=notificationCapability();setCapability(capability);
    setEnabled(capability==='supported'&&permission()==='granted'&&notificationPreference()==='enabled');setDenied(permission()==='denied');
    const launched=()=>{
      if(capability==='unavailable')return;
      if(permission()==='granted'&&notificationPreference()==='enabled'){
        void watchBrowserGenerations().catch(()=>{setOpen(true);setMessage('La notification n’a pas pu être programmée. Réessayez pour cette vidéo.');});return;
      }
      if(notificationPreference()||permission()==='denied')return;
      setSettings(false);setOpen(true);if(capability==='supported')void prepare();
    };
    const preferences=()=>{setSettings(true);setOpen(true);setDenied(permission()==='denied');setEnabled(permission()==='granted'&&notificationPreference()==='enabled');setMessage('');if(capability==='supported'&&permission()!=='denied')void prepare();};
    window.addEventListener(browserNotificationEvent,launched);window.addEventListener(browserNotificationSettingsEvent,preferences);
    // An editor export may navigate to its result immediately after acceptance.
    if(pendingNotificationJobs().length)launched();
    return()=>{window.removeEventListener(browserNotificationEvent,launched);window.removeEventListener(browserNotificationSettingsEvent,preferences);};
  },[loading,owner]);
  useEffect(()=>{
    const changed=()=>{setEnabled(permission()==='granted'&&notificationPreference()==='enabled');setDenied(permission()==='denied');if(notificationPreference())setOpen(false);};
    window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);
  },[]);
  useEffect(()=>{if(!open||busy)return;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')dismiss();};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[open,busy,settings,enabled]);
  async function enable(){
    const ready=prepared.current;if(!ready||busy)return;
    const expectedOwner=currentOwner.current;
    // subscribe() itself requests permission: call directly in the click gesture,
    // with worker/key already prepared (required in particular by Safari).
    try{
      const subscription=ready.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:ready.applicationKey});
      setBusy(true);setMessage('');
      const value=await subscription;if(expectedOwner!==currentOwner.current){await value.unsubscribe();return;}
      await saveBrowserSubscription(value);if(!active.current)return;setEnabled(true);setMessage('C’est activé. Nous vous préviendrons dès que votre vidéo sera prête.');setDenied(false);
    }catch{if(!active.current)return;const refused=permission()==='denied';setDenied(refused);setEnabled(false);setMessage(refused?'':'L’activation n’a pas abouti. Votre vidéo continue de se préparer. Vous pouvez réessayer.');}
    finally{if(active.current)setBusy(false);}
  }
  async function disable(){setBusy(true);await disableBrowserNotifications();if(active.current){setBusy(false);setEnabled(false);setMessage('Les notifications sont désactivées sur ce navigateur.');}}
  function dismiss(){if(!settings&&!enabled)saveNotificationPreference('later');setOpen(false);setMessage('');}
  if(!open)return null;
  const install=capability==='install-required',unavailable=capability==='unavailable';
  return <aside className="browser-notification-card" aria-labelledby="browser-notification-title" data-state={enabled?'enabled':'prompt'}>
    <button className="browser-notification-close" type="button" aria-label="Fermer les réglages de notifications" disabled={busy} onClick={dismiss}>×</button>
    <span className="browser-notification-symbol"><Bell/></span><div className="browser-notification-copy">
      <span className="browser-notification-eyebrow">À VOTRE RYTHME</span><h2 id="browser-notification-title" role="status">{enabled?'On vous prévient.':settings?'Vos notifications BienVu':'Votre vidéo se prépare.'}</h2>
      <p>{enabled?'Une notification à la fin de chaque génération, sur ce navigateur. Un clic vous ramène directement à votre vidéo.':install?'Sur iPhone et iPad, ajoutez BienVu à votre écran d’accueil pour recevoir les notifications.':unavailable?'Les notifications ne sont pas disponibles dans ce navigateur. Votre vidéo reste accessible dans Mes biens.':denied?'Les notifications sont bloquées dans votre navigateur. Votre vidéo continue de se préparer.':'Travaillez l’esprit libre. Nous pouvons vous prévenir dès que votre vidéo est prête, même si vous fermez cet onglet.'}</p>
      {install&&<details><summary>Comment activer les notifications ?</summary><p>Dans le menu de partage de votre navigateur, choisissez « Sur l’écran d’accueil ». Ouvrez ensuite BienVu depuis cette icône et activez les notifications.</p></details>}
      {denied&&<p className="browser-notification-help">Dans les réglages du site de votre navigateur, autorisez les notifications pour bienvu.online, puis revenez ici.</p>}
      {message&&<p className="browser-notification-feedback" role="status">{message}</p>}
      <div className="browser-notification-actions">
        {enabled?<><button type="button" className="browser-notification-primary" onClick={dismiss}>C’est noté <span aria-hidden="true">✓</span></button>{settings&&<button type="button" disabled={busy} onClick={()=>void disable()}>{busy?'Désactivation…':'Désactiver'}</button>}</>
          :<>{!install&&!unavailable&&!denied&&<button type="button" className="browser-notification-primary" disabled={preparing||busy} onClick={()=>prepared.current?void enable():void prepare()}>{busy?'Activation…':preparing?'Préparation…':prepared.current?'Activer les notifications':'Réessayer'}<span aria-hidden="true">↗</span></button>}<button type="button" disabled={busy} onClick={dismiss}>{settings||denied||unavailable?'Fermer':'Plus tard'}</button></>}
      </div>{!enabled&&!denied&&!unavailable&&!install&&<small>Facultatif · Une seule notification par vidéo.</small>}
    </div>
  </aside>;
}
