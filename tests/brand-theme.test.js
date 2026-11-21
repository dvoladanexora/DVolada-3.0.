import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DVOLADA_ACCENT,normalizeDvoladaTheme,resolveDvoladaTheme,applyDvoladaTheme} from '../src/brand-theme.js';
test('Paleta oficial nunca se convierte en rojo/verde por un valor persistido',()=>{
 assert.equal(DVOLADA_ACCENT,'#f26732');
 for(const value of ['#ff0000','#00ff00','hour','red',null,{},''])assert.equal(normalizeDvoladaTheme(value),'light');
 assert.equal(resolveDvoladaTheme('system',true),'dark');
 assert.equal(resolveDvoladaTheme('system',false),'light');
 assert.equal(resolveDvoladaTheme('dark',false),'dark');
});
test('Modo automático actualiza tema, color nativo y acento único',()=>{
 const attrs={};const meta={setAttribute:(k,v)=>{attrs[k]=v}};
 const root={dataset:{},style:{setProperty:(k,v)=>{attrs[k]=v}}};
 const doc={documentElement:root,querySelector:()=>meta};
 assert.equal(applyDvoladaTheme(doc,'system',true),'dark');
 assert.equal(root.dataset.theme,'dark');
 assert.equal(root.style.colorScheme,'dark');
 assert.equal(attrs.content,'#161b25');
 assert.equal(attrs['--accent'],DVOLADA_ACCENT);
 assert.equal(applyDvoladaTheme(doc,'system',false),'light');
 assert.equal(root.dataset.theme,'light');
 assert.equal(root.style.colorScheme,'light');
 assert.equal(attrs.content,DVOLADA_ACCENT);
});
test('La app no permite modificar color oficial ni conserva acentos por navegador',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.ok(!main.includes('setBrand('));
 assert.ok(!main.includes("stored('dv_brand'"));
 assert.ok(!main.includes('dv_brand:brand'));
 assert.ok(main.includes("preference.addEventListener?.('change',apply)"));
 const css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');
 assert.ok(css.includes('color-scheme:light'));
 assert.ok(css.includes('color-scheme:dark'));
});
