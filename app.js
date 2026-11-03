const TABS=[["dash","لوحة المتابعة"],["veh","العربيات"],["drv","السواقين"],["fine","المخالفات"],["km","العدادات اليومية"],["cus","العهدة"],["settle","تسويات العهدة"],["history","حركة السواقين"],["find","بحث"]];
const S={vehicles:[],drivers:[],fines:[],logs:[],cus:[],alloc:[],exp:[],ret:[],assign:[]},C={vehicles:"vehicles",drivers:"drivers",fines:"fines",logs:"kmlogs",cus:"custody",alloc:"allocs",exp:"expenses",ret:"returns",assign:"assignments"};
let tab="dash",DB=null,canW=true,q="";
let currentUser=null,canSettle=false,settlementRows=[];
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today=()=>new Date().toISOString().slice(0,10);
const dleft=d=>d?Math.ceil((new Date(d)-new Date(today()))/864e5):null;
const addM=(d,m)=>{if(!d||!m)return"";const x=new Date(d);x.setMonth(x.getMonth()+Number(m));return x.toISOString().slice(0,10)};
const vById=id=>S.vehicles.find(v=>v.id===id),dById=id=>S.drivers.find(d=>d.id===id);
const vName=id=>vById(id)?.plate||"—",dName=id=>dById(id)?.name||"—";
function st(days){if(days===null)return'<span class="tag na">غير مسجل</span>';
 if(days<0)return`<span class="tag bad">منتهي من ${-days} يوم</span>`;
 if(days<=30)return`<span class="tag warn">باقي ${days} يوم</span>`;return`<span class="tag ok">باقي ${days} يوم</span>`}
const insExp=v=>addM(v.insStart,v.insMonths),taxExp=v=>addM(v.taxStart,v.taxMonths);
function odo(vid){const l=S.logs.filter(x=>x.vehicleId===vid);return l.length?Math.max(...l.map(x=>Number(x.end??x.start))):null}
function sinceSvc(v){const o=odo(v.id);return o===null?null:o-Number(v.lastSvcKm||0)}
function avgDaily(vid){const l=S.logs.filter(x=>x.vehicleId===vid&&Number(x.end)>=Number(x.start));return l.length?l.reduce((a,x)=>a+x.end-x.start,0)/l.length:0}
function fleetAvg(){const l=S.logs.filter(x=>Number(x.end)>=Number(x.start));return l.length?l.reduce((a,x)=>a+x.end-x.start,0)/l.length:0}
const isHigh=vid=>{const f=fleetAvg();return f>0&&avgDaily(vid)>f*1.5};
const finesOf=did=>S.fines.filter(f=>f.driverId===did);

/* ---------- storage ---------- */
const SB_URL="https://kvzepmjbjlfujxivllkz.supabase.co",SB_KEY="sb_publishable_pk1I0JQ4SiTNXcxQbDngpA_lH09m5nb";
let sb=null;
const K=Object.fromEntries(Object.entries(C).map(([k,v])=>[v,k]));
const clean=o=>JSON.parse(JSON.stringify(o));
function applyRow(r){const k=K[r.coll];if(!k)return;const i=S[k].findIndex(x=>x.id===r.id),o={id:r.id,...r.data};if(i<0)S[k].push(o);else S[k][i]=o}
function dropRow(id){Object.keys(S).forEach(k=>{S[k]=S[k].filter(x=>x.id!==id)})}
function loginView(msg){
 $("#app").innerHTML=`<div class="card" style="max-width:360px;margin:30px auto"><h2>تسجيل الدخول</h2><div class="f" style="grid-template-columns:1fr"><div><label>الإيميل</label><input id="em" type="email" autocomplete="username"></div><div><label>كلمة السر</label><input id="pw" type="password" autocomplete="current-password"></div></div><p class="mut">${msg||""}</p><button class="btn" id="li">دخول</button></div>`;
 $("#li").onclick=async()=>{const{error}=await sb.auth.signInWithPassword({email:$("#em").value.trim(),password:$("#pw").value});if(error)loginView("الإيميل أو كلمة السر غلط");else boot()}}
async function boot(){
 const{data:{session}}=await sb.auth.getSession();
 if(!session)return loginView();
 currentUser=session.user;
 $("#app").innerHTML='<div class="card">جاري تحميل البيانات…</div>';
 const{data:roleData,error:roleError}=await sb.from("app_roles").select("role").eq("user_id",currentUser.id).maybeSingle();
 canSettle=!roleError&&roleData?.role==="settlement_manager";
 const{data,error}=await sb.from("records").select("*");
 if(error){$("#app").innerHTML='<div class="card">تعذر تحميل البيانات: '+esc(error.message)+'</div>';return}
 Object.keys(S).forEach(k=>S[k]=[]);data.forEach(applyRow);
 const{data:settlements,error:settlementError}=await sb.from("monthly_settlements").select("*").order("month",{ascending:false});
 settlementRows=settlementError?[]:(settlements||[]);
 render();
 await sb.removeAllChannels();
 sb.channel("rec").on("postgres_changes",{event:"*",schema:"public",table:"records"},p=>{if(p.eventType==="DELETE")dropRow(p.old.id);else applyRow(p.new);render()}).subscribe();
 sb.channel("settlements").on("postgres_changes",{event:"*",schema:"public",table:"monthly_settlements"},p=>{
  if(p.eventType==="DELETE")settlementRows=settlementRows.filter(x=>x.id!==p.old.id);
  else{const i=settlementRows.findIndex(x=>x.id===p.new.id);if(i<0)settlementRows.push(p.new);else settlementRows[i]=p.new;}
  if(tab==="settle")render();
 }).subscribe();
 if(!$("#lo")){
  $("header").insertAdjacentHTML("beforeend",'<button class="btn g s" id="lo" style="margin-inline-start:auto">خروج</button>');
  $("#lo").onclick=async()=>{await sb.removeAllChannels();await sb.auth.signOut();currentUser=null;canSettle=false;settlementRows=[];$("#lo").remove();loginView()}
 }
}
function start(){
 renderNav();
 if(!window.supabase||SB_URL.startsWith("YOUR-"))return $("#app").innerHTML='<div class="card">حط SB_URL و SB_KEY في أول ملف app.js (الخطوات في ملف supabase.sql).</div>';
 sb=supabase.createClient(SB_URL,SB_KEY);boot()}
const save=async(k,id,data)=>{const b=clean(data);
 const q=id?sb.from("records").update({data:b}).eq("id",id):sb.from("records").insert({coll:C[k],data:b});
 const{data:r,error}=await q.select().single();
 if(error){console.error(error);return alert("حصل خطأ في الحفظ: "+error.message)}
 applyRow(r);render();return r};
const del=async(k,id)=>{if(!confirm("متأكد من الحذف؟"))return;const{error}=await sb.from("records").delete().eq("id",id);if(error)return alert("حصل خطأ: "+error.message);dropRow(id);render()};

/* ---------- form ---------- */
function form(title,fields,init,onSave){
 const h=fields.map(([k,l,t,o])=>{const v=init[k]??"";let i;
  if(t==="select")i=`<select name="${k}"><option value="">— اختار —</option>${o.map(([a,b])=>`<option value="${esc(a)}" ${a===v?"selected":""}>${esc(b)}</option>`).join("")}</select>`;
  else if(t==="file")i=`<input name="${k}" type="file" accept="image/*">`;
  else if(t==="area")i=`<textarea name="${k}" rows="2">${esc(v)}</textarea>`;
  else i=`<input name="${k}" type="${t||"text"}" value="${esc(v)}">`;
  return`<div><label>${l}</label>${i}</div>`}).join("");
 $("#modal").innerHTML=`<div class="modal"><div class="card"><h2>${title}</h2><div class="f" id="ff">${h}</div><div class="row" style="margin-top:12px"><button class="btn" id="sv">حفظ</button><button class="btn g" id="cx">إلغاء</button></div></div></div>`;
 $("#cx").onclick=()=>$("#modal").innerHTML="";
 $("#sv").onclick=async()=>{const d={...init};for(const e of document.querySelectorAll("#ff [name]")){if(e.type==="file"){if(e.files[0]){try{d[e.name]=await compress(e.files[0])}catch(x){return alert("الصورة مش مقروءة")}}}else d[e.name]=e.value}delete d.id;await onSave(d);$("#modal").innerHTML=""};
}
const vOpts=()=>S.vehicles.map(v=>[v.id,v.plate]),dOpts=()=>S.drivers.map(d=>[d.id,d.name]);

/* ---------- entities ---------- */
const recordAssignment=async(vehicleId,driverId,date=today())=>{
 const active=S.assign.filter(a=>a.vehicleId===vehicleId&&!a.endDate).sort((a,b)=>(b.startDate||"").localeCompare(a.startDate||""))[0];
 if(active&&active.driverId===driverId)return;
 if(active){const{ id:_rowId, ...activeData}=active;await save("assign",active.id,{...activeData,endDate:date})}
 if(driverId)await save("assign",null,{vehicleId,driverId,startDate:date,note:"تسجيل تلقائي عند تحديث السواق"});
};
const vForm=v=>form(v?"تعديل عربية":"إضافة عربية",[["plate","رقم العربية"],["model","الموديل / النوع"],["driverId","السواق الحالي","select",dOpts()],
 ["insStart","بداية التأمين","date"],["insMonths","مدة التأمين (شهور)","number"],["taxStart","بداية الضرايب/الترخيص","date"],["taxMonths","مدة الضرايب (شهور)","number"],
 ["lastSvcKm","عداد آخر صيانة (كم)","number"],["svcEvery","الصيانة كل (كم)","number"]],v||{svcEvery:10000,lastSvcKm:0},async d=>{
 const previous=v?.driverId||"",saved=await save("vehicles",v?.id,d);const id=v?.id||saved?.id;
 if(id&&d.driverId!==previous)await recordAssignment(id,d.driverId||"",today());
 });
const dForm=d0=>form(d0?"تعديل سواق":"إضافة سواق",[["name","اسم السواق"],["area","المنطقة / السوق"],["phone","التليفون"],["licNo","رقم رخصة السواق"],["licExp","انتهاء الرخصة","date"]],d0||{},d=>save("drivers",d0?.id,d));
const fForm=f=>form("تسجيل مخالفة",[["driverId","السواق","select",dOpts()],["vehicleId","العربية","select",vOpts()],["date","تاريخ المخالفة","date"],["type","نوع المخالفة"],["amount","المبلغ","number"],["notes","ملاحظات","area"]],f||{date:today()},async d=>{
 if(!d.driverId&&d.vehicleId)d.driverId=vById(d.vehicleId)?.driverId||"";await save("fines",f?.id,d)});
const kForm=()=>form("تسجيل قراءة العداد",[["vehicleId","العربية","select",vOpts()],["date","التاريخ","date"],["period","الفترة","select",[["am","صباحاً (عداد البداية)"],["pm","مساءً (عداد النهاية)"]]],["val","قراءة العداد (كم)","number"]],{date:today()},async d=>{
 if(!d.vehicleId||!d.period||d.val==="")return alert("اختار العربية والفترة وادخل القراءة");
 const ex=S.logs.find(l=>l.vehicleId===d.vehicleId&&l.date===d.date),r={...(ex||{}),vehicleId:d.vehicleId,date:d.date};delete r.id;
 r[d.period==="pm"?"end":"start"]=d.val;
 if(r.start!==undefined&&r.end!==undefined&&Number(r.end)<Number(r.start))return alert("قراءة المساء لازم تكون أكبر من الصباح");
 await save("logs",ex?.id,r)});
function renew(id,w){const v=vById(id);form(w==="ins"?"تجديد التأمين":"تجديد الضرايب",[[w+"Start","تاريخ التجديد","date"],[w+"Months","المدة (شهور)","number"]],{[w+"Start"]:today(),[w+"Months"]:v[w+"Months"]},d=>save("vehicles",id,{...v,...d,id:undefined}))}
const svcDone=id=>{const v=vById(id),o=odo(id);if(o===null)return alert("مفيش عدادات مسجلة");if(confirm("تسجيل صيانة عند "+o+" كم؟"))save("vehicles",id,{...v,id:undefined,lastSvcKm:o})};

/* ---------- print ---------- */
function printFine(id){const f=S.fines.find(x=>x.id===id),d=dById(f.driverId);
 $("#pf").innerHTML="";const el=document.createElement("div");el.className="modal";el.id="pfm";
 el.innerHTML=`<div><div class="sheet" id="sheet"><h3>LRT — نموذج إقرار باستلام مخالفة</h3><table style="width:100%"><tr><td>اسم السواق</td><td>${esc(d?.name)}</td><td>المنطقة</td><td>${esc(d?.area)}</td></tr>
 <tr><td>رقم العربية</td><td>${esc(vName(f.vehicleId))}</td><td>رقم الرخصة</td><td>${esc(d?.licNo)}</td></tr>
 <tr><td>تاريخ المخالفة</td><td>${esc(f.date)}</td><td>نوع المخالفة</td><td>${esc(f.type)}</td></tr>
 <tr><td>المبلغ</td><td>${esc(f.amount)} جنيه</td><td>ملاحظات</td><td>${esc(f.notes)}</td></tr></table>
 <p>أقر أنا الموقع أدناه بأنه تم إخطاري بالمخالفة الموضحة أعلاه، وأتحمل المسئولية عنها وفقاً للوائح الشركة.</p>
 <div class="sig"><div>توقيع السواق: ____________</div><div>مسئول التشغيل: ____________</div><div>التاريخ: ____________</div></div></div>
 <div class="row" style="margin-top:10px"><button class="btn" id="pp">طباعة</button><button class="btn g" id="pc">إغلاق</button></div></div>`;
 $("#modal").innerHTML="";$("#modal").appendChild(el);
 $("#pc").onclick=()=>$("#modal").innerHTML="";
 $("#pp").onclick=()=>{$("#pf").innerHTML=$("#sheet").outerHTML;window.print()}}

/* ---------- views ---------- */
const act=(k,id)=>canW?`<button class="btn g s" data-e="${k}:${id}">تعديل</button> <button class="btn g s" data-d="${k}:${id}">حذف</button>`:"";
const T=(h,rows)=>`<div class="tw"><table><tr>${h.map(x=>`<th>${x}</th>`).join("")}</tr>${rows||`<tr><td colspan="${h.length}" class="mut">مفيش بيانات لسه</td></tr>`}</table></div>`;
function vehRow(v){const o=odo(v.id),s=sinceSvc(v),ev=Number(v.svcEvery||10000);
 const sv=s===null?'<span class="tag na">لا عدادات</span>':s>=ev?`<span class="tag bad">مطلوبة (${s} كم)</span>`:s>=ev*.9?`<span class="tag warn">قربت (${s} كم)</span>`:`<span class="tag ok">${s} كم</span>`;
 return`<tr><td><button class="linkbtn" data-profile="v:${v.id}"><b>${esc(v.plate)}</b></button></td><td>${esc(v.model)}</td><td>${esc(dName(v.driverId))}</td><td>${st(dleft(insExp(v)))} <small class="mut">${insExp(v)}</small> <button class="btn g s" data-r="ins:${v.id}">تجديد</button></td>
 <td>${st(dleft(taxExp(v)))} <small class="mut">${taxExp(v)}</small> <button class="btn g s" data-r="tax:${v.id}">تجديد</button></td>
 <td>${o??"—"}</td><td>${money(sum(S.exp.filter(e=>e.vehicleId===v.id),e=>e.amount))} ج.م</td><td>${sv} <button class="btn g s" data-s="${v.id}">تمت صيانة</button></td><td>${isHigh(v.id)?'<span class="tag bad">استهلاك عالي</span>':""}</td><td><button class="btn g s" data-profile="v:${v.id}">الملف</button> ${act("vehicles",v.id)}</td></tr>`}
function vDetail(id){const v=vById(id);if(!v)return;const ex=S.exp.filter(x=>x.vehicleId===id),logs=S.logs.filter(x=>x.vehicleId===id),f=S.fines.filter(x=>x.vehicleId===id),hist=S.assign.filter(x=>x.vehicleId===id).sort((a,b)=>(b.startDate||"").localeCompare(a.startDate||""));
 const total=sum(ex,x=>x.amount);showProfile("ملف العربية — "+v.plate,`<div class="grid"><div class="stat"><b>${money(total)}</b><small>إجمالي المصروفات</small></div><div class="stat"><b>${odo(id)??"—"}</b><small>آخر قراءة عداد</small></div><div class="stat"><b>${ex.length}</b><small>عدد المصروفات</small></div><div class="stat"><b>${f.length}</b><small>المخالفات</small></div></div><p>الموديل: <b>${esc(v.model||"—")}</b> | السواق الحالي: <b>${esc(dName(v.driverId))}</b></p><h3>سجل انتقالات السواقين</h3>${T(["السواق","من تاريخ","حتى تاريخ"],hist.map(a=>`<tr><td>${esc(dName(a.driverId))}</td><td>${esc(a.startDate||"—")}</td><td>${esc(a.endDate||"حتى الآن")}</td></tr>`).join(""))}<h3>المصروفات والصيانة</h3>${T(["التاريخ","السواق","النوع","المبلغ","ملاحظات"],srt(ex).map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(dName(e.driverId))}</td><td>${esc(e.type)}</td><td>${money(e.amount)}</td><td>${esc(e.note)}</td></tr>`).join(""))}<h3>العدادات</h3>${T(["التاريخ","بداية","نهاية","المقطوع"],srt(logs).map(l=>`<tr><td>${esc(l.date)}</td><td>${l.start??"—"}</td><td>${l.end??"—"}</td><td>${l.start!==undefined&&l.end!==undefined?Number(l.end)-Number(l.start):"—"}</td></tr>`).join(""))}<h3>المخالفات</h3>${T(["التاريخ","السواق","النوع","المبلغ"],srt(f).map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(dName(x.driverId))}</td><td>${esc(x.type)}</td><td>${money(x.amount)}</td></tr>`).join(""))}`)}
function dDetail(id){const d=dById(id);if(!d)return;const ex=S.exp.filter(x=>x.driverId===id),f=finesOf(id),hist=S.assign.filter(x=>x.driverId===id).sort((a,b)=>(b.startDate||"").localeCompare(a.startDate||""));
 showProfile("ملف السواق — "+d.name,`<div class="grid"><div class="stat"><b>${money(sum(ex,x=>x.amount))}</b><small>إجمالي المصروفات</small></div><div class="stat"><b>${f.length}</b><small>المخالفات</small></div><div class="stat"><b>${money(sum(f,x=>x.amount))}</b><small>قيمة المخالفات</small></div></div><p>المنطقة: ${esc(d.area||"—")} | التليفون: ${esc(d.phone||"—")} | الرخصة: ${esc(d.licNo||"—")}</p><h3>سجل العربيات</h3>${T(["العربية","من تاريخ","حتى تاريخ"],hist.map(a=>`<tr><td>${esc(vName(a.vehicleId))}</td><td>${esc(a.startDate||"—")}</td><td>${esc(a.endDate||"حتى الآن")}</td></tr>`).join(""))}<h3>المصروفات</h3>${T(["التاريخ","العربية","النوع","المبلغ"],srt(ex).map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(vName(e.vehicleId))}</td><td>${esc(e.type)}</td><td>${money(e.amount)}</td></tr>`).join(""))}<h3>المخالفات</h3>${T(["التاريخ","العربية","النوع","المبلغ"],srt(f).map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(vName(x.vehicleId))}</td><td>${esc(x.type)}</td><td>${money(x.amount)}</td></tr>`).join(""))}`)}
function showProfile(title,body){$("#modal").innerHTML=`<div class="modal"><div class="card profile"><div class="row"><h2 style="margin:0">${esc(title)}</h2><button class="btn g" id="profileClose">إغلاق</button></div>${body}</div></div>`;$("#profileClose").onclick=()=>$("#modal").innerHTML=""}
function dash(){
 const al=[];
 S.vehicles.forEach(v=>{[["التأمين",insExp(v)],["الضرايب",taxExp(v)]].forEach(([n,e])=>{const d=dleft(e);if(d!==null&&d<=30)al.push([d<0,`${n} للعربية ${v.plate}: ${d<0?"منتهي من "+-d+" يوم":"باقي "+d+" يوم"} (${e})`])});
  const s=sinceSvc(v),ev=Number(v.svcEvery||10000);if(s!==null&&s>=ev*.9)al.push([s>=ev,`صيانة العربية ${v.plate}: ${s>=ev?"مطلوبة الآن":"قربت"} (${s} كم من آخر صيانة)`]);
  if(isHigh(v.id))al.push([false,`استهلاك عالي: ${v.plate} بمتوسط ${Math.round(avgDaily(v.id))} كم/يوم (متوسط الأسطول ${Math.round(fleetAvg())})`])});
 S.drivers.forEach(d=>{const x=dleft(d.licExp);if(x!==null&&x<=30)al.push([x<0,`رخصة السواق ${d.name}: ${x<0?"منتهية":"باقي "+x+" يوم"}`])});
 al.sort((a,b)=>b[0]-a[0]);
 const top=S.drivers.map(d=>[d,finesOf(d.id)]).filter(x=>x[1].length).sort((a,b)=>b[1].length-a[1].length).slice(0,5);
 return`<div class="grid card"><div class="stat"><b>${S.vehicles.length}</b><small>عربيات</small></div><div class="stat"><b>${S.drivers.length}</b><small>سواقين</small></div><div class="stat"><b>${S.fines.length}</b><small>مخالفات</small></div><div class="stat"><b>${money(sum(S.exp,e=>e.amount))}</b><small>إجمالي المصروفات (ج.م)</small></div><div class="stat"><b>${al.length}</b><small>تنبيهات</small></div></div>
 <div class="card"><h2>التنبيهات</h2>${al.map(a=>`<div class="al ${a[0]?"bad":""}">${esc(a[1])}</div>`).join("")||'<span class="mut">مفيش تنبيهات 👌</span>'}</div>
 <div class="card"><h2>أكتر السواقين مخالفات</h2>${T(["السواق","عدد المخالفات","إجمالي المبلغ"],top.map(([d,f])=>`<tr><td>${esc(d.name)}</td><td>${f.length}</td><td>${f.reduce((a,x)=>a+Number(x.amount||0),0)}</td></tr>`).join(""))}</div>`}
function veh(){return`<div class="card"><div class="row"><h2 style="margin:0">العربيات</h2>${canW?'<button class="btn" data-add="veh">+ إضافة عربية</button>':""}</div>${T(["الرقم","النوع","السواق","التأمين","الضرايب","العداد","تكلفة التشغيل","الصيانة","",""],S.vehicles.map(vehRow).join(""))}</div>`}
function drv(){return`<div class="card"><div class="row"><h2 style="margin:0">السواقين</h2>${canW?'<button class="btn" data-add="drv">+ إضافة سواق</button>':""}</div>${T(["الاسم","المنطقة","التليفون","رقم الرخصة","الرخصة","مخالفات",""],S.drivers.map(d=>`<tr><td><button class="linkbtn" data-profile="d:${d.id}"><b>${esc(d.name)}</b></button></td><td>${esc(d.area)}</td><td>${esc(d.phone)}</td><td>${esc(d.licNo)}</td><td>${st(dleft(d.licExp))}</td><td>${finesOf(d.id).length}</td><td>${act("drivers",d.id)}</td></tr>`).join(""))}</div>`}
function fineRows(l){return l.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(f=>`<tr><td>${esc(f.date)}</td><td>${esc(dName(f.driverId))}</td><td>${esc(vName(f.vehicleId))}</td><td>${esc(f.type)}</td><td>${esc(f.amount)}</td><td><button class="btn g s" data-p="${f.id}">نموذج إمضاء</button> ${act("fines",f.id)}</td></tr>`).join("")}
function fine(){return`<div class="card"><div class="row"><h2 style="margin:0">المخالفات</h2>${canW?'<button class="btn" data-add="fine">+ تسجيل مخالفة</button>':""}</div>${T(["التاريخ","السواق","العربية","النوع","المبلغ",""],fineRows(S.fines))}</div>
 <div class="card"><h2>عدد المخالفات لكل سواق</h2>${T(["السواق","العدد","الإجمالي"],S.drivers.map(d=>[d,finesOf(d.id)]).sort((a,b)=>b[1].length-a[1].length).map(([d,f])=>`<tr><td>${esc(d.name)}</td><td>${f.length}</td><td>${f.reduce((a,x)=>a+Number(x.amount||0),0)}</td></tr>`).join(""))}</div>`}
function km(){const fa=fleetAvg();return`<div class="card"><div class="row"><h2 style="margin:0">العدادات اليومية</h2>${canW?'<button class="btn" data-add="km">+ تسجيل قراءة (صباح / مساء)</button>':""}</div>
 ${T(["العربية","متوسط كم/يوم","آخر عداد","الحالة"],S.vehicles.map(v=>`<tr><td>${esc(v.plate)}</td><td>${Math.round(avgDaily(v.id))}</td><td>${odo(v.id)??"—"}</td><td>${isHigh(v.id)?'<span class="tag bad">استهلاك عالي</span>':'<span class="tag ok">عادي</span>'}</td></tr>`).join(""))}<p class="mut">متوسط الأسطول: ${Math.round(fa)} كم/يوم — العربية تتعلّم "عالي" لو متوسطها أكتر من ١٫٥ ضعف المتوسط.</p></div>
 <div class="card"><h2>سجل الأيام</h2>${T(["التاريخ","العربية","البداية","النهاية","المقطوع",""],S.logs.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,100).map(l=>`<tr><td>${esc(l.date)}</td><td>${esc(vName(l.vehicleId))}</td><td>${l.start??"—"}</td><td>${l.end??"—"}</td><td>${l.start!==undefined&&l.end!==undefined?`<b>${l.end-l.start}</b>`:`<span class="tag warn">ناقص ${l.end===undefined?"المساء":"الصباح"}</span>`}</td><td>${canW?`<button class="btn g s" data-d="logs:${l.id}">حذف</button>`:""}</td></tr>`).join(""))}</div>`}
function find(){const t=q.trim().toLowerCase();let out="";
 if(t){const ds=S.drivers.filter(d=>(d.name||"").toLowerCase().includes(t)||(d.phone||"").includes(t)||(d.licNo||"").toLowerCase().includes(t));
  const vs=S.vehicles.filter(v=>(v.plate||"").toLowerCase().includes(t)||(v.model||"").toLowerCase().includes(t));
  ds.forEach(d=>{const vv=S.vehicles.filter(v=>v.driverId===d.id);out+=`<div class="card"><h2>🧑 ${esc(d.name)}</h2><p>المنطقة: <b>${esc(d.area)||"—"}</b> | التليفون: ${esc(d.phone)||"—"} | رخصة: ${esc(d.licNo)||"—"} ${st(dleft(d.licExp))}</p>
   <h3>العربيات</h3>${T(["الرقم","النوع","التأمين","الضرايب","الصيانة"],vv.map(v=>`<tr><td>${esc(v.plate)}</td><td>${esc(v.model)}</td><td>${st(dleft(insExp(v)))}</td><td>${st(dleft(taxExp(v)))}</td><td>${sinceSvc(v)??"—"} كم</td></tr>`).join(""))}
   <h3>المخالفات (${finesOf(d.id).length})</h3>${T(["التاريخ","العربية","النوع","المبلغ",""],fineRows(finesOf(d.id)))}</div>`});
  vs.forEach(v=>{const dr=dById(v.driverId);out+=`<div class="card"><h2>🚚 ${esc(v.plate)}</h2><p>${esc(v.model)} | السواق: <b>${esc(dr?.name)||"—"}</b> | المنطقة: ${esc(dr?.area)||"—"}</p>${T(["","التأمين","الضرايب","العداد","الصيانة",""],vehRow(v).replace(/<td>.*?<\/td>/,"<td></td>"))}
   <h3>آخر العدادات</h3>${T(["التاريخ","البداية","النهاية","المقطوع"],S.logs.filter(l=>l.vehicleId===v.id).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,15).map(l=>`<tr><td>${l.date}</td><td>${l.start??"—"}</td><td>${l.end??"—"}</td><td>${l.start!==undefined&&l.end!==undefined?l.end-l.start:"—"}</td></tr>`).join(""))}
   <h3>مخالفات العربية</h3>${T(["التاريخ","السواق","العربية","النوع","المبلغ",""],fineRows(S.fines.filter(f=>f.vehicleId===v.id)))}</div>`});
  if(!ds.length&&!vs.length)out='<div class="card mut">مفيش نتيجة.</div>'}
 return`<div class="card"><h2>بحث بالسواق أو رقم العربية</h2><input id="q" value="${esc(q)}" placeholder="اكتب اسم السواق أو رقم العربية…" autocomplete="off"></div>${out}`}

function history(){return`<div class="card"><div class="row"><h2 style="margin:0">سجل حركة السواقين بين العربيات</h2>${canW?'<button class="btn" data-add="assign">+ تسجيل حركة</button>':""}</div><p class="mut">يتم إنشاء سجل تلقائي عند تغيير السواق الحالي من ملف العربية. ويمكن تسجيل الحركات السابقة يدويًا.</p>${T(["التاريخ من","التاريخ إلى","العربية","السواق","ملاحظات",""],srt(S.assign).map(a=>`<tr><td>${esc(a.startDate)}</td><td>${esc(a.endDate||"حتى الآن")}</td><td>${esc(vName(a.vehicleId))}</td><td>${esc(dName(a.driverId))}</td><td>${esc(a.note)}</td><td>${act("assign",a.id)}</td></tr>`).join(""))}</div>`}
const assignForm=()=>form("تسجيل حركة سواق",[["vehicleId","العربية","select",vOpts()],["driverId","السواق","select",dOpts()],["startDate","تاريخ الاستلام","date"],["endDate","تاريخ التسليم (اختياري)","date"],["note","ملاحظات","area"]],{startDate:today()},async d=>{if(!d.vehicleId||!d.driverId||!d.startDate)return alert("اختار العربية والسواق وتاريخ الاستلام");await save("assign",null,d)});
function assignEdit(a){form("تعديل حركة سواق",[["vehicleId","العربية","select",vOpts()],["driverId","السواق","select",dOpts()],["startDate","تاريخ الاستلام","date"],["endDate","تاريخ التسليم (اختياري)","date"],["note","ملاحظات","area"]],a,d=>save("assign",a.id,d))}
const V={dash,veh,drv,fine,km,cus,settle:settlementView,history,find};
function render(){const a=$("#app"),f=document.activeElement;if(f&&f.id==="q")return;a.innerHTML=V[tab]();bind()}
function renderNav(){$("#nav").innerHTML=TABS.map(([k,l])=>`<button class="${k===tab?"on":""}" data-t="${k}">${l}</button>`).join("");
 $("#nav").onclick=e=>{const t=e.target.dataset.t;if(t){tab=t;renderNav();$("#app").innerHTML=V[tab]();bind()}}}
const EDIT={vehicles:[vForm,"vehicles"],drivers:[dForm,"drivers"],fines:[fForm,"fines"]};
function bind(){const a=$("#app");
 const qi=$("#q");if(qi)qi.oninput=e=>{q=e.target.value;const p=e.target.selectionStart;a.innerHTML=V.find();bind();const n=$("#q");n.focus();n.setSelectionRange(p,p)};
 a.onclick=e=>{const d=e.target.dataset;if(!d)return;
  if(d.add)({veh:vForm,drv:dForm,fine:fForm,km:kForm,cus:cusForm,alloc:allocForm,exp:expForm,assign:assignForm})[d.add]();
  if(d.profile){const[k,id]=d.profile.split(":");k==="v"?vDetail(id):dDetail(id)}
  if(d.e){const[k,id]=d.e.split(":");if(k==="assign")assignEdit(S.assign.find(x=>x.id===id));else EDIT[k][0](S[k].find(x=>x.id===id))}
  if(d.d){const[k,id]=d.d.split(":");del(k,id)}
  if(d.r){const[w,id]=d.r.split(":");renew(id,w)}
  if(d.s)svcDone(d.s);
  if(d.p)printFine(d.p);if(d.st)settle(d.st);if(d.inv)showInv(d.inv);if(d.ms)editMonthlySettlement(d.ms,d.month);if(d.more){cL+=100;render()}};
 a.onchange=e=>{const i=e.target.id;if(i==="cm"){cM=e.target.value;cL=50;render()}else if(i==="cd"){cD=e.target.value;cL=50;render()}}}

/* ---------- العهدة ---------- */
const sum=(a,f)=>a.reduce((t,x)=>t+Number(f(x)||0),0),money=n=>Number(n||0).toLocaleString("en-US");
const srt=a=>a.slice().sort((x,y)=>(y.date||"").localeCompare(x.date||""));
const dAl=id=>sum(S.alloc.filter(x=>x.driverId===id),x=>x.amount),dEx=id=>sum(S.exp.filter(x=>x.driverId===id),x=>x.amount),dRt=id=>sum(S.ret.filter(x=>x.driverId===id),x=>x.amount);
const dBal=id=>dAl(id)-dEx(id)-dRt(id);
const mgrBal=()=>sum(S.cus,c=>c.amount)-sum(S.exp,e=>e.amount)-S.drivers.reduce((t,d)=>t+Math.max(dBal(d.id),0),0);
const compress=(f,m=1000,q=.6)=>new Promise((res,rej)=>{const r=new FileReader();r.onerror=rej;r.onload=()=>{const i=new Image();i.onerror=rej;i.onload=()=>{const k=Math.min(1,m/Math.max(i.width,i.height)),c=document.createElement("canvas");c.width=i.width*k;c.height=i.height*k;c.getContext("2d").drawImage(i,0,0,c.width,c.height);const u=c.toDataURL("image/jpeg",q);res(u.length>200000&&m>600?compress(f,m-300,q-.12):u)};i.src=r.result};r.readAsDataURL(f)});
const cusForm=()=>form("استلام عهدة (مدير التشغيل)",[["date","التاريخ","date"],["amount","المبلغ","number"],["note","المصدر / ملاحظات","area"]],{date:today()},async d=>{if(!(Number(d.amount)>0))return alert("ادخل مبلغ صحيح");await save("cus",null,d)});
const allocForm=()=>form("توزيع عهدة على سواق",[["driverId","السواق","select",dOpts()],["date","التاريخ","date"],["amount","المبلغ","number"],["note","الغرض","area"]],{date:today()},async d=>{
 if(!d.driverId||!(Number(d.amount)>0))return alert("اختار السواق وادخل مبلغ صحيح");
 if(Number(d.amount)>mgrBal()&&!confirm("المبلغ أكبر من رصيد العهدة مع المدير ("+money(mgrBal())+"). تكمل؟"))return;await save("alloc",null,d)});
const expForm=()=>form("تسجيل مصروف",[["vehicleId","العربية المرتبط بها المصروف","select",vOpts()],["driverId","السواق (سيبها فاضية لو المصروف على المدير)","select",dOpts()],["date","التاريخ","date"],["amount","المبلغ","number"],["type","نوع المصروف (بنزين، صيانة…)"],["note","ملاحظات","area"],["invoice","صورة الفاتورة (اختياري)","file"]],{date:today()},async d=>{if(!(Number(d.amount)>0))return alert("ادخل مبلغ صحيح");if(d.vehicleId&&!d.driverId)d.driverId=vById(d.vehicleId)?.driverId||"";await save("exp",null,d)});
function settle(id){const b=dBal(id);
 if(b===0)return alert("عهدة السواق متصفّرة بالفعل");
 if(b<0)return alert("السواق صرف "+money(-b)+" أكتر من عهدته. وزّع له الفرق من «توزيع على سواق» وبعدها صفّي.");
 form("تصفية عهدة "+dName(id),[["date","التاريخ","date"],["amount","المبلغ المرتجع للمدير","number"],["note","ملاحظات","area"]],{date:today(),amount:b},async d=>{
  if(Number(d.amount)!==b&&!confirm("المبلغ مختلف عن المتبقي ("+money(b)+"). تكمل؟"))return;await save("ret",null,{...d,driverId:id})})}
function showInv(id){const e=S.exp.find(x=>x.id===id);if(!e||!e.invoice)return;$("#modal").innerHTML=`<div class="modal"><div><div class="card"><img src="${e.invoice}" style="max-width:100%;border-radius:8px"><div class="row" style="margin-top:10px"><button class="btn g" id="cx">إغلاق</button></div></div></div></div>`;$("#cx").onclick=()=>$("#modal").innerHTML=""}
let cM="",cD="",cL=50;
const MN=["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const mOf=x=>(x.date||"").slice(0,7),mLbl=k=>{const[y,m]=k.split("-");return(MN[Number(m)-1]||k)+" "+y};
function cus(){const X=(k,id)=>canW?`<button class="btn g s" data-d="${k}:${id}">حذف</button>`:"";
 const nm=id=>id?dName(id):"المدير / بدون سواق";
 const rec=sum(S.cus,c=>c.amount),spent=sum(S.exp,e=>e.amount),left=rec-spent,mg=mgrBal(),wd=left-mg;
 const ms=[...new Set([...S.cus,...S.exp].map(mOf).filter(Boolean))].sort();
 let run=0;const mr=ms.map(m=>{const r=sum(S.cus.filter(x=>mOf(x)===m),x=>x.amount),s=sum(S.exp.filter(x=>mOf(x)===m),x=>x.amount);run+=r-s;return{m,r,s,run}}).reverse();
 const bar=(r,s)=>{const p=r>0?Math.min(100,s/r*100):(s>0?100:0);return`<div style="min-width:90px;height:6px;background:var(--bd);border-radius:3px"><div style="width:${p}%;height:6px;border-radius:3px;background:${s>r?"var(--bad)":"var(--red)"}"></div></div>`};
 const col=n=>n<0?"var(--bad)":"var(--ok)";
 const mrows=mr.map(x=>`<tr><td><b>${mLbl(x.m)}</b></td><td>${money(x.r)}</td><td>${money(x.s)}</td><td style="color:${col(x.r-x.s)}">${money(x.r-x.s)}</td><td><b>${money(x.run)}</b></td><td>${bar(x.r,x.s)}</td></tr>`).join("");
 const drows=S.drivers.filter(d=>dAl(d.id)||dEx(d.id)||dRt(d.id)).sort((x,y)=>dEx(y.id)-dEx(x.id)).map(d=>{const al=dAl(d.id),ex=dEx(d.id),rt=dRt(d.id),b=al-ex-rt;let stt,rem;
  if(!al&&!rt){stt='<span class="tag na">مصروف من عهدة المدير</span>';rem='<span class="mut">—</span>'}
  else if(b>0){rem=`<b>${money(b)}</b>`;stt=canW?`<button class="btn s" data-st="${d.id}">تصفية</button>`:'<span class="tag warn">معاه عهدة</span>'}
  else if(b===0){rem="<b>0</b>";stt='<span class="tag ok">متصفّية</span>'}
  else{rem=`<b style="color:var(--bad)">${money(b)}</b>`;stt='<span class="tag bad">صرف أكتر من الموزّع</span>'}
  return`<tr><td><b>${esc(d.name)}</b></td><td><b>${money(ex)}</b></td><td>${money(al)}</td><td>${money(rt)}</td><td>${rem}</td><td>${stt}</td></tr>`}).join("");
 const fe=srt(S.exp).filter(e=>(!cM||mOf(e)===cM)&&(!cD||(cD==="_"?!e.driverId:e.driverId===cD))),sh=fe.slice(0,cL);
 const mOpt=['<option value="">كل الشهور</option>',...ms.slice().reverse().map(m=>`<option value="${m}" ${m===cM?"selected":""}>${mLbl(m)}</option>`)].join("");
 const dOpt=['<option value="">كل السواقين</option>',`<option value="_" ${cD==="_"?"selected":""}>المدير / بدون سواق</option>`,...S.drivers.filter(d=>dEx(d.id)).map(d=>`<option value="${d.id}" ${d.id===cD?"selected":""}>${esc(d.name)}</option>`)].join("");
 const erows=sh.map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(nm(e.driverId))}</td><td>${esc(vName(e.vehicleId))}</td><td>${esc(e.type)}</td><td><b>${money(e.amount)}</b></td><td style="white-space:normal;min-width:150px" class="mut">${esc(e.note)}</td><td>${e.invoice?`<button class="btn g s" data-inv="${e.id}">عرض</button>`:'<span class="mut">—</span>'}</td><td>${X("exp",e.id)}</td></tr>`).join("");
 return`<div class="grid card"><div class="stat"><b>${money(rec)}</b><small>إجمالي العهدة المستلمة</small></div><div class="stat"><b>${money(spent)}</b><small>إجمالي المصروف</small></div><div class="stat"><b style="color:${col(left)}">${money(left)}</b><small>المتبقي من العهدة</small></div></div>
 <div class="card"><div class="grid"><div class="stat"><b>${money(mg)}</b><small>الموجود مع المدير</small></div><div class="stat"><b>${money(wd)}</b><small>الموجود مع السواقين</small></div></div>
 <p class="mut" style="margin:10px 0 0">المتبقي = إجمالي العهدة المستلمة − إجمالي المصروف (سواء اتصرف من المدير أو من السواقين). توزيع العهدة على السواق وتصفيتها بيحرّكوا الفلوس بين المدير والسواق بس، ومبيغيّروش المتبقي الكلي.</p></div>
 ${canW?'<div class="row"><button class="btn" data-add="cus">+ استلام عهدة</button><button class="btn" data-add="alloc">+ توزيع على سواق</button><button class="btn" data-add="exp">+ تسجيل مصروف / فاتورة</button></div>':""}
 <div class="card"><h2>تقرير العهدة الشهري</h2>${T(["الشهر","العهدة المستلمة","المصروف","الفرق","الرصيد التراكمي","المصروف من العهدة"],mrows)}<p class="mut">الفرق = المستلم − المصروف في الشهر. الرصيد التراكمي = مجموع الفروق من أول شهر لحد الشهر ده.</p></div>
 <div class="card"><h2>مصروفات كل سواق</h2>${T(["السواق","إجمالي المصروف","الموزّع عليه","المرتجع","المتبقي معاه","الحالة"],drows)}<p class="mut">المتبقي معاه = الموزّع − المصروف − المرتجع. السواق اللي مفيش له توزيع مسجّل مصروفه بيتخصم مباشرة من عهدة المدير. زرار «تصفية» بيظهر بس لو السواق معاه عهدة متبقية ويسجّل رجوعها للمدير.</p></div>
 <div class="card"><h2>المصروفات</h2><div class="f" style="margin-bottom:10px"><div><label>الشهر</label><select id="cm">${mOpt}</select></div><div><label>السواق</label><select id="cd">${dOpt}</select></div></div>
 ${T(["التاريخ","السواق","العربية","النوع","المبلغ","ملاحظات","فاتورة",""],erows)}<p class="mut">المعروض ${sh.length} من ${fe.length} — إجمالي مصروفات الفلتر الحالي: <b>${money(sum(fe,e=>e.amount))}</b></p>${fe.length>cL?'<button class="btn g" data-more="1">عرض المزيد</button>':""}</div>
 <div class="card"><h2>العهدة المستلمة</h2>${T(["التاريخ","المبلغ","ملاحظات",""],srt(S.cus).map(c=>`<tr><td>${esc(c.date)}</td><td><b>${money(c.amount)}</b></td><td>${esc(c.note)}</td><td>${X("cus",c.id)}</td></tr>`).join(""))}</div>
 <div class="card"><h2>التوزيعات والمرتجعات</h2>${T(["التاريخ","النوع","السواق","المبلغ","ملاحظات",""],srt([...S.alloc.map(a=>({...a,k:"alloc",t:"توزيع"})),...S.ret.map(r=>({...r,k:"ret",t:"تصفية / مرتجع"}))]).map(a=>`<tr><td>${esc(a.date)}</td><td>${a.t}</td><td>${esc(dName(a.driverId))}</td><td>${money(a.amount)}</td><td>${esc(a.note)}</td><td>${X(a.k,a.id)}</td></tr>`).join(""))}</div>`}


/* ---------- التسويات الشهرية ---------- */
const settlementLabels={pending:"لم تتم التسوية",returned_to_company:"تم الرد للشركة",settled_with_accounts:"تمت التسوية مع الحسابات"};
function settlementMonths(){
 const months=new Set();
 settlementRows.forEach(x=>{if(x.month)months.add(String(x.month).slice(0,7))});
 [...S.cus,...S.exp].forEach(x=>{const m=mOf(x);if(m)months.add(m)});
 return [...months].sort().reverse();
}
function settlementView(){
 const months=settlementMonths();
 const rows=months.map(month=>{
  const record=settlementRows.find(x=>String(x.month||"").slice(0,7)===month);
  const received=sum(S.cus.filter(x=>mOf(x)===month),x=>x.amount);
  const expenses=sum(S.exp.filter(x=>mOf(x)===month),x=>x.amount);
  const remaining=received-expenses;
  const status=record?.status||"pending";
  const tag=status==="pending"?"warn":"ok";
  const action=canSettle?`<button class="btn g s" data-ms="${esc(record?.id||"new")}" data-month="${esc(month)}">${record?"تعديل التسوية":"تسجيل التسوية"}</button>`:"—";
  return `<tr><td><b>${esc(mLbl(month))}</b></td><td>${money(received)}</td><td>${money(expenses)}</td><td><b>${money(remaining)}</b></td><td><span class="tag ${tag}">${esc(settlementLabels[status]||settlementLabels.pending)}</span></td><td>${esc(record?.notes||"—")}</td><td>${action}</td></tr>`;
 }).join("");
 const totalReceived=sum(S.cus,x=>x.amount),totalExpenses=sum(S.exp,x=>x.amount);
 return `<div class="grid card"><div class="stat"><b>${money(totalReceived)}</b><small>إجمالي العهدة المستلمة</small></div><div class="stat"><b>${money(totalExpenses)}</b><small>إجمالي المصروفات</small></div><div class="stat"><b>${money(totalReceived-totalExpenses)}</b><small>المتبقي من العهدة</small></div></div>
 <div class="card"><div class="row"><h2 style="margin:0">تسويات العهدة الشهرية</h2><span class="tag ${canSettle?"ok":"na"}">${canSettle?"مسؤول التسويات":"عرض فقط"}</span></div>
 <p class="mut">المبالغ محسوبة من سجلات العهدة والمصروفات الموجودة في النظام. تعديل حالة التسوية متاح ليوسف فقط.</p>
 ${T(["الشهر","العهدة المستلمة","المصروفات","المتبقي","حالة التسوية","ملاحظات","الإجراء"],rows)}
 <p class="mut">حالة «تم الرد للشركة» أو «تمت التسوية مع الحسابات» هي إثبات تسوية إدارية، ولا تغيّر سجلات العهدة أو المصروفات الأصلية.</p></div>`;
}
function editMonthlySettlement(id,month){
 if(!canSettle)return alert("ليس لديك صلاحية تعديل التسويات");
 const old=settlementRows.find(x=>x.id===id)||settlementRows.find(x=>String(x.month||"").slice(0,7)===month);
 form("تسوية شهر "+mLbl(month),[
  ["status","حالة التسوية","select",[["pending","لم تتم التسوية"],["returned_to_company","تم الرد للشركة"],["settled_with_accounts","تمت التسوية مع الحسابات"]]],
  ["notes","ملاحظات","area"]
 ],{status:old?.status||"pending",notes:old?.notes||""},async d=>{
  if(!canSettle)return alert("ليس لديك صلاحية تعديل التسويات");
  const payload={month:month+"-01",status:d.status,notes:d.notes,updated_by:currentUser.id,updated_at:new Date().toISOString()};
  const{data,error}=await sb.from("monthly_settlements").upsert(payload,{onConflict:"month"}).select().single();
  if(error){console.error(error);return alert("تعذر حفظ التسوية: "+error.message)}
  const i=settlementRows.findIndex(x=>String(x.month||"").slice(0,7)===month);
  if(i<0)settlementRows.push(data);else settlementRows[i]=data;
  render();
 });
}

start();