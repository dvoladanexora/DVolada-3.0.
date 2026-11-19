// Preparación segura de una consulta comercial desde GitHub Pages.
// La solicitud solo llega cuando el visitante la envía desde correo o WhatsApp.
export const DEFAULT_CONTACT_EMAIL='dvoladanexora@gmail.com';
export const cleanInquiryField=(value,max=500)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
export function validateSponsorInquiry(input){
 const x=input||{},digits=String(x.phone||'').replace(/\D/g,'');
 return {
  name:cleanInquiryField(x.name,80).length>=2,
  business:cleanInquiryField(x.business,100).length>=2,
  phone:digits.length>=8&&digits.length<=15,
  consent:x.consent===true
 };
}
export function formatSponsorInquiry(input){
 const x=input||{};
 return [
  'Solicitud de información sobre publicidad en Dvolada',
  '',
  'Nombre: '+cleanInquiryField(x.name,80),
  'Negocio o marca: '+cleanInquiryField(x.business,100),
  'Teléfono / WhatsApp: '+cleanInquiryField(x.phone,24),
  'Ciudad: '+(cleanInquiryField(x.city,90)||'No indicada'),
  'Espacio de interés: '+(cleanInquiryField(x.space,70)||'Por definir'),
  'Comentario: '+(cleanInquiryField(x.details,500)||'Sin comentarios'),
  '',
  'Esta es una consulta comercial; no constituye una compra ni una reserva de espacio.'
 ].join('\n');
}
export function sponsorEmailLink(input,recipient=DEFAULT_CONTACT_EMAIL){
 const email=String(recipient||'').trim();
 if(!/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email))return null;
 return 'mailto:'+email+'?subject='+encodeURIComponent('Consulta de publicidad - Dvolada')+'&body='+encodeURIComponent(formatSponsorInquiry(input));
}
export function sponsorWhatsappLink(input,phone){
 const digits=String(phone||'').replace(/\D/g,'');
 if(!/^\d{8,15}$/.test(digits))return null;
 return 'https://wa.me/'+digits+'?text='+encodeURIComponent(formatSponsorInquiry(input));
}
