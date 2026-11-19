import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WEEK_DAYS,fillBusinessHours,emptyHours,validateBusinessProfile,buildBusinessPatch} from '../src/restaurant-business-rules.js';

const profile=()=>({name:'Comedor Ejemplo',type:'Comida típica',description:'Comida hondureña',address:'Barrio Central',phone:'9999-8888',image:'https://example.com/cover.jpg',hours:emptyHours()});
test('La ficha conserva siete días de semana con numeración JS correcta',()=>{
 assert.deepEqual(WEEK_DAYS.map(x=>x.id),[1,2,3,4,5,6,0]);
 assert.equal(Object.keys(emptyHours()).length,7);
});
test('Horas no configuradas permanecen sin publicar horarios inventados',()=>{
 const patch=buildBusinessPatch(profile());
 assert.equal(patch.hours,null);
 assert.equal(patch.name,'Comedor Ejemplo');
 assert.equal(patch.image,'https://example.com/cover.jpg');
});
test('Guarda hora de apertura y cierre de un día concreto',()=>{
 const sample=profile();
 sample.hours[1]={enabled:true,open:'08:00',close:'19:30'};
 sample.hours[5]={enabled:true,open:'09:00',close:'22:00'};
 const patch=buildBusinessPatch(sample);
 assert.deepEqual(patch.hours[1],{open:'08:00',close:'19:30'});
 assert.deepEqual(patch.hours[5],{open:'09:00',close:'22:00'});
 assert.equal(Object.keys(patch.hours).length,2);
});
test('Horario de cierre antes de apertura o inválido no se guarda',()=>{
 for(const [open,close] of [['18:00','08:00'],['08:00','08:00'],['24:00','08:00'],['10:75','12:00']]){
  const value=profile();value.hours[0]={enabled:true,open,close};
  assert.ok(validateBusinessProfile(value).hours);
  assert.throws(()=>buildBusinessPatch(value));
 }
});
test('Cargar horarios previos mantiene otros días desactivados',()=>{
 const filled=fillBusinessHours({'1':{open:'07:30',close:'19:30'},'6':{open:'08:00',close:'14:00'}});
 assert.equal(filled[1].enabled,true);
 assert.equal(filled[6].enabled,true);
 assert.equal(filled[0].enabled,false);
 assert.deepEqual(filled[2],{enabled:false,open:'08:00',close:'20:00'});
});
test('Valida nombre, teléfono, dirección y fotos seguras',()=>{
 for(const value of ['', 'A','a'.repeat(86)])assert.ok(validateBusinessProfile({...profile(),name:value}).name);
 assert.ok(validateBusinessProfile({...profile(),phone:'12xx'}).phone);
 assert.ok(validateBusinessProfile({...profile(),phone:'1'.repeat(16)}).phone);
 assert.ok(validateBusinessProfile({...profile(),address:'A'.repeat(181)}).address);
 assert.ok(validateBusinessProfile({...profile(),image:'javascript:alert(1)'}).image);
 assert.deepEqual(validateBusinessProfile(profile()),{});
});
test('Patch del negocio no incluye campos de permisos, pedidos ni productos',()=>{
 const patch=buildBusinessPatch({...profile(),permissions:['admin'],orders:[{id:5}],items:[{price:1}],id:'evil'});
 for(const key of ['id','items','orders','permissions'])assert.ok(!(key in patch));
});
test('Panel presenta información, horarios y fotos con advertencia de demo local',()=>{
 const cmp=readFileSync(new URL('../src/RestaurantBusinessSettings.jsx',import.meta.url),'utf8');
 const panel=readFileSync(new URL('../src/OnlineWorkspace.jsx',import.meta.url),'utf8');
 const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const wrapper=readFileSync(new URL('../src/AffiliateOnline.jsx',import.meta.url),'utf8');
 for(const txt of ['La identidad de tu negocio.','Nombre del negocio','Dirección','Teléfono del restaurante','¿Qué días atienden?','Elegir foto del restaurante','Guardar ficha del restaurante','Vista de prueba local'])assert.ok(cmp.includes(txt),txt);
 assert.ok(cmp.includes('buildBusinessPatch(draft)'));
 assert.ok(panel.includes('<RestaurantBusinessSettings restaurant={business}'));
 assert.ok(wrapper.includes('onRestaurantChange={onRestaurantChange}'));
 assert.ok(main.includes('onRestaurantChange={saveRestaurantProfile}'));
 assert.ok(main.includes('const keys=[\'name\',\'type\',\'description\',\'address\',\'phone\',\'image\',\'hours\']'));
});
test('Conservar la disponibilidad al recargar y evitar contraseñas de demo en fuente',()=>{
 const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const login=readFileSync(new URL('../src/AffiliateOnline.jsx',import.meta.url),'utf8');
 assert.ok(main.includes("[places,setPlaces]=useState(()=>stored('dv_places',initialPlaces))"));
 assert.ok(!main.includes("String(i.id)==='103'?{...i,soldOut:true"));
 assert.ok(login.includes('import.meta.env.DEV'));
 assert.ok(!login.includes('restorres'));
 assert.ok(!login.includes("demoPass='1326'"));
});
