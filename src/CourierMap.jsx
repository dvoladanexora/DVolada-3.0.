import React,{useEffect,useRef,useState} from 'react';
import './CourierMap.css';

const LEAFLET_CSS='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
let leafletPromise;
function loadLeaflet(){
 if(window.L)return Promise.resolve(window.L);
 if(!leafletPromise){
  leafletPromise=new Promise((resolve,reject)=>{
   if(!document.querySelector('[data-dv-leaflet-css]')){const css=document.createElement('link');css.rel='stylesheet';css.href=LEAFLET_CSS;css.dataset.dvLeafletCss='1';document.head.appendChild(css)}
   const script=document.createElement('script');script.src=LEAFLET_JS;script.onload=()=>window.L?resolve(window.L):reject(Error('Mapa no disponible'));script.onerror=()=>reject(Error('No se pudo cargar Leaflet'));document.head.appendChild(script);
  }).catch(e=>{leafletPromise=null;throw e});
 }
 return leafletPromise;
}
const valid=p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lng))<=180&&(Number(p.lat)!==0||Number(p.lng)!==0);
const mapsUrl=p=>'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(p.lat+','+p.lng);
export default function CourierMap({restaurant=null,customer=null,orderId=null}){
 const element=useRef(null),map=useRef(null),layers=useRef([]),gpsWatch=useRef(null),lastFix=useRef(0);
 const [position,setPosition]=useState(null),[destination,setDestination]=useState('restaurant'),[message,setMessage]=useState('Podés consultar el mapa sin activar tu GPS.'),[ready,setReady]=useState(false),[gpsEnabled,setGpsEnabled]=useState(false),[loadingError,setLoadingError]=useState(false);
 const target=destination==='restaurant'?restaurant:customer;
 const hasCoords=Boolean(valid(restaurant)||valid(customer));
 useEffect(()=>{if(!valid(restaurant)&&valid(customer))setDestination('customer')},[restaurant?.lat,restaurant?.lng,customer?.lat,customer?.lng]);
 useEffect(()=>{
  if(!hasCoords){setReady(false);setMessage('No hay coordenadas verificadas: usá las direcciones de la tarjeta de entrega.');return}
  let cancelled=false;setLoadingError(false);setReady(false);
  loadLeaflet().then(L=>{
   if(cancelled||!element.current)return;
   const initial=valid(restaurant)?restaurant:customer;
   const m=L.map(element.current,{zoomControl:true}).setView([Number(initial.lat),Number(initial.lng)],14);
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(m);
   map.current=m;setReady(true);
   requestAnimationFrame(()=>m.invalidateSize());
  }).catch(()=>{if(!cancelled){setLoadingError(true);setMessage('No se pudo cargar el mapa. Usá Google Maps desde los botones de navegación.')}});
  return()=>{cancelled=true;map.current?.remove();map.current=null};
 },[restaurant?.lat,restaurant?.lng,customer?.lat,customer?.lng]);
 useEffect(()=>{
  if(!gpsEnabled||!valid(target))return;
  if(!navigator.geolocation){setMessage('Este dispositivo no dispone de GPS en el navegador.');return}
  const watch=navigator.geolocation.watchPosition(p=>{
   if(Date.now()-lastFix.current<12000)return;
   lastFix.current=Date.now();
   setPosition({lat:p.coords.latitude,lng:p.coords.longitude});
   setMessage('GPS activado para esta ruta de demostración.');
  },()=>setMessage('No se pudo obtener la ubicación. Revisá los permisos del navegador.'),{enableHighAccuracy:true,maximumAge:15000,timeout:15000});
  gpsWatch.current=watch;
  return()=>{navigator.geolocation.clearWatch(watch);gpsWatch.current=null};
 },[gpsEnabled,destination,restaurant?.lat,restaurant?.lng,customer?.lat,customer?.lng]);
 useEffect(()=>{
  if(!hasCoords||!ready||!map.current)return;
  const L=window.L,m=map.current;layers.current.forEach(l=>m.removeLayer(l));layers.current=[];
  const point=(p,label,color)=>{
   if(!valid(p))return;
   const marker=L.circleMarker([Number(p.lat),Number(p.lng)],{radius:9,color,fillColor:color,fillOpacity:.88}).addTo(m).bindPopup(label);
   layers.current.push(marker);
  };
  point(position,'Mi ubicación','#2563eb');point(restaurant,'Restaurante','#f26732');point(customer,'Destino del cliente','#15976c');
  if(valid(position))m.setView([position.lat,position.lng],15);
  else if(valid(target))m.setView([target.lat,target.lng],14);
  if(!valid(target)){setMessage('El pedido todavía no tiene coordenadas verificadas del destino. Podés utilizar la dirección escrita en la tarjeta de entrega.');return}
  if(!valid(position)||!gpsEnabled)return;
  const controller=new AbortController();
  const endpoint='https://router.project-osrm.org/route/v1/driving/'+position.lng+','+position.lat+';'+target.lng+','+target.lat+'?overview=full&geometries=geojson';
  fetch(endpoint,{signal:controller.signal}).then(response=>{if(!response.ok)throw Error('Sin ruta');return response.json()}).then(data=>{
   if(!map.current||!data.routes?.[0])return;
   const points=data.routes[0].geometry.coordinates.map(c=>[c[1],c[0]]);
   const line=L.polyline(points,{color:'#377ae2',weight:5,opacity:.85}).addTo(m);
   layers.current.push(line);m.fitBounds(line.getBounds(),{padding:[25,25]});
   setMessage('Ruta estimada por carreteras, no garantiza el camino más seguro ni más rápido.');
  }).catch(e=>{if(e.name!=='AbortError')setMessage('No se pudo calcular la ruta. Podés usar una app de navegación.')});
  return()=>controller.abort();
 },[ready,gpsEnabled,position?.lat,position?.lng,destination,restaurant?.lat,restaurant?.lng,customer?.lat,customer?.lng]);
 return <section className="dv-courier-map-panel" aria-label="Mapa de la entrega">
  <div className="dv-courier-map-head"><div><strong>Mapa y navegación</strong><small>{orderId?'Orden '+orderId:'Vista de prueba'}</small></div><span>GPS opcional</span></div>
  <div className="dv-courier-map-controls"><button type="button" disabled={!valid(restaurant)} className={destination==='restaurant'?'active':''} onClick={()=>setDestination('restaurant')}>Restaurante</button><button type="button" disabled={!valid(customer)} className={destination==='customer'?'active':''} onClick={()=>setDestination('customer')}>Cliente</button></div>
  {!hasCoords?<div className="dv-courier-map-unavailable">Este pedido no tiene puntos GPS verificados. No mostraremos un mapa genérico que pueda confundirse con el destino. Utilizá la dirección escrita y confirmala antes de salir.</div>:loadingError?<div className="dv-courier-map-unavailable">El mapa no está disponible en este momento. Podés abrir el destino en una aplicación externa cuando haya coordenadas verificadas.</div>:<div ref={element} className="dv-courier-map-canvas" role="region" aria-label="Mapa interactivo del pedido"/>}
  <button type="button" className="dv-courier-gps-consent" disabled={!valid(target)} onClick={()=>{setGpsEnabled(p=>!p);setPosition(null)}}>{gpsEnabled?'Detener GPS':'Activar mi GPS para trazar la ruta'}</button>
  <p className="dv-courier-map-message" role="status">{message}</p>
  <div className="dv-courier-map-controls">{valid(target)?<a href={mapsUrl(target)} target="_blank" rel="noopener noreferrer">Abrir ruta en Google Maps</a>:<span>No hay coordenadas confiables para navegar desde el mapa.</span>}</div>
  <small className="dv-courier-map-disclaimer">Este mapa es solo de demostración. Al activar GPS, tu posición puede consultarse en el servicio público de rutas OSRM. En producción necesitaremos un proveedor y un aviso de privacidad adecuados.</small>
 </section>;
}
