import {LOGO_MAX_BYTES} from '@bienvu/contracts';

export type AgencyDraftFields = {name: string; phone: string; email: string; website: string; city: string; primaryColor: string; secondaryColor: string};
type StoredDraft = {fields: AgencyDraftFields; savedAt: number; logo: {blob: Blob; name: string; type: string; lastModified: number} | null};
export type AgencyDraft = {fields: AgencyDraftFields; logo: File | null};
const databaseName = 'bienvu-agency-draft', storeName = 'drafts', lifetime = 60 * 60 * 1000;
const limits: Record<keyof AgencyDraftFields, number> = {name:100, phone:25, email:254, website:2048, city:100, primaryColor:7, secondaryColor:7};

function record(mode: 'read' | 'write' | 'delete', value?: StoredDraft): Promise<StoredDraft | undefined> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(databaseName, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(storeName);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, transaction = db.transaction(storeName, mode === 'read' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore(storeName), request = mode === 'read' ? store.get('guest') : mode === 'write' ? store.put(value, 'guest') : store.delete('guest');
      let result: StoredDraft | undefined;
      request.onsuccess = () => {if (mode === 'read') result = request.result;};
      transaction.oncomplete = () => {db.close(); resolve(result);};
      transaction.onerror = transaction.onabort = () => {db.close(); reject(transaction.error);};
    };
  });
}
export async function readAgencyDraft(): Promise<AgencyDraft | null> {
  try {
    const value = await record('read');
    if (!value) return null;
    const validFields = value.fields && Object.entries(limits).every(([key, max]) => {
      const field = value.fields[key as keyof AgencyDraftFields];
      return typeof field === 'string' && field.length <= max;
    });
    const validLogo = value.logo === null || value.logo && value.logo.blob instanceof Blob && value.logo.blob.size > 0 && value.logo.blob.size <= LOGO_MAX_BYTES
      && ['image/png', 'image/jpeg'].includes(value.logo.type) && typeof value.logo.name === 'string' && Number.isFinite(value.logo.lastModified);
    if (!validFields || !validLogo || !Number.isFinite(value.savedAt) || value.savedAt > Date.now() || Date.now() - value.savedAt > lifetime) {
      await record('delete'); return null;
    }
    return {fields:value.fields, logo:value.logo ? new File([value.logo.blob], value.logo.name, {type:value.logo.type, lastModified:value.logo.lastModified}) : null};
  } catch {return null;}
}
export async function saveAgencyDraft(fields: AgencyDraftFields, logo: File | null): Promise<boolean> {
  try {
    await record('write', {fields, savedAt:Date.now(), logo:logo ? {blob:logo, name:logo.name, type:logo.type, lastModified:logo.lastModified} : null});
    return true;
  } catch {return false;}
}
export async function clearAgencyDraft() {
  try {await record('delete');} catch {/* Optional browser storage must not block saving or signing out. */}
}
