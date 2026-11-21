import React,{useState} from 'react';
import {ArrowLeft,Bike,ShieldAlert,LogIn,UsersRound} from 'lucide-react';
import {DEMO_RIDERS} from './courier-workflow.js';
import './courier-online.css';

/** Solo para el entorno de Vite DEV; las cuentas reales requieren backend. */
export default function CourierDemoLogin({onLogin,onBack}){
 const preview=Boolean(import.meta.env.DEV&&import.meta.env.VITE_DVOLADA_INTERNAL_PREVIEW==='true');
 const [riderId,setRiderId]=useState(DEMO_RIDERS[0].id);
 return <section className="shell section narrow page-section dv-courier-preview-access">
  <div className="dv-courier-access-card">
   <button type="button" className="dv-courier-back" onClick={onBack}><ArrowLeft size={18}/> Volver a Dvolada</button>
   <div className="dv-courier-access-symbol"><Bike size={29}/></div>
   <span className="dv-rider-eyebrow">DVOLADA ONLINE · REPARTIDORES</span>
   <h1>{preview?'Tu ruta comienza aquí.':'Acceso de repartidores en preparación'}</h1>
   <p>{preview?'Elegí un repartidor ficticio para probar las entregas en este navegador.':'Estamos preparando un acceso privado con verificación de identidad y seguridad real.'}</p>
   {preview&&<div className="dv-courier-access-form">
    <label htmlFor="dv-courier-preview-id"><UsersRound size={18}/> Repartidor de pruebas</label>
    <select id="dv-courier-preview-id" value={riderId} onChange={e=>setRiderId(e.target.value)}>
     {DEMO_RIDERS.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
    <button className="dv-rider-primary" type="button" disabled={!DEMO_RIDERS.some(r=>r.id===riderId)} onClick={()=>onLogin(riderId)}><LogIn size={18}/> Abrir mi panel de prueba</button>
   </div>}
   <div className="dv-courier-access-warning"><ShieldAlert size={19}/><span>Esta selección no es autenticación. Nunca compartás información real de clientes aquí; las operaciones solo se guardan en la demostración local.</span></div>
  </div>
 </section>;
}
