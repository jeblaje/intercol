const form = document.querySelector("#notificationForm");
const formStatus = document.querySelector("#formStatus");
const alertSetupStatus = document.querySelector("#alertSetupStatus");
const saveButton = document.querySelector("#saveButton");
const cancelEditButton = document.querySelector("#cancelEdit");
const alertPermissionButton = document.querySelector("#enableAlerts");
const dateInput = form.elements.notificationDate;
const firebase = window.parent.INTERCOL_FIREBASE;
let records = [];
let activeTab = "pending";
let advisor = null;
let stopSync = null;
let busy = false;
let pendingOpenInvoiceId = null;
function dateKey(date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function todayKey() { return dateKey(new Date()); }
function defaultDateTime() { const value = new Date(); value.setMinutes(value.getMinutes() + 5); value.setSeconds(0,0); return dateKey(value) + "T" + String(value.getHours()).padStart(2,"0") + ":" + String(value.getMinutes()).padStart(2,"0"); }
function recordDay(value) { return String(value || "").slice(0,10); }
function reminderTime(value) { const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value + "T09:00" : value; return new Date(normalized).getTime(); }
function formatDate(value, options = { day:"numeric", month:"long" }) { const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value); const date = new Date(isDateOnly ? value + "T12:00:00" : value); return date.toLocaleDateString("es-CO", options); }
function displaySchedule(record, status) { const label = formatDate(record.notificationDate, { day:"numeric", month:"short", year:"numeric", hour:"numeric", minute:"2-digit" }); if (status === "today") return "Hoy · " + label.split(", ").slice(-1)[0]; if (status === "overdue") return "Pendiente · " + label; return label; }
function reportError(error) { console.error("Error en generación de facturas:", error); formStatus.textContent = error.code === "permission-denied" ? "Firebase bloqueó esta operación. Confirma las reglas de Firestore y que estés usando tu cuenta." : "No se pudo guardar/cargar. Revisa tu conexión e inténtalo de nuevo."; }
function normalizeRecord(item) { return { id:item.id, customerName:String(item.nombre || ""), customerId:String(item.cedula || ""), notificationDate:String(item.fechaNotificacion || ""), paymentDay:item.diaPago ? Number(item.diaPago) : null, reviewed:Boolean(item.revisado), reviewedAt:item.revisadoEn?.toDate ? item.revisadoEn.toDate().toISOString() : item.revisadoEn || "" }; }
function resetForm() { form.reset(); form.elements.recordId.value=""; dateInput.value=defaultDateTime(); saveButton.textContent="Agregar verificación"; cancelEditButton.hidden=true; document.querySelector("#formTitle").textContent="Nueva factura por verificar"; }
function beginEdit(record) { form.elements.recordId.value=record.id; form.elements.customerName.value=record.customerName; form.elements.customerId.value=record.customerId; dateInput.value=/^\d{4}-\d{2}-\d{2}$/.test(record.notificationDate) ? record.notificationDate + "T09:00" : record.notificationDate; saveButton.textContent="Guardar cambios"; cancelEditButton.hidden=false; document.querySelector("#formTitle").textContent="Editar verificación"; formStatus.textContent="Editando a " + record.customerName + "."; form.elements.customerName.focus(); window.scrollTo({top:0,behavior:"smooth"}); }
function node(tag,className,text) { const element=document.createElement(tag); if(className)element.className=className; if(text!==undefined)element.textContent=text; return element; }
function makeRecordCard(record,status) {
  const card=node("article","record-card"+(status==="today"?" is-today":"")+(status==="overdue"?" is-overdue":""));
  card.dataset.recordId = record.id;
  const main=node("div","record-main"), nameRow=node("div","record-name-row");
  nameRow.append(node("strong","record-name",record.customerName));
  nameRow.append(node("span","record-date",displaySchedule(record,status)));
  main.append(nameRow,node("div","record-id","Cédula: "+record.customerId+(record.paymentDay?" · Pago día "+record.paymentDay+" · aviso 10 días antes":"")));
  const actions=node("div","record-actions");
  const review=node("button","record-action "+(status==="reviewed"?"":"complete"),status==="reviewed"?"Volver a pendientes":"Marcar verificada"); review.type="button"; review.addEventListener("click",()=>changeReviewed(record.id,status!=="reviewed")); actions.append(review);
  const invoice=node("a","record-action invoice-link","Revisar factura"); invoice.href="http://wisphub.net/clientes/ver/"+encodeURIComponent(record.customerId)+"@cibercitywisp/#retab3"; invoice.target="_blank"; invoice.rel="noopener noreferrer";
  const edit=node("button","record-action","Editar"); edit.type="button"; edit.addEventListener("click",()=>beginEdit(record));
  const remove=node("button","record-action delete","Eliminar"); remove.type="button"; remove.addEventListener("click",()=>deleteRecord(record));
  actions.append(invoice,edit,remove); card.append(main,actions); return card;
}
function renderGroup(listId,emptyId,rows,status) { const list=document.querySelector("#"+listId); list.replaceChildren(); rows.forEach(record=>list.append(makeRecordCard(record,status))); if(emptyId)document.querySelector("#"+emptyId).hidden=rows.length>0; }
function setCount(id,value) { document.querySelector("#"+id).textContent=String(value); }
function render() {
  const today=todayKey(), now=Date.now(), pending=records.filter(record=>!record.reviewed);
  const reviewed=records.filter(record=>record.reviewed).sort((a,b)=>(b.reviewedAt||"").localeCompare(a.reviewedAt||""));
  const dueToday=pending.filter(record=>recordDay(record.notificationDate)===today).sort((a,b)=>reminderTime(a.notificationDate)-reminderTime(b.notificationDate));
  const overdue=pending.filter(record=>reminderTime(record.notificationDate)<now && recordDay(record.notificationDate)<today).sort((a,b)=>reminderTime(a.notificationDate)-reminderTime(b.notificationDate));
  const upcoming=pending.filter(record=>recordDay(record.notificationDate)>today || (recordDay(record.notificationDate)===today && reminderTime(record.notificationDate)>now)).sort((a,b)=>reminderTime(a.notificationDate)-reminderTime(b.notificationDate));
  const todayText=new Date().toLocaleDateString("es-CO",{weekday:"long",day:"numeric",month:"long"});
  document.querySelector("#todayDate").textContent=todayText; document.querySelector("#todayLabel").textContent="Verificaciones del "+todayText+".";
  [["todayCount",dueToday.length],["upcomingCount",upcoming.length],["reviewedCount",reviewed.length],["pendingTabCount",pending.length],["reviewedTabCount",reviewed.length],["todayGroupCount",dueToday.length],["overdueGroupCount",overdue.length],["upcomingGroupCount",upcoming.length],["reviewedGroupCount",reviewed.length]].forEach(([id,value])=>setCount(id,value));
  const alert=document.querySelector("#todayAlert"), dueCount=dueToday.length+overdue.length; alert.hidden=dueCount===0;
  if(dueCount){document.querySelector("#alertTitle").textContent=dueToday.length?dueToday.length+" factura"+(dueToday.length===1?"":"s")+" para verificar hoy":"Tienes verificaciones pendientes";document.querySelector("#alertText").textContent=overdue.length?overdue.length+" pendiente"+(overdue.length===1?"":"s")+" de fechas anteriores.":"Revisa si se generó cada factura y márcala como verificada.";}
  document.querySelector("#overdueGroup").hidden=overdue.length===0;
  renderGroup("todayList","todayEmpty",dueToday,"today"); renderGroup("overdueList",null,overdue,"overdue"); renderGroup("upcomingList","upcomingEmpty",upcoming,"upcoming"); renderGroup("reviewedList","reviewedEmpty",reviewed,"reviewed");
  document.querySelector("#pendingPanel").hidden=activeTab!=="pending"; document.querySelector("#reviewedPanel").hidden=activeTab!=="reviewed";
  document.querySelectorAll("[data-tab]").forEach(button=>{const active=button.dataset.tab===activeTab;button.classList.toggle("active",active);button.setAttribute("aria-selected",String(active));});
  window.parent.postMessage({type:"INTERCOL_SECTION_RESIZE",height:document.documentElement.scrollHeight},"*");
  scrollToPendingInvoice();
}
function fireDueAlerts() { window.parent.postMessage({type:"INTERCOL_CHECK_INVOICE_ALERTS"},"*"); }
function scrollToPendingInvoice() {
  if(!pendingOpenInvoiceId) return;
  const card=Array.from(document.querySelectorAll("[data-record-id]")).find(item=>item.dataset.recordId===pendingOpenInvoiceId);
  if(!card) return;
  card.scrollIntoView({behavior:"smooth",block:"center"});
  card.classList.add("invoice-jump-target");
  window.setTimeout(()=>card.classList.remove("invoice-jump-target"),2500);
  pendingOpenInvoiceId=null;
}
function updatePermissionButton() {
  if(!("Notification" in window)){alertPermissionButton.textContent="Alertas no disponibles";alertPermissionButton.disabled=true;return;}
  if(Notification.permission==="granted"){alertPermissionButton.textContent="Alertas activadas";alertPermissionButton.classList.add("alerts-enabled");}
  else if(Notification.permission==="denied"){alertPermissionButton.textContent="Permite alertas en el navegador";alertPermissionButton.classList.remove("alerts-enabled");}
  else {alertPermissionButton.textContent="Activar alertas";alertPermissionButton.classList.remove("alerts-enabled");}
}
function askForAlerts() {
  if(!("Notification" in window)){alertSetupStatus.textContent="Este navegador no admite notificaciones.";return;}
  if(Notification.permission==="denied"){alertSetupStatus.textContent="Las alertas están bloqueadas. Permítelas desde el icono de ajustes/candado junto a la dirección del sitio.";return;}
  window.parent.postMessage({type:"INTERCOL_REQUEST_NOTIFICATIONS"},"*");
}
async function changeReviewed(id,reviewed){try{setBusy(true);await firebase.setPaymentNotificationReviewed(id,reviewed,advisor.asesor);formStatus.textContent=reviewed?"Factura marcada como verificada.":"Factura devuelta a pendientes.";}catch(error){reportError(error);}finally{setBusy(false);}}
async function deleteRecord(record){if(!window.confirm("¿Eliminar la verificación de "+record.customerName+"?"))return;try{setBusy(true);await firebase.deletePaymentNotification(record.id);formStatus.textContent="Verificación eliminada.";if(form.elements.recordId.value===record.id)resetForm();}catch(error){reportError(error);}finally{setBusy(false);}}
function setBusy(value){busy=value;saveButton.disabled=value;}
form.addEventListener("submit",async event=>{
  event.preventDefault();if(!advisor||busy)return;
  const recordId=form.elements.recordId.value,customerName=form.elements.customerName.value.trim(),customerId=form.elements.customerId.value.trim(),notificationDate=dateInput.value;
  if(!customerName||!customerId||!notificationDate){formStatus.textContent="Completa el nombre, la cédula y la fecha y hora.";return;}
  if(reminderTime(notificationDate)<=Date.now()){formStatus.textContent="Elige una hora futura para recibir la alerta.";return;}
  if(records.some(row=>row.id!==recordId&&row.customerId.toLowerCase()===customerId.toLowerCase()&&row.notificationDate===notificationDate&&!row.reviewed)){formStatus.textContent="Ya existe una verificación pendiente para esa cédula y fecha y hora.";return;}
  try{setBusy(true);if(recordId){await firebase.updatePaymentNotification(recordId,{customerName,customerId,notificationDate});formStatus.textContent="Verificación actualizada.";}else{await firebase.createPaymentNotification({customerName,customerId,notificationDate,advisorUid:advisor.uid,advisorName:advisor.asesor});formStatus.textContent="Verificación agregada.";}resetForm();}catch(error){reportError(error);}finally{setBusy(false);}
});
cancelEditButton.addEventListener("click",()=>{resetForm();formStatus.textContent="";});
alertPermissionButton.addEventListener("click",askForAlerts);
document.querySelectorAll("[data-tab]").forEach(button=>button.addEventListener("click",()=>{activeTab=button.dataset.tab;render();}));
window.addEventListener("message",event=>{
  if(event.data?.type==="INTERCOL_OPEN_INVOICE"){pendingOpenInvoiceId=String(event.data.id||"");scrollToPendingInvoice();}
  if(event.data?.type==="INTERCOL_THEME"){document.documentElement.dataset.theme=event.data.theme;Object.entries(event.data.variables||{}).forEach(([key,value])=>document.documentElement.style.setProperty(key,value));}
  if(event.data?.type==="INTERCOL_AUTH_STATE"){
    if(stopSync){stopSync();stopSync=null;} advisor=event.data.user&&event.data.profile?{uid:event.data.user.uid,asesor:event.data.profile.asesor}:null;records=[];
    if(!advisor){formStatus.textContent="Inicia sesión para cargar tus verificaciones.";render();return;}
    formStatus.textContent="Cargando tus verificaciones…";
    stopSync=firebase.subscribePaymentNotifications(advisor.uid,items=>{records=items.map(normalizeRecord);formStatus.textContent="";render();fireDueAlerts();},reportError);
  }
  if(event.data?.type==="INTERCOL_NOTIFICATIONS_PERMISSION"){
    if(event.data.permission==="granted"){alertSetupStatus.textContent="Alertas activadas. Mantén INTERCOL abierto para recibirlas.";fireDueAlerts();}
    else alertSetupStatus.textContent=event.data.permission==="denied"?"El navegador bloqueó las alertas. Permítelas desde sus ajustes.":"No se activaron las alertas.";
    updatePermissionButton();
  }
});
window.parent.postMessage({type:"INTERCOL_SECTION_READY"},"*");
dateInput.value=defaultDateTime();updatePermissionButton();render();
window.setInterval(()=>{render();fireDueAlerts();},15000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden){render();fireDueAlerts();}});

