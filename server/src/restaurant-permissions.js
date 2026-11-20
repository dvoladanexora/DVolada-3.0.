/** Reglas del servidor: la membresía activa y el rol se consultan en SQL
 * en cada solicitud. El JWT identifica a la persona, NO otorga permisos.
 */
export const RESTAURANT_ROLES=Object.freeze(['owner','manager','cashier','kitchen']);
const transitions=Object.freeze({
 Pendiente:Object.freeze(['Aceptado','Rechazado']),
 Aceptado:Object.freeze(['Preparando','Cancelado']),
 Preparando:Object.freeze(['Listo','Cancelado']),
 Listo:Object.freeze([])
});
export function validRestaurantRole(role){
 return typeof role==='string'&&RESTAURANT_ROLES.includes(role);
}
export function restaurantTransitionPermission(role,from,to){
 if(!validRestaurantRole(role))return {ok:false,status:403,reason:'Restaurant access denied'};
 if(!Object.hasOwn(transitions,from)||!transitions[from].includes(to))
  return {ok:false,status:422,reason:'Invalid status transition'};
 if(role==='owner'||role==='manager')return {ok:true};
 if(role==='cashier'&&from==='Pendiente'&&['Aceptado','Rechazado'].includes(to))return {ok:true};
 if(role==='kitchen'&&((from==='Aceptado'&&to==='Preparando')||(from==='Preparando'&&to==='Listo')))
  return {ok:true};
 return {ok:false,status:403,reason:'Role not allowed for this transition'};
}
