/* =====================================================================
   Conteo Rápido — comun.js
   Lógica compartida por admin.html y personero.html:
   utilidades, ubigeo, partidos, conteo, Supabase, lector de actas con IA,
   y reportes para WhatsApp.
   ===================================================================== */
"use strict";
const APP_VERSION = "1.0.0";

/* ---------- utilidades ---------- */
const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const fmt = n => Number(n || 0).toLocaleString("es-PE");
const ahora = () => new Date().toISOString();
const esperar = ms => new Promise(r => setTimeout(r, ms));
function horaCorta(iso){ try{ return new Date(iso).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"}); }catch(e){ return ""; } }
function fechaHora(iso){ try{ return new Date(iso||Date.now()).toLocaleString("es-PE"); }catch(e){ return ""; } }
function normTxt(s){ return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase().trim(); }
function cargarLS(clave, defaults){
  try{ const d = JSON.parse(localStorage.getItem(clave)); if (d) return Object.assign({}, JSON.parse(JSON.stringify(defaults)), d); }catch(e){}
  return JSON.parse(JSON.stringify(defaults));
}
function guardarLS(clave, obj){ try{ localStorage.setItem(clave, JSON.stringify(obj)); return true; }catch(e){ return false; } }
function bajar(txt, nombre, tipo){
  const b = new Blob([txt], {type: tipo}), u = URL.createObjectURL(b), a = document.createElement("a");
  a.href = u; a.download = nombre; a.click(); URL.revokeObjectURL(u);
}
function fileToBase64(file){
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
}
// fetch con tope de tiempo (para no quedarse colgado en un modelo que no responde)
async function fetchConTimeout(url, opts, ms){
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, Object.assign({}, opts, { signal: ctl.signal })); } finally { clearTimeout(t); }
}
// Reduce la foto (máx. 1600 px, JPEG 85%) → sube ~10x más rápido y la IA la lee igual de bien.
async function comprimirImagen(file, maxLado = 1600, calidad = 0.85){
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    URL.revokeObjectURL(url);
    const esc = Math.min(1, maxLado / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, "image/jpeg", calidad));
    return blob && blob.size < file.size ? blob : file;
  } catch(e) { return file; }
}
async function sha16(str){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
// Huella del acta (misma fórmula que contador.py): mesa|habiles|blancos|nulos|votos en orden de partidos
async function hashActa(a, partidos){
  return sha16([a.mesa, a.habiles, a.blancos, a.nulos, ...partidos.map(p => a.votos[p.sigla] || 0)].join("|"));
}
async function copiar(txt){ try{ await navigator.clipboard.writeText(txt); return true; }catch(e){ return false; } }

/* ---------- ubigeo ---------- */
const UB = (typeof UBIGEO !== "undefined") ? UBIGEO : {};
function opts(selId, items, elegido){
  const sel = document.getElementById(selId); if (!sel) return;
  sel.innerHTML = `<option value="">— elige —</option>` + items.map(x => `<option ${x===elegido?"selected":""}>${esc(x)}</option>`).join("");
}
function eleccionIdDe(u){ u = u || {}; return [u.departamento, u.provincia, u.distrito].filter(Boolean).join("|") || "default"; }
function lugarDe(u){ u = u || {}; return [u.distrito, u.provincia, u.departamento].filter(Boolean).join(", "); }

/* ---------- partidos ---------- */
function hslToHex(h, s, l){ s/=100; l/=100; const k=n=>(n+h/30)%12, a=s*Math.min(l,1-l),
  f=n=>Math.round(255*(l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1))))).toString(16).padStart(2,"0");
  return "#"+f(0)+f(8)+f(4); }
function siglaAuto(nombre){
  const limpio = String(nombre||"").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const palabras = limpio.match(/[A-Za-z0-9]+/g) || [];
  return palabras.map(w => w[0]).join("").toUpperCase().slice(0, 6) || "PART";
}
// lista: [{sigla,nombre,candidato,color}] → siglas únicas, colores automáticos
function construirPartidos(lista){
  const usadas = new Set(); const n = lista.length;
  return lista.filter(x => x.nombre || x.sigla).map((x, i) => {
    let sigla = (x.sigla || siglaAuto(x.nombre)).toUpperCase().replace(/\s+/g, "");
    let base = sigla, k = 2; while (usadas.has(sigla)) { sigla = base + k; k++; } usadas.add(sigla);
    return { sigla, nombre: x.nombre || x.sigla, candidato: x.candidato || "",
             color: x.color || hslToHex(Math.round(360*i/Math.max(n,1)), 62, 52) };
  });
}
function parseLinea(l){
  const sep = l.includes("\t") ? "\t" : l.includes(";") ? ";" : l.includes(" - ") ? " - " : l.includes(",") ? "," : null;
  if (sep) {
    const p = l.split(sep).map(s => s.trim());
    // "Partido, Candidato" (sin sigla): el primer campo parece un nombre largo → sigla automática
    if (p.length === 2 && (p[0].includes(" ") || p[0].length > 8)) return { sigla: "", nombre: p[0], candidato: p[1] };
    return { sigla: p[0]||"", nombre: p[1]||p[0]||"", candidato: p[2]||"" };
  }
  return { sigla: "", nombre: l.trim(), candidato: "" };
}

/* ---------- conteo ---------- */
function sumaActa(a){ return Object.values(a.votos||{}).reduce((x,y)=>x+(+y||0),0)+(+a.blancos||0)+(+a.nulos||0); }
function totalesDe(actas, partidos){
  const t = {}; partidos.forEach(p => t[p.sigla] = 0); let blancos = 0, nulos = 0;
  (actas||[]).forEach(a => { partidos.forEach(p => t[p.sigla] += +((a.votos||{})[p.sigla]) || 0); blancos += +a.blancos||0; nulos += +a.nulos||0; });
  return { t, blancos, nulos };
}
function ranking(actas, partidos){
  const { t, blancos, nulos } = totalesDe(actas, partidos);
  const rank = partidos.map(p => ({ ...p, v: t[p.sigla]||0 })).sort((a,b)=>b.v-a.v);
  const validos = rank.reduce((s,p)=>s+p.v, 0);
  return { rank, blancos, nulos, validos, total: validos + blancos + nulos };
}
// ¿ventaja irremontable? (estimación: votos pendientes ≈ mesas faltantes × promedio por mesa)
function proyeccion(rank, total, nMesas, totalMesas){
  if (!(rank.length >= 2 && nMesas > 0 && rank[0].v > 0)) return { texto: "Aún no hay datos suficientes.", clase: "warn", irremontable: false, ventaja: 0, pendientes: 0 };
  const ventaja0 = rank[0].v - rank[1].v;
  if (!totalMesas) return { irremontable: false, ventaja: ventaja0, pendientes: 0, clase: "warn",
    texto: `⏳ ${rank[0].sigla} va adelante (+${fmt(ventaja0)} sobre ${rank[1].sigla}). Define el total de mesas para saber si la ventaja es irremontable.` };
  const prom = total / nMesas, pend = Math.max(0, (totalMesas - nMesas)) * prom, ventaja = ventaja0;
  const irr = ventaja > pend;
  return { irremontable: irr, ventaja, pendientes: pend, clase: irr ? "ok" : "warn",
    texto: irr ? `✅ VENTAJA IRREMONTABLE — ${rank[0].sigla} ya ganó matemáticamente (+${fmt(ventaja)} sobre ${rank[1].sigla}).`
               : `⏳ ${rank[0].sigla} va adelante (+${fmt(ventaja)} sobre ${rank[1].sigla}). Faltan ~${fmt(Math.round(pend))} votos por contar; aún no definido.` };
}
// ---------- PROYECCIÓN MATEMÁTICA (bootstrap de mesas) ----------
// Simula miles de veces las mesas que faltan re-muestreando las mesas ya reportadas.
// Devuelve, por partido: probabilidad de ganar, votos proyectados y rango 90% del % final;
// más el margen proyectado del líder actual sobre el segundo. Requiere total de mesas > 0 y >= 3 actas.
function proyeccionMC(actas, partidos, totalMesas, sims = 3000){
  const n = actas.length, T = +totalMesas || 0, R = Math.max(0, T - n);
  if (!T || n < 3) return null;
  const siglas = partidos.map(p => p.sigla);
  const porMesa = actas.map(a => siglas.map(s => +((a.votos||{})[s]) || 0));
  const base = siglas.map((_, i) => porMesa.reduce((x, m) => x + m[i], 0));
  const iLider = base.indexOf(Math.max(...base)); const iSeg = base.map((v, i) => i === iLider ? -1 : v).indexOf(Math.max(...base.map((v, i) => i === iLider ? -1 : v)));
  const wins = siglas.map(() => 0), finales = siglas.map(() => []), margenes = [];
  let seed = 20261004; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let k = 0; k < sims; k++) {
    const tot = base.slice();
    // doble bootstrap: primero re-muestrea la muestra (incertidumbre por pocas mesas), luego "llena" las que faltan
    const ps = porMesa.map(() => porMesa[Math.floor(rnd() * n)]);
    for (let r = 0; r < R; r++) { const m = ps[Math.floor(rnd() * n)]; for (let i = 0; i < tot.length; i++) tot[i] += m[i]; }
    let bi = 0; for (let i = 1; i < tot.length; i++) if (tot[i] > tot[bi]) bi = i;
    wins[bi]++; const sum = tot.reduce((a, b) => a + b, 0) || 1;
    tot.forEach((v, i) => finales[i].push(100 * v / sum)); margenes.push(tot[iLider] - (iSeg >= 0 ? tot[iSeg] : 0));
  }
  const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.round(p * (s.length - 1)))]; };
  const promValidos = base.reduce((a, b) => a + b, 0) / n;
  const res = siglas.map((s, i) => ({ sigla: s, prob: wins[i] / sims, actual: base[i], proyVotos: Math.round(base[i] + R * base[i] / n),
    p5: q(finales[i], .05), p50: q(finales[i], .5), p95: q(finales[i], .95) })).sort((a, b) => b.prob - a.prob || b.p50 - a.p50);
  return { n, T, R, sims, pendientesEst: Math.round(R * promValidos), lider: siglas[iLider], segundo: iSeg >= 0 ? siglas[iSeg] : "",
           margen: { actual: base[iLider] - (iSeg >= 0 ? base[iSeg] : 0), p5: q(margenes, .05), p50: q(margenes, .5), p95: q(margenes, .95) }, partidos: res };
}
// Pinta la proyección en un contenedor (sirve para admin y pantalla TV).
function renderProyeccion(el, actas, partidos, totalMesas, grande){
  const mc = proyeccionMC(actas, partidos, totalMesas);
  const info = Object.fromEntries(partidos.map(p => [p.sigla, p]));
  if (!mc) { el.innerHTML = `<div class="alert info">${!totalMesas ? "Para proyectar, define el <b>total de mesas</b> del distrito." : "Se necesitan al menos 3 actas para proyectar."}</div>`; return; }
  const fp = x => (100 * x).toFixed(x >= .995 || x <= .005 ? 1 : 0) + "%";
  const top = mc.partidos[0];
  const barra = mc.partidos.filter(p => p.prob >= .005).map(p => `<div title="${esc(p.sigla)}: ${fp(p.prob)}" style="width:${(100 * p.prob).toFixed(2)}%;background:${info[p.sigla]?.color || '#888'};min-width:2px;border-right:2px solid var(--card,#1a1a19)"></div>`).join("");
  el.innerHTML = `
    <div class="proy-top" style="display:flex;justify-content:space-between;align-items:baseline;gap:1em;flex-wrap:wrap">
      <div><div class="muted" style="text-transform:uppercase;letter-spacing:.12em">Probabilidad de ganar</div>
        <div style="font-weight:800;font-size:${grande ? "clamp(28px,3vw,64px)" : "26px"};line-height:1.05"><span class="dot" style="background:${info[top.sigla]?.color || '#888'};width:.5em;height:.5em;border-radius:4px;display:inline-block;margin-right:.2em"></span>${esc(top.sigla)} ${fp(top.prob)}</div>
        <div class="muted">${esc(info[top.sigla]?.candidato || info[top.sigla]?.nombre || "")}</div></div>
      <div class="muted" style="text-align:right">${mc.n} de ${mc.T} mesas · faltan ${mc.R}<br>~${fmt(mc.pendientesEst)} votos válidos por llegar<br>${mc.sims.toLocaleString("es-PE")} simulaciones</div>
    </div>
    <div style="display:flex;height:${grande ? "clamp(14px,1.6vh,28px)" : "14px"};border-radius:6px;overflow:hidden;margin:.8em 0 .4em;background:var(--neutral,#383835)">${barra}</div>
    <div class="muted" style="margin-bottom:.8em">${mc.partidos.filter(p => p.prob >= .03).map(p => `<span style="margin-right:1.2em"><span class="dot" style="background:${info[p.sigla]?.color || '#888'}"></span> ${esc(p.sigla)} ${fp(p.prob)}</span>`).join("")}</div>
    <div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums">
      <tr><th style="text-align:left">Partido</th><th class="num" style="text-align:right">Ahora</th><th class="num" style="text-align:right">Proyección final</th><th class="num" style="text-align:right">Rango 90%</th><th class="num" style="text-align:right">P(ganar)</th></tr>
      ${mc.partidos.map(p => `<tr><td><span class="dot" style="background:${info[p.sigla]?.color || '#888'}"></span> <b>${esc(p.sigla)}</b></td>
        <td style="text-align:right">${fmt(p.actual)}</td><td style="text-align:right"><b>${fmt(p.proyVotos)}</b> · ${p.p50.toFixed(1)}%</td>
        <td style="text-align:right">${p.p5.toFixed(1)}–${p.p95.toFixed(1)}%</td><td style="text-align:right"><b>${fp(p.prob)}</b></td></tr>`).join("")}
    </table></div>
    <p class="muted" style="margin:.8em 0 0">Margen final proyectado de <b>${esc(mc.lider)}</b> sobre ${esc(mc.segundo)}: <b>${mc.margen.p50 >= 0 ? "+" : ""}${fmt(mc.margen.p50)}</b> votos (rango 90%: ${fmt(mc.margen.p5)} a ${fmt(mc.margen.p95)}). Supone que las mesas que faltan se parecen a las ya reportadas.</p>`;
}
function alertasDe(actas){
  const al = [];
  (actas||[]).forEach(a => {
    const s = sumaActa(a);
    if (a.habiles > 0 && s > a.habiles) al.push(`Mesa ${a.mesa}: ${s} votos > ${a.habiles} electores hábiles (imposible).`);
    if (s === 0) al.push(`Mesa ${a.mesa}: acta en 0 votos — revisar.`);
  });
  return al;
}

/* ---------- reporte (lo usan admin y personero) ---------- */
function renderReporte(el, { actas, aperturas, partidos, nombre, lugar, totalMesas, fuente }){
  const { rank, blancos, nulos, validos, total } = ranking(actas, partidos);
  const nMesas = actas.length, pct = totalMesas ? 100 * nMesas / totalMesas : 0;
  const nAper = (aperturas||[]).filter(a => a.estado !== "no_aperturada").length, nNo = (aperturas||[]).length - nAper;
  const habiles = actas.reduce((s, a) => s + (+a.habiles || 0), 0), particip = habiles ? 100 * total / habiles : 0;
  const pr = proyeccion(rank, total, nMesas, totalMesas);
  let html = `<p class="muted" style="margin:4px 0 14px">${esc(nombre)}${lugar ? " · " + esc(lugar) : ""}${fuente ? " · " + esc(fuente) : ""}</p>`;
  if (validos > 0) html += `<div class="alert ${pr.clase}" style="font-size:15px"><b>${esc(rank[0].sigla)}</b>${rank[0].candidato ? " — " + esc(rank[0].candidato) : ""} · ${pr.texto}</div>`;
  html += `<div class="kpi" style="margin:12px 0">
    <div><b>${nAper}</b><span>mesas instaladas${nNo ? ` (${nNo} no abrieron ⚠)` : ""}</span></div>
    <div><b>${nMesas}</b><span>actas reportadas</span></div>
    ${totalMesas ? `<div><b>${totalMesas}</b><span>mesas del distrito</span></div><div><b>${pct.toFixed(1)}%</b><span>% reportado</span></div>` : ""}
    <div><b>${particip.toFixed(1)}%</b><span>participación</span></div></div>`;
  html += `<h2 style="margin:16px 0 8px">Gráfico de resultados</h2>`;
  html += validos > 0 ? rank.map((p, i) => { const w = 100 * p.v / validos;
    return `<div style="margin:8px 0"><div style="display:flex;justify-content:space-between;font-size:13px">
      <span>${i === 0 ? "🏆 " : ""}<b>${esc(p.sigla)}</b> <span class="muted">${esc(p.candidato || p.nombre)}</span></span><span><b>${fmt(p.v)}</b> · ${w.toFixed(1)}%</span></div>
      <div class="bar-track" style="height:26px"><div class="bar-fill" style="width:${w}%;background:${p.color}"></div></div></div>`; }).join("")
    : `<p class="muted">Aún no hay votos cargados.</p>`;
  html += `<h2 style="margin:16px 0 8px">Detalle</h2><div style="overflow:auto"><table><tr><th>#</th><th>Partido</th><th>Candidato/a</th><th class="num">Votos</th><th class="num">%</th></tr>`;
  rank.forEach((p, i) => { const w = validos ? 100 * p.v / validos : 0;
    html += `<tr${i === 0 && validos > 0 ? ' style="font-weight:700"' : ''}><td>${i === 0 && validos > 0 ? "🏆" : i + 1}</td>
      <td><span class="dot" style="background:${p.color}"></span> ${esc(p.sigla)} <span class="muted">${esc(p.nombre)}</span></td>
      <td>${esc(p.candidato || "—")}</td><td class="num">${fmt(p.v)}</td><td class="num">${w.toFixed(1)}%</td></tr>`; });
  html += `<tr><td></td><td colspan="2">Votos válidos</td><td class="num"><b>${fmt(validos)}</b></td><td></td></tr>
    <tr><td></td><td colspan="2">Blancos</td><td class="num">${fmt(blancos)}</td><td></td></tr>
    <tr><td></td><td colspan="2">Nulos</td><td class="num">${fmt(nulos)}</td><td></td></tr>
    <tr><td></td><td colspan="2"><b>Total general</b></td><td class="num"><b>${fmt(total)}</b></td><td></td></tr></table></div>`;
  const nAl = alertasDe(actas).length;
  html += `<p class="muted" style="margin-top:12px">${nAl ? `⚠ ${nAl} acta(s) con posible inconsistencia.` : "✓ Sin inconsistencias detectadas."} · Actualizado: ${fechaHora()}</p>
    <p class="muted">Datos NO oficiales — conteo rápido de fiscalización. El resultado oficial es el de la ONPE/JNE.</p>`;
  el.innerHTML = html;
}

/* ---------- Supabase (nube) ---------- */
const SB = { url: "", key: "" };
function sbListo(){ return !!(SB.url && SB.key); }
// Claves nuevas de Supabase (sb_publishable_…) solo van en "apikey"; las antiguas (JWT eyJ…) también en Authorization.
function sbAuth(){ const h = { apikey: SB.key }; if (/^eyJ/.test(SB.key)) h["Authorization"] = "Bearer " + SB.key; return h; }
function sbHeaders(extra){ return Object.assign(sbAuth(), { "Content-Type": "application/json" }, extra || {}); }
async function sbGet(path){
  const r = await fetch(`${SB.url}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error("Supabase " + r.status + (r.status === 404 ? " (¿corriste el SQL?)" : ""));
  return r.json();
}
async function sbUpsert(tabla, filas, conflicto){
  const r = await fetch(`${SB.url}/rest/v1/${tabla}?on_conflict=${conflicto}`, {
    method: "POST", headers: sbHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(filas) });
  if (!r.ok) throw new Error("Supabase " + r.status + ": " + (await r.text()).slice(0, 140));
}
async function sbDelete(tabla, filtro){
  const r = await fetch(`${SB.url}/rest/v1/${tabla}?${filtro}`, { method: "DELETE", headers: sbHeaders() });
  if (!r.ok) throw new Error("Supabase " + r.status + " (¿agregaste la política de borrado del SQL?)");
}
const sbBorrarActa     = (e, mesa) => sbDelete("actas", `eleccion=eq.${encodeURIComponent(e)}&mesa=eq.${encodeURIComponent(mesa)}`);
const sbBorrarApertura = (e, mesa) => sbDelete("aperturas", `eleccion=eq.${encodeURIComponent(e)}&mesa=eq.${encodeURIComponent(mesa)}`);
const sbFetchActas     = e => sbGet(`actas?eleccion=eq.${encodeURIComponent(e)}&select=*&order=creado.asc`);
const sbFetchAperturas = e => sbGet(`aperturas?eleccion=eq.${encodeURIComponent(e)}&select=*&order=hora.asc`);
async function sbFetchConfig(e){ const r = await sbGet(`config?eleccion=eq.${encodeURIComponent(e)}&select=*`); return r[0] || null; }
const sbFetchConfigs   = () => sbGet(`config?select=eleccion,nombre,ubicacion,total_mesas,actualizado&order=actualizado.desc`);
const sbBorrarConfig   = e => sbDelete("config", `eleccion=eq.${encodeURIComponent(e)}`);
const sbUpsertConfig   = cfg => sbUpsert("config", [cfg], "eleccion");
const sbUpsertActa     = (e, a) => sbUpsert("actas", [{ eleccion: e, mesa: a.mesa, habiles: a.habiles, votos: a.votos, blancos: a.blancos, nulos: a.nulos, personero: a.personero, hash: a.hash, foto_url: a.foto_url || null }], "eleccion,mesa");
const sbUpsertApertura = (e, a) => sbUpsert("aperturas", [{ eleccion: e, mesa: a.mesa, estado: a.estado, hora: a.hora, personero: a.personero }], "eleccion,mesa");
// Foto del acta → Supabase Storage (bucket público "actas"). Devuelve URL pública o lanza error.
async function sbSubirFoto(e, mesa, file){
  const ext = (file.type||"image/jpeg").includes("png") ? "png" : "jpg";
  const ruta = `${encodeURIComponent(e.replace(/\|/g,"_"))}/${encodeURIComponent(mesa)}.${ext}`;
  const r = await fetch(`${SB.url}/storage/v1/object/actas/${ruta}`, {
    method: "POST", headers: Object.assign(sbAuth(), { "Content-Type": file.type||"image/jpeg", "x-upsert": "true" }), body: file });
  if (!r.ok) throw new Error("Storage " + r.status);
  return `${SB.url}/storage/v1/object/public/actas/${ruta}`;
}

/* ---------- IA: lector de actas ---------- */
function detectarProv(clave){ clave = (clave||"").trim(); return clave.startsWith("sk-ant") ? "claude" : "gemini"; }
async function listarModelos(prov, clave){
  try{
    if (prov === "gemini") {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(clave)}`);
      if (!r.ok) return [];
      const j = await r.json();
      return (j.models||[]).filter(m => (m.supportedGenerationMethods||[]).includes("generateContent") && /gemini/i.test(m.name))
        .map(m => m.name.replace(/^models\//, "")).filter(m => !/embedding|tts|image|audio|live|thinking|robotics/i.test(m));
    } else {
      const r = await fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": clave, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" } });
      if (!r.ok) return [];
      return ((await r.json()).data||[]).map(m => m.id);
    }
  }catch(e){ return []; }
}
// Cadena de modelos: el elegido primero; luego todos los disponibles y respaldos, ordenados flash → lite → pro.
function cadenaModelos(elegido, disponibles){
  const pref = m => (/flash/i.test(m) && !/lite/i.test(m)) ? 0 : /lite/i.test(m) ? 1 : /pro/i.test(m) ? 2 : 3;
  const base = [ ...(disponibles||[]), "gemini-3.8-flash", "gemini-3-flash", "gemini-flash-latest", "gemini-3.8-flash-lite", "gemini-3-flash-lite",
                 "gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-3.8-pro", "gemini-3-pro", "gemini-2.5-pro", "gemini-pro-latest" ]
    .filter(m => m && /gemini/i.test(m) && !/embedding|tts|image|audio|live|thinking|robotics|exp/i.test(m));
  // si hay lista curada (disponibles) se respeta su orden; los respaldos fijos van al final
  const resto = (disponibles && disponibles.length)
    ? [...new Set(base)].filter(m => m !== elegido)
    : [...new Set(base)].filter(m => m !== elegido).sort((a,b) => pref(a) - pref(b));
  // un modelo "lite" (menos saturado) siempre en segundo lugar
  const iLite = resto.findIndex(m => /lite/i.test(m)); if (iLite > 0) resto.unshift(resto.splice(iLite, 1)[0]);
  return elegido ? [elegido, ...resto] : resto;
}
// Instrucciones "entrenadas" para el acta ONPE.
function promptActa(partidos){
  const lista = partidos.map(p => `- ${p.sigla} = ${p.nombre}${p.candidato ? " — " + p.candidato : ""}`).join("\n");
  const votosJson = partidos.map(p => `"${p.sigla}":0`).join(",");
  return `Eres un experto leyendo ACTAS ELECTORALES de la ONPE (Perú). Analiza la foto y extrae los datos.

Estructura típica del acta:
- Arriba: "MESA DE SUFRAGIO N°" (número de 6 dígitos, ej. 045527) y "TOTAL DE ELECTORES HÁBILES" (número, ej. 300).
- Sección "ACTA DE ESCRUTINIO": tabla con la columna "ORGANIZACIONES POLÍTICAS" (nombre y símbolo de cada partido/lista) y la columna "TOTAL DE VOTOS" (número de votos; a veces también escrito en letras).
- Debajo: "VOTOS EN BLANCO", "VOTOS NULOS", "VOTOS IMPUGNADOS" y "TOTAL DE VOTOS EMITIDOS".

Reglas:
1. Usa el número en DÍGITOS de la columna TOTAL DE VOTOS de cada organización. Si hay dígitos y letras y no coinciden, usa el que se lea con más claridad y anótalo en "dudas".
2. Empareja cada fila del acta con la lista de partidos permitidos por nombre o sigla (aunque el nombre esté abreviado, en otro orden o con símbolo). No mezcles filas.
3. Si un partido permitido no aparece en el acta o su casilla está vacía, pon 0.
4. Si un número está tachado, corregido o poco legible, da tu mejor lectura y agrégalo a "dudas" (ej. "APP: 150 o 156?").
5. No inventes: si un dato no se ve, deja 0 (o "" en mesa) y anótalo en "dudas".
6. Verifica: la suma de todos los votos + blancos + nulos + impugnados debe ser cercana a TOTAL DE VOTOS EMITIDOS y nunca mayor que los electores hábiles. Si no cuadra, anótalo en "dudas".

Partidos permitidos (sigla = nombre — candidato):
${lista}

Devuelve SOLO este JSON, sin texto extra ni markdown:
{"mesa":"","habiles":0,"votos":{${votosJson}},"blancos":0,"nulos":0,"impugnados":0,"dudas":[]}`;
}
// Memoria del modelo que respondió bien: se prueba primero la próxima vez.
const LS_MODELO_OK = "cr_ia_modelo_ok";
function modeloRecordado(){ try { return localStorage.getItem(LS_MODELO_OK) || ""; } catch(e) { return ""; } }
function recordarModelo(m){ try { localStorage.setItem(LS_MODELO_OK, m); } catch(e) {} }

// Lee el acta. Prueba el modelo recordado, luego el elegido y los demás, UNA vez cada uno y sin esperas;
// si todos fallan, hace una segunda pasada corta. onEstado(texto) recibe el progreso.
// Devuelve {json, modeloUsado}. Lanza Error con mensaje claro.
async function leerActaConIA({ foto, partidos, clave, modelo, disponibles, onEstado }){
  const est = onEstado || (() => {});
  if (!clave) throw new Error("No hay clave de IA configurada.");
  const prov = detectarProv(clave);
  est("Preparando la foto…");
  const chica = await comprimirImagen(foto);
  const b64 = await fileToBase64(chica);
  const mime = chica.type || "image/jpeg";
  const prompt = promptActa(partidos);
  let texto = "", usado = "";
  if (prov === "gemini") {
    const cuerpo = JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: prompt }] }],
                                    generationConfig: { temperature: 0, responseMimeType: "application/json" } });
    const cadena = cadenaModelos(modelo, disponibles);
    const rec = modeloRecordado();
    if (rec) { const i = cadena.indexOf(rec); if (i > 0) cadena.splice(i, 1); if (i !== 0) cadena.unshift(rec); }
    const fallos = []; let msg403 = "", claveMala = null;
    // un intento con un modelo; resuelve {r,m} si responde OK, rechaza si no
    const intentar = (m, ms, ctl) => (async () => {
      let r;
      try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(clave)}`,
              { method: "POST", headers: { "content-type": "application/json" }, body: cuerpo, signal: ctl.signal }); }
      catch(e) { fallos.push(m + ": sin respuesta"); throw e; }
      if (r.ok) return { data: await r.json(), m };   // se lee el cuerpo aquí, antes de cancelar a los demás
      if (r.status === 401) { let msg = ""; try { msg = (await r.json()).error?.message || ""; } catch(_){} claveMala = `La clave de IA fue rechazada (401). ${msg}`; }
      if (r.status === 403 && !msg403) { try { msg403 = (await r.json()).error?.message || ""; } catch(_){} }
      fallos.push(m + ": " + r.status); throw new Error(m + ": " + r.status);
    })();
    // prueba los modelos de DOS en dos: el primero que responda gana y se cancela el otro
    const probarGrupo = async (grupo, ms) => {
      est(`Leyendo con ${grupo.join(" y ")}…`);
      const ctls = grupo.map(() => new AbortController());
      const tm = setTimeout(() => ctls.forEach(c => c.abort()), ms);
      try { const g = await Promise.any(grupo.map((m, i) => intentar(m, ms, ctls[i]))); ctls.forEach(c => c.abort()); return g; }
      catch(e) { return null; } finally { clearTimeout(tm); }
    };
    let ganador = null;
    for (let i = 0; i < cadena.length && !ganador; i += 2) { ganador = await probarGrupo(cadena.slice(i, i + 2), 25000); if (claveMala) throw new Error(claveMala); }
    if (!ganador) { est("Todos ocupados, reintentando…"); await esperar(1500); ganador = await probarGrupo(cadena.slice(0, 3), 25000); }
    if (!ganador) throw new Error(msg403 ? `Google no permite usar la IA con esta clave: ${msg403}` : "Ningún modelo respondió ahora (saturación de Gemini). Espera 1 minuto y vuelve a intentar.");
    usado = ganador.m; recordarModelo(usado);
    const data = ganador.data;
    texto = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  } else {
    usado = modelo && modelo.startsWith("claude") ? modelo : "claude-sonnet-5";
    est(`Leyendo con ${usado}…`);
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
      headers: { "content-type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: usado, max_tokens: 1024, messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mime, data: b64 } }, { type: "text", text: prompt }] }] }) });
    if (!r.ok) throw new Error("Claude respondió error " + r.status + ". Revisa la clave.");
    texto = ((await r.json()).content || []).map(b => b.text || "").join("");
  }
  const i = texto.indexOf("{"), j = texto.lastIndexOf("}");
  if (i < 0 || j < 0) throw new Error("La IA no devolvió datos legibles. Toma la foto más de frente, sin sombras.");
  return { json: JSON.parse(texto.slice(i, j + 1)), modeloUsado: usado };
}

/* ---------- compartir (WhatsApp) ---------- */
async function compartirTexto(txt){
  try { if (navigator.share) { await navigator.share({ text: txt }); return; } } catch(e){ return; }
  window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
}
function textoReporteDistrito({ nombre, lugar, rank, blancos, nulos, validos, total, nMesas, totalMesas, nAper }){
  const pct = totalMesas ? (100 * nMesas / totalMesas).toFixed(1) : "0";
  let txt = `🗳️ CONTEO RÁPIDO${lugar ? " — " + lugar : ""}\n${nombre}\n`;
  txt += `Mesas instaladas: ${nAper} · Actas: ${nMesas} de ${totalMesas} (${pct}%)\n\nRESULTADO (votos válidos):\n`;
  rank.forEach((p, i) => { const pc = validos ? (100 * p.v / validos).toFixed(1) : 0;
    txt += `${i + 1}. ${p.sigla}  ${fmt(p.v)}  (${pc}%)${p.candidato ? " — " + p.candidato : ""}\n`; });
  txt += `\nBlancos: ${blancos} · Nulos: ${nulos} · Total: ${fmt(total)}\n`;
  if (rank.length >= 2 && rank[0].v > 0) txt += `\n🏆 Va ganando: ${rank[0].sigla} (+${fmt(rank[0].v - rank[1].v)})\n`;
  txt += `\n(Datos NO oficiales — conteo rápido de fiscalización)\n${fechaHora()}`;
  return txt;
}
function textoMiMesa({ mesa, lugar, personero, partidos, votos, blancos, nulos }){
  const lista = partidos.map(p => ({ ...p, v: +votos[p.sigla] || 0 })).sort((a, b) => b.v - a.v);
  const val = lista.reduce((s, p) => s + p.v, 0), total = val + blancos + nulos;
  let txt = `🗳️ MI MESA ${mesa}${lugar ? " — " + lugar : ""}\n`;
  if (personero) txt += `Personero: ${personero}\n`;
  txt += "\n";
  lista.forEach((p, i) => { if (p.v > 0 || i < 5) txt += `${i === 0 && val > 0 ? "🏆 " : ""}${p.sigla}: ${p.v}${p.candidato ? " (" + p.candidato + ")" : ""}\n`; });
  txt += `\nBlancos: ${blancos} · Nulos: ${nulos} · Total: ${total}\n`;
  if (lista[0] && lista[0].v > 0) txt += `\nEn mi mesa gana: ${lista[0].sigla}\n`;
  return txt + `(conteo rápido — dato NO oficial)`;
}

/* ---------- enlace de personero ---------- */
function armarEnlacePersonero(base, sbUrl, sbKey, eleccion){
  const u = new URL(base, location.href);
  u.hash = new URLSearchParams({ sb: sbUrl, key: sbKey, e: eleccion }).toString();
  return u.href;
}
function leerEnlacePersonero(str){
  try {
    const h = (str || "").includes("#") ? str.slice(str.indexOf("#") + 1) : str;
    const p = new URLSearchParams(h.replace(/^\?/, ""));
    const sb = p.get("sb"), key = p.get("key"), e = p.get("e");
    return (sb && key && e) ? { sb, key, e } : null;
  } catch(err){ return null; }
}
