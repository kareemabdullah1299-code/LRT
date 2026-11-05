const TABS=[["dash","لوحة المتابعة"],["veh","العربيات"],["drv","السواقين"],["fine","المخالفات"],["km","العدادات اليومية"],["rep","تقرير العدادات"],["trp","التنقلات والبدلات"],["cus","العهدة"],["imp","رفع Excel"],["find","بحث"]];
const PUB=[["dash","الملخص"],["rep","تقرير العدادات"],["ren","التجديدات والصيانة"],["frep","تقرير المخالفات"],["trp","تقرير التنقلات"]];
const S={vehicles:[],drivers:[],fines:[],logs:[],trips:[],cus:[],alloc:[],exp:[],ret:[]},C={vehicles:"vehicles",drivers:"drivers",fines:"fines",logs:"kmlogs",trips:"trips",cus:"custody",alloc:"allocs",exp:"expenses",ret:"returns"};
let tab="dash",DB=null,canW=true,q="";
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
const SB_URL="YOUR-PROJECT-URL",SB_KEY="YOUR-ANON-PUBLIC-KEY";
let sb=null;
const K=Object.fromEntries(Object.entries(C).map(([k,v])=>[v,k]));
const clean=o=>JSON.parse(JSON.stringify(o));
function applyRow(r){const k=K[r.coll];if(!k)return;const i=S[k].findIndex(x=>x.id===r.id),o={id:r.id,...r.data};if(i<0)S[k].push(o);else S[k][i]=o}
function dropRow(id){Object.keys(S).forEach(k=>{S[k]=S[k].filter(x=>x.id!==id)})}
let ADM=false;
const G={trp:{from:"",to:""},frep:{from:"",to:""}},ago=n=>new Date(Date.now()-n*864e5).toISOString().slice(0,10);

function hdr(){if(!$("#hb"))$("header").insertAdjacentHTML("beforeend",'<span class="hact"><button class="btn g s" id="dg" hidden>فحص الاتصال</button><button class="btn s" id="hb"></button></span>');$("#dg").hidden=!ADM;$("#dg").onclick=diag;$("#mode").textContent=ADM?"وضع الإدارة":"تقارير";const b=$("#hb");b.textContent=ADM?"خروج":"دخول الإدارة";b.onclick=ADM?logout:()=>loginView()}
const logout=async()=>{await sb.removeAllChannels();await sb.auth.signOut();loadPublic()};
function loginView(msg){
 $("#app").innerHTML=`<div class="login card"><div class="lg">🔐</div><h2>دخول الإدارة</h2><p class="mut">لمدير التشغيل فقط. التقارير متاحة من غير دخول.</p><div class="f" style="grid-template-columns:1fr"><div><label>الإيميل</label><input id="em" type="email" autocomplete="username"></div><div><label>كلمة السر</label><input id="pw" type="password" autocomplete="current-password"></div></div><p class="bad-t">${msg||""}</p><div class="row" style="justify-content:center"><button class="btn" id="li">دخول</button><button class="btn g" id="bk">رجوع للتقارير</button></div></div>`;
 $("#li").onclick=async()=>{const{error}=await sb.auth.signInWithPassword({email:$("#em").value.trim(),password:$("#pw").value});if(error)loginView("الإيميل أو كلمة السر غلط");else boot()};
 $("#pw").onkeydown=e=>{if(e.key==="Enter")$("#li").click()};$("#bk").onclick=()=>render()}
async function loadPublic(){
 ADM=false;tab="dash";renderNav();hdr();$("#app").innerHTML='<div class="card">جاري تحميل التقارير…</div>';
 const{data,error}=await tmo(sb.rpc("public_data"));
 if(error){$("#app").innerHTML='<div class="card">تعذر تحميل التقارير: '+esc(error.message)+'<br>اتأكد إنك شغّلت ملف supabase.sql.</div>';return}
 Object.keys(S).forEach(k=>S[k]=[]);Object.keys(K).forEach(c=>S[K[c]]=(data&&data[c])||[]);render()}
async function boot(){
 ADM=true;tab="dash";renderNav();hdr();$("#app").innerHTML='<div class="card">جاري تحميل البيانات…</div>';
 const{data,error}=await tmo(sb.from("records").select("*"));
 if(error){$("#app").innerHTML='<div class="card">تعذر تحميل البيانات: '+esc(error.message)+'</div>';return}
 Object.keys(S).forEach(k=>S[k]=[]);data.forEach(applyRow);render();
 await sb.removeAllChannels();
 sb.channel("rec").on("postgres_changes",{event:"*",schema:"public",table:"records"},p=>{if(p.eventType==="DELETE")dropRow(p.old.id);else applyRow(p.new);render()}).subscribe()}
const tmo=(p,ms=15000)=>Promise.race([p,new Promise((_,r)=>setTimeout(()=>r(new Error("الاتصال بـ Supabase بطيء أو مقطوع. اتأكد من الإنترنت ومن رابط المشروع وإنه شغّال")),ms))]);
if(window.addEventListener){window.addEventListener("error",e=>{const a=$("#app");if(a&&/جاري/.test(a.textContent))a.innerHTML='<div class="card">حصل خطأ في الصفحة: '+esc(e.message)+'</div>'});window.addEventListener("unhandledrejection",e=>{const a=$("#app");if(a&&/جاري/.test(a.textContent))a.innerHTML='<div class="card">حصل خطأ: '+esc((e.reason&&e.reason.message)||e.reason)+'</div>'})}
async function start(){
 renderNav();
 try{
  if(!window.supabase)return $("#app").innerHTML='<div class="card">مكتبة Supabase ما اتحمّلتش (الإنترنت أو حاجب لموقع cdn.jsdelivr.net). حدّث الصفحة وجرّب تاني.</div>';
  if(SB_URL.startsWith("YOUR-")||SB_KEY.startsWith("YOUR-"))return $("#app").innerHTML='<div class="card">حط SB_URL و SB_KEY في أول ملف app.js (الخطوات في ملف supabase.sql).</div>';
  sb=supabase.createClient(SB_URL.trim(),SB_KEY.trim());
  const{data:{session}}=await tmo(sb.auth.getSession());
  if(session)await boot();else await loadPublic()
 }catch(e){console.error(e);$("#app").innerHTML='<div class="card">حصل خطأ في بدء التشغيل: '+esc(e.message||e)+'<br><span class="mut">اتأكد إن SB_URL شكله https://xxxx.supabase.co وإن SB_KEY هو الـ anon public key (بيبدأ غالباً بـ eyJ).</span></div>'}}
const hint=e=>{const m=(e&&e.message)||String(e);if((e&&e.code==="42501")||/row-level security/i.test(m))return"الصلاحيات (Policies) مش متظبطة في Supabase. شغّل ملف supabase.sql كامل تاني وتأكد إنك مسجل دخول.";if(/JWT|expired|not authenticated/i.test(m))return"الجلسة انتهت. اعمل خروج وادخل تاني.";if(/does not exist/i.test(m))return"جدول records أو دالة مش موجودة. شغّل ملف supabase.sql كامل.";if(/Failed to fetch|network/i.test(m))return"مفيش اتصال بـ Supabase.";return""};
async function diag(){const o=[],ok=(n,e)=>o.push((e?"❌ ":"✅ ")+n+(e?": "+(e.message||e):""));
 try{const{data:{session}}=await sb.auth.getSession();o.push(session?"✅ مسجل دخول: "+session.user.email:"❌ مش مسجل دخول");
  let r=await sb.from("records").select("id",{count:"exact",head:true});ok("قراءة الجدول records"+(r.count!=null?" ("+r.count+" سجل)":""),r.error);
  r=await sb.from("records").insert({coll:"_test",data:{t:1}}).select().single();ok("إضافة سجل تجريبي",r.error);
  if(r.data){const d=await sb.from("records").delete().eq("id",r.data.id);ok("حذف السجل التجريبي",d.error)}
  const p=await sb.rpc("public_data");ok("دالة التقارير public_data",p.error)}catch(e){ok("فحص الاتصال",e)}
 alert(o.join("\n"))}
const save=async(k,id,data)=>{const b=clean(data);
 const q=id?sb.from("records").update({data:b}).eq("id",id):sb.from("records").insert({coll:C[k],data:b});
 const{data:r,error}=await q.select().single();
 if(error){console.error(error);return alert("حصل خطأ في الحفظ: "+error.message+(hint(error)?"\n\n"+hint(error):""))}
 applyRow(r);render()};
const del=async(k,id)=>{if(!confirm("متأكد من الحذف؟"))return;const{error}=await sb.from("records").delete().eq("id",id);if(error)return alert("حصل خطأ: "+error.message+(hint(error)?"\n\n"+hint(error):""));dropRow(id);render()};

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
const vForm=v=>form(v?"تعديل عربية":"إضافة عربية",[["plate","رقم العربية"],["model","الموديل / النوع"],["driverId","السواق","select",dOpts()],
 ["insStart","بداية التأمين","date"],["insMonths","مدة التأمين (شهور)","number"],["taxStart","بداية الضرايب/الترخيص","date"],["taxMonths","مدة الضرايب (شهور)","number"],
 ["lastSvcKm","عداد آخر صيانة (كم)","number"],["svcEvery","الصيانة كل (كم)","number"]],v||{svcEvery:10000,lastSvcKm:0},d=>save("vehicles",v?.id,d));
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
 return`<tr><td><b>${esc(v.plate)}</b></td><td>${esc(v.model)}</td><td>${esc(dName(v.driverId))}</td><td>${st(dleft(insExp(v)))} <small class="mut">${insExp(v)}</small> <button class="btn g s" data-r="ins:${v.id}">تجديد</button></td>
 <td>${st(dleft(taxExp(v)))} <small class="mut">${taxExp(v)}</small> <button class="btn g s" data-r="tax:${v.id}">تجديد</button></td>
 <td>${o??"—"}</td><td>${sv} <button class="btn g s" data-s="${v.id}">تمت صيانة</button></td><td>${isHigh(v.id)?'<span class="tag bad">استهلاك عالي</span>':""}</td><td>${act("vehicles",v.id)}</td></tr>`}
function vDetail(){return""}
function dash(){
 const al=[];
 S.vehicles.forEach(v=>{[["التأمين",insExp(v)],["الضرايب",taxExp(v)]].forEach(([n,e])=>{const d=dleft(e);if(d!==null&&d<=30)al.push([d<0,`${n} للعربية ${v.plate}: ${d<0?"منتهي من "+-d+" يوم":"باقي "+d+" يوم"} (${e})`])});
  const s=sinceSvc(v),ev=Number(v.svcEvery||10000);if(s!==null&&s>=ev*.9)al.push([s>=ev,`صيانة العربية ${v.plate}: ${s>=ev?"مطلوبة الآن":"قربت"} (${s} كم من آخر صيانة)`]);
  if(isHigh(v.id))al.push([false,`استهلاك عالي: ${v.plate} بمتوسط ${Math.round(avgDaily(v.id))} كم/يوم (متوسط الأسطول ${Math.round(fleetAvg())})`])});
 S.drivers.forEach(d=>{const x=dleft(d.licExp);if(x!==null&&x<=30)al.push([x<0,`رخصة السواق ${d.name}: ${x<0?"منتهية":"باقي "+x+" يوم"}`])});
 al.sort((a,b)=>b[0]-a[0]);
 const top=S.drivers.map(d=>[d,finesOf(d.id)]).filter(x=>x[1].length).sort((a,b)=>b[1].length-a[1].length).slice(0,5);
 return`<div class="grid card"><div class="stat"><b>${S.vehicles.length}</b><small>عربيات</small></div><div class="stat"><b>${S.drivers.length}</b><small>سواقين</small></div><div class="stat"><b>${S.fines.length}</b><small>مخالفات</small></div><div class="stat"><b>${al.length}</b><small>تنبيهات</small></div></div>
 <div class="card"><h2>التنبيهات</h2>${al.map(a=>`<div class="al ${a[0]?"bad":""}">${esc(a[1])}</div>`).join("")||'<span class="mut">مفيش تنبيهات 👌</span>'}</div>
 <div class="card"><h2>أكتر السواقين مخالفات</h2>${T(["السواق","عدد المخالفات"].concat(ADM?["إجمالي المبلغ"]:[]),top.map(([d,f])=>`<tr><td>${esc(d.name)}</td><td>${f.length}</td>${ADM?`<td>${f.reduce((a,x)=>a+Number(x.amount||0),0)}</td>`:""}</tr>`).join(""))}</div>`}
function veh(){return`<div class="card"><div class="row"><h2 style="margin:0">العربيات</h2>${canW?'<button class="btn" data-add="veh">+ إضافة عربية</button>':""}</div>${T(["الرقم","النوع","السواق","التأمين","الضرايب","العداد","الصيانة","","",""],S.vehicles.map(vehRow).join(""))}</div>`}
function drv(){return`<div class="card"><div class="row"><h2 style="margin:0">السواقين</h2>${canW?'<button class="btn" data-add="drv">+ إضافة سواق</button>':""}</div>${T(["الاسم","المنطقة","التليفون","رقم الرخصة","الرخصة","مخالفات",""],S.drivers.map(d=>`<tr><td><b>${esc(d.name)}</b></td><td>${esc(d.area)}</td><td>${esc(d.phone)}</td><td>${esc(d.licNo)}</td><td>${st(dleft(d.licExp))}</td><td>${finesOf(d.id).length}</td><td>${act("drivers",d.id)}</td></tr>`).join(""))}</div>`}
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

const V={dash,veh,drv,fine,km,rep,trp,cus,imp,find,ren,frep};
function render(){const a=$("#app"),f=document.activeElement;if(f&&f.id==="q")return;a.innerHTML=V[tab]();bind()}
function renderNav(){const L=ADM?TABS:PUB;$("#ttl").textContent=(L.find(x=>x[0]===tab)||[])[1]||"";$("#nav").innerHTML=L.map(([k,l])=>`<button class="${k===tab?"on":""}" data-t="${k}">${l}</button>`).join("");
 $("#nav").onclick=e=>{const t=e.target.dataset.t;if(t){tab=t;renderNav();$("#app").innerHTML=V[tab]();bind()}}}
const EDIT={vehicles:[vForm,"vehicles"],drivers:[dForm,"drivers"],fines:[fForm,"fines"],trips:[tForm,"trips"]};
function bind(){const a=$("#app");document.querySelectorAll("[data-rg]").forEach(e=>e.onchange=()=>{const[n,f]=e.dataset.rg.split(".");G[n][f]=e.value;render()});const xf=$("#xf");if(xf)xf.onchange=e=>xlRead(e.target.files[0]);document.querySelectorAll("[data-rp]").forEach(e=>e.onchange=()=>{rp[e.dataset.rp]=e.value;render()});
 const qi=$("#q");if(qi)qi.oninput=e=>{q=e.target.value;const p=e.target.selectionStart;a.innerHTML=V.find();bind();const n=$("#q");n.focus();n.setSelectionRange(p,p)};
 a.onclick=e=>{const d=e.target.dataset;if(!d)return;
  if(d.add)({veh:vForm,drv:dForm,fine:fForm,km:kForm,cus:cusForm,alloc:allocForm,exp:expForm,trip:tForm})[d.add]();
  if(d.e){const[k,id]=d.e.split(":");EDIT[k][0](S[k==="vehicles"?"vehicles":k].find(x=>x.id===id))}
  if(d.d){const[k,id]=d.d.split(":");del(k,id)}
  if(d.r){const[w,id]=d.r.split(":");renew(id,w)}
  if(d.s)svcDone(d.s);
  if(d.p)printFine(d.p);if(d.st)settle(d.st);if(d.xt)xlTemplate();if(d.xc)xlCommit();if(d.wk!==undefined)weekSet(Number(d.wk));if(d.rgall){const g=d.rgall==="rep"?rp:G[d.rgall];g.from=g.to="";render()}if(d.rpp!==undefined)rpPrint();if(d.rpc!==undefined)rpCsv();if(d.inv)showInv(d.inv)}}

/* ---------- العهدة ---------- */
const sum=(a,f)=>a.reduce((t,x)=>t+Number(f(x)||0),0),money=n=>Number(n||0).toLocaleString("en-US");
const srt=a=>a.slice().sort((x,y)=>(y.date||"").localeCompare(x.date||""));
const dAl=id=>sum(S.alloc.filter(x=>x.driverId===id),x=>x.amount),dEx=id=>sum(S.exp.filter(x=>x.driverId===id),x=>x.amount),dRt=id=>sum(S.ret.filter(x=>x.driverId===id),x=>x.amount);
const dBal=id=>dAl(id)-dEx(id)-dRt(id);
const mgrBal=()=>sum(S.cus,c=>c.amount)-sum(S.alloc,a=>a.amount)+sum(S.ret,r=>r.amount)-sum(S.exp.filter(e=>!e.driverId),e=>e.amount);
const compress=(f,m=1000,q=.6)=>new Promise((res,rej)=>{const r=new FileReader();r.onerror=rej;r.onload=()=>{const i=new Image();i.onerror=rej;i.onload=()=>{const k=Math.min(1,m/Math.max(i.width,i.height)),c=document.createElement("canvas");c.width=i.width*k;c.height=i.height*k;c.getContext("2d").drawImage(i,0,0,c.width,c.height);const u=c.toDataURL("image/jpeg",q);res(u.length>200000&&m>600?compress(f,m-300,q-.12):u)};i.src=r.result};r.readAsDataURL(f)});
const cusForm=()=>form("استلام عهدة (مدير التشغيل)",[["date","التاريخ","date"],["amount","المبلغ","number"],["note","المصدر / ملاحظات","area"]],{date:today()},async d=>{if(!(Number(d.amount)>0))return alert("ادخل مبلغ صحيح");await save("cus",null,d)});
const allocForm=()=>form("توزيع عهدة على سواق",[["driverId","السواق","select",dOpts()],["date","التاريخ","date"],["amount","المبلغ","number"],["note","الغرض","area"]],{date:today()},async d=>{
 if(!d.driverId||!(Number(d.amount)>0))return alert("اختار السواق وادخل مبلغ صحيح");
 if(Number(d.amount)>mgrBal()&&!confirm("المبلغ أكبر من رصيد العهدة مع المدير ("+money(mgrBal())+"). تكمل؟"))return;await save("alloc",null,d)});
const expForm=()=>form("تسجيل مصروف",[["driverId","على عهدة السواق (سيبها فاضية = عهدة المدير)","select",dOpts()],["date","التاريخ","date"],["amount","المبلغ","number"],["type","نوع المصروف (بنزين، صيانة…)"],["note","ملاحظات","area"],["invoice","صورة الفاتورة (اختياري)","file"]],{date:today()},async d=>{if(!(Number(d.amount)>0))return alert("ادخل مبلغ صحيح");await save("exp",null,d)});
function settle(id){const b=dBal(id);
 if(b===0)return alert("عهدة السواق متصفّرة بالفعل");
 if(b<0)return alert("السواق صرف "+money(-b)+" أكتر من عهدته. وزّع له الفرق من «توزيع على سواق» وبعدها صفّي.");
 form("تصفية عهدة "+dName(id),[["date","التاريخ","date"],["amount","المبلغ المرتجع للمدير","number"],["note","ملاحظات","area"]],{date:today(),amount:b},async d=>{
  if(Number(d.amount)!==b&&!confirm("المبلغ مختلف عن المتبقي ("+money(b)+"). تكمل؟"))return;await save("ret",null,{...d,driverId:id})})}
function showInv(id){const e=S.exp.find(x=>x.id===id);if(!e||!e.invoice)return;$("#modal").innerHTML=`<div class="modal"><div><div class="card"><img src="${e.invoice}" style="max-width:100%;border-radius:8px"><div class="row" style="margin-top:10px"><button class="btn g" id="cx">إغلاق</button></div></div></div></div>`;$("#cx").onclick=()=>$("#modal").innerHTML=""}
function cus(){const X=(k,id)=>canW?`<button class="btn g s" data-d="${k}:${id}">حذف</button>`:"";
 const rows=S.drivers.filter(d=>dAl(d.id)||dEx(d.id)).map(d=>{const b=dBal(d.id);return`<tr><td><b>${esc(d.name)}</b></td><td>${money(dAl(d.id))}</td><td>${money(dEx(d.id))}</td><td>${money(dRt(d.id))}</td><td><b>${money(b)}</b></td><td>${b===0?'<span class="tag ok">متصفّية</span>':b<0?'<span class="tag bad">مصروف زيادة</span>':(canW?`<button class="btn s" data-st="${d.id}">تصفية</button>`:'<span class="tag warn">مفتوحة</span>')}</td></tr>`}).join("");
 const nm=id=>id?dName(id):"المدير";
 return`<div class="grid card"><div class="stat"><b>${money(mgrBal())}</b><small>رصيد العهدة مع المدير</small></div><div class="stat"><b>${money(sum(S.cus,c=>c.amount))}</b><small>إجمالي المستلم</small></div><div class="stat"><b>${money(sum(S.alloc,a=>a.amount))}</b><small>الموزّع على السواقين</small></div><div class="stat"><b>${money(sum(S.exp,e=>e.amount))}</b><small>إجمالي المصروف</small></div></div>
 ${canW?'<div class="row"><button class="btn" data-add="cus">+ استلام عهدة</button><button class="btn" data-add="alloc">+ توزيع على سواق</button><button class="btn" data-add="exp">+ تسجيل مصروف / فاتورة</button></div>':""}
 <div class="card"><h2>عهدة كل سواق</h2>${T(["السواق","المستلم","المصروف","المرتجع","المتبقي",""],rows)}<p class="mut">المتبقي = المستلم − المصروف − المرتجع. زرار «تصفية» بيسجل رجوع المتبقي للمدير ويصفّر العهدة.</p></div>
 <div class="card"><h2>المصروفات</h2>${T(["التاريخ","على عهدة","النوع","المبلغ","فاتورة",""],srt(S.exp).map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(nm(e.driverId))}</td><td>${esc(e.type)}</td><td>${money(e.amount)}</td><td>${e.invoice?`<button class="btn g s" data-inv="${e.id}">عرض</button>`:'<span class="mut">—</span>'}</td><td>${X("exp",e.id)}</td></tr>`).join(""))}</div>
 <div class="card"><h2>العهدة المستلمة</h2>${T(["التاريخ","المبلغ","ملاحظات",""],srt(S.cus).map(c=>`<tr><td>${esc(c.date)}</td><td>${money(c.amount)}</td><td>${esc(c.note)}</td><td>${X("cus",c.id)}</td></tr>`).join(""))}</div>
 <div class="card"><h2>التوزيعات والمرتجعات</h2>${T(["التاريخ","النوع","السواق","المبلغ","ملاحظات",""],srt([...S.alloc.map(a=>({...a,k:"alloc",t:"توزيع"})),...S.ret.map(r=>({...r,k:"ret",t:"تصفية / مرتجع"}))]).map(a=>`<tr><td>${esc(a.date)}</td><td>${a.t}</td><td>${esc(dName(a.driverId))}</td><td>${money(a.amount)}</td><td>${esc(a.note)}</td><td>${X(a.k,a.id)}</td></tr>`).join(""))}</div>`}


/* ---------- تقرير العدادات ---------- */
let rp={from:"",to:"",vid:""};
const rpOk=x=>x.start!==undefined&&x.end!==undefined&&Number(x.end)>=Number(x.start);
function rpData(){
 const l=S.logs.filter(x=>(!rp.from||x.date>=rp.from)&&(!rp.to||x.date<=rp.to)&&(!rp.vid||x.vehicleId===rp.vid));
 const full=l.filter(rpOk);
 const per=S.vehicles.filter(v=>!rp.vid||v.id===rp.vid).map(v=>{const a=full.filter(x=>x.vehicleId===v.id),k=a.map(x=>x.end-x.start),tot=k.reduce((s,n)=>s+n,0);
  return{v,days:a.length,tot,avg:a.length?tot/a.length:0,max:k.length?Math.max(...k):0,inc:l.filter(x=>x.vehicleId===v.id&&!(x.start!==undefined&&x.end!==undefined)).length}}).sort((a,b)=>b.tot-a.tot);
 return{l,full,per}}
const rpTitle=()=>"تقرير العدادات من "+(rp.from||"البداية")+" إلى "+(rp.to||"النهاية")+(rp.vid?" — "+vName(rp.vid):"");
function rep(){
 const{l,full,per}=rpData(),tot=per.reduce((s,p)=>s+p.tot,0),fa=full.length?tot/full.length:0,mx=Math.max(1,...per.map(p=>p.tot)),top=per.find(p=>p.tot>0),inc=l.length-full.length;
 const dr=v=>esc(dName(v.driverId));
 return`<div class="card"><h2>تقرير العدادات</h2><div class="f"><div><label>من</label><input type="date" data-rp="from" value="${esc(rp.from)}"></div><div><label>إلى</label><input type="date" data-rp="to" value="${esc(rp.to)}"></div><div><label>العربية</label><select data-rp="vid"><option value="">كل العربيات</option>${S.vehicles.map(v=>`<option value="${v.id}" ${v.id===rp.vid?"selected":""}>${esc(v.plate)}</option>`).join("")}</select></div></div>
 <div class="row" style="margin-top:10px"><button class="btn g" data-rpp="1">طباعة / حفظ PDF</button><button class="btn g" data-rpc="1">تصدير CSV</button></div></div>
 ${rp.vid?"":rngH(S.logs.length,l.length,"rep")}<div id="rpt"><div class="grid card"><div class="stat"><b>${money(tot)}</b><small>إجمالي الكيلومترات</small></div><div class="stat"><b>${full.length}</b><small>أيام مكتملة</small></div><div class="stat"><b>${Math.round(fa)}</b><small>متوسط كم / يوم</small></div><div class="stat"><b>${top?esc(top.v.plate):"—"}</b><small>أكتر عربية سير</small></div><div class="stat"><b>${inc}</b><small>أيام ناقصة (صباح أو مساء)</small></div></div>
 <div class="card"><h2>ملخص كل عربية</h2>${T(["العربية","السواق","أيام مكتملة","إجمالي كم","متوسط/يوم","أعلى يوم","أيام ناقصة","العداد الحالي","كم من آخر صيانة","الحالة"],per.map(p=>{const s=sinceSvc(p.v),hi=fa>0&&p.days>0&&p.avg>fa*1.5;return`<tr><td><b>${esc(p.v.plate)}</b></td><td>${dr(p.v)}</td><td>${p.days}</td><td>${money(p.tot)}<div style="background:var(--red);height:5px;border-radius:3px;width:${Math.round(p.tot/mx*100)}%"></div></td><td>${Math.round(p.avg)}</td><td>${p.max}</td><td>${p.inc?`<span class="tag warn">${p.inc}</span>`:0}</td><td>${odo(p.v.id)??"—"}</td><td>${s??"—"}</td><td>${p.days?(hi?'<span class="tag bad">استهلاك عالي</span>':'<span class="tag ok">عادي</span>'):'<span class="tag na">لا بيانات</span>'}</td></tr>`}).join(""))}<p class="mut">"استهلاك عالي" = متوسط العربية أكتر من ١٫٥ ضعف متوسط الأسطول في الفترة دي. الأيام الناقصة مش بتتحسب في الأرقام.</p></div>
 <div class="card"><h2>التفاصيل اليومية</h2>${T(["التاريخ","العربية","السواق","الصباح","المساء","المقطوع"],srt(l).map(x=>{const v=vById(x.vehicleId);return`<tr><td>${esc(x.date)}</td><td>${esc(vName(x.vehicleId))}</td><td>${v?dr(v):"—"}</td><td>${x.start??"—"}</td><td>${x.end??"—"}</td><td>${rpOk(x)?`<b>${x.end-x.start}</b>`:`<span class="tag warn">ناقص ${x.end===undefined?"المساء":x.start===undefined?"الصباح":"(قراءة غلط)"}</span>`}</td></tr>`}).join(""))}</div></div>`}
function rpPrint(){$("#pf").innerHTML="<h3>LRT — "+esc(rpTitle())+"</h3>"+$("#rpt").innerHTML;window.print()}
function rpCsv(){
 const{l}=rpData(),cell=c=>{let s=String(c??"");if(/^[=+\-@]/.test(s))s="'"+s;return'"'+s.replace(/"/g,'""')+'"'};
 const rows=[["التاريخ","العربية","السواق","الصباح","المساء","المقطوع"],...srt(l).map(x=>{const v=vById(x.vehicleId);return[x.date,vName(x.vehicleId),v?dName(v.driverId):"",x.start??"",x.end??"",rpOk(x)?x.end-x.start:""]})];
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+rows.map(r=>r.map(cell).join(",")).join("\n")],{type:"text/csv;charset=utf-8"}));a.download="km-report.csv";document.body.appendChild(a);a.click();a.remove()}


/* ---------- تنقلات + تقارير + Excel ---------- */
const rngH=(all,shown,n)=>all>shown?`<div class="al">فيه ${all-shown} سجل تاني متسجل بس خارج الفترة المحددة <button class="btn g s" data-rgall="${n}">اعرض كل الفترات</button></div>`:"";
const rng=(n,g,all,shown)=>rngH(all,shown,n)+`<div class="card"><div class="f"><div><label>من</label><input type="date" data-rg="${n}.from" value="${esc(g.from)}"></div><div><label>إلى</label><input type="date" data-rg="${n}.to" value="${esc(g.to)}"></div></div></div>`;
const inR=(g,x)=>(!g.from||x.date>=g.from)&&(!g.to||x.date<=g.to);
function tForm(t){form(t?"تعديل تنقل":"تسجيل تنقل",[["date","التاريخ","date"],["driverId","السواق","select",dOpts()],["vehicleId","العربية","select",vOpts()],["dest","الوجهة / خط التنقل"],["days","عدد الأيام","number"],["amount","قيمة البدل (جنيه)","number"],["paid","حالة البدل","select",[["paid","تم الصرف"],["pending","لم يُصرف بعد"]]],["notes","ملاحظات","area"]],t||{date:today(),days:1,paid:"pending"},async d=>{if(!d.driverId)return alert("اختار السواق");await save("trips",t&&t.id,d)})}
function weekSet(n){const x=new Date(),df=(x.getDay()+1)%7,s=new Date(x.getTime()-(df+7*n)*864e5),e=new Date(s.getTime()+6*864e5),f=d=>d.toISOString().slice(0,10);G.trp.from=f(s);G.trp.to=f(e);render()}
function trp(){
 const g=G.trp,l=S.trips.filter(t=>inR(g,t)),by=S.drivers.map(d=>[d,l.filter(t=>t.driverId===d.id)]).filter(x=>x[1].length).sort((a,b)=>b[1].length-a[1].length);
 const tot=sum(l,t=>t.amount),pend=sum(l.filter(t=>t.paid!=="paid"),t=>t.amount);
 return`<div class="row">${ADM?'<button class="btn" data-add="trip">+ تسجيل تنقل</button>':""}<button class="btn g" data-wk="0">الأسبوع ده</button><button class="btn g" data-wk="1">الأسبوع اللي فات</button></div>`+rng("trp",g,S.trips.length,l.length)+
 `<div class="grid card"><div class="stat"><b>${l.length}</b><small>عدد التنقلات</small></div><div class="stat"><b>${by.length}</b><small>سواقين اتنقلوا</small></div>${ADM?`<div class="stat"><b>${money(tot)}</b><small>إجمالي البدلات</small></div><div class="stat"><b>${money(pend)}</b><small>لسه ما اتصرفش</small></div>`:""}</div>
 <div class="card"><h2>ملخص السواقين</h2>${T(["السواق","عدد التنقلات","الأيام"].concat(ADM?["إجمالي البدل","المصروف","المتبقي"]:[]),by.map(([d,t])=>{const a=sum(t,x=>x.amount),p=sum(t.filter(x=>x.paid==="paid"),x=>x.amount);return`<tr><td><b>${esc(d.name)}</b></td><td>${t.length}</td><td>${sum(t,x=>x.days||1)}</td>${ADM?`<td>${money(a)}</td><td>${money(p)}</td><td>${money(a-p)}</td>`:""}</tr>`}).join(""))}</div>
 <div class="card"><h2>التفاصيل</h2>${T(["التاريخ","السواق","العربية","الوجهة","أيام"].concat(ADM?["البدل","الحالة",""]:[]),srt(l).map(t=>`<tr><td>${esc(t.date)}</td><td>${esc(dName(t.driverId))}</td><td>${esc(vName(t.vehicleId))}</td><td>${esc(t.dest)}</td><td>${t.days||1}</td>${ADM?`<td>${money(t.amount)}</td><td>${t.paid==="paid"?'<span class="tag ok">تم الصرف</span>':'<span class="tag warn">لم يصرف</span>'}</td><td>${act("trips",t.id)}</td>`:""}</tr>`).join(""))}</div>`}
function ren(){
 const rows=S.vehicles.map(v=>{const a=dleft(insExp(v)),b=dleft(taxExp(v));return{v,a,b,s:sinceSvc(v),ev:Number(v.svcEvery||10000),m:Math.min(a??1e9,b??1e9)}}).sort((x,y)=>x.m-y.m);
 return`<div class="card"><h2>التجديدات والصيانة</h2>${T(["العربية","السواق","التأمين","الضرايب","الصيانة (كم من آخر صيانة)"],rows.map(r=>`<tr><td><b>${esc(r.v.plate)}</b></td><td>${esc(dName(r.v.driverId))}</td><td>${st(r.a)} <small class="mut">${insExp(r.v)}</small></td><td>${st(r.b)} <small class="mut">${taxExp(r.v)}</small></td><td>${r.s===null?'<span class="tag na">لا عدادات</span>':r.s>=r.ev?`<span class="tag bad">مطلوبة (${r.s})</span>`:r.s>=r.ev*.9?`<span class="tag warn">قربت (${r.s})</span>`:`<span class="tag ok">${r.s}</span>`}</td></tr>`).join(""))}</div>`}
function frep(){
 const g=G.frep,l=S.fines.filter(f=>inR(g,f)),by=S.drivers.map(d=>[d,l.filter(f=>f.driverId===d.id)]).filter(x=>x[1].length).sort((a,b)=>b[1].length-a[1].length);
 return rng("frep",g,S.fines.length,l.length)+`<div class="card"><h2>المخالفات لكل سواق</h2>${T(["السواق","العدد"].concat(ADM?["الإجمالي"]:[]),by.map(([d,f])=>`<tr><td><b>${esc(d.name)}</b></td><td>${f.length}</td>${ADM?`<td>${money(sum(f,x=>x.amount))}</td>`:""}</tr>`).join(""))}</div><div class="card"><h2>التفاصيل (${l.length})</h2>${T(["التاريخ","السواق","العربية","النوع"],srt(l).map(f=>`<tr><td>${esc(f.date)}</td><td>${esc(dName(f.driverId))}</td><td>${esc(vName(f.vehicleId))}</td><td>${esc(f.type)}</td></tr>`).join(""))}</div>`}

const SH={
 "السواقين":{f:{"الاسم":"name","المنطقة":"area","التليفون":"phone","رقم الرخصة":"licNo","انتهاء الرخصة":"licExp"}},
 "العربيات":{f:{"رقم العربية":"plate","النوع":"model","السواق":"driver","بداية التأمين":"insStart","مدة التأمين (شهور)":"insMonths","بداية الضرايب":"taxStart","مدة الضرايب (شهور)":"taxMonths","عداد آخر صيانة":"lastSvcKm","الصيانة كل (كم)":"svcEvery"}},
 "المخالفات":{f:{"التاريخ":"date","السواق":"driver","رقم العربية":"plate","النوع":"type","المبلغ":"amount","ملاحظات":"notes"}},
 "العدادات":{f:{"التاريخ":"date","رقم العربية":"plate","الصباح":"start","المساء":"end"}},
 "التنقلات":{f:{"التاريخ":"date","السواق":"driver","رقم العربية":"plate","الوجهة":"dest","عدد الأيام":"days","البدل":"amount","حالة البدل":"paid","ملاحظات":"notes"}},
 "العهدة":{f:{"النوع":"kind","التاريخ":"date","المبلغ":"amount","السواق":"driver","البيان":"note"}}};
const DT=new Set(["date","insStart","taxStart","licExp"]),STR=new Set(["plate","driver","name","licNo","phone","kind"]);
const xd=v=>{if(v instanceof Date){const w=new Date(v.getTime()+108e5),p=n=>String(n).padStart(2,"0");return w.getFullYear()+"-"+p(w.getMonth()+1)+"-"+p(w.getDate())}if(typeof v==="number"&&v>20000)return new Date(Math.round((v-25569)*864e5)).toISOString().slice(0,10);return String(v).trim().slice(0,10)};
let XL=null;
function mapRow(sp,r){const o={};for(const[h,k]of Object.entries(sp.f)){let v=r[h];if(v===""||v==null)continue;v=DT.has(k)?xd(v):v instanceof Date?xd(v):STR.has(k)?String(v).trim():v;o[k]=v}return o}
async function xlRead(f){if(!f)return;try{const wb=XLSX.read(await f.arrayBuffer(),{type:"array",cellDates:true});XL={};
 for(const[n,sp]of Object.entries(SH)){const ws=wb.Sheets[n];if(!ws)continue;XL[n]=XLSX.utils.sheet_to_json(ws,{defval:""}).filter(r=>Object.values(r).some(v=>String(v).trim()!=="")).map(r=>mapRow(sp,r))}}catch(e){XL=null;alert("الملف مش مقروء: "+e.message)}render()}
function xlNS(){return[new Set([...S.drivers.map(d=>d.name),...(XL["السواقين"]||[]).map(r=>r.name)]),new Set([...S.vehicles.map(v=>v.plate),...(XL["العربيات"]||[]).map(r=>r.plate)])]}
function xlChk(n,r,N,P){
 if(n==="السواقين"&&!r.name)return"الاسم ناقص";if(n==="العربيات"&&!r.plate)return"رقم العربية ناقص";
 if(r.driver&&!N.has(r.driver))return`السواق "${r.driver}" مش موجود`;
 if(n!=="العربيات"&&n!=="السواقين"&&r.plate&&!P.has(r.plate))return`العربية "${r.plate}" مش موجودة`;
 if(n==="العدادات"&&(!r.plate||!r.date))return"العربية أو التاريخ ناقص";
 if(n==="العهدة"){if(!["استلام","توزيع","مصروف","تصفية"].includes(r.kind))return"النوع لازم يكون استلام أو توزيع أو مصروف أو تصفية";if((r.kind==="توزيع"||r.kind==="تصفية")&&!r.driver)return"السواق ناقص"}
 return""}
function xlSummary(){const[N,P]=xlNS(),w=[];Object.entries(XL).forEach(([n,rows])=>rows.forEach((r,i)=>{const m=xlChk(n,r,N,P);if(m)w.push(n+" – صف "+(i+2)+": "+m)}));
 if(!Object.keys(XL).length)return'<div class="card">الملف مفيهوش أي ورقة بالأسماء المطلوبة. استخدم القالب.</div>';
 return`<div class="card"><h2>مراجعة قبل الاستيراد</h2>${T(["الورقة","عدد الصفوف"],Object.entries(XL).map(([n,r])=>`<tr><td>${esc(n)}</td><td>${r.length}</td></tr>`).join(""))}${w.length?`<h3>تنبيهات (الصفوف دي هتتخطى)</h3>${w.slice(0,30).map(x=>`<div class="al">${esc(x)}</div>`).join("")}${w.length>30?`<p class="mut">و ${w.length-30} تنبيه تاني…</p>`:""}`:""}<div class="row" style="margin-top:12px"><button class="btn" data-xc="1">تأكيد الاستيراد</button></div></div>`}
function imp(){return`<div class="card"><h2>رفع البيانات من Excel</h2><ol class="mut"><li>نزّل القالب واملا الأوراق اللي محتاجها (ورقة لكل نوع بيانات).</li><li>ارفع الملف وراجع الملخص والتنبيهات.</li><li>اضغط «تأكيد الاستيراد». السواقين والعربيات الموجودين بيتحدّثوا، والباقي بيتضاف، والمكرر بيتخطّى.</li></ol><div class="row"><button class="btn" data-xt="1">تحميل قالب Excel</button><input type="file" id="xf" accept=".xlsx,.xls" style="max-width:320px"></div></div>${XL?xlSummary():""}`}
function xlTemplate(){const wb=XLSX.utils.book_new();
 wb.Workbook={Views:[{RTL:true}]};
 for(const[n,sp]of Object.entries(SH))XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([Object.keys(sp.f)]),n);
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["تعليمات"],["املا الأوراق اللي محتاجها وسيب الباقي فاضي، ومتغيرش أسماء الأوراق ولا عناوين الأعمدة."],["التواريخ بصيغة 2026-11-03 أو تاريخ Excel عادي."],["اسم السواق ورقم العربية لازم يتكتبوا بنفس الشكل الموجود في ورقتي السواقين والعربيات."],["ورقة العهدة: النوع = استلام أو توزيع أو مصروف أو تصفية. (السواق مطلوب في التوزيع والتصفية، ولو المصروف من عهدة المدير سيب السواق فاضي)."],["ورقة العدادات: ممكن صف للصباح وصف للمساء لنفس العربية والتاريخ، أو الاتنين في صف واحد."],["ورقة التنقلات: حالة البدل = تم الصرف أو لم يصرف."]]),"تعليمات");
 XLSX.writeFile(wb,"LRT-data-template.xlsx")}
const sig=o=>JSON.stringify(Object.entries(o).filter(([k])=>k!=="id").sort(([a],[b])=>a<b?-1:1).map(([k,v])=>[k,String(v)]));
async function xlCommit(){
 if(!XL||!confirm("تأكيد استيراد البيانات؟"))return;
 let ins=0,upd=0,skip=0;const strip=o=>{const{id,...r}=o;return r},[N,P0]=xlNS();
 const rows=n=>(XL[n]||[]).filter(r=>{if(xlChk(n,r,N,P0)){skip++;return false}return true});
 const put=async(coll,items)=>{const add=[];for(const it of items){if(it.id){const{error}=await sb.from("records").update({data:it.data}).eq("id",it.id);if(error)throw error;upd++}else add.push({coll,data:it.data})}
  for(let i=0;i<add.length;i+=100){const{data,error}=await sb.from("records").insert(add.slice(i,i+100)).select();if(error)throw error;data.forEach(applyRow);ins+=data.length}};
 const dedupe=(coll,list)=>{const seen=new Set(S[K[coll]].map(sig));return list.filter(x=>{const s=sig(x);if(seen.has(s)){skip++;return false}seen.add(s);return true}).map(data=>({data}))};
 try{
  await put("drivers",rows("السواقين").map(r=>{const e=S.drivers.find(d=>d.name===r.name);return e?{id:e.id,data:{...strip(e),...r}}:{data:r}}));
  const D=Object.fromEntries(S.drivers.map(d=>[d.name,d.id]));
  await put("vehicles",rows("العربيات").map(r=>{const{driver,...x}=r;if(driver)x.driverId=D[driver];const e=S.vehicles.find(v=>v.plate===x.plate);return e?{id:e.id,data:{...strip(e),...x}}:{data:x}}));
  const P=Object.fromEntries(S.vehicles.map(v=>[v.plate,v.id])),res=r=>{const{driver,plate,...x}=r;if(driver)x.driverId=D[driver];if(plate)x.vehicleId=P[plate];return x};
  await put("fines",dedupe("fines",rows("المخالفات").map(res)));
  await put("trips",dedupe("trips",rows("التنقلات").map(r=>{const x=res(r);x.paid=/^تم/.test(String(x.paid||""))?"paid":"pending";return x})));
  const mp=new Map(),items=[];
  for(const r of rows("العدادات")){const x=res(r),key=x.vehicleId+"|"+x.date;let it=mp.get(key);if(!it){const e=S.logs.find(l=>l.vehicleId===x.vehicleId&&l.date===x.date);it=e?{id:e.id,data:strip(e)}:{data:{}};mp.set(key,it);items.push(it)}Object.assign(it.data,x)}
  await put("kmlogs",items);
  const ck={"استلام":"cus","توزيع":"alloc","مصروف":"exp","تصفية":"ret"},cl={cus:[],alloc:[],exp:[],ret:[]};
  rows("العهدة").forEach(r=>{const{kind,driver,note,...x}=r,k=ck[kind];if(driver)x.driverId=D[driver];if(k==="exp")x.type=note||"";else x.note=note||"";cl[k].push(x)});
  for(const k of Object.keys(cl))await put(C[k],dedupe(C[k],cl[k]));
  alert(`تم الاستيراد: ${ins} جديد، ${upd} اتحدّث، ${skip} اتخطّى`);XL=null;render()
 }catch(e){console.error(e);alert("حصل خطأ أثناء الاستيراد: "+(e.message||e)+"\nجزء من البيانات ممكن يكون اتحفظ، راجع الصفحات.")}}

start();
