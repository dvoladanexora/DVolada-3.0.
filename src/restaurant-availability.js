/** Disponibilidad comercial de la demostración Online.
 * El servidor debe controlar la apertura real según reloj/zonas/identidad.
 */
export const RESTAURANT_STATUSES=Object.freeze(['Abierto','Pausado','Cerrado']);
export function restaurantStatus(place){
 if(!place)return 'Cerrado';
 if(place.isPaused===true||place.paused===true||place.status==='paused'||place.status==='pause')return 'Pausado';
 if(place.isOpen===false||place.open===false||place.status==='closed')return 'Cerrado';
 return 'Abierto';
}
export function withRestaurantStatus(place,status){
 if(!RESTAURANT_STATUSES.includes(status))throw Error('Estado del restaurante inválido.');
 if(!place||typeof place!=='object')throw Error('Restaurante inválido.');
 return {...place,
  status:status==='Abierto'?'open':status==='Pausado'?'paused':'closed',
  isPaused:status==='Pausado',paused:status==='Pausado',
  isOpen:status!=='Cerrado',open:status!=='Cerrado',
 };
}
/** null = no hay horarios explícitos; false = fuera de turno. */
export function withinBusinessHours(place,at=new Date()){
 const hours=place?.hours;
 if(!hours||typeof hours!=='object')return null;
 const date=at instanceof Date?at:new Date(at);
 if(Number.isNaN(date.getTime()))return false;
 const day=hours[date.getDay()]??hours[String(date.getDay())];
 if(!day||typeof day.open!=='string'||typeof day.close!=='string')return false;
 const isClock=s=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s);
 if(!isClock(day.open)||!isClock(day.close)||day.close<=day.open)return false;
 const minutes=date.getHours()*60+date.getMinutes();
 const toMinutes=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
 return minutes>=toMinutes(day.open)&&minutes<toMinutes(day.close);
}
export function restaurantOrderBlockReason(place,{scheduleMode='now',at=new Date()}={}){
 if(!place)return 'El restaurante ya no está disponible.';
 const status=restaurantStatus(place);
 if(status==='Pausado')return 'El restaurante '+(place.name||'seleccionado')+' está en pausa y no recibe pedidos nuevos.';
 if(status==='Cerrado')return 'El restaurante '+(place.name||'seleccionado')+' está cerrado y no recibe pedidos nuevos.';
 if(scheduleMode!=='later'&&withinBusinessHours(place,at)===false)
  return 'El restaurante '+(place.name||'seleccionado')+' está fuera de su horario de atención.';
 return null;
}
