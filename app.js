const SEED=[];
const CATS_KEY="mis-gastos-cats";
// Si lo guardado está estropeado, se usan las de serie (antes la app dejaba de funcionar)
let CATS;try{const v=JSON.parse(localStorage.getItem(CATS_KEY));CATS=validCats(v)?safeCats(v):DEFAULT_CATS.map(c=>[...c])}catch(e){CATS=DEFAULT_CATS.map(c=>[...c])}
// Si había algo que limpiar (repetidas, colores raros), se guarda ya limpio
try{const raw=localStorage.getItem(CATS_KEY);if(raw&&raw!==JSON.stringify(CATS))localStorage.setItem(CATS_KEY,JSON.stringify(CATS))}catch(e){}
const saveCats=()=>{try{localStorage.setItem(CATS_KEY,JSON.stringify(CATS))}catch(e){};pushCats()};
// Categorías en la nube (users/{uid}): se conservan al cambiar de móvil y el atajo las lee de "catsText"
function pushCats(){try{const u=auth&&auth.currentUser;if(!u||!db)return;
  db.collection("users").doc(u.uid).set({cats:CATS.map(([n,c])=>({n,c})),catsText:CATS.map(c=>c[0]).join("\n")},{merge:true}).catch(()=>{})}catch(e){}}
let catsUnsub=null;
function listenCats(user){
  if(catsUnsub)catsUnsub();
  catsUnsub=db.collection("users").doc(user.uid).onSnapshot(doc=>{
    const d=doc.exists?doc.data():null;
    if(!d||!Array.isArray(d.cats)||!d.cats.length){pushCats();return} // primera vez: sube las del móvil
    const next=safeCats(d.cats.filter(x=>x&&typeof x.n==="string"&&x.n.trim()).map(x=>[x.n,x.c]));
    if(!next.length)return;
    if(JSON.stringify(next)===JSON.stringify(CATS))return;
    CATS=next;try{localStorage.setItem(CATS_KEY,JSON.stringify(CATS))}catch(e){}
    buildChips();if($("catSheet").hidden)render();
  },()=>{});
}
function stopCats(){if(catsUnsub){catsUnsub();catsUnsub=null}}
const color=n=>{const c=CATS.find(x=>x[0]===n);return `var(${safeColor(c&&c[1])})`};
const $=id=>document.getElementById(id);

let gastos=[];           // {id, concepto, importe, categoria, fecha, importado}
const KEY="mis-gastos-v3";
const UID_KEY="mis-gastos-uid";
const DEL_KEY="mis-gastos-deleted";
function load(){try{const r=localStorage.getItem(KEY);if(r){const v=JSON.parse(r);return Array.isArray(v)?v.map(fixGasto):v}}catch(e){}return null}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(gastos))}catch(e){toast("No se pudo guardar en el móvil")}}
function loadDeleted(){try{return JSON.parse(localStorage.getItem(DEL_KEY))||[]}catch(e){return[]}}
function addDeleted(id){try{const d=new Set(loadDeleted());d.add(id);localStorage.setItem(DEL_KEY,JSON.stringify([...d]))}catch(e){}}
function clearLocalData(){try{localStorage.removeItem(KEY);localStorage.removeItem(UID_KEY);localStorage.removeItem(DEL_KEY);localStorage.removeItem(PEND_KEY)}catch(e){}}
// Gastos creados/editados sin sesión que aún no están en la nube. Solo estos se suben al conectar:
// así un gasto borrado en otro dispositivo no "resucita".
const PEND_KEY="mis-gastos-pending";
function loadPending(){try{const v=JSON.parse(localStorage.getItem(PEND_KEY));return Array.isArray(v)?v:null}catch(e){return null}}
function savePending(ids){try{localStorage.setItem(PEND_KEY,JSON.stringify([...new Set(ids)]))}catch(e){}}
function addPending(ids){savePending([...(loadPending()||[]),...ids])}
function dropPending(ids){const s=new Set(ids);savePending((loadPending()||[]).filter(id=>!s.has(id)))}
// Primera vez con esta versión: si nunca se inició sesión, todo lo local está pendiente; si sí, ya estaba en la nube.
if(loadPending()===null){const l=load()||[];savePending(localStorage.getItem(UID_KEY)?[]:l.filter(g=>g&&g.id).map(g=>g.id))}
// Firebase admite 500 operaciones por lote: se trocean
function commitOps(ops){const ps=[];for(let i=0;i<ops.length;i+=400){const b=db.batch();ops.slice(i,i+400).forEach(f=>f(b));ps.push(b.commit())}return Promise.all(ps)}
const FIREBASE_CONFIG={
  apiKey: "AIzaSyBLGJM6G0epcqg1vHi3sCgwxP8lpftZQQI",
  authDomain: "mis-gastos-9f57b.firebaseapp.com",
  projectId: "mis-gastos-9f57b",
  storageBucket: "mis-gastos-9f57b.firebasestorage.app",
  messagingSenderId: "630493807566",
  appId: "1:630493807566:web:3354ad5d3bbf1febdb219f"
};
let col=null,db=null,auth=null;
if(FIREBASE_CONFIG.apiKey!=="REEMPLAZA"){
  try{
    firebase.initializeApp(FIREBASE_CONFIG);
    db=firebase.firestore();
    db.enablePersistence({synchronizeTabs:true}).catch(()=>{});
    auth=firebase.auth();
  }catch(e){}
}
let month=todayISO().slice(0,7);
let filter=null,searchQuery="",statsMode=false,statsYear=new Date().getFullYear();
let editing=null, selCat=null, catManual=false;
const syncing=new Set(); // ids que se están subiendo ahora mismo


function render(){
  $("prev").disabled=false;
  if(statsMode){$("searchToggle").hidden=true;$("editCatsBtn").hidden=true;renderStats();return}
  $("editCatsBtn").hidden=false;
  $("searchToggle").hidden=false;
  $("heroLabel").textContent="Gastado este mes";
  if(searchQuery){renderSearch();return}
  {const n=monthName(month);$("monthLabel").textContent=n.charAt(0).toUpperCase()+n.slice(1)} // "Octubre de 2026"
  $("next").disabled = month>=todayISO().slice(0,7);
  const inMonth=gastos.filter(g=>(g.fecha||"").slice(0,7)===month);
  const total=inMonth.reduce((s,g)=>s+g.importe,0);
  $("total").innerHTML=`${eur(total)}<small>€</small>`;
  const [y,m]=month.split("-").map(Number);
  const isNow=month===todayISO().slice(0,7);
  const days=isNow?new Date().getDate():new Date(y,m,0).getDate();
  $("sub").textContent= inMonth.length? `${inMonth.length} gastos · ${eur(total/days)} € al día de media` : "Sin gastos este mes";

  const byCat={};inMonth.forEach(g=>byCat[g.categoria]=(byCat[g.categoria]||0)+g.importe);
  const rows=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  $("stack").innerHTML=rows.map(([c,v])=>`<i style="flex:${v};background:${color(c)}"></i>`).join("");
  const cats=$("cats");cats.innerHTML="";
  rows.forEach(([c,v])=>{
    const b=document.createElement("button");b.className="cat-row"+(filter===c?" on":"");
    b.innerHTML=`<span class="dot" style="background:${color(c)}"></span><span class="name"></span><span class="pct num">${Math.round(v/total*100)}%</span><span class="amt num">${eur(v)} €</span>`;
    b.querySelector(".name").textContent=c;
    b.onclick=()=>{filter=filter===c?null:c;render()};
    cats.appendChild(b);
  });
  if(!rows.length) cats.innerHTML=`<div class="status" style="padding:6px 10px">Cuando apuntes gastos verás aquí en qué se va el dinero.</div>`;
  $("listTitle").firstChild.textContent=filter?filter:"Movimientos";

  const list=$("list");
  const shown=inMonth.filter(g=>!filter||g.categoria===filter)
    .sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"")||(b.ts||0)-(a.ts||0));
  if(!shown.length){list.innerHTML=`<div class="empty">Aquí aparecerán tus gastos.<br>Pulsa <b>Añadir gasto</b> para apuntar el primero.</div>`;return}
  list.innerHTML="";
  shown.forEach(g=>{
    const b=document.createElement("button");b.className="item";
    const d=new Date(g.fecha?g.fecha+"T12:00":g.ts||Date.now()).toLocaleDateString("es-ES",{weekday:"short",day:"numeric",month:"short"});
    b.innerHTML=`<span class="bar" style="background:${color(g.categoria)}"></span><span class="t"><div class="c"></div><div class="m"></div></span><span class="a num">${eur(g.importe)} €</span>`;
    b.querySelector(".c").textContent=g.concepto||g.categoria;
    b.querySelector(".m").textContent=`${g.categoria} · ${d}`;
    b.onclick=()=>openSheet(g);
    list.appendChild(b);
  });
}

/* hoja de añadir/editar */
function buildChips(){
  const box=$("chips");box.innerHTML="";
  CATS.forEach(([n,v])=>{
    const b=document.createElement("button");b.type="button";b.className="chip";b.setAttribute("aria-pressed","false");
    b.innerHTML=`<i style="background:var(${v})"></i><span></span>`;b.querySelector("span").textContent=n;
    b.onclick=()=>{selCat=n;catManual=true;[...box.children].forEach(c=>c.setAttribute("aria-pressed",String(c===b)));validate()};
    box.appendChild(b);
  });
}
function validate(){const v=parseAmt($("importe").value);$("save").disabled=!(v>0&&v<LIMITS.importe&&selCat)}
function openSheet(g){
  editing=g||null;
  $("sheetTitle").textContent=g?"Editar gasto":"Nuevo gasto";
  $("importe").value=g?eurInput(g.importe):"";
  $("concepto").value=g?g.concepto:"";
  $("fecha").value=g?g.fecha:todayISO();
  selCat=g?g.categoria:null;catManual=false;
  [...$("chips").children].forEach(c=>c.setAttribute("aria-pressed",String(c.textContent===selCat)));
  $("del").hidden=!g;$("del").classList.remove("armed");$("del").textContent="Borrar";
  validate();
  $("scrim").hidden=false;$("sheet").hidden=false;
  document.body.style.overflow="hidden";
  requestAnimationFrame(()=>{$("scrim").classList.add("show");$("sheet").classList.add("show");if(!g)$("importe").focus()});
}
function closeSheet(){
  $("scrim").classList.remove("show");$("sheet").classList.remove("show");
  document.activeElement&&document.activeElement.blur();
  setTimeout(()=>{$("scrim").hidden=true;$("sheet").hidden=true;document.body.style.overflow=""},250);
}
function toast(t){const e=$("toast");e.textContent=t;e.classList.add("show");clearTimeout(toast._t);toast._t=setTimeout(()=>e.classList.remove("show"),1800)}

$("form").addEventListener("submit",async e=>{
  e.preventDefault();
  const body={concepto:$("concepto").value.trim().slice(0,LIMITS.concepto),importe:parseAmt($("importe").value),categoria:selCat,fecha:$("fecha").value||todayISO(),ts:editing&&editing.ts?editing.ts:Date.now()};
  if(!(body.importe>0)||!selCat)return;
  if(body.importe>=LIMITS.importe){toast("El importe es demasiado grande");return}
  if(editing&&editing.importado&&body.fecha===editing.fecha) body.importado=true;
  $("save").disabled=true;
  if(col){
    // Se guarda también en el móvil como "pendiente" hasta que Firebase confirme:
    // si no hay conexión y se cierra la app, no se pierde.
    const id=editing?editing.id:col.doc().id,g={id,...body};
    const i=gastos.findIndex(x=>x.id===id);if(i>=0)gastos[i]=g;else gastos.push(g);
    addPending([id]);persist();syncing.add(id);
    col.doc(id).set(body).then(()=>dropPending([id])).catch(err=>{
      if(err&&err.code==="permission-denied"){dropPending([id]);toast("Firebase ha rechazado el gasto")}
      else if(err&&err.code!=="unavailable")toast("No se pudo guardar. Inténtalo otra vez");
    }).then(()=>syncing.delete(id));
  }else{
    let id;if(editing){Object.assign(editing,body);id=editing.id}else{id="g"+Date.now();gastos.push({id,...body})}
    addPending([id]);persist();
  }
  month=body.fecha.slice(0,7);
  if(filter&&filter!==body.categoria)filter=null; // si no, el gasto nuevo no se vería
  render(); // muestra el mes del gasto guardado
  closeSheet();
});
$("del").onclick=async()=>{
  const b=$("del");
  if(!b.classList.contains("armed")){b.classList.add("armed");b.textContent="¿Seguro?";return}
  try{
    const delId=editing.id;
    gastos=gastos.filter(g=>g!==editing);persist();render();
    addDeleted(delId);dropPending([delId]);
    if(col) col.doc(delId).delete().catch(()=>{});
    closeSheet()
  }catch(e){toast("No se pudo borrar")}
};
$("importe").addEventListener("input",validate);
$("concepto").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();e.target.blur()}});
$("concepto").addEventListener("input",e=>{
  if(editing||catManual)return;
  const cat=lastCatFor(gastos,e.target.value);
  if(cat&&CATS.some(c=>c[0]===cat)){selCat=cat;[...$("chips").children].forEach(c=>c.setAttribute("aria-pressed",String(c.textContent===selCat)));validate()}
});
$("fab").onclick=()=>openSheet(null);
$("close").onclick=closeSheet;$("scrim").onclick=()=>{if(!$("catSheet").hidden)closeCatsSheet();else closeSheet()};
$("editCatsBtn").onclick=()=>openCatsSheet();
$("closeCatsBtn").onclick=closeCatsSheet;
$("addCatBtn").onclick=()=>{
  const next=ALL_COLORS.find(c=>!CATS.some(x=>x[1]===c))||ALL_COLORS[CATS.length%ALL_COLORS.length];
  CATS.push([uniqueName("Nueva categoría",CATS.map(c=>c[0])),next]);saveCats();buildChips();openCatsSheet();
  setTimeout(()=>{const ins=$("catList").querySelectorAll(".cat-name");const l=ins[ins.length-1];l.select();l.focus()},50);
};
$("prev").onclick=()=>{if(statsMode){statsYear--;render();return}month=shiftMonth(month,-1);filter=null;render()};
$("next").onclick=()=>{if(statsMode){statsYear++;render();return}month=shiftMonth(month,1);filter=null;render()};
$("statsToggle").onclick=()=>{statsMode=!statsMode;statsYear=+month.slice(0,4);filter=null;searchQuery="";$("searchInput").value="";$("searchWrap").classList.remove("open");$("statsToggle").textContent=statsMode?"Mes":"Año";render()};
$("searchToggle").onclick=()=>{const open=$("searchWrap").classList.toggle("open");if(!open){searchQuery="";$("searchInput").value="";render()}else setTimeout(()=>$("searchInput").focus(),50)};
$("searchInput").addEventListener("input",e=>{searchQuery=e.target.value.trim();render()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("sheet").hidden)closeSheet()});

function openCatsSheet(){
  const list=$("catList");list.innerHTML="";
  CATS.forEach(([name,cv])=>{
    let catName=name;
    const used=gastos.some(g=>g.categoria===catName);
    const row=document.createElement("div");row.className="cat-edit-row";
    row.innerHTML=`<span class="dot cat-dot" style="background:var(${cv})"></span><input class="cat-name" value=""><button class="cat-del" ${used||CATS.length<=1?"disabled":""}>✕</button>`;
    const inp=row.querySelector(".cat-name");inp.value=catName;
    const delBtn=row.querySelector(".cat-del");
    inp.addEventListener("change",async()=>{
      const newName=inp.value.trim().slice(0,LIMITS.categoria);if(!newName){inp.value=catName;return}if(newName===catName)return;
      const old=catName;
      // Si ya existe una categoría con ese nombre, se fusionan
      if(CATS.some(x=>x[0]===newName))CATS=CATS.filter(x=>x[0]!==old);
      else{const cat=CATS.find(x=>x[0]===old);if(cat)cat[0]=newName}
      catName=newName;saveCats();
      if(filter===old)filter=newName;
      const ids=gastos.filter(g=>g.categoria===old).map(g=>g.id);
      gastos.forEach(g=>{if(g.categoria===old)g.categoria=newName});persist();
      if(col){
        const pend=new Set(loadPending()||[]);
        const up=ids.filter(id=>!pend.has(id));
        const ops=up.map(id=>b=>b.set(col.doc(id),{categoria:newName},{merge:true}));
        if(ops.length){addPending(up);commitOps(ops).then(()=>dropPending(up)).catch(()=>toast("No se pudo cambiar la categoría en la nube"))}
      }else addPending(ids);
      buildChips();render();openCatsSheet();
    });
    delBtn.onclick=()=>{
      if(gastos.some(g=>g.categoria===catName)||CATS.length<=1)return; // la última no se borra
      if(!delBtn.classList.contains("armed")){delBtn.classList.add("armed");delBtn.textContent="¿Seguro?";return}
      const idx=CATS.findIndex(x=>x[0]===catName);
      if(idx!==-1)CATS.splice(idx,1);
      saveCats();buildChips();openCatsSheet();render();
    };
    list.appendChild(row);
  });
  $("scrim").hidden=false;$("catSheet").hidden=false;
  document.body.style.overflow="hidden";
  requestAnimationFrame(()=>{$("scrim").classList.add("show");$("catSheet").classList.add("show")});
}
function closeCatsSheet(){
  $("scrim").classList.remove("show");$("catSheet").classList.remove("show");
  setTimeout(()=>{$("scrim").hidden=true;$("catSheet").hidden=true;document.body.style.overflow=""},250);
}

buildChips();

/* copia de seguridad */
$("exportBtn").onclick=()=>{
  const blob=new Blob([JSON.stringify(gastos,null,1)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`gastos-${todayISO()}.json`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
};
$("csvBtn").onclick=()=>{
  const rows=[["fecha","concepto","categoria","importe"],...gastos.map(g=>[g.fecha,g.concepto,g.categoria,String(g.importe).replace(".",",")])];
  const csv="﻿"+rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(";")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=`gastos-${todayISO()}.csv`;
  document.body.appendChild(a);a.click();a.remove();
};
$("importFile").onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  try{const data=JSON.parse(await f.text());if(!Array.isArray(data))throw 0;
    const valid=data.filter(g=>g&&typeof g.importe==="number"&&typeof g.categoria==="string"&&typeof g.fecha==="string")
      .map((g,i)=>{const x=fixGasto({concepto:String(g.concepto||"").slice(0,LIMITS.concepto),importe:g.importe,categoria:g.categoria.trim(),fecha:g.fecha});
        if(typeof g.ts==="number")x.ts=g.ts;if(g.importado===true)x.importado=true;
        x.id=g.id?String(g.id):(col?col.doc().id:`g${Date.now()}_${i}`);return x}).filter(g=>validGasto((({id,...d})=>d)(g)));
    // Si alguno se había borrado, deja de estar "borrado"
    {const ids=new Set(valid.map(g=>g.id));try{localStorage.setItem(DEL_KEY,JSON.stringify(loadDeleted().filter(id=>!ids.has(id))))}catch(e){}}
    // Categorías que vengan en la copia y no existan
    valid.forEach(g=>{if(!CATS.some(c=>c[0]===g.categoria)){const used=new Set(CATS.map(c=>c[1]));CATS.push([g.categoria,ALL_COLORS.find(c=>!used.has(c))||"--c8"])}});
    saveCats();buildChips();
    // Se mezcla con lo que hay (no se borra nada); si un gasto ya existe, se sustituye
    const m=new Map(gastos.map(g=>[g.id,g]));valid.forEach(g=>m.set(g.id,g));gastos=[...m.values()];persist();render();
    if(col){const ids=valid.map(g=>g.id);addPending(ids);
      commitOps(valid.map(g=>b=>{const{id,...d}=g;b.set(col.doc(id),d)})).then(()=>dropPending(ids)).catch(()=>toast("No se pudo subir la copia a la nube"))}
    else addPending(valid.map(g=>g.id));
    toast(`Importados ${valid.length} gastos`)}
  catch(err){toast("Ese archivo no es una copia de Mis Gastos")}
  e.target.value="";
};

/* arranque */
const seedGastos=()=>SEED.map((s,i)=>({id:"oct"+String(i+1).padStart(2,"0"),concepto:s[0],importe:s[1],categoria:s[2],fecha:s[3]||"2026-10-01",importado:true,ts:i+1}));

function renderStats(){
  const yr=statsYear,curYr=new Date().getFullYear();
  const years=gastos.map(g=>+(g.fecha||"").slice(0,4)).filter(Boolean);
  $("monthLabel").textContent="Resumen "+yr;
  $("heroLabel").textContent=yr===curYr?"Gastado este año":"Gastado en "+yr;
  $("prev").disabled=!years.some(y=>y<yr);$("next").disabled=yr>=curYr;
  const all=gastos.filter(g=>(g.fecha||"").startsWith(yr+"-"));
  const tot=all.reduce((s,g)=>s+g.importe,0);
  $("total").innerHTML=`${eur(tot)}<small>€</small>`;
  $("sub").textContent=all.length?`${all.length} gastos · ${eur(tot/Math.max(1,monthsElapsed(yr)))} € al mes de media`:"Sin gastos este año";
  const byCat={};all.forEach(g=>byCat[g.categoria]=(byCat[g.categoria]||0)+g.importe);
  const rows=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  $("stack").innerHTML=rows.map(([c,v])=>`<i style="flex:${v};background:${color(c)}"></i>`).join("");
  const cats=$("cats");cats.innerHTML="";
  rows.forEach(([c,v])=>{
    const b=document.createElement("button");b.className="cat-row";
    b.innerHTML=`<span class="dot" style="background:${color(c)}"></span><span class="name"></span><span class="pct num">${Math.round(v/tot*100)}%</span><span class="amt num">${eur(v)} €</span>`;
    b.querySelector(".name").textContent=c;cats.appendChild(b);
  });
  if(!rows.length)cats.innerHTML=`<div class="status" style="padding:6px 10px">Sin gastos este año.</div>`;
  const months=[...new Set(all.map(g=>(g.fecha||"").slice(0,7)))].filter(Boolean).sort().reverse();
  $("listTitle").firstChild.textContent="Por mes";
  const list=$("list");
  if(!months.length){list.innerHTML=`<div class="empty">Sin gastos este año.</div>`;return}
  list.innerHTML="";
  months.forEach(m=>{
    const mg=all.filter(g=>(g.fecha||"").startsWith(m));
    const mt=mg.reduce((s,g)=>s+g.importe,0);
    const mName=new Date(m+"-01T12:00").toLocaleDateString("es-ES",{month:"long",year:"numeric"});
    const row=document.createElement("button");row.className="item";
    row.innerHTML=`<span class="bar" style="background:var(--accent)"></span><span class="t"><div class="c"></div><div class="m">${mg.length} gastos</div></span><span class="a num">${eur(mt)} €</span>`;
    row.querySelector(".c").textContent=mName.charAt(0).toUpperCase()+mName.slice(1);
    row.onclick=()=>{statsMode=false;month=m;filter=null;$("statsToggle").textContent="Año";render()};
    list.appendChild(row);
  });
}

function renderSearch(){
  const q=norm(searchQuery);
  $("prev").disabled=true;$("next").disabled=true;
  const results=gastos.filter(g=>norm(g.concepto||"").includes(q)||norm(g.categoria||"").includes(q))
    .sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"")||(b.ts||0)-(a.ts||0));
  const tot=results.reduce((s,g)=>s+g.importe,0);
  $("monthLabel").textContent="Búsqueda";
  $("heroLabel").textContent="Total encontrado";
  $("total").innerHTML=`${eur(tot)}<small>€</small>`;
  $("sub").textContent=results.length?`${results.length} resultado${results.length!==1?"s":""}`:("Sin resultados");
  const byCatS={};results.forEach(g=>byCatS[g.categoria]=(byCatS[g.categoria]||0)+g.importe);
  const rowsS=Object.entries(byCatS).sort((a,b)=>b[1]-a[1]);
  $("stack").innerHTML=rowsS.map(([c,v])=>`<i style="flex:${v};background:${color(c)}"></i>`).join("");
  const catsEl=$("cats");catsEl.innerHTML="";
  rowsS.forEach(([c,v])=>{
    const b=document.createElement("button");b.className="cat-row";
    b.innerHTML=`<span class="dot" style="background:${color(c)}"></span><span class="name"></span><span class="pct num">${Math.round(v/tot*100)}%</span><span class="amt num">${eur(v)} €</span>`;
    b.querySelector(".name").textContent=c;
    catsEl.appendChild(b);
  });
  $("listTitle").firstChild.textContent=`"${searchQuery}"`;
  const list=$("list");
  if(!results.length){list.innerHTML=`<div class="empty"></div>`;list.firstChild.textContent=`Sin resultados para "${searchQuery}".`;return}
  list.innerHTML="";
  results.forEach(g=>{
    const b=document.createElement("button");b.className="item";
    const d=new Date(g.fecha?g.fecha+"T12:00":g.ts||Date.now()).toLocaleDateString("es-ES",{day:"numeric",month:"short",year:"numeric"});
    b.innerHTML=`<span class="bar" style="background:${color(g.categoria)}"></span><span class="t"><div class="c"></div><div class="m"></div></span><span class="a num">${eur(g.importe)} €</span>`;
    b.querySelector(".c").textContent=g.concepto||g.categoria;
    b.querySelector(".m").textContent=`${g.categoria} · ${d}`;
    b.onclick=()=>openSheet(g);
    list.appendChild(b);
  });
}

function setAuthUI(loggedIn){
  $("logoutBtn").style.display=loggedIn?"":"none";
  $("loginBtn").style.display=loggedIn?"none":"";
  $("backupNote").textContent=loggedIn
    ?"Tus gastos se sincronizan con Google. Descarga una copia de vez en cuando."
    :"Tus gastos se guardan solo en este móvil. Descarga una copia de vez en cuando.";
}
/* arranque con auth */
if(auth){
  const provider=new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({prompt:"select_account"});
  const signIn=()=>auth.signInWithPopup(provider).catch(err=>{
    if(err.code==="auth/popup-blocked"||err.code==="auth/popup-cancelled")return auth.signInWithRedirect(provider);
    if(err.code!=="auth/popup-closed-by-user")toast(err.message);
  });
  $("logoutBtn").onclick=()=>signIn();
  $("loginBtn").onclick=signIn;
  auth.getRedirectResult().then(r=>{
    if(r&&r.user) return; // onAuthStateChanged disparará solo
  }).catch(err=>{if(err.code&&!err.code.includes("cancelled"))toast(err.message)});
  // Mostrar datos locales al instante, sin esperar auth ni red
  const _saved=load();if(_saved&&_saved.length){gastos=_saved}else{gastos=seedGastos();persist()}
  render();
  $("loadingScreen").hidden=true;$("status").textContent="";
  setAuthUI(false);
  let unsub=null,listening=false,retryT=null,retryDelay=3000;
  auth.onAuthStateChanged(user=>{
    if(user){
      setAuthUI(true);
      // Si el UID cambió, limpiar datos del usuario anterior
      const prevUid=localStorage.getItem(UID_KEY);
      if(prevUid&&prevUid!==user.uid){
        clearLocalData();savePending([]);gastos=[];
        // No llevar las categorías de la otra cuenta: se cargan las de esta (o las de serie)
        CATS=DEFAULT_CATS.map(c=>[...c]);try{localStorage.setItem(CATS_KEY,JSON.stringify(CATS))}catch(e){}
        buildChips();render()}
      localStorage.setItem(UID_KEY,user.uid);
      col=db.collection("users").doc(user.uid).collection("gastos");
      $("status").textContent="";
      listen(user);
      listenCats(user);
    }else{
      setAuthUI(false);
      stopListen();
      stopCats();
      col=null;
      // No borrar datos locales al cerrar sesión — seguir en modo local
    }
  });
  // Reconectar al volver a la app o recuperar conexión
  const revive=()=>{const u=auth.currentUser;if(u&&!listening)listen(u)};
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")revive()});
  window.addEventListener("online",revive);
  function stopListen(){if(unsub){unsub();unsub=null}listening=false;clearTimeout(retryT)}
  function listen(user){
      stopListen();
      listening=true;
      unsub=col.onSnapshot({includeMetadataChanges:true},snap=>{
        retryDelay=3000;
        const deleted=loadDeleted();
        const local=load()||[];
        if(!snap.metadata.fromCache){ // solo con datos reales del servidor
          const serverIds=new Set(snap.docs.map(d=>d.id));
          const toDelete=deleted.filter(id=>serverIds.has(id));
          const pend=new Set(loadPending()||[]);
          // (las que ya se están subiendo no se repiten)
          const up=local.filter(g=>g&&g.id&&pend.has(g.id)&&!deleted.includes(g.id)&&!syncing.has(g.id)&&validGasto((({id,...d})=>d)(g)));
          const del=toDelete.filter(id=>!syncing.has(id));
          const ops=[...del.map(id=>b=>b.delete(col.doc(id))),...up.map(g=>b=>{const{id,...d}=g;b.set(col.doc(id),d)})];
          if(ops.length){const ids=[...del,...up.map(g=>g.id)];ids.forEach(id=>syncing.add(id));
            commitOps(ops).then(()=>dropPending(up.map(g=>g.id))).catch(()=>{}).then(()=>ids.forEach(id=>syncing.delete(id)))}
          // Los borrados que ya no están en el servidor ya no hace falta recordarlos
          try{localStorage.setItem(DEL_KEY,JSON.stringify(deleted.filter(id=>serverIds.has(id))))}catch(e){}
        }
        gastos=snap.docs.map(d=>fixGasto({id:d.id,...d.data()})).filter(g=>!deleted.includes(g.id));
        // Que los pendientes de subir no desaparezcan de la pantalla mientras se suben
        const pend=new Set(loadPending()||[]);
        if(pend.size){const ids=new Set(gastos.map(g=>g.id));local.forEach(g=>{if(g&&pend.has(g.id)&&!ids.has(g.id)&&!deleted.includes(g.id))gastos.push(g)})}
        persist();render();
        $("status").textContent="";
      },err=>{
        // Antes la escucha moría aquí para siempre; ahora se reintenta
        listening=false;unsub=null;
        $("status").textContent="Sin conexión";
        const saved=load();if(saved&&saved.length){gastos=saved;render()}
        const authErr=err&&(err.code==="permission-denied"||err.code==="unauthenticated");
        clearTimeout(retryT);
        retryT=setTimeout(()=>{
          const u=auth.currentUser;if(!u||listening)return;
          (authErr?u.getIdToken(true):Promise.resolve()).then(()=>listen(u)).catch(()=>{listening=false});
        },retryDelay);
        retryDelay=Math.min(retryDelay*2,60000);
      });
  }
}else{
  $("loadingScreen").hidden=true;
  const saved=load();
  if(saved){gastos=saved}else{gastos=seedGastos();persist()}
  $("status").textContent="";
  render();
}
/* Atajo de iPhone: ?importe=12,50&concepto=Café&cat=Cafés y snacks
   Con importe y categoría válidos guarda directamente; si falta algo, abre el formulario relleno. */
(function fromShortcut(){
  const sc=parseShortcut(location.search,CATS,gastos);if(!sc)return;
  history.replaceState(null,"",location.pathname); // evita duplicar al recargar
  openSheet(null);
  if(sc.importe>0)$("importe").value=eurInput(sc.importe);
  $("concepto").value=sc.concepto;
  if(sc.cat){selCat=sc.cat;[...$("chips").children].forEach(c=>c.setAttribute("aria-pressed",String(c.textContent===selCat)))}
  validate();
  if(sc.importe>0&&sc.importe<LIMITS.importe&&sc.cat&&!sc.confirmar)$("form").requestSubmit();
})();
if("serviceWorker" in navigator){navigator.serviceWorker.register("sw.js").catch(()=>{})}