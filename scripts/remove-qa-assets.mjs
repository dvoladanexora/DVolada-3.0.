/** Excluye páginas internas de QA del artefacto público.
 * Solo se ejecuta después de vite build; Vite DEV conserva el Device Studio
 * para revisión local de tamaños de pantalla.
 */
import {rm,access} from 'node:fs/promises';
import {join} from 'node:path';

const files=['device-studio.html'];
for(const filename of files){
 const target=join('dist',filename);
 await rm(target,{force:true});
 try{await access(target);throw Error('Internal QA resource still published: '+filename)}
 catch(error){if(error?.code!=='ENOENT')throw error}
}
console.log('Public build: internal QA files excluded');
