'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {MailboxPage,MailThreadDetail,MailMessage,MailAttachment,MailThread,MAILBOX_LIMITS,CONTACT_MAILBOX,type MailThreadAction,type MailFolderView} from '@bienvu/contracts';
import {editorResponse} from '../lib/editor-client';
import {HomeIcon} from './home-icons';

type Folder=MailFolderView;
type Draft={to:string;subject:string;text:string;files:MailAttachment[];key:string};
const folders:{id:Folder;label:string;icon:'mail'|'eye'|'send'|'archive'|'trash'|'user'}[]=[{id:'inbox',label:'Boîte de réception',icon:'mail'},
  {id:'unread',label:'Non lus',icon:'eye'},{id:'heygen',label:'HeyGen',icon:'user'},{id:'sent',label:'Envoyés',icon:'send'},{id:'archived',label:'Archives',icon:'archive'},
  {id:'spam',label:'Indésirables',icon:'trash'},{id:'all',label:'Tous les messages',icon:'mail'}];
const deliveries:Record<MailMessage['delivery'],string>={received:'Reçu',queued:'En attente d’envoi',sending:'Envoi en cours',sent:'Envoyé',failed:'Envoi refusé',uncertain:'Envoi à vérifier'};
const date=(value:string)=>new Date(value).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const size=(bytes:number)=>bytes<1024?bytes+' o':bytes<1024*1024?Math.ceil(bytes/1024)+' Ko':(bytes/(1024*1024)).toLocaleString('fr-FR',{maximumFractionDigits:1})+' Mo';
const initial=():Draft=>({to:'',subject:'',text:'',files:[],key:crypto.randomUUID()});
function deliveryError(message:MailMessage){
  if(message.delivery==='uncertain')return 'La confirmation d’envoi n’a pas été reçue. Vérifiez la réception avant de renvoyer ce message.';
  if(message.error==='E_RECIPIENT_SUPPRESSED')return 'L’adresse est bloquée par le service d’envoi après un problème de livraison.';
  if(message.error==='MAIL_ATTACHMENT_UNAVAILABLE')return 'Une pièce jointe n’est plus disponible.';
  if(['E_DAILY_LIMIT_EXCEEDED','E_RATE_LIMIT_EXCEEDED'].includes(message.error??''))return 'La limite d’envoi est atteinte. Vous pourrez réessayer plus tard.';
  return 'Le service d’envoi a refusé ce message. Il est conservé ici et vous pouvez réessayer.';
}
const fileURL=(messageId:string,fileId:string)=>`/api/admin/mailbox/messages/${encodeURIComponent(messageId)}/files/${encodeURIComponent(fileId)}`;

export function AdminMailbox({revision=0}:{revision?:number}){
  const [mailboxes,setMailboxes]=useState<string[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState(''),[locked,setLocked]=useState(false);
  const stores=useRef(new Map<string,Map<string,Draft>>());
  useEffect(()=>{const controller=new AbortController();setError('');void fetch('/api/admin/mailbox',{cache:'no-store',signal:controller.signal}).then(r=>editorResponse(r)).then(value=>{
    if(controller.signal.aborted)return;
    const page=MailboxPage.parse(value),available=page.mailboxes.length?page.mailboxes:[page.address];setMailboxes(available);setSelected(current=>available.includes(current)?current:page.address);
  }).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);});return()=>controller.abort();},[revision]);
  if(error)return <p className="admin-error" role="alert">{error}</p>;
  if(!selected)return <p role="status">Chargement des messageries…</p>;
  if(!stores.current.has(selected))stores.current.set(selected,new Map());
  return <><label className="mailbox-selector">Messagerie<select aria-label="Choisir la messagerie" value={selected} disabled={locked} onChange={event=>setSelected(event.target.value)}>{mailboxes.map(a=><option key={a} value={a}>{a}</option>)}</select></label>
    <MailboxInbox key={selected} revision={revision} mailbox={selected} draftStore={stores.current.get(selected)!} onBusy={setLocked}/></>;
}
function MailboxInbox({revision,mailbox,draftStore,onBusy}:{revision:number;mailbox:string;draftStore:Map<string,Draft>;onBusy:(value:boolean)=>void}){
  const mailFetch=(url:string,init?:RequestInit)=>fetch(url+(url.includes('?')?'&':'?')+new URLSearchParams({mailbox}),init);
  const visibleFolders=folders.filter(f=>f.id!=='heygen'||mailbox.toLowerCase()===CONTACT_MAILBOX);
  const [page,setPage]=useState<MailboxPage|null>(null),[detail,setDetail]=useState<MailThreadDetail|null>(null),[selected,setSelected]=useState<string|null>(null),
    [compose,setCompose]=useState(false),[folder,setFolder]=useState<Folder>('inbox'),[query,setQuery]=useState(''),[search,setSearch]=useState(''),
    [loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[more,setMore]=useState(false),[older,setOlder]=useState(false),
    [error,setError]=useState(''),[notice,setNotice]=useState(''),[tick,setTick]=useState(0),[draft,setDraft]=useState<Draft>(initial),
    [sending,setSending]=useState(false),[uploading,setUploading]=useState(false),[acting,setActing]=useState(false);
  const drafts=useRef(draftStore),active=useRef<string|null>(null),fileInput=useRef<HTMLInputElement>(null),draftRef=useRef(draft),listVersion=useRef(0),historyLoaded=useRef(false);
  draftRef.current=draft;
  useEffect(()=>{onBusy(sending||uploading);},[sending,uploading,onBusy]);
  useEffect(()=>()=>{drafts.current.set(active.current??'new',draftRef.current);},[]);
  useEffect(()=>{const timer=setTimeout(()=>setSearch(query.trim()),250);return()=>clearTimeout(timer);},[query]);
  useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible')setTick(n=>n+1);},15000);return()=>clearInterval(timer);},[]);
  const params=(cursor?:string)=>new URLSearchParams({folder,q:search,...(cursor?{cursor}:{})});
  useEffect(()=>{
    const controller=new AbortController(),version=++listVersion.current;
    void mailFetch('/api/admin/mailbox?'+new URLSearchParams({folder,q:search}),{cache:'no-store',signal:controller.signal}).then(r=>editorResponse(r)).then(value=>{
      if(version===listVersion.current)setPage(MailboxPage.parse(value));
    }).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[folder,search,tick,revision]);
  useEffect(()=>{
    if(!selected||compose)return;
    const controller=new AbortController(),current=selected;
    void mailFetch('/api/admin/mailbox/'+encodeURIComponent(current),{cache:'no-store',signal:controller.signal}).then(r=>editorResponse(r)).then(async value=>{
      if(controller.signal.aborted||active.current!==current)return;
      const next=MailThreadDetail.parse(value);
      setDetail(before=>before?.thread.id===current?{...next,messages:[...before.messages.filter(m=>!next.messages.some(n=>n.id===m.id)),...next.messages],
        olderCursor:historyLoaded.current?before.olderCursor:next.olderCursor}:next);
      if(next.thread.unread>0&&next.readThrough&&document.visibilityState==='visible'){
        const updated=MailThread.parse(await editorResponse(await mailFetch('/api/admin/mailbox/'+encodeURIComponent(current),{method:'PATCH',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'read',through:next.readThrough}),signal:controller.signal})));
        if(!controller.signal.aborted&&active.current===current){
          setDetail(before=>before?.thread.id===current?{...before,thread:updated}:before);
          const unreadCounter=updated.category==='heygen'?'heygenUnread':'unread';
          setPage(before=>before?{...before,items:before.items.map(t=>t.id===current?updated:t),
            counts:{...before.counts,[unreadCounter]:Math.max(0,before.counts[unreadCounter]-(before.items.some(t=>t.id===current&&t.folder==='inbox'&&t.unread>0)&&updated.unread===0?1:0))}}:before);
        }
      }
    }).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);}).finally(()=>{if(!controller.signal.aborted)setDetailLoading(false);});
    return()=>controller.abort();
  },[selected,compose,tick,revision]);
  function choose(threadId:string|null,newMessage=false){
    if(sending||uploading)return;
    drafts.current.set(compose?'new':selected??'none',draftRef.current);
    active.current=threadId;historyLoaded.current=false;setSelected(threadId);setCompose(newMessage);setDetail(null);setDetailLoading(Boolean(threadId));
    setDraft(drafts.current.get(newMessage?'new':threadId??'none')??initial());setError('');setNotice('');
  }
  function changeDraft(value:Partial<Draft>){setDraft(before=>({...before,...value,key:crypto.randomUUID()}));}
  async function loadMore(){
    if(!page?.nextCursor||more)return;setMore(true);const version=listVersion.current;
    try{const next=MailboxPage.parse(await editorResponse(await mailFetch('/api/admin/mailbox?'+params(page.nextCursor),{cache:'no-store'})));
      if(version===listVersion.current)setPage(before=>before?{...next,items:[...before.items,...next.items.filter(n=>!before.items.some(p=>p.id===n.id))]}:next);
    }catch(cause){setError(cause instanceof Error?cause.message:'Chargement interrompu.');}finally{setMore(false);}
  }
  async function loadOlder(){
    if(!detail?.olderCursor||older)return;setOlder(true);const current=detail.thread.id;
    try{const next=MailThreadDetail.parse(await editorResponse(await mailFetch('/api/admin/mailbox/'+current+'?cursor='+encodeURIComponent(detail.olderCursor),{cache:'no-store'})));
      if(active.current===current){historyLoaded.current=true;setDetail(before=>before?{...before,olderCursor:next.olderCursor,messages:[...next.messages.filter(n=>!before.messages.some(p=>p.id===n.id)),...before.messages]}:before);}
    }catch(cause){setError(cause instanceof Error?cause.message:'Chargement interrompu.');}finally{setOlder(false);}
  }
  async function action(value:MailThreadAction){
    if(!selected||acting)return;setActing(true);setError('');
    try{await editorResponse(await mailFetch('/api/admin/mailbox/'+selected,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}));
      if(value.action==='unread')choose(null);
      setTick(n=>n+1);setNotice(value.action==='archive'?'Conversation archivée.':value.action==='spam'?'Conversation déplacée dans les indésirables.':value.action==='restore'?'Conversation restaurée.':'Conversation marquée comme non lue.');
    }catch(cause){setError(cause instanceof Error?cause.message:'La modification a échoué.');}finally{setActing(false);}
  }
  async function upload(files:FileList|null){
    if(!files?.length||uploading||sending)return;setError('');const chosen=[...files];
    if(chosen.length+draft.files.length>MAILBOX_LIMITS.attachments||chosen.reduce((sum,f)=>sum+f.size,0)+draft.files.reduce((sum,f)=>sum+f.size,0)>MAILBOX_LIMITS.attachmentBytes){
      setError('Choisissez jusqu’à 8 pièces jointes, pour un total de 3 Mo maximum.');return;}
    setUploading(true);
    try{for(const file of chosen){const result=MailAttachment.parse(await editorResponse(await mailFetch('/api/admin/mailbox/uploads/'+crypto.randomUUID(),{method:'PUT',
      headers:{'Content-Type':file.type||'application/octet-stream','X-File-Name':encodeURIComponent(file.name)},body:file})));
      setDraft(before=>({...before,files:[...before.files,result],key:crypto.randomUUID()}));}
    }catch(cause){setError(cause instanceof Error?cause.message:'L’ajout a échoué.');}finally{setUploading(false);if(fileInput.current)fileInput.current.value='';}
  }
  const parent=detail?.messages.slice().reverse().find(m=>m.direction==='in')??detail?.messages.slice().reverse().find(m=>m.direction==='out'&&m.delivery==='sent'),
    recipient=compose?draft.to:parent?(parent.direction==='out'?parent.toEmail:parent.replyTo??parent.fromEmail):'',canReply=Boolean(parent)&&detail?.thread.folder!=='spam';
  async function send(event:FormEvent){
    event.preventDefault();if(sending||uploading||!page?.enabled)return;setSending(true);setError('');setNotice('');
    const payload={id:draft.key,text:draft.text,attachments:draft.files.map(f=>f.id),...(compose?{to:draft.to,subject:draft.subject}:{threadId:selected,replyMessageId:parent?.id})};
    try{const message=MailMessage.parse(await editorResponse(await mailFetch('/api/admin/mailbox',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})));
      drafts.current.delete(compose?'new':selected??'none');setDraft(initial());setCompose(false);setSelected(message.threadId);active.current=message.threadId;
      setNotice('Message enregistré et placé dans la file d’envoi. Son état se met à jour automatiquement.');setTick(n=>n+1);
    }catch(cause){setError(cause instanceof Error?cause.message:'L’envoi a échoué. Votre texte est conservé.');}finally{setSending(false);}
  }
  async function retry(message:MailMessage){
    if(sending)return;setSending(true);setError('');
    try{await editorResponse(await mailFetch(`/api/admin/mailbox/messages/${message.id}/retry`,{method:'POST'}));setTick(n=>n+1);}
    catch(cause){setError(cause instanceof Error?cause.message:'La relance a échoué.');}finally{setSending(false);}
  }
  function folderCount(value:Folder){if(value==='all')return null;return page?.counts[value]??0;}
  const restoreLabel=detail?.thread.category==='heygen'?'Remettre dans HeyGen':'Remettre dans la boîte de réception';
  return <div className="admin-mailbox">
    <div className="mailbox-bar"><div><HomeIcon name="mail" size={24}/><div><strong>{page?.address??'contact@bienvu.online'}</strong><span>Vos échanges avec les clients de BienVu</span></div></div>
      <button className="admin-button admin-button-dark" type="button" disabled={!page?.enabled||sending||uploading} onClick={()=>choose(null,true)}><HomeIcon name="pencil" size={17}/>Nouveau message</button></div>
    {page&&!page.enabled&&<p className="admin-notice">La réception et l’envoi sont en cours de configuration. Les messages déjà enregistrés restent consultables.</p>}
    {error&&<p className="admin-error" role="alert">{error}</p>}{notice&&<p className="admin-notice" role="status">{notice}</p>}
    <div className={`mailbox-workspace${selected||compose?' has-selection':''}`}>
      <aside className="mailbox-folders" aria-label="Dossiers de messagerie">{visibleFolders.map(f=><button key={f.id} type="button" aria-pressed={folder===f.id}
        disabled={sending||uploading} onClick={()=>{setFolder(f.id);setLoading(true);choose(null);}}><HomeIcon name={f.icon} size={18}/><span>{f.label}</span>{folderCount(f.id)!==null&&<small>{folderCount(f.id)}</small>}</button>)}</aside>
      <section className="mailbox-list" aria-label="Conversations"><label className="mailbox-search"><HomeIcon name="search" size={18}/><input type="search" maxLength={100}
        aria-label="Rechercher dans les messages" placeholder="Rechercher un message…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        <div className="mailbox-list-heading"><strong>{folders.find(f=>f.id===folder)?.label}</strong><button type="button" aria-label="Actualiser les messages" onClick={()=>setTick(n=>n+1)}><HomeIcon name="refresh" size={16}/></button></div>
        {folder==='heygen'&&<p className="mailbox-provider-note">Les e-mails de HeyGen sont regroupés ici automatiquement.{Boolean(page?.counts.heygenUnread)&&<> {page!.counts.heygenUnread} conversation{page!.counts.heygenUnread>1?'s':''} non lue{page!.counts.heygenUnread>1?'s':''}.</>}</p>}
        {loading?<p className="mailbox-empty" role="status">Chargement des messages…</p>:!page?.items.length?<div className="mailbox-empty"><HomeIcon name="mail" size={30}/><strong>Aucun message</strong><span>{search?'Aucune conversation ne correspond à votre recherche.':folder==='heygen'?'Les prochains e-mails de HeyGen apparaîtront ici dès leur réception.':'Vos messages apparaîtront ici dès leur réception.'}</span></div>:
          page.items.map(thread=><button type="button" key={thread.id} className={`mailbox-thread${thread.unread?' is-unread':''}${selected===thread.id?' is-selected':''}`} disabled={sending||uploading}
            aria-pressed={selected===thread.id} onClick={()=>choose(thread.id)}><span className="mailbox-thread-top"><strong>{thread.peerName||thread.peerEmail}</strong><time dateTime={thread.lastAt}>{date(thread.lastAt)}</time></span>
            <span className="mailbox-thread-subject">{thread.unread>0&&<i aria-label="Non lu"/>}{thread.subject}</span><span className="mailbox-snippet">{thread.lastDirection==='out'?'Vous : ':''}{thread.snippet||'Pièce jointe'}</span>
            <span className="mailbox-thread-meta">{thread.messageCount} message{thread.messageCount>1?'s':''}{thread.attachmentCount>0&&<span><HomeIcon name="paperclip" size={12}/>{thread.attachmentCount}</span>}</span></button>)}
        {page?.nextCursor&&<button className="admin-button mailbox-more" type="button" disabled={more} onClick={()=>void loadMore()}>{more?'Chargement…':'Voir les conversations suivantes'}</button>}
      </section>
      <section className="mailbox-conversation" aria-label={compose?'Nouveau message':'Conversation sélectionnée'}>
        {!selected&&!compose?<div className="mailbox-placeholder"><span><HomeIcon name="mail" size={36}/></span><h3>Une conversation, tout son contexte.</h3><p>Sélectionnez un message pour lire les échanges et retrouver le compte client.</p></div>:
          <><div className="mailbox-conversation-heading"><button type="button" className="mailbox-back" onClick={()=>choose(null)} disabled={sending||uploading} aria-label="Retour aux conversations">←</button>
            <div><h3>{compose?'Nouveau message':detail?.thread.subject??'Chargement…'}</h3><span>{compose?'Depuis '+(page?.address??'contact@bienvu.online'):detail?.thread.peerEmail}</span></div>
            {!compose&&detail&&<div className="mailbox-actions"><button type="button" title="Marquer comme non lu" aria-label="Marquer comme non lu" disabled={acting||sending||uploading} onClick={()=>void action({action:'unread'})}><HomeIcon name="mail" size={18}/></button>
              <button type="button" title={detail.thread.folder==='inbox'?'Archiver':restoreLabel} aria-label={detail.thread.folder==='inbox'?'Archiver':restoreLabel} disabled={acting||sending||uploading}
                onClick={()=>void action({action:detail.thread.folder==='inbox'?'archive':'restore'})}><HomeIcon name="archive" size={18}/></button>
              {detail.thread.folder!=='spam'&&<button type="button" title="Déplacer dans les indésirables" aria-label="Déplacer dans les indésirables" disabled={acting||sending||uploading} onClick={()=>void action({action:'spam'})}><HomeIcon name="trash" size={18}/></button>}</div>}
          </div>
          {detailLoading?<p className="mailbox-empty" role="status">Lecture de la conversation…</p>:!compose&&detail&&<>
            {detail.client&&<div className="mailbox-client"><HomeIcon name="user" size={20}/><div><strong>{detail.client.name||detail.client.email}</strong><span>{detail.client.agency??'Compte BienVu'} · {detail.client.videos} vidéo{detail.client.videos>1?'s':''}</span></div>
              {detail.client.agencyId&&<a href={'/admin?view=videos&agency='+encodeURIComponent(detail.client.agencyId)}>Voir les vidéos <HomeIcon name="arrow" size={14}/></a>}
              {!!detail.client.recentVideos.length&&<details><summary>Dernières vidéos</summary>{detail.client.recentVideos.map(v=><a key={v.id} href={'/admin?view=videos&agency='+encodeURIComponent(detail.client!.agencyId!)}>{v.title} · {v.status==='ready'?'Prête':v.status==='failed'?'Échec':'En cours'}</a>)}</details>}</div>}
            <div className="mailbox-messages">{detail.olderCursor&&<button type="button" className="admin-button mailbox-older" disabled={older} onClick={()=>void loadOlder()}>{older?'Chargement…':'Charger les messages précédents'}</button>}
              {detail.messages.map(message=><article key={message.id} className={`mailbox-message mailbox-message-${message.direction}`}>
                <header><div><strong>{message.direction==='out'?'Vous · BienVu':message.fromName||message.fromEmail}</strong><span>{message.direction==='out'?'À : '+message.toEmail:message.fromEmail}</span></div><time dateTime={message.at}>{date(message.at)}</time></header>
                {message.replyTo&&message.direction==='in'&&message.replyTo!==message.fromEmail&&<p className="mailbox-reply-address">Réponse demandée à : {message.replyTo}</p>}
                <MailBody message={message} mailbox={mailbox}/>{message.truncated&&<p className="admin-muted">Message long : téléchargez l’original pour le lire intégralement.</p>}
                {message.attachments.length>0&&<div className="mailbox-attachments">{message.attachments.map(file=><a key={file.id} href={fileURL(message.id,file.id)+'?'+new URLSearchParams({mailbox})} download><HomeIcon name="paperclip" size={16}/><span>{file.name}<small>{size(file.size)}</small></span><HomeIcon name="download" size={15}/></a>)}</div>}
                <footer><span className={`mailbox-delivery mailbox-delivery-${message.delivery}`}>{message.delivery==='sent'&&<HomeIcon name="check" size={13}/>} {deliveries[message.delivery]}</span>
                  {message.hasOriginal&&<a href={fileURL(message.id,'original')+'?'+new URLSearchParams({mailbox})} download>Télécharger l’original</a>}</footer>
                {['failed','uncertain'].includes(message.delivery)&&<div className="mailbox-send-error" role="status"><p>{deliveryError(message)}</p>{message.delivery==='failed'&&message.attempts<3&&<button type="button" className="admin-button" disabled={sending||!page?.enabled} onClick={()=>void retry(message)}>Réessayer l’envoi</button>}</div>}
              </article>)}
            </div>
          </>}
          {(compose||canReply)&&!detailLoading&&<form className="mailbox-compose" onSubmit={e=>void send(e)}>
            {compose?<><label>À<input type="email" required maxLength={254} value={draft.to} disabled={sending} onChange={e=>changeDraft({to:e.target.value})} placeholder="client@agence.fr"/></label>
              <label>Objet<input required maxLength={200} value={draft.subject} disabled={sending} onChange={e=>changeDraft({subject:e.target.value})} placeholder="Votre vidéo BienVu"/></label></>:<p>Répondre à <strong>{recipient}</strong></p>}
            <label><span className={compose?'':'sr-only'}>Message</span><textarea required maxLength={MAILBOX_LIMITS.replyCharacters} rows={compose?9:5} value={draft.text} disabled={sending} onChange={e=>changeDraft({text:e.target.value})} placeholder="Écrivez votre message…"/></label>
            {!!draft.files.length&&<ul className="mailbox-draft-files">{draft.files.map(file=><li key={file.id}><HomeIcon name="paperclip" size={14}/><span>{file.name} · {size(file.size)}</span><button type="button" disabled={sending||uploading} aria-label={'Retirer '+file.name} onClick={()=>changeDraft({files:draft.files.filter(f=>f.id!==file.id)})}><HomeIcon name="close" size={14}/></button></li>)}</ul>}
            <div className="mailbox-compose-footer"><div><button className="admin-button" type="button" disabled={uploading||sending||!page?.enabled} onClick={()=>fileInput.current?.click()}><HomeIcon name="paperclip" size={17}/>{uploading?'Ajout…':'Joindre un fichier'}</button><small>3 Mo au total</small></div>
              <button type="submit" className="admin-button admin-button-dark" disabled={sending||uploading||!page?.enabled||!draft.text.trim()}>{sending?'Enregistrement…':'Envoyer'}<HomeIcon name="send" size={17}/></button></div>
            <input ref={fileInput} type="file" multiple hidden onChange={e=>void upload(e.target.files)}/>
          </form>}
          {detail?.thread.folder==='spam'&&<p className="mailbox-empty">Replacez cette conversation dans {detail.thread.category==='heygen'?'HeyGen':'la boîte de réception'} pour y répondre.</p>}
        </>}
      </section>
    </div>
  </div>;
}

function MailBody({message,mailbox}:{message:MailMessage;mailbox:string}){
  const [html,setHtml]=useState(message.hasOriginal);
  const parts=message.text.split(/(https?:\/\/[^\s<>]+|mailto:[^\s<>]+)/gi);
  return <div className="mailbox-body">{message.hasOriginal&&<div className="mailbox-body-tabs"><button type="button" aria-pressed={html} onClick={()=>setHtml(true)}>Mise en page</button><button type="button" aria-pressed={!html} onClick={()=>setHtml(false)}>Texte</button></div>}
    {html?<iframe className="mailbox-html" title={'E-mail : '+message.subject} loading="lazy" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" src={'/api/admin/mailbox/messages/'+encodeURIComponent(message.id)+'/html?'+new URLSearchParams({mailbox})}/>:<pre>{message.text?parts.map((part,i)=>i%2?<a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a>:part):'(Message sans texte)'}</pre>}
  </div>;
}
