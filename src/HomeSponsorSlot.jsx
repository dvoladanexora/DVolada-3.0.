import React,{useEffect,useState} from 'react';
import {ChevronLeft,ChevronRight,Megaphone} from 'lucide-react';
import './home-sponsors.css';

// Espacios de demostración. Sustituir por campañas aprobadas desde el Centro de Control.
// Los anuncios externos reales deben identificarse como PUBLICIDAD y usar creativos autorizados.
const examples=[
 {id:'demo-1',title:'Tu negocio puede aparecer aquí',description:'Un lugar para llegar a más personas sin interrumpir sus pedidos.',cta:'Conocer afiliación'},
 {id:'demo-2',title:'Dale visibilidad a tu promoción',description:'Mostrá una oferta auténtica de tu negocio a quienes buscan comida.',cta:'Conocer afiliación'},
 {id:'demo-3',title:'Destacá lo mejor de tu menú',description:'Publicidad sencilla que acompaña la experiencia Dvolada.',cta:'Conocer afiliación'},
];
export default function HomeSponsorSlot({variant='carousel',items=examples,onJoin}){
 const safeItems=Array.isArray(items)?items.filter(a=>a&&typeof a.title==='string'&&a.title.trim()):[];
 const [active,setActive]=useState(0),[paused,setPaused]=useState(false);
 const current=safeItems[active%safeItems.length];
 useEffect(()=>{if(safeItems.length<2||paused||typeof window==='undefined'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
 const timer=window.setInterval(()=>setActive(i=>(i+1)%safeItems.length),5000);
 return()=>window.clearInterval(timer)},[safeItems.length,paused]);
 if(!current)return null;
 const move=delta=>setActive(i=>(i+delta+safeItems.length)%safeItems.length);
 return <aside className={'dv-sponsor-slot dv-sponsor-'+variant} aria-label="Espacio publicitario" onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocusCapture={()=>setPaused(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setPaused(false)}}>
 <div className="dv-sponsor-head"><span><Megaphone size={14}/> ESPACIO PUBLICITARIO · DEMOSTRACIÓN</span><small>{safeItems.length>1?active%safeItems.length+1+' / '+safeItems.length:'Dvolada'}</small></div>
 <div className="dv-sponsor-content" key={current.id||active}>
 <div><strong>{current.title}</strong><p>{current.description}</p></div>
 {typeof onJoin==='function'&&<button type="button" onClick={onJoin}>{current.cta||'Conocer más'} <ChevronRight size={15}/></button>}
 </div>
 {safeItems.length>1&&<div className="dv-sponsor-controls"><button type="button" aria-label="Publicidad anterior" onClick={()=>move(-1)}><ChevronLeft size={17}/></button><div className="dv-sponsor-dots" aria-label="Seleccionar anuncio">{safeItems.map((ad,i)=><button key={ad.id||i} type="button" className={i===active%safeItems.length?'selected':''} aria-label={'Ver anuncio '+(i+1)} aria-current={i===active%safeItems.length?'true':undefined} onClick={()=>setActive(i)}/>)}</div><button type="button" aria-label="Publicidad siguiente" onClick={()=>move(1)}><ChevronRight size={17}/></button></div>}
 </aside>
}
