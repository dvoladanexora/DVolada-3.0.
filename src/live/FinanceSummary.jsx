import React,{useEffect,useState} from 'react';

const labels={
 affiliationReceived:'Afiliaciones cobradas',
 affiliationNextDue:'Próximas cuotas por cobrar',
 affiliationOverdue:'Cuotas vencidas',
 advertisingRecorded:'Pagos registrados por publicidad',
 advertisingOutstanding:'Saldo por cobrar de publicidad',
 settledDvolada:'Parte de Dvolada en liquidaciones pagadas'
};

export default function FinanceSummary({api,money,offline}){
 const [data,setData]=useState(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(offline)return;
  let active=true;
  api.financeSummary().then(result=>{if(active){setData(result);setError(false)}})
   .catch(()=>{if(active)setError(true)});
  return()=>{active=false};
 },[api,offline,attempt]);
 return <section className="dvl-panel">
  <h2>Resumen financiero acumulado</h2>
  <button type="button" className="dvl-action secondary" disabled={offline} onClick={()=>setAttempt(n=>n+1)}>Actualizar</button>
  {offline&&<p role="status">Sin conexión. Los importes pueden estar desactualizados.</p>}
  {error&&<p role="alert">No se pudo consultar el resumen financiero.</p>}
  {!data&&!offline&&!error&&<p role="status">Consultando importes…</p>}
  {data&&<dl>{Object.entries(labels).map(([key,label])=><div className="dvl-row" key={key}>
   <dt>{label}</dt><dd>{money(data[key])}</dd>
  </div>)}</dl>}
  <p>Las cuotas vencidas están incluidas en las próximas cuotas por cobrar.</p>
 </section>;
}
