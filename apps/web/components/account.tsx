'use client';
import {createContext, useCallback, useContext, useEffect, useState} from 'react';
import {Me, type AgencyProfile} from '@bienvu/contracts';
import {clearListingDraft} from '../lib/listing-draft';

type AccountState = {me: Me | null; loading: boolean; error: string; refresh: () => Promise<void>; refreshRights: () => Promise<void>; setAgency: (agency: AgencyProfile) => void};
const AccountContext = createContext<AccountState | null>(null);
export function AccountProvider({children}: {children: React.ReactNode}) {
  const [me, setMe] = useState<Me | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/me', {cache: 'no-store'});
      if (response.status === 401) {setMe(null); return;}
      if (!response.ok) throw new Error();
      setMe(Me.parse(await response.json()));
    } catch {setMe(null); setError('Votre espace est momentanément inaccessible. Réessayez.');}
    finally {setLoading(false);}
  }, []);
  const refreshRights=useCallback(async()=>{
    try{
      const response=await fetch('/api/me',{cache:'no-store'});if(!response.ok)return;
      const next=Me.parse(await response.json());
      // Refresh the quota without replacing an identity or resetting the studio.
      setMe(current=>current?.user.id===next.user.id&&current.agency.id===next.agency.id?{...current,rights:next.rights}:current);
    }catch{/* Keep the last known quota; admission is always checked by the server. */}
  },[]);
  useEffect(() => {void refresh();}, [refresh]);
  return <AccountContext.Provider value={{me, loading, error, refresh,refreshRights,
    setAgency: agency => setMe(current => current ? {...current, agency} : current)}}>{children}</AccountContext.Provider>;
}
export function useAccount() {
  const state = useContext(AccountContext);
  if (!state) throw new Error('ACCOUNT_PROVIDER_REQUIRED');
  return state;
}
export function SignOut() {
  const {refresh} = useAccount();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function signOut() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/sign-out', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
      if (!response.ok) throw new Error();
      clearListingDraft();await refresh(); window.location.assign('/connexion');
    } catch {setError('La déconnexion a échoué. Réessayez.'); setBusy(false);}
  }
  return <div><button className="button secondary" type="button" disabled={busy} onClick={signOut}>{busy ? 'Déconnexion…' : 'Se déconnecter'}</button><p className="form-feedback error" role="alert">{error}</p></div>;
}
