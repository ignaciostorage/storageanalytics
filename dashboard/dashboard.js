let datos = [];
let scadaHourlyRows = [];
let indiceActual = 0;
let intervalo = null;
let charts = {};
let chartsReady = false;

const $ = (id) => document.getElementById(id);
const strategySelectValue = () => window.currentStrategyFile || "estrategia_A.json";
const SCADA_HOURLY_URL = "data/sam_tmy_nasa_vs_cen_horario_scada_lite.json";
const SCADA_DATA_NOTE = "Los valores FV provienen de SAM; Generación real CEN, Reducciones CEN (curtailment) y precio marginal horario provienen de CEN/SEN 2025. CEN disponible = Generación real CEN + Reducciones CEN. Pronóstico centralizado CEN: 8736 h disponibles; faltan 24 h del 31-07-2025, sin imputación.";
const DEBUG_SCADA = true;
const SCADA_FIELD_CANDIDATES = {
  timestamp: ["timestamp", "fecha_hora", "datetime", "date_time"],
  caso_sam: ["caso_sam", "caso", "sam_case"],
  fuente_meteorologica: ["fuente_meteorologica", "fuente", "meteorologia"],
  sam_e_ac_mwh: ["sam_e_ac_mwh", "sam_ac_mwh", "energia_sam_mwh", "energia_ac_mwh"],
  sam_p_ac_mw: ["sam_p_ac_mw", "sam_ac_mw", "potencia_sam_mw", "potencia_ac_mw"],
  generacion_real_cen_mwh: ["generacion_real_cen_mwh", "generacion_real_mwh", "generacion_cen_mwh", "real_cen_mwh", "cen_real_mwh", "inyeccion_cen_mwh", "inyeccion_mwh", "energia_real_cen_mwh", "cen_inyeccion_mwh", "cen_inyeccion_sen_mwh"],
  reducciones_cen_mwh: ["reducciones_cen_mwh", "reducciones_cen_curtailment_mwh", "curtailment_mwh", "cen_curtailment_mwh", "reducciones_mwh", "vertimiento_mwh", "energia_reducida_mwh", "reduccion_cen_mwh"],
  cen_disponible_mwh: ["cen_disponible_mwh", "energia_cen_disponible_mwh", "disponible_cen_mwh", "energia_disponible_cen_mwh"],
  pronostico_centralizado_cen_mwh: ["pronostico_centralizado_cen_mwh", "centralizado_cen_mwh", "pronostico_cen_mwh", "forecast_cen_mwh"],
  precio_spot_usd_mwh: ["precio_marginal_horario_usd_mwh", "precio_marginal_miraje_220_usd_mwh", "precio_spot_usd_mwh", "precio_prom_usd_mwh", "precio_mirage_220_usd_mwh", "precio_marginal_usd_mwh"],
  ingreso_generacion_real_cen_usd: ["ingreso_generacion_real_cen_usd", "cen_ingreso_inyeccion_usd"],
  valor_reducciones_cen_usd: ["valor_reducciones_cen_usd", "cen_valor_curtailment_usd"],
  residuo_sam_menos_cen_disponible_mwh: ["residuo_sam_menos_cen_disponible_mwh", "residuo_sam_menos_cen_disp_mwh", "residuo_sam_cen_disponible_mwh"],
  meteo_ghi_wm2: ["meteo_ghi_wm2", "ghi_wm2", "ghi"],
  meteo_dni_wm2: ["meteo_dni_wm2", "dni_wm2", "dni"],
  meteo_dhi_wm2: ["meteo_dhi_wm2", "dhi_wm2", "dhi"],
};

window.addEventListener("DOMContentLoaded", () => {
  buildCharts();
  bindEvents();
  updateStrategyLabel("estrategia_A.json");
  cargarDatosScadaHorario();
  cargarComparador();
  preloadDashboardJsons();
});

function preloadDashboardJsons() {
  Promise.allSettled([
    loadJsonWithFallback("data/recurso_solar_tmy_dashboard_bundle.json", "data/recurso_solar_tmy_dashboard_lite.json"),
    loadJsonWithFallback("data/recurso_solar_nasa_2025_dashboard_bundle.json", "data/recurso_solar_nasa_2025_dashboard_lite.json"),
    loadJsonWithFallback("data/comparativa_recurso_solar_tmy_vs_nasa_dashboard_bundle.json", "data/comparativa_recurso_solar_tmy_vs_nasa_dashboard_lite.json"),
    loadJsonWithFallback("data/validacion_fv_ceme1_dashboard_bundle.json", "data/validacion_fv_ceme1_dashboard_lite.json"),
    loadJsonWithFallback("data/perfil_este_oeste_sam_dashboard_bundle.json", "data/perfil_este_oeste_sam_dashboard_lite.json"),
  ]).then((results) => {
    const rejected = results.filter((result) => result.status === "rejected");
    if (rejected.length) {
      console.warn("Precarga JSON del dashboard con advertencias:", rejected.map((result) => result.reason));
    }
  });
}

async function loadJsonWithFallback(primaryPath, fallbackPath = null) {
  try {
    console.log("Cargando JSON:", primaryPath);
    const response = await fetch(primaryPath, { cache: "no-store" });
    if (!response.ok) throw new Error(`${primaryPath} HTTP ${response.status}`);
    const data = await response.json();
    console.log("JSON cargado correctamente:", primaryPath, data);
    return data;
  } catch (errorPrimary) {
    console.warn("Fallo JSON principal:", primaryPath, errorPrimary);
    if (!fallbackPath) throw errorPrimary;

    console.log("Intentando JSON lite:", fallbackPath);
    const responseFallback = await fetch(fallbackPath, { cache: "no-store" });
    if (!responseFallback.ok) throw new Error(`${fallbackPath} HTTP ${responseFallback.status}`);
    const dataFallback = await responseFallback.json();
    console.log("JSON lite cargado correctamente:", fallbackPath, dataFallback);
    return dataFallback;
  }
}

function pick(obj, keys, fallback = null) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return fallback;
}

function findFirstField(obj, keys) {
  if (!obj) return { key: null, value: null };
  const candidates = Array.isArray(keys) ? keys : [keys];
  for (const key of candidates) {
    if (
      Object.prototype.hasOwnProperty.call(obj, key) &&
      obj[key] !== undefined &&
      obj[key] !== null &&
      obj[key] !== ""
    ) {
      return { key, value: obj[key] };
    }
  }
  return { key: null, value: null };
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let cleaned = String(value).trim().replace(/\s|\u00a0/g, "");
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    cleaned = lastComma > lastDot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    cleaned = cleaned.replace(",", ".");
  }

  cleaned = cleaned.replace(/[^0-9+\-.eE]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function toNumber(value, fallback = null) {
  const number = toNumberOrNull(value);
  return number === null ? fallback : number;
}

function scadaField(row, canonicalName) {
  return findFirstField(row, SCADA_FIELD_CANDIDATES[canonicalName] || [canonicalName]);
}

function scadaNumber(row, canonicalName) {
  const field = scadaField(row, canonicalName);
  return { key: field.key, value: toNumberOrNull(field.value) };
}

function fmt(value, decimals = 1, unit = "") {
  const n = toNumber(value);
  if (n === null) return "Dato no disponible";
  return `${n.toLocaleString("es-CL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${unit ? " " + unit : ""}`;
}

function bindEvents(){
  $("playBtn").addEventListener("click", play);
  $("pauseBtn").addEventListener("click", pause);
  $("resetBtn").addEventListener("click", reset);
  $("timeSlider").addEventListener("input", () => { indiceActual = Number($("timeSlider").value); update(); });
  $("dateInput").addEventListener("change", () => updateScadaDay(true));
  $("samCaseSelect").addEventListener("change", () => updateScadaDay(true));
  $("changeStrategyBtn").addEventListener("click", () => {
    const next = strategySelectValue() === "estrategia_A.json" ? "estrategia_B.json" : strategySelectValue() === "estrategia_B.json" ? "estrategia_C.json" : "estrategia_A.json";
    window.currentStrategyFile = next;
    updateStrategyLabel(next);
  });
}

async function cargarDatosScadaHorario(){
  pause();
  setScadaDataNote("Cargando datos horarios SAM/CEN 2025...");
  try{
    const json = await loadJsonWithFallback(SCADA_HOURLY_URL);
    scadaHourlyRows = Array.isArray(json) ? json : [];
    if(!scadaHourlyRows.length) throw new Error("JSON horario vacío");
    logScadaLoadDiagnostics(scadaHourlyRows);
    setScadaDataNote(SCADA_DATA_NOTE);
    updateScadaDay(true);
  }catch(e){
    console.error("No se pudo cargar el JSON horario SAM/CEN:", e);
    scadaHourlyRows = [];
    datos = [];
    indiceActual = 0;
    $("timeSlider").max = 0;
    $("timeSlider").value = 0;
    setScadaDataNote("No se pudo cargar data/sam_tmy_nasa_vs_cen_horario_scada_lite.json", true);
    update();
  }
}

function updateScadaDay(resetIndex = false){
  pause();
  const selectedDate = normalizeDate($("dateInput").value || "2025-05-15");
  const selectedCase = $("samCaseSelect").value || "SAM_NASA_2025";
  const rawRows = scadaHourlyRows
    .filter((row) => {
      const timestamp = scadaField(row, "timestamp").value;
      const casoSam = scadaField(row, "caso_sam").value;
      return normalizeDate(timestamp) === selectedDate && String(casoSam || "").trim() === selectedCase;
    })
    .sort((a,b) => getTimestampTime(scadaField(a, "timestamp").value) - getTimestampTime(scadaField(b, "timestamp").value));
  const rows = rawRows.map(normalizeScadaRow);

  datos = rows;
  indiceActual = resetIndex ? 0 : Math.min(indiceActual, Math.max(0, datos.length - 1));
  $("timeSlider").max = Math.max(0, datos.length - 1);
  $("timeSlider").value = indiceActual;

  if(!datos.length && scadaHourlyRows.length){
    setScadaDataNote("Sin datos para la fecha seleccionada y caso SAM seleccionado");
    logScadaNoMatches(selectedDate, selectedCase);
  } else if(scadaHourlyRows.length) {
    setScadaDataNote(SCADA_DATA_NOTE);
  }

  logScadaDayDiagnostics(selectedDate, selectedCase, rawRows, rows);
  update();
}

function normalizeScadaRow(row){
  const timestampRaw = scadaField(row, "timestamp");
  const casoSamRaw = scadaField(row, "caso_sam");
  const fuenteMeteoRaw = scadaField(row, "fuente_meteorologica");
  const timestamp = normalizeTimestamp(timestampRaw.value);
  const fvPower = scadaNumber(row, "sam_p_ac_mw");
  const fvEnergy = scadaNumber(row, "sam_e_ac_mwh");
  const ghi = scadaNumber(row, "meteo_ghi_wm2");
  const dni = scadaNumber(row, "meteo_dni_wm2");
  const dhi = scadaNumber(row, "meteo_dhi_wm2");
  const generacionReal = scadaNumber(row, "generacion_real_cen_mwh");
  const reducciones = scadaNumber(row, "reducciones_cen_mwh");
  const disponibleRaw = scadaNumber(row, "cen_disponible_mwh");
  const pronostico = scadaNumber(row, "pronostico_centralizado_cen_mwh");
  const precio = scadaNumber(row, "precio_spot_usd_mwh");
  const residuoRaw = scadaNumber(row, "residuo_sam_menos_cen_disponible_mwh");
  const disponible = disponibleRaw.value !== null
    ? disponibleRaw.value
    : (generacionReal.value !== null || reducciones.value !== null
      ? (generacionReal.value || 0) + (reducciones.value || 0)
      : null);
  const residuo = residuoRaw.value !== null
    ? residuoRaw.value
    : (fvEnergy.value !== null && disponible !== null ? fvEnergy.value - disponible : null);
  const precioValorizacion = precio.value || 0;
  const ingreso = scadaNumber(row, "ingreso_generacion_real_cen_usd").value;
  const valorReducciones = scadaNumber(row, "valor_reducciones_cen_usd").value;

  return {
    datetime: timestamp,
    caso_sam: casoSamRaw.value,
    fuente_meteorologica: fuenteMeteoRaw.value,
    rawTimestamp: timestampRaw.value,
    ghi: ghi.value,
    dni: dni.value,
    dhi: dhi.value,
    meteo_ghi_wm2: ghi.value,
    meteo_dni_wm2: dni.value,
    meteo_dhi_wm2: dhi.value,
    sam_p_ac_mw: fvPower.value,
    sam_e_ac_mwh: fvEnergy.value,
    generacion_real_cen_mwh: generacionReal.value,
    reducciones_cen_mwh: reducciones.value,
    cen_disponible_mwh: disponible,
    pronostico_centralizado_cen_mwh: pronostico.value,
    precio_spot_usd_mwh: precio.value,
    residuo_sam_menos_cen_disponible_mwh: residuo,
    fv: fvPower.value,
    fvPower: fvPower.value,
    fvEnergy: fvEnergy.value,
    inyeccion: generacionReal.value,
    curtailment: reducciones.value,
    disponible,
    residuo,
    pmg: precio.value,
    ingreso_inyeccion_usd: ingreso !== null
      ? ingreso
      : (generacionReal.value !== null ? generacionReal.value * precioValorizacion : null),
    valor_curtailment_usd: valorReducciones !== null
      ? valorReducciones
      : (reducciones.value !== null ? reducciones.value * precioValorizacion : null),
    __scadaFields: {
      timestamp: timestampRaw.key,
      caso_sam: casoSamRaw.key,
      sam_e_ac_mwh: fvEnergy.key,
      sam_p_ac_mw: fvPower.key,
      generacion_real_cen_mwh: generacionReal.key,
      reducciones_cen_mwh: reducciones.key,
      cen_disponible_mwh: disponibleRaw.key,
      pronostico_centralizado_cen_mwh: pronostico.key,
      precio_spot_usd_mwh: precio.key,
    },
  };
}

function normalizeDate(value){
  if(!value) return "";
  if(value instanceof Date && validDate(value)) return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());

  const raw = String(value).trim();
  const ymd = raw.match(/(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})/);
  if(ymd) return formatDateParts(ymd[1], ymd[2], ymd[3]);

  const dmy = raw.match(/(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4})/);
  if(dmy) return formatDateParts(dmy[3], dmy[2], dmy[1]);

  const parsed = new Date(raw.replace(" ", "T"));
  return validDate(parsed) ? formatDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate()) : "";
}

function normalizeTimestamp(value){
  const date = normalizeDate(value);
  const timeMatch = String(value || "").match(/(?:T|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const time = timeMatch ? `${pad2(timeMatch[1])}:${timeMatch[2]}:${timeMatch[3] || "00"}` : "00:00:00";
  return date ? `${date}T${time}` : "";
}

function formatDateParts(year, month, day){
  return `${String(year).padStart(4,"0")}-${pad2(month)}-${pad2(day)}`;
}

function pad2(value){
  return String(value).padStart(2,"0");
}

function getTimestampTime(value){
  const normalized = normalizeTimestamp(value);
  const time = new Date(normalized).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getAvailableScadaDates(){
  return [...new Set(scadaHourlyRows.map((row) => normalizeDate(scadaField(row, "timestamp").value)).filter(Boolean))].sort();
}

function getAvailableScadaCases(){
  return [...new Set(scadaHourlyRows.map((row) => String(scadaField(row, "caso_sam").value || "").trim()).filter(Boolean))].sort();
}

function logScadaLoadDiagnostics(data){
  console.log("SCADA lite cargado:", data.length);
  console.log("Primer registro:", data[0]);
  console.log("Campos disponibles:", Object.keys(data[0] || {}));
  console.log("Casos disponibles:", [...new Set(data.map((row) => scadaField(row, "caso_sam").value))]);
  console.log("Fechas ejemplo:", data.slice(0, 5).map((row) => scadaField(row, "timestamp").value));
}

function logScadaNoMatches(selectedDate, selectedCase){
  const dates = getAvailableScadaDates();
  console.warn("[SCADA SAM/CEN] Sin datos para filtro horario", {
    selectedDate,
    selectedCase,
    fechaMinimaDisponible: dates[0] || null,
    fechaMaximaDisponible: dates[dates.length - 1] || null,
    casosDisponibles: getAvailableScadaCases(),
    primerRegistro: scadaHourlyRows[0] || null,
  });
}

function logScadaDayDiagnostics(selectedDate, selectedCase, rawRows, normalizedRows){
  if(!DEBUG_SCADA) return;

  if(!normalizedRows.length){
    console.warn("[SCADA] Dia sin filas normalizadas", {
      selectedDate,
      selectedCase,
      filasCrudas: rawRows.length,
    });
    return;
  }

  const sumField = (key) => normalizedRows.reduce((acc, row) => {
    const value = toNumberOrNull(row[key]);
    return value === null ? acc : acc + value;
  }, 0);
  const maxField = (key) => normalizedRows.reduce((acc, row) => {
    const value = toNumberOrNull(row[key]);
    return value === null ? acc : Math.max(acc, value);
  }, 0);
  const firstPositive = (key) => normalizedRows.find((row) => (toNumberOrNull(row[key]) || 0) > 0) || null;
  const maxIdentityError = normalizedRows.reduce((acc, row) => {
    const disponible = toNumberOrNull(row.cen_disponible_mwh);
    const generacion = toNumberOrNull(row.generacion_real_cen_mwh);
    const reducciones = toNumberOrNull(row.reducciones_cen_mwh);
    if(disponible === null || generacion === null || reducciones === null) return acc;
    return Math.max(acc, Math.abs(disponible - (generacion + reducciones)));
  }, 0);

  console.log(`[SCADA] Dia ${selectedDate} / ${selectedCase}: ${normalizedRows.length} registros normalizados`);
  console.log("[SCADA] Campos usados:", normalizedRows[0].__scadaFields || {});
  console.log("[SCADA] Reducciones CEN (curtailment):", {
    suma_mwh: sumField("reducciones_cen_mwh"),
    max_mwh: maxField("reducciones_cen_mwh"),
    primer_registro_positivo: firstPositive("reducciones_cen_mwh"),
  });
  console.log("[SCADA] Generacion real CEN:", {
    suma_mwh: sumField("generacion_real_cen_mwh"),
    max_mwh: maxField("generacion_real_cen_mwh"),
    primer_registro_positivo: firstPositive("generacion_real_cen_mwh"),
  });
  console.log("[SCADA] Control CEN disponible = Generacion real CEN + Reducciones CEN:", {
    max_error_absoluto_mwh: maxIdentityError,
  });
}

function displaySamCase(casoSam, fuenteMeteorologica = ""){
  const raw = `${casoSam || ""} ${fuenteMeteorologica || ""}`;
  if(/tmy/i.test(raw)) return "SAM TMY Explorador Solar";
  if(/nasa/i.test(raw)) return "SAM NASA 2025";
  return casoSam || "--";
}

function displayReference(reference){
  if(reference === "CEN disponible = inyeccion + curtailment") {
    return "CEN disponible = Generación real CEN + Reducciones CEN";
  }
  if(reference === "CEN inyeccion real") {
    return "Generación real CEN (inyección registrada)";
  }
  return reference || "--";
}

function displayComparison(comparison){
  if(!comparison) return "SAM vs CEN";
  return String(comparison)
    .replace(/SAM TMY/g, "SAM TMY Explorador Solar")
    .replace(/SAM NASA POWER 2025/g, "SAM NASA 2025")
    .replace(/CEN SEN 2025/g, "CEN disponible 2025");
}

function setScadaDataNote(message, isError = false){
  const note = $("scadaDataNote");
  if(!note) return;
  note.textContent = message;
  note.classList.toggle("error", isError);
}

function updateStrategyLabel(file){
  const names = {
    "estrategia_A.json":"Beneficio Neto",
    "estrategia_B.json":"Umbral de Precio",
    "estrategia_C.json":"SOC Conservador"
  };
  $("strategyName").innerHTML = `<span class="badge-dot"></span> ${names[file] || "Sin datos"}`;
  $("strategyDescription").textContent = "Módulo BESS en desarrollo. Las estrategias se mantienen como simulación preliminar sin verificación final.";
}

function play(){
  if(!datos.length) return;
  pause();
  intervalo = setInterval(() => {
    indiceActual = indiceActual < datos.length-1 ? indiceActual + 1 : 0;
    $("timeSlider").value = indiceActual;
    update();
  }, Number($("speedSelect").value));
}
function pause(){ if(intervalo){ clearInterval(intervalo); intervalo=null; } }
function reset(){ pause(); indiceActual=0; $("timeSlider").value=0; update(); }

function update(){
  const d = datos[indiceActual] || {};
  const dayRows = getCurrentDayRows(d.datetime);
  const rowsUntil = getRowsUntilCurrentHour(dayRows, d.datetime);
  const date = new Date(d.datetime);
  const hh = validDate(date) ? date.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"}) : "--:--";
  const dd = validDate(date) ? `${date.toLocaleDateString("es-CL")} · ${displaySamCase(d.caso_sam, d.fuente_meteorologica)}` : "Sin datos";

  set("simHour", hh); set("simDate", dd); set("sliderBubble", hh);
  set("ghi", n(d.meteo_ghi_wm2 ?? d.ghi)); set("fv", n(d.sam_p_ac_mw ?? d.fv,1)); set("curtailment", n(d.reducciones_cen_mwh,1)); set("inyeccion", n(d.generacion_real_cen_mwh,1));
  set("carga", n(d.cen_disponible_mwh,1)); set("descarga", n(d.residuo_sam_menos_cen_disponible_mwh,1)); set("soc", "N/D"); set("socUnit", "B2"); set("pmg", n(d.precio_spot_usd_mwh,1));
  set("socLarge", "Sin datos"); set("energiaAlmacenada", "En desarrollo");
  set("energiaNominal", "No disponibles"); set("pMaxCarga", "No disponible"); set("pMaxDescarga", "No disponible"); set("eficiencia", "No disponible");
  set("temperatura", "No disponible"); set("soh", "No disponible"); set("sohActual", "No disponible"); set("efc", "No disponible");
  set("perdidaCapacidad", "No disponible"); set("costoDeg2", "No calculado"); set("beneficio", "Módulo en desarrollo");

  set("ghiSub", `Máx. día: ${n(max(dayRows,"meteo_ghi_wm2"))} W/m²`);
  set("fvSub", `Máx. día: ${n(max(dayRows,"sam_p_ac_mw"),1)} MW`);
  const pctCurt = d.cen_disponible_mwh ? (d.reducciones_cen_mwh/d.cen_disponible_mwh)*100 : 0;
  const pctInj = d.cen_disponible_mwh ? (d.generacion_real_cen_mwh/d.cen_disponible_mwh)*100 : 0;
  set("curtSub", `${n(pctCurt,1)}% de CEN disponible`);
  set("injSub", `${n(pctInj,1)}% de CEN disponible`);
  set("pmgSub", `Promedio día: ${n(avg(dayRows,"precio_spot_usd_mwh"),1)}`);

  set("energiaFvDia", `${n(sum(dayRows,"sam_e_ac_mwh"),1)} MWh`);
  set("energiaDispDia", `${n(sum(dayRows,"cen_disponible_mwh"),1)} MWh`);
  set("energiaInyDia", `${n(sum(dayRows,"generacion_real_cen_mwh"),1)} MWh`);
  set("curtailmentDia", `${n(sum(dayRows,"reducciones_cen_mwh"),1)} MWh`);
  set("ingreso", `USD ${money(sum(dayRows,"ingreso_inyeccion_usd"))}`);
  set("valorCurtDia", `USD ${money(sum(dayRows,"valor_curtailment_usd"))}`);
  set("curtRecDia", `${n(sum(dayRows,"residuo_sam_menos_cen_disponible_mwh"),1)} MWh`);

  if($("batteryFill")) $("batteryFill").style.height = "0%";
  updateCharts(dayRows, rowsUntil);
}

function updateCharts(dayRows, rowsUntil){
  if (!chartsReady && typeof Chart !== "undefined") {
    buildCharts();
  }
  if (!chartsReady) return;

  const labels = dayRows.map(x => hourLabel(x.datetime));
  const labelsUntil = rowsUntil.map(x => hourLabel(x.datetime));
  setChart(charts.operation, labels, ["sam_e_ac_mwh","cen_disponible_mwh","generacion_real_cen_mwh","reducciones_cen_mwh","precio_spot_usd_mwh"].map(k => dayRows.map(x => toNumberOrNull(x[k]) ?? 0)));
  setChart(charts.radiation, labels, ["meteo_ghi_wm2","meteo_dni_wm2","meteo_dhi_wm2"].map(k => dayRows.map(x => toNumberOrNull(x[k]) ?? 0)));
  setChart(charts.soc, labels, [dayRows.map(x => toNumberOrNull(x.residuo_sam_menos_cen_disponible_mwh) ?? 0)]);
  setChart(charts.pmg, labels, [dayRows.map(x => toNumberOrNull(x.precio_spot_usd_mwh) ?? 0)]);
  setChart(charts.sparkGhi, labelsUntil, [rowsUntil.map(x=>toNumberOrNull(x.meteo_ghi_wm2) ?? 0)]);
  setChart(charts.sparkFv, labelsUntil, [rowsUntil.map(x=>toNumberOrNull(x.sam_p_ac_mw) ?? 0)]);
  setChart(charts.sparkCurt, labelsUntil, [rowsUntil.map(x=>toNumberOrNull(x.reducciones_cen_mwh) ?? 0)]);
  setChart(charts.sparkInj, labelsUntil, [rowsUntil.map(x=>toNumberOrNull(x.generacion_real_cen_mwh) ?? 0)]);
  setChart(charts.sparkCarga, labelsUntil, [rowsUntil.map(x=>toNumberOrNull(x.cen_disponible_mwh) ?? 0)]);
  setChart(charts.sparkDescarga, labelsUntil, [rowsUntil.map(x=>toNumberOrNull(x.residuo_sam_menos_cen_disponible_mwh) ?? 0)]);
  setChart(charts.sparkPmg, labelsUntil, [rowsUntil.map(x=>toNumberOrNull(x.precio_spot_usd_mwh) ?? 0)]);
}

function buildCharts(){
  if (typeof Chart === "undefined") {
    chartsReady = false;
    console.error("Chart.js no esta cargado; se mantienen KPIs y tablas sin graficos.");
    return;
  }

  charts.operation = lineChart("operationChart", ["Generación FV SAM (AC)","CEN disponible","Generación real CEN","Reducciones CEN","Precio marginal"], ["#76ff45","#ffd21f","#31b7ff","#ff8a00","#b46cff"], false);
  charts.radiation = lineChart("radiationChart", ["GHI","DNI","DHI"], ["#ffd21f","#ff8a00","#31b7ff"], false);
  charts.soc = lineChart("socChart", ["Residuo SAM − CEN disponible"], ["#ff8a00"], false);
  charts.pmg = lineChart("pmgChart", ["Precio marginal horario"], ["#9b78ff"], false);
  charts.sparkGhi = lineChart("sparkGhi", ["GHI"], ["#ffd21f"], true);
  charts.sparkFv = lineChart("sparkFv", ["FV"], ["#76ff45"], true);
  charts.sparkCurt = lineChart("sparkCurt", ["Reducciones CEN"], ["#ff8a00"], true);
  charts.sparkInj = lineChart("sparkInj", ["Generación real CEN"], ["#31b7ff"], true);
  charts.sparkCarga = lineChart("sparkCarga", ["Disp"], ["#ffd21f"], true);
  charts.sparkDescarga = lineChart("sparkDescarga", ["Residuo"], ["#ff8a00"], true);
  charts.sparkPmg = lineChart("sparkPmg", ["Precio"], ["#9b78ff"], true);
  chartsReady = true;
}

function lineChart(id, labels, colors, spark=false){
  const ctx = $(id);
  if (!ctx || typeof Chart === "undefined") return null;
  const isOperationChart = id === "operationChart";
  const scales = {
    x: {
      display: !spark,
      ticks: { color: "#b9c7d8", maxTicksLimit: 9, font: { size: 10 } },
      grid: { color: "rgba(255,255,255,.05)" },
    },
    y: {
      display: !spark,
      ticks: { color: "#b9c7d8", font: { size: 10 } },
      grid: { color: "rgba(255,255,255,.06)" },
    },
  };

  if (isOperationChart) {
    scales.y.title = { display: true, text: "MWh", color: "#b9c7d8" };
    scales.y1 = {
      display: true,
      position: "right",
      ticks: { color: "#b9c7d8", font: { size: 10 } },
      grid: { drawOnChartArea: false },
      title: { display: true, text: "USD/MWh", color: "#b9c7d8" },
    };
  }

  return new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: labels.map((label, i) => {
        const isPrice = isOperationChart && i === 4;
        const isGeneracionReal = isOperationChart && i === 2;
        return {
          label,
          data: [],
          borderColor: colors[i],
          backgroundColor: `${colors[i]}22`,
          borderWidth: isGeneracionReal ? 3 : (spark ? 1.5 : 2),
          pointRadius: isGeneracionReal && !spark ? 1.5 : 0,
          pointHoverRadius: isGeneracionReal && !spark ? 3 : 0,
          tension: .28,
          fill: false,
          yAxisID: isPrice ? "y1" : "y",
          order: isGeneracionReal ? 0 : i + 1,
        };
      }),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: !spark, labels: { color: "#dbe9fa", boxWidth: 18, font: { size: 10 } } },
        tooltip: { enabled: !spark },
      },
      scales,
    },
  });
}
function setChart(chart, labels, arrays){
  if (!chart || !chart.data || !Array.isArray(chart.data.datasets) || typeof chart.update !== "function") return;
  chart.data.labels=labels;
  arrays.forEach((arr,i)=>{ if(chart.data.datasets[i]) chart.data.datasets[i].data=arr; });
  chart.update("none");
}

async function cargarComparador(){
  renderTable([]);
}
function renderTable(rows){
  if(!Array.isArray(rows) || !rows.length){
    $("strategyTable").innerHTML = `<tr><td colspan="9">Módulo BESS en desarrollo: no hay JSON oficial de operación BESS.</td></tr>`;
    set("recommendedStrategy", "Sin datos BESS oficiales");
    set("recommendationText", "La operación BESS queda marcada como módulo en desarrollo hasta incorporar resultados oficiales.");
    return;
  }
  $("strategyTable").innerHTML = rows.map(r => `<tr class="${r.highlight?'highlight':''}"><td>${r.highlight?'★ ':''}${r.estrategia}</td><td>${money(r.ingreso)}</td><td>${money(r.costo)}</td><td>${money(r.neto)}</td><td>${n(r.soh,1)}</td><td>${n(r.efc,1)}</td><td>${money(r.curtailment)}</td><td>${n(r.usd_mwh,1)}</td><td>${money(r.usd_soh)}</td></tr>`).join("");
  const best = rows.slice().sort((a,b)=>(b.neto||0)-(a.neto||0))[0];
  if(best){ set("recommendedStrategy", best.estrategia); set("recommendationText", "La estrategia seleccionada maximiza el beneficio neto considerando ingresos y degradación del BESS."); }
}

function getCurrentDayRows(dt){ const day = (dt||"").slice(0,10); return datos.filter(x => (x.datetime||"").slice(0,10)===day); }
function getRowsUntilCurrentHour(rows, dt){ const t = new Date(dt).getTime(); return rows.filter(x => new Date(x.datetime).getTime() <= t); }
function hourLabel(dt){ const d=new Date(dt); return validDate(d)?d.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"}):"--"; }
function validDate(d){ return d instanceof Date && !isNaN(d.getTime()); }
function set(id,value){ const el=$(id); if(el) el.textContent = value ?? "--"; }
function n(v,dec=0){ const value = toNumberOrNull(v); if(value === null) return "--"; return value.toLocaleString("es-CL",{maximumFractionDigits:dec,minimumFractionDigits:dec}); }
function money(v){ const value = toNumberOrNull(v); if(value === null) return "--"; return value.toLocaleString("es-CL",{maximumFractionDigits:0}); }
function sum(rows,k){ return rows.reduce((a,b)=>{ const value = toNumberOrNull(b[k]); return value === null ? a : a + value; },0); }
function max(rows,k){ return rows.reduce((m,b)=>{ const value = toNumberOrNull(b[k]); return value === null ? m : Math.max(m,value); },0); }
function avg(rows,k){ return rows.length ? sum(rows,k)/rows.length : 0; }
/* ============================================================
   MÓDULO RECURSO SOLAR (TMY)
   ------------------------------------------------------------
   Este bloque carga los datos JSON del TMY del Explorador Solar
   y alimenta la vista "Recurso Solar (TMY)" del dashboard.
   ============================================================ */

(() => {
  const SOLAR_DATA_URLS = {
    tmy: {
      primary: "data/recurso_solar_tmy_dashboard_bundle.json",
      fallback: "data/recurso_solar_tmy_dashboard_lite.json",
    },
    nasa: {
      primary: "data/recurso_solar_nasa_2025_dashboard_bundle.json",
      fallback: "data/recurso_solar_nasa_2025_dashboard_lite.json",
    },
    compare: {
      primary: "data/comparativa_recurso_solar_tmy_vs_nasa_dashboard_bundle.json",
      fallback: "data/comparativa_recurso_solar_tmy_vs_nasa_dashboard_lite.json",
    },
    ceme1: {
      primary: "data/recurso_solar_ceme1_dashboard_bundle.json",
      fallback: null,
    },
  };
  const SOLAR_COMPARE_METRICS_URL = "data/comparativa_recurso_solar_tmy_vs_nasa_metricas_dashboard.json";

  const solarState = {
    bundles: {},
    compareMetricsBundle: null,
    compareMetricsLoaded: false,
    renderedBundle: null,
    currentMode: "tmy",
    charts: {},
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function formatNumber(value, decimals = 2) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return "Dato no disponible";
    }

    return Number(value).toLocaleString("es-CL", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function formatInteger(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return "Dato no disponible";
    }

    return Number(value).toLocaleString("es-CL", {
      maximumFractionDigits: 0,
    });
  }

  function setText(id, value) {
    const el = byId(id);
    if (el) el.textContent = value;
  }

  function destroySolarCharts() {
    Object.values(solarState.charts).forEach((chart) => {
      if (chart && typeof chart.destroy === "function") {
        chart.destroy();
      }
    });

    solarState.charts = {};
  }

  function getCssColor(variableName, fallback) {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(variableName)
      .trim();

    return value || fallback;
  }

  function chartBaseOptions(extra = {}) {
    const gridColor = "rgba(140, 170, 210, 0.16)";
    const tickColor = "#b8cbe3";

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          labels: {
            color: tickColor,
            boxWidth: 14,
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: "rgba(3, 18, 34, 0.95)",
          titleColor: "#ffffff",
          bodyColor: "#d7e8ff",
          borderColor: "rgba(91, 141, 196, 0.45)",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          ticks: {
            color: tickColor,
          },
          grid: {
            color: gridColor,
          },
        },
        y: {
          ticks: {
            color: tickColor,
          },
          grid: {
            color: gridColor,
          },
        },
      },
      ...extra,
    };
  }

  function lineDataset(label, data, color, yAxisID = "y") {
    return {
      label,
      data,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 4,
      tension: 0.28,
      fill: false,
      yAxisID,
    };
  }

  function barDataset(label, data, color, yAxisID = "y") {
    return {
      label,
      data,
      backgroundColor: color,
      borderColor: color,
      borderWidth: 1,
      yAxisID,
    };
  }

  async function loadSolarBundle(mode = solarState.currentMode) {
    const source = SOLAR_DATA_URLS[mode] || SOLAR_DATA_URLS.tmy;
    if (solarState.bundles[mode]) {
      return solarState.bundles[mode];
    }

    try {
      const bundle = await loadJsonWithFallback(source.primary, source.fallback);
      solarState.bundles[mode] = bundle;

      return bundle;
    } catch (error) {
      console.error(`No se pudo cargar el JSON de recurso solar (${source.primary}):`, error);
      return null;
    }
  }

  async function loadSolarCompareMetricsBundle() {
    if (solarState.compareMetricsLoaded) {
      return solarState.compareMetricsBundle;
    }

    solarState.compareMetricsLoaded = true;
    try {
      solarState.compareMetricsBundle = await loadJsonWithFallback(SOLAR_COMPARE_METRICS_URL);
    } catch (error) {
      console.warn("No se pudo cargar el JSON de metricas comparativas TMY vs NASA:", error);
      solarState.compareMetricsBundle = null;
    }

    return solarState.compareMetricsBundle;
  }

  function setSolarHeader(mode) {
    const copy = {
      tmy: {
        eyebrow: "RECURSO SOLAR — TMY EXPLORADOR SOLAR",
        title: "Caracterización meteorológica TMY — María Elena",
        intro: "Visualización de GHI, DNI, DHI, temperatura ambiente y velocidad del viento a partir del archivo TMY del Explorador Solar.",
        note: "Las irradiancias corresponden al Año Meteorológico Típico (TMY) del Explorador Solar. Representan condiciones típicas de largo plazo y no mediciones reales de un año calendario específico.",
      },
      nasa: {
        eyebrow: "RECURSO SOLAR — NASA POWER 2025",
        title: "Caracterización meteorológica NASA POWER 2025",
        intro: "Visualización del recurso meteorológico histórico 2025 usado como base SAM para contraste operacional frente a datos CEN 2025.",
        note: "NASA POWER 2025 representa una serie histórica del año calendario 2025. Se usa para contraste operacional anual, no como año meteorológico típico.",
      },
      compare: {
        eyebrow: "RECURSO SOLAR — COMPARATIVA TMY VS NASA",
        title: "Comparativa meteorológica TMY Explorador Solar vs NASA POWER 2025",
        intro: "Comparación de GHI, DNI, DHI y perfiles horarios para separar año típico y meteorología histórica 2025.",
        note: "TMY caracteriza condiciones típicas de largo plazo; NASA POWER 2025 permite contrastar contra el mismo año calendario de los datos CEN.",
      },
    }[mode] || {};

    setText("solarEyebrow", copy.eyebrow);
    setText("solarTitle", copy.title);
    setText("solarIntro", copy.intro);
    const note = document.querySelector("#view-solar .method-note span");
    if (note) note.textContent = copy.note;
    byId("solarCompareConclusion")?.toggleAttribute("hidden", mode !== "compare");

    document.querySelectorAll(".solar-mode-btn").forEach((button) => {
      button.classList.toggle("active", button.dataset.solarMode === mode);
    });

    const labels = mode === "compare"
      ? [
        ["GHI DIARIO TMY", "TMY Explorador Solar"],
        ["GHI DIARIO NASA 2025", "NASA POWER 2025"],
        ["DIFERENCIA GHI", "NASA 2025 - TMY [% anual]"],
        ["GHI ANUAL TMY", "kWh/m²/año"],
        ["DNI ANUAL TMY", "kWh/m²/año"],
        ["DNI ANUAL NASA 2025", "kWh/m²/año"],
      ]
      : [
        ["GHI PROMEDIO DIARIA", "Global horizontal"],
        ["DNI PROMEDIO DIARIA", "Directa normal"],
        ["DHI PROMEDIO DIARIA", "Difusa horizontal"],
        ["GHI ANUAL", "Recurso global anual"],
        ["TEMPERATURA MEDIA", mode === "nasa" ? "Promedio NASA POWER 2025" : "Promedio anual TMY"],
        ["VIENTO MEDIO", mode === "nasa" ? "Promedio anual NASA POWER 2025" : "Promedio anual TMY"],
      ];

    document.querySelectorAll("#solarKpiCards .kpi-card").forEach((card, index) => {
      const title = card.querySelector(".kpi-content p");
      const subtitle = card.querySelector(".kpi-content > small");
      if (title && labels[index]) title.textContent = labels[index][0];
      if (subtitle && labels[index]) subtitle.textContent = labels[index][1];
    });
  }

  function monthName(month) {
    return ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][Number(month) - 1] || month;
  }

  function normalizeSamSolarBundle(bundle, label) {
    const kpis = bundle?.kpis || {};
    const mensual = Array.isArray(bundle?.mensual) ? bundle.mensual.map((row) => ({
      mes_corto: row.mes_corto || monthName(row.mes),
      ghi_kwh_m2_dia_promedio: (Number(row.ghi_kwh_m2) || 0) / 30,
      dni_kwh_m2_dia_promedio: (Number(row.dni_kwh_m2) || 0) / 30,
      dhi_kwh_m2_dia_promedio: (Number(row.dhi_kwh_m2) || 0) / 30,
      ghi_kwh_m2_mes: row.ghi_kwh_m2,
      dni_kwh_m2_mes: row.dni_kwh_m2,
      dhi_kwh_m2_mes: row.dhi_kwh_m2,
      temperatura_media_c: row.temp_amb_prom_c,
      temperatura_max_c: row.temp_amb_prom_c,
      temperatura_min_c: row.temp_amb_prom_c,
      viento_media_m_s: row.viento_prom_ms,
      viento_max_m_s: row.viento_prom_ms,
    })) : [];
    const perfil = Array.isArray(bundle?.perfil_horario) ? bundle.perfil_horario.map((row) => ({
      hora: row.hora,
      hora_label: row.hora_label,
      ghi_promedio_w_m2: row.ghi_prom_wm2,
      dni_promedio_w_m2: row.dni_prom_wm2,
      dhi_promedio_w_m2: row.dhi_prom_wm2,
    })) : [];

    return {
      metadata: { fuente: label, tipo_dato: label, ubicacion: "María Elena / CEME1" },
      kpis: {
        ghi_promedio_diario_kwh_m2_dia: (Number(kpis.ghi_anual_kwh_m2) || 0) / 365,
        dni_promedio_diario_kwh_m2_dia: (Number(kpis.dni_anual_kwh_m2) || 0) / 365,
        dhi_promedio_diario_kwh_m2_dia: (Number(kpis.dhi_anual_kwh_m2) || 0) / 365,
        ghi_anual_kwh_m2_anio: kpis.ghi_anual_kwh_m2,
        temperatura_media_anual_c: kpis.temp_amb_prom_c ?? kpis.temperatura_media_anual_c,
        viento_media_anual_m_s: kpis.wind_prom_m_s ?? kpis.viento_media_anual_m_s,
      },
      mensual,
      perfil_horario: perfil,
      horario: [],
    };
  }

  function normalizeCompareSolarBundle(bundle) {
    const tmy = Array.isArray(bundle?.kpis) ? bundle.kpis.find((row) => /tmy/i.test(`${row.caso || ""}`)) || {} : {};
    const nasa = Array.isArray(bundle?.kpis) ? bundle.kpis.find((row) => /nasa/i.test(`${row.caso || ""}`)) || {} : {};
    const mensual = Array.isArray(bundle?.mensual) ? bundle.mensual.map((row) => ({
      mes_corto: row.mes_nombre || monthName(row.mes),
      ghi_kwh_m2_dia_promedio: row.ghi_kwh_m2_tmy,
      dni_kwh_m2_dia_promedio: row.ghi_kwh_m2_nasa_2025,
      dhi_kwh_m2_dia_promedio: (Number(row.ghi_kwh_m2_nasa_2025) || 0) - (Number(row.ghi_kwh_m2_tmy) || 0),
      ghi_kwh_m2_mes: row.ghi_kwh_m2_tmy,
      dni_kwh_m2_mes: row.ghi_kwh_m2_nasa_2025,
      dhi_kwh_m2_mes: (Number(row.ghi_kwh_m2_nasa_2025) || 0) - (Number(row.ghi_kwh_m2_tmy) || 0),
      temperatura_media_c: row.temp_amb_prom_c_tmy,
      temperatura_max_c: row.temp_amb_prom_c_nasa_2025,
      temperatura_min_c: row.temp_amb_prom_c_tmy,
      viento_media_m_s: row.wind_prom_m_s_tmy,
      viento_max_m_s: row.wind_prom_m_s_nasa_2025,
    })) : [];
    const perfil = Array.isArray(bundle?.perfil_horario) ? bundle.perfil_horario.map((row) => ({
      hora: row.hora,
      hora_label: row.hora_label,
      compare_mode: true,
      ghi_promedio_w_m2: row.ghi_prom_wm2_tmy,
      dni_promedio_w_m2: row.ghi_prom_wm2_nasa_2025,
      dhi_promedio_w_m2: (Number(row.ghi_prom_wm2_nasa_2025) || 0) - (Number(row.ghi_prom_wm2_tmy) || 0),
    })) : [];
    const diffGhi = tmy.ghi_anual_kwh_m2 ? ((Number(nasa.ghi_anual_kwh_m2) - Number(tmy.ghi_anual_kwh_m2)) / Number(tmy.ghi_anual_kwh_m2)) * 100 : null;

    return {
      metadata: { fuente: "TMY vs NASA POWER 2025", tipo_dato: "Comparativa", ubicacion: "María Elena / CEME1" },
      kpis: {
        ghi_promedio_diario_kwh_m2_dia: tmy.ghi_anual_kwh_m2 ? Number(tmy.ghi_anual_kwh_m2) / 365 : null,
        dni_promedio_diario_kwh_m2_dia: nasa.ghi_anual_kwh_m2 ? Number(nasa.ghi_anual_kwh_m2) / 365 : null,
        dhi_promedio_diario_kwh_m2_dia: diffGhi,
        ghi_anual_kwh_m2_anio: tmy.ghi_anual_kwh_m2,
        temperatura_media_anual_c: tmy.dni_anual_kwh_m2,
        viento_media_anual_m_s: nasa.dni_anual_kwh_m2,
      },
      mensual,
      perfil_horario: perfil,
      horario: [],
    };
  }

  function solarNumeric(value) {
    return toNumberOrNull(value);
  }

  function solarMetadataObjects(bundle) {
    const objects = [];
    const add = (value) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        objects.push(value);
      }
    };

    add(bundle?.metadata);
    add(bundle?.location);
    add(bundle?.sitio);
    add(bundle?.estacion);
    add(bundle?.kpis);
    add(bundle);
    return objects;
  }

  function readSolarMetadataValue(bundle, keys) {
    const candidates = Array.isArray(keys) ? keys : [keys];
    for (const source of solarMetadataObjects(bundle)) {
      const field = findFirstField(source, candidates);
      if (field.value !== null && field.value !== undefined && field.value !== "") {
        return field.value;
      }
    }
    return null;
  }

  function getSolarLocationMetadata(bundleTmy, bundleNasa, bundleCompare, bundleCeme1) {
    const bundles = [bundleCompare, bundleTmy, bundleNasa, bundleCeme1];
    const read = (keys) => {
      for (const bundle of bundles) {
        const value = readSolarMetadataValue(bundle, keys);
        if (value !== null && value !== undefined && value !== "") return value;
      }
      return null;
    };

    return {
      ubicacion: read(["ubicacion", "location_name", "nombre_ubicacion", "sitio"]) || "No disponible",
      latitud: toNumberOrNull(read(["latitud", "latitude", "lat", "lat_decimal", "latitud_decimal"])),
      longitud: toNumberOrNull(read(["longitud", "longitude", "lon", "lng", "long_decimal", "longitud_decimal"])),
      elevacion_m: toNumberOrNull(read(["elevacion_m", "elevation_m", "elevacion", "elevation", "altitud_m", "altitude_m", "altitud"])),
    };
  }

  function buildSolarMetadataForMode(mode, currentBundle, tmyBundle, nasaBundle, compareBundle, ceme1Bundle) {
    const location = getSolarLocationMetadata(tmyBundle, nasaBundle, compareBundle, ceme1Bundle);
    const currentMetadata = currentBundle?.metadata || {};
    const modeCopy = {
      tmy: {
        fuente: "Explorador Solar de Chile",
        tipo_dato: "TMY",
      },
      nasa: {
        fuente: "NASA POWER",
        tipo_dato: "Año calendario 2025",
      },
      compare: {
        fuente: "Explorador Solar de Chile / NASA POWER",
        tipo_dato: "TMY / Año calendario 2025",
      },
    }[mode] || {};

    return {
      ...currentMetadata,
      fuente: modeCopy.fuente || currentMetadata.fuente || "No disponible",
      tipo_dato: modeCopy.tipo_dato || currentMetadata.tipo_dato || "No disponible",
      ubicacion: location.ubicacion || currentMetadata.ubicacion || "No disponible",
      latitude: location.latitud,
      longitude: location.longitud,
      elevation_m: location.elevacion_m,
      latitud: location.latitud,
      longitud: location.longitud,
      elevacion_m: location.elevacion_m,
    };
  }

  function solarAverage(values) {
    const valid = values.map(solarNumeric).filter((value) => value !== null);
    return valid.length ? valid.reduce((acc, value) => acc + value, 0) / valid.length : null;
  }

  function solarTotal(values) {
    const valid = values.map(solarNumeric).filter((value) => value !== null);
    return valid.length ? valid.reduce((acc, value) => acc + value, 0) : null;
  }

  function solarFirstNumber(row, keys) {
    const field = findFirstField(row, keys);
    return solarNumeric(field.value);
  }

  function normalizeSolarHourlyRowV2(row) {
    return {
      ...row,
      dia_tmy: solarNumeric(pick(row, ["dia_tmy", "dia_anio"])),
      mes: solarNumeric(row.mes),
      mes_corto: row.mes_corto || monthName(row.mes),
      hora: solarNumeric(row.hora),
      hora_label: row.hora_label || `${String(row.hora).padStart(2, "0")}:00`,
      ghi: solarNumeric(pick(row, ["ghi", "ghi_wm2"])),
      dni: solarNumeric(pick(row, ["dni", "dni_wm2"])),
      dhi: solarNumeric(pick(row, ["dhi", "dhi_wm2"])),
      temperatura: solarNumeric(pick(row, ["temperatura", "temperatura_c"])),
      viento: solarNumeric(pick(row, ["viento", "viento_ms"])),
      ghi_kwh_m2_h: solarNumeric(row.ghi_kwh_m2_h),
      dni_kwh_m2_h: solarNumeric(row.dni_kwh_m2_h),
      dhi_kwh_m2_h: solarNumeric(row.dhi_kwh_m2_h),
    };
  }

  function finiteMax(values) {
    const valid = values.map(solarNumeric).filter((value) => value !== null);
    return valid.length ? Math.max(...valid) : null;
  }

  function finiteMin(values) {
    const valid = values.map(solarNumeric).filter((value) => value !== null);
    return valid.length ? Math.min(...valid) : null;
  }

  function buildSolarMonthlyFromHourlyV2(horario) {
    const groups = new Map();
    horario.forEach((row) => {
      const month = solarNumeric(row.mes);
      if (!month) return;
      if (!groups.has(month)) groups.set(month, []);
      groups.get(month).push(row);
    });

    return [...groups.entries()]
      .sort(([a], [b]) => a - b)
      .map(([month, rows]) => {
        const uniqueDays = new Set(rows.map((row) => `${row.mes}-${row.dia || row.dia_tmy || row.fecha_codigo}`).filter(Boolean));
        const dayCount = uniqueDays.size || null;
        const ghiMonth = solarTotal(rows.map((row) => row.ghi_kwh_m2_h));
        const dniMonth = solarTotal(rows.map((row) => row.dni_kwh_m2_h));
        const dhiMonth = solarTotal(rows.map((row) => row.dhi_kwh_m2_h));

        return {
          mes: month,
          mes_corto: rows[0]?.mes_corto || monthName(month),
          ghi_kwh_m2_dia_promedio: dayCount && ghiMonth !== null ? ghiMonth / dayCount : null,
          dni_kwh_m2_dia_promedio: dayCount && dniMonth !== null ? dniMonth / dayCount : null,
          dhi_kwh_m2_dia_promedio: dayCount && dhiMonth !== null ? dhiMonth / dayCount : null,
          ghi_kwh_m2_mes: ghiMonth,
          dni_kwh_m2_mes: dniMonth,
          dhi_kwh_m2_mes: dhiMonth,
          temperatura_media_c: solarAverage(rows.map((row) => row.temperatura)),
          temperatura_max_c: finiteMax(rows.map((row) => row.temperatura)),
          temperatura_min_c: finiteMin(rows.map((row) => row.temperatura)),
          viento_media_m_s: solarAverage(rows.map((row) => row.viento)),
          viento_max_m_s: finiteMax(rows.map((row) => row.viento)),
        };
      });
  }

  function buildSolarProfileFromHourlyV2(horario) {
    const groups = new Map();
    horario.forEach((row) => {
      const hour = solarNumeric(row.hora);
      if (hour === null) return;
      if (!groups.has(hour)) groups.set(hour, []);
      groups.get(hour).push(row);
    });

    return [...groups.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hour, rows]) => ({
        hora: hour,
        hora_label: rows[0]?.hora_label || `${String(hour).padStart(2, "0")}:00`,
        ghi_promedio_w_m2: solarAverage(rows.map((row) => row.ghi)),
        dni_promedio_w_m2: solarAverage(rows.map((row) => row.dni)),
        dhi_promedio_w_m2: solarAverage(rows.map((row) => row.dhi)),
      }));
  }

  function normalizeSolarResourceBundleV2(bundle) {
    const horario = Array.isArray(bundle?.horario)
      ? bundle.horario.map(normalizeSolarHourlyRowV2)
      : [];
    const rawMensual = Array.isArray(bundle?.mensual) && bundle.mensual.length
      ? bundle.mensual
      : buildSolarMonthlyFromHourlyV2(horario);
    const mensual = rawMensual.map((row) => ({
      ...row,
      mes: solarNumeric(row.mes),
      mes_corto: row.mes_corto || monthName(row.mes),
      ghi_kwh_m2_dia_promedio: solarFirstNumber(row, ["ghi_kwh_m2_dia_promedio", "ghi_promedio_diario_kwh_m2_dia"]),
      dni_kwh_m2_dia_promedio: solarFirstNumber(row, ["dni_kwh_m2_dia_promedio", "dni_promedio_diario_kwh_m2_dia"]),
      dhi_kwh_m2_dia_promedio: solarFirstNumber(row, ["dhi_kwh_m2_dia_promedio", "dhi_promedio_diario_kwh_m2_dia"]),
      ghi_kwh_m2_mes: solarFirstNumber(row, ["ghi_kwh_m2_mes", "ghi_kwh_m2"]),
      dni_kwh_m2_mes: solarFirstNumber(row, ["dni_kwh_m2_mes", "dni_kwh_m2"]),
      dhi_kwh_m2_mes: solarFirstNumber(row, ["dhi_kwh_m2_mes", "dhi_kwh_m2"]),
      temperatura_media_c: solarFirstNumber(row, ["temperatura_media_c", "temp_amb_prom_c", "temperatura_promedio_c"]),
      temperatura_max_c: solarFirstNumber(row, ["temperatura_max_c", "temp_amb_max_c"]),
      temperatura_min_c: solarFirstNumber(row, ["temperatura_min_c", "temp_amb_min_c"]),
      viento_media_m_s: solarFirstNumber(row, ["viento_media_m_s", "viento_media_ms", "viento_prom_ms", "wind_prom_m_s"]),
      viento_max_m_s: solarFirstNumber(row, ["viento_max_m_s", "viento_max_ms", "wind_max_m_s"]),
    }));
    const rawPerfil = Array.isArray(bundle?.perfil_horario) && bundle.perfil_horario.length
      ? bundle.perfil_horario
      : buildSolarProfileFromHourlyV2(horario);
    const perfil = rawPerfil.map((row) => ({
      ...row,
      hora: solarNumeric(row.hora),
      hora_label: row.hora_label || `${String(row.hora).padStart(2, "0")}:00`,
      ghi_promedio_w_m2: solarFirstNumber(row, ["ghi_promedio_w_m2", "ghi_promedio_wm2", "ghi_prom_wm2", "ghi_wm2", "ghi"]),
      dni_promedio_w_m2: solarFirstNumber(row, ["dni_promedio_w_m2", "dni_promedio_wm2", "dni_prom_wm2", "dni_wm2", "dni"]),
      dhi_promedio_w_m2: solarFirstNumber(row, ["dhi_promedio_w_m2", "dhi_promedio_wm2", "dhi_prom_wm2", "dhi_wm2", "dhi"]),
    }));
    const kpis = bundle?.kpis || {};

    return {
      metadata: bundle?.metadata || {},
      kpis: {
        ...kpis,
        temperatura_media_anual_c: solarFirstNumber(kpis, ["temperatura_media_anual_c", "temp_amb_prom_c"]),
        viento_media_anual_m_s: solarFirstNumber(kpis, ["viento_media_anual_m_s", "viento_media_anual_ms", "wind_prom_m_s"]),
      },
      mensual,
      perfil_horario: perfil,
      horario,
    };
  }

  function findSolarComparativeKpi(rows, pattern) {
    return Array.isArray(rows)
      ? rows.find((row) => pattern.test(`${row.indicador || ""}`)) || {}
      : {};
  }

  function normalizeCompareSolarBundleV2(bundle, tmyBundle, nasaBundle) {
    const tmy = normalizeSolarResourceBundleV2(tmyBundle || {});
    const nasa = normalizeSolarResourceBundleV2(nasaBundle || {});
    const compareKpis = Array.isArray(bundle?.kpis_comparativos) ? bundle.kpis_comparativos : [];
    const ghiDaily = findSolarComparativeKpi(compareKpis, /ghi.*promedio/i);
    const ghiAnnual = findSolarComparativeKpi(compareKpis, /ghi.*anual/i);
    const dniAnnual = findSolarComparativeKpi(compareKpis, /dni.*anual/i);
    const nasaMonthlyByMonth = new Map(nasa.mensual.map((row) => [Number(row.mes), row]));
    const nasaProfileByHour = new Map(nasa.perfil_horario.map((row) => [Number(row.hora), row]));
    const mensual = tmy.mensual.map((row) => {
      const other = nasaMonthlyByMonth.get(Number(row.mes)) || {};
      const tmyGhi = solarNumeric(row.ghi_kwh_m2_mes);
      const nasaGhi = solarNumeric(other.ghi_kwh_m2_mes);
      return {
        mes: row.mes,
        mes_corto: row.mes_corto,
        ghi_kwh_m2_dia_promedio: row.ghi_kwh_m2_mes,
        dni_kwh_m2_dia_promedio: other.ghi_kwh_m2_mes,
        dhi_kwh_m2_dia_promedio: tmyGhi !== null && nasaGhi !== null ? nasaGhi - tmyGhi : null,
        ghi_kwh_m2_mes: row.ghi_kwh_m2_mes,
        dni_kwh_m2_mes: other.ghi_kwh_m2_mes,
        dhi_kwh_m2_mes: tmyGhi !== null && nasaGhi !== null ? nasaGhi - tmyGhi : null,
        temperatura_media_c: row.temperatura_media_c,
        temperatura_max_c: other.temperatura_media_c,
        temperatura_min_c: row.temperatura_media_c,
        viento_media_m_s: row.viento_media_m_s,
        viento_max_m_s: other.viento_media_m_s,
      };
    });
    const perfil = tmy.perfil_horario.map((row) => {
      const other = nasaProfileByHour.get(Number(row.hora)) || {};
      const tmyGhi = solarNumeric(row.ghi_promedio_w_m2);
      const nasaGhi = solarNumeric(other.ghi_promedio_w_m2);
      return {
        hora: row.hora,
        hora_label: row.hora_label,
        compare_mode: true,
        ghi_promedio_w_m2: row.ghi_promedio_w_m2,
        dni_promedio_w_m2: other.ghi_promedio_w_m2,
        dhi_promedio_w_m2: tmyGhi !== null && nasaGhi !== null ? nasaGhi - tmyGhi : null,
      };
    });

    return {
      metadata: bundle?.metadata || { fuente: "TMY vs NASA POWER 2025", tipo_dato: "Comparativa", ubicacion: "MarÃ­a Elena / CEME1" },
      kpis: {
        ghi_promedio_diario_kwh_m2_dia: ghiDaily.tmy_explorador,
        dni_promedio_diario_kwh_m2_dia: ghiDaily.nasa_power_2025,
        dhi_promedio_diario_kwh_m2_dia: ghiAnnual.delta_pct_nasa_respecto_tmy,
        ghi_anual_kwh_m2_anio: ghiAnnual.tmy_explorador,
        temperatura_media_anual_c: dniAnnual.tmy_explorador,
        viento_media_anual_m_s: dniAnnual.nasa_power_2025,
      },
      mensual,
      perfil_horario: perfil,
      horario: [],
    };
  }

  function renderSolarKpis(kpis) {
    if (!kpis) return;

    setText("solarKpiGhiDaily", formatNumber(kpis.ghi_promedio_diario_kwh_m2_dia, 3));
    setText("solarKpiDniDaily", formatNumber(kpis.dni_promedio_diario_kwh_m2_dia, 3));
    setText("solarKpiDhiDaily", formatNumber(kpis.dhi_promedio_diario_kwh_m2_dia, 3));
    setText("solarKpiGhiAnnual", formatNumber(kpis.ghi_anual_kwh_m2_anio, 0));
    setText("solarKpiTemp", formatNumber(kpis.temperatura_media_anual_c, 1));
    setText("solarKpiWind", formatNumber(kpis.viento_media_anual_m_s, 1));
  }

  function renderSolarMetadata(metadata) {
    if (!metadata) return;

    setText("solarMetaFuente", metadata.fuente || "No disponible");
    setText("solarMetaTipo", metadata.tipo_dato || "No disponible");
    setText("solarMetaUbicacion", metadata.ubicacion || "No disponible");

    const latValue = metadata.latitud ?? metadata.latitude;
    const lonValue = metadata.longitud ?? metadata.longitude;
    const elevValue = metadata.elevacion_m ?? metadata.elevation_m;

    const lat = latValue !== null && latValue !== undefined
      ? `${formatNumber(latValue, 4)}°`
      : "No disponible";

    const lon = lonValue !== null && lonValue !== undefined
      ? `${formatNumber(lonValue, 4)}°`
      : "No disponible";

    const elev = elevValue !== null && elevValue !== undefined
      ? `${formatNumber(elevValue, 0)} m`
      : "No disponible";

    setText("solarMetaLat", lat);
    setText("solarMetaLon", lon);
    setText("solarMetaElev", elev);
  }

  function renderSolarPerfilHorario(perfil) {
    const canvas = byId("solarPerfilHorarioChart");
    if (!canvas || !Array.isArray(perfil)) return;

    const labels = perfil.map((row) => row.hora_label || `${String(row.hora).padStart(2, "0")}:00`);

    solarState.charts.perfilHorario = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          lineDataset(solarState.currentMode === "compare" ? "GHI TMY Explorador Solar" : "GHI", perfil.map((row) => row.ghi_promedio_w_m2), "#f2c94c"),
          lineDataset(solarState.currentMode === "compare" ? "GHI NASA POWER 2025" : "DNI", perfil.map((row) => row.dni_promedio_w_m2), "#f2994a"),
          lineDataset(solarState.currentMode === "compare" ? "Δ GHI NASA - TMY" : "DHI", perfil.map((row) => row.dhi_promedio_w_m2), "#2d9cdb"),
        ],
      },
      options: chartBaseOptions({
        scales: {
          x: {
            ticks: {
              color: "#b8cbe3",
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12,
            },
            grid: {
              color: "rgba(140, 170, 210, 0.16)",
            },
          },
          y: {
            title: {
              display: true,
              text: "W/m²",
              color: "#b8cbe3",
            },
            ticks: {
              color: "#b8cbe3",
            },
            grid: {
              color: "rgba(140, 170, 210, 0.16)",
            },
          },
        },
      }),
    });
  }

  function renderSolarMensualPromedio(mensual) {
    const canvas = byId("solarMensualPromedioChart");
    if (!canvas || !Array.isArray(mensual)) return;

    const labels = mensual.map((row) => row.mes_corto);

    solarState.charts.mensualPromedio = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          lineDataset(solarState.currentMode === "compare" ? "GHI mensual TMY" : "GHI", mensual.map((row) => row.ghi_kwh_m2_dia_promedio), "#f2c94c"),
          lineDataset(solarState.currentMode === "compare" ? "GHI mensual NASA 2025" : "DNI", mensual.map((row) => row.dni_kwh_m2_dia_promedio), "#f2994a"),
          lineDataset(solarState.currentMode === "compare" ? "Δ GHI mensual" : "DHI", mensual.map((row) => row.dhi_kwh_m2_dia_promedio), "#2d9cdb"),
        ],
      },
      options: chartBaseOptions({
        scales: {
          x: {
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.16)" },
          },
          y: {
            title: {
              display: true,
              text: "kWh/m²/día",
              color: "#b8cbe3",
            },
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.16)" },
          },
        },
      }),
    });
  }

  function renderSolarMensualAcumulada(mensual) {
    const canvas = byId("solarMensualAcumuladaChart");
    if (!canvas || !Array.isArray(mensual)) return;

    const labels = mensual.map((row) => row.mes_corto);

    solarState.charts.mensualAcumulada = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          barDataset(solarState.currentMode === "compare" ? "GHI TMY" : "GHI", mensual.map((row) => row.ghi_kwh_m2_mes), "#f2c94c"),
          barDataset(solarState.currentMode === "compare" ? "GHI NASA 2025" : "DNI", mensual.map((row) => row.dni_kwh_m2_mes), "#f2994a"),
          barDataset(solarState.currentMode === "compare" ? "Δ GHI" : "DHI", mensual.map((row) => row.dhi_kwh_m2_mes), "#2d9cdb"),
        ],
      },
      options: chartBaseOptions({
        scales: {
          x: {
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.12)" },
          },
          y: {
            title: {
              display: true,
              text: "kWh/m²/mes",
              color: "#b8cbe3",
            },
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.16)" },
          },
        },
      }),
    });
  }

  function renderSolarTemperatura(mensual) {
    const canvas = byId("solarTemperaturaChart");
    if (!canvas || !Array.isArray(mensual)) return;

    const labels = mensual.map((row) => row.mes_corto);
    const datasets = [
      { label: "Temperatura media", key: "temperatura_media_c", color: "#ff6b6b" },
      { label: "Temperatura maxima", key: "temperatura_max_c", color: "#ffb3b3" },
      { label: "Temperatura minima", key: "temperatura_min_c", color: "#9ec5ff" },
    ]
      .filter((item) => mensual.some((row) => solarNumeric(row[item.key]) !== null))
      .map((item) => lineDataset(item.label, mensual.map((row) => row[item.key]), item.color));

    solarState.charts.temperatura = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets,
      },
      options: chartBaseOptions({
        scales: {
          x: {
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.16)" },
          },
          y: {
            title: {
              display: true,
              text: "°C",
              color: "#b8cbe3",
            },
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.16)" },
          },
        },
      }),
    });
  }

  function renderSolarViento(mensual) {
    const canvas = byId("solarVientoChart");
    if (!canvas || !Array.isArray(mensual)) return;

    const labels = mensual.map((row) => row.mes_corto);
    const datasets = [];
    if (mensual.some((row) => solarNumeric(row.viento_media_m_s) !== null)) {
      datasets.push(barDataset("Velocidad media", mensual.map((row) => row.viento_media_m_s), "#4ade80"));
    }
    if (mensual.some((row) => solarNumeric(row.viento_max_m_s) !== null)) {
      datasets.push(lineDataset("Velocidad maxima", mensual.map((row) => row.viento_max_m_s), "#e5e7eb"));
    }
    const subtitle = canvas.closest(".solar-chart-card")?.querySelector(".panel-head small");
    if (subtitle) {
      subtitle.textContent = datasets.length > 1 ? "Promedio mensual y maxima mensual" : "Promedio mensual";
    }

    solarState.charts.viento = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets,
      },
      options: chartBaseOptions({
        scales: {
          x: {
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.12)" },
          },
          y: {
            title: {
              display: true,
              text: "m/s",
              color: "#b8cbe3",
            },
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.16)" },
          },
        },
      }),
    });
  }

  function escapeSolarHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatSolarMetric(value, decimals = 2) {
    const number = solarNumeric(value);
    if (number === null) return "N/D";
    return number.toLocaleString("es-CL", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function readSolarMetricNumber(row, keys) {
    const value = pick(row, keys, null);
    return solarNumeric(value);
  }

  function getSolarAnnualDeltaPct(row) {
    const direct = readSolarMetricNumber(row, [
      "delta_anual_pct",
      "delta_pct_anual",
      "delta_pct_nasa_respecto_tmy",
      "diferencia_anual_pct",
      "variacion_anual_pct",
      "sesgo_anual_pct",
    ]);
    if (direct !== null) return direct;

    const tmyAnnual = readSolarMetricNumber(row, [
      "tmy_anual",
      "tmy_anual_kwh_m2",
      "tmy_annual",
      "ghi_anual_tmy",
      "dni_anual_tmy",
      "dhi_anual_tmy",
      "tmy_total",
      "tmy_media",
    ]);
    const nasaAnnual = readSolarMetricNumber(row, [
      "nasa_anual",
      "nasa_anual_kwh_m2",
      "nasa_annual",
      "ghi_anual_nasa",
      "dni_anual_nasa",
      "dhi_anual_nasa",
      "nasa_total",
      "nasa_media",
    ]);

    if (tmyAnnual === null || nasaAnnual === null || tmyAnnual === 0) return null;
    return ((nasaAnnual - tmyAnnual) / tmyAnnual) * 100;
  }

  function getSolarIrradianceUnit(row) {
    const variable = String(row?.variable || "").toUpperCase();
    if (["GHI", "DNI", "DHI"].includes(variable)) return "W/m²";
    return row?.unidad || "";
  }

  function getSolarCompareMetricRows(metricsBundle) {
    const rows = Array.isArray(metricsBundle?.metricas_dashboard)
      ? metricsBundle.metricas_dashboard
      : (Array.isArray(metricsBundle?.metricas) ? metricsBundle.metricas : []);
    const variables = ["GHI", "DNI", "DHI"];

    return variables
      .map((variable) => rows.find((row) =>
        String(row.variable || "").toUpperCase() === variable &&
        /horaria/i.test(String(row.escala || ""))
      ) || rows.find((row) => String(row.variable || "").toUpperCase() === variable))
      .filter(Boolean);
  }

  function setSolarComparePanelMode(isCompareMode) {
    setText(
      "solarComparePanelTitle",
      isCompareMode ? "Métricas comparativas TMY vs NASA POWER 2025" : "MAPA DE CALOR GHI"
    );
    setText(
      "solarComparePanelSubtitle",
      isCompareMode ? "Contraste horario NASA POWER 2025 − TMY Explorador Solar" : "Hora del día vs día del año típico"
    );

    byId("solarHeatmapPanel")?.toggleAttribute("hidden", isCompareMode);
    byId("solarCompareMetricsPanel")?.toggleAttribute("hidden", !isCompareMode);
  }

  function renderSolarCompareMetricsMessage(message) {
    const tbody = byId("solarCompareMetricsBody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td class="solar-compare-metrics-empty-cell" colspan="9">${escapeSolarHtml(message)}</td></tr>`;
    setText("solarCompareMetricsInterpretation", "");
  }

  function renderSolarCompareMetricsInterpretation(rows) {
    const ghi = rows.find((row) => String(row.variable || "").toUpperCase() === "GHI") || rows[0];
    const highestNrmse = rows
      .map((row) => ({ row, nrmse: solarNumeric(row.nrmse_pct_media_tmy) }))
      .filter((item) => item.nrmse !== null)
      .sort((a, b) => b.nrmse - a.nrmse)[0]?.row || null;

    if (!ghi || !highestNrmse) {
      setText("solarCompareMetricsInterpretation", "");
      return;
    }

    const bias = formatSolarMetric(ghi.sesgo_pct_media_tmy, 1);
    const corr = formatSolarMetric(ghi.correlacion_r, 3);
    const variable = highestNrmse.variable || "N/D";
    setText(
      "solarCompareMetricsInterpretation",
      `NASA POWER 2025 presenta un sesgo de ${bias} % respecto al TMY para GHI, manteniendo una correlación r = ${corr}. Las mayores diferencias se observan en ${variable}.`
    );
  }

  function renderSolarCompareMetricsTable(metricsBundle) {
    setSolarComparePanelMode(true);
    const tbody = byId("solarCompareMetricsBody");
    if (!tbody) return;

    const rows = getSolarCompareMetricRows(metricsBundle);
    const hasValues = rows.some((row) =>
      ["mbe_nasa_menos_tmy", "mae", "rmse", "nrmse_pct_media_tmy", "correlacion_r", "r2", "sesgo_pct_media_tmy"]
        .some((key) => solarNumeric(row[key]) !== null) || getSolarAnnualDeltaPct(row) !== null
    );

    if (!rows.length || !hasValues) {
      renderSolarCompareMetricsMessage("Métricas comparativas no disponibles. Ejecute nuevamente el script de recurso solar.");
      return;
    }

    tbody.innerHTML = rows.map((row) => `
      <tr>
        <td>
          <span class="solar-compare-metrics-var">
            <strong>${escapeSolarHtml(row.variable)}</strong>
            <small>${escapeSolarHtml(getSolarIrradianceUnit(row))}</small>
          </span>
        </td>
        <td>${formatSolarMetric(getSolarAnnualDeltaPct(row), 2)}</td>
        <td>${formatSolarMetric(row.sesgo_pct_media_tmy, 2)}</td>
        <td>${formatSolarMetric(row.mbe_nasa_menos_tmy, 2)}</td>
        <td>${formatSolarMetric(row.mae, 2)}</td>
        <td>${formatSolarMetric(row.rmse, 2)}</td>
        <td>${formatSolarMetric(row.nrmse_pct_media_tmy, 2)}</td>
        <td>${formatSolarMetric(row.correlacion_r, 3)}</td>
        <td>${formatSolarMetric(row.r2, 3)}</td>
      </tr>
    `).join("");
    renderSolarCompareMetricsInterpretation(rows);
  }

  function colorForGhi(value, maxValue) {
    if (!value || value <= 0) return "rgba(4, 13, 27, 0.95)";

    const ratio = Math.max(0, Math.min(1, value / maxValue));

    const r = Math.round(25 + ratio * 230);
    const g = Math.round(70 + ratio * 170);
    const b = Math.round(120 - ratio * 80);

    return `rgb(${r}, ${g}, ${b})`;
  }

  function renderSolarHeatmap(horario) {
    const canvas = byId("solarHeatmapGhi");
    if (!canvas || !Array.isArray(horario)) return;

    const ctx = canvas.getContext("2d");
    const parent = canvas.parentElement;

    const cssWidth = parent.clientWidth || 600;
    const cssHeight = parent.clientHeight || 280;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const margin = {
      left: 44,
      right: 18,
      top: 18,
      bottom: 30,
    };

    const plotW = cssWidth - margin.left - margin.right;
    const plotH = cssHeight - margin.top - margin.bottom;

    const maxGhi = Math.max(...horario.map((row) => Number(row.ghi) || 0), 1);

    const cellW = plotW / 365;
    const cellH = plotH / 24;

    horario.forEach((row) => {
      const day = Number(row.dia_tmy);
      const hour = Number(row.hora);
      const ghi = Number(row.ghi) || 0;

      if (!day || hour < 0 || hour > 23) return;

      const x = margin.left + (day - 1) * cellW;
      const y = margin.top + (23 - hour) * cellH;

      ctx.fillStyle = colorForGhi(ghi, maxGhi);
      ctx.fillRect(x, y, Math.max(cellW + 0.5, 1), Math.max(cellH + 0.5, 1));
    });

    ctx.strokeStyle = "rgba(184, 203, 227, 0.45)";
    ctx.lineWidth = 1;
    ctx.strokeRect(margin.left, margin.top, plotW, plotH);

    ctx.fillStyle = "#b8cbe3";
    ctx.font = "11px Arial";
    ctx.textAlign = "center";

    const monthTicks = [
      { d: 15, label: "Ene" },
      { d: 46, label: "Feb" },
      { d: 74, label: "Mar" },
      { d: 105, label: "Abr" },
      { d: 135, label: "May" },
      { d: 166, label: "Jun" },
      { d: 196, label: "Jul" },
      { d: 227, label: "Ago" },
      { d: 258, label: "Sep" },
      { d: 288, label: "Oct" },
      { d: 319, label: "Nov" },
      { d: 349, label: "Dic" },
    ];

    monthTicks.forEach((tick) => {
      const x = margin.left + (tick.d - 1) * cellW;
      ctx.fillText(tick.label, x, cssHeight - 10);
    });

    ctx.textAlign = "right";

    [0, 6, 12, 18, 23].forEach((hour) => {
      const y = margin.top + (23 - hour) * cellH + 4;
      ctx.fillText(String(hour).padStart(2, "0"), margin.left - 8, y);
    });

    ctx.save();
    ctx.translate(13, margin.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Hora del día", 0, 0);
    ctx.restore();

    ctx.textAlign = "left";
    ctx.fillText(`GHI máx.: ${formatNumber(maxGhi, 0)} W/m²`, margin.left, 12);
  }

  async function renderSolarView(mode = solarState.currentMode) {
    solarState.currentMode = SOLAR_DATA_URLS[mode] ? mode : "tmy";
    setSolarHeader(solarState.currentMode);
    const rawBundle = await loadSolarBundle(solarState.currentMode);

    if (!rawBundle) {
      console.warn("No hay datos solares disponibles para renderizar.");
      return;
    }

    let bundle;
    let compareMetricsBundle = null;
    if (solarState.currentMode === "compare") {
      const [tmyBundle, nasaBundle, ceme1Bundle] = await Promise.all([
        loadSolarBundle("tmy"),
        loadSolarBundle("nasa"),
        loadSolarBundle("ceme1"),
      ]);
      compareMetricsBundle = await loadSolarCompareMetricsBundle();
      bundle = normalizeCompareSolarBundleV2(rawBundle, tmyBundle, nasaBundle);
      bundle.metadata = buildSolarMetadataForMode("compare", rawBundle, tmyBundle, nasaBundle, rawBundle, ceme1Bundle);
    } else {
      const ceme1Bundle = await loadSolarBundle("ceme1");
      bundle = normalizeSolarResourceBundleV2(rawBundle);
      bundle.metadata = buildSolarMetadataForMode(
        solarState.currentMode,
        rawBundle,
        solarState.currentMode === "tmy" ? rawBundle : null,
        solarState.currentMode === "nasa" ? rawBundle : null,
        null,
        ceme1Bundle
      );
    }

    solarState.renderedBundle = bundle;

    renderSolarKpis(bundle.kpis);
    renderSolarMetadata(bundle.metadata);
    if (solarState.currentMode === "compare") {
      renderSolarCompareMetricsTable(compareMetricsBundle);
    } else {
      setSolarComparePanelMode(false);
    }

    destroySolarCharts();
    if (typeof Chart === "undefined") {
      console.error("Chart.js no esta cargado.");
      return;
    }

    renderSolarPerfilHorario(bundle.perfil_horario);
    renderSolarMensualPromedio(bundle.mensual);
    renderSolarMensualAcumulada(bundle.mensual);
    renderSolarTemperatura(bundle.mensual);
    renderSolarViento(bundle.mensual);

    if (solarState.currentMode !== "compare") {
      setTimeout(() => {
        renderSolarHeatmap(bundle.horario);
      }, 50);
    }
  }

  function showDashboardView(viewName) {
    const target = byId(`view-${viewName}`);

    if (!target) {
      console.warn(`La vista '${viewName}' aún no está implementada.`);
      return;
    }

    document.querySelectorAll(".dashboard-view").forEach((view) => {
      view.classList.remove("active");
    });

    target.classList.add("active");

    document.querySelectorAll(".side-nav a[data-view]").forEach((link) => {
      link.classList.toggle("active", link.dataset.view === viewName);
    });

    document.querySelector(".top-controls")?.classList.toggle("hidden", viewName !== "general");

    if (viewName === "solar") {
      renderSolarView();
    }

    if (viewName === "simulacion") {
      const simulationView = byId("view-simulacion");
      const activeButton = simulationView?.querySelector(".plant-tab-btn.active[data-plant-panel]");
      const activePanel = activeButton?.dataset.plantPanel || "energia";

      if (activePanel === "energia") {
        window.renderPlantEnergyView?.(activeButton?.dataset.plantEnergyMode || "tmy");
      }

    }

    if (viewName === "sam-cen") {
      window.renderSamCenView?.();
    }

    if (viewName === "clipping") {
      window.renderClippingView?.();
    }

    if (viewName === "reportes") {
      window.renderReportesView?.();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setupDashboardNavigation() {
    document.querySelectorAll(".side-nav a[data-view]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();

        const viewName = link.dataset.view;

        if (!byId(`view-${viewName}`)) {
          console.warn(`Vista no disponible todavía: ${viewName}`);
          return;
        }

        showDashboardView(viewName);
      });
    });
  }

  function setupSolarResizeHandler() {
    let resizeTimer = null;

    window.addEventListener("resize", () => {
      const solarView = byId("view-solar");

      if (!solarView || !solarView.classList.contains("active")) {
        return;
      }
      if (solarState.currentMode === "compare") {
        return;
      }

      clearTimeout(resizeTimer);

      resizeTimer = setTimeout(() => {
        const bundle = solarState.renderedBundle;
        if (bundle && Array.isArray(bundle.horario)) {
          renderSolarHeatmap(bundle.horario);
        }
      }, 200);
    });
  }

  function setupSolarModeTabs() {
    document.querySelectorAll(".solar-mode-btn[data-solar-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        renderSolarView(button.dataset.solarMode || "tmy");
      });
    });
  }

  function applyInitialHashView() {
    const hash = (window.location.hash || "").replace("#", "").trim();
    const validViews = ["general", "solar", "simulacion", "sam-cen", "clipping", "bess", "reportes"];

    if (hash && validViews.includes(hash) && byId(`view-${hash}`)) {
      showDashboardView(hash);
    }
  }

  function initSolarModule() {
    setupDashboardNavigation();
    setupSolarModeTabs();
    setupSolarResizeHandler();
    applyInitialHashView();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSolarModule);
  } else {
    initSolarModule();
  }
})();












/* ============================================================
   DESEMPEÑO ENERGÉTICO PLANTA FV (SAM)
   ============================================================ */
(function () {
  const PLANT_ENERGY_SOURCES = {
    tmy: {
      url: "data/simulacion_energetica_sam_dashboard_bundle.json",
      fallback: "data/simulacion_energetica_sam_dashboard_lite.json",
      type: "single",
      kicker: "RESULTADOS SAM — TMY",
      title: "Desempeño energético anual equivalente",
      status: "TMY DATOS OK",
      metaLabel: "TMY Explorador Solar de Chile",
    },
    nasa: {
      url: "data/simulacion_energetica_sam_dashboard_bundle.json",
      fallback: "data/simulacion_energetica_sam_dashboard_lite.json",
      type: "single",
      kicker: "RESULTADOS SAM — NASA POWER 2025",
      title: "Desempeño energético anual equivalente · serie 2025",
      status: "NASA DATOS OK",
      metaLabel: "NASA POWER serie 2025",
    },
    compare: {
      url: "data/validacion_fv_ceme1_dashboard_bundle.json",
      fallback: "data/validacion_fv_ceme1_dashboard_lite.json",
      type: "compare",
      kicker: "COMPARATIVA SAM — TMY VS NASA 2025",
      title: "Comparativa energética anual y horaria",
      status: "COMPARATIVA OK",
      metaLabel: "TMY Explorador Solar de Chile vs NASA POWER serie 2025",
    },
  };

  const plantEnergyState = {
    bundles: {},
    currentMode: "tmy",
    renderedMode: null,
    charts: {},
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const el = byId(id);
    if (el) el.textContent = value;
  }

  function formatNumber(value, decimals = 1) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return "--";
    }

    return Number(value).toLocaleString("es-CL", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function formatInteger(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return "--";
    }

    return Number(value).toLocaleString("es-CL", {
      maximumFractionDigits: 0,
    });
  }

  function asPercent(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return "--";
    }

    const number = Number(value);
    return formatNumber(number <= 1.5 ? number * 100 : number, 1);
  }

  function getCssColor(variableName, fallback) {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(variableName)
      .trim();

    return value || fallback;
  }

  function destroyPlantCharts() {
    Object.values(plantEnergyState.charts).forEach((chart) => {
      if (chart && typeof chart.destroy === "function") {
        chart.destroy();
      }
    });

    plantEnergyState.charts = {};
  }

  function chartBaseOptions(extra = {}) {
    const tickColor = "#b8cbe3";
    const gridColor = "rgba(140, 170, 210, 0.14)";

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          labels: {
            color: tickColor,
            boxWidth: 14,
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: "rgba(3, 18, 34, 0.96)",
          titleColor: "#ffffff",
          bodyColor: "#d7e8ff",
          borderColor: "rgba(91, 141, 196, 0.45)",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          ticks: { color: tickColor },
          grid: { color: gridColor },
        },
        y: {
          ticks: { color: tickColor },
          grid: { color: gridColor },
        },
      },
      ...extra,
    };
  }

  function lineDataset(label, data, color, yAxisID = "y") {
    return {
      label,
      data,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 4,
      tension: 0.28,
      fill: false,
      yAxisID,
    };
  }

  function barDataset(label, data, color, yAxisID = "y") {
    return {
      label,
      data,
      backgroundColor: `${color}cc`,
      borderColor: color,
      borderWidth: 1,
      borderRadius: 4,
      yAxisID,
    };
  }

  function normalizePlantEnergyMode(mode) {
    return PLANT_ENERGY_SOURCES[mode] ? mode : plantEnergyState.currentMode || "tmy";
  }

  function setPlantEnergyStatus(text, isError = false) {
    const statusEl = byId("plantEnergyStatus");
    if (statusEl) statusEl.classList.toggle("error", isError);
    setText("plantEnergyStatus", text);
  }

  function setPlantEnergyHeader(source, bundle = null) {
    setText("plantEnergyKicker", source.kicker);
    setText("plantEnergyTitle", source.title);

    const metadata = bundle?.metadata || bundle?.kpis || {};
    const tool = metadata.herramienta || "SAM";
    const resolution = metadata.resolucion || metadata.resolucion_temporal || "horaria";
    setText("plantEnergyMeta", `${tool} · ${source.metaLabel} · ${resolution}`);
  }

  function setActiveEnergyModeButton(mode) {
    document.querySelectorAll(".plant-energy-mode-btn[data-plant-energy-mode]").forEach((button) => {
      const isActive = button.dataset.plantEnergyMode === mode;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function plantNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function plantSum(rows, key) {
    const values = (Array.isArray(rows) ? rows : []).map((row) => plantNumber(row[key])).filter((value) => value !== null);
    return values.length ? values.reduce((acc, value) => acc + value, 0) : null;
  }

  function weightedAverage(rows, valueKey, weightKey) {
    const valid = (Array.isArray(rows) ? rows : [])
      .map((row) => ({ value: plantNumber(row[valueKey]), weight: plantNumber(row[weightKey]) }))
      .filter((row) => row.value !== null && row.weight !== null && row.weight > 0);
    const weightTotal = valid.reduce((acc, row) => acc + row.weight, 0);
    return weightTotal ? valid.reduce((acc, row) => acc + row.value * row.weight, 0) / weightTotal : null;
  }

  function findValidationSamCase(raw, mode) {
    const pattern = mode === "tmy" ? /tmy/i : /nasa|2025/i;
    return (Array.isArray(raw?.sam_resumen_casos) ? raw.sam_resumen_casos : [])
      .find((row) => pattern.test(`${row.caso_sam || ""} ${row.nombre_caso || ""} ${row.fuente_meteorologica || ""}`)) || {};
  }

  function filterValidationSubmodels(raw, mode) {
    const pattern = mode === "tmy" ? /tmy/i : /nasa|2025/i;
    return (Array.isArray(raw?.sam_submodelos) ? raw.sam_submodelos : [])
      .filter((row) => pattern.test(`${row.caso_sam || ""} ${row.nombre_caso || ""} ${row.fuente_meteorologica || ""}`));
  }

  function filterValidationProfile(raw, mode) {
    const source = mode === "tmy"
      ? raw?.perfil_este_oeste_sam_tmy
      : raw?.perfil_este_oeste_sam_nasa_2025;
    const rows = Array.isArray(source) && source.length
      ? source
      : (Array.isArray(raw?.perfil_este_oeste_sam) ? raw.perfil_este_oeste_sam : []);
    const pattern = mode === "tmy" ? /tmy/i : /nasa|2025/i;
    return rows
      .filter((row) => pattern.test(`${row.caso_sam || ""} ${row.nombre_caso || ""} ${row.fuente_meteorologica || ""}`))
      .sort((a, b) => Number(a.hora) - Number(b.hora));
  }

  function buildPlantKpisFromValidation(raw, mode, submodels) {
    const summary = findValidationSamCase(raw, mode);
    const energy = plantNumber(summary.energia_ac_neta_gwh);
    return {
      energia_ac_neta_gwh_anio: energy,
      energia_dc_gwh_anio: plantNumber(summary.energia_dc_gwh),
      potencia_ac_nominal_mwac: null,
      potencia_dc_nominal_mwp: plantSum(submodels, "potencia_dc_mwp"),
      potencia_ac_maxima_mw: plantNumber(summary.potencia_ac_max_mw),
      factor_planta_ac_pct: weightedAverage(submodels, "sam_single_capacity_factor_ac_pct", "energia_ac_neta_gwh"),
      performance_ratio_ponderado: weightedAverage(submodels, "sam_single_performance_ratio", "energia_ac_neta_gwh"),
      poa_este_anual_kwh_m2: null,
      poa_oeste_anual_kwh_m2: null,
      ghi_anual_kwh_m2: plantNumber(summary.ghi_anual_kwh_m2),
      dni_anual_kwh_m2: plantNumber(summary.dni_anual_kwh_m2),
      dhi_anual_kwh_m2: plantNumber(summary.dhi_anual_kwh_m2),
    };
  }

  function buildPlantMonthlyFromValidation(raw, mode) {
    const key = mode === "tmy" ? "sam_tmy_gwh" : "sam_nasa_2025_gwh";
    return (Array.isArray(raw?.mensual) ? raw.mensual : []).map((row) => ({
      mes: row.mes,
      mes_nombre: row.mes_nombre || row.mes,
      energia_ac_neta_gwh: plantNumber(row[key]),
      energia_dc_gwh: null,
      poa_este_kwh_m2: null,
      poa_oeste_kwh_m2: null,
    }));
  }

  function buildPlantHourlyFromValidation(raw, mode) {
    return filterValidationProfile(raw, mode).map((row) => ({
      hora: row.hora,
      hora_label: `${String(row.hora).padStart(2, "0")}:00`,
      potencia_ac_prom_mw: plantNumber(row.total_mwh),
      potencia_dc_prom_mw: null,
    }));
  }

  function buildPlantBalanceFromSubmodels(submodels) {
    const map = new Map();
    (Array.isArray(submodels) ? submodels : []).forEach((row) => {
      const orientation = row.orientacion || "Sin orientacion";
      map.set(orientation, (map.get(orientation) || 0) + (Number(row.energia_ac_neta_gwh) || 0));
    });
    return [...map.entries()].map(([orientacion, energia_ac_neta_gwh]) => ({ orientacion, energia_ac_neta_gwh }));
  }

  function buildSinglePlantBundleFromValidation(raw, mode) {
    const submodels = filterValidationSubmodels(raw, mode);
    const source = PLANT_ENERGY_SOURCES[mode];
    return {
      metadata: { herramienta: "SAM", resolucion_temporal: "horaria", fuente: source.metaLabel },
      kpis: buildPlantKpisFromValidation(raw, mode, submodels),
      mensual: buildPlantMonthlyFromValidation(raw, mode),
      perfil_horario: buildPlantHourlyFromValidation(raw, mode),
      submodelos: submodels,
      balance_orientacion: buildPlantBalanceFromSubmodels(submodels),
    };
  }

  function buildComparePlantBundleFromValidation(raw) {
    const tmy = buildSinglePlantBundleFromValidation(raw, "tmy");
    const nasa = buildSinglePlantBundleFromValidation(raw, "nasa");
    const nasaByMonth = new Map(nasa.mensual.map((row) => [Number(row.mes), row]));
    const nasaByHour = new Map(nasa.perfil_horario.map((row) => [Number(row.hora), row]));
    const nasaSubmodelsById = new Map(nasa.submodelos.map((row) => [row.submodelo, row]));
    const metrics = ["energia_ac_neta_gwh_anio", "factor_planta_ac_pct", "performance_ratio_ponderado", "ghi_anual_kwh_m2", "dni_anual_kwh_m2", "dhi_anual_kwh_m2"];

    return {
      metadata: { herramienta: "SAM", resolucion_temporal: "horaria", fuente: "TMY Explorador Solar vs NASA POWER 2025" },
      kpis: [
        { caso: "SAM_TMY", fuente_meteorologica: "SAM TMY Explorador Solar", ...tmy.kpis },
        { caso: "SAM_NASA_2025", fuente_meteorologica: "SAM NASA 2025", ...nasa.kpis },
      ],
      comparativa_kpis: metrics.map((metric) => {
        const tmyValue = plantNumber(tmy.kpis[metric]);
        const nasaValue = plantNumber(nasa.kpis[metric]);
        return {
          metrica: metric,
          tmy: tmyValue,
          nasa_2025: nasaValue,
          delta_nasa_menos_tmy: tmyValue !== null && nasaValue !== null ? nasaValue - tmyValue : null,
          delta_pct_respecto_tmy: tmyValue !== null && nasaValue !== null && tmyValue !== 0 ? ((nasaValue - tmyValue) / tmyValue) * 100 : null,
        };
      }),
      mensual: tmy.mensual.map((row) => {
        const other = nasaByMonth.get(Number(row.mes)) || {};
        return {
          mes: row.mes,
          mes_nombre: row.mes_nombre,
          energia_ac_neta_gwh_tmy: row.energia_ac_neta_gwh,
          energia_ac_neta_gwh_nasa_2025: other.energia_ac_neta_gwh,
          energia_dc_gwh_tmy: row.energia_dc_gwh,
          energia_dc_gwh_nasa_2025: other.energia_dc_gwh,
          poa_este_kwh_m2_tmy: row.poa_este_kwh_m2,
          poa_este_kwh_m2_nasa_2025: other.poa_este_kwh_m2,
          poa_oeste_kwh_m2_tmy: row.poa_oeste_kwh_m2,
          poa_oeste_kwh_m2_nasa_2025: other.poa_oeste_kwh_m2,
        };
      }),
      perfil_horario: tmy.perfil_horario.map((row) => {
        const other = nasaByHour.get(Number(row.hora)) || {};
        return {
          hora: row.hora,
          hora_label: row.hora_label,
          potencia_ac_prom_mw_tmy: row.potencia_ac_prom_mw,
          potencia_ac_prom_mw_nasa_2025: other.potencia_ac_prom_mw,
          potencia_dc_prom_mw_tmy: row.potencia_dc_prom_mw,
          potencia_dc_prom_mw_nasa_2025: other.potencia_dc_prom_mw,
        };
      }),
      submodelos: tmy.submodelos.map((row) => {
        const other = nasaSubmodelsById.get(row.submodelo) || {};
        return {
          ...row,
          energia_ac_neta_gwh_tmy: row.energia_ac_neta_gwh,
          energia_ac_neta_gwh_nasa_2025: other.energia_ac_neta_gwh,
        };
      }),
      balance_orientacion: [
        ...tmy.balance_orientacion.map((row) => ({ caso: "SAM_TMY", ...row })),
        ...nasa.balance_orientacion.map((row) => ({ caso: "SAM_NASA_2025", ...row })),
      ],
    };
  }

  function enrichPlantBundleData(bundle) {
    if (!bundle || typeof bundle !== "object") return bundle;
    const kpis = bundle.kpis || {};
    const acAnnual = plantNumber(kpis.energia_ac_neta_gwh_anio ?? kpis.energia_ac_positiva_gwh_anio);
    const dcAnnual = plantNumber(kpis.energia_dc_gwh_anio);
    const dcAcRatio = acAnnual && dcAnnual ? dcAnnual / acAnnual : null;

    if (Array.isArray(bundle.mensual)) {
      bundle.mensual = bundle.mensual.map((row) => {
        const next = { ...row };
        const ac = plantNumber(next.energia_ac_neta_gwh ?? next.energia_ac_positiva_gwh ?? next.energia_ac_gwh);
        if (plantNumber(next.energia_ac_neta_gwh) === null && ac !== null) next.energia_ac_neta_gwh = ac;
        if (plantNumber(next.energia_dc_gwh) === null && ac !== null && dcAcRatio !== null) {
          next.energia_dc_gwh = ac * dcAcRatio;
          next.energia_dc_gwh_estimado = true;
        }
        return next;
      });
    }

    if (Array.isArray(bundle.perfil_horario)) {
      bundle.perfil_horario = bundle.perfil_horario.map((row) => {
        const next = { ...row };
        const ac = plantNumber(next.potencia_ac_prom_mw ?? next.energia_ac_prom_mwh ?? next.p_ac_prom_mw ?? next.total_mwh);
        if (plantNumber(next.potencia_ac_prom_mw) === null && ac !== null) next.potencia_ac_prom_mw = ac;
        if (plantNumber(next.potencia_dc_prom_mw) === null && ac !== null && dcAcRatio !== null) {
          next.potencia_dc_prom_mw = ac * dcAcRatio;
          next.potencia_dc_prom_mw_estimado = true;
        }
        if (!next.hora_label && next.hora !== undefined) next.hora_label = `${String(next.hora).padStart(2, "0")}:00`;
        return next;
      });
    }

    return bundle;
  }

  function normalizePlantBundle(raw, mode) {
    const bundle = raw?.sam_resumen_casos
      ? (mode === "compare" ? buildComparePlantBundleFromValidation(raw) : buildSinglePlantBundleFromValidation(raw, mode))
      : raw;
    return enrichPlantBundleData(bundle);
  }

  async function loadPlantBundle(mode) {
    const source = PLANT_ENERGY_SOURCES[mode];
    if (!source) return null;

    if (plantEnergyState.bundles[mode]) {
      return plantEnergyState.bundles[mode];
    }

    try {
      const rawBundle = await loadJsonWithFallback(source.url, source.fallback);
      const bundle = normalizePlantBundle(rawBundle, mode);
      plantEnergyState.bundles[mode] = bundle;

      return bundle;
    } catch (error) {
      console.error(`No se pudo cargar el bundle Planta FV SAM (${source.url}):`, error);
      return null;
    }
  }

  function renderPlantEnergyKpis(kpis) {
    if (!kpis) return;

    setPlantKpiLabels([
      { title: "ENERGIA AC NETA ANUAL", unit: " GWh/anio", subtitle: "Egrid neta SAM" },
      { title: "ENERGIA DC ANUAL", unit: " GWh/anio", subtitle: "Entrada DC equivalente" },
      { title: "POTENCIA AC NOMINAL", unit: " MWac", subtitle: "Inversores modelados" },
      { title: "POTENCIA DC NOMINAL", unit: " MWp", subtitle: "Campo FV equivalente" },
      { title: "POTENCIA AC MAXIMA SIMULADA", unit: " MW", subtitle: "Maximo horario TMY" },
      { title: "FACTOR DE PLANTA AC", unit: " %", subtitle: "Sobre potencia AC" },
      { title: "PERFORMANCE RATIO", unit: " %", subtitle: "PR ponderado" },
      { title: "POA ESTE / OESTE ANUAL", subtitle: "kWh/m2/anio" },
      { title: "GHI ANUAL", unit: " kWh/m2/anio", subtitle: "Global horizontal TMY" },
      { title: "DNI ANUAL", unit: " kWh/m2/anio", subtitle: "Directa normal TMY" },
    ]);

    setText("plantKpiAcNetAnnual", formatNumber(kpis.energia_ac_neta_gwh_anio, 1));
    setText("plantKpiDcAnnual", formatNumber(kpis.energia_dc_gwh_anio, 1));
    setText("plantKpiAcNominal", formatNumber(kpis.potencia_ac_nominal_mwac, 1));
    setText("plantKpiDcNominal", formatNumber(kpis.potencia_dc_nominal_mwp, 1));
    setText("plantKpiAcMax", formatNumber(kpis.potencia_ac_maxima_mw, 1));
    setText("plantKpiCapacityFactor", formatNumber(kpis.factor_planta_ac_pct, 1));
    setText("plantKpiPerformanceRatio", asPercent(kpis.performance_ratio_ponderado));
    setText("plantKpiPoaEast", formatInteger(kpis.poa_este_anual_kwh_m2));
    setText("plantKpiPoaWest", formatInteger(kpis.poa_oeste_anual_kwh_m2));
    setText("plantKpiGhiAnnual", formatInteger(kpis.ghi_anual_kwh_m2));
    setText("plantKpiDniAnnual", formatInteger(kpis.dni_anual_kwh_m2));
    setText("plantKpiGhiSub", "Global horizontal TMY");
    setText("plantKpiDniSub", "Directa normal TMY");
  }

  function findCompareCase(kpis, pattern, fallbackIndex) {
    if (!Array.isArray(kpis)) return {};

    return kpis.find((row) => pattern.test(`${row.caso || ""} ${row.fuente_meteorologica || ""}`))
      || kpis[fallbackIndex]
      || {};
  }

  function formatPair(left, right, decimals = 1) {
    return `${formatNumber(left, decimals)} / ${formatNumber(right, decimals)}`;
  }

  function formatIntegerPair(left, right) {
    return `${formatInteger(left)} / ${formatInteger(right)}`;
  }

  function formatPercentPair(left, right) {
    return `${asPercent(left)} / ${asPercent(right)}`;
  }

  function setPlantKpiLabels(labels) {
    const cards = document.querySelectorAll("#plant-panel-energia .plant-energy-kpi");
    labels.forEach((item, index) => {
      const card = cards[index];
      if (!card) return;
      const title = card.querySelector("p");
      const subtitle = card.querySelector(":scope > small");
      const unit = card.querySelector("h3 small");
      if (title && item.title) title.textContent = item.title;
      if (unit && Object.prototype.hasOwnProperty.call(item, "unit")) unit.textContent = item.unit;
      if (subtitle && item.subtitle) subtitle.textContent = item.subtitle;
    });
  }

  function renderPlantCompareKpis(kpis) {
    const tmy = findCompareCase(kpis, /tmy/i, 0);
    const nasa = findCompareCase(kpis, /nasa/i, 1);
    const diff = tmy.energia_ac_neta_gwh_anio
      ? ((Number(nasa.energia_ac_neta_gwh_anio) - Number(tmy.energia_ac_neta_gwh_anio)) / Number(tmy.energia_ac_neta_gwh_anio)) * 100
      : null;

    setPlantKpiLabels([
      { title: "ENERGIA AC NETA TMY", unit: " GWh/anio", subtitle: "GWh/anio" },
      { title: "ENERGIA AC NETA NASA 2025", unit: " GWh/anio", subtitle: "GWh/anio" },
      { title: "DIFERENCIA AC", unit: " %", subtitle: "NASA - TMY" },
      { title: "FACTOR DE PLANTA TMY / NASA", unit: " %", subtitle: "%" },
      { title: "PERFORMANCE RATIO TMY / NASA", unit: " %", subtitle: "%" },
      { title: "GHI ANUAL TMY / NASA", unit: " kWh/m2/anio", subtitle: "kWh/m2/anio" },
      { title: "DNI ANUAL TMY / NASA", unit: " kWh/m2/anio", subtitle: "kWh/m2/anio" },
      { title: "POA ESTE / OESTE TMY", subtitle: "kWh/m2/anio" },
      { title: "POA ESTE / OESTE NASA", unit: " kWh/m2/anio", subtitle: "kWh/m2/anio" },
      { title: "DHI ANUAL TMY / NASA", unit: " kWh/m2/anio", subtitle: "kWh/m2/anio" },
    ]);

    setText("plantKpiAcNetAnnual", formatNumber(tmy.energia_ac_neta_gwh_anio, 1));
    setText("plantKpiDcAnnual", formatNumber(nasa.energia_ac_neta_gwh_anio, 1));
    setText("plantKpiAcNominal", formatNumber(diff, 1));
    setText("plantKpiDcNominal", formatPair(tmy.factor_planta_ac_pct, nasa.factor_planta_ac_pct, 1));
    setText("plantKpiAcMax", formatPercentPair(tmy.performance_ratio_ponderado, nasa.performance_ratio_ponderado));
    setText("plantKpiCapacityFactor", formatIntegerPair(tmy.ghi_anual_kwh_m2, nasa.ghi_anual_kwh_m2));
    setText("plantKpiPerformanceRatio", formatIntegerPair(tmy.dni_anual_kwh_m2, nasa.dni_anual_kwh_m2));
    setText("plantKpiPoaEast", formatInteger(tmy.poa_este_anual_kwh_m2));
    setText("plantKpiPoaWest", formatInteger(tmy.poa_oeste_anual_kwh_m2));
    setText("plantKpiGhiAnnual", formatIntegerPair(nasa.poa_este_anual_kwh_m2, nasa.poa_oeste_anual_kwh_m2));
    setText("plantKpiDniAnnual", formatIntegerPair(tmy.dhi_anual_kwh_m2, nasa.dhi_anual_kwh_m2));
    setText("plantKpiGhiSub", "Este / Oeste NASA 2025");
    setText("plantKpiDniSub", "Difusa horizontal TMY / NASA");
  }

  function setCompareDetailsVisible(visible) {
    const details = byId("plantCompareDetails");
    if (details) details.hidden = !visible;
    const samNote = byId("plantSamMethodNote");
    if (samNote) samNote.hidden = visible;
  }

  function metricLabel(metric) {
    return {
      energia_ac_neta_gwh_anio: "Energía AC neta",
      factor_planta_ac_pct: "Factor de planta",
      performance_ratio_ponderado: "Performance Ratio",
      ghi_anual_kwh_m2: "GHI anual",
      dni_anual_kwh_m2: "DNI anual",
      dhi_anual_kwh_m2: "DHI anual",
      poa_este_anual_kwh_m2: "POA Este",
      poa_oeste_anual_kwh_m2: "POA Oeste",
    }[metric] || metric;
  }

  function renderPlantCompareDiffTable(rows) {
    const tbody = byId("plantCompareDiffBody");
    if (!tbody) return;
    const order = [
      "energia_ac_neta_gwh_anio",
      "factor_planta_ac_pct",
      "performance_ratio_ponderado",
      "ghi_anual_kwh_m2",
      "dni_anual_kwh_m2",
      "dhi_anual_kwh_m2",
      "poa_este_anual_kwh_m2",
      "poa_oeste_anual_kwh_m2",
    ];
    const map = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.metrica, row]));
    tbody.innerHTML = order.map((metric) => {
      const row = map.get(metric) || {};
      const isPp = metric === "factor_planta_ac_pct" || metric === "performance_ratio_ponderado";
      const delta = isPp ? row.delta_nasa_menos_tmy : row.delta_pct_respecto_tmy;
      const unit = isPp ? "pp" : "%";
      const decimals = metric === "performance_ratio_ponderado" ? 3 : 1;
      return `<tr><td>${metricLabel(metric)}</td><td>${formatNumber(row.tmy, decimals)}</td><td>${formatNumber(row.nasa_2025, decimals)}</td><td>${delta === undefined || delta === null ? "--" : `${formatNumber(delta, 1)} ${unit}`}</td></tr>`;
    }).join("");
  }

  function renderPlantCompareSubmodelTable(rows) {
    const tbody = byId("plantCompareSubmodelBody");
    if (!tbody) return;
    tbody.innerHTML = (Array.isArray(rows) ? rows : []).map((row) => {
      const potenciaDcMwp = (Number(row.strings) || 0) * (Number(row.modulos_por_string) || 0) * (Number(row.modulo_wp) || 0) / 1_000_000;
      return `<tr><td>${row.submodelo || "--"}</td><td>${row.orientacion || "--"}</td><td>${row.modulo_wp || "--"} Wp</td><td>${formatInteger(row.strings)}</td><td>${formatInteger(row.inversores)}</td><td>${formatNumber(potenciaDcMwp, 1)} MWp</td><td>${formatNumber(row.energia_ac_neta_gwh_tmy, 1)} GWh</td><td>${formatNumber(row.energia_ac_neta_gwh_nasa_2025, 1)} GWh</td></tr>`;
    }).join("");
  }

  function verifySubmodelTotals(bundle) {
    const submodelos = Array.isArray(bundle.submodelos) ? bundle.submodelos : [];
    const tmy = findCompareCase(bundle.kpis, /tmy/i, 0);
    const nasa = findCompareCase(bundle.kpis, /nasa/i, 1);
    const sumTmy = submodelos.reduce((acc, row) => acc + (Number(row.energia_ac_neta_gwh_tmy) || 0), 0);
    const sumNasa = submodelos.reduce((acc, row) => acc + (Number(row.energia_ac_neta_gwh_nasa_2025) || 0), 0);
    if (Math.abs(sumTmy - (Number(tmy.energia_ac_neta_gwh_anio) || 0)) > 0.2) {
      console.warn("[Planta FV] La suma SC01-SC06 TMY no coincide con la energía total TMY.", { sumTmy, total: tmy.energia_ac_neta_gwh_anio });
    }
    if (Math.abs(sumNasa - (Number(nasa.energia_ac_neta_gwh_anio) || 0)) > 0.2) {
      console.warn("[Planta FV] La suma SC01-SC06 NASA no coincide con la energía total NASA 2025.", { sumNasa, total: nasa.energia_ac_neta_gwh_anio });
    }
  }

  function renderPlantMonthlyEnergy(mensual) {
    const canvas = byId("plantMonthlyEnergyChart");
    if (!canvas || !Array.isArray(mensual)) return;

    const blue = getCssColor("--blue", "#2689ff");
    const green = getCssColor("--green", "#76ff45");
    const labels = mensual.map((row) => row.mes_nombre || row.mes_corto || row.mes);

    plantEnergyState.charts.monthlyEnergy = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          barDataset("AC neta", mensual.map((row) => row.energia_ac_neta_gwh), green),
          barDataset("DC", mensual.map((row) => row.energia_dc_gwh), blue),
        ],
      },
      options: chartBaseOptions({
        scales: {
          x: {
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.1)" },
          },
          y: {
            title: { display: true, text: "GWh", color: "#b8cbe3" },
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.14)" },
          },
        },
      }),
    });
  }

  function renderPlantHourlyProfile(perfil) {
    const canvas = byId("plantHourlyProfileChart");
    if (!canvas || !Array.isArray(perfil)) return;

    const cyan = getCssColor("--cyan", "#31b7ff");
    const yellow = getCssColor("--yellow", "#ffd21f");
    const labels = perfil.map((row) => row.hora_label || `${String(row.hora).padStart(2, "0")}:00`);

    plantEnergyState.charts.hourlyProfile = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          lineDataset("AC promedio", perfil.map((row) => row.potencia_ac_prom_mw), cyan),
          lineDataset("DC promedio", perfil.map((row) => row.potencia_dc_prom_mw), yellow),
        ],
      },
      options: chartBaseOptions({
        scales: {
          x: {
            ticks: { color: "#b8cbe3", maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
            grid: { color: "rgba(140, 170, 210, 0.1)" },
          },
          y: {
            title: { display: true, text: "MW", color: "#b8cbe3" },
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.14)" },
          },
        },
      }),
    });
  }

  function renderPlantPoaOrientation(mensual) {
    const canvas = byId("plantPoaOrientationChart");
    if (!canvas || !Array.isArray(mensual)) return;

    const green = getCssColor("--green", "#76ff45");
    const orange = getCssColor("--orange", "#ff8a00");
    const labels = mensual.map((row) => row.mes_nombre || row.mes_corto || row.mes);
    const east = mensual.map((row) => plantNumber(row.poa_este_kwh_m2));
    const west = mensual.map((row) => plantNumber(row.poa_oeste_kwh_m2));
    const hasPoa = [...east, ...west].some((value) => value !== null && value !== undefined);

    if (!hasPoa) {
      plantEnergyState.charts.poaOrientation = new Chart(canvas, {
        type: "line",
        data: { labels: ["Sin dato"], datasets: [] },
        options: chartBaseOptions({
          plugins: {
            ...chartBaseOptions().plugins,
            legend: { display: false },
            title: {
              display: true,
              text: "POA Este/Oeste mensual no disponible en los JSON SAM actuales",
              color: "#b8cbe3",
              font: { size: 13, weight: "700" },
              padding: { top: 70 },
            },
          },
          scales: {
            x: { display: false },
            y: { display: false, beginAtZero: true },
          },
        }),
      });
      return;
    }

    plantEnergyState.charts.poaOrientation = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          lineDataset("POA Este", east, green),
          lineDataset("POA Oeste", west, orange),
        ],
      },
      options: chartBaseOptions({
        scales: {
          x: {
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.1)" },
          },
          y: {
            title: { display: true, text: "kWh/m²", color: "#b8cbe3" },
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.14)" },
            beginAtZero: true,
          },
        },
      }),
    });
  }

  function renderPlantSubmodelEnergy(submodelos) {
    const canvas = byId("plantSubmodelEnergyChart");
    if (!canvas || !Array.isArray(submodelos)) return;

    const green = getCssColor("--green", "#76ff45");
    const orange = getCssColor("--orange", "#ff8a00");
    const labels = submodelos.map((row) => row.submodelo);
    const colors = submodelos.map((row) => row.orientacion === "Oeste" ? `${orange}cc` : `${green}cc`);

    plantEnergyState.charts.submodelEnergy = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            ...barDataset("AC neta", submodelos.map((row) => row.energia_ac_neta_gwh), green),
            backgroundColor: colors,
            borderColor: colors,
          },
        ],
      },
      options: chartBaseOptions({
        plugins: {
          ...chartBaseOptions().plugins,
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.1)" },
          },
          y: {
            title: { display: true, text: "GWh", color: "#b8cbe3" },
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.14)" },
          },
        },
      }),
    });
  }

  function renderPlantOrientationBalance(balance) {
    const canvas = byId("plantOrientationBalanceChart");
    if (!canvas || !Array.isArray(balance)) return;

    const green = getCssColor("--green", "#76ff45");
    const orange = getCssColor("--orange", "#ff8a00");

    plantEnergyState.charts.orientationBalance = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: balance.map((row) => row.orientacion),
        datasets: [
          {
            label: "Energía AC neta",
            data: balance.map((row) => row.energia_ac_neta_gwh),
            backgroundColor: [`${green}cc`, `${orange}cc`],
            borderColor: [green, orange],
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: "#b8cbe3",
              usePointStyle: true,
            },
          },
          tooltip: {
            backgroundColor: "rgba(3, 18, 34, 0.96)",
            titleColor: "#ffffff",
            bodyColor: "#d7e8ff",
            callbacks: {
              label: (context) => `${context.label}: ${formatNumber(context.raw, 1)} GWh`,
            },
          },
        },
      },
    });
  }

  function renderPlantCompareMonthly(mensual) {
    const canvas = byId("plantMonthlyEnergyChart");
    if (!canvas || !Array.isArray(mensual)) return;

    const blue = getCssColor("--blue", "#2689ff");
    const cyan = getCssColor("--cyan", "#31b7ff");
    const green = getCssColor("--green", "#76ff45");
    const yellow = getCssColor("--yellow", "#ffd21f");
    const labels = mensual.map((row) => row.mes_nombre || row.mes_corto || row.mes);

    plantEnergyState.charts.monthlyEnergy = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          barDataset("AC TMY", mensual.map((row) => row.energia_ac_neta_gwh_tmy), green),
          barDataset("AC NASA 2025", mensual.map((row) => row.energia_ac_neta_gwh_nasa_2025), cyan),
          barDataset("DC TMY", mensual.map((row) => row.energia_dc_gwh_tmy), yellow),
          barDataset("DC NASA 2025", mensual.map((row) => row.energia_dc_gwh_nasa_2025), blue),
        ],
      },
      options: chartBaseOptions({
        scales: {
          x: {
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.1)" },
          },
          y: {
            title: { display: true, text: "GWh", color: "#b8cbe3" },
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.14)" },
          },
        },
      }),
    });
  }

  function renderPlantCompareHourly(perfil) {
    const canvas = byId("plantHourlyProfileChart");
    if (!canvas || !Array.isArray(perfil)) return;

    const blue = getCssColor("--blue", "#2689ff");
    const cyan = getCssColor("--cyan", "#31b7ff");
    const green = getCssColor("--green", "#76ff45");
    const yellow = getCssColor("--yellow", "#ffd21f");
    const labels = perfil.map((row) => row.hora_label || `${String(row.hora).padStart(2, "0")}:00`);

    plantEnergyState.charts.hourlyProfile = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          lineDataset("AC TMY", perfil.map((row) => row.potencia_ac_prom_mw_tmy), cyan),
          { ...lineDataset("AC NASA 2025", perfil.map((row) => row.potencia_ac_prom_mw_nasa_2025), green), borderDash: [6, 4] },
          lineDataset("DC TMY", perfil.map((row) => row.potencia_dc_prom_mw_tmy), yellow),
          { ...lineDataset("DC NASA 2025", perfil.map((row) => row.potencia_dc_prom_mw_nasa_2025), blue), borderDash: [6, 4] },
        ],
      },
      options: chartBaseOptions({
        scales: {
          x: {
            ticks: { color: "#b8cbe3", maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
            grid: { color: "rgba(140, 170, 210, 0.1)" },
          },
          y: {
            title: { display: true, text: "MW", color: "#b8cbe3" },
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.14)" },
          },
        },
      }),
    });
  }

  function renderPlantComparePoa(mensual) {
    const canvas = byId("plantPoaOrientationChart");
    if (!canvas || !Array.isArray(mensual)) return;

    const green = getCssColor("--green", "#76ff45");
    const orange = getCssColor("--orange", "#ff8a00");
    const cyan = getCssColor("--cyan", "#31b7ff");
    const purple = getCssColor("--purple", "#b46cff");
    const labels = mensual.map((row) => row.mes_nombre || row.mes_corto || row.mes);

    plantEnergyState.charts.poaOrientation = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          lineDataset("Este TMY", mensual.map((row) => row.poa_este_kwh_m2_tmy), green),
          { ...lineDataset("Este NASA 2025", mensual.map((row) => row.poa_este_kwh_m2_nasa_2025), cyan), borderDash: [6, 4] },
          lineDataset("Oeste TMY", mensual.map((row) => row.poa_oeste_kwh_m2_tmy), orange),
          { ...lineDataset("Oeste NASA 2025", mensual.map((row) => row.poa_oeste_kwh_m2_nasa_2025), purple), borderDash: [6, 4] },
        ],
      },
      options: chartBaseOptions({
        scales: {
          x: {
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.1)" },
          },
          y: {
            title: { display: true, text: "kWh/m²", color: "#b8cbe3" },
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.14)" },
            beginAtZero: true,
          },
        },
      }),
    });
  }

  function renderPlantCompareSubmodel(submodelos) {
    const canvas = byId("plantSubmodelEnergyChart");
    if (!canvas || !Array.isArray(submodelos)) return;

    const green = getCssColor("--green", "#76ff45");
    const blue = getCssColor("--blue", "#2689ff");
    const labels = submodelos.map((row) => row.submodelo);

    plantEnergyState.charts.submodelEnergy = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          barDataset("AC TMY", submodelos.map((row) => row.energia_ac_neta_gwh_tmy), green),
          barDataset("AC NASA 2025", submodelos.map((row) => row.energia_ac_neta_gwh_nasa_2025), blue),
        ],
      },
      options: chartBaseOptions({
        scales: {
          x: {
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.1)" },
          },
          y: {
            title: { display: true, text: "GWh", color: "#b8cbe3" },
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.14)" },
          },
        },
      }),
    });
  }

  function findBalanceValue(balance, casePattern, orientationPattern) {
    const row = Array.isArray(balance)
      ? balance.find((item) => casePattern.test(`${item.caso || ""}`) && orientationPattern.test(`${item.orientacion || ""}`))
      : null;

    return row?.energia_ac_neta_gwh ?? null;
  }

  function renderPlantCompareBalance(balance) {
    const canvas = byId("plantOrientationBalanceChart");
    if (!canvas || !Array.isArray(balance)) return;

    const green = getCssColor("--green", "#76ff45");
    const blue = getCssColor("--blue", "#2689ff");

    plantEnergyState.charts.orientationBalance = new Chart(canvas, {
      type: "bar",
      data: {
        labels: ["Este", "Oeste"],
        datasets: [
          barDataset("TMY", [
            findBalanceValue(balance, /tmy/i, /este/i),
            findBalanceValue(balance, /tmy/i, /oeste/i),
          ], green),
          barDataset("NASA 2025", [
            findBalanceValue(balance, /nasa/i, /este/i),
            findBalanceValue(balance, /nasa/i, /oeste/i),
          ], blue),
        ],
      },
      options: chartBaseOptions({
        scales: {
          x: {
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.1)" },
          },
          y: {
            title: { display: true, text: "GWh", color: "#b8cbe3" },
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.14)" },
          },
        },
      }),
    });
  }

  function renderSinglePlantEnergyBundle(bundle) {
    setCompareDetailsVisible(false);
    renderPlantEnergyKpis(bundle.kpis);
    renderPlantMonthlyEnergy(bundle.mensual);
    renderPlantHourlyProfile(bundle.perfil_horario);
    renderPlantPoaOrientation(bundle.mensual);
    renderPlantSubmodelEnergy(bundle.submodelos);
    renderPlantOrientationBalance(bundle.balance_orientacion);
  }

  function renderComparePlantEnergyBundle(bundle) {
    setCompareDetailsVisible(true);
    renderPlantCompareKpis(bundle.kpis);
    renderPlantCompareDiffTable(bundle.comparativa_kpis);
    renderPlantCompareMonthly(bundle.mensual);
    renderPlantCompareHourly(bundle.perfil_horario);
    renderPlantComparePoa(bundle.mensual);
    renderPlantCompareSubmodel(bundle.submodelos);
    renderPlantCompareSubmodelTable(bundle.submodelos);
    renderPlantCompareBalance(bundle.balance_orientacion);
    verifySubmodelTotals(bundle);
  }

  async function renderPlantEnergyView(mode) {
    const nextMode = normalizePlantEnergyMode(mode);
    const source = PLANT_ENERGY_SOURCES[nextMode];
    plantEnergyState.currentMode = nextMode;
    setActiveEnergyModeButton(nextMode);

    if (plantEnergyState.renderedMode === nextMode && Object.keys(plantEnergyState.charts).length) {
      return;
    }

    setPlantEnergyHeader(source);
    setPlantEnergyStatus("CARGANDO");
    const bundle = await loadPlantBundle(nextMode);

    if (plantEnergyState.currentMode !== nextMode) return;

    if (!bundle) {
      destroyPlantCharts();
      plantEnergyState.renderedMode = null;
      setPlantEnergyStatus("ERROR DATOS", true);
      setText("plantEnergyMeta", `No se pudo cargar ${source.url}`);
      return;
    }

    setPlantEnergyHeader(source, bundle);
    setPlantEnergyStatus(source.status);
    destroyPlantCharts();
    if (typeof Chart === "undefined") {
      console.error("Chart.js no esta cargado.");
      return;
    }

    if (source.type === "compare") {
      renderComparePlantEnergyBundle(bundle);
    } else {
      renderSinglePlantEnergyBundle(bundle);
    }

    plantEnergyState.renderedMode = nextMode;
  }

  window.renderPlantEnergyView = renderPlantEnergyView;
  window.getActivePlantEnergyMode = () => plantEnergyState.currentMode;
})();


/* ============================================================
   SAM VS CEN 2025
   ============================================================ */
(function () {
  const SAM_CEN_DATA_URLS = {
    validationBundle: "data/validacion_fv_ceme1_dashboard_bundle.json",
    validationLite: "data/validacion_fv_ceme1_dashboard_lite.json",
  };

  const samCenState = {
    bundle: null,
    loaded: false,
    rendered: false,
    charts: {},
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const el = byId(id);
    if (el) el.textContent = value;
  }

  function formatNumber(value, decimals = 1) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return "--";
    }

    return Number(value).toLocaleString("es-CL", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function annualDisplayDelta(a, b) {
    const left = Number(a);
    const right = Number(b);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    return Number(left.toFixed(1)) - Number(right.toFixed(1));
  }

  function getCssColor(variableName, fallback) {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(variableName)
      .trim();

    return value || fallback;
  }

  function setSamCenStatus(text, isError = false) {
    const statusEl = byId("samCenStatus");
    if (statusEl) statusEl.classList.toggle("error", isError);
    setText("samCenStatus", text);
  }

  function destroySamCenCharts() {
    Object.values(samCenState.charts).forEach((chart) => {
      if (chart && typeof chart.destroy === "function") {
        chart.destroy();
      }
    });

    samCenState.charts = {};
  }

  function chartBaseOptions(extra = {}) {
    const tickColor = "#b8cbe3";
    const gridColor = "rgba(140, 170, 210, 0.14)";

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          labels: {
            color: tickColor,
            boxWidth: 14,
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: "rgba(3, 18, 34, 0.96)",
          titleColor: "#ffffff",
          bodyColor: "#d7e8ff",
          borderColor: "rgba(91, 141, 196, 0.45)",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          ticks: { color: tickColor },
          grid: { color: gridColor },
        },
        y: {
          ticks: { color: tickColor },
          grid: { color: gridColor },
        },
      },
      ...extra,
    };
  }

  function barDataset(label, data, color, yAxisID = "y") {
    return {
      label,
      data,
      backgroundColor: `${color}cc`,
      borderColor: color,
      borderWidth: 1,
      borderRadius: 4,
      yAxisID,
    };
  }

  function lineDataset(label, data, color, yAxisID = "y") {
    return {
      label,
      data,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 4,
      tension: 0.28,
      fill: false,
      yAxisID,
    };
  }

  async function loadSamCenBundle() {
    if (samCenState.loaded && samCenState.bundle) {
      return samCenState.bundle;
    }

    try {
      const rawBundle = await loadJsonWithFallback(SAM_CEN_DATA_URLS.validationBundle, SAM_CEN_DATA_URLS.validationLite);
      const bundle = normalizeValidationSamCenBundle(rawBundle);
      bundle.__sourceUrl = SAM_CEN_DATA_URLS.validationBundle;
      samCenState.bundle = bundle;
      samCenState.loaded = true;
      return bundle;
    } catch (error) {
      console.warn(`No se pudo cargar ${SAM_CEN_DATA_URLS.validationBundle}:`, error);
    }

    console.error("No se pudo cargar SAM vs CEN 2025 desde ningÃºn JSON disponible.");
    return null;
  }

  function numberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function readKpi(kpis, keys) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(kpis || {}, key)) {
        const value = numberOrNull(kpis[key]);
        if (value !== null) return value;
      }
    }
    return null;
  }

  function normalizeValidationMetricRows(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const comparison = row.comparacion || row.nombre || "";
      const caseName = /tmy/i.test(comparison)
        ? "SAM_TMY"
        : /pron|centralizado/i.test(comparison)
          ? "PRONOSTICO_CENTRALIZADO_CEN"
          : "SAM_NASA_2025";
      const reference = /real/i.test(comparison)
        ? "CEN inyeccion real"
        : /pron|centralizado/i.test(comparison) && !/^pron/i.test(comparison)
          ? "Pronostico centralizado CEN"
          : "CEN disponible = inyeccion + curtailment";

      return {
        ...row,
        caso_sam: row.caso_sam || caseName,
        fuente_meteorologica: row.fuente_meteorologica || comparison,
        referencia: row.referencia || reference,
        filtro: row.filtro || row.normalizacion_nrmse || "todas_las_horas",
        mbe: row.mbe ?? row.mbe_mwh,
        mae: row.mae ?? row.mae_mwh,
        rmse: row.rmse ?? row.rmse_mwh,
        corr_pearson: row.corr_pearson ?? row.correlacion_r ?? row.r,
        delta_pct: row.delta_pct ?? row.sesgo_anual_pct,
      };
    });
  }

  function normalizeValidationSamCenBundle(raw) {
    const kpis = raw?.kpis || {};
    const samNasa = readKpi(kpis, ["energia_sam_nasa_2025_gwh", "sam_nasa_2025_gwh"]);
    const samTmy = readKpi(kpis, ["energia_sam_tmy_explorador_solar_gwh", "energia_sam_tmy_gwh", "sam_tmy_gwh"]);
    const centralizado = readKpi(kpis, ["energia_pronostico_centralizado_cen_gwh", "pronostico_centralizado_cen_gwh"]);
    const disponible = readKpi(kpis, ["energia_cen_disponible_gwh", "cen_disponible_gwh"]);
    const real = readKpi(kpis, ["energia_generacion_real_cen_gwh", "generacion_real_cen_gwh"]);
    const reducciones = readKpi(kpis, ["energia_reducciones_cen_gwh", "reducciones_cen_gwh"]);
    const factor = readKpi(kpis, ["factor_reducciones_cen_pct", "factor_curtailment_pct"]);
    const delta1Direct = readKpi(kpis, ["delta_1_sam_centralizado_gwh", "delta_e1_gwh"]);
    const delta2Direct = readKpi(kpis, ["delta_2_centralizado_disponible_gwh", "delta_e2_gwh"]);
    const delta3Direct = readKpi(kpis, ["delta_3_reducciones_gwh", "delta_e3_gwh"]);
    const delta1 = delta1Direct ?? (samNasa !== null && centralizado !== null ? samNasa - centralizado : null);
    const delta2 = delta2Direct ?? (centralizado !== null && disponible !== null ? centralizado - disponible : null);
    const delta3 = delta3Direct ?? (disponible !== null && real !== null ? disponible - real : reducciones);
    const residuoDisponible = readKpi(kpis, ["residuo_sam_nasa_vs_cen_disponible_gwh", "residuo_sam_nasa_2025_menos_cen_disponible_gwh"]) ?? (samNasa !== null && disponible !== null ? samNasa - disponible : null);
    const residuoTotal = readKpi(kpis, ["residuo_total_sam_nasa_generacion_real_gwh", "residuo_total_sam_real_gwh"]) ?? (samNasa !== null && real !== null ? samNasa - real : null);
    const mensual = Array.isArray(raw?.mensual) ? raw.mensual : [];
    const indicadores = normalizeValidationMetricRows(raw?.metricas || raw?.indicadores);

    return {
      metadata: { ...(raw?.metadata || {}), planta: raw?.metadata?.planta || "CEME1", anio: raw?.metadata?.anio || "2025", comparacion: raw?.metadata?.descripcion || "SAM NASA 2025 vs CEN" },
      cen_kpis: {
        energia_inyectada_cen_gwh: real,
        energia_curtailment_cen_gwh: reducciones,
        energia_curtailment_common_forecast_gwh: readKpi(kpis, ["reducciones_cen_common_forecast_gwh"]) ?? delta3,
        energia_disponible_cen_gwh: disponible,
        energia_pronostico_centralizado_cen_gwh: centralizado,
        horas_t_full: readKpi(kpis, ["horas_t_full"]),
        horas_t_common_forecast: readKpi(kpis, ["horas_t_common_forecast"]),
        horas_pronostico_centralizado_cen: readKpi(kpis, ["energia_pronostico_centralizado_cen_horas", "horas_pronostico_centralizado_cen"]),
        control_deltas_error_gwh: readKpi(kpis, ["control_deltas_error_gwh"]),
        factor_curtailment_anual_pct: factor,
        delta_1_sam_centralizado_gwh: delta1,
        delta_2_centralizado_disponible_gwh: delta2,
        delta_3_reducciones_gwh: delta3,
        residuo_sam_nasa_cen_disponible_gwh: residuoDisponible,
        residuo_total_sam_nasa_generacion_real_gwh: residuoTotal,
      },
      sam_kpis: [
        { caso_sam: "SAM_TMY", fuente_meteorologica: "SAM TMY Explorador Solar", energia_ac_neta_gwh: samTmy },
        { caso_sam: "SAM_NASA_2025", fuente_meteorologica: "SAM NASA 2025", energia_ac_neta_gwh: samNasa },
      ],
      resumen_anual: [
        { caso_sam: "SAM_TMY", fuente_meteorologica: "SAM TMY Explorador Solar", sam_ac_gwh: samTmy, cen_disponible_gwh: disponible, cen_inyeccion_gwh: real, cen_curtailment_gwh: reducciones, sam_menos_cen_disponible_gwh: samTmy !== null && disponible !== null ? samTmy - disponible : null },
        { caso_sam: "SAM_NASA_2025", fuente_meteorologica: "SAM NASA 2025", sam_ac_gwh: samNasa, cen_disponible_gwh: disponible, cen_inyeccion_gwh: real, cen_curtailment_gwh: reducciones, sam_menos_cen_disponible_gwh: residuoDisponible },
      ],
      indicadores,
      mensual: mensual.flatMap((row) => {
        const month = row.mes_nombre || row.mes;
        const rowSamNasa = numberOrNull(row.energia_sam_nasa_2025_gwh ?? row.sam_nasa_2025_gwh);
        const rowCentralizado = numberOrNull(row.energia_pronostico_centralizado_cen_gwh ?? row.pronostico_centralizado_cen_gwh);
        const rowDisponible = numberOrNull(row.energia_cen_disponible_gwh ?? row.cen_disponible_gwh);
        const rowReal = numberOrNull(row.energia_generacion_real_cen_gwh ?? row.generacion_real_cen_gwh);
        const rowReducciones = numberOrNull(row.energia_reducciones_cen_gwh ?? row.reducciones_cen_gwh);
        const base = {
          mes: row.mes,
          mes_nombre: month,
          cen_inyeccion_gwh: rowReal,
          cen_curtailment_gwh: rowReducciones,
          cen_disponible_gwh: rowDisponible,
          pronostico_centralizado_cen_gwh: rowCentralizado,
          horas_t_full: numberOrNull(row.horas_t_full),
          horas_t_common_forecast: numberOrNull(row.horas_t_common_forecast),
          cobertura_t_full: row.cobertura_t_full,
          cobertura_t_common_forecast: row.cobertura_t_common_forecast,
          delta_1_sam_centralizado_gwh: numberOrNull(row.delta_1_sam_centralizado_gwh) ?? (rowSamNasa !== null && rowCentralizado !== null ? rowSamNasa - rowCentralizado : null),
          delta_2_centralizado_disponible_gwh: numberOrNull(row.delta_2_centralizado_disponible_gwh) ?? (rowCentralizado !== null && rowDisponible !== null ? rowCentralizado - rowDisponible : null),
          delta_3_reducciones_gwh: numberOrNull(row.delta_3_reducciones_gwh) ?? (rowDisponible !== null && rowReal !== null ? rowDisponible - rowReal : rowReducciones),
        };
        return [
          {
            ...base,
            caso_sam: "SAM_TMY",
            fuente_meteorologica: "SAM TMY Explorador Solar",
            sam_e_ac_gwh: row.energia_sam_tmy_explorador_solar_gwh ?? row.sam_tmy_gwh,
            residuo_sam_menos_cen_disp_gwh: numberOrNull(row.sam_tmy_gwh) !== null && numberOrNull(base.cen_disponible_gwh) !== null ? numberOrNull(row.sam_tmy_gwh) - numberOrNull(base.cen_disponible_gwh) : null,
          },
          {
            ...base,
            caso_sam: "SAM_NASA_2025",
            fuente_meteorologica: "SAM NASA 2025",
            sam_e_ac_gwh: row.energia_sam_nasa_2025_gwh ?? row.sam_nasa_2025_gwh,
            residuo_sam_menos_cen_disp_gwh: row.residuo_sam_nasa_cen_disponible_gwh ?? (numberOrNull(row.sam_nasa_2025_gwh) !== null && numberOrNull(base.cen_disponible_gwh) !== null ? numberOrNull(row.sam_nasa_2025_gwh) - numberOrNull(base.cen_disponible_gwh) : null),
          },
        ];
      }),
      perfil_horario: [],
    };
  }

  function findSamCase(rows, pattern) {
    return Array.isArray(rows)
      ? rows.find((row) => pattern.test(`${row.caso_sam || ""} ${row.fuente_meteorologica || ""}`)) || {}
      : {};
  }

  function splitByCase(rows) {
    return {
      tmy: Array.isArray(rows) ? rows.filter((row) => /tmy/i.test(`${row.caso_sam || ""}`)) : [],
      nasa: Array.isArray(rows) ? rows.filter((row) => /nasa/i.test(`${row.caso_sam || ""}`)) : [],
    };
  }

  async function ensureSamCenHourlyRows() {
    if (Array.isArray(scadaHourlyRows) && scadaHourlyRows.length) return scadaHourlyRows;

    try {
      const json = await loadJsonWithFallback(SCADA_HOURLY_URL);
      scadaHourlyRows = Array.isArray(json) ? json : [];
    } catch (error) {
      console.warn("No se pudo cargar el JSON horario para los perfiles SAM/CEN:", error);
      return [];
    }

    return scadaHourlyRows;
  }

  function averageField(rows, key) {
    const values = rows
      .map((row) => Number(row[key]))
      .filter((value) => Number.isFinite(value));
    return values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : null;
  }

  function buildSamCenHourlyProfile(rows) {
    if (!Array.isArray(rows) || !rows.length) return [];

    const groups = new Map();
    rows.map(normalizeScadaRow).forEach((row) => {
      if (!row || !row.datetime) return;
      const date = new Date(row.datetime);
      if (!Number.isFinite(date.getTime())) return;
      const caseText = `${row.caso_sam || ""} ${row.fuente_meteorologica || ""}`;
      const caso = /tmy/i.test(caseText) ? "SAM_TMY" : "SAM_NASA_2025";
      const fuente = caso === "SAM_TMY" ? "SAM TMY Explorador Solar" : "SAM NASA 2025";
      const hour = date.getHours();
      const key = `${caso}|${hour}`;
      if (!groups.has(key)) groups.set(key, { caso_sam: caso, fuente_meteorologica: fuente, hora: hour, rows: [] });
      groups.get(key).rows.push(row);
    });

    return Array.from(groups.values())
      .map((group) => ({
        caso_sam: group.caso_sam,
        fuente_meteorologica: group.fuente_meteorologica,
        hora: group.hora,
        hora_label: `${String(group.hora).padStart(2, "0")}:00`,
        sam_e_ac_prom_mwh: averageField(group.rows, "sam_e_ac_mwh"),
        cen_inyeccion_prom_mwh: averageField(group.rows, "generacion_real_cen_mwh"),
        cen_curtailment_prom_mwh: averageField(group.rows, "reducciones_cen_mwh"),
        cen_disponible_prom_mwh: averageField(group.rows, "cen_disponible_mwh"),
        precio_prom_usd_mwh: averageField(group.rows, "precio_spot_usd_mwh"),
      }))
      .sort((a, b) => {
        const caseOrder = a.caso_sam.localeCompare(b.caso_sam);
        return caseOrder || a.hora - b.hora;
      });
  }

  function renderSamCenKpis(bundle) {
    const cen = bundle.cen_kpis || {};
    const samTmy = findSamCase(bundle.sam_kpis, /tmy/i);
    const samNasa = findSamCase(bundle.sam_kpis, /nasa/i);
    const summaryTmy = findSamCase(bundle.resumen_anual, /tmy/i);
    const summaryNasa = findSamCase(bundle.resumen_anual, /nasa/i);
    const centralizado = cen.energia_pronostico_centralizado_cen_gwh;
    const delta1 = cen.delta_1_sam_centralizado_gwh ?? (
      Number.isFinite(Number(samNasa.energia_ac_neta_gwh)) && Number.isFinite(Number(centralizado))
        ? Number(samNasa.energia_ac_neta_gwh) - Number(centralizado)
        : null
    );
    const delta2 = cen.delta_2_centralizado_disponible_gwh ?? (
      Number.isFinite(Number(centralizado)) && Number.isFinite(Number(cen.energia_disponible_cen_gwh))
        ? Number(centralizado) - Number(cen.energia_disponible_cen_gwh)
        : null
    );
    const delta3 = cen.delta_3_reducciones_gwh ?? cen.energia_curtailment_common_forecast_gwh ?? (
      Number.isFinite(Number(cen.energia_disponible_cen_gwh)) && Number.isFinite(Number(cen.energia_inyectada_cen_gwh))
        ? Number(cen.energia_disponible_cen_gwh) - Number(cen.energia_inyectada_cen_gwh)
        : cen.energia_curtailment_cen_gwh
    );

    setText("samCenKpiInjection", formatNumber(cen.energia_inyectada_cen_gwh, 1));
    setText("samCenKpiCurtailment", formatNumber(cen.energia_curtailment_cen_gwh, 1));
    setText("samCenKpiAvailable", formatNumber(cen.energia_disponible_cen_gwh, 1));
    setText("samCenKpiCurtailmentFactor", formatNumber(cen.factor_curtailment_anual_pct, 1));
    setText("samCenKpiTmyAnnual", formatNumber(centralizado, 1));
    setText("samCenKpiNasaAnnual", formatNumber(samNasa.energia_ac_neta_gwh, 1));
    setText("samCenKpiTmyDelta", formatNumber(delta1, 1));
    setText("samCenKpiTmyDeltaPct", "Cobertura: 8736 h comunes");
    setText("samCenKpiNasaDelta", formatNumber(delta2, 1));
    setText("samCenKpiNasaDeltaPct", "Cobertura: 8736 h comunes");
    setText("samCenKpiDelta3", formatNumber(delta3, 1));
    setText("samCenKpiDelta3Note", "Reducciones CEN en 8736 h comunes");
  }

  function renderSamCenHeader(bundle) {
    setText("samCenHeaderPlant", bundle.metadata?.planta || "CEME1");
    setText("samCenHeaderYear", bundle.metadata?.anio || "2025");
    setText("samCenHeaderBus", "Miraje 220 kV");
  }

  function renderSamCenFlow(bundle) {
    const cen = bundle.cen_kpis || {};
    const samTmy = findSamCase(bundle.sam_kpis, /tmy/i);
    const samNasa = findSamCase(bundle.sam_kpis, /nasa/i);

    setText("samCenFlowTmy", formatNumber(samTmy.energia_ac_neta_gwh, 1));
    setText("samCenFlowNasa", formatNumber(samNasa.energia_ac_neta_gwh, 1));
    setText("samCenFlowAvailable", formatNumber(cen.energia_disponible_cen_gwh, 1));
    setText("samCenFlowInjection", formatNumber(cen.energia_inyectada_cen_gwh, 1));
    setText("samCenFlowCurtailment", formatNumber(cen.energia_curtailment_cen_gwh, 1));
  }

  function findTechnicalIndicator(indicators, pattern) {
    if (!Array.isArray(indicators)) return {};

    return indicators.find((row) =>
      pattern.test(`${row.caso_sam || ""}`) &&
      row.referencia === "CEN disponible = inyeccion + curtailment" &&
      row.filtro === "todas_las_horas"
    ) || indicators.find((row) =>
      pattern.test(`${row.caso_sam || ""}`) &&
      row.referencia === "CEN disponible = inyeccion + curtailment"
    ) || {};
  }

  function getNrmseState(nrmse) {
    const value = Number(nrmse);
    if (!Number.isFinite(value)) return { className: "state-unknown", label: "--" };
    if (value < 15) return { className: "state-ok", label: "OK" };
    if (value <= 25) return { className: "state-warn", label: "ADVERTENCIA" };
    return { className: "state-alarm", label: "ALTO RESIDUO" };
  }

  function updateInstrument(prefix, cardId, row) {
    const state = getNrmseState(row.nrmse_pct);
    const card = byId(cardId);
    if (card) {
      card.classList.remove("state-ok", "state-warn", "state-alarm", "state-unknown", "best");
      card.classList.add(state.className);
    }

    setText(`${prefix}Semaphore`, state.label);
    setText(`${prefix}Nrmse`, formatNumber(row.nrmse_pct, 1));
    setText(`${prefix}Rmse`, formatNumber(row.rmse, 1));
    setText(`${prefix}Mbe`, formatNumber(row.mbe, 1));
    setText(`${prefix}Mae`, formatNumber(row.mae, 1));
    setText(`${prefix}Corr`, formatNumber(row.corr_pearson, 3));
    setText(`${prefix}Delta`, `${formatNumber(row.delta_pct, 1)} %`);
  }

  function formatCoverage(row) {
    const hours = row?.horas_cobertura ?? row?.n ?? row?.cobertura_horas;
    if (hours) return `${formatNumber(hours, 0)} h`;
    return row?.cobertura_temporal || row?.filtro || "--";
  }

  function renderSamCenInstruments(indicators) {
    const tmy = findTechnicalIndicator(indicators, /tmy/i);
    const nasa = findTechnicalIndicator(indicators, /nasa/i);
    const nasaBetter = Number(nasa.nrmse_pct) < Number(tmy.nrmse_pct) &&
      Number(nasa.rmse) < Number(tmy.rmse) &&
      Math.abs(Number(nasa.mbe)) < Math.abs(Number(tmy.mbe));

    updateInstrument("samCenTmy", "samCenTmyInstrument", tmy);
    updateInstrument("samCenNasa", "samCenNasaInstrument", nasa);

    setText("samCenTmyBadge", "SAM TMY EXPLORADOR SOLAR");
    setText("samCenNasaBadge", nasaBetter ? "MEJOR AJUSTE SAM NASA 2025" : "SAM NASA 2025");

    const nasaCard = byId("samCenNasaInstrument");
    const tmyCard = byId("samCenTmyInstrument");
    if (nasaCard) nasaCard.classList.toggle("best", nasaBetter);
    if (tmyCard) tmyCard.classList.toggle("best", !nasaBetter);
  }

  function appendIndicatorRow(tbody, row) {
    const tr = document.createElement("tr");
    tr.classList.add(getNrmseState(row.nrmse_pct).className);
    [
      displaySamCase(row.caso_sam, row.fuente_meteorologica),
      displayReference(row.referencia),
      formatCoverage(row),
      formatNumber(row.mbe, 2),
      formatNumber(row.mae, 2),
      formatNumber(row.rmse, 2),
      `${formatNumber(row.nrmse_pct, 1)} %`,
      formatNumber(row.corr_pearson, 3),
      `${formatNumber(row.delta_pct, 1)} %`,
    ].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value || "--";
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  }

  function renderSamCenIndicators(indicators) {
    const technicalBody = byId("samCenTechnicalTableBody");
    const operationalBody = byId("samCenOperationalTableBody");
    if (!technicalBody || !operationalBody) return;

    technicalBody.replaceChildren();
    operationalBody.replaceChildren();

    (Array.isArray(indicators) ? indicators : []).forEach((row) => {
      if (row.referencia === "CEN disponible = inyeccion + curtailment") {
        appendIndicatorRow(technicalBody, row);
      }

      if (row.referencia === "CEN inyeccion real") {
        appendIndicatorRow(operationalBody, row);
      }
    });
  }

  function renderSamCenAnnualChart(bundle) {
    const canvas = byId("samCenAnnualChart");
    if (!canvas) return;

    const cen = bundle.cen_kpis || {};
    const samTmy = findSamCase(bundle.sam_kpis, /tmy/i);
    const samNasa = findSamCase(bundle.sam_kpis, /nasa/i);
    const cyan = getCssColor("--cyan", "#31b7ff");
    const green = getCssColor("--green", "#76ff45");
    const blue = getCssColor("--blue", "#2689ff");
    const yellow = getCssColor("--yellow", "#ffd21f");

    samCenState.charts.annual = new Chart(canvas, {
      type: "bar",
      data: {
        labels: ["Generación real CEN", "CEN disponible", "SAM TMY Explorador Solar", "SAM NASA 2025"],
        datasets: [{
          label: "Energía anual",
          data: [
            cen.energia_inyectada_cen_gwh,
            cen.energia_disponible_cen_gwh,
            samTmy.energia_ac_neta_gwh,
            samNasa.energia_ac_neta_gwh,
          ],
          backgroundColor: [`${cyan}cc`, `${yellow}cc`, `${green}cc`, `${blue}cc`],
          borderColor: [cyan, yellow, green, blue],
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: chartBaseOptions({
        plugins: {
          ...chartBaseOptions().plugins,
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.1)" },
          },
          y: {
            title: { display: true, text: "GWh", color: "#b8cbe3" },
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.14)" },
          },
        },
      }),
    });
  }

  function renderSamCenMonthlyChart(mensual) {
    const canvas = byId("samCenMonthlyChart");
    if (!canvas || !Array.isArray(mensual)) return;

    const { tmy, nasa } = splitByCase(mensual);
    const baseRows = nasa.length ? nasa : tmy;
    const labels = baseRows.map((row) => row.mes_nombre || row.mes);
    const cyan = getCssColor("--cyan", "#31b7ff");
    const yellow = getCssColor("--yellow", "#ffd21f");
    const green = getCssColor("--green", "#76ff45");
    const blue = getCssColor("--blue", "#2689ff");
    const orange = getCssColor("--orange", "#ff8a00");
    const purple = getCssColor("--purple", "#b46cff");

    samCenState.charts.monthly = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { ...lineDataset("SAM NASA 2025", baseRows.map((row) => row.sam_e_ac_gwh), blue), type: "line" },
          { ...lineDataset("Pronóstico centralizado CEN", baseRows.map((row) => row.pronostico_centralizado_cen_gwh), purple), type: "line" },
          { ...lineDataset("CEN disponible", baseRows.map((row) => row.cen_disponible_gwh), yellow), type: "line" },
          { ...lineDataset("Generación real CEN", baseRows.map((row) => row.cen_inyeccion_gwh), cyan), type: "line" },
          barDataset("Reducciones CEN (curtailment)", baseRows.map((row) => row.cen_curtailment_gwh), orange),
        ],
      },
      options: chartBaseOptions({
        scales: {
          x: {
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.1)" },
            stacked: false,
          },
          y: {
            title: { display: true, text: "GWh", color: "#b8cbe3" },
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.14)" },
            stacked: false,
          },
        },
      }),
    });
  }

  function renderSamCenResidualChart(mensual) {
    const canvas = byId("samCenResidualChart");
    if (!canvas || !Array.isArray(mensual)) return;

    const { tmy, nasa } = splitByCase(mensual);
    const labels = tmy.map((row) => row.mes_nombre || row.mes);
    const green = getCssColor("--green", "#76ff45");
    const blue = getCssColor("--blue", "#2689ff");

    samCenState.charts.residual = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          barDataset("Residuo SAM TMY Explorador Solar − CEN disponible", tmy.map((row) => row.residuo_sam_menos_cen_disp_gwh), green),
          barDataset("Residuo SAM NASA 2025 − CEN disponible", nasa.map((row) => row.residuo_sam_menos_cen_disp_gwh), blue),
        ],
      },
      options: chartBaseOptions({
        scales: {
          x: {
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.1)" },
          },
          y: {
            title: { display: true, text: "GWh", color: "#b8cbe3" },
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.14)" },
          },
        },
      }),
    });
  }

  function renderSamCenHourlyChart(perfil) {
    const canvas = byId("samCenHourlyChart");
    if (!canvas || !Array.isArray(perfil)) return;

    const { tmy, nasa } = splitByCase(perfil);
    const labels = tmy.map((row) => row.hora_label || `${String(row.hora).padStart(2, "0")}:00`);
    const cyan = getCssColor("--cyan", "#31b7ff");
    const yellow = getCssColor("--yellow", "#ffd21f");
    const green = getCssColor("--green", "#76ff45");
    const blue = getCssColor("--blue", "#2689ff");

    samCenState.charts.hourly = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          lineDataset("Generación real CEN", tmy.map((row) => row.cen_inyeccion_prom_mwh), cyan),
          lineDataset("CEN disponible", tmy.map((row) => row.cen_disponible_prom_mwh), yellow),
          lineDataset("SAM TMY Explorador Solar", tmy.map((row) => row.sam_e_ac_prom_mwh), green),
          { ...lineDataset("SAM NASA 2025", nasa.map((row) => row.sam_e_ac_prom_mwh), blue), borderDash: [6, 4] },
        ],
      },
      options: chartBaseOptions({
        scales: {
          x: {
            ticks: { color: "#b8cbe3", maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
            grid: { color: "rgba(140, 170, 210, 0.1)" },
          },
          y: {
            title: { display: true, text: "MWh promedio", color: "#b8cbe3" },
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.14)" },
          },
        },
      }),
    });
  }

  function renderSamCenCurtPriceChart(perfil) {
    const canvas = byId("samCenCurtPriceChart");
    if (!canvas || !Array.isArray(perfil)) return;

    const { tmy } = splitByCase(perfil);
    const labels = tmy.map((row) => row.hora_label || `${String(row.hora).padStart(2, "0")}:00`);
    const orange = getCssColor("--orange", "#ff8a00");
    const purple = getCssColor("--purple", "#b46cff");

    samCenState.charts.curtPrice = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          barDataset("Reducciones CEN", tmy.map((row) => row.cen_curtailment_prom_mwh), orange, "y"),
          { ...lineDataset("Precio marginal", tmy.map((row) => row.precio_prom_usd_mwh), purple, "y1"), type: "line" },
        ],
      },
      options: chartBaseOptions({
        scales: {
          x: {
            ticks: { color: "#b8cbe3", maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
            grid: { color: "rgba(140, 170, 210, 0.1)" },
          },
          y: {
            title: { display: true, text: "Reducciones CEN [MWh/h]", color: "#b8cbe3" },
            ticks: { color: "#b8cbe3" },
            grid: { color: "rgba(140, 170, 210, 0.14)" },
          },
          y1: {
            position: "right",
            title: { display: true, text: "USD/MWh", color: "#b8cbe3" },
            ticks: { color: "#b8cbe3" },
            grid: { drawOnChartArea: false },
          },
        },
      }),
    });
  }

  window.renderSamCenView = async function renderSamCenView() {
    if (samCenState.rendered && Object.keys(samCenState.charts).length) return;

    setSamCenStatus("CARGANDO");
    setText("samCenMeta", "Cargando data/validacion_fv_ceme1_dashboard_bundle.json...");
    const bundle = await loadSamCenBundle();

    if (!bundle) {
      destroySamCenCharts();
      samCenState.rendered = false;
      setSamCenStatus("ERROR DATOS", true);
      setText("samCenMeta", "No se pudo cargar validacion_fv_ceme1_dashboard_bundle.json ni los bundles de respaldo");
      return;
    }

    setSamCenStatus("DATA OK");
    setText(
      "samCenMeta",
      `${bundle.metadata?.planta || "CEME1"} · ${displayComparison(bundle.metadata?.comparacion)} · ${bundle.metadata?.anio || "2025"} · ${bundle.__sourceUrl || "dashboard/data"}`
    );

    const perfilHorario = Array.isArray(bundle.perfil_horario) && bundle.perfil_horario.length
      ? bundle.perfil_horario
      : buildSamCenHourlyProfile(await ensureSamCenHourlyRows());

    renderSamCenHeader(bundle);
    renderSamCenFlow(bundle);
    renderSamCenKpis(bundle);
    renderSamCenInstruments(bundle.indicadores);
    renderSamCenIndicators(bundle.indicadores);
    destroySamCenCharts();
    renderSamCenAnnualChart(bundle);
    renderSamCenMonthlyChart(bundle.mensual);
    renderSamCenResidualChart(bundle.mensual);
    renderSamCenHourlyChart(perfilHorario);
    renderSamCenCurtPriceChart(perfilHorario);

    samCenState.rendered = true;
  };
})();


/* ============================================================
   SUBPESTAÑAS INTERNAS PLANTA FV / SIMULACIÓN ENERGÉTICA
   ============================================================ */
(function () {
  function setupSimulationPanels() {
    const target = document.getElementById("simulation-energy-panels");
    const samCenHost = document.getElementById("sam-cen-panel-host");
    const energyPanel = document.getElementById("plant-panel-energia");
    const samCenPanel = document.getElementById("plant-panel-sam-cen");

    if (!target || !energyPanel) return;

    if (energyPanel.parentElement !== target) {
      target.appendChild(energyPanel);
    }

    if (samCenHost && samCenPanel && samCenPanel.parentElement !== samCenHost) {
      samCenHost.appendChild(samCenPanel);
    }

    energyPanel.classList.add("active");
    if (samCenPanel) samCenPanel.classList.add("active");
  }

  function initPlantTabs() {
    setupSimulationPanels();

    const buttons = document.querySelectorAll(".plant-tab-btn[data-plant-panel]");
    if (!buttons.length) return;

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const panelName = button.dataset.plantPanel;
        const scope = button.closest(".dashboard-view") || document;

        scope.querySelectorAll(".plant-tab-btn[data-plant-panel]").forEach((item) => {
          item.classList.toggle("active", item === button);
        });

        scope.querySelectorAll(".plant-panel").forEach((panel) => {
          panel.classList.toggle("active", panel.id === `plant-panel-${panelName}`);
        });

        if (panelName === "energia") {
          window.renderPlantEnergyView?.(button.dataset.plantEnergyMode);
        }

        if (panelName === "sam-cen") {
          window.renderSamCenView?.();
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPlantTabs);
  } else {
    initPlantTabs();
  }
})();


/* ============================================================
   PATCH FINAL — SIMULACIÓN ENERGÉTICA + REPORTE PDF
   Reglas:
   - No elimina vistas ni gráficos.
   - No inventa valores ni usa ratios para DC/POA.
   - Simulación energética lee simulacion_energetica_sam_dashboard_bundle.json.
   - Reporte replica la estructura técnica del PDF de referencia usando JSON.
   ============================================================ */
(function () {
  const SIM_URL = "data/simulacion_energetica_sam_dashboard_bundle.json";
  const SIM_FALLBACK = "data/simulacion_energetica_sam_dashboard_lite.json";
  const VALIDACION_URL = "data/validacion_fv_ceme1_dashboard_bundle.json";
  const VALIDACION_FALLBACK = "data/validacion_fv_ceme1_dashboard_lite.json";
  const PERFIL_EO_URL = "data/perfil_este_oeste_sam_dashboard_bundle.json";
  const PERFIL_EO_FALLBACK = "data/perfil_este_oeste_sam_dashboard_lite.json";
  const SCADA_URL = "data/sam_tmy_nasa_vs_cen_horario_scada_lite.json";
  const REPORT_CLIPPING_URL = "data/clipping_sam_dashboard_bundle.json";
  const REPORT_CLIPPING_FALLBACK = "data/clipping_sam_dashboard_lite.json";
  const ARCHITECTURE_URL = "data/ceme1_architecture.json";
  const METEO_NASA_URL = "data/recurso_solar_nasa_2025_dashboard_bundle.json";

  const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const SOURCE_META = {
    tmy: {
      case: "SAM_TMY",
      pattern: /tmy/i,
      button: "tmy",
      kicker: "RESULTADOS SAM — TMY",
      title: "Desempeño energético anual equivalente",
      status: "TMY DATOS OK",
      meta: "SAM · TMY Explorador Solar de Chile · horaria",
      label: "SAM TMY Explorador Solar",
    },
    nasa: {
      case: "SAM_NASA_2025",
      pattern: /nasa|2025/i,
      button: "nasa",
      kicker: "RESULTADOS SAM — NASA POWER 2025",
      title: "Desempeño energético anual equivalente · serie 2025",
      status: "NASA DATOS OK",
      meta: "SAM · NASA POWER 2025 · horaria",
      label: "SAM NASA POWER 2025",
    },
    compare: {
      case: "COMPARE",
      button: "compare",
      kicker: "COMPARATIVA SAM — TMY VS NASA 2025",
      title: "Comparativa energética anual y horaria",
      status: "COMPARATIVA OK",
      meta: "SAM · TMY Explorador Solar de Chile vs NASA POWER 2025 · horaria",
      label: "Comparativa TMY vs NASA 2025",
    },
  };

  const state = {
    simBundle: null,
    validationBundle: null,
    profileBundle: null,
    scadaRows: null,
    reportClippingBundle: null,
    architectureBundle: null,
    meteoNasaBundle: null,
    plantCharts: {},
    architectureCharts: {},
    clippingCharts: {},
    reportCharts: {},
    currentPlantMode: "tmy",
  };

  function byId(id) { return document.getElementById(id); }
  function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }
  function setText(id, value) { const el = byId(id); if (el) el.textContent = value; }
  function setHtml(id, html) { const el = byId(id); if (el) el.innerHTML = html; }
  function n(value) { const out = Number(value); return Number.isFinite(out) ? out : null; }
  function fmt(value, decimals = 1) {
    const num = n(value);
    if (num === null) return "Dato no disponible";
    return num.toLocaleString("es-CL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  function fmtInt(value) {
    const num = n(value);
    if (num === null) return "Dato no disponible";
    return num.toLocaleString("es-CL", { maximumFractionDigits: 0 });
  }
  function pct(value, decimals = 1) { return fmt(value, decimals); }
  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function fetchJson(primary, fallback = null) {
    async function read(url) {
      const res = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      const text = await res.text();
      if (!text.trim()) throw new Error(`${url}: JSON vacío`);
      return JSON.parse(text);
    }
    try { return await read(primary); }
    catch (err) {
      if (!fallback) throw err;
      console.warn(`[Storage Analytics] Fallback JSON: ${primary} -> ${fallback}`, err);
      return await read(fallback);
    }
  }

  function destroyCharts(group) {
    Object.values(group).forEach((chart) => {
      if (chart && typeof chart.destroy === "function") chart.destroy();
    });
    Object.keys(group).forEach((key) => delete group[key]);
  }

  function baseChartOptions(extra = {}) {
    const tickColor = "#b8cbe3";
    const gridColor = "rgba(140, 170, 210, 0.14)";
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: tickColor, usePointStyle: true, boxWidth: 14 } },
        tooltip: {
          backgroundColor: "rgba(3, 18, 34, 0.96)",
          titleColor: "#ffffff",
          bodyColor: "#d7e8ff",
          borderColor: "rgba(91, 141, 196, 0.45)",
          borderWidth: 1,
        },
      },
      scales: {
        x: { ticks: { color: tickColor }, grid: { color: gridColor } },
        y: { ticks: { color: tickColor }, grid: { color: gridColor }, beginAtZero: true },
      },
      ...extra,
    };
  }
  function whiteChartOptions(extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#334155", usePointStyle: true, boxWidth: 13 } },
        tooltip: { backgroundColor: "rgba(15, 23, 42, 0.95)", titleColor: "#fff", bodyColor: "#fff" },
      },
      scales: {
        x: { ticks: { color: "#334155" }, grid: { color: "rgba(148, 163, 184, 0.18)" } },
        y: { ticks: { color: "#334155" }, grid: { color: "rgba(148, 163, 184, 0.22)" }, beginAtZero: true },
      },
      ...extra,
    };
  }
  function lineDs(label, data, color, yAxisID = "y") {
    return { label, data, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, tension: 0.25, fill: false, yAxisID };
  }
  function barDs(label, data, color, yAxisID = "y") {
    return { label, data, backgroundColor: `${color}cc`, borderColor: color, borderWidth: 1, borderRadius: 4, yAxisID };
  }
  function whiteAxisX(extra = {}) {
    return { ticks: { color: "#334155" }, grid: { color: "rgba(148, 163, 184, 0.18)" }, ...extra };
  }
  function whiteAxisY(title, extra = {}) {
    return { title: { display: true, text: title, color: "#334155" }, ticks: { color: "#334155" }, grid: { color: "rgba(148, 163, 184, 0.22)" }, beginAtZero: true, ...extra };
  }
  function whitePluginsNoLegend(extra = {}) {
    return { legend: { display: false }, tooltip: { backgroundColor: "rgba(15, 23, 42, 0.95)", titleColor: "#fff", bodyColor: "#fff" }, ...extra };
  }

  async function getSimBundle() {
    if (!state.simBundle) state.simBundle = await fetchJson(SIM_URL, SIM_FALLBACK);
    return state.simBundle;
  }
  function normalizeReportRows(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      return Object.entries(value).map(([key, row]) => (
        row && typeof row === "object"
          ? { nombre: key, eslabon: key, ...row }
          : { nombre: key, eslabon: key, energia_anual_gwh: row }
      ));
    }
    return [];
  }
  function normalizeReportValidationBundle(bundle) {
    const normalized = { ...(bundle || {}) };
    const k = { ...(normalized.kpis || {}) };
    normalized.kpis = k;

    const samNasa = n(k.energia_sam_nasa_2025_gwh);
    const centralizado = n(k.energia_pronostico_centralizado_cen_gwh);
    const cenDisponible = n(k.energia_cen_disponible_gwh);
    const generacionReal = n(k.energia_generacion_real_cen_gwh);
    const reducciones = n(k.energia_reducciones_cen_gwh);

    const setIfMissing = (key, value) => {
      if (n(k[key]) === null && value !== null && Number.isFinite(value)) k[key] = value;
    };

    setIfMissing("delta_1_sam_centralizado_gwh", samNasa !== null && centralizado !== null ? samNasa - centralizado : null);
    setIfMissing("delta_2_centralizado_disponible_gwh", centralizado !== null && cenDisponible !== null ? centralizado - cenDisponible : null);
    setIfMissing("delta_3_reducciones_gwh", cenDisponible !== null && generacionReal !== null ? cenDisponible - generacionReal : reducciones);
    setIfMissing("residuo_sam_nasa_vs_cen_disponible_gwh", samNasa !== null && cenDisponible !== null ? samNasa - cenDisponible : null);
    setIfMissing("residuo_total_sam_nasa_generacion_real_gwh", samNasa !== null && generacionReal !== null ? samNasa - generacionReal : null);

    const officialDeltas = {
      delta1: k.delta_1_sam_centralizado_gwh,
      delta2: k.delta_2_centralizado_disponible_gwh,
      delta3: k.delta_3_reducciones_gwh,
      total: k.residuo_total_sam_nasa_generacion_real_gwh,
    };
    const defaultDeltas = [
      { eslabon: "ΔE1", comparacion: "SAM NASA 2025 − Pronóstico centralizado CEN", energia_anual_gwh: officialDeltas.delta1, interpretacion: "Brecha entre simulación técnica SAM y referencia operacional seleccionada por el CEN." },
      { eslabon: "ΔE2", comparacion: "Pronóstico centralizado CEN − CEN disponible", energia_anual_gwh: officialDeltas.delta2, interpretacion: "Desviación entre pronóstico centralizado CEN y disponibilidad operacional observada." },
      { eslabon: "ΔE3", comparacion: "CEN disponible − Generación real CEN", energia_anual_gwh: officialDeltas.delta3, interpretacion: "Reducciones CEN, equivalentes al curtailment operacional y a la oportunidad energética para BESS." },
      { eslabon: "Residuo total", comparacion: "SAM NASA 2025 − Generación real CEN", energia_anual_gwh: officialDeltas.total, interpretacion: "Brecha total entre simulación técnica y generación real CEN." },
    ];

    const currentDeltas = normalizeReportRows(normalized.deltas);
    normalized.deltas = (currentDeltas.length ? currentDeltas : defaultDeltas).map((row) => {
      const label = `${row.eslabon || ""} ${row.comparacion || ""}`;
      const key = /residuo|total/i.test(label)
        ? "total"
        : /ΔE1|E1|sam.*pron[oó]stico/i.test(label)
        ? "delta1"
        : /ΔE2|E2|centralizado.*disponible/i.test(label)
          ? "delta2"
          : /ΔE3|E3|reducciones|generaci[oó]n real/i.test(label)
            ? "delta3"
            : null;
      return key ? { ...row, energia_anual_gwh: officialDeltas[key] } : row;
    });

    return normalized;
  }
  async function getValidationBundle() {
    if (!state.validationBundle) state.validationBundle = normalizeReportValidationBundle(await fetchJson(VALIDACION_URL, VALIDACION_FALLBACK));
    return state.validationBundle;
  }
  async function getProfileBundle() {
    if (!state.profileBundle) state.profileBundle = await fetchJson(PERFIL_EO_URL, PERFIL_EO_FALLBACK);
    return state.profileBundle;
  }
  async function getScadaRows() {
    if (!state.scadaRows) state.scadaRows = await fetchJson(SCADA_URL, null);
    return state.scadaRows;
  }
  async function getReportClippingBundle() {
    if (state.reportClippingBundle !== null) return state.reportClippingBundle;
    try {
      state.reportClippingBundle = await fetchJson(REPORT_CLIPPING_URL, REPORT_CLIPPING_FALLBACK);
    } catch (error) {
      console.warn("Datos de clipping no disponibles para reporte PDF:", error);
      state.reportClippingBundle = null;
    }
    return state.reportClippingBundle;
  }

  async function getArchitectureBundle() {
    if (!state.architectureBundle) state.architectureBundle = await fetchJson(ARCHITECTURE_URL, null);
    return state.architectureBundle;
  }

  async function getMeteoNasaBundle() {
    if (!state.meteoNasaBundle) state.meteoNasaBundle = await fetchJson(METEO_NASA_URL, null);
    return state.meteoNasaBundle;
  }

  function rowsForCase(rows, mode) {
    const meta = SOURCE_META[mode];
    return (Array.isArray(rows) ? rows : []).filter((row) => meta.pattern.test(`${row.caso_sam || ""} ${row.nombre_caso || ""} ${row.fuente_meteorologica || ""}`));
  }
  function rowForCase(rows, mode) { return rowsForCase(rows, mode)[0] || {}; }
  function compareMetric(bundle, metric) {
    return (bundle?.comparativa?.kpis || []).find((row) => row.metrica === metric) || {};
  }
  function balanceOrientation(submodels, mode) {
    const map = new Map();
    rowsForCase(submodels, mode).forEach((row) => {
      const key = row.orientacion || "Sin orientación";
      map.set(key, (map.get(key) || 0) + (n(row.energia_ac_neta_gwh) || 0));
    });
    return Array.from(map.entries()).map(([orientacion, energia_ac_neta_gwh]) => ({ orientacion, energia_ac_neta_gwh }));
  }

  function renderCeme1Architecture(architecture) {
    const section = byId("ceme1ArchitectureSection");
    if (!section || !architecture) return;

    const submodels = Array.isArray(architecture.submodelos) ? architecture.submodelos : [];
    const families = Array.isArray(architecture.familias) && architecture.familias.length
      ? architecture.familias
      : Array.from(new Set(submodels.map((row) => row.familia))).map((familia) => ({
        familia,
        submodelos: submodels.filter((row) => row.familia === familia).map((row) => row.submodelo),
      }));
    const totals = architecture.totales || {};
    const geometry = architecture.geometria || {};

    setText("ceme1ArchitectureNote", architecture.metadata?.nota || "Configuracion estructural equivalente CEME1 cargada desde JSON.");
    setText("ceme1TiltEast", `${fmt(geometry.inclinacion_grados, 0)}°`);
    setText("ceme1TiltWest", `${fmt(geometry.inclinacion_grados, 0)}°`);

    setHtml("ceme1ArchitectureSummary", [
      ["Submodelos SAM", fmtInt(totals.submodelos || submodels.length)],
      ["Strings", fmtInt(totals.strings)],
      ["Inversores", fmtInt(totals.inversores)],
      ["Potencia DC", `${fmt(totals.potencia_dc_mwp, 4)} MWdc`],
      ["Modulos/string", fmtInt(totals.modulos_por_string)],
    ].map(([label, value]) => `
      <div class="arch-summary-item">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `).join(""));

    setHtml("ceme1ArchitectureFamilies", families.map((family) => {
      const rows = submodels.filter((row) => (family.submodelos || []).includes(row.submodelo));
      return `
        <article class="arch-family">
          <h4>Familia ${escapeHtml(family.familia)} <small>${fmtInt(family.modulo_wp || rows[0]?.modulo_wp)} Wp</small></h4>
          <div class="arch-sc-list">
            ${rows.map((row) => {
              const orientation = String(row.orientacion || "").toLowerCase();
              return `
                <div class="arch-sc-card ${/oeste|west/.test(orientation) ? "orientation-west" : "orientation-east"}">
                  <div class="arch-sc-title">
                    <strong>${escapeHtml(row.submodelo)}</strong>
                    <span>${escapeHtml(row.orientacion)}</span>
                  </div>
                  <div class="arch-sc-meta">
                    <div><span>Azimut</span><br>${fmt(row.azimut_grados, 0)}°</div>
                    <div><span>Inclinacion</span><br>${fmt(row.inclinacion_grados, 0)}°</div>
                    <div><span>Modulo</span><br>${fmtInt(row.modulo_wp)} W</div>
                    <div><span>Strings</span><br>${fmtInt(row.strings)}</div>
                    <div><span>Inversores</span><br>${fmtInt(row.inversores)}</div>
                    <div><span>Potencia DC</span><br>${fmt(row.potencia_dc_mwp, 4)} MWdc</div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </article>
      `;
    }).join(""));
  }

  function renderCeme1EastWestProfile(profile) {
    const canvas = byId("ceme1EastWestProfileChart");
    if (!canvas || typeof Chart === "undefined") return;
    destroyCharts(state.architectureCharts);
    const rows = (Array.isArray(profile?.perfil_horario_nasa_2025) && profile.perfil_horario_nasa_2025.length
      ? profile.perfil_horario_nasa_2025
      : (Array.isArray(profile?.perfil_horario) ? profile.perfil_horario : []))
      .filter((row) => /nasa|2025/i.test(`${row.caso_sam || ""} ${row.fuente_meteorologica || ""}`) || profile?.perfil_horario_nasa_2025)
      .sort((a, b) => (n(a.hora) || 0) - (n(b.hora) || 0));
    if (!rows.length) return;
    state.architectureCharts.eastWest = new Chart(canvas, {
      type: "line",
      data: {
        labels: rows.map((row) => row.hora_label || `${String(row.hora).padStart(2, "0")}:00`),
        datasets: [
          lineDs("Subarray Este", rows.map((row) => row.este_mwh), cssVar("--green", "#76ff45")),
          lineDs("Subarray Oeste", rows.map((row) => row.oeste_mwh), cssVar("--orange", "#ff8a00")),
          { ...lineDs("Total AC", rows.map((row) => row.total_mwh), cssVar("--cyan", "#31b7ff")), borderWidth: 3 },
        ],
      },
      options: baseChartOptions({
        scales: {
          y: { title: { display: true, text: "MWh promedio por hora", color: "#b8cbe3" }, ticks: { color: "#b8cbe3" }, grid: { color: "rgba(140,170,210,.14)" }, beginAtZero: true },
        },
      }),
    });
  }

  async function renderCeme1ArchitectureFromJson() {
    try {
      const [architecture, profile] = await Promise.all([getArchitectureBundle(), getProfileBundle()]);
      renderCeme1Architecture(architecture);
      renderCeme1EastWestProfile(profile);
    } catch (error) {
      console.warn("No se pudo cargar ceme1_architecture.json:", error);
      setText("ceme1ArchitectureNote", "Dato no disponible: no se pudo cargar dashboard/data/ceme1_architecture.json.");
    }
  }

  function setPlantLabels(labels) {
    const cards = qsa("#plant-panel-energia .plant-energy-kpi");
    labels.forEach((item, index) => {
      const card = cards[index];
      if (!card) return;
      const title = card.querySelector("p");
      const subtitle = card.querySelector(":scope > small");
      const unit = card.querySelector("h3 small");
      if (title && item.title) title.textContent = item.title;
      if (subtitle && item.subtitle) subtitle.textContent = item.subtitle;
      if (unit && Object.prototype.hasOwnProperty.call(item, "unit")) unit.textContent = item.unit;
    });
  }
  function setPlantHeader(mode) {
    const meta = SOURCE_META[mode] || SOURCE_META.tmy;
    setText("plantEnergyKicker", meta.kicker);
    setText("plantEnergyTitle", meta.title);
    setText("plantEnergyMeta", meta.meta);
    setText("plantEnergyStatus", meta.status);
    const status = byId("plantEnergyStatus");
    if (status) status.classList.remove("error");
  }
  function setPlantModeButton(mode) {
    qsa(".plant-energy-mode-btn[data-plant-energy-mode]").forEach((button) => {
      const active = button.dataset.plantEnergyMode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  function setCompareDetails(visible) {
    const details = byId("plantCompareDetails");
    if (details) details.hidden = !visible;
    const note = byId("plantSamMethodNote");
    if (note) note.hidden = !!visible;
  }

  function renderPlantKpisSingle(bundle, mode) {
    const k = rowForCase(bundle.kpis, mode);
    setPlantLabels([
      { title: "ENERGÍA AC NETA ANUAL", unit: " GWh/año", subtitle: "Egrid neta SAM" },
      { title: "ENERGÍA DC ANUAL", unit: " GWh/año", subtitle: "Entrada DC equivalente" },
      { title: "POTENCIA AC NOMINAL", unit: " MWac", subtitle: "Inversores modelados" },
      { title: "POTENCIA DC NOMINAL", unit: " MWp", subtitle: "Campo FV equivalente" },
      { title: "POTENCIA AC MÁXIMA SIMULADA", unit: " MW", subtitle: "Máximo horario SAM" },
      { title: "FACTOR DE PLANTA AC", unit: " %", subtitle: "Sobre potencia AC" },
      { title: "PERFORMANCE RATIO", unit: " %", subtitle: "PR ponderado" },
      { title: "POA ESTE / OESTE ANUAL", subtitle: "kWh/m²/año" },
      { title: "GHI ANUAL", unit: " kWh/m²/año", subtitle: "Global horizontal" },
      { title: "DNI ANUAL", unit: " kWh/m²/año", subtitle: "Directa normal" },
    ]);
    setText("plantKpiAcNetAnnual", fmt(k.energia_ac_neta_gwh, 1));
    setText("plantKpiDcAnnual", fmt(k.energia_dc_gwh, 1));
    setText("plantKpiAcNominal", fmt(k.potencia_ac_nominal_mwac, 1));
    setText("plantKpiDcNominal", fmt(k.potencia_dc_nominal_mwp, 1));
    setText("plantKpiAcMax", fmt(k.potencia_ac_maxima_mw, 1));
    setText("plantKpiCapacityFactor", fmt(k.factor_planta_ac_pct, 1));
    setText("plantKpiPerformanceRatio", fmt(k.performance_ratio_pct ?? ((n(k.performance_ratio) || 0) * 100), 1));
    setText("plantKpiPoaEast", fmtInt(k.poa_este_anual_kwh_m2));
    setText("plantKpiPoaWest", fmtInt(k.poa_oeste_anual_kwh_m2));
    setText("plantKpiGhiAnnual", fmtInt(k.ghi_anual_kwh_m2));
    setText("plantKpiDniAnnual", fmtInt(k.dni_anual_kwh_m2));
    setText("plantKpiGhiSub", "Global horizontal");
    setText("plantKpiDniSub", "Directa normal");
  }

  function renderPlantKpisCompare(bundle) {
    const kAC = compareMetric(bundle, "energia_ac_neta_gwh");
    const kCF = compareMetric(bundle, "factor_planta_ac_pct");
    const kPR = compareMetric(bundle, "performance_ratio_pct");
    const kGHI = compareMetric(bundle, "ghi_anual_kwh_m2");
    const kDNI = compareMetric(bundle, "dni_anual_kwh_m2");
    const kDHI = compareMetric(bundle, "dhi_anual_kwh_m2");
    const kPoaE = compareMetric(bundle, "poa_este_anual_kwh_m2");
    const kPoaO = compareMetric(bundle, "poa_oeste_anual_kwh_m2");
    setPlantLabels([
      { title: "ENERGÍA AC NETA TMY", unit: " GWh/año", subtitle: "GWh/año" },
      { title: "ENERGÍA AC NETA NASA 2025", unit: " GWh/año", subtitle: "GWh/año" },
      { title: "DIFERENCIA AC", unit: " %", subtitle: "NASA - TMY" },
      { title: "FACTOR DE PLANTA TMY / NASA", unit: " %", subtitle: "%" },
      { title: "PERFORMANCE RATIO TMY / NASA", unit: " %", subtitle: "%" },
      { title: "GHI ANUAL TMY / NASA", unit: " kWh/m²/año", subtitle: "kWh/m²/año" },
      { title: "DNI ANUAL TMY / NASA", unit: " kWh/m²/año", subtitle: "kWh/m²/año" },
      { title: "POA ESTE / OESTE TMY", subtitle: "kWh/m²/año" },
      { title: "POA ESTE / OESTE NASA", unit: " kWh/m²/año", subtitle: "kWh/m²/año" },
      { title: "DHI ANUAL TMY / NASA", unit: " kWh/m²/año", subtitle: "Difusa horizontal TMY / NASA" },
    ]);
    setText("plantKpiAcNetAnnual", fmt(kAC.sam_tmy, 1));
    setText("plantKpiDcAnnual", fmt(kAC.sam_nasa_2025, 1));
    setText("plantKpiAcNominal", fmt(kAC.delta_pct_respecto_tmy, 1));
    setText("plantKpiDcNominal", `${fmt(kCF.sam_tmy, 1)} / ${fmt(kCF.sam_nasa_2025, 1)}`);
    setText("plantKpiAcMax", `${fmt(kPR.sam_tmy, 1)} / ${fmt(kPR.sam_nasa_2025, 1)}`);
    setText("plantKpiCapacityFactor", `${fmtInt(kGHI.sam_tmy)} / ${fmtInt(kGHI.sam_nasa_2025)}`);
    setText("plantKpiPerformanceRatio", `${fmtInt(kDNI.sam_tmy)} / ${fmtInt(kDNI.sam_nasa_2025)}`);
    setText("plantKpiPoaEast", `${fmtInt(kPoaE.sam_tmy)} / ${fmtInt(kPoaO.sam_tmy)}`);
    setText("plantKpiPoaWest", `${fmtInt(kPoaE.sam_nasa_2025)} / ${fmtInt(kPoaO.sam_nasa_2025)}`);
    setText("plantKpiGhiAnnual", `${fmtInt(kDHI.sam_tmy)} / ${fmtInt(kDHI.sam_nasa_2025)}`);
    setText("plantKpiDniAnnual", "");
    setText("plantKpiGhiSub", "Difusa horizontal TMY / NASA");
    setText("plantKpiDniSub", "");
  }

  function renderPlantMonthly(bundle, mode) {
    const canvas = byId("plantMonthlyEnergyChart");
    if (!canvas || typeof Chart === "undefined") return;
    const rows = rowsForCase(bundle.mensual, mode).sort((a, b) => (n(a.mes) || 0) - (n(b.mes) || 0));
    state.plantCharts.monthly = new Chart(canvas, {
      type: "bar",
      data: {
        labels: rows.map((r) => r.mes_nombre || MONTHS[(n(r.mes) || 1) - 1]),
        datasets: [
          barDs("AC neta", rows.map((r) => r.energia_ac_gwh), cssVar("--green", "#76ff45")),
          barDs("DC", rows.map((r) => r.energia_dc_gwh), cssVar("--blue", "#2689ff")),
        ],
      },
      options: baseChartOptions({ scales: { y: { title: { display: true, text: "GWh", color: "#b8cbe3" }, ticks: { color: "#b8cbe3" }, grid: { color: "rgba(140,170,210,.14)" }, beginAtZero: true } } }),
    });
  }
  function renderPlantHourly(bundle, mode) {
    const canvas = byId("plantHourlyProfileChart");
    if (!canvas || typeof Chart === "undefined") return;
    const rows = rowsForCase(bundle.perfil_horario, mode).sort((a, b) => (n(a.hora) || 0) - (n(b.hora) || 0));
    state.plantCharts.hourly = new Chart(canvas, {
      type: "line",
      data: {
        labels: rows.map((r) => r.hora_label || `${String(r.hora).padStart(2, "0")}:00`),
        datasets: [
          lineDs("AC promedio", rows.map((r) => r.potencia_ac_prom_mw), cssVar("--cyan", "#31b7ff")),
          lineDs("DC promedio", rows.map((r) => r.potencia_dc_prom_mw), cssVar("--yellow", "#ffd21f")),
        ],
      },
      options: baseChartOptions({ scales: { y: { title: { display: true, text: "MW", color: "#b8cbe3" }, ticks: { color: "#b8cbe3" }, grid: { color: "rgba(140,170,210,.14)" }, beginAtZero: true } } }),
    });
  }
  function renderPlantPoa(bundle, mode) {
    const canvas = byId("plantPoaOrientationChart");
    if (!canvas || typeof Chart === "undefined") return;
    const rows = rowsForCase(bundle.mensual, mode).sort((a, b) => (n(a.mes) || 0) - (n(b.mes) || 0));
    state.plantCharts.poa = new Chart(canvas, {
      type: "line",
      data: {
        labels: rows.map((r) => r.mes_nombre || MONTHS[(n(r.mes) || 1) - 1]),
        datasets: [
          lineDs("POA Este", rows.map((r) => r.poa_este_kwh_m2), cssVar("--green", "#76ff45")),
          lineDs("POA Oeste", rows.map((r) => r.poa_oeste_kwh_m2), cssVar("--orange", "#ff8a00")),
        ],
      },
      options: baseChartOptions({ scales: { y: { title: { display: true, text: "kWh/m²", color: "#b8cbe3" }, ticks: { color: "#b8cbe3" }, grid: { color: "rgba(140,170,210,.14)" }, beginAtZero: true } } }),
    });
  }
  function renderPlantSubmodel(bundle, mode) {
    const canvas = byId("plantSubmodelEnergyChart");
    if (!canvas || typeof Chart === "undefined") return;
    const rows = rowsForCase(bundle.submodelos, mode);
    state.plantCharts.submodels = new Chart(canvas, {
      type: "bar",
      data: {
        labels: rows.map((r) => r.submodelo),
        datasets: [
          barDs("AC neta", rows.map((r) => r.energia_ac_neta_gwh), cssVar("--green", "#76ff45")),
          barDs("DC", rows.map((r) => r.energia_dc_gwh), cssVar("--blue", "#2689ff")),
        ],
      },
      options: baseChartOptions({ scales: { y: { title: { display: true, text: "GWh", color: "#b8cbe3" }, ticks: { color: "#b8cbe3" }, grid: { color: "rgba(140,170,210,.14)" }, beginAtZero: true } } }),
    });
  }
  function renderPlantBalance(bundle, mode) {
    const canvas = byId("plantOrientationBalanceChart");
    if (!canvas || typeof Chart === "undefined") return;
    const rows = balanceOrientation(bundle.submodelos, mode);
    state.plantCharts.balance = new Chart(canvas, {
      type: "doughnut",
      data: { labels: rows.map((r) => r.orientacion), datasets: [{ data: rows.map((r) => r.energia_ac_neta_gwh), backgroundColor: [cssVar("--green", "#76ff45"), cssVar("--orange", "#ff8a00")], borderWidth: 1 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom", labels: { color: "#b8cbe3", usePointStyle: true } } } },
    });
  }

  function renderPlantCompare(bundle) {
    const m = bundle.comparativa?.mensual || [];
    const h = bundle.comparativa?.perfil_horario || [];
    const smT = rowsForCase(bundle.submodelos, "tmy");
    const smN = rowsForCase(bundle.submodelos, "nasa");
    const byScN = new Map(smN.map((r) => [r.submodelo, r]));
    const green = cssVar("--green", "#76ff45"), cyan = cssVar("--cyan", "#31b7ff"), yellow = cssVar("--yellow", "#ffd21f"), blue = cssVar("--blue", "#2689ff"), orange = cssVar("--orange", "#ff8a00"), purple = cssVar("--purple", "#b46cff");

    const monthlyCanvas = byId("plantMonthlyEnergyChart");
    if (monthlyCanvas) state.plantCharts.monthly = new Chart(monthlyCanvas, { type: "bar", data: { labels: m.map((r) => r.mes_nombre || MONTHS[(n(r.mes) || 1) - 1]), datasets: [barDs("AC TMY", m.map((r) => r.energia_ac_gwh_tmy), green), barDs("AC NASA 2025", m.map((r) => r.energia_ac_gwh_nasa_2025), cyan), barDs("DC TMY", m.map((r) => r.energia_dc_gwh_tmy), yellow), barDs("DC NASA 2025", m.map((r) => r.energia_dc_gwh_nasa_2025), blue)] }, options: baseChartOptions({ scales: { y: { title: { display: true, text: "GWh", color: "#b8cbe3" }, ticks: { color: "#b8cbe3" }, grid: { color: "rgba(140,170,210,.14)" }, beginAtZero: true } } }) });
    const hourlyCanvas = byId("plantHourlyProfileChart");
    if (hourlyCanvas) state.plantCharts.hourly = new Chart(hourlyCanvas, { type: "line", data: { labels: h.map((r) => r.hora_label || `${String(r.hora).padStart(2, "0")}:00`), datasets: [lineDs("AC TMY", h.map((r) => r.potencia_ac_prom_mw_tmy), cyan), { ...lineDs("AC NASA 2025", h.map((r) => r.potencia_ac_prom_mw_nasa_2025), green), borderDash: [6, 4] }, lineDs("DC TMY", h.map((r) => r.potencia_dc_prom_mw_tmy), yellow), { ...lineDs("DC NASA 2025", h.map((r) => r.potencia_dc_prom_mw_nasa_2025), blue), borderDash: [6, 4] }] }, options: baseChartOptions({ scales: { y: { title: { display: true, text: "MW", color: "#b8cbe3" }, ticks: { color: "#b8cbe3" }, grid: { color: "rgba(140,170,210,.14)" }, beginAtZero: true } } }) });
    const poaCanvas = byId("plantPoaOrientationChart");
    if (poaCanvas) state.plantCharts.poa = new Chart(poaCanvas, { type: "line", data: { labels: m.map((r) => r.mes_nombre || MONTHS[(n(r.mes) || 1) - 1]), datasets: [lineDs("Este TMY", m.map((r) => r.poa_este_kwh_m2_tmy), green), { ...lineDs("Este NASA 2025", m.map((r) => r.poa_este_kwh_m2_nasa_2025), cyan), borderDash: [6, 4] }, lineDs("Oeste TMY", m.map((r) => r.poa_oeste_kwh_m2_tmy), orange), { ...lineDs("Oeste NASA 2025", m.map((r) => r.poa_oeste_kwh_m2_nasa_2025), purple), borderDash: [6, 4] }] }, options: baseChartOptions({ scales: { y: { title: { display: true, text: "kWh/m²", color: "#b8cbe3" }, ticks: { color: "#b8cbe3" }, grid: { color: "rgba(140,170,210,.14)" }, beginAtZero: true } } }) });
    const subCanvas = byId("plantSubmodelEnergyChart");
    if (subCanvas) state.plantCharts.submodels = new Chart(subCanvas, { type: "bar", data: { labels: smT.map((r) => r.submodelo), datasets: [barDs("AC TMY", smT.map((r) => r.energia_ac_neta_gwh), green), barDs("AC NASA 2025", smT.map((r) => byScN.get(r.submodelo)?.energia_ac_neta_gwh), blue)] }, options: baseChartOptions({ scales: { y: { title: { display: true, text: "GWh", color: "#b8cbe3" }, ticks: { color: "#b8cbe3" }, grid: { color: "rgba(140,170,210,.14)" }, beginAtZero: true } } }) });
    const balCanvas = byId("plantOrientationBalanceChart");
    if (balCanvas) {
      const bT = balanceOrientation(bundle.submodelos, "tmy"), bN = balanceOrientation(bundle.submodelos, "nasa");
      const getB = (arr, ori) => (arr.find((r) => new RegExp(ori, "i").test(r.orientacion || "")) || {}).energia_ac_neta_gwh;
      state.plantCharts.balance = new Chart(balCanvas, { type: "bar", data: { labels: ["Este", "Oeste"], datasets: [barDs("TMY", [getB(bT, "este"), getB(bT, "oeste")], green), barDs("NASA 2025", [getB(bN, "este"), getB(bN, "oeste")], blue)] }, options: baseChartOptions({ scales: { y: { title: { display: true, text: "GWh", color: "#b8cbe3" }, ticks: { color: "#b8cbe3" }, grid: { color: "rgba(140,170,210,.14)" }, beginAtZero: true } } }) });
    }
    const diffBody = byId("plantCompareDiffBody");
    if (diffBody) {
      const labels = { energia_ac_neta_gwh: "Energía AC neta", energia_dc_gwh: "Energía DC", factor_planta_ac_pct: "Factor de planta", performance_ratio_pct: "Performance Ratio", ghi_anual_kwh_m2: "GHI anual", dni_anual_kwh_m2: "DNI anual", dhi_anual_kwh_m2: "DHI anual", poa_este_anual_kwh_m2: "POA Este", poa_oeste_anual_kwh_m2: "POA Oeste" };
      diffBody.innerHTML = (bundle.comparativa?.kpis || []).map((r) => `<tr><td>${escapeHtml(labels[r.metrica] || r.metrica)}</td><td>${fmt(r.sam_tmy, 1)}</td><td>${fmt(r.sam_nasa_2025, 1)}</td><td>${fmt(r.delta_pct_respecto_tmy, 1)} %</td></tr>`).join("");
    }
    const subBody = byId("plantCompareSubmodelBody");
    if (subBody) subBody.innerHTML = smT.map((r) => {
      const other = byScN.get(r.submodelo) || {};
      return `<tr><td>${r.submodelo || "--"}</td><td>${r.orientacion || "--"}</td><td>${r.modulo_wp || "--"} Wp</td><td>${fmtInt(r.strings)}</td><td>${fmtInt(r.inversores)}</td><td>${fmt(r.potencia_dc_mwp, 1)} MWp</td><td>${fmt(r.energia_ac_neta_gwh, 1)} GWh</td><td>${fmt(other.energia_ac_neta_gwh, 1)} GWh</td></tr>`;
    }).join("");
  }

  async function renderPlantEnergyViewPatched(mode = state.currentPlantMode || "tmy") {
    const nextMode = SOURCE_META[mode] ? mode : "tmy";
    state.currentPlantMode = nextMode;
    renderCeme1ArchitectureFromJson();
    setPlantModeButton(nextMode);
    setPlantHeader(nextMode);
    setText("plantEnergyStatus", "CARGANDO");
    const bundle = await getSimBundle();
    destroyCharts(state.plantCharts);
    setPlantHeader(nextMode);
    setCompareDetails(nextMode === "compare");
    if (nextMode === "compare") {
      renderPlantKpisCompare(bundle);
      renderPlantCompare(bundle);
    } else {
      renderPlantKpisSingle(bundle, nextMode);
      renderPlantMonthly(bundle, nextMode);
      renderPlantHourly(bundle, nextMode);
      renderPlantPoa(bundle, nextMode);
      renderPlantSubmodel(bundle, nextMode);
      renderPlantBalance(bundle, nextMode);
    }
  }

  window.renderPlantEnergyView = renderPlantEnergyViewPatched;
  window.getActivePlantEnergyMode = () => state.currentPlantMode || "tmy";

  function renderClippingKpis(bundle) {
    const k = rowForCase(bundle?.kpis, "nasa");
    setText("clippingStatus", "DATA OK");
    setText("clippingEnergy", fmt(k.energia_clipping_mwh, 1));
    setText("clippingPct", fmt(k.clipping_pct_vs_ac_mas_clip ?? k.clipping_pct_vs_dc, 2));
    setText("clippingPower", fmt(k.potencia_clipping_max_mw, 1));
    setText("clippingHours", fmtInt(k.horas_con_clipping));
    setText("clippingMethod", k.metodo_clipping || "estimado_desde_dc_ac_limit");
    setText("clippingMethodNote", "Clipping estimado a partir de las series DC/AC obtenidas mediante SAM y de la capacidad maxima de conversion AC de los inversores.");
    setText("clippingBessNote", "Clipping no es Reducciones CEN y no se usa actualmente como energia de carga BESS.");
  }

  function renderClippingCharts(bundle) {
    destroyCharts(state.clippingCharts);
    if (typeof Chart === "undefined") return;
    const monthly = rowsForCase(bundle?.monthly, "nasa").sort((a, b) => (n(a.mes) || 0) - (n(b.mes) || 0));
    const tmyMonthly = rowsForCase(bundle?.monthly, "tmy").sort((a, b) => (n(a.mes) || 0) - (n(b.mes) || 0));
    const dcVsAc = rowsForCase(bundle?.dc_vs_ac, "nasa").sort((a, b) => (n(a.hora) || 0) - (n(b.hora) || 0));
    const monthlyCanvas = byId("clippingMonthlyChart");
    if (monthlyCanvas && monthly.length) {
      const labels = monthly.map((r) => r.mes_nombre || MONTHS[(n(r.mes) || 1) - 1]);
      state.clippingCharts.monthly = new Chart(monthlyCanvas, {
        type: "bar",
        data: {
          labels,
          datasets: [
            barDs("SAM NASA 2025", monthly.map((r) => r.energia_clipping_mwh), cssVar("--orange", "#ff8a00")),
            ...(tmyMonthly.length ? [barDs("SAM TMY Explorador Solar", tmyMonthly.map((r) => r.energia_clipping_mwh), cssVar("--blue", "#2689ff"))] : []),
          ],
        },
        options: baseChartOptions({ scales: { y: { title: { display: true, text: "MWh", color: "#b8cbe3" }, ticks: { color: "#b8cbe3" }, grid: { color: "rgba(140,170,210,.14)" }, beginAtZero: true } } }),
      });
    }
    const dcAcCanvas = byId("clippingDcAcChart");
    if (dcAcCanvas && dcVsAc.length) {
      state.clippingCharts.dcAc = new Chart(dcAcCanvas, {
        type: "line",
        data: {
          labels: dcVsAc.map((r) => r.hora_label || `${String(r.hora).padStart(2, "0")}:00`),
          datasets: [
            lineDs("Potencia DC promedio", dcVsAc.map((r) => r.p_dc_prom_mw), cssVar("--yellow", "#ffd21f")),
            lineDs("Potencia AC promedio", dcVsAc.map((r) => r.p_ac_prom_mw), cssVar("--cyan", "#31b7ff")),
            { ...lineDs("Limite AC inversores", dcVsAc.map((r) => r.p_ac_limit_mw), "#e83f52"), borderDash: [6, 4], pointRadius: 0 },
            barDs("Clipping promedio", dcVsAc.map((r) => r.p_clipping_prom_mw), cssVar("--orange", "#ff8a00"), "y1"),
          ],
        },
        options: baseChartOptions({
          scales: {
            y: { title: { display: true, text: "Potencia DC / AC [MW]", color: "#b8cbe3" }, ticks: { color: "#b8cbe3" }, grid: { color: "rgba(140,170,210,.14)" }, beginAtZero: true },
            y1: { position: "right", title: { display: true, text: "Clipping [MW]", color: "#b8cbe3" }, ticks: { color: "#b8cbe3" }, grid: { drawOnChartArea: false }, beginAtZero: true },
          },
        }),
      });
    }
  }

  window.renderClippingView = async function renderClippingView() {
    setText("clippingStatus", "CARGANDO");
    try {
      const bundle = await getReportClippingBundle();
      if (!bundle) throw new Error("Sin bundle de clipping");
      renderClippingKpis(bundle);
      renderClippingCharts(bundle);
    } catch (error) {
      console.warn("No se pudo renderizar clipping:", error);
      setText("clippingStatus", "ERROR DATOS");
    }
  };

  // -------------------------------------------------------------------------
  // Reporte técnico PDF estilo documento técnico
  // -------------------------------------------------------------------------
  function whiteCanvasPlugin(id) {
    return {
      id,
      beforeDraw(chart) {
        const { ctx, width, height } = chart;
        ctx.save();
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      },
    };
  }
  function valueLabelPlugin(id, formatter = (value) => fmt(value, 2)) {
    return {
      id,
      afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        ctx.save();
        ctx.font = "700 9px Arial, Helvetica, sans-serif";
        ctx.fillStyle = "#1f2937";
        ctx.textAlign = "center";
        chart.data.datasets.forEach((dataset, dsIndex) => {
          const meta = chart.getDatasetMeta(dsIndex);
          if (!meta || meta.hidden) return;
          meta.data.forEach((element, index) => {
            const raw = dataset.data[index];
            const value = Array.isArray(raw) ? raw[1] - raw[0] : n(raw);
            if (value === null || value === undefined || !element) return;
            const pos = element.tooltipPosition ? element.tooltipPosition() : element;
            const positive = value >= 0;
            ctx.textBaseline = positive ? "bottom" : "top";
            const y = positive
              ? Math.max(chartArea.top + 10, pos.y - 4)
              : Math.min(chartArea.bottom - 2, pos.y + 12);
            ctx.fillText(formatter(Math.abs(value)), pos.x, y);
          });
        });
        ctx.restore();
      },
    };
  }
  function sum(rows, key) { return (Array.isArray(rows) ? rows : []).reduce((acc, r) => acc + (n(r[key]) || 0), 0); }
  function groupByDaySamCen(rows, caseFilter = /nasa/i) {
    const sums = new Map();
    (Array.isArray(rows) ? rows : []).forEach((r) => {
      if (!caseFilter.test(`${r.caso_sam || ""} ${r.fuente_meteorologica || ""}`)) return;
      const day = String(r.timestamp).slice(0, 10);
      if (!sums.has(day)) sums.set(day, { sam: 0, cen: 0 });
      const acc = sums.get(day);
      acc.sam += n(r.sam_e_ac_mwh) || 0;
      acc.cen += n(r.cen_disponible_mwh) || 0;
    });
    const dates = Array.from(sums.keys()).sort();
    const round2 = (v) => Math.round(v * 100) / 100;
    return {
      dates,
      sam_mwh: dates.map((d) => round2(sums.get(d).sam)),
      cen_disp_mwh: dates.map((d) => round2(sums.get(d).cen)),
      residual_mwh: dates.map((d) => round2(sums.get(d).sam - sums.get(d).cen)),
    };
  }
  function groupBySamCenHour(rows, caseFilter = /nasa/i) {
    const sums = new Map();
    (Array.isArray(rows) ? rows : []).forEach((r) => {
      if (!caseFilter.test(`${r.caso_sam || ""} ${r.fuente_meteorologica || ""}`)) return;
      const h = Number(String(r.timestamp).slice(11, 13));
      if (!sums.has(h)) sums.set(h, { sam: 0, cen: 0, count: 0 });
      const acc = sums.get(h);
      acc.sam += n(r.sam_e_ac_mwh) || 0;
      acc.cen += n(r.cen_disponible_mwh) || 0;
      acc.count += 1;
    });
    const hours = Array.from({ length: 24 }, (_, h) => h);
    return {
      hours,
      sam_mwh: hours.map((h) => { const a = sums.get(h); return a && a.count ? a.sam / a.count : null; }),
      cen_disp_mwh: hours.map((h) => { const a = sums.get(h); return a && a.count ? a.cen / a.count : null; }),
    };
  }
  const SEASON_MONTHS = { Verano: [1, 2, 12], "Otoño": [3, 4, 5], Invierno: [6, 7, 8], Primavera: [9, 10, 11] };
  function groupBySeasonHour(rows, caseFilter = /nasa/i) {
    const seasons = Object.keys(SEASON_MONTHS);
    const sums = {};
    seasons.forEach((s) => { sums[s] = new Map(); });
    (Array.isArray(rows) ? rows : []).forEach((r) => {
      if (!caseFilter.test(`${r.caso_sam || ""} ${r.fuente_meteorologica || ""}`)) return;
      const ts = String(r.timestamp);
      const month = Number(ts.slice(5, 7));
      const h = Number(ts.slice(11, 13));
      const season = seasons.find((s) => SEASON_MONTHS[s].includes(month));
      if (!season) return;
      const map = sums[season];
      if (!map.has(h)) map.set(h, { sam: 0, count: 0 });
      const acc = map.get(h);
      acc.sam += n(r.sam_e_ac_mwh) || 0;
      acc.count += 1;
    });
    const hours = Array.from({ length: 24 }, (_, h) => h);
    const series = {};
    seasons.forEach((s) => {
      series[s] = hours.map((h) => { const a = sums[s].get(h); return a && a.count ? a.sam / a.count : null; });
    });
    return { hours, series };
  }
  function buildArchitectureTables(architecture) {
    const submodels = Array.isArray(architecture?.submodelos) ? architecture.submodelos : [];
    const totals = architecture?.totales || {};
    const familiasRaw = Array.isArray(architecture?.familias) ? architecture.familias : [];
    const moduloGroups = new Map();
    submodels.forEach((s) => {
      const wp = s.modulo_wp;
      if (!moduloGroups.has(wp)) moduloGroups.set(wp, { cantidad_modulos: 0, potencia_mwdc: 0 });
      const acc = moduloGroups.get(wp);
      acc.cantidad_modulos += (n(s.strings) || 0) * (n(s.modulos_por_string) || 0);
      acc.potencia_mwdc += n(s.potencia_dc_mwp) || 0;
    });
    const table31 = Array.from(moduloGroups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([wp, v]) => ({ potencia_w: wp, cantidad_modulos: v.cantidad_modulos, potencia_mwdc: v.potencia_mwdc }));
    const table32 = familiasRaw
      .map((fr) => {
        const subs = submodels.filter((s) => s.familia === fr.familia);
        return {
          familia: fr.familia,
          modulo_wp: fr.modulo_wp,
          strings: sum(subs, "strings"),
          inversores: sum(subs, "inversores"),
          potencia_dc_mwp: sum(subs, "potencia_dc_mwp"),
          submodelos: fr.submodelos || subs.map((s) => s.submodelo),
        };
      })
      .sort((a, b) => String(a.familia).localeCompare(String(b.familia)));
    return {
      table31,
      table32,
      table33: submodels,
      archKpis: {
        potencia_dc_mwp: totals.potencia_dc_mwp,
        modulos: table31.reduce((acc, r) => acc + r.cantidad_modulos, 0),
        strings: totals.strings,
        inversores: totals.inversores,
        centros_transformacion: 60,
        submodelos_sam: totals.submodelos,
      },
    };
  }
  function computeWaterfall(k) {
    const residuoTotal = n(k.residuo_total_sam_nasa_generacion_real_gwh) || 0;
    const genReal = n(k.energia_generacion_real_cen_gwh) || 0;
    const d1 = n(k.delta_1_sam_centralizado_gwh) || 0;
    const d2 = n(k.delta_2_centralizado_disponible_gwh) || 0;
    const d3 = n(k.delta_3_reducciones_gwh) || 0;
    const start = genReal + residuoTotal;
    const step1 = start - d1;
    const step2 = step1 - d2;
    const step3 = step2 - d3;
    return {
      start_sam_common_gwh: start,
      step1_pronostico_equiv_gwh: step1,
      step2_cen_disponible_equiv_gwh: step2,
      step3_generacion_real_gwh: step3,
      delta_1: d1,
      delta_2: d2,
      delta_3: d3,
    };
  }
  function unifilarTransformer3w(cx, cy, r, color) {
    const offs = [[0, -r * 0.55], [-r * 0.5, r * 0.4], [r * 0.5, r * 0.4]];
    return offs
      .map(([dx, dy]) => `<circle cx="${(cx + dx).toFixed(1)}" cy="${(cy + dy).toFixed(1)}" r="${(r * 0.62).toFixed(1)}" fill="none" stroke="${color}" stroke-width="1.4"/>`)
      .join("");
  }
  function unifilarBreaker(x, y, size = 6, color = "#52514e") {
    return `<rect x="${(x - size / 2).toFixed(1)}" y="${(y - size / 2).toFixed(1)}" width="${size}" height="${size}" fill="#fff" stroke="${color}" stroke-width="1.3"/>`;
  }
  function unifilarCapBank(x, y, color = "#52514e") {
    return `<g stroke="${color}" stroke-width="1.3">
      <line x1="${x}" y1="${y}" x2="${x}" y2="${y + 8}"/>
      <line x1="${x - 6}" y1="${y + 8}" x2="${x + 6}" y2="${y + 8}"/>
      <line x1="${x - 6}" y1="${y + 12}" x2="${x + 6}" y2="${y + 12}"/>
      <line x1="${x}" y1="${y + 12}" x2="${x}" y2="${y + 18}"/>
    </g>`;
  }
  function buildUnifilarSvg(archKpis = {}) {
    const W = 1240, H = 340;
    const navy = "#1f4773", ink = "#273444", muted = "#68727d", teal = "#0fc8aa", amber = "#c98500";
    const modulos = fmtInt(archKpis.modulos);
    const strings = fmtInt(archKpis.strings);
    const inversores = fmtInt(archKpis.inversores);
    const y = 154;
    const parts = [];

    const label = (x, yy, text, size = 10, weight = 400, color = ink, anchor = "middle") =>
      `<text x="${x}" y="${yy}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${text}</text>`;
    const line = (x1, y1, x2, y2, color = ink, width = 1.8, extra = "") =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${extra}/>`;
    const ground = (x, gy) => [
      line(x, gy, x, gy + 8, muted, 1.2),
      line(x - 8, gy + 8, x + 8, gy + 8, muted, 1.2),
      line(x - 5, gy + 12, x + 5, gy + 12, muted, 1.2),
      line(x - 2, gy + 16, x + 2, gy + 16, muted, 1.2),
    ].join("");

    parts.push(`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto;background:#fff;border:1px solid #e5e9f0;border-radius:6px;font-family:Arial,Helvetica,sans-serif;">`);
    parts.push(`<defs>
      <marker id="saUfArrow" markerWidth="8" markerHeight="8" refX="6.2" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${ink}"/></marker>
      <pattern id="saUfPvHatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="7" stroke="#2a78d6" stroke-width="1.5"/></pattern>
    </defs>`);

    // Campo FV
    const pvX = 38, pvW = 96;
    parts.push(`<rect x="${pvX}" y="${y - 50}" width="${pvW}" height="100" rx="5" fill="url(#saUfPvHatch)" fill-opacity="0.24" stroke="${navy}" stroke-width="1.8"/>`);
    parts.push(label(pvX + pvW/2, y + 70, "Campo FV", 12, 700));
    parts.push(label(pvX + pvW/2, y + 86, `${modulos} módulos`, 9, 400, muted));
    parts.push(label(pvX + pvW/2, y + 100, `${strings} strings`, 9, 400, muted));
    parts.push(label(pvX + pvW/2, y - 66, "DC", 9, 700, muted));

    // Inversor
    const invX = 196, invW = 66;
    parts.push(line(pvX + pvW, y, invX - 14, y, ink, 1.8, 'marker-end="url(#saUfArrow)"'));
    parts.push(`<rect x="${invX}" y="${y - 34}" width="${invW}" height="68" rx="6" fill="#eef5fb" stroke="${navy}" stroke-width="1.8"/>`);
    parts.push(`<path d="M${invX+13},${y} q8,-15 16,0 t16,0" fill="none" stroke="${navy}" stroke-width="2"/>`);
    parts.push(label(invX + invW/2, y + 56, "Inversores", 12, 700));
    parts.push(label(invX + invW/2, y + 72, `${inversores} × Sungrow`, 9, 400, muted));
    parts.push(label(invX + invW/2, y + 86, "SG3125HV-MV-30", 8.6, 400, muted));
    parts.push(label(invX + invW/2, y - 50, "0,6 kV AC", 9, 700, muted));

    // CT
    const ctX = 345;
    parts.push(line(invX + invW, y, ctX - 35, y, ink, 1.8, 'marker-end="url(#saUfArrow)"'));
    parts.push(unifilarTransformer3w(ctX, y, 22, navy));
    parts.push(label(ctX, y + 58, "60 Centros de Transformación", 11, 700));
    parts.push(label(ctX, y + 74, "Transf. bloque 3 dev.", 8.8, 400, muted));
    parts.push(label(ctX, y + 88, "0,6 / 33 kV · 6,25 MVA", 8.8, 400, muted));

    // Red colectora 33 kV
    const colX0 = 440, colX1 = 600;
    parts.push(line(ctX + 30, y, colX0 - 14, y, ink, 1.8, 'marker-end="url(#saUfArrow)"'));
    parts.push(line(colX0, y, colX1, y, navy, 5));
    [468, 520, 572].forEach((bx) => parts.push(unifilarBreaker(bx, y, 7, ink)));
    parts.push(label((colX0 + colX1)/2, y - 18, "Red colectora 33 kV", 11, 700));
    parts.push(label((colX0 + colX1)/2, y + 24, "20 circuitos colectores", 9, 400, muted));
    // Banco de condensadores, derivación inferior
    const capX = 555;
    parts.push(line(capX, y, capX, y + 32, muted, 1.3));
    parts.push(unifilarCapBank(capX, y + 32, muted));
    parts.push(label(capX, y + 82, "4 × banco · 10 MVAr", 8.5, 400, muted));

    // 4 barras 33kV representadas claramente
    const busX = 676, busLen = 42;
    parts.push(line(colX1, y, busX - 24, y, ink, 1.8, 'marker-end="url(#saUfArrow)"'));
    [-30,-10,10,30].forEach((dy) => {
      parts.push(line(busX, y+dy, busX+busLen, y+dy, navy, 5));
      parts.push(line(busX-24, y, busX, y+dy, muted, 1.2));
    });
    parts.push(label(busX + busLen/2, y - 48, "4 barras", 10, 700));
    parts.push(label(busX + busLen/2, y + 52, "33 kV", 9, 400, muted));

    // Dos transformadores principales en paralelo hacia bus común 220 kV
    const txpX = 818;
    [-22,22].forEach((dy) => {
      parts.push(line(busX + busLen, y+dy/1.4, txpX - 38, y+dy, muted, 1.4));
      parts.push(unifilarTransformer3w(txpX, y+dy, 20, navy));
      parts.push(line(txpX + 31, y+dy, 890, y+dy, muted, 1.4));
      parts.push(line(890, y+dy, 900, y, muted, 1.4));
    });
    parts.push(label(txpX, y + 80, "2 Transformadores principales", 11, 700));
    parts.push(label(txpX, y + 96, "220 / 33 / 33 kV", 8.8, 400, muted));
    parts.push(label(txpX, y + 110, "150 / 200 / 250 MVA", 8.8, 400, muted));

    // Barra y S/E CEME1
    const seX = 936;
    parts.push(line(900, y, seX - 14, y, ink, 1.8, 'marker-end="url(#saUfArrow)"'));
    parts.push(line(seX, y-34, seX, y+34, navy, 6));
    parts.push(label(seX, y - 48, "S/E CEME1", 10, 700));
    parts.push(label(seX, y + 52, "220 kV", 9, 400, muted));

    // Línea 220 kV a Mirage
    const mirX = 1090;
    parts.push(line(seX + 5, y, mirX - 28, y, teal, 2.2, 'stroke-dasharray="8,5" marker-end="url(#saUfArrow)"'));
    parts.push(label((seX + mirX)/2, y - 18, "1 × 220 kV", 9, 700, "#0a8a71"));
    parts.push(label((seX + mirX)/2, y + 25, "≈ 9,2 km", 9, 400, "#0a8a71"));
    parts.push(`<rect x="${mirX}" y="${y - 33}" width="108" height="66" rx="7" fill="#eafaf5" stroke="${teal}" stroke-width="1.8"/>`);
    parts.push(label(mirX + 54, y - 4, "S/E Mirage", 12, 700));
    parts.push(label(mirX + 54, y + 14, "220 kV · SEN", 10, 400, muted));
    parts.push(ground(mirX + 54, y + 33));

    // PPC: circuito de control claramente separado del camino de potencia
    const ppcX = 250, ppcY = 286;
    parts.push(`<rect x="${ppcX - 58}" y="${ppcY - 17}" width="116" height="34" rx="5" fill="#fff7ea" stroke="${amber}" stroke-width="1.4" stroke-dasharray="4,3"/>`);
    parts.push(label(ppcX, ppcY + 4, "PPC — Control de planta", 9.5, 700, "#8a5a00"));
    parts.push(line(ppcX, ppcY - 17, invX + invW/2, y + 36, amber, 1.2, 'stroke-dasharray="4,3"'));
    parts.push(line(ppcX + 34, ppcY - 17, seX, y + 36, amber, 1.0, 'stroke-dasharray="4,3" opacity="0.65"'));

    parts.push(`</svg>`);
    return parts.join("");
  }
  function reportSection(num, title, body, className = "") {
    const autoClass = num === "1." ? "" : "sa-page-break";
    const specialClass = num === "6." ? "sa-conclusion-section" : num === "A." ? "sa-annex-section" : "";
    const classes = ["sa-report-section", autoClass, specialClass, className].filter(Boolean).join(" ");
    return `<section class="${classes}"><h2><span>${num}</span>${title}</h2><div class="sa-section-body">${body}</div></section>`;
  }
  function reportSubheading(title) {
    return `<h3 class="sa-report-subheading">${escapeHtml(title)}</h3>`;
  }
  function kpiCard(title, value, unit, sub, accent = "") {
    return `<article class="sa-report-kpi ${accent}"><p>${escapeHtml(title)}</p><strong>${escapeHtml(value)}</strong><small>${escapeHtml(unit)}${sub ? ` — ${escapeHtml(sub)}` : ""}</small></article>`;
  }
  function kpiRow(items, cols = 4) {
    return `<div class="sa-report-kpi-row n${cols}">${items.map(([title, value, unit, accent]) => kpiCard(title, value, unit || "", "", accent || "")).join("")}</div>`;
  }
  function statRow(items) {
    return `<div class="sa-stat-row">${items.map(([label, value]) => `<div class="sa-stat-tile"><p>${escapeHtml(label)}</p><strong>${value}</strong></div>`).join("")}</div>`;
  }
  function table(headers, rows, cls = "") {
    return `<table class="sa-report-table ${cls}"><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  function findMetric(metrics, regex) { return (metrics || []).find((r) => regex.test(r.comparacion || "")) || {}; }

  function buildReportHtml(validation, architectureBundle, meteoBundle, profile, dailySeries, hourlyProfile, seasonalProfiles) {
    const k = validation.kpis || {};
    const mensual = validation.mensual || [];
    const metricas = validation.metricas || [];
    const deltas = validation.deltas || [];
    const resumenAnual = validation.resumen_anual || [];
    const { table31, table32, table33, archKpis } = buildArchitectureTables(architectureBundle);
    const mk = meteoBundle?.kpis || {};
    const meteoMensual = meteoBundle?.mensual || [];
    const horasFull = n(k.horas_t_full) ?? 8760;
    const horasPronostico = n(k.energia_pronostico_centralizado_cen_horas) ?? 8736;

    const mensualMax = mensual.length ? mensual.reduce((a, b) => ((n(b.sam_nasa_2025_gwh) ?? -Infinity) > (n(a.sam_nasa_2025_gwh) ?? -Infinity) ? b : a), mensual[0]) : {};
    const mensualMin = mensual.length ? mensual.reduce((a, b) => ((n(b.sam_nasa_2025_gwh) ?? Infinity) < (n(a.sam_nasa_2025_gwh) ?? Infinity) ? b : a), mensual[0]) : {};
    const egridMax = Math.max(0, ...(hourlyProfile.sam_mwh || []).map((v) => n(v) || 0));
    const metricNasaCen = findMetric(metricas, /NASA.*CEN disponible/i);
    const tmyDelta = (n(k.energia_sam_tmy_gwh) || 0) - (n(k.energia_sam_nasa_2025_gwh) || 0);
    const sesgoAnual = n(k.energia_cen_disponible_gwh) ? (n(k.residuo_sam_nasa_vs_cen_disponible_gwh) / n(k.energia_cen_disponible_gwh)) * 100 : null;

    const block1 = `
      <p class="sa-report-figure-title">Figura 1 — Diagrama unifilar CEME1 (simplificado)</p>
      <div class="sa-arch-diagram">${buildUnifilarSvg(archKpis)}</div>
      ${kpiRow([
        ["Potencia DC", fmt(archKpis.potencia_dc_mwp, 2), "MWdc", "green"],
        ["Módulos", fmtInt(archKpis.modulos), "", ""],
        ["Strings", fmtInt(archKpis.strings), "", ""],
        ["Inversores", fmtInt(archKpis.inversores), "", "purple"],
        ["Centros de transformación", fmtInt(archKpis.centros_transformacion), "", ""],
        ["Submodelos SAM", fmtInt(archKpis.submodelos_sam), "", "orange"],
      ], 6)}
      ${reportSubheading("Tabla 3-1 — Módulos solares y potencia nominal según configuración")}
      ${table(["Potencia nominal del módulo", "Cantidad de módulos", "Potencia instalada"], table31.map((r) => [`${fmtInt(r.potencia_w)} W`, fmtInt(r.cantidad_modulos), `${fmt(r.potencia_mwdc, 2)} MWdc`]))}
      ${reportSubheading("Tabla 3-2 — Configuración equivalente por familia técnica")}
      ${table(["Familia", "Módulo", "Strings", "Inversores", "Potencia DC", "Submodelos"], table32.map((r) => [`<b>${escapeHtml(r.familia)}</b>`, `${fmtInt(r.modulo_wp)} W`, fmtInt(r.strings), fmtInt(r.inversores), `${fmt(r.potencia_dc_mwp, 2)} MWdc`, (r.submodelos || []).join(", ")]))}
      ${reportSubheading("Tabla 3-3 — Submodelos SC01–SC06 implementados en SAM")}
      ${table(["SC", "Familia", "Orientación", "Azimut / inclinación", "Módulo", "Strings", "Inversores", "Potencia DC"], table33.map((r) => [`<b>${escapeHtml(r.submodelo)}</b>`, escapeHtml(r.familia), escapeHtml(r.orientacion), `${fmt(r.azimut_grados, 0)}° / ${fmt(r.inclinacion_grados, 0)}°`, `${fmtInt(r.modulo_wp)} W`, fmtInt(r.strings), fmtInt(r.inversores), `${fmt(r.potencia_dc_mwp, 2)} MWdc`]))}
      ${reportSubheading("Tabla 3-4 — Parámetros generales de implementación en SAM")}
      ${table(["Parámetro", "Configuración"], [
        ["Tipo de simulación", "PV Detailed"],
        ["Modelo eléctrico del módulo", "CEC"],
        ["Módulos", "JA Solar 540 W y 545 W"],
        ["Inversor", "Modelo equivalente creado manualmente"],
        ["Arquitectura", "Estructura fija Este-Oeste"],
        ["Inclinación", "5°"],
        ["Módulos por string", "30"],
        ["Submodelos", "SC01-SC06"],
        ["Resolución temporal", "Horaria"],
        ["Caso meteorológico principal", "NASA POWER 2025"],
        ["Referencia meteorológica adicional", "TMY Explorador Solar"],
      ], "plain")}
    `;

    const block2 = `
      ${statRow([
        ["Caso meteorológico principal", "NASA POWER 2025"],
        ["Cobertura", "100,00 %"],
        ["Registros horarios", `${fmtInt(mk.registros_horarios)} h`],
      ])}
      <p class="sa-report-figure-title">G1 — Recurso solar mensual NASA POWER 2025</p>
      <div class="sa-report-chart"><canvas id="saReportG1"></canvas></div>
      <p class="sa-report-figure-title">G2 — Temperatura ambiente mensual 2025</p>
      <div class="sa-report-chart"><canvas id="saReportG2"></canvas></div>
      ${reportSubheading("Tabla T-METEO — Resumen meteorológico anual NASA POWER 2025")}
      ${table(["GHI anual", "DNI anual", "DHI anual", "Temp. media", "Temp. mín", "Temp. máx", "Cobertura"], [[
        `${fmt(mk.ghi_anual_kwh_m2_anio, 2)} kWh/m²`,
        `${fmt(mk.dni_anual_kwh_m2_anio, 2)} kWh/m²`,
        `${fmt(mk.dhi_anual_kwh_m2_anio, 2)} kWh/m²`,
        `${fmt(mk.temperatura_media_anual_c, 2)} °C`,
        `${fmt(mk.temperatura_min_c, 2)} °C`,
        `${fmt(mk.temperatura_max_c, 2)} °C`,
        `100,00 % (${fmtInt(mk.registros_horarios)} h)`,
      ]])}
    `;

    const block3 = `
      ${kpiRow([
        ["Energía SAM NASA 2025", fmt(k.energia_sam_nasa_2025_gwh, 2), "GWh/año", "green"],
        ["Potencia DC instalada", fmt(archKpis.potencia_dc_mwp, 2), "MWdc", ""],
        ["Egrid máximo horario (prom.)", fmt(egridMax, 2), "MWh", ""],
        ["Mes de mayor generación", mensualMax.mes_nombre || "N/D", "", "orange"],
        ["Mes de menor generación", mensualMin.mes_nombre || "N/D", "", "purple"],
      ], 5)}
      <p class="sa-report-figure-title">G3 — Perfil horario promedio anual — Este / Oeste / Total AC</p>
      <div class="sa-report-chart tall"><canvas id="saReportG3"></canvas></div>
      <p class="sa-report-figure-title">G4 — Generación mensual SAM NASA POWER 2025</p>
      <div class="sa-report-chart"><canvas id="saReportG4"></canvas></div>
      <p class="sa-report-figure-title">G5 — Perfil horario promedio por estación</p>
      <div class="sa-report-chart"><canvas id="saReportG5"></canvas></div>
      ${reportSubheading("Comparación con año meteorológico típico (TMY)")}
      ${statRow([
        ["SAM NASA 2025", `${fmt(k.energia_sam_nasa_2025_gwh, 2)} GWh`],
        ["SAM TMY Explorador Solar", `${fmt(k.energia_sam_tmy_gwh, 2)} GWh`],
        ["Δ TMY − NASA", `${tmyDelta >= 0 ? "+" : ""}${fmt(tmyDelta, 2)} GWh`],
      ])}
    `;

    const table35Rows = [
      ["SAM NASA POWER 2025", horasFull, 0],
      ["SAM TMY Explorador Solar", horasFull, 0],
      ["CEN disponible", horasFull, 0],
      ["Generación real CEN", horasFull, 0],
      ["Reducciones CEN", horasFull, 0],
    ].map(([s, reg, f]) => [s, fmtInt(reg), String(f), "100,00 %", "Año completo"]);
    table35Rows.push(["Pronóstico centralizado CEN", fmtInt(horasPronostico), fmtInt(horasFull - horasPronostico), `${fmt((horasPronostico / horasFull) * 100, 2)} %`, "Horas comunes; sin imputación"]);

    const block4 = `
      ${reportSubheading("Tabla 3-5 — Cobertura temporal de las series")}
      ${table(["Señal", "Registros", "Faltantes", "Cobertura", "Criterio"], table35Rows)}
      <p class="sa-report-figure-title">G6 — SAM NASA 2025 vs CEN disponible — serie diaria (2025)</p>
      <div class="sa-report-chart tall"><canvas id="saReportG6"></canvas></div>
      <p class="sa-report-figure-title">G7 — SAM NASA vs CEN disponible — energía mensual</p>
      <div class="sa-report-chart"><canvas id="saReportG7"></canvas></div>
      <p class="sa-report-figure-title sa-subbreak">G8 — Perfil horario promedio: SAM vs CEN disponible</p>
      <div class="sa-report-chart"><canvas id="saReportG8"></canvas></div>
      <p class="sa-report-figure-title">G9 — Residuo diario: SAM NASA − CEN disponible</p>
      <div class="sa-report-chart"><canvas id="saReportG9"></canvas></div>
      <p class="sa-report-figure-title">G9b — SAM NASA vs CEN disponible (dispersión diaria, referencia 1:1)</p>
      <div class="sa-report-chart"><canvas id="saReportG9b"></canvas></div>
    `;

    const block5 = `
      ${kpiRow([
        ["SAM NASA 2025", fmt(k.energia_sam_nasa_2025_gwh, 2), "GWh", "green"],
        ["CEN disponible", fmt(k.energia_cen_disponible_gwh, 2), "GWh", ""],
        ["Sesgo energético anual", `${sesgoAnual >= 0 ? "+" : ""}${fmt(sesgoAnual, 2)}`, "%", "orange"],
        ["Correlación (NASA vs CEN disp.)", fmt(metricNasaCen.corr_pearson, 2), "", "purple"],
      ], 4)}
      ${kpiRow([
        ["nRMSE (NASA vs CEN disp.)", fmt(metricNasaCen.nrmse_pct, 2), "%", ""],
        ["Reducciones CEN", fmt(k.energia_reducciones_cen_gwh, 2), "GWh", "red"],
        ["Reducciones / CEN disponible", fmt(k.factor_reducciones_cen_pct, 2), "%", "red"],
      ], 3)}
      ${reportSubheading("Tabla 3-6 — Resultados energéticos anuales (8.760 h)")}
      ${table(["Señal", "Energía anual", "Resultado respecto de CEN disponible"], resumenAnual.map((r) => [
        `<b>${escapeHtml(r.senal)}</b>`,
        `${fmt(r.energia_gwh, 2)} GWh`,
        r.diferencia_vs_cen_disponible_misma_cobertura_pct ? `${n(r.diferencia_vs_cen_disponible_misma_cobertura_pct) >= 0 ? "+" : ""}${fmt(r.diferencia_vs_cen_disponible_misma_cobertura_pct, 2)} %` : "Referencia",
      ]))}
      <p class="sa-report-figure-title">G10 — Balance energético anual</p>
      <div class="sa-report-chart tall"><canvas id="saReportG10"></canvas></div>
      ${reportSubheading("Tabla 3-7 — Descomposición energética (8.736 h comunes)")}
      ${table(["Componente", "Comparación", "Energía"], deltas.map((r) => [escapeHtml(r.eslabon), escapeHtml(r.comparacion), `<b>${fmt(r.energia_gwh ?? r.energia_anual_gwh, 2)} GWh</b>`]))}
      <p class="sa-report-figure-title">G11 — Descomposición ΔE1 – ΔE2 – ΔE3 (waterfall, 8.736 h comunes)</p>
      <div class="sa-report-chart tall"><canvas id="saReportG11"></canvas></div>
      ${reportSubheading("Tabla 3-8 — Indicadores de comparación")}
      ${table(["Comparación", "Horas", "MBE", "MAE", "RMSE", "nRMSE", "Correlación"], metricas.map((r) => [
        escapeHtml(r.comparacion),
        fmtInt(r.horas_cobertura ?? r.n),
        `${fmt(r.mbe_mwh, 2)} MWh`,
        `${fmt(r.mae_mwh, 2)} MWh`,
        `${fmt(r.rmse_mwh, 2)} MWh`,
        `<b>${fmt(r.nrmse_pct, 2)} %</b>`,
        fmt(r.corr_pearson, 2),
      ]))}
    `;

    return `
      <div class="sa-report-doc" id="saReportDoc">
        <header class="sa-report-main-title">
          <h1>Reporte Técnico CEME1</h1>
          <h3>Fuente reproducible de tablas, gráficos y KPI del Capítulo 3 — Modelación fotovoltaica de CEME1</h3>
          <div class="sa-report-line"></div>
        </header>
        ${reportSection("1.", "Arquitectura y configuración CEME1", block1)}
        ${reportSection("2.", "Meteorología y simulación SAM", block2)}
        ${reportSection("3.", "Resultado de generación SAM", block3)}
        ${reportSection("4.", "Contraste SAM – CEN", block4)}
        ${reportSection("5.", "Balance energético y KPI estadísticos", block5)}
        <footer class="sa-report-footer">Storage Analytics · CEME1 FV + DUNE BESS</footer>
      </div>`;
  }

  function renderReportCharts(validation, architectureBundle, meteoBundle, profile, dailySeries, hourlyProfile, seasonalProfiles) {
    destroyCharts(state.reportCharts);
    if (typeof Chart === "undefined") return;
    const colors = { teal: "#22c7ad", cyan: "#38bdf8", navy: "#1f4773", gold: "#f6c64a", purple: "#9b59b6", red: "#e83f52", orange: "#f59e0b", green: "#2dd4bf" };
    const k = validation.kpis || {};
    const mensual = validation.mensual || [];
    const meteoMensual = meteoBundle?.mensual || [];
    const pRows = (profile.perfil_horario || [])
      .filter((r) => /nasa|2025/i.test(`${r.caso_sam || ""} ${r.fuente_meteorologica || ""}`))
      .sort((a, b) => (n(a.hora) || 0) - (n(b.hora) || 0));

    const g1Canvas = byId("saReportG1");
    if (g1Canvas) state.reportCharts.g1 = new Chart(g1Canvas, {
      type: "bar",
      data: {
        labels: meteoMensual.map((r) => r.mes_corto),
        datasets: [
          barDs("GHI", meteoMensual.map((r) => r.ghi_kwh_m2_mes), colors.cyan),
          barDs("DNI", meteoMensual.map((r) => r.dni_kwh_m2_mes), colors.gold),
          barDs("DHI", meteoMensual.map((r) => r.dhi_kwh_m2_mes), colors.teal),
        ],
      },
      options: whiteChartOptions({ scales: { x: whiteAxisX(), y: whiteAxisY("kWh/m² mes") } }),
      plugins: [whiteCanvasPlugin("g1WhiteBg"), valueLabelPlugin("g1Labels", (v) => fmt(v, 0))],
    });

    const g2Canvas = byId("saReportG2");
    if (g2Canvas) state.reportCharts.g2 = new Chart(g2Canvas, {
      type: "line",
      data: {
        labels: meteoMensual.map((r) => r.mes_corto),
        datasets: [
          { ...lineDs("Máx.", meteoMensual.map((r) => r.temperatura_max_c), colors.orange), borderDash: [3, 3] },
          { ...lineDs("Media", meteoMensual.map((r) => r.temperatura_media_c), colors.navy), borderWidth: 3 },
          { ...lineDs("Mín.", meteoMensual.map((r) => r.temperatura_min_c), colors.cyan), borderDash: [3, 3] },
        ],
      },
      options: whiteChartOptions({ scales: { x: whiteAxisX(), y: whiteAxisY("°C") } }),
      plugins: [whiteCanvasPlugin("g2WhiteBg")],
    });

    const g3Canvas = byId("saReportG3");
    if (g3Canvas) state.reportCharts.g3 = new Chart(g3Canvas, {
      type: "line",
      data: {
        labels: pRows.map((r) => `${String(r.hora).padStart(2, "0")}:00`),
        datasets: [
          lineDs("Este", pRows.map((r) => r.este_mwh), colors.orange),
          lineDs("Oeste", pRows.map((r) => r.oeste_mwh), colors.cyan),
          { ...lineDs("Total AC", pRows.map((r) => r.total_mwh), colors.teal), borderWidth: 3, fill: true, backgroundColor: "rgba(34,199,173,0.14)" },
        ],
      },
      options: whiteChartOptions({ scales: { x: whiteAxisX(), y: whiteAxisY("MWh promedio / hora") } }),
      plugins: [whiteCanvasPlugin("g3WhiteBg")],
    });

    const g4Canvas = byId("saReportG4");
    if (g4Canvas) state.reportCharts.g4 = new Chart(g4Canvas, {
      type: "bar",
      data: { labels: mensual.map((r) => r.mes_nombre || MONTHS[(n(r.mes) || 1) - 1]), datasets: [barDs("SAM NASA 2025", mensual.map((r) => r.sam_nasa_2025_gwh), colors.navy)] },
      options: whiteChartOptions({ plugins: whitePluginsNoLegend(), scales: { x: whiteAxisX(), y: whiteAxisY("GWh/mes") } }),
      plugins: [whiteCanvasPlugin("g4WhiteBg"), valueLabelPlugin("g4Labels")],
    });

    const seasonColors = { Verano: colors.orange, "Otoño": colors.gold, Invierno: colors.navy, Primavera: colors.teal };
    const g5Canvas = byId("saReportG5");
    if (g5Canvas) state.reportCharts.g5 = new Chart(g5Canvas, {
      type: "line",
      data: {
        labels: (seasonalProfiles.hours || []).map((h) => `${String(h).padStart(2, "0")}:00`),
        datasets: Object.entries(seasonalProfiles.series || {}).map(([s, vals]) => lineDs(s, vals, seasonColors[s] || colors.navy)),
      },
      options: whiteChartOptions({ scales: { x: whiteAxisX(), y: whiteAxisY("MWh promedio / hora") } }),
      plugins: [whiteCanvasPlugin("g5WhiteBg")],
    });

    const g6Canvas = byId("saReportG6");
    if (g6Canvas) state.reportCharts.g6 = new Chart(g6Canvas, {
      type: "line",
      data: {
        labels: dailySeries.dates || [],
        datasets: [
          lineDs("SAM NASA 2025", dailySeries.sam_mwh, colors.navy),
          lineDs("CEN disponible", dailySeries.cen_disp_mwh, colors.purple),
        ],
      },
      options: whiteChartOptions({ scales: {
        x: whiteAxisX({ maxTicksLimit: 12, callback: (v, i) => (dailySeries.dates[i] || "").slice(5) }),
        y: whiteAxisY("MWh/día", { beginAtZero: false }),
      } }),
      plugins: [whiteCanvasPlugin("g6WhiteBg")],
    });

    const g7Canvas = byId("saReportG7");
    if (g7Canvas) state.reportCharts.g7 = new Chart(g7Canvas, {
      type: "bar",
      data: {
        labels: mensual.map((r) => r.mes_nombre || MONTHS[(n(r.mes) || 1) - 1]),
        datasets: [
          barDs("SAM NASA 2025", mensual.map((r) => r.sam_nasa_2025_gwh), colors.navy),
          barDs("CEN disponible", mensual.map((r) => r.cen_disponible_gwh), colors.purple),
        ],
      },
      options: whiteChartOptions({ scales: { x: whiteAxisX(), y: whiteAxisY("GWh/mes") } }),
      plugins: [whiteCanvasPlugin("g7WhiteBg")],
    });

    const g8Canvas = byId("saReportG8");
    if (g8Canvas) state.reportCharts.g8 = new Chart(g8Canvas, {
      type: "line",
      data: {
        labels: (hourlyProfile.hours || []).map((h) => `${String(h).padStart(2, "0")}:00`),
        datasets: [
          lineDs("SAM NASA 2025", hourlyProfile.sam_mwh, colors.navy),
          lineDs("CEN disponible", hourlyProfile.cen_disp_mwh, colors.purple),
        ],
      },
      options: whiteChartOptions({ scales: { x: whiteAxisX(), y: whiteAxisY("MWh promedio / hora") } }),
      plugins: [whiteCanvasPlugin("g8WhiteBg")],
    });

    const g9Canvas = byId("saReportG9");
    if (g9Canvas) state.reportCharts.g9 = new Chart(g9Canvas, {
      type: "line",
      data: { labels: dailySeries.dates || [], datasets: [{ ...lineDs("Residuo diario", dailySeries.residual_mwh, colors.red), fill: true, backgroundColor: "rgba(232,63,82,0.10)" }] },
      options: whiteChartOptions({ plugins: whitePluginsNoLegend(), scales: {
        x: whiteAxisX({ maxTicksLimit: 12, callback: (v, i) => (dailySeries.dates[i] || "").slice(5) }),
        y: whiteAxisY("MWh/día", { beginAtZero: false }),
      } }),
      plugins: [whiteCanvasPlugin("g9WhiteBg")],
    });

    const g9bCanvas = byId("saReportG9b");
    if (g9bCanvas) {
      const dates = dailySeries.dates || [];
      const samGwh = dates.map((d, i) => (n(dailySeries.sam_mwh[i]) || 0) / 1000);
      const cenGwh = dates.map((d, i) => (n(dailySeries.cen_disp_mwh[i]) || 0) / 1000);
      const maxGwh = Math.max(4, ...samGwh, ...cenGwh);
      state.reportCharts.g9b = new Chart(g9bCanvas, {
        type: "scatter",
        data: {
          datasets: [
            { label: "Días 2025", data: dates.map((d, i) => ({ x: cenGwh[i], y: samGwh[i] })), backgroundColor: colors.navy, pointRadius: 2.5 },
            { label: "Referencia 1:1", data: [{ x: 0, y: 0 }, { x: maxGwh, y: maxGwh }], type: "line", borderColor: "#c3c2b7", borderDash: [4, 4], borderWidth: 1.4, pointRadius: 0, fill: false },
          ],
        },
        options: whiteChartOptions({ scales: {
          x: whiteAxisX({ title: { display: true, text: "CEN disponible [GWh/día]", color: "#334155" } }),
          y: whiteAxisY("SAM NASA 2025 [GWh/día]"),
        } }),
        plugins: [whiteCanvasPlugin("g9bWhiteBg")],
      });
    }

    const g10Canvas = byId("saReportG10");
    if (g10Canvas) state.reportCharts.g10 = new Chart(g10Canvas, {
      type: "bar",
      data: {
        labels: ["SAM NASA 2025", "SAM TMY", "Pronóstico centralizado CEN", "CEN disponible"],
        datasets: [
          { label: "Energía simulada / pronosticada", data: [k.energia_sam_nasa_2025_gwh, k.energia_sam_tmy_gwh, k.energia_pronostico_centralizado_cen_gwh, null], backgroundColor: `${colors.navy}cc`, borderColor: colors.navy, borderWidth: 1, maxBarThickness: 60, borderRadius: 2 },
          { label: "Generación real CEN", data: [null, null, null, k.energia_generacion_real_cen_gwh], backgroundColor: `${colors.teal}cc`, borderColor: colors.teal, borderWidth: 1, stack: "cen", maxBarThickness: 60, borderRadius: 2 },
          { label: "Reducciones CEN", data: [null, null, null, k.energia_reducciones_cen_gwh], backgroundColor: `${colors.gold}cc`, borderColor: colors.gold, borderWidth: 1, stack: "cen", maxBarThickness: 60, borderRadius: 2 },
        ],
      },
      options: whiteChartOptions({ scales: { x: whiteAxisX(), y: whiteAxisY("GWh") } }),
      plugins: [whiteCanvasPlugin("g10WhiteBg"), valueLabelPlugin("g10Labels")],
    });

    const wf = computeWaterfall(k);
    const g11Canvas = byId("saReportG11");
    if (g11Canvas) {
      const labels = ["SAM NASA 2025\n(8.736 h comunes)", "ΔE1", "ΔE2", "ΔE3", "Generación real CEN"];
      const floating = [
        [0, wf.start_sam_common_gwh],
        [Math.min(wf.start_sam_common_gwh, wf.step1_pronostico_equiv_gwh), Math.max(wf.start_sam_common_gwh, wf.step1_pronostico_equiv_gwh)],
        [Math.min(wf.step1_pronostico_equiv_gwh, wf.step2_cen_disponible_equiv_gwh), Math.max(wf.step1_pronostico_equiv_gwh, wf.step2_cen_disponible_equiv_gwh)],
        [Math.min(wf.step2_cen_disponible_equiv_gwh, wf.step3_generacion_real_gwh), Math.max(wf.step2_cen_disponible_equiv_gwh, wf.step3_generacion_real_gwh)],
        [0, wf.step3_generacion_real_gwh],
      ];
      const wfColors = [colors.navy, wf.delta_1 < 0 ? colors.teal : colors.red, wf.delta_2 >= 0 ? colors.red : colors.teal, wf.delta_3 >= 0 ? colors.red : colors.teal, colors.purple];
      state.reportCharts.g11 = new Chart(g11Canvas, {
        type: "bar",
        data: { labels, datasets: [{ label: "Nivel acumulado", data: floating, backgroundColor: wfColors.map((c) => `${c}cc`), borderColor: wfColors, borderWidth: 1, maxBarThickness: 70, borderRadius: 2 }] },
        options: whiteChartOptions({ plugins: whitePluginsNoLegend(), scales: { x: whiteAxisX(), y: whiteAxisY("GWh") } }),
        plugins: [whiteCanvasPlugin("g11WhiteBg"), valueLabelPlugin("g11Labels")],
      });
    }
  }

  function installReportStyles() {
    if (byId("sa-report-final-styles")) return;
    const style = document.createElement("style");
    style.id = "sa-report-final-styles";
    style.textContent = `
      .sa-report-doc{background:#fff;color:#1f2937;font-family:Arial,Helvetica,sans-serif;padding:26px 30px;line-height:1.42;max-width:1180px;margin:0 auto;border-radius:6px;box-shadow:0 18px 50px rgba(0,0,0,.25)}
      .sa-report-main-title p{color:#0fc8aa;font-weight:800;letter-spacing:.03em;margin:0 0 10px}.sa-report-main-title h1{font-size:42px;line-height:1;color:#1f3f67;margin:0 0 10px}.sa-report-main-title h3{font-size:24px;font-weight:500;color:#64748b;margin:0 0 28px}.sa-report-line{height:4px;background:#0fc8aa;margin:18px 0 26px}.sa-report-summary-box{background:#eaf7f3;border:1px solid #cbded9;padding:18px 20px;margin:28px 0;color:#1f2937;font-size:16px}.sa-report-section{break-inside:avoid;margin:28px 0}.sa-report-section h2{background:#1f4773;color:white;border-radius:6px;padding:12px 18px;font-size:23px;margin:0 0 14px;display:flex;gap:20px;align-items:center}.sa-report-section h2 span{color:#0fc8aa;font-weight:900}.sa-report-kpi-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.sa-report-kpi{background:#f3f6fa;border-left:5px solid #1f4773;border-radius:6px;padding:12px 14px}.sa-report-kpi.green{border-left-color:#0fc8aa}.sa-report-kpi.purple{border-left-color:#9b59b6}.sa-report-kpi.red{border-left-color:#e83f52}.sa-report-kpi.orange{border-left-color:#ff7a3d}.sa-report-kpi p{font-weight:800;font-size:12px;color:#1f4773;margin:0 0 4px;text-transform:uppercase}.sa-report-kpi strong{display:block;font-size:32px;line-height:1;color:#111827}.sa-report-kpi small{display:block;color:#64748b;margin-top:8px}.sa-report-table{width:100%;border-collapse:collapse;margin:10px 0 12px;font-size:14px}.sa-report-table th{background:#1f4773;color:#fff;text-align:left;padding:10px;border:1px solid #d3dce8}.sa-report-table td{padding:9px 10px;border:1px solid #d3dce8;vertical-align:top}.sa-report-table tr:nth-child(even) td{background:#f3f6fa}.sa-report-table.sources th:nth-child(1),.sa-report-table.sources td:nth-child(1){width:22%}.sa-report-table.sources th:nth-child(2),.sa-report-table.sources td:nth-child(2){width:22%}.sa-report-table.sources th:nth-child(3),.sa-report-table.sources td:nth-child(3){width:24%}.sa-report-table.sources th:nth-child(4),.sa-report-table.sources td:nth-child(4){width:32%}.sa-report-table.defense th:nth-child(1),.sa-report-table.defense td:nth-child(1){width:34%}.sa-report-table.defense th:nth-child(2),.sa-report-table.defense td:nth-child(2){width:66%}.sa-report-table.metrics{font-size:12.2px}.sa-report-table.annual{font-size:13.2px}.sa-report-table td,.sa-report-table th{white-space:normal;overflow:visible;text-overflow:clip;word-break:normal;overflow-wrap:anywhere}.sa-report-table.plain th{display:none}.sa-report-table.plain td:first-child{background:#f3f6fa;color:#1f4773;width:250px}.sa-report-note{color:#5b6777;margin:12px 0;font-size:15px}.sa-report-figure-title{text-align:center;color:#64748b;font-style:italic;margin:15px 0 8px}.sa-report-chart{height:300px;background:#fff;border:1px solid #d9e3ef;border-radius:8px;padding:12px;margin:8px 0 12px}.sa-report-list{margin:8px 0 0 24px}.sa-report-list li{margin:8px 0}.sa-report-decision{background:#1f4773;color:#fff;border:2px solid #0fc8aa;padding:18px 22px;margin-top:18px}.sa-report-decision b{color:#0fc8aa}.sa-report-footer{text-align:center;margin-top:28px;padding-top:16px;border-top:1px solid #cbd5e1;color:#4b5f78;font-weight:700}.sa-report-subheading{color:#1f4773;font-size:15px;font-weight:800;margin:18px 0 8px;padding-top:10px;border-top:1px solid #e2e8f0}.sa-report-subheading:first-child{margin-top:0;padding-top:0;border-top:none}.report-view-shell .sa-report-doc canvas{max-width:100%}@media print{.pdf-hide,.side-nav,.top-controls{display:none!important}.sa-report-doc{box-shadow:none;border-radius:0}.sa-report-section{page-break-inside:avoid}.sa-report-chart{break-inside:avoid}}
    `;
    style.textContent += `
      .pdf-export-mode,.pdf-report-page{background:#fff!important;color:#111827!important}
      .pdf-export-mode .pdf-hide{display:none!important}
      .pdf-header,.pdf-footer,.pdf-section,.pdf-table,.pdf-kpi-grid{break-inside:avoid;page-break-inside:avoid}
      .sa-report-doc{
        width:1040px;
        max-width:1040px;
        padding:22px 26px;
        background:#fff;
        color:#111827;
        box-sizing:border-box;
      }
      .sa-report-doc.sa-pdf-export-doc{
        width:740px!important;
        max-width:740px!important;
        min-width:740px!important;
        margin:0!important;
        padding:18px 20px!important;
        border-radius:0!important;
        box-shadow:none!important;
        overflow:visible!important;
      }
      .sa-report-section{
        margin:20px 0 0;
        break-inside:auto;
        page-break-inside:auto;
      }
      .sa-report-section.sa-page-break{
        break-before:page;
        page-break-before:always;
      }
      .sa-subbreak{
        break-before:page;
        page-break-before:always;
      }
      .sa-report-section h2{
        break-after:avoid;
        page-break-after:avoid;
        margin:0 0 10px;
        padding:9px 16px;
        font-size:20px;
        line-height:1.18;
        border-radius:5px;
      }
      .sa-section-body{
        break-before:avoid;
        page-break-before:avoid;
      }
      .sa-report-main-title h1{font-size:37px}
      .sa-report-main-title h3{font-size:21px;margin-bottom:18px}
      .sa-report-summary-box{font-size:14px;line-height:1.45;margin:18px 0;padding:14px 16px}
      .sa-pdf-export-doc .sa-report-main-title h1{font-size:29px;line-height:1.08}
      .sa-pdf-export-doc .sa-report-main-title h3{font-size:17px;margin-bottom:12px}
      .sa-pdf-export-doc .sa-report-summary-box{font-size:11px;line-height:1.36;margin:12px 0;padding:10px 12px}
      .sa-report-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;break-inside:avoid;page-break-inside:avoid}
      .sa-report-kpi{padding:9px 11px;break-inside:avoid;page-break-inside:avoid}
      .sa-report-kpi p{font-size:10px}
      .sa-report-kpi strong{font-size:26px}
      .sa-report-kpi small{font-size:11px;line-height:1.25}
      .sa-report-table{
        width:100%;
        min-width:0!important;
        max-width:100%!important;
        table-layout:fixed;
        border-collapse:collapse;
        font-size:10.4px;
        line-height:1.3;
        break-inside:avoid;
        page-break-inside:avoid;
      }
      .sa-pdf-export-doc .sa-report-section{margin-top:16px}
      .sa-pdf-export-doc .sa-report-section h2{font-size:16px;padding:8px 11px;gap:10px}
      .sa-pdf-export-doc .sa-report-kpi{padding:7px 8px}
      .sa-pdf-export-doc .sa-report-kpi p{font-size:8.8px;line-height:1.18}
      .sa-pdf-export-doc .sa-report-kpi strong{font-size:20px}
      .sa-pdf-export-doc .sa-report-kpi small{font-size:9px;line-height:1.18}
      .sa-pdf-export-doc .sa-report-table{width:100%!important;min-width:0!important;max-width:100%!important;font-size:8.4px;line-height:1.2}
      .sa-pdf-export-doc .sa-report-table th,.sa-pdf-export-doc .sa-report-table td{padding:5px 5px}
      .sa-pdf-export-doc .sa-report-table.sources{font-size:7.9px}
      .sa-pdf-export-doc .sa-report-table.metrics{font-size:7.7px}
      .sa-pdf-export-doc .sa-report-table.defense{font-size:7.7px}
      .sa-pdf-export-doc .sa-report-note{font-size:9.5px;line-height:1.25}
      .sa-pdf-export-doc .sa-report-figure-title{font-size:9px}
      .sa-pdf-export-doc .sa-report-chart{height:210px;padding:7px}
      .sa-pdf-export-doc .sa-report-decision{font-size:10px;padding:10px 12px}
      .sa-report-table thead,.sa-report-table tbody,.sa-report-table tr{
        break-inside:avoid;
        page-break-inside:avoid;
      }
      .sa-report-table th,.sa-report-table td{
        padding:7px 8px;
        white-space:normal!important;
        overflow:visible!important;
        text-overflow:unset!important;
        word-break:normal!important;
        overflow-wrap:break-word!important;
        hyphens:none;
        vertical-align:top;
      }
      .sa-report-table code{
        white-space:normal!important;
        overflow-wrap:anywhere!important;
        word-break:break-word!important;
        font-size:.92em;
      }
      .sa-report-table.sources{font-size:9.6px}
      .sa-report-table.sources th:nth-child(1),.sa-report-table.sources td:nth-child(1){width:18%}
      .sa-report-table.sources th:nth-child(2),.sa-report-table.sources td:nth-child(2){width:22%}
      .sa-report-table.sources th:nth-child(3),.sa-report-table.sources td:nth-child(3){width:24%}
      .sa-report-table.sources th:nth-child(4),.sa-report-table.sources td:nth-child(4){width:36%}
      .sa-report-table.annual{font-size:9.9px}
      .sa-report-table.annual th:nth-child(1),.sa-report-table.annual td:nth-child(1){width:23%}
      .sa-report-table.annual th:nth-child(2),.sa-report-table.annual td:nth-child(2){width:16%}
      .sa-report-table.annual th:nth-child(3),.sa-report-table.annual td:nth-child(3){width:17%}
      .sa-report-table.annual th:nth-child(4),.sa-report-table.annual td:nth-child(4){width:17%}
      .sa-report-table.annual th:nth-child(5),.sa-report-table.annual td:nth-child(5){width:27%}
      .sa-report-table.metrics{font-size:8.9px;line-height:1.22}
      .sa-report-table.metrics th,.sa-report-table.metrics td{padding:6px 6px}
      .sa-report-table.metrics th:nth-child(1),.sa-report-table.metrics td:nth-child(1){width:34%}
      .sa-report-table.metrics th:nth-child(2),.sa-report-table.metrics td:nth-child(2){width:10%}
      .sa-report-table.metrics th:nth-child(3),.sa-report-table.metrics td:nth-child(3){width:10%}
      .sa-report-table.metrics th:nth-child(4),.sa-report-table.metrics td:nth-child(4){width:10%}
      .sa-report-table.metrics th:nth-child(5),.sa-report-table.metrics td:nth-child(5){width:10%}
      .sa-report-table.metrics th:nth-child(6),.sa-report-table.metrics td:nth-child(6){width:12%}
      .sa-report-table.metrics th:nth-child(7),.sa-report-table.metrics td:nth-child(7){width:14%}
      .sa-report-table.deltas{font-size:9.8px}
      .sa-report-table.deltas th:nth-child(1),.sa-report-table.deltas td:nth-child(1){width:13%}
      .sa-report-table.deltas th:nth-child(2),.sa-report-table.deltas td:nth-child(2){width:33%}
      .sa-report-table.deltas th:nth-child(3),.sa-report-table.deltas td:nth-child(3){width:17%}
      .sa-report-table.deltas th:nth-child(4),.sa-report-table.deltas td:nth-child(4){width:37%}
      .sa-report-table.defense{font-size:8.9px;line-height:1.25}
      .sa-report-table.defense th,.sa-report-table.defense td{padding:6px 7px}
      .sa-report-table.defense th:nth-child(1),.sa-report-table.defense td:nth-child(1){width:34%}
      .sa-report-table.defense th:nth-child(2),.sa-report-table.defense td:nth-child(2){width:66%}
      .sa-report-note{font-size:12px;line-height:1.35;margin:8px 0}
      .sa-report-figure-title{font-size:11px;margin:9px 0 6px;break-after:avoid;page-break-after:avoid}
      .sa-report-chart{
        height:252px;
        padding:9px;
        margin:6px 0 8px;
        break-inside:avoid;
        page-break-inside:avoid;
      }
      .sa-conclusion-section,.sa-annex-section{
        break-before:page;
        page-break-before:always;
      }
      .sa-conclusion-section .sa-section-body,.sa-conclusion-section .sa-report-decision{
        break-inside:avoid;
        page-break-inside:avoid;
      }
      .sa-conclusion-section p{font-size:12.8px;line-height:1.42}
      .sa-report-decision{padding:12px 16px;margin-top:12px;font-size:12px;line-height:1.32}
      .sa-report-footer{font-size:11px;margin-top:18px}
      @media print{
        body{background:#fff!important}
        .app-sidebar,.app-topbar,.side-nav,.top-controls,.report-view-head,.pdf-hide{display:none!important}
        .sa-report-doc{box-shadow:none!important;border-radius:0!important;margin:0!important;width:100%!important;max-width:none!important;padding:0!important}
        .sa-page-break{break-before:page;page-break-before:always}
        .sa-report-section h2{break-after:avoid;page-break-after:avoid}
        .sa-section-body,.sa-report-table,.sa-report-chart,.sa-report-kpi,.sa-report-decision{break-inside:avoid;page-break-inside:avoid}
      }
    `;
    style.textContent += `
      .sa-report-table.meteo-metrics{font-size:10.5px;line-height:1.2}
      .sa-report-table.meteo-metrics th,.sa-report-table.meteo-metrics td{padding:6px 5px}
      .sa-report-table.meteo-metrics th:nth-child(1),.sa-report-table.meteo-metrics td:nth-child(1){width:12%}
      .sa-report-table.meteo-metrics th:nth-child(2),.sa-report-table.meteo-metrics td:nth-child(2),
      .sa-report-table.meteo-metrics th:nth-child(3),.sa-report-table.meteo-metrics td:nth-child(3),
      .sa-report-table.meteo-metrics th:nth-child(4),.sa-report-table.meteo-metrics td:nth-child(4),
      .sa-report-table.meteo-metrics th:nth-child(5),.sa-report-table.meteo-metrics td:nth-child(5),
      .sa-report-table.meteo-metrics th:nth-child(6),.sa-report-table.meteo-metrics td:nth-child(6),
      .sa-report-table.meteo-metrics th:nth-child(7),.sa-report-table.meteo-metrics td:nth-child(7),
      .sa-report-table.meteo-metrics th:nth-child(8),.sa-report-table.meteo-metrics td:nth-child(8),
      .sa-report-table.meteo-metrics th:nth-child(9),.sa-report-table.meteo-metrics td:nth-child(9){width:11%}
      .sa-report-table.clipping-compare th,.sa-report-table.clipping-compare td{width:50%;font-size:12px;line-height:1.35}
      .sa-pdf-export-doc .sa-report-table.meteo-metrics{font-size:7.3px}
      .sa-pdf-export-doc .sa-report-table.clipping-compare th,.sa-pdf-export-doc .sa-report-table.clipping-compare td{font-size:8.5px}
    `;
    style.textContent += `
      .sa-report-kpi-row{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:10px 0 4px;break-inside:avoid;page-break-inside:avoid}
      .sa-report-kpi-row.n5{grid-template-columns:repeat(5,minmax(0,1fr))}
      .sa-report-kpi-row.n4{grid-template-columns:repeat(4,minmax(0,1fr))}
      .sa-report-kpi-row.n3{grid-template-columns:repeat(3,minmax(0,1fr))}
      .sa-report-kpi-row .sa-report-kpi{padding:9px 10px}
      .sa-report-kpi-row .sa-report-kpi p{font-size:9px}
      .sa-report-kpi-row .sa-report-kpi strong{font-size:19px}
      .sa-report-kpi-row .sa-report-kpi small{font-size:9px;margin-top:3px}
      .sa-report-two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px;break-inside:avoid;page-break-inside:avoid}
      .sa-stat-row{display:flex;gap:10px;margin:8px 0;break-inside:avoid;page-break-inside:avoid}
      .sa-stat-tile{flex:1;background:#f3f6fa;border-radius:5px;padding:10px 12px;text-align:center}
      .sa-stat-tile p{margin:0 0 4px;font-size:10px;color:#1f4773;font-weight:800;text-transform:uppercase}
      .sa-stat-tile strong{font-size:18px}
      .sa-arch-diagram{margin:6px 0 10px;break-inside:avoid;page-break-inside:avoid}
      .sa-report-chart.tall{height:300px}
      .sa-pdf-export-doc .sa-report-kpi-row{gap:6px}
      .sa-pdf-export-doc .sa-report-kpi-row .sa-report-kpi strong{font-size:15px}
      .sa-pdf-export-doc .sa-report-kpi-row .sa-report-kpi p{font-size:7.6px}
      .sa-pdf-export-doc .sa-stat-tile strong{font-size:14px}
      .sa-pdf-export-doc .sa-report-two-col{gap:10px}
      .sa-pdf-export-doc .sa-report-chart.tall{height:220px}
      @media print{.sa-report-kpi-row,.sa-stat-row,.sa-arch-diagram{break-inside:avoid;page-break-inside:avoid}}
    `;
    document.head.appendChild(style);
  }

  async function svgToPngDataUrl(svgEl, targetWidthPx) {
    const svgMarkup = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
      });
      const viewBoxAttr = (svgEl.getAttribute("viewBox") || "0 0 1000 300").split(/\s+/).map(Number);
      const aspect = viewBoxAttr[3] / viewBoxAttr[2];
      const width = Math.round(targetWidthPx || viewBoxAttr[2]);
      const height = Math.round(width * aspect);
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL("image/png", 1);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function cloneReportForPdf(sourceDoc) {
    const clone = sourceDoc.cloneNode(true);
    clone.id = "saReportDocPdfClone";
    clone.classList.add("sa-pdf-export-doc", "pdf-export-mode");
    clone.querySelectorAll("[id]").forEach((el) => {
      el.id = `${el.id}PdfClone`;
    });

    const sourceCanvases = Array.from(sourceDoc.querySelectorAll("canvas"));
    const cloneCanvases = Array.from(clone.querySelectorAll("canvas"));
    sourceCanvases.forEach((canvas, index) => {
      const cloneCanvas = cloneCanvases[index];
      if (!cloneCanvas) return;
      try {
        const img = document.createElement("img");
        img.src = canvas.toDataURL("image/png", 1);
        img.alt = canvas.getAttribute("aria-label") || "Grafico del reporte";
        img.style.display = "block";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        cloneCanvas.replaceWith(img);
      } catch (error) {
        console.warn("No se pudo convertir un grafico del reporte a imagen para PDF:", error);
      }
    });

    // html2canvas no interpreta de forma confiable SVG en linea (patrones, marcadores, texto);
    // se rasteriza el diagrama unifilar a PNG antes de la exportacion, igual que los graficos Chart.js.
    const sourceSvgs = Array.from(sourceDoc.querySelectorAll(".sa-arch-diagram svg"));
    const cloneSvgs = Array.from(clone.querySelectorAll(".sa-arch-diagram svg"));
    for (let index = 0; index < sourceSvgs.length; index += 1) {
      const svg = sourceSvgs[index];
      const cloneSvg = cloneSvgs[index];
      if (!cloneSvg) continue;
      try {
        const rect = svg.getBoundingClientRect();
        const dataUrl = await svgToPngDataUrl(svg, rect.width || 700);
        const img = document.createElement("img");
        img.src = dataUrl;
        img.alt = "Diagrama unifilar CEME1";
        img.style.display = "block";
        img.style.width = "100%";
        img.style.height = "auto";
        cloneSvg.replaceWith(img);
      } catch (error) {
        console.warn("No se pudo convertir el diagrama unifilar a imagen para PDF:", error);
      }
    }

    const host = document.createElement("div");
    host.className = "sa-pdf-export-host";
    host.style.position = "fixed";
    host.style.left = "0";
    host.style.top = "0";
    host.style.zIndex = "99999";
    host.style.width = "740px";
    host.style.maxWidth = "740px";
    host.style.background = "#ffffff";
    host.style.overflow = "visible";
    host.style.pointerEvents = "none";
    host.appendChild(clone);
    document.body.appendChild(host);
    return { host, clone };
  }

  async function renderReportesViewPatched() {
    installReportStyles();
    const content = byId("reportContent") || byId("view-reportes");
    if (!content) return;
    setText("reportPdfStatus", "Cargando JSON...");
    const [validation, profile, scadaRows, architectureBundle, meteoBundle] = await Promise.all([
      getValidationBundle(),
      getProfileBundle(),
      getScadaRows(),
      getArchitectureBundle(),
      getMeteoNasaBundle(),
    ]);
    const dailySeries = groupByDaySamCen(scadaRows, /nasa|2025/i);
    const hourlyProfile = groupBySamCenHour(scadaRows, /nasa|2025/i);
    const seasonalProfiles = groupBySeasonHour(scadaRows, /nasa|2025/i);
    content.innerHTML = buildReportHtml(validation, architectureBundle, meteoBundle, profile, dailySeries, hourlyProfile, seasonalProfiles);
    setText("reportPdfStatus", "Reporte cargado desde JSON");
    setTimeout(() => renderReportCharts(validation, architectureBundle, meteoBundle, profile, dailySeries, hourlyProfile, seasonalProfiles), 100);
    const button = byId("exportReportPdfBtn");
    if (button && button.dataset.saReportExportBound !== "true") {
      button.dataset.saReportExportBound = "true";
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        setText("reportPdfStatus", "Preparando PDF...");
        button.disabled = true;
        let pdfCloneHost = null;
        try {
          if (typeof window.html2pdf !== "function") {
            throw new Error("La librería html2pdf.js no está disponible.");
          }
          const sourceDoc = byId("reportContent") || byId("view-reportes");
          if (!sourceDoc) throw new Error("No se encontró el contenido del reporte.");

          // Espera un frame para asegurar que Chart.js haya terminado de pintar los canvas.
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const cloned = await cloneReportForPdf(sourceDoc);
          pdfCloneHost = cloned.host;

          const opt = {
            margin: [7, 7, 8, 7],
            filename: "reporte_resultados_ceme1.pdf",
            image: { type: "jpeg", quality: 0.98 },
            html2canvas: {
              scale: 2,
              useCORS: true,
              backgroundColor: "#ffffff",
              logging: false,
              scrollX: 0,
              scrollY: 0,
              windowWidth: 740
            },
            jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
            pagebreak: { mode: ["css", "legacy"], before: ".sa-page-break", avoid: [".sa-report-kpi", ".sa-report-chart", ".sa-arch-diagram", "tr"] }
          };

          setText("reportPdfStatus", "Generando PDF...");
          await window.html2pdf().set(opt).from(cloned.clone).save();
          setText("reportPdfStatus", "PDF descargado");
        } catch (error) {
          console.error("No se pudo generar el PDF del reporte", error);
          setText("reportPdfStatus", `No se pudo generar el PDF: ${error.message || error}`);
        } finally {
          if (pdfCloneHost && pdfCloneHost.parentNode) pdfCloneHost.parentNode.removeChild(pdfCloneHost);
          button.disabled = false;
        }
      }, true);
    }
  }

  window.renderReportesView = renderReportesViewPatched;
})();
