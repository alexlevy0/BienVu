'use client';
import {useEffect, useState, type FormEvent} from 'react';
import Link from 'next/link';
import {useAccount, SignOut} from './account';
import {readListingDraft} from '../lib/listing-draft';

type Mode = 'signin' | 'signup' | 'forgot' | 'verify' | 'reset';
const titles: Record<Mode, string> = {signin: 'Heureux de vous retrouver.', signup: 'Créons votre compte.',
  forgot: 'Mot de passe oublié ?', verify: 'Confirmez votre adresse.', reset: 'Un nouveau mot de passe.'};
const labels: Record<Mode, string> = {signin: 'Se connecter', signup: 'Créer mon compte',
  forgot: 'Recevoir le lien', verify: 'Renvoyer le lien', reset: 'Enregistrer le mot de passe'};

export function Login() {
  const {me, loading, error, refresh} = useAccount();
  const [configured, setConfigured] = useState<{google: boolean; emailDelivery: boolean} | null>(null);
  const [mode, setMode] = useState<Mode>('signin'), [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [token, setToken] = useState(''), [failure, setFailure] = useState(''), [notice, setNotice] = useState('');
  const [hasDraft, setHasDraft] = useState(false),[trial,setTrial]=useState(false);
  useEffect(() => {
    setHasDraft(Boolean(readListingDraft()));
    setTrial(new URL(window.location.href).searchParams.get('trial')==='1');
    void fetch('/api/trial',{cache:'no-store'}).then(r=>r.json() as Promise<{hasIntent?:boolean}>).then(data=>{if(data.hasIntent)setTrial(true);}).catch(()=>{});
    void fetch('/api/auth/status', {cache: 'no-store'}).then(r => r.ok ? r.json() as Promise<{google: boolean; emailDelivery: boolean}> : null).then(setConfigured).catch(() => setConfigured(null));
    const url = new URL(window.location.href);
    if (url.searchParams.get('mode') === 'reset') {
      setMode('reset');
      const value = new URLSearchParams(url.hash.slice(1)).get('token') ?? '';
      setToken(value);
      if (!value) setFailure('Ce lien est invalide ou expiré. Demandez un nouveau lien.');
      // Le secret reste uniquement en mémoire jusqu’à la soumission du formulaire.
      window.history.replaceState(null, '', '/connexion?mode=reset');
    } else if (url.searchParams.get('mode') === 'signup') setMode('signup');
    else if (url.searchParams.has('error')) setFailure(url.searchParams.get('error') === 'verification'
      ? 'Ce lien est invalide ou expiré. Demandez un nouveau lien de confirmation.' : 'La connexion n’a pas abouti. Vous pouvez réessayer.');
    else if (url.searchParams.get('verified') === '1') setNotice('Adresse confirmée. Vous pouvez vous connecter.');
  }, []);
  function changeMode(next: Mode) {setMode(next); setPassword(''); setConfirmation(''); setFailure(''); setNotice('');}
  async function connectGoogle() {
    setBusy('google'); setFailure('');
    try {
      const response = await fetch('/api/auth/sign-in/social', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({provider: 'google', ...(trial ? {continueTrial:true} : readListingDraft() ? {continueListing: true} : {})})});
      const data = await response.json() as {url: string; error?: {message?: string}};
      if (!response.ok) {setFailure(data.error?.message ?? 'La connexion a échoué.'); setBusy(null); return;}
      const url = new URL(data.url);
      if (url.origin !== 'https://accounts.google.com') throw new Error();
      window.location.assign(url.href);
    } catch {setFailure('La connexion a échoué. Réessayez.'); setBusy(null);}
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFailure(''); setNotice('');
    if (mode === 'reset' && password !== confirmation) {setFailure('Les deux mots de passe doivent être identiques.'); return;}
    setBusy('email');
    const path = {signin: 'sign-in/email', signup: 'sign-up/email', forgot: 'request-password-reset', verify: 'send-verification-email', reset: 'reset-password'}[mode];
    const body = mode === 'reset' ? {newPassword: password, token} : mode === 'signin' || mode === 'signup' ? {email, password} : {email};
    try {
      const response = await fetch(`/api/auth/${path}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
      const data = await response.json() as {authenticated?: boolean; error?: {code?: string; message?: string}};
      if (!response.ok) {setFailure(data.error?.message ?? 'La demande a échoué. Réessayez.'); return;}
      setPassword(''); setConfirmation('');
      if (mode === 'signin' || mode === 'signup' && data.authenticated === true) {window.location.assign(trial ? '/essai/recuperer' : readListingDraft() ? '/' : '/agence'); return;}
      if (mode === 'reset') {await refresh(); setToken(''); setMode('signin'); setNotice('Mot de passe enregistré. Connectez-vous avec votre nouveau mot de passe.');}
      else if (mode === 'signup') {setMode('verify'); setNotice('Consultez votre messagerie pour confirmer votre adresse. Si vous avez déjà un compte, connectez-vous ou utilisez « Mot de passe oublié ».');}
      else setNotice(mode === 'forgot' ? 'Si un compte correspond à cette adresse, vous recevrez un lien pour choisir votre mot de passe.'
        : 'Si cette adresse doit être confirmée, vous recevrez un nouveau lien. Pensez à vérifier les courriers indésirables.');
    } catch {setFailure('La demande a échoué. Vérifiez votre connexion puis réessayez.');}
    finally {setBusy(null);}
  }
  if (loading) return <div className="login-box" role="status"><p>Ouverture de votre espace…</p></div>;
  if (me && mode !== 'reset') return <div className="login-box"><h2>Vous êtes connecté</h2><p>{me.user.email}</p><Link className="button primary" href={trial ? '/essai/recuperer' : hasDraft ? '/' : '/agence'}>{trial ? 'Récupérer ma vidéo' : hasDraft ? 'Reprendre mon annonce' : 'Retrouver mon agence'}</Link><SignOut/></div>;
  const needsPassword = mode === 'signin' || mode === 'signup' || mode === 'reset';
  return <div className="login-box auth-box"><h2>{titles[mode]}</h2>
    {(mode === 'signin' || mode === 'signup') && <><p>{trial?'Connectez-vous pour enregistrer votre vidéo et télécharger sans filigrane.':'Votre agence vous attend. Choisissez votre mode de connexion.'}</p>{trial&&<p className="field-help">Votre aperçu reste disponible. <Link href="/">Revenir à ma vidéo</Link></p>}
      <button type="button" className="button secondary google-button" disabled={!configured?.google || !!busy} onClick={connectGoogle}>
        <span aria-hidden="true" className="google-letter">G</span>{busy === 'google' ? 'Redirection…' : 'Continuer avec Google'}</button>
      {configured && !configured.google && <p className="field-help">Google sera disponible après configuration.</p>}
      <p className="auth-google-privacy">Google partage votre identité et votre e-mail pour vous connecter. <Link href="/confidentialite#google">Comment BienVu utilise ces données</Link>.</p>
      <div className="auth-divider"><span>ou avec votre e-mail</span></div></>}
    {mode === 'forgot' && <p>Recevez un lien pour réinitialiser votre mot de passe ou en définir un pour votre compte Google.</p>}
    {error && <p className="form-feedback error" role="alert">{error} <button type="button" className="text-button" onClick={() => void refresh()}>Réessayer</button></p>}
    <form className="auth-form" onSubmit={submit}>
      {mode !== 'reset' && <label htmlFor="auth-email">Adresse e-mail<input id="auth-email" name="email" type="email" autoComplete="email" placeholder="vous@agence.fr" required maxLength={254} value={email} disabled={!!busy} onChange={e => setEmail(e.target.value)}/></label>}
      {needsPassword && <label htmlFor="auth-password">{mode === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'}<input id="auth-password" name="password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={mode === 'signin' ? 1 : 12} maxLength={128} value={password} disabled={!!busy} aria-describedby={mode === 'signin' ? undefined : 'password-help'} onChange={e => setPassword(e.target.value)}/></label>}
      {needsPassword && mode !== 'signin' && <p id="password-help" className="field-help">12 caractères minimum. Une phrase facile à retenir convient très bien.</p>}
      {mode === 'reset' && <label htmlFor="auth-confirmation">Confirmer le mot de passe<input id="auth-confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} disabled={!!busy} onChange={e => setConfirmation(e.target.value)}/></label>}
      {mode === 'signin' && <button type="button" className="text-button auth-forgot" disabled={!!busy} onClick={() => changeMode('forgot')}>Mot de passe oublié ?</button>}
      <p className="form-feedback error" role="alert">{failure}</p>
      <p className="form-feedback success" role="status">{notice}</p>{notice.includes('confirmée')&&<p className="field-help">Vous avez commencé un essai ? Connectez-vous depuis le navigateur où vous l’avez créé pour le récupérer.</p>}
      <button className="button primary" type="submit" disabled={!!busy || mode === 'reset' && !token}>{busy === 'email' ? 'Un instant…' : labels[mode]}</button>
    </form>
    <div className="auth-actions">
      {mode === 'signin' ? <><span>Vous découvrez BienVu ?</span><button className="text-button" type="button" disabled={!!busy} onClick={() => changeMode('signup')}>Créer un compte</button></>
        : <button className="text-button" type="button" disabled={!!busy} onClick={() => changeMode('signin')}>Revenir à la connexion</button>}
      {(mode === 'signin' || mode === 'reset') && <button className="text-button" type="button" disabled={!!busy} onClick={() => changeMode(mode === 'reset' ? 'forgot' : 'verify')}>{mode === 'reset' ? 'Demander un nouveau lien' : 'Renvoyer l’e-mail de confirmation'}</button>}
    </div>
  </div>;
}
