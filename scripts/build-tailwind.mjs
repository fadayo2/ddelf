// Tailwind v4 offline compile of utility candidates referenced in our HTML and JS.
// Requires the installed tailwindcss package (v4.1.10).
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {compile}=require('tailwindcss');
const root=new URL('../public/',import.meta.url).pathname;
const files=[...fs.readdirSync(root).filter(f=>f.endsWith('.html')).map(f=>path.join(root,f)),...fs.readdirSync(path.join(root,'assets/js')).filter(f=>f.endsWith('.js')).map(f=>path.join(root,'assets/js',f))];
let candidates=new Set();
for(const f of files){let txt=fs.readFileSync(f,'utf8');for(let m of txt.matchAll(/class(?:Name)?=["']([^"']+)["']/g)){m[1].split(/\s+/).forEach(c=>{if(/^[a-z0-9:_\-/[\].]+$/i.test(c))candidates.add(c)})}}
// ensure core responsive utilities in static bundle
'flex flex-1 flex-wrap justify-between justify-center justify-end items-center items-end gap-2 gap-3 gap-4 gap-5 text-center w-full ml-2 ml-3 mt-1 mt-2 mt-3 mt-4 mt-5 mt-6 mt-7 mt-8 mt-10 antialiased hidden'.split(' ').forEach(x=>candidates.add(x));
const theme=fs.readFileSync(require.resolve('tailwindcss/theme.css'),'utf8');
const result=await compile(theme+'\n@tailwind utilities;');const css=result.build([...candidates]);
fs.writeFileSync(path.join(root,'assets/css/tailwind-utilities.css'),css);
console.log('Tailwind CSS compiled',candidates.size,'candidates',css.length,'bytes');
