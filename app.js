const SEED=[];
const DEFAULT_CATS=[
 ["Comida fuera","--c1"],["Súper","--c3"],["Regalos","--c2"],["Salidas y fiesta","--c4"],
 ["Transporte","--c6"],["Cafés y snacks","--c5"],["Suscripciones","--c0"],["Tecnología","--c7"],["Otros","--c8"]];
const CATS_KEY="mis-gastos-cats";
let CATS;try{CATS=JSON.parse(localStorage.getItem(CATS_KEY))||DEFAULT_CATS}catch(e){CATS=DEFAULT_CATS}
const saveCats=()=>{try{localStorage.setItem(CATS_KEY,JSON.stringify(CATS))}catch(e){}};
const ALL_COLORS=["--c0","--c1","--c2","--c3","--c4","--c5","--c6","--c7","--c8","--c9","--c10"];
const color=n=>{const c=CATS.find(x=>x[0]===n);return `var(${c?c[1]:"--c8"})`};
const $=id=>document.getElementById(id);
const eur=v=>v.toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2});
const pad=n=>String(n).padStart(2,"0");
const todayISO=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};

let gastos=[];           // {id, concepto, importe, categoria, fecha, importado}
const KEY="mis-gastos-v3";
const UID_KEY="mis-gastos-uid";
const DEL_KEY="mis-gastos-deleted";
// Gastos del atajo: "fecha" llega con hora (2026-10-30T20:30:00); la hora se usa para ordenar
function fixGasto(g){if(g&&typeof g.fecha==="string"){const f=g.fecha.trim();
  if(f.length>10){const m=f.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if(m&&!g.ts)g.ts=new Date(+m[1],m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0)).getTime()}
  g.fecha=f.slice(0,10)}return g}
function load(){try{const r=localStorage.getItem(KEY);if(r){const v=JSON.parse(r);return Array.isArray(v)?v.map(fixGasto):v}}catch(e){}return null}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(gastos))}catch(e){toast("No se pudo guardar en el móvil")}}
function loadDeleted(){try{return JSON.parse(localStorage.getItem(DEL_KEY))||[]}catch(e){return[]}}
function addDeleted(id){try{const d=new Set(loadDeleted());d.add(id);localStorage.setItem(DEL_KEY,JSON.stringify([...d]))}catch(e){}}
function clearLocalData(){try{localStorage.removeItem(KEY);localStorage.removeItem(UID_KEY);localStorage.removeItem(DEL_KEY)}catch(e){}}
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
let filter=null,searchQuery="",statsMode=false;
let editing=null, selCat=null;

function monthName(ym){const [y,m]=ym.split("-").map(Number);return new Date(y,m-1,1).toLocaleDateString("es-ES",{month:"long",year:"numeric"})}
function shiftMonth(ym,d){let [y,m]=ym.split("-").map(Number);m+=d;while(m<1){m+=12;y--}while(m>12){m-=12;y++}return `${y}-${pad(m)}`}

function render(){
  $("prev").disabled=false;
  if(statsMode){$("searchToggle").hidden=true;$("editCatsBtn").hidden=true;renderStats();return}
  $("editCatsBtn").hidden=false;
  $("searchToggle").hidden=false;
  $("heroLabel").textContent="Gastado este mes";
  if(searchQuery){renderSearch();return}
  $("monthLabel").textContent=monthName(month);
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
    b.onclick=()=>{selCat=n;[...box.children].forEach(c=>c.setAttribute("aria-pressed",String(c===b)));validate()};
    box.appendChild(b);
  });
}
const parseAmt=s=>{const v=parseFloat(String(s).replace(/\s|€/g,"").replace(",","."));return isFinite(v)?Math.round(v*100)/100:NaN};
function validate(){$("save").disabled=!(parseAmt($("importe").value)>0&&selCat)}
function openSheet(g){
  editing=g||null;
  $("sheetTitle").textContent=g?"Editar gasto":"Nuevo gasto";
  $("importe").value=g?eur(g.importe):"";
  $("concepto").value=g?g.concepto:"";
  $("fecha").value=g?g.fecha:todayISO();
  selCat=g?g.categoria:null;
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
  const body={concepto:$("concepto").value.trim(),importe:parseAmt($("importe").value),categoria:selCat,fecha:$("fecha").value||todayISO(),ts:Date.now()};
  if(!(body.importe>0)||!selCat)return;
  if(editing&&editing.importado&&body.fecha===editing.fecha) body.importado=true;
  $("save").disabled=true;
  if(col){
    (editing?col.doc(editing.id).set(body):col.add(body)).catch(err=>{
      if(err&&err.code==="invalid_argument")toast("Solo puedes ver estos gastos, no editarlos");
      else if(err&&err.code!=="unavailable")toast("No se pudo guardar. Inténtalo otra vez");
    });
  }else{
    if(editing)Object.assign(editing,body);else gastos.push({id:"g"+Date.now(),...body});persist();render();
  }
  month=body.fecha.slice(0,7);
  closeSheet();
});
$("del").onclick=async()=>{
  const b=$("del");
  if(!b.classList.contains("armed")){b.classList.add("armed");b.textContent="¿Seguro?";return}
  try{
    const delId=editing.id;
    gastos=gastos.filter(g=>g!==editing);persist();render();
    addDeleted(delId);
    if(col) col.doc(delId).delete().catch(()=>{});
    closeSheet()
  }catch(e){toast("No se pudo borrar")}
};
$("importe").addEventListener("input",validate);
$("concepto").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();e.target.blur()}});
const norm=s=>s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
$("concepto").addEventListener("input",e=>{
  if(editing)return;
  const v=norm(e.target.value.trim());if(!v)return;
  const match=gastos.find(g=>g.concepto&&norm(g.concepto)===v);
  if(match){selCat=match.categoria;[...$("chips").children].forEach(c=>c.setAttribute("aria-pressed",String(c.textContent===selCat)));validate()}
});
$("fab").onclick=()=>openSheet(null);
$("close").onclick=closeSheet;$("scrim").onclick=()=>{if(!$("catSheet").hidden)closeCatsSheet();else closeSheet()};
$("editCatsBtn").onclick=()=>openCatsSheet();
$("closeCatsBtn").onclick=closeCatsSheet;
$("addCatBtn").onclick=()=>{
  const next=ALL_COLORS.find(c=>!CATS.some(x=>x[1]===c))||ALL_COLORS[CATS.length%ALL_COLORS.length];
  CATS.push(["Nueva categoría",next]);saveCats();buildChips();openCatsSheet();
  setTimeout(()=>{const ins=$("catList").querySelectorAll(".cat-name");const l=ins[ins.length-1];l.select();l.focus()},50);
};
$("prev").onclick=()=>{month=shiftMonth(month,-1);filter=null;render()};
$("next").onclick=()=>{month=shiftMonth(month,1);filter=null;render()};
$("statsToggle").onclick=()=>{statsMode=!statsMode;filter=null;searchQuery="";$("searchInput").value="";$("searchWrap").classList.remove("open");$("statsToggle").textContent=statsMode?"Mes":"Año";render()};
$("searchToggle").onclick=()=>{const open=$("searchWrap").classList.toggle("open");if(!open){searchQuery="";$("searchInput").value="";render()}else setTimeout(()=>$("searchInput").focus(),50)};
$("searchInput").addEventListener("input",e=>{searchQuery=e.target.value.trim();render()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("sheet").hidden)closeSheet()});

function openCatsSheet(){
  const list=$("catList");list.innerHTML="";
  CATS.forEach(([name,cv])=>{
    let catName=name;
    const used=gastos.some(g=>g.categoria===catName);
    const row=document.createElement("div");row.className="cat-edit-row";
    row.innerHTML=`<span class="dot cat-dot" style="background:var(${cv})"></span><input class="cat-name" value=""><button class="cat-del" ${used?"disabled":""}>✕</button>`;
    const inp=row.querySelector(".cat-name");inp.value=catName;
    const delBtn=row.querySelector(".cat-del");
    inp.addEventListener("change",async()=>{
      const newName=inp.value.trim();if(!newName||newName===catName)return;
      const old=catName;
      const cat=CATS.find(x=>x[0]===old);if(cat)cat[0]=newName;
      catName=newName;saveCats();
      if(col){const b=db.batch();gastos.filter(g=>g.categoria===old).forEach(g=>b.update(col.doc(g.id),{categoria:newName}));await b.commit()}
      else{gastos.forEach(g=>{if(g.categoria===old)g.categoria=newName});persist()}
      buildChips();render();openCatsSheet();
    });
    delBtn.onclick=()=>{
      if(gastos.some(g=>g.categoria===catName))return;
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
    const valid=data.filter(g=>typeof g.importe==="number");
    if(col){const b=db.batch();valid.forEach(g=>{const{id,...d}=g;b.set(col.doc(id||"g"+Date.now()),d)});await b.commit();toast(`Importados ${valid.length} gastos`)}
    else{gastos=valid;persist();render();toast(`Importados ${valid.length} gastos`)}}
  catch(err){toast("Ese archivo no es una copia de Mis Gastos")}
  e.target.value="";
};

/* arranque */
const seedGastos=()=>SEED.map((s,i)=>({id:"oct"+String(i+1).padStart(2,"0"),concepto:s[0],importe:s[1],categoria:s[2],fecha:s[3]||"2026-10-01",importado:true,ts:i+1}));

function renderStats(){
  const yr=new Date().getFullYear();
  $("monthLabel").textContent="Resumen "+yr;
  $("heroLabel").textContent="Gastado este año";
  $("prev").disabled=true;$("next").disabled=true;
  const all=gastos.filter(g=>(g.fecha||"").startsWith(yr));
  const tot=all.reduce((s,g)=>s+g.importe,0);
  $("total").innerHTML=`${eur(tot)}<small>€</small>`;
  $("sub").textContent=all.length?`${all.length} gastos · ${eur(tot/12)} € al mes de media`:"Sin gastos este año";
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
  if(!results.length){list.innerHTML=`<div class="empty">Sin resultados para "${searchQuery}".</div>`;return}
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
      if(prevUid&&prevUid!==user.uid){clearLocalData();gastos=[];render()}
      localStorage.setItem(UID_KEY,user.uid);
      col=db.collection("users").doc(user.uid).collection("gastos");
      $("status").textContent="";
      listen(user);
    }else{
      setAuthUI(false);
      stopListen();
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
      unsub=col.onSnapshot(snap=>{
        retryDelay=3000;
        const serverIds=new Set(snap.docs.map(d=>d.id));
        const deleted=loadDeleted();
        const toDelete=deleted.filter(id=>serverIds.has(id));
        const local=load()||[];
        const pending=local.filter(g=>g.id&&!serverIds.has(g.id)&&!deleted.includes(g.id));
        if(toDelete.length||pending.length){
          const b=db.batch();
          toDelete.forEach(id=>b.delete(col.doc(id)));
          pending.forEach(g=>{const{id,...d}=g;b.set(col.doc(id),d)});
          b.commit().catch(()=>{});
          if(toDelete.length) localStorage.setItem(DEL_KEY,JSON.stringify(deleted.filter(id=>!toDelete.includes(id))));
        }
        // Renderizar siempre desde el servidor, no bloquear por pendientes
        gastos=snap.docs.map(d=>fixGasto({id:d.id,...d.data()})).filter(g=>!deleted.includes(g.id));
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
  const p=new URLSearchParams(location.search);
  if(!p.has("importe")&&!p.has("concepto"))return;
  history.replaceState(null,"",location.pathname); // evita duplicar al recargar
  const imp=parseAmt(p.get("importe")||"");
  const concepto=(p.get("concepto")||"").trim();
  const catQ=norm((p.get("cat")||p.get("categoria")||"").trim());
  let cat=catQ?(CATS.find(c=>norm(c[0])===catQ)||CATS.find(c=>norm(c[0]).startsWith(catQ))||[])[0]:null;
  if(!cat&&concepto){const m=gastos.find(g=>g.concepto&&norm(g.concepto)===norm(concepto));if(m)cat=m.categoria}
  openSheet(null);
  if(imp>0)$("importe").value=eur(imp);
  $("concepto").value=concepto;
  if(cat){selCat=cat;[...$("chips").children].forEach(c=>c.setAttribute("aria-pressed",String(c.textContent===selCat)))}
  validate();
  if(imp>0&&cat&&p.get("confirmar")!=="1"){
    $("form").requestSubmit();
  }
})();
if("serviceWorker" in navigator){navigator.serviceWorker.register("sw.js").catch(()=>{})}