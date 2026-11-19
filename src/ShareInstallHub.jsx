import React,{useState} from 'react';
import {ArrowRight,Check,Copy,Download,ExternalLink,Link2,MessageCircle,Nfc, QrCode,Share2, Smartphone, X} from 'lucide-react';
import './share-install-hub.css';

export const getPublicDvoladaLink=(origin,base)=>new URL(base||'/',origin).href;
export const getDvoladaInvitationText=url=>[
 '¡Mirá Dvolada! 🛵🍔',
 'Pedí fácil, que te llega de volada.',
 '',
 'Abrí la app: '+url,
 '',
 '📱 Para instalarla:',
 '• iPhone: abrí el enlace en Safari → Compartir → Agregar a inicio.',
 '• Android: abrí el enlace en Chrome → menú ⋮ → Instalar app o Agregar a pantalla principal.',
 '¡Compartila con quien quieras!'
].join('\n');

export default function ShareInstallHub({initialTab='share',canInstall=false,onInstall}){
 const [tab,setTab]=useState(initialTab),[copied,setCopied]=useState(false),[notice,setNotice]=useState(''),[qrFailed,setQrFailed]=useState(false),[device,setDevice]=useState(/iPhone|iPad|iPod/i.test(navigator.userAgent)?'ios':'android'),[nfcBusy,setNfcBusy]=useState(false);
 const url=getPublicDvoladaLink(window.location.origin,import.meta.env.BASE_URL);
 const inviteText=getDvoladaInvitationText(url);
 const qr='https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data='+encodeURIComponent(url);
 const installed=window.matchMedia?.('(display-mode: standalone)')?.matches||navigator.standalone===true;
 const copy=async()=>{
  try{await navigator.clipboard.writeText(url);setCopied(true);setNotice('¡Enlace copiado!');window.setTimeout(()=>setCopied(false),2500)}
  catch{setNotice('No se pudo copiar automáticamente. Mantené presionado el enlace para copiarlo.')}
 };
 const share=async()=>{
  if(navigator.share){try{await navigator.share({title:'Dvolada',text:'Pedí fácil, que te llega de volada.',url})}catch(e){if(e.name!=='AbortError')setNotice('Podés copiar el enlace o enviarlo por WhatsApp.')}}else await copy();
 };
 const writeTag=async()=>{
  if(typeof window.NDEFReader!=='function')return;
  setNfcBusy(true);setNotice('Acercá una etiqueta NFC compatible al teléfono para grabar el enlace.');
  try{const ndef=new window.NDEFReader();await ndef.write({records:[{recordType:'url',data:url}]});setNotice('¡Etiqueta NFC grabada con el enlace de Dvolada!')}
  catch(e){setNotice(e.name==='NotAllowedError'?'Se canceló o denegó el permiso NFC.':'No se pudo grabar. Verificá que la etiqueta sea compatible, esté desbloqueada y que NFC esté activado.')}
  finally{setNfcBusy(false)}
 };
 return <section className="shell section page-section dv-share-hub" aria-labelledby="dv-share-title">
  <div className="dv-share-hero"><div className="dv-share-glow" aria-hidden="true"/>
   <span className="dv-share-eyebrow"><Share2 size={15}/> COMPARTÍ DVOLADA</span>
   <h1 id="dv-share-title">Lo bueno se comparte <span>de volada.</span></h1>
   <p>Invitá a tus amigos a descubrir comidas y restaurantes. Sin códigos complicados, sin puntos ni promociones inventadas.</p>
   <div className="dv-share-tabs" role="tablist" aria-label="Compartir o instalar">
    <button role="tab" aria-selected={tab==='share'} className={tab==='share'?'active':''} onClick={()=>setTab('share')}><Share2 size={16}/> Invitar amigos</button>
    <button role="tab" aria-selected={tab==='install'} className={tab==='install'?'active':''} onClick={()=>setTab('install')}><Download size={16}/> Instalar la app</button>
   </div>
  </div>
  {tab==='share'?<div className="dv-share-grid">
   <div className="dv-share-card dv-share-main">
    <span className="dv-share-eyebrow">ENLACE PERSONAL PARA COMPARTIR</span>
    <h2>¡Pasá la voz!</h2>
    <p>Podés enviarlo por WhatsApp, compartir cerca con las opciones de tu teléfono o mostrar el QR.</p>
    <div className="dv-share-link-field"><Link2 size={18}/><input aria-label="Enlace de Dvolada para compartir" readOnly value={url} onFocus={e=>e.target.select()}/><button type="button" onClick={copy} aria-label="Copiar enlace">{copied?<Check size={19}/>:<Copy size={19}/>}</button></div>
    <div className="dv-share-buttons">
     <a className="dv-share-button dv-share-whatsapp" href={'https://wa.me/?text='+encodeURIComponent(inviteText)} target="_blank" rel="noopener noreferrer"><MessageCircle size={19}/> Enviar por WhatsApp</a>
     <button type="button" className="dv-share-button dv-share-native" onClick={share}><Share2 size={19}/> Compartir con mi teléfono</button>
     <button type="button" className="dv-share-button dv-share-copy" onClick={copy}><Copy size={18}/> Copiar enlace</button>
    </div>
    <div className="dv-share-nearby"><Smartphone size={19}/><span>En iPhone, «Compartir» puede ofrecer AirDrop. En Android puede aparecer Quick Share, según el dispositivo.</span></div>
    {typeof window.NDEFReader==='function'&&<div className="dv-share-nfc"><div><strong><Nfc size={17}/> Etiqueta NFC (Android compatible)</strong><small>Grabá el enlace en una etiqueta NFC física. No transfiere el enlace directamente de teléfono a teléfono.</small></div><button type="button" disabled={nfcBusy} onClick={writeTag}>{nfcBusy?'Grabando…':'Grabar etiqueta'}</button></div>}
   </div>
   <div className="dv-share-card dv-share-qr"><div className="dv-share-qr-icon"><QrCode size={20}/></div><h2>Escaneá y entrá</h2><div className="dv-share-qr-image">{qrFailed?<div className="dv-share-qr-fallback"><QrCode size={55}/><small>QR no disponible. Copiá el enlace de la izquierda.</small></div>:<img src={qr} width={240} height={240} alt="Código QR para abrir Dvolada" loading="lazy" onError={()=>setQrFailed(true)}/>}</div><p>Mostrá este código para abrir Dvolada en otro teléfono.</p><small>El QR necesita internet para mostrarse; el enlace siempre se puede copiar.</small></div>
  </div>:<div className="dv-share-install">
   <div className="dv-share-card dv-share-install-intro"><span className="dv-share-eyebrow"><Download size={16}/> TU APP, A UN TOQUE</span><h2>Dvolada en tu pantalla de inicio.</h2><p>Instalala como aplicación web, sin buscarla en App Store ni Play Store.</p>{installed?<div className="dv-share-installed"><Check size={18}/> Ya estás usando Dvolada como app instalada.</div>:canInstall&&<button className="dv-share-install-button" type="button" onClick={onInstall}><Download size={19}/> Instalar Dvolada ahora <ArrowRight size={17}/></button>}</div>
   <div className="dv-share-card"><div className="dv-share-device-tabs" role="tablist" aria-label="Sistema del teléfono"><button type="button" role="tab" aria-selected={device==='ios'} className={device==='ios'?'active':''} onClick={()=>setDevice('ios')}>iPhone / iOS</button><button type="button" role="tab" aria-selected={device==='android'} className={device==='android'?'active':''} onClick={()=>setDevice('android')}>Android / Samsung</button></div>{device==='ios'?<div className="dv-share-steps"><h3>Instalar en iPhone</h3><ol><li>Abrí <strong>Dvolada en Safari</strong> (no desde el navegador integrado de WhatsApp).</li><li>Tocá el menú de la página y elegí <strong>Compartir</strong> <Share2 size={15}/>.</li><li>Seleccioná <strong>Agregar a pantalla de inicio</strong>.</li><li>Confirmá con <strong>Agregar</strong>. Ya verás el ícono de Dvolada.</li></ol><p>En algunas versiones de iOS, primero debés tocar «Más» para encontrar «Compartir».</p></div>:<div className="dv-share-steps"><h3>Instalar en Android</h3><ol><li>Abrí <strong>Dvolada en Chrome</strong>.</li><li>Tocá el menú <strong>⋮</strong> de Chrome.</li><li>Elegí <strong>Instalar app</strong> o <strong>Agregar a pantalla principal</strong>.</li><li>Confirmá la instalación y abrí Dvolada desde el ícono.</li></ol><p>En Samsung Internet las palabras del menú pueden variar según la versión.</p></div>}</div>
   <div className="dv-share-card dv-share-install-share"><h3>¿Querés enseñarle a alguien?</h3><p>Compartí el enlace junto con estas instrucciones.</p><button className="dv-share-button dv-share-native" type="button" onClick={()=>setTab('share')}><Share2 size={18}/> Ir a Invitar amigos</button></div>
  </div>}
  {notice&&<div className="dv-share-notice" role="status">{notice}<button type="button" onClick={()=>setNotice('')} aria-label="Cerrar aviso"><X size={14}/></button></div>}
 </section>;
}
