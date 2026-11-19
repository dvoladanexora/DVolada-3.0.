import React from 'react';
import {Store,LogIn,ShieldAlert,WifiOff} from 'lucide-react';
import OnlineWorkspace from './OnlineWorkspace.jsx';
import './affiliate-online.css';

/** La vista previa está aislada en Vite local. Nunca simula un login seguro. */
export function AffiliateLogin({onLogin,onBack}){
 const preview=Boolean(import.meta.env.DEV&&import.meta.env.VITE_DVOLADA_INTERNAL_PREVIEW==='true');
 return <section className="dv-affiliate-auth shell"><div className="dv-affiliate-auth-card">
  <div className="dv-affiliate-auth-symbol"><Store size={30}/></div>
  <span className="kicker">DVOLADA · NEGOCIOS</span>
  <h1>{preview?'Demostración de Restaurante Online':'Acceso para restaurantes'}</h1>
  <p>{preview?'Este acceso es exclusivamente para probar Caja, Cocina y Mi menú en tu computadora.':'Estamos preparando el inicio de sesión seguro para restaurantes afiliados.'}</p>
  {preview&&<button className="primary wide" type="button" onClick={onLogin}><LogIn size={18}/> Abrir panel de pruebas</button>}
  <div className="dv-affiliate-auth-notice"><ShieldAlert size={18}/><span>El panel de pruebas no usa credenciales reales. Los cambios de menú y pedidos son locales y no se sincronizan con otros dispositivos.</span></div>
  <button type="button" className="secondary wide" onClick={onBack}>Volver a Dvolada</button>
 </div></section>;
}
export function AffiliateOnlinePanel({orders,places,restaurantId,onUpdate,onCatalogChange,onRestaurantChange,onLogout}){
 return <OnlineWorkspace orders={orders} places={places} restaurantId={restaurantId} onUpdate={onUpdate} onCatalogChange={onCatalogChange} onRestaurantChange={onRestaurantChange} onLogout={onLogout}/>;
}
