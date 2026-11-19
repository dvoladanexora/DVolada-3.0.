/** Exportación CSV segura para Excel/Sheets. Datos de usuarios nunca deben ejecutarse como fórmulas. */
export const neutralizeSpreadsheetFormula=value=>{
 const s=String(value??'').replace(/\u0000/g,'');
 // No confiar en prefijos de espacios, tabuladores o nuevas líneas.
 return /^[\s\uFEFF]*[=+@\-\t\r\n]/u.test(s)?"'"+s:s;
};
export const quoteCsv=value=>'"'+neutralizeSpreadsheetFormula(value).replace(/"/g,'""')+'"';
export const csvFromRows=rows=>'\uFEFF'+(Array.isArray(rows)?rows:[]).map(row=>(Array.isArray(row)?row:[]).map(quoteCsv).join(',')).join('\r\n');
export const historyCsvRows=records=>[
 ['Orden','Fecha','Cliente','Estado','Total','Motivo cancelación'],
 ...(Array.isArray(records)?records:[]).map(o=>[
  o.orderNo||o.id||'',o.createdAt||o.date||'',o.name||'',o.status||'',o.total??'',o.cancelReason||o.rejectionReason||''
 ]),
];
