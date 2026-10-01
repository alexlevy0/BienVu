import {ListingUrl,VideoCustomization} from '@bienvu/contracts';

type ListingDraft = {kind: 'url'; url: string; savedAt: number} | {kind: 'manual'; savedAt: number;agencyId?:string;serverDraftId?:string};
const key = 'bienvu:listing-draft';
const manualKey = 'bienvu:manual-draft';
const lifetime = 60 * 60 * 1000;
const databaseName = 'bienvu-local-drafts';
const storeName = 'drafts';
const recordKey = 'manual';
const discardedServerDrafts=new Set<string>();

export const manualDraftFields = ['title', 'propertyType', 'transaction', 'locality', 'priceCents', 'charges', 'area', 'rooms', 'description'] as const;
export type ManualDraftFields = Record<typeof manualDraftFields[number], string>;
export type ManualDraft = {fields: ManualDraftFields; photos: File[]; savedAt: number; step: number; agencyId?:string; serverDraftId?:string;
  serverDraftVersion?:number;videoCustomization?:VideoCustomization;photoSlots?:number[]};
type StoredPhoto = {name: string; type: string; lastModified: number; blob: Blob};
type StoredManualDraft = {fields: ManualDraftFields; photos: StoredPhoto[]; savedAt: number; step?: number; agencyId?:string; serverDraftId?:string;
  serverDraftVersion?:number;videoCustomization?:VideoCustomization;photoSlots?:number[]};

function validTime(savedAt: number) {
  return Number.isFinite(savedAt) && savedAt <= Date.now() && Date.now() - savedAt <= lifetime;
}

function parseDraft(raw: string | null): ListingDraft | null {
  try {
    const value = JSON.parse(raw ?? 'null') as ListingDraft | null;
    if (!value || !validTime(value.savedAt)) return null;
    if (value.kind === 'manual') return value;
    if (value.kind === 'url' && ListingUrl.safeParse(value.url).success) return value;
  } catch { /* Stockage refusé ou ancienne valeur invalide. */ }
  return null;
}

function openManualDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function manualRecord(mode: 'read'): Promise<StoredManualDraft | undefined>;
async function manualRecord(mode: 'write', value: StoredManualDraft): Promise<void>;
async function manualRecord(mode: 'delete'): Promise<void>;
async function manualRecord(mode: 'read' | 'write' | 'delete', value?: StoredManualDraft): Promise<StoredManualDraft | undefined | void> {
  const database = await openManualDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode === 'read' ? 'readonly' : 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = mode === 'read' ? store.get(recordKey) : mode === 'write' ? store.put(value, recordKey) : store.delete(recordKey);
    let result: StoredManualDraft | undefined;
    request.onsuccess = () => {if (mode === 'read') result = request.result as StoredManualDraft | undefined;};
    transaction.oncomplete = () => {database.close(); resolve(result);};
    transaction.onerror = () => {database.close(); reject(transaction.error);};
    transaction.onabort = () => {database.close(); reject(transaction.error);};
  });
}

// Les URL restent dans l’onglet. Un formulaire manuel prêt à reprendre est aussi repérable après une vérification e-mail dans un autre onglet.
export function readListingDraft(): ListingDraft | null {
  try {const session = parseDraft(sessionStorage.getItem(key)); if (session) return session;
    sessionStorage.removeItem(key);} catch { /* Stockage de session indisponible. */ }
  try {const raw = localStorage.getItem(manualKey), manual = parseDraft(raw); if (manual?.kind === 'manual') return manual;
    localStorage.removeItem(manualKey);
    if (raw && typeof indexedDB !== 'undefined') void manualRecord('delete').catch(() => {});
  } catch { /* Stockage local indisponible. */ }
  if (typeof indexedDB !== 'undefined') void manualRecord('read').then(record => {
    if (record && !validTime(record.savedAt)) return manualRecord('delete');
  }).catch(() => {});
  return null;
}
export function saveListingDraft(value: {kind: 'url'; url: string} | {kind: 'manual'}) {
  try {sessionStorage.setItem(key, JSON.stringify({...value, savedAt: Date.now()})); return true;}
  catch {return false;}
}

export async function saveManualListingDraft(fields: ManualDraftFields, photos: File[], step = 0, agencyId?:string, serverDraftId?:string,
  serverDraftVersion?:number,videoCustomization?:VideoCustomization,photoSlots?:number[]) {
  if(serverDraftId&&discardedServerDrafts.has(`${agencyId}:${serverDraftId}`))return false;
  try {
    const savedAt = Date.now();
    await manualRecord('write', {fields, photos: photos.map(file => ({name: file.name, type: file.type, lastModified: file.lastModified, blob: file})), savedAt,
      step: Number.isInteger(step) && step >= 0 && step <= 4 ? step : 0,agencyId,serverDraftId,serverDraftVersion,videoCustomization,photoSlots});
    if(serverDraftId&&discardedServerDrafts.has(`${agencyId}:${serverDraftId}`)){
      await discardManualListingDraft(agencyId!,serverDraftId);return false;}
    const marker=JSON.stringify({kind:'manual',savedAt,agencyId,serverDraftId});
    try{sessionStorage.setItem(key,marker);}catch{await manualRecord('delete');return false;}
    try {localStorage.setItem(manualKey, marker);} catch { /* Reprise possible dans cet onglet uniquement. */ }
    return true;
  } catch {return false;}
}

export async function discardManualListingDraft(agencyId:string,id:string){
  discardedServerDrafts.add(`${agencyId}:${id}`);
  try{
    const database=await openManualDatabase();
    const removed=await new Promise<StoredManualDraft|undefined>((resolve,reject)=>{
      const transaction=database.transaction(storeName,'readwrite'),store=transaction.objectStore(storeName),request=store.get(recordKey);
      let matched:StoredManualDraft|undefined;
      request.onsuccess=()=>{const record=request.result as StoredManualDraft|undefined;
        if(record?.agencyId===agencyId&&record.serverDraftId===id){matched=record;store.delete(recordKey);}};
      transaction.oncomplete=()=>{database.close();resolve(matched);};
      transaction.onerror=transaction.onabort=()=>{database.close();reject(transaction.error);};
    });
    if(!removed)return;
    const session=parseDraft(sessionStorage.getItem(key));
    // Old session markers had their own timestamp and no server ID. The matched
    // IndexedDB record identifies that legacy manual marker; URL drafts stay intact.
    if(session?.kind==='manual'&&(!session.serverDraftId||
      session.agencyId===agencyId&&session.serverDraftId===id))sessionStorage.removeItem(key);
    if(parseDraft(localStorage.getItem(manualKey))?.savedAt===removed.savedAt)localStorage.removeItem(manualKey);
    sessionStorage.removeItem(`bienvu:manual-start:${agencyId}`);
  }catch{/* Server deletion still succeeds if optional browser storage is unavailable. */}
}

export async function readManualListingDraft(agencyId?:string): Promise<ManualDraft | null> {
  if (readListingDraft()?.kind !== 'manual') return null;
  try {
    const record = await manualRecord('read');
    if (!record || !validTime(record.savedAt) || !Array.isArray(record.photos) ||
      !manualDraftFields.every(field => typeof record.fields?.[field] === 'string')) {
      clearListingDraft(); return null;
    }
    if(record.agencyId && record.agencyId!==agencyId)return null;
    const photos = record.photos.map(photo => new File([photo.blob], photo.name, {type: photo.type, lastModified: photo.lastModified}));
    const customization=VideoCustomization.safeParse(record.videoCustomization);
    const slots=record.photoSlots;
    return {fields: record.fields, photos, savedAt: record.savedAt,agencyId:record.agencyId,serverDraftId:record.serverDraftId,
      videoCustomization:customization.success?customization.data:undefined,
      photoSlots:Array.isArray(slots)&&slots.length===photos.length&&slots.every(n=>Number.isInteger(n)&&n>=0&&n<=11)&&new Set(slots).size===slots.length?slots:undefined,
      serverDraftVersion:Number.isSafeInteger(record.serverDraftVersion)?record.serverDraftVersion:undefined,
      step: Number.isInteger(record.step) && record.step! >= 0 && record.step! <= 4 ? record.step! : 0};
  } catch {return null;}
}

export function clearListingDraft() {
  try {sessionStorage.removeItem(key);} catch { /* Private browsing may refuse storage. */ }
  try {localStorage.removeItem(manualKey);} catch { /* Private browsing may refuse storage. */ }
  if (typeof indexedDB !== 'undefined') void manualRecord('delete').catch(() => {});
}
