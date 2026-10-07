const CEDULA_DRAFT_KEY = "intercol_utilidad_cedula_v1";
const PRICE_DRAFT_KEY = "intercol_utilidad_precio_v1";
const RECORD_DRAFT_KEY = "intercol_utilidad_registro_gestion_v1";
const cedulaInput = document.querySelector("#cedulaInput");
const cedulaOutput = document.querySelector("#cedulaOutput");
const cedulaCount = document.querySelector("#cedulaCount");
const cedulaStatus = document.querySelector("#cedulaStatus");
const priceInput = document.querySelector("#priceInput");
const priceOutput = document.querySelector("#priceOutput");
const priceStatus = document.querySelector("#priceStatus");

function saveDraft(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Storage can be unavailable in private browsing. */ }
}

function formatCedula() {
  const digits = cedulaInput.value.replace(/\D/g, "");
  cedulaOutput.value = digits;
  cedulaCount.textContent = `${digits.length} ${digits.length === 1 ? "dígito" : "dígitos"}`;
  saveDraft(CEDULA_DRAFT_KEY, cedulaInput.value);
}

function parseWholePrice(raw) {
  let value = String(raw).trim();
  if (!value) return null;

  const comma = value.lastIndexOf(",");
  if (comma >= 0 && /^\d{1,2}$/.test(value.slice(comma + 1).trim())) {
    value = value.slice(0, comma);
  } else {
    const parts = value.split(".");
    if (parts.length > 1 && /^\d{1,2}$/.test(parts.at(-1).trim())) value = parts.slice(0, -1).join("");
  }

  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const number = Number(digits);
  return Number.isSafeInteger(number) ? number : null;
}

function formatPrice() {
  const number = parseWholePrice(priceInput.value);
  priceOutput.value = number === null ? "" : `$${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(number)}`;
  saveDraft(PRICE_DRAFT_KEY, priceInput.value);
}

async function copyValue(output, status) {
  if (!output.value) {
    status.textContent = "No hay un resultado para copiar.";
    return;
  }
  try {
    await navigator.clipboard.writeText(output.value);
    status.textContent = "Copiado.";
  } catch {
    output.focus();
    output.select();
    status.textContent = "Resultado seleccionado; cópialo con Ctrl+C.";
  }
}

cedulaInput.addEventListener("input", formatCedula);
priceInput.addEventListener("input", formatPrice);
document.querySelector("#copyCedula").addEventListener("click", () => copyValue(cedulaOutput, cedulaStatus));
document.querySelector("#copyPrice").addEventListener("click", () => copyValue(priceOutput, priceStatus));

document.querySelector("#clearCedula").addEventListener("click", () => {
  cedulaInput.value = "";
  formatCedula();
  cedulaStatus.textContent = "Campo limpiado.";
});
document.querySelector("#clearPrice").addEventListener("click", () => {
  priceInput.value = "";
  formatPrice();
  priceStatus.textContent = "Campo limpiado.";
});

const recordType = document.querySelector("#recordType");
const planFields = document.querySelector("#planFields");
const reconnectionFields = document.querySelector("#reconnectionFields");
const creditFields = document.querySelector("#creditFields");
const holderFields = document.querySelector("#holderFields");
const paymentDateFields = document.querySelector("#paymentDateFields");
const recordDate = document.querySelector("#recordDate");
const recordOutput = document.querySelector("#recordOutput");
const recordStatus = document.querySelector("#recordStatus");
const recordControls = [
  "recordType", "planName", "planPrice", "planTechnician", "planAdvisor", "paysMonth",
  "paysAdjustment", "reconnectionCustomerName", "reconnectionCustomerId", "reconnectionTechnician", "paymentDay", "reconnectionAdvisor",
  "invoiceNumber", "waitingDay", "creditAdvisor", "oldHolder", "newHolder", "holderAdvisor",
  "newPaymentDay", "paymentDateAdvisor"
].map(id => document.getElementById(id));
const planCatalog = {
  general: [
    { name: "900 MB + TV", price: 102800, group: "Internet más TV" },
    { name: "500 MB + TV", price: 82800, group: "Internet más TV" },
    { name: "300 MB + TV", price: 72800, group: "Internet más TV" },
    { name: "100 MB + TV", price: 62800, group: "Internet más TV" },
    { name: "900 MB solo internet", price: 92800, group: "Solo Internet" },
    { name: "600 MB solo internet", price: 72800, group: "Solo Internet" },
    { name: "300 MB solo internet", price: 62800, group: "Solo Internet" },
    { name: "100 MB solo internet", price: 52800, group: "Solo Internet" }
  ],
  special: [
    { name: "900 MB + TV", price: 92800, group: "Internet + TV" },
    { name: "500 MB + TV", price: 72800, group: "Internet + TV" },
    { name: "300 MB + TV", price: 62800, group: "Internet + TV" },
    { name: "100 MB + TV", price: 52800, group: "Internet + TV" },
    { name: "900 MB solo internet", price: 82800, group: "Solo Internet" },
    { name: "600 MB solo internet", price: 72800, group: "Solo Internet" },
    { name: "400 MB solo internet", price: 62800, group: "Solo Internet" },
    { name: "200 MB solo internet", price: 52800, group: "Solo Internet" }
  ]
};

function renderPlanOptions() {
  const selectedName = document.querySelector("#planName").value;
  const selectedPrice = document.querySelector("#planPrice").value;
  for (const [groupName, plans] of Object.entries(planCatalog)) {
    const container = document.querySelector(groupName === "general" ? "#generalPlanChoices" : "#specialPlanChoices");
    container.innerHTML = plans.map((plan, index) => {
      const id = `${groupName}-${index}`;
      const selected = selectedName === plan.name && Number(selectedPrice) === plan.price && document.querySelector("#planName").dataset.selectedPlanId === id;
      return `<button type="button" class="plan-option ${selected ? "selected" : ""}" data-plan-group="${groupName}" data-plan-index="${index}" aria-pressed="${selected}"><span>${plan.group}</span><strong>${plan.name}</strong><span>${formattedInteger(plan.price)} mensual</span></button>`;
    }).join("");
    container.querySelectorAll("[data-plan-index]").forEach(button => button.addEventListener("click", () => {
      const chosen = planCatalog[button.dataset.planGroup][Number(button.dataset.planIndex)];
      document.querySelector("#planName").value = chosen.name;
      document.querySelector("#planName").dataset.selectedPlanId = `${button.dataset.planGroup}-${button.dataset.planIndex}`;
      document.querySelector("#planPrice").value = String(chosen.price);
      document.querySelector("#selectedPlanText").innerHTML = `Seleccionado: <strong>${chosen.group} · ${chosen.name} · ${formattedInteger(chosen.price)} mensual</strong>`;
      renderPlanOptions();
      renderRecord();
    }));
  }
  const chosenId = document.querySelector("#planName").dataset.selectedPlanId;
  const chosen = chosenId?.startsWith("general-")
    ? planCatalog.general[Number(chosenId.split("-")[1])]
    : chosenId?.startsWith("special-") ? planCatalog.special[Number(chosenId.split("-")[1])] : null;
  document.querySelector("#selectedPlanText").innerHTML = chosen
    ? `Seleccionado: <strong>${chosen.group} · ${chosen.name} · ${formattedInteger(chosen.price)} mensual</strong>`
    : "Selecciona un plan";
}

function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function displayDate(value) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formattedInteger(raw) {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  const number = Number(digits);
  return Number.isSafeInteger(number) ? new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(number) : "";
}

function saveRecordDraft() {
  try {
    const values = Object.fromEntries(recordControls.map(control => [
      control.id, control.type === "checkbox" ? control.checked : control.value
    ]));
    values.planId = document.querySelector("#planName").dataset.selectedPlanId || "";
    localStorage.setItem(RECORD_DRAFT_KEY, JSON.stringify(values));
  } catch { /* Storage can be unavailable in private browsing. */ }
}

function renderRecord() {
  const isReconnection = recordType.value === "reconnection";
  const isCredit = recordType.value === "credit";
  const isHolderChange = recordType.value === "holder";
  const isPaymentDateChange = recordType.value === "paymentdate";
  planFields.hidden = isReconnection || isCredit || isHolderChange || isPaymentDateChange;
  reconnectionFields.hidden = !isReconnection;
  creditFields.hidden = !isCredit;
  holderFields.hidden = !isHolderChange;
  paymentDateFields.hidden = !isPaymentDateChange;
  const date = displayDate(localToday());
  recordDate.textContent = date;

  if (isReconnection) {
    const payments = [
      document.querySelector("#paysMonth").checked ? "mes" : "",
      document.querySelector("#paysAdjustment").checked ? "reajuste" : ""
    ].filter(Boolean).join(" + ") || "no paga mes ni reajuste";
    const technician = document.querySelector("#reconnectionTechnician").value.trim();
    const paymentDay = document.querySelector("#paymentDay").value.trim();
    const advisor = document.querySelector("#reconnectionAdvisor").value.trim();
    const technicianText = technician ? ` a técnico ${technician}` : "";
    const paymentDateText = paymentDay ? ` queda con fecha de pago los ${paymentDay} de cada mes` : "";
    const advisorText = advisor ? ` - ${advisor}` : "";
    recordOutput.value = `${date} RECONEXION: Se ajusta factura cliente paga ${payments}${technicianText}${paymentDateText}${advisorText}`;
  } else if (isCredit) {
    const invoice = document.querySelector("#invoiceNumber").value.trim();
    const waitingDay = document.querySelector("#waitingDay").value.trim();
    const advisor = document.querySelector("#creditAdvisor").value.trim();
    const invoiceText = invoice ? ` #${invoice}` : "";
    const waitingText = waitingDay ? ` se da espera hasta el dia ${waitingDay}` : "";
    const advisorText = advisor ? ` - ${advisor}` : "";
    recordOutput.value = `${date} ABONO: Se genera factura de abono${invoiceText}${waitingText}${advisorText}`;
  } else if (isHolderChange) {
    const oldHolder = document.querySelector("#oldHolder").value.trim();
    const newHolder = document.querySelector("#newHolder").value.trim();
    const advisor = document.querySelector("#holderAdvisor").value.trim();
    const transfer = [
      oldHolder ? `Cliente antiguo ( ${oldHolder} )` : "",
      newHolder ? `Cliente nuevo ( ${newHolder} )` : ""
    ].filter(Boolean).join(", ");
    recordOutput.value = `${date} CAMBIO DE TITULAR: ${transfer}${advisor ? ` - ${advisor}` : ""}`;
  } else if (isPaymentDateChange) {
    const paymentDay = document.querySelector("#newPaymentDay").value.trim();
    const advisor = document.querySelector("#paymentDateAdvisor").value.trim();
    const paymentText = paymentDay ? ` queda con fecha de pago los ${paymentDay} de cada mes` : "";
    const advisorText = advisor ? ` - ${advisor}` : "";
    recordOutput.value = `${date} CAMBIO DE FECHA DE PAGO: Se ajusta factura${paymentText}${advisorText}`;
  } else {
    const plan = document.querySelector("#planName").value.trim();
    const price = formattedInteger(document.querySelector("#planPrice").value);
    const technician = document.querySelector("#planTechnician").value.trim();
    const advisor = document.querySelector("#planAdvisor").value.trim();
    const opening = [plan ? `Queda con plan de ${plan}` : "", price ? `por el valor de ${price}` : ""].filter(Boolean).join(" ");
    const details = [opening, technician, advisor].filter(Boolean);
    recordOutput.value = `${date} CAMBIO DE PLAN: ${details.join(" - ")}`;
  }
  saveRecordDraft();
  requestResize();
}

try {
  const saved = JSON.parse(localStorage.getItem(RECORD_DRAFT_KEY) || "null");
  if (saved) recordControls.forEach(control => {
    if (!(control.id in saved)) return;
    if (control.type === "checkbox") control.checked = Boolean(saved[control.id]);
    else control.value = saved[control.id];
  });
  if (saved.planId) document.querySelector("#planName").dataset.selectedPlanId = saved.planId;
} catch { /* Start with a fresh draft if saved values cannot be read. */ }
renderPlanOptions();
recordControls.forEach(control => {
  control.addEventListener("input", renderRecord);
  control.addEventListener("change", renderRecord);
});
document.querySelector("#copyRecord").addEventListener("click", () => copyValue(recordOutput, recordStatus));
const createInvoiceReminderButton = document.querySelector("#createInvoiceReminder");
const invoiceReminderStatus = document.querySelector("#invoiceReminderStatus");
createInvoiceReminderButton.addEventListener("click", () => {
  const customerName = document.querySelector("#reconnectionCustomerName").value.trim();
  const customerId = document.querySelector("#reconnectionCustomerId").value.trim();
  const paymentDay = Number(document.querySelector("#paymentDay").value);
  if (!customerName || !customerId || !Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31) {
    invoiceReminderStatus.textContent = "Completa nombre, cédula y día de pago (1 a 31).";
    return;
  }
  createInvoiceReminderButton.disabled = true;
  invoiceReminderStatus.textContent = "Abriendo Generación de facturas…";
  window.parent.postMessage({ type: "INTERCOL_OPEN_INVOICE_FROM_UTILITIES", customerName, customerId, paymentDay }, "*");
});
window.addEventListener("message", event => {
  if (event.data?.type !== "INTERCOL_INVOICE_CREATE_RESULT") return;
  createInvoiceReminderButton.disabled = false;
  invoiceReminderStatus.textContent = event.data.message || (event.data.ok ? "Guardado." : "No se pudo guardar.");
});
document.querySelector("#clearRecord").addEventListener("click", () => {
  recordControls.forEach(control => {
    if (control.type === "checkbox") control.checked = false;
    else if (control.id === "recordType") control.value = "plan";
    else control.value = "";
  });
  delete document.querySelector("#planName").dataset.selectedPlanId;
  try { localStorage.removeItem(RECORD_DRAFT_KEY); } catch { /* Ignore unavailable storage. */ }
  renderRecord();
  recordStatus.textContent = "Formulario limpiado.";
  renderPlanOptions();
});
try {
  cedulaInput.value = localStorage.getItem(CEDULA_DRAFT_KEY) || "";
  priceInput.value = localStorage.getItem(PRICE_DRAFT_KEY) || "";
} catch { /* Start with empty utilities if storage is unavailable. */ }
formatCedula();
formatPrice();

window.addEventListener("message", event => {
  if (event.data?.type !== "INTERCOL_THEME") return;
  Object.entries(event.data.variables || {}).forEach(([name, value]) => document.documentElement.style.setProperty(name, value));
  document.documentElement.dataset.theme = event.data.theme || "light";
});

window.parent.postMessage({ type: "INTERCOL_SECTION_READY" }, "*");
const resizeSection = () => window.parent.postMessage({ type: "INTERCOL_SECTION_RESIZE", height: document.documentElement.scrollHeight }, "*");
new ResizeObserver(resizeSection).observe(document.documentElement);
renderRecord();
window.addEventListener("load", resizeSection);
