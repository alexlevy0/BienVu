'use client';
import {HomeIcon} from './home-icons';
import {HomeImportPreview} from './home-import-preview';
import type {PreparedUrlImport} from './url-import-estimate';

type Props={source:string;phase:'idle'|'detected'|'reading'|'ready'|'error'|'guest';value?:PreparedUrlImport;message?:string;credits:number;busy:boolean;onPersonalize():void;onRetry():void};

/** Beta presentation only. The caller supplies real import states; no extra requests. */
export function BetaImportFeedback({source,phase,value,message,credits,busy,onPersonalize,onRetry}:Props){
  const ready=phase==='ready'&&Boolean(value),reading=phase==='reading',failed=phase==='error';
  const host=source?new URL(source).hostname.replace(/^www\./,''):'';
  const title=ready?(value?.status==='needs_input'?'Annonce récupérée':'Annonce reconnue'):reading?'Lecture de votre annonce…':failed?'Annonce non récupérée':'Lien détecté';
  const description=ready?(value?.status==='needs_input'?'Vérifiez les informations du bien avant de continuer.':'Vos photos sont prêtes à être sélectionnées.'):reading?'Nous récupérons les informations et les photos du bien.':failed?'Votre lien est conservé.':phase==='guest'?'L’annonce sera analysée au lancement de votre essai.':'Préparation de la lecture de votre annonce.';
  return <div className="beta-import-feedback" data-active={Boolean(source)} data-phase={phase} aria-hidden={!source} inert={!source}>
    <div className="beta-import-feedback-clip"><section className="beta-import-card" aria-label="Lecture de votre annonce">
      <header className="beta-import-status"><span className="beta-import-status-icon" aria-hidden="true"><HomeIcon name={ready?'check':failed?'refresh':'link'} size={19}/></span>
        <div className="beta-import-status-copy"><p role="status" aria-live="polite" aria-atomic="true"><strong>{title}</strong><span>{description}</span></p></div>{source&&<small className="beta-import-status-host" title={host}>{host}</small>}
      </header>
      <div className="beta-import-reveal beta-import-loading" data-open={reading} aria-hidden="true"><div className="beta-import-feedback-clip"><div className="beta-import-skeleton">
        <span className="beta-import-skeleton-image"/><div><span/><span/><span/></div><span className="beta-import-skeleton-footer"/>
      </div></div></div>
      <div className="beta-import-reveal beta-import-result" data-open={ready} aria-hidden={!ready} inert={!ready}><div className="beta-import-feedback-clip">
        {ready&&value&&<HomeImportPreview key={source} value={value} credits={credits} busy={busy} onPersonalize={onPersonalize}/>}
      </div></div>
      {failed&&<div className="beta-import-error"><p>{message??'La lecture de cette annonce est indisponible. Vous pouvez réessayer ou ajouter vos propres photos.'}</p><button type="button" onClick={onRetry} disabled={busy}><HomeIcon name="refresh" size={15}/>Réessayer la lecture</button></div>}
    </section></div>
  </div>;
}
