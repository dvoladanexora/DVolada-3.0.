import React,{useEffect,useState} from 'react';
import {MapPin,Navigation,CheckCircle2,PowerOff} from 'lucide-react';

const valid=o=>{
 const p=o?.deliveryCoordinates||o?.customerCoords||o?.customerLocation||o?.location;
 const lat=Number(p?.lat??p?.latitude??o?.deliveryLat),lng=Number(p?.lng??p?.lon??p?.longitude??o?.deliveryLng);
 return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&(lat!==0||lng!==0)?{lat,lng}:null;
};
const meters=(a,b)=>{
 const r=Math.PI/180,dLat=(b.lat-a.lat)*r,dLng=(b.lng-a.lng)*r;
 const h=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLng/2)**2;
 return 12742000*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
};
export default function CourierGpsArrival({order,onArrive}){
 const [enabled,setEnabled]=useState(false),[fix,setFix]=useState(null),[error,setError]=useState(''),[tick,setTick]=useState(Date.now());
 const target=valid(order);
 useEffect(()=>{
  if(!enabled||!target)return;
  if(!navigator.geolocation){setError('GPS no disponible en este dispositivo.');return}
  let active=true;
  const watch=navigator.geolocation.watchPosition(position=>{
   if(!active)return;
   setFix({lat:position.coords.latitude,lng:position.coords.longitude,accuracy:position.coords.accuracy,timestamp:position.timestamp});
   setError('');
  },()=>{if(active){setError('No se pudo obtener tu ubicación. Revisá permisos y conexión.');setFix(null)}},
   {enableHighAccuracy:true,maximumAge:5000,timeout:15000});
  return()=>{active=false;navigator.geolocation.clearWatch(watch)};
 },[enabled,target?.lat,target?.lng]);
 useEffect(()=>{
  if(!enabled)return;
  const id=setInterval(()=>setTick(Date.now()),5000);
  return()=>clearInterval(id);
 },[enabled]);
 const distance=target&&fix?Math.round(meters(fix,target)):null;
 const precise=Boolean(fix&&Number.isFinite(fix.accuracy)&&fix.accuracy<=100&&tick-fix.timestamp<30000);
 const near=Boolean(precise&&distance!==null&&distance<=Math.max(80,fix.accuracy));
 return <div className="dv-gps-arrival">
  <div className="dv-gps-arrival-heading"><Navigation size={19}/><strong>Comprobar llegada por GPS</strong></div>
  {!target?<p role="status">Este pedido no contiene coordenadas confirmadas. No podemos verificar automáticamente la llegada.</p>:<>
   {!enabled&&<p>Activá tu ubicación solo cuando estés cerca del cliente. El permiso puede revocarse desde el navegador.</p>}
   <button type="button" className="dv-rider-gps-toggle" onClick={()=>{setEnabled(previous=>!previous);setFix(null);setError('')}}>
    {enabled?<><PowerOff size={16}/> Detener GPS</>:<><MapPin size={16}/> Activar GPS para verificar</>}
   </button>
   {enabled&&(error?<p role="alert">{error}</p>:distance===null?<p>Buscando una ubicación con precisión suficiente…</p>:
    <p role="status">Distancia aproximada: <strong>{distance} m</strong> · Precisión: ±{Math.round(fix.accuracy)} m {precise?'':'· ubicación caducada o imprecisa'}</p>)}
   {enabled&&distance!==null&&!near&&<small>Se requiere una ubicación reciente, precisión de 100 m o mejor y proximidad al punto de entrega.</small>}
   {enabled&&<button type="button" className="dv-rider-primary" disabled={!near} onClick={()=>{if(near)onArrive()}}><CheckCircle2 size={18}/> Confirmar llegada al cliente</button>}
  </>}
  <small><MapPin size={13}/> La comprobación de esta demo no notifica a otro dispositivo. El servidor validará el GPS antes de enviar alertas reales.</small>
 </div>;
}
