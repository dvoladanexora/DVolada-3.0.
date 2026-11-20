import React from 'react';

/** Evita que una carga diferida fallida deje en blanco toda la aplicación.
 * La opción de reintento es explícita: no recargar mientras el usuario llena datos.
 */
export default class LazyPanelBoundary extends React.Component {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 render(){
  if(this.state.failed)return <section className="dv-load-failure" role="alert">
   <h2>No se pudo abrir esta sección</h2>
   <p>Revisá tu conexión. Tu carrito y tus pedidos de prueba guardados en este dispositivo permanecen intactos.</p>
   <button type="button" onClick={()=>window.location.reload()}>Reintentar cargando Dvolada</button>
  </section>;
  return this.props.children;
 }
}
