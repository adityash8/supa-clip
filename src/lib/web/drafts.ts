export interface Draft {
 id: string; title: string; created: number; mime: string; chunks: Blob[]; size: number; duration: number; complete: boolean;
}
let database: Promise<IDBDatabase> | undefined;
function db() {
 if (!database) database = new Promise((resolve,reject) => {
  const req = indexedDB.open('supaclip_local',1);
  req.onupgradeneeded = () => req.result.createObjectStore('drafts',{ keyPath:'id' });
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => { database=undefined; reject(new Error('Local storage could not open. Check browser storage permissions.')); };
  req.onblocked = () => { database=undefined; reject(new Error('Close another SupaClip tab to open local storage.')); };
 });
 return database;
}
async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
 const database = await db();
 return new Promise((resolve,reject) => {
  const tx = database.transaction('drafts',mode,{ durability:'strict' });
  const request = work(tx.objectStore('drafts'));
  tx.oncomplete = () => resolve(request.result);
  tx.onerror = tx.onabort = () => reject(new Error('Local save failed. Stop and download your recording. Browser storage may be full.'));
 });
}
export async function saveDraft(draft: Draft) { await transaction('readwrite',s=>s.put(draft)); }
export function listDrafts(): Promise<Draft[]> { return transaction('readonly',s=>s.getAll()); }
export async function removeDraft(id: string) { await transaction('readwrite',s=>s.delete(id)); }
export function draftBlob(draft: Draft) { return new Blob(draft.chunks,{type:draft.mime}); }
