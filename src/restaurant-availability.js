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
/** Comprueba el turno iniciado hoy o el que empezó ayer y cruza medianoche.
 * Las horas se interpretan en la zona local del navegador solo para la demo.
 */
export function withinBusinessHours(place,at=new Date()){
 const hours=place?.hours;
 if(!hours||typeof hours!=='object')return null;
 const date=at instanceof Date?at:new Date(at);
 if(Number.isNaN(date.getTime()))return false;
 const isClock=s=>typeof s==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s);
 const toMinutes=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
 const period=day=>{
  if(!day||!isClock(day.open)||!isClock(day.close)||day.open===day.close)return null;
  return {open:toMinutes(day.open),close:toMinutes(day.close)};
 };
 const minutes=date.getHours()*60+date.getMinutes();
 const today=period(hours[date.getDay()]);
 const previous=period(hours[(date.getDay()+6)%7]);
 // Un cierre anterior a la apertura significa "cierra mañana".
 const todayOpen=today&&(today.close>today.open
  ?minutes>=today.open&&minutes<today.close
  :minutes>=today.open);
 const fromYesterday=previous&&previous.close<previous.open&&minutes<previous.close;
 return Boolean(todayOpen||fromYesterday);
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
