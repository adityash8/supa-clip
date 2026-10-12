export class CloudError extends Error {
 constructor(public status:number,message:string) {super(message);}
}
export async function api(action:string,value?:unknown) {
 const response=await fetch(`/api/${action}`,{method:value===undefined?'GET':'POST',headers:value===undefined?{}:{'content-type':'application/json'},body:value===undefined?undefined:JSON.stringify(value),signal:AbortSignal.timeout(action==='finalize'?60000:20000)});
 const data=await response.json();
 if(!response.ok) throw new CloudError(response.status,data.message ?? 'Cloud request failed. Keep your local recording and retry.');
 return data;
}
export async function upload(blob:Blob,title:string,duration:number,onProgress:(value:number)=>void) {
 const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');
 const clip=await api('begin',{size:blob.size,type:'video/webm',title,duration,fingerprint});
 const partBytes=5*1024*1024;
 for(let part=0;part<Math.ceil(blob.size/partBytes);part++) {
  for(let attempt=0;attempt<2;attempt++) {
   try {
    const signed=await api('part',{id:clip.id,part});
    if(!signed.existing) {
     const response=await fetch(signed.url,{method:'PUT',headers:{'content-type':'application/octet-stream','x-upsert':'false'},body:blob.slice(part*partBytes,(part+1)*partBytes),signal:AbortSignal.timeout(15000),referrerPolicy:'no-referrer'});
     if(!response.ok) throw new Error('Upload part failed.');
    }
    break;
   } catch(error) { if(attempt===1) throw error; }
  }
  onProgress(Math.min(99,Math.round(Math.min(blob.size,(part+1)*partBytes)/blob.size*100)));
 }
 await api('finalize',{id:clip.id}); onProgress(100);
 return clip.id;
}
