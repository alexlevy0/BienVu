'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {socialErrorMessages,type SocialConnection} from '@bienvu/contracts';
import {useAccount} from './account';
import {HomeIcon} from './home-icons';
import {socialRequest,socialJson,socialConnectionsData,socialFacebookPageId} from '../lib/social-client';
import './social.css';

export function NetworkMark({platform}:{platform:'instagram'|'facebook'}){
  return <span className={`social-network-mark ${platform}`} aria-hidden="true">{platform==='facebook'?'f':<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="18" cy="6" r="1" fill="currentColor" stroke="none"/></svg>}</span>;
}
type Choice={id:string;platform:'instagram'|'facebook';name:string;username:string|null};
const authorizationErrors=new Set(['SOCIAL_NO_ACCOUNTS','SOCIAL_PAGE_ACCESS','SOCIAL_INSTAGRAM_LINK','SOCIAL_PERMISSIONS','SOCIAL_CONNECT_FAILED','SOCIAL_CONNECT_CONFIGURATION','SOCIAL_CONNECT_TEMPORARY','SOCIAL_TEMPORARY','SOCIAL_CANCELLED']);
export function SocialConnections(){const {me}=useAccount();return me?<SocialConnectionsPanel key={me.agency.id} manage={['owner','admin'].includes(me.role??'owner')}/>:null;}
function SocialConnectionsPanel({manage}:{manage:boolean}){
  const [connections,setConnections]=useState<SocialConnection[]>([]),[configured,setConfigured]=useState(false),[loaded,setLoaded]=useState(false);
  const [feedback,setFeedback]=useState(''),[loadError,setLoadError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[grant,setGrant]=useState('');
  const [authorizationHelp,setAuthorizationHelp]=useState(false),[pageReference,setPageReference]=useState('');
  const [choices,setChoices]=useState<Choice[]>([]),[selected,setSelected]=useState<string[]>([]),[disconnect,setDisconnect]=useState<SocialConnection|null>(null);
  const dialog=useRef<HTMLDialogElement>(null),confirmDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const controller=new AbortController();setLoadError('');
    void socialRequest('/api/social/connections',{signal:controller.signal}).then(value=>{
      if(controller.signal.aborted)return;setConnections(socialConnectionsData(value));setConfigured(value.configured===true);setLoaded(true);
    }).catch(error=>{if(!controller.signal.aborted){setLoadError(error.message);setLoaded(true);}});return()=>controller.abort();
  },[revision]);
  useEffect(()=>{if(!manage)return;const params=new URLSearchParams(window.location.search),id=params.get('socialGrant'),error=params.get('socialError');
    const pageId=socialFacebookPageId(params.get('facebookPage')??'');
    if(pageId){setPageReference(`https://www.facebook.com/profile.php?id=${pageId}`);setAuthorizationHelp(true);document.getElementById('reseaux')?.scrollIntoView({block:'start'});}
    if(error){setAuthorizationHelp(Boolean(pageId)||authorizationErrors.has(error));setFeedback(socialErrorMessages[error==='SOCIAL_TEMPORARY'?'SOCIAL_CONNECT_TEMPORARY':error]??'La connexion a été interrompue. Vous pouvez réessayer.');document.getElementById('reseaux')?.scrollIntoView({block:'start'});}
    if(!id)return;const controller=new AbortController();setGrant(id);
    void socialRequest(`/api/social/oauth/choices?grant=${encodeURIComponent(id)}`,{signal:controller.signal}).then(value=>{if(controller.signal.aborted)return;
      const available=value.choices as Choice[];if(!available.length){setAuthorizationHelp(true);setFeedback(socialErrorMessages.SOCIAL_NO_ACCOUNTS);return;}setChoices(available);})
      .catch(error=>{if(!controller.signal.aborted)setFeedback(error.message);});return()=>controller.abort();
  },[manage]);
  useEffect(()=>{if(!choices.length)return;dialog.current?.showModal();return()=>dialog.current?.close();},[choices]);
  useEffect(()=>{if(!disconnect)return;confirmDialog.current?.showModal();return()=>confirmDialog.current?.close();},[disconnect]);
  function closeChoices(){setChoices([]);setGrant('');setSelected([]);const url=new URL(window.location.href);url.searchParams.delete('socialGrant');url.searchParams.delete('socialError');url.searchParams.delete('facebookPage');window.history.replaceState(null,'',url.pathname+url.search+'#reseaux');document.getElementById('reseaux')?.scrollIntoView({block:'start'});}
  function showAuthorizationHelp(){setAuthorizationHelp(true);requestAnimationFrame(()=>document.querySelector('.social-authorization-help')?.scrollIntoView({block:'start'}));}
  async function connect(flow?:'facebook'){const pageId=pageReference.trim()?socialFacebookPageId(pageReference):null;
    if(pageReference.trim()&&!pageId){setFeedback('Indiquez l’identifiant numérique de votre Page ou son lien Facebook contenant « id= ».');setAuthorizationHelp(true);return;}
    setBusy(true);setFeedback('');try{const value=await socialRequest('/api/social/oauth/start',{method:'POST',...socialJson({...(pageId?{pageId}:{}),...(flow?{flow}:{})})});window.location.assign(String(value.url));}
    catch(error){setFeedback(error instanceof Error?error.message:'La connexion a échoué.');setBusy(false);}}
  async function save(){setBusy(true);setFeedback('');try{const value=await socialRequest('/api/social/connections',{method:'POST',...socialJson({grantId:grant,ids:selected})});setAuthorizationHelp(false);setConnections(socialConnectionsData(value));closeChoices();setRevision(r=>r+1);}
    catch(error){setFeedback(error instanceof Error?error.message:'La connexion a échoué.');}finally{setBusy(false);}}
  async function remove(){if(!disconnect)return;setBusy(true);setFeedback('');try{await socialRequest(`/api/social/connections/${disconnect.id}`,{method:'DELETE'});setDisconnect(null);setRevision(r=>r+1);}
    catch(error){setFeedback(error instanceof Error?error.message:'Le compte n’a pas été déconnecté.');}finally{setBusy(false);}}
  return <section className="social-connections" id="reseaux" aria-labelledby="social-connections-title">
    <div className="social-section-heading"><div><span className="social-kicker">DIFFUSEZ VOS BIENS</span><h2 id="social-connections-title">Vos réseaux sociaux</h2><p>Publiez vos vidéos maintenant ou au moment que vous choisissez.</p></div><Link href="/publications">Voir le calendrier <HomeIcon name="arrow" size={18}/></Link></div>
    {(feedback||loadError)&&<p role="alert" className="social-feedback">{feedback||loadError}<button type="button" className="social-text-button" onClick={()=>setRevision(r=>r+1)}>Actualiser</button></p>}
    {authorizationHelp&&<aside className="social-authorization-help" aria-label="Vérifier les comptes autorisés">
      <strong>Retrouver votre Page Facebook</strong>
      <p>Si Meta ne transmet pas votre Page, indiquez son lien pour que BienVu la recherche directement. Meta vérifie vos droits et vous choisissez ensuite les comptes à connecter.</p>
      <label className="social-page-reference">Lien ou identifiant de votre Page Facebook <span>Facultatif</span><input type="text" value={pageReference} maxLength={2048} disabled={busy} onChange={event=>setPageReference(event.target.value)} placeholder="https://www.facebook.com/profile.php?id=…" autoComplete="off"/></label>
      <button type="button" className="social-button primary" disabled={busy||!configured||!loaded||!pageReference.trim()} onClick={()=>void connect()}>{busy?'Connexion…':'Connecter avec cette Page'} <HomeIcon name="arrow" size={18}/></button>
      <p>Si la fenêtre de connexion Instagram se bloque, passez par le profil Facebook qui gère cette Page. BienVu recherchera aussi son compte Instagram professionnel associé.</p>
      <button type="button" className="social-button" disabled={busy||!configured||!loaded} onClick={()=>void connect('facebook')}>{busy?'Connexion…':'Connecter via Facebook'} <HomeIcon name="arrow" size={18}/></button>
      <p>Meta peut conserver votre sélection précédente. Ouvrez les intégrations professionnelles avec le profil Facebook qui gère votre Page, choisissez BienVu, puis autorisez la Page et le compte Instagram concernés. Enregistrez et revenez cliquer sur « Connecter ».</p>
      <a className="social-button" href="https://www.facebook.com/settings?tab=business_tools" target="_blank" rel="noopener noreferrer">Vérifier les autorisations sur Facebook <HomeIcon name="arrow" size={18}/></a>
      <p>Si aucun choix de comptes n’est proposé, retirez l’autorisation de l’application BienVu dans ces réglages, puis recommencez la connexion pour choisir vos comptes.</p>
    </aside>}
    <div className="social-connection-grid">{(['instagram','facebook'] as const).map(platform=>{
      const items=connections.filter(c=>c.platform===platform),title=platform==='instagram'?'Instagram':'Facebook';
      return <article key={platform} className="social-connection-card"><div className="social-connection-title"><NetworkMark platform={platform}/><h3>{title}</h3></div>
        <p>{platform==='instagram'?'Reels sur votre compte professionnel.':'Reels sur votre Page d’agence.'}</p>
        {items.length?items.map(connection=><div className="social-connected-account" key={connection.id}><div><strong>{connection.username?`@${connection.username}`:connection.name}</strong>
          <span className={connection.status==='active'?'social-success':'social-warning'}>{connection.status==='active'?'Connecté':'À reconnecter'}</span>
          {connection.expiresAt&&connection.status==='active'&&<small>Autorisation jusqu’au {new Date(connection.expiresAt).toLocaleDateString('fr-FR')}</small>}</div>
          {manage&&<button type="button" disabled={busy} className="social-text-button" onClick={()=>setDisconnect(connection)}>Déconnecter</button>}</div>)
          :<p className="social-muted">{loaded?'Aucun compte connecté.':'Chargement…'}</p>}
        {manage&&<button type="button" className="social-button" disabled={busy||!configured||!loaded} onClick={()=>void connect()}>{items.some(c=>c.status==='reconnect')?'Reconnecter':items.length?'Ajouter un compte':`Connecter ${title}`}</button>}
      </article>;
    })}</div>
    {manage&&configured&&loaded&&!authorizationHelp&&<button type="button" className="social-text-button social-connection-help" onClick={showAuthorizationHelp}>Connexion bloquée ? Utiliser ma Page Facebook</button>}
    {!configured&&loaded&&<p className="social-notice">La connexion aux réseaux sociaux est en cours d’activation. Vos vidéos restent téléchargeables pour les partager.</p>}
    {!manage&&<p className="social-muted">Le propriétaire ou un administrateur de l’agence peut connecter les comptes.</p>}
    {configured&&<p className="social-muted">Instagram nécessite un compte professionnel associé à une Page Facebook. Vous choisissez les comptes autorisés après la connexion.</p>}
    {Boolean(choices.length)&&<dialog ref={dialog} className="social-dialog" onCancel={event=>{if(busy){event.preventDefault();return;}closeChoices();}} aria-labelledby="social-choices-title">
      <button type="button" className="social-dialog-close" disabled={busy} onClick={closeChoices} aria-label="Fermer"><HomeIcon name="close"/></button>
      <h2 id="social-choices-title">Choisissez vos comptes</h2><p>Seuls les comptes cochés seront associés à votre agence BienVu.</p>
      <div className="social-account-choices">{choices.map(choice=><label key={choice.id}><input type="checkbox" disabled={busy} checked={selected.includes(choice.id)} onChange={event=>setSelected(old=>event.target.checked?[...old,choice.id]:old.filter(id=>id!==choice.id))}/><NetworkMark platform={choice.platform}/><span><strong>{choice.name}</strong><small>{choice.platform==='instagram'?'Instagram':'Page Facebook'}{choice.username?` · @${choice.username}`:''}</small></span></label>)}</div>
      {feedback&&<p role="alert" className="social-feedback">{feedback}</p>}<div className="social-dialog-actions"><button type="button" className="social-button" disabled={busy} onClick={closeChoices}>Annuler</button><button type="button" className="social-button primary" disabled={busy||!selected.length} onClick={()=>void save()}>{busy?'Connexion…':'Connecter ces comptes'}</button></div>
    </dialog>}
    {disconnect&&<dialog ref={confirmDialog} className="social-dialog" onCancel={event=>{if(busy)event.preventDefault();else setDisconnect(null);}} aria-labelledby="social-disconnect-title"><h2 id="social-disconnect-title">Déconnecter {disconnect.name} ?</h2><p>Les publications programmées pour ce compte seront annulées. Une publication déjà envoyée au réseau peut encore se terminer. Les publications existantes restent sur le réseau.</p>
      {feedback&&<p role="alert">{feedback}</p>}<div className="social-dialog-actions"><button className="social-button" disabled={busy} type="button" onClick={()=>setDisconnect(null)}>Annuler</button><button className="social-button primary" disabled={busy} type="button" onClick={()=>void remove()}>Déconnecter</button></div></dialog>}
  </section>;
}
