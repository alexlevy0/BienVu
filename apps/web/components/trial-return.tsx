'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {GenerationView} from '@bienvu/contracts';
import {useAccount} from './account';
export function TrialReturn(){
  const {me,loading}=useAccount(),[failure,setFailure]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{if(loading||!me)return;let disposed=false;
    void fetch('/api/trial/claim',{method:'POST'}).then(async response=>{const body=await response.json() as {error?:{code?:string;message?:string}};
      if(!response.ok)throw new Error(body.error?.code==='NOT_FOUND'?'Pour récupérer votre essai, revenez au navigateur dans lequel vous l’avez créé.':body.error?.message??'La récupération n’a pas abouti. Réessayez.');
      const job=GenerationView.parse(body);if(!disposed)window.location.replace(`/historique/${job.id}`);
    }).catch(e=>{if(!disposed)setFailure(e.message);});return()=>{disposed=true;};
  },[loading,me?.agency.id,retry]);
  return <section className="trial-result"><h1>Retrouvez votre vidéo.</h1>{loading?<p role="status">Vérification de votre connexion…</p>:!me?<><p>Connectez-vous pour enregistrer votre essai et télécharger sans filigrane.</p><Link className="home-primary-button" href="/connexion?trial=1">Se connecter</Link></>:failure?<><p role="alert">{failure}</p><button className="home-primary-button" onClick={()=>{setFailure('');setRetry(n=>n+1);}}>Réessayer</button><p><Link href="/biens">Mes biens</Link></p></>:<p role="status">Enregistrement de votre vidéo dans votre compte…</p>}</section>;
}
