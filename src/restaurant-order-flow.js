/** Reglas de progresión y auditoría de pedidos de la vista previa.
 * El servidor de producción deberá aplicar permisos, versión e idempotencia propios.
 */
const statusStamps=Object.freeze({
 'Aceptado':'acceptedAt','Preparando':'preparingAt','Listo':'readyAt',
 'Rechazado':'rejectedAt','Cancelado':'cancelledAt','Recogido':'pickedUpAt',
 'En camino':'onTheWayAt','En ubicación':'arrivedAt','Entregado':'deliveredAt',
});
export const DECISION_ACTIONS=Object.freeze(['reject','approve-cancel','deny-cancel']);
export const allowedDecision=(order,action)=>Boolean(
 order&&(
  (action==='reject'&&order.status==='Pendiente')||
  ((action==='approve-cancel'||action==='deny-cancel')&&order.status==='Cancelación solicitada')
 )
);
export function applyOrderStatus(order,status,metadata={},at=new Date()){
 if(!order||typeof order!=='object')throw Error('Orden inválida');
 if(!status||typeof status!=='string')throw Error('Estado inválido');
 if(order.status===status)return order;
 const timestamp=at instanceof Date&&!Number.isNaN(at.getTime())?at.toISOString():new Date().toISOString();
 const updated={...order,status};
 const stamp=statusStamps[status];
 if(stamp&&!updated[stamp])updated[stamp]=timestamp;
 if(status==='Cancelación solicitada'&&!order.statusBeforeCancellation)updated.statusBeforeCancellation=order.status;
 if(status==='Rechazado'&&metadata.rejectionReason)updated.rejectionReason=String(metadata.rejectionReason).trim().slice(0,220);
 if(order.status==='Cancelación solicitada'&&status!=='Cancelación solicitada'){
  updated.cancelReviewedAt=timestamp;
  updated.cancelResponse=status==='Cancelado'?'Aprobada':'Rechazada';
  updated.cancelResponseReason=status==='Cancelado'?'':String(metadata.cancelResponseReason||'').trim().slice(0,220);
 }
 const completed=status==='Entregado'||(status==='Recogido'&&order.delivery==='pickup');
 if(completed&&!updated.completedAt)updated.completedAt=timestamp;
 return updated;
}
export const stageElapsedMinutes=(order,stage,now=Date.now())=>{
 const stamp=stage==='accepted'?order?.acceptedAt:stage==='preparing'?order?.preparingAt:stage==='ready'?order?.readyAt:null;
 const date=new Date(stamp||order?.createdAt||order?.date||0).getTime();
 return Number.isFinite(date)&&date>0?Math.max(0,Math.floor((now-date)/60000)):null;
};
export function decisionForOrder(order,action,reason=''){
 if(!allowedDecision(order,action))throw Error('Esta decisión ya no está disponible para la orden');
 const message=String(reason||'').trim();
 if((action==='reject'||action==='deny-cancel')&&(message.length<5||message.length>220))throw Error('Indicá un motivo de 5 a 220 caracteres');
 if(action==='reject')return {status:'Rechazado',metadata:{rejectionReason:message}};
 if(action==='approve-cancel')return {status:'Cancelado',metadata:{}};
 return {status:'Preparando',metadata:{cancelResponseReason:message}};
}
