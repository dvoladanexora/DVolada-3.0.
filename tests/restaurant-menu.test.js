import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MENU_CATEGORIES,MAX_MENU_IMAGE_FILE,cleanMenuExtras,makeMenuProduct,menuSummary,safeCatalogImage,validateMenuDraft,readPhotoAsThumbnail} from '../src/restaurant-menu-rules.js';

const basic=()=>({name:'Pollo con tajadas',price:'130.50',category:'Pollo',prepTime:'25',description:'Con ensalada',image:'https://example.org/pollo.jpg',extras:'Queso extra, Aguacate, Queso extra',available:true});
test('acepta producto completo con moneda, extras únicos y estado visible',()=>{
 const item=makeMenuProduct(basic(),[],null);
 assert.ok(item.id);
 assert.equal(item.name,'Pollo con tajadas');
 assert.equal(item.price,130.5);
 assert.equal(item.category,'Pollo');
 assert.equal(item.prepTime,25);
 assert.deepEqual(item.extras,['Queso extra','Aguacate']);
 assert.equal(item.available,true);
 assert.equal(item.soldOut,false);
 assert.equal(item.image,'https://example.org/pollo.jpg');
});
test('corrige precio válido de dos decimales que expone error de punto flotante',()=>{
 assert.deepEqual(validateMenuDraft({...basic(),price:'0.29'}),{});
 assert.equal(makeMenuProduct({...basic(),price:'0.29'}).price,.29);
});
test('restringe cantidades monetarias y nombres inválidos',()=>{
 for(const val of ['','0','-1','10000.01','500000','NaN','0.001','Infinity','-20']){
  assert.ok(validateMenuDraft({...basic(),price:val}).price,String(val));
 }
 for(const bad of ['','a','  '])assert.ok(validateMenuDraft({...basic(),name:bad}).name);
 assert.ok(validateMenuDraft({...basic(),name:'a'.repeat(81)}).name);
});
test('evita productos duplicados en el mismo negocio, permite editar el existente',()=>{
 const old=[{id:1,name:'Pollo con tajadas',price:130}];
 assert.ok(validateMenuDraft(basic(),old,null).name);
 assert.deepEqual(validateMenuDraft(basic(),old,1),{});
 const updated=makeMenuProduct({...basic(),name:'Pollo con tajadas',price:'145'},old,1);
 assert.equal(updated.id,1);
 assert.equal(updated.price,145);
});
test('valida categorías, minutos y descripción',()=>{
 assert.ok(MENU_CATEGORIES.includes('Bebidas'));
 assert.ok(validateMenuDraft({...basic(),category:'Otra inventada'}).category);
 for(const prepTime of ['0','181','2.5','abc'])assert.ok(validateMenuDraft({...basic(),prepTime}).prepTime);
 assert.ok(validateMenuDraft({...basic(),description:'x'.repeat(221)}).description);
});
test('imágenes permiten solo HTTPS o datos base64 válidos dentro del límite',()=>{
 for(const url of ['javascript:alert(1)','http://example.org/a.jpg','data:text/html,<script>', 'file:///etc/passwd','https://user:pw@example.org/a.jpg'])assert.equal(safeCatalogImage(url),'');
 assert.equal(safeCatalogImage('https://example.com/photo.jpg'),'https://example.com/photo.jpg');
 assert.ok(safeCatalogImage('data:image/jpeg;base64,AAAA'));
 assert.ok(validateMenuDraft({...basic(),image:'javascript:alert(1)'}).image);
});
test('extras no pueden repetirse aunque cambie el uso de mayúsculas',()=>{
 const extras=cleanMenuExtras('Aguacate, Queso, aguacate, SALSA, salsa, Salsa');
 assert.deepEqual(extras,['Aguacate','Queso','SALSA']);
 assert.equal(cleanMenuExtras(Array.from({length:30},(_,i)=>'Extra'+i)).length,8);
});
test('editar disponibilidad mantiene id y marca agotado',()=>{
 const old=[{id:15,name:'Baleada',price:50,image:'',category:'Baleadas'}];
 const product=makeMenuProduct({...basic(),name:'Baleada',category:'Baleadas',available:false,image:''},old,15);
 assert.equal(product.id,15);
 assert.equal(product.available,false);
 assert.equal(product.soldOut,true);
});
test('resumen de catálogo identifica productos disponibles, agotados y sin foto',()=>{
 const items=[{id:1,available:true,image:'https://example.com/a.jpg'},{id:2,available:false,image:''},{id:3,soldOut:true,image:'javascript:bad'}];
 assert.deepEqual(menuSummary(items),{total:3,active:1,soldOut:2,missingPhoto:2});
});
test('archivo de foto inválido se rechaza sin crear URL en entorno sin navegador',async()=>{
 await assert.rejects(readPhotoAsThumbnail({type:'image/svg+xml',size:200}),/JPG, PNG o WebP/);
 await assert.rejects(readPhotoAsThumbnail({type:'image/jpeg',size:MAX_MENU_IMAGE_FILE+1}),/5 MB/);
 await assert.rejects(readPhotoAsThumbnail({type:'image/png',size:900}),/no permite procesar la foto/);
});
test('editor Cloud incluye CRUD, fotos, filtros, alertas y notas sobre modo local',()=>{
 const menu=readFileSync(new URL('../src/RestaurantMenuEditor.jsx',import.meta.url),'utf8');
 const panel=readFileSync(new URL('../src/OnlineWorkspace.jsx',import.meta.url),'utf8');
 const wrapper=readFileSync(new URL('../src/AffiliateOnline.jsx',import.meta.url),'utf8');
 const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 for(const part of ['Nuevo producto','Editar producto','Sí, eliminar','Buscar productos','Seleccionar fotografía','Agotar','Activar','Guardar cambios','Modo de prueba local']){
  assert.ok(menu.includes(part),'UI falta: '+part);
 }
 assert.ok(menu.includes('readPhotoAsThumbnail(file)'));
 assert.ok(menu.includes('validateMenuDraft(form,items,editingId)'));
 assert.ok(panel.includes("screen==='menu'&&<RestaurantMenuEditor"));
 assert.ok(wrapper.includes('onCatalogChange={onCatalogChange}'));
 assert.ok(main.includes('onCatalogChange={saveRestaurantMenu}'));
 assert.ok(main.includes('mutateDemoPlaces(localStorage,places,latest=>'));
 const bridge=readFileSync(new URL('../src/restaurant-demo-bridge.js',import.meta.url),'utf8');
 assert.ok(bridge.includes('content.length>3_200_000'));
});

test('Editor descarta subidas tardías al cancelar, cambiar de producto o reabrir',()=>{
 const src=readFileSync(new URL('../src/RestaurantMenuEditor.jsx',import.meta.url),'utf8');
 assert.ok(src.includes('photoRequest=useRef(0)'));
 assert.ok(src.includes('const request=++photoRequest.current'));
 assert.ok(src.includes("if(request===photoRequest.current)setField('image',url)"));
 assert.ok(src.includes('if(request===photoRequest.current)setPhotoBusy(false)'));
 assert.ok(src.includes('const closeEditor=()=>{photoRequest.current++;setPhotoBusy(false)'));
 assert.ok(src.includes('const openEditor=(item=null)=>{\n  photoRequest.current++;setPhotoBusy(false)'));
 assert.ok(src.includes("setForm(current=>current?{...current,[key]:value}:current)"));
});

test('Menú extenso se carga por bloques y las validaciones llevan al campo incorrecto',()=>{
 const ui=readFileSync(new URL('../src/RestaurantMenuEditor.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/restaurant-menu-editor.css',import.meta.url),'utf8');
 assert.ok(ui.includes('useState(24)'));
 assert.ok(ui.includes('setVisibleCount(24),[restaurant?.id,query,category,stock]'));
 assert.ok(ui.includes('matching.slice(0,visibleCount).map(item='));
 assert.ok(ui.includes('matching.length>visibleCount'));
 assert.ok(ui.includes('setVisibleCount(count=>count+24)'));
 assert.ok(ui.includes('aria-invalid={Boolean(errors.category)}'));
 assert.ok(ui.includes('aria-invalid={Boolean(errors.description)}'));
 assert.ok(ui.includes('aria-invalid={Boolean(errors.image)}'));
 assert.ok(ui.includes("requestAnimationFrame(()=>formRef.current?.querySelector('[aria-invalid=\"true\"]')?.focus())"));
 assert.ok(ui.includes('role="alert">Revisá los campos marcados'));
 assert.ok(css.includes('.dv-menu-load-more'));
 assert.ok(css.includes('.dv-menu-photo-upload:focus-within'));
});

test('más de ocho extras se rechaza claramente en lugar de guardarlos incompletos',()=>{
 const valid='Extra 1, Extra 2, Extra 3, Extra 4, Extra 5, Extra 6, Extra 7, Extra 8';
 const invalid=valid+', Extra 9';
 assert.equal(cleanMenuExtras(invalid).length,8,'el listado visual puede limitarse a ocho');
 assert.equal(cleanMenuExtras(invalid,9).length,9,'la validación debe contar la novena opción');
 assert.equal(validateMenuDraft({...basic(),extras:valid}).extras,undefined);
 assert.match(validateMenuDraft({...basic(),extras:invalid}).extras,/Máximo 8 extras/);
 assert.throws(()=>makeMenuProduct({...basic(),extras:invalid}),/Revisá los datos/);
 assert.equal(validateMenuDraft({...basic(),extras:valid+', extra 1'}).extras,undefined,
  'opciones repetidas no deben contar dos veces');
 const editor=readFileSync(new URL('../src/RestaurantMenuEditor.jsx',import.meta.url),'utf8');
 assert.ok(editor.includes('aria-invalid={Boolean(errors.extras)}'));
 assert.ok(editor.includes('role="alert">{errors.extras}'));
});
