import React,{useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Megaphone,Pause,Play,ArrowUpRight} from 'lucide-react';
import './home-sponsors.css';

const carouselExamples=[
 {id:'c-1',title:'Tu publicidad podría estar aquí',description:'Destacá tu negocio frente a personas que están buscando qué pedir.'},
 {id:'c-2',title:'Hacé que más personas te conozcan',description:'Promocioná tus productos y novedades en un espacio elegante de Dvolada.'},
 {id:'c-3',title:'Anunciá sin interrumpir',description:'Consultá por nuestros espacios publicitarios y encontrá el ideal para tu marca.'},
];
const compactExamples=[
 {id:'s-1',title:'Este espacio puede ser tuyo',description:'Tu negocio, cerca de nuevos clientes.'},
 {id:'s-2',title:'Una vitrina para tu marca',description:'Promocioná tu negocio dentro de Dvolada.'},
 {id:'s-3',title:'Publicidad con estilo',description:'Conocé los espacios disponibles.'},
];

export default function HomeSponsorSlot({variant='carousel',items,onJoin}){
 const defaults=variant==='compact'?compactExamples:carouselExamples;
 const [clock,setClock]=useState(()=>Date.now()/1000);useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()/1000),1000);return()=>clearInterval(timer)},[]);
 const eligible=Array.isArray(items)?items.filter(x=>x&&typeof x.title==='string'&&x.title.trim()&&(!x.ends_at||x.ends_at>clock)):defaults;
 const safeItems=eligible;
 const [active,setActive]=useState(0),[userPaused,setUserPaused]=useState(false),[interacting,setInteracting]=useState(false),[inView,setInView]=useState(true),[visibleTab,setVisibleTab]=useState(true);
 const panelRef=useRef(null),touchStart=useRef(null);
 const index=safeItems.length?active%safeItems.length:0;
 const current=safeItems[index];
 useEffect(()=>{
  if(typeof document==='undefined')return;
  const update=()=>setVisibleTab(!document.hidden);
  document.addEventListener('visibilitychange',update);
  update();
  return()=>document.removeEventListener('visibilitychange',update);
 },[]);
 useEffect(()=>{
  if(typeof IntersectionObserver==='undefined'||!panelRef.current)return;
  const observer=new IntersectionObserver(entries=>setInView(entries[0]?.isIntersecting??true),{threshold:0.2});
  observer.observe(panelRef.current);
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  if(safeItems.length<2||userPaused||interacting||!inView||!visibleTab||typeof window==='undefined'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const timer=window.setInterval(()=>setActive(i=>(i+1)%safeItems.length),current?.duration_seconds?Math.max(5,Math.min(30,current.duration_seconds))*1000:5000);
  return()=>window.clearInterval(timer);
 },[safeItems.length,userPaused,interacting,inView,visibleTab,active,current?.duration_seconds]);
 if(!current)return null;
 const move=delta=>setActive(i=>(i+delta+safeItems.length)%safeItems.length);
 return <aside ref={panelRef} className={'dv-sponsor-slot dv-sponsor-'+variant} aria-label="Espacio de publicidad en Dvolada"
  onMouseEnter={()=>setInteracting(true)} onMouseLeave={()=>setInteracting(false)}
  onFocusCapture={()=>setInteracting(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setInteracting(false)}}
  onTouchStart={e=>{touchStart.current=e.touches[0]?.clientX??null}}
  onTouchEnd={e=>{if(touchStart.current===null)return;const distance=(e.changedTouches[0]?.clientX??touchStart.current)-touchStart.current;touchStart.current=null;if(Math.abs(distance)>48)move(distance<0?1:-1)}}>
  <div className="dv-sponsor-head"><span><Megaphone size={14}/> {current.imageUrl?'PUBLICIDAD':'PUBLICITÁ EN DVOLADA'}</span><small>{index+1} / {safeItems.length}</small></div>
  <div className="dv-sponsor-content" key={current.id||index} aria-live="off">
   {current.imageUrl?<div style={{width:'100%'}}><img src={current.imageUrl} alt={current.title} style={{width:'100%',maxHeight:240,objectFit:'contain',borderRadius:12}}/><div className="dv-sponsor-message"><strong>{current.title}</strong><p>{current.description}</p></div>{current.link&&<a className="dv-sponsor-cta" href={current.link} target="_blank" rel="noopener noreferrer">Más información <ArrowUpRight size={16}/></a>}</div>:<><div className="dv-sponsor-message"><strong>{current.title}</strong><p>{current.description}</p><span className="dv-sponsor-note">Espacio disponible para anunciarte · consultá precios</span></div>{typeof onJoin==='function'&&<button type="button" className="dv-sponsor-cta" onClick={onJoin}>Quiero anunciarme <ArrowUpRight size={16}/></button>}</>}
  </div>
  {safeItems.length>1&&<div className="dv-sponsor-controls">
   <button type="button" aria-label="Anuncio anterior" onClick={()=>move(-1)}><ChevronLeft size={18}/></button>
   <div className="dv-sponsor-dots">{safeItems.map((item,i)=><button type="button" key={item.id||i} className={i===index?'selected':''} aria-label={'Ver anuncio '+(i+1)} aria-current={i===index?'true':undefined} onClick={()=>setActive(i)}/>)}</div>
   <button type="button" aria-label="Anuncio siguiente" onClick={()=>move(1)}><ChevronRight size={18}/></button>
   <button type="button" className="dv-sponsor-play" aria-label={userPaused?'Reanudar rotación de anuncios':'Pausar rotación de anuncios'} aria-pressed={userPaused} onClick={()=>setUserPaused(v=>!v)}>{userPaused?<Play size={16}/>:<Pause size={16}/>}</button>
  </div>}
 </aside>;
}
