// Funciones "puras" de Mis Gastos: no tocan la pantalla ni los datos.
// Las usan app.js y test.html (así los tests prueban el código real).

const DEFAULT_CATS=[
 ["Comida fuera","--c1"],["Súper","--c3"],["Regalos","--c2"],["Salidas y fiesta","--c4"],
 ["Transporte","--c6"],["Cafés y snacks","--c5"],["Suscripciones","--c0"],["Tecnología","--c7"],["Otros","--c8"]];
const ALL_COLORS=["--c0","--c1","--c2","--c3","--c4","--c5","--c6","--c7","--c8","--c9","--c10"];

const pad=n=>String(n).padStart(2,"0");
const todayISO=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
// Importe para mostrar: 12345 → "12.345,00"
const eur=v=>v.toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2});
// Importe para un campo editable: sin punto de miles (12345 → "12345,00")
const eurInput=v=>v.toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});
// Texto → número. Acepta "12,50", "12.50", "12,50 €" y "12.345,67" (punto de miles + coma decimal)
const parseAmt=s=>{let t=String(s).replace(/\s|€/g,"");
  if(t.includes(",")&&t.includes("."))t=t.replace(/\./g,"");
  const v=parseFloat(t.replace(",","."));return isFinite(v)?Math.round(Number(v+"e2"))/100:NaN}; // redondeo exacto (1,005 → 1,01)
// Minúsculas y sin tildes, para comparar textos
const norm=s=>String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
function monthName(ym){const [y,m]=ym.split("-").map(Number);return new Date(y,m-1,1).toLocaleDateString("es-ES",{month:"long",year:"numeric"})}
function shiftMonth(ym,d){let [y,m]=ym.split("-").map(Number);m+=d;while(m<1){m+=12;y--}while(m>12){m-=12;y++}return `${y}-${pad(m)}`}
// Gastos del atajo: "fecha" llega con hora (2026-10-30T20:30:00); la hora se usa para ordenar
function fixGasto(g){if(g&&typeof g.importe==="string")g.importe=parseAmt(g.importe);
  if(g&&typeof g.fecha==="string"){const f=g.fecha.trim();
  if(f.length>10){const m=f.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if(m&&!g.ts)g.ts=new Date(+m[1],m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0)).getTime()}
  g.fecha=f.slice(0,10)}return g}
// ¿Es una lista de categorías válida? [["Nombre","--cN"], ...]
const validCats=v=>Array.isArray(v)&&v.length>0&&v.every(c=>Array.isArray(c)&&typeof c[0]==="string"&&c[0].trim()&&typeof c[1]==="string");
// Categoría del gasto más reciente con ese concepto (o null)
function lastCatFor(gastos,concepto){const v=norm(String(concepto||"").trim());if(!v)return null;
  let best=null;for(const g of gastos){if(!g||!g.concepto||norm(g.concepto)!==v)continue;
    if(!best||(g.fecha||"")>(best.fecha||"")||((g.fecha||"")===(best.fecha||"")&&(g.ts||0)>(best.ts||0)))best=g}
  return best?best.categoria:null}
// Media mensual del año: entre los meses transcurridos si es el año en curso
const monthsElapsed=(year,now=new Date())=>year<now.getFullYear()?12:year>now.getFullYear()?0:now.getMonth()+1;

// Límites (los mismos que comprueban las reglas de Firestore)
const LIMITS={importe:1000000,concepto:200,categoria:60};
// ¿El gasto cumple las reglas de Firestore? (sin contar el id)
function validGasto(g){return !!g&&typeof g.importe==="number"&&isFinite(g.importe)&&g.importe>0&&g.importe<LIMITS.importe
  &&typeof g.categoria==="string"&&g.categoria.trim().length>0&&g.categoria.length<=LIMITS.categoria
  &&typeof g.fecha==="string"&&g.fecha.length<=30&&/^\d{4}-\d{2}-\d{2}/.test(g.fecha)
  &&(g.concepto===undefined||(typeof g.concepto==="string"&&g.concepto.length<=LIMITS.concepto))
  &&(g.ts===undefined||typeof g.ts==="number")&&(g.importado===undefined||typeof g.importado==="boolean")}
// Atajo por dirección: ?importe=12,50&concepto=Kebab&cat=comida  →  {importe, concepto, cat, confirmar} o null
function parseShortcut(search,cats,gastos){const p=new URLSearchParams(search);
  if(!p.has("importe")&&!p.has("concepto"))return null;
  const importe=parseAmt(p.get("importe")||"");
  const concepto=(p.get("concepto")||"").trim().slice(0,LIMITS.concepto);
  const q=norm((p.get("cat")||p.get("categoria")||"").trim());
  let cat=q?((cats.find(c=>norm(c[0])===q)||cats.find(c=>norm(c[0]).startsWith(q))||[])[0]||null):null;
  if(!cat&&concepto){const c=lastCatFor(gastos,concepto);if(c&&cats.some(x=>x[0]===c))cat=c}
  return {importe,concepto,cat,confirmar:p.get("confirmar")==="1"}}
// Nombre libre: "Nueva categoría", "Nueva categoría 2", "Nueva categoría 3"…
function uniqueName(base,names){const s=new Set(names);if(!s.has(base))return base;let i=2;while(s.has(`${base} ${i}`))i++;return `${base} ${i}`}
// Quita categorías repetidas (se queda con la primera)
const dedupeCats=cats=>{const seen=new Set();return cats.filter(c=>!seen.has(c[0])&&seen.add(c[0]))};
// Color de categoría seguro: solo los de la paleta (evita que un valor manipulado inyecte código)
const safeColor=c=>ALL_COLORS.includes(c)?c:"--c8";
const safeCats=cats=>dedupeCats(cats).map(([n,c])=>[n,safeColor(c)]);