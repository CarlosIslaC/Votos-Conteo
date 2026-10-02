# Conteo Rápido — PACASMAYO (versión simple)

Todo viene ya configurado en **`config.js`**: los 9 candidatos a alcalde distrital de Pacasmayo (JNE), el distrito y la llave de la nube.
No hay enlaces ni pantallas de configuración.

| Archivo | Quién | Qué hace |
|---|---|---|
| `personero.html` | Personero en su mesa | Pone su nombre y N° de mesa · ✅ marca instalación · 📸 foto del acta → 🤖 IA llena los números → revisa → 💾 guarda y envía · ve el **reporte del distrito** · funciona sin señal y sube después |
| `admin.html` | Coordinador (con PIN) | Reporte con gráfico y alertas · lista de actas e instalaciones con **🗑 borrar** · quiénes reportaron · exportar CSV · estado de nube/IA |
| `config.js` | Coordinador | **Único archivo que se edita**: claves, total de mesas, candidatos |
| `comun.js`, `estilos.css` | — | compartidos (no tocar) |
| `netlify.toml` | — | cabeceras para Netlify (caché y que el sitio no se indexe) |
| `AUDITORIA.md` | Coordinador | **qué aguanta la app en producción y qué tienes que hacer antes del día de la elección** |

## Puesta en marcha (3 pasos)

**1. Nube (Supabase, gratis):** supabase.com → New project → SQL Editor → pega todo `../supabase_esquema.sql` → RUN.
Luego Project Settings → API: copia **Project URL** y **anon public key**.

**2. IA que lee las actas:** pega las claves en **Admin → Estado → Claves de IA** (una por línea). Se guardan en la nube y llegan solas a todos los celulares. La app reconoce el proveedor por la clave y los usa en este orden:

| Orden | Proveedor | Clave empieza con | Dónde se crea | Costo |
|---|---|---|---|---|
| 1 | Gemini | `AIza…` | aistudio.google.com/apikey | gratis (~20 lecturas/día por cuenta) |
| 2 | OpenRouter | `sk-or-…` | openrouter.ai/settings/keys | gratis (50/día; 1000/día si recargas US$10) |
| 3 | Claude | `sk-ant-…` | console.anthropic.com | de pago (~US$0.005 por acta), solo si lo enciendes |

Pon **varias claves de Gemini de distintas cuentas Gmail**: cada cuenta tiene su propio cupo diario. Si una clave falla o se queda sin cupo, la app pasa sola a la siguiente y se queda con la que responde más rápido. El respaldo de pago viene **apagado**.

**3. Pega las claves en `config.js`** (abrir con Bloc de notas):
```
supabase: { url: "https://TU-PROYECTO.supabase.co", key: "eyJ…tu anon key…" },
ia:       { keys: [], modelo: "gemini-3.8-flash", modelos: [ …lista de respaldo… ] },   // las claves van en Admin → Estado
totalMesas: 0,   // pon el total de mesas del distrito para ver el % reportado
```
Guarda y sube la carpeta completa a internet: **app.netlify.com/drop** (arrastra la carpeta o el zip). Te da una dirección
`https://algo.netlify.app`; reparte a los personeros `…/personero.html` y usa tú `…/admin.html`.

Cada vez que cambies `config.js`, vuelve a subir la carpeta.

## Día de la elección
- **Personero:** abre `personero.html` → nombre y mesa → ✅ "Mi mesa se instaló" (mañana) → foto del acta → 🤖 Leer → revisar → 💾 Guardar y enviar (tarde). Si no hay señal, "⬆ Subir pendientes" después.
- **Coordinador:** `admin.html` → PIN → Reporte (se actualiza solo cada 15 s), Actas (borrar una mesa mal cargada), Personeros.

## Notas
- Si un modelo de Gemini está saturado, la app pasa sola al siguiente hasta que uno responda; si una clave es rechazada o agotada, pasa a la siguiente clave al instante. En Admin → Estado, «Probar claves» muestra cuál está activa.
- Cualquiera que tenga la dirección puede abrir la app (la clave pública viaja en `config.js`): repártela solo a tu equipo. Para producción con login de personeros, ver `../DISENO.md`.
- Los candidatos vienen del JNE (Voto Informado) al 24 de setiembre de 2026. Si cambia una lista, edita `partidos` en `config.js`.
