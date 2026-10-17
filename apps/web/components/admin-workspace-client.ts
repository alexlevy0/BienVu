import type {AdminPreferences,WorkspaceDocument} from '../lib/admin-workspace';
export async function workspaceRequest<T>(section:string,params:Record<string,string>={},signal?:AbortSignal):Promise<T>{
 const r=await fetch('/api/admin/workspace?'+new URLSearchParams({section,...params}),{cache:'no-store',signal});
 if(!r.ok)throw Error(r.status===403?'Accès réservé à l’administration.':'Le chargement a échoué. Réessayez.');return r.json() as Promise<T>;
}
export async function workspaceSave<T=unknown>(body:unknown):Promise<T>{
 const r=await fetch('/api/admin/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!r.ok)throw Object.assign(Error(r.status===409?'Une modification plus récente existe. Actualisez avant de réessayer.':r.status===429?'Trop de modifications. Patientez une minute.':r.status===422?'Vérifiez les champs du formulaire.':'L’enregistrement a échoué. Réessayez.'),{status:r.status});return r.json() as Promise<T>;
}
export async function readPreferences(){const {document}=await workspaceRequest<{document:WorkspaceDocument<AdminPreferences>|null}>('preferences');return document;}
export async function patchPreferences(change:(value:AdminPreferences)=>AdminPreferences){
 for(let attempt=0;attempt<3;attempt++){
  const doc=await readPreferences(),value=change(doc?.value??{favorites:[],filters:{},alerts:false});
  try{return await workspaceSave<WorkspaceDocument<AdminPreferences>>({action:'preferences',revision:doc?.revision??0,value});}
  catch(e){if(!(e&&typeof e==='object'&&'status' in e&&e.status===409)||attempt===2)throw e;}
 }throw Error('Synchronisation interrompue.');
}
const pendingFilters=new Map<string,ReturnType<typeof setTimeout>>();
export function syncFilters(accountId:string,view:string,filters:Record<string,string>){
 const key=accountId+':'+view;clearTimeout(pendingFilters.get(key));
 pendingFilters.set(key,setTimeout(()=>{pendingFilters.delete(key);void patchPreferences(p=>({...p,filters:{...p.filters,[view]:filters}})).catch(()=>window.dispatchEvent(new CustomEvent('bienvu:admin-sync-error')));},700));
}
