/** Trusted local operator ONLY. Never deploy this file or the secret key to web hosting.
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables required. */
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const base=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!base||!secret){console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');process.exit(1)}
for(let i=1;i<=3;i++){
 const name=`exercice-${i}.mp3`,file=path.join(dir,'../public/assets/audio',name);
 const res=await fetch(`${base}/storage/v1/object/delf-audio/${name}`,{method:'POST',headers:{
  apikey:secret,Authorization:`Bearer ${secret}`,'Content-Type':'audio/mpeg','x-upsert':'true'
 },body:fs.readFileSync(file)});
 if(!res.ok){console.error('Upload failed',name,res.status,await res.text());process.exitCode=1}
 else console.log('Uploaded',name);
}
