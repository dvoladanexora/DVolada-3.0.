import {safeCatalogImage} from './restaurant-menu-rules.js';

export const WEEK_DAYS=Object.freeze([
 {id:1,label:'Lunes'},{id:2,label:'Martes'},{id:3,label:'Miércoles'},
 {id:4,label:'Jueves'},{id:5,label:'Viernes'},{id:6,label:'Sábado'},{id:0,label:'Domingo'},
]);
const timePattern=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const emptyHours=()=>Object.fromEntries(WEEK_DAYS.map(({id})=>[id,{enabled:false,open:'08:00',close:'20:00'}]));
export function fillBusinessHours(hours){
 const result=emptyHours();
 for(const {id} of WEEK_DAYS){
  const value=hours?.[id]??hours?.[String(id)];
  if(value&&timePattern.test(String(value.open))&&timePattern.test(String(value.close))){
   result[id]={enabled:true,open:String(value.open),close:String(value.close)};
  }
 }
 return result;
}
export function validateBusinessProfile(draft){
 const errors={};
 const name=String(draft.name||'').trim();
 const phone=String(draft.phone||'').trim();
 const image=String(draft.image||'').trim();
 if(name.length<3||name.length>85)errors.name='Nombre del negocio: 3 a 85 caracteres.';
 if(String(draft.type||'').trim().length>55)errors.type='Especialidad demasiado larga (máximo 55 caracteres).';
 if(String(draft.description||'').length>400)errors.description='Descripción demasiado larga (máximo 400 caracteres).';
 if(String(draft.address||'').length>180)errors.address='Dirección demasiado larga (máximo 180 caracteres).';
 if(phone&&(!/^[+()0-9\s-]{8,25}$/.test(phone)||phone.replace(/\D/g,'').length<8))errors.phone='Ingresá un teléfono de 8 a 15 dígitos.';
 if(phone&&phone.replace(/\D/g,'').length>15)errors.phone='Máximo 15 dígitos.';
 if(image&&!safeCatalogImage(image))errors.image='La fotografía debe utilizar HTTPS o una imagen local válida.';
 const hours=draft.hours||{};
 for(const {id,label} of WEEK_DAYS){
  const day=hours[id]??hours[String(id)];
  if(!day?.enabled)continue;
  if(!timePattern.test(String(day.open))||!timePattern.test(String(day.close))||day.open>=day.close){
   errors.hours='Revisá el horario del '+label+'. Por ahora el cierre debe ser después de la apertura el mismo día.';
   break;
  }
 }
 return errors;
}
export function buildBusinessPatch(draft){
 const errors=validateBusinessProfile(draft);
 if(Object.keys(errors).length)throw Object.assign(Error('Revisá los datos del negocio.'),{errors});
 const hours={};
 for(const {id} of WEEK_DAYS){
  const day=draft.hours?.[id]??draft.hours?.[String(id)];
  if(day?.enabled)hours[id]={open:day.open,close:day.close};
 }
 return {
  name:String(draft.name).trim(),type:String(draft.type||'').trim(),
  description:String(draft.description||'').trim(),address:String(draft.address||'').trim(),
  phone:String(draft.phone||'').trim(),image:safeCatalogImage(draft.image),
  hours:Object.keys(hours).length?hours:null,
 };
}
