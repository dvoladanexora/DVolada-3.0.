import React,{useEffect,useState} from 'react';
const today=()=>new Date(Date.now()-21600000).toISOString().slice(0,10);
const labels={affiliationReceived:'Afiliaciones cobradas',advertisingReceived:'Publicidad cobrada',settledDvolada:'Parte de Dvolada en liquidaciones pagadas'};
const balances={affiliationNextDue:'Saldo de próximas cuotas',affiliationOverdue:'Cuotas vencidas acumuladas',affiliationDueToday:'Cuotas exigibles hoy',advertisingOutstanding:'Publicidad por cobrar'};
export default function FinanceSummary({api,money,offline}){
 const [data,setData]=useState(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0),[period,setPeriod]=useState('all'),[from,setFrom]=useState(today().slice(0,7)+'-01'),[until,setUntil]=useState(today());
 useEffect(()=>{if(offline)return;let active=true;setData(null);setError(false);
  api.financeSummary(period==='all'?null:{from,until}).then(result=>{if(active){setData(result);setError(false)}}).catch(()=>{if(active)setError(true)});
  return()=>{active=false};
 },[api,offline,attempt,period,from,until]);
 const select=v=>{setPeriod(v);const d=today();if(v==='day'){setFrom(d);setUntil(d)}if(v==='month'){setFrom(d.slice(0,7)+'-01');setUntil(d)}if(v==='year'){setFrom(d.slice(0,4)+'-01-01');setUntil(d)}if(v==='week'){const n=new Date(d+'T00:00:00Z');n.setUTCDate(n.getUTCDate()-(n.getUTCDay()+6)%7);setFrom(n.toISOString().slice(0,10));setUntil(d)}};
 return <section className="dvl-panel dvl-stack"><h2>Resumen financiero</h2><label>Período<select value={period} onChange={e=>select(e.target.value)}>{[['all','Acumulado'],['day','Hoy'],['week','Esta semana'],['month','Este mes'],['year','Este año'],['custom','Personalizado']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 {period!=='all'&&<div className="dvl-grid"><label>Desde<input type="date" value={from} onChange={e=>{setPeriod('custom');setFrom(e.target.value)}}/></label><label>Hasta<input type="date" min={from} value={until} onChange={e=>{setPeriod('custom');setUntil(e.target.value)}}/></label></div>}
 <button type="button" className="dvl-action secondary" disabled={offline} onClick={()=>setAttempt(n=>n+1)}>Actualizar</button>
 {offline&&<p role="status">Sin conexión. Los importes pueden estar desactualizados.</p>}
 {error&&<p role="alert">No se pudo consultar el resumen financiero. Revisá las fechas.</p>}
 {!data&&!offline&&!error&&<p role="status">Consultando importes…</p>}
 {data&&<><h3>Ingresos propios registrados</h3><p><strong>{money(data.totalReceived??(data.affiliationReceived+data.advertisingRecorded+data.settledDvolada))}</strong></p><dl>{Object.entries(labels).map(([key,label])=><div className="dvl-row" key={key}><dt>{label}</dt><dd>{money(data[key]??(key==='advertisingReceived'?data.advertisingRecorded:0))}</dd></div>)}</dl><p>Importes brutos propios, no utilidad neta. No incluye fondos de terceros. Los pagos publicitarios históricos sin fecha ({money(data.advertisingUndated||0)}) solo se incluyen en el acumulado.</p><h3>Cuentas por cobrar · al día de hoy</h3><dl>{Object.entries(balances).map(([key,label])=><div className="dvl-row" key={key}><dt>{label}</dt><dd>{money(data[key]||0)}</dd></div>)}</dl><p>Las próximas cuotas y las vencidas pueden solaparse; no sumarlas. El vencido incluye todos los períodos exigibles anteriores a hoy. Los saldos no cambian con el filtro de fechas.</p></>}
 </section>;
}
