# Auditoría de carga — ¿se satura el día de la elección?

Revisión del 2 de octubre de 2026 sobre el proyecto Supabase **Votos**
(`wqcndkiqjhpybqdbozsh`) y el sitio en Netlify.

Las cifras de este documento están **medidas**, no estimadas: se cargaron 200 actas de
prueba en la base, se midió cada consulta con un navegador real y luego se borraron
(la base quedó en 0 actas y 0 aperturas, como estaba).

---

## Resumen en una frase

**Netlify no es el problema. El problema son dos: el cupo de las claves de IA y el
refresco del tablero.** Las dos cosas ya están arregladas en el código; queda una
tercera, de seguridad, que no se puede arreglar sin que tú decidas (abajo, "Lo que
tienes que hacer tú").

---

## 1. Netlify: no se satura

Netlify solo entrega archivos: `personero.html`, `comun.js`, `estilos.css`, `config.js`.
Todo junto pesa **~105 kB**. El plan gratuito da 100 GB de tráfico al mes.

> 300 personeros abriendo la app 10 veces cada uno = **315 MB**. Es el 0,3 % del plan.

Netlify aguanta esto de sobra. Lo único que faltaba era decirle al navegador que no
volviera a bajar lo mismo en cada recarga, y que el sitio no se indexe en Google
(la llave pública de Supabase viaja en `config.js`). Eso ahora lo hace `netlify.toml`.

## 2. El cupo de IA: este era el riesgo grave 🔴

Cada vez que un personero tocaba "🤖 Leer números con IA", la app probaba
combinaciones de *clave × modelo* hasta que una respondiera. Con 3 claves y 14 modelos
en `config.js` eso son **42 combinaciones**, y no había tope: si los modelos gratis
estaban ocupados (justo lo que pasa cuando 200 personeros fotografían a la misma hora),
una sola acta podía disparar **42 peticiones**.

Y todos los personeros usan **las mismas claves**. Según el propio README, una cuenta
gratuita de Gemini da ~20 lecturas al día.

| | Peticiones de IA por acta | 200 actas |
|---|---|---|
| Antes | hasta 42 | hasta 8 400 |
| Ahora | **máximo 10** (normalmente 1) | ~200–400 |

Verificado en el navegador: con 3 claves, 14 modelos y todas las peticiones
respondiendo "saturado", la app se detiene en **10 peticiones** y le dice al personero
que escriba los números a mano.

Además:
- Una clave que contesta "sin cupo por hoy" se recuerda y pasa al final **el resto del
  día**, en vez de gastar un intento por cada acta.
- Si el proveedor manda `Retry-After` ("espérate X segundos"), ahora se respeta.
- Los reintentos llevan azar, para que 200 celulares no reintenten en el mismo segundo.
- Se bajó de 3 a 2 peticiones en paralelo: con cupo escaso, el paralelismo gasta cupo.

En **Admin → Estado** se añadió la fila "Cupo de IA": dice si alguna clave se quedó sin cupo hoy.

**Aun así, el cupo sigue siendo el cuello de botella real.** Ver "Lo que tienes que hacer tú".

## 3. El refresco del tablero: gastaba de más 🟠

El tablero del admin se refrescaba cada 15 s y la pantalla de TV cada 10 s, **siempre**,
con `select=*` (todas las columnas) y aunque nadie hubiera subido nada. Y seguía
consultando con la pestaña en segundo plano.

Medido con 200 actas en la base:

| Un refresco | Peso |
|---|---|
| Antes (`select=*` de actas + aperturas) | **187,3 kB** |
| Ahora, en el pico (solo las columnas que se usan) | **112,2 kB** |
| Ahora, tranquilo (solo "¿cambió algo?") | **22,7 kB** |

De esos 187 kB, **64,7 kB eran `ia_lectura`** — la lectura cruda de la IA, que solo la usa
la tabla de precisión y viajaba en cada refresco del tablero sin que nadie la mirara.

Lo que cambió:

- **Columnas explícitas** en vez de `select=*`. `ia_lectura` se pide solo al abrir la
  pestaña Actas.
- **Pregunta "¿cambió algo?" antes de bajar todo.** Pide una huella (mesa + hash de cada
  acta, 22,7 kB) y solo baja las actas completas si cambió. Y es listo: si en el refresco
  anterior llegó un acta, baja directo sin gastar la huella, porque lo más probable es que
  siga llegando. Así la huella ahorra en las horas muertas y no cuesta nada en el pico.
- **Se detiene con la pestaña oculta.** Verificado: con la pestaña en segundo plano no se
  programa ningún refresco. Un coordinador que deja la pestaña abierta en el fondo ahora
  no gasta nada.
- **Ritmo adaptativo:** 15 s mientras lleguen actas; si no pasa nada, se relaja hasta 90 s
  (60 s en la TV). Cuando llega un acta vuelve solo a 15 s.
- **Cadena de esperas en vez de `setInterval`.** Antes, si una consulta tardaba más que el
  intervalo, las peticiones se **apilaban** — el peor comportamiento posible justo cuando
  la nube va lenta. Ahora nunca hay dos refrescos a la vez.
- El botón "🔄 Actualizar" a repetición ya no multiplica peticiones.
- **Una sola consulta a la vez.** Si dos partes de la página piden los datos al mismo tiempo (el
  refresco automático y un clic), comparten la misma respuesta en vez de pedirla dos veces.
  Esto salió de una prueba: con dos consultas a la vez, la memoria de huellas se pisaba y el tablero
  decía "sin cambios" aunque acabara de llegar un acta. Estaba mal y ya está corregido.

**Efecto estimado para un día de elección** (1 tablero + 1 TV abiertos 12 h, 200 mesas):
de **~660 MB** a **~220 MB**, y en las horas sin movimiento el ahorro es de ~50 veces.
El plan gratuito de Supabase da 5 GB de salida al mes, así que antes un solo día de
pruebas con tres pestañas abiertas se comía la cuarta parte del mes.

## 4. Peticiones repetidas por doble toque 🟠

En un celular lento, el personero toca "Leer" o "Guardar" dos o tres veces porque no
pasa nada visible. Cada toque era una tanda de peticiones más.

Ahora el botón **se bloquea y dice qué está haciendo** ("⏳ Leyendo…", "⏳ Guardando…")
hasta que termina. Verificado: 3 toques seguidos = 1 sola operación, en los cuatro
botones (Leer, Guardar, Subir pendientes, Instalación).

Esto es lo único que se ve distinto en la pantalla del personero. El diseño no se tocó.

## 5. Las fotos 🟡

Las 10 fotos que ya estaban subidas pesan 2 446 kB, o sea **~245 kB cada una** (se
comprimían a 1600 px y 85 % de calidad).

Ahora se comprimen a 1500 px y se baja la calidad hasta que la foto pese menos de 200 kB,
sin bajar nunca de 0,6 de calidad para que los números del acta sigan legibles para la IA.
Quedan en ~140 kB: **la mitad de subida** (importante con señal mala en la mesa), la mitad
de almacenamiento y la mitad de datos del celular del personero.

También se arregló que la misma foto se comprimía **dos veces** (una al leerla con IA y
otra al guardarla). Ahora se comprime una sola vez.

Y se le puso **techo de 8 MB por archivo** al bucket `actas` en Supabase (antes no tenía
ninguno: una sola subida podía llenar el GB gratuito). La app sube ~140 kB, así que el
techo no molesta a nadie.

## 6. Control de caudal hacia la nube 🟠

No había ninguno: si Supabase respondía "espérate" (429) o fallaba (5xx), la app lo
trataba como error definitivo y, en el caso del tablero, volvía a intentar 15 s después
con una petición idéntica.

Ahora todas las peticiones a Supabase pasan por una sola capa que:
- limita a **4 peticiones a la vez** por pestaña;
- reintenta hasta 3 veces **solo** en 429, 5xx o sin respuesta, con espera creciente y azar;
- si el servidor manda `Retry-After`, **todas** las peticiones de esa pestaña esperan ese
  rato (un celular que reintenta no empeora la congestión de los demás);
- pone tope de tiempo a cada petición (20 s, 60 s para subir la foto).

En **Admin → Estado** ahora se ve "Caudal a la nube": cuántas veces la nube pidió calma.
Si el día de la elección ese número sube, ahí está la señal.

---

# 🔴 Lo que tienes que hacer tú

### 1. Las claves de IA están a la vista de cualquiera — lo más urgente

Comprobado hoy: con la llave pública que viaja en `config.js` (y que cualquiera que abra
la app puede leer), se pueden leer **las 3 claves de IA que tienes guardadas**:
2 de Google y 1 de OpenRouter. Cualquiera con el enlace puede copiarlas y gastarte el
cupo, o cobrarte si tienen saldo.

Lo mismo pasa con los datos: con esa llave cualquiera puede **borrar todas las actas**
o inventarse actas falsas. (Lo verifiqué borrando mis propias 200 filas de prueba con
un solo comando.)

Esto **no lo arreglé** porque arreglarlo de verdad cambia cómo funciona la app y hay que
decidirlo contigo. Hay dos caminos:

- **Rápido, para el día de la elección (recomendado si falta poco):** no guardar las
  claves en la nube. Quitarlas de Admin → Estado y ponerlas en `config.js`… pero ojo,
  `config.js` también es público. La única versión rápida de verdad es: **repartir el
  enlace solo al equipo, no publicarlo en ningún grupo grande, y tener las claves listas
  para rotarlas** si algo raro pasa. Con `X-Robots-Tag: noindex` (ya puesto) al menos no
  aparece en Google.
- **Bien hecho:** meter una *Edge Function* en Supabase que guarde las claves del lado del
  servidor y haga ella la llamada a la IA. El celular le manda la foto a la función y la
  función responde los números. Las claves nunca salen del servidor, y además se puede
  poner un límite por celular ahí mismo. El plan gratuito de Supabase incluye 500 000
  invocaciones al mes, de sobra. Es medio día de trabajo; dime y lo hago.

### 2. Pon más cupo de IA — esto decide si funciona o no el día de la elección

Tu cuello de botella no es el servidor, es el cupo. Según tu propio README:

| Opción | Lecturas al día | Alcanza para |
|---|---|---|
| 1 cuenta Gemini gratis | ~20 | 20 mesas |
| 10 cuentas Gmail distintas | ~200 | justo para 200 mesas, sin margen |
| **OpenRouter con US$10 de saldo** | **1 000** | 200 mesas con 5x de margen |

**Recomendación: recarga US$10 en OpenRouter.** Es la diferencia entre que la IA funcione
toda la tarde y que deje de funcionar a la media hora. Diez dólares.

Y antes del día: **Admin → Estado → 🔎 Probar claves**, para ver cuáles están vivas.

### 3. Pon el total de mesas

`config.js` tiene `totalMesas: 0`. Sin eso el tablero no puede mostrar el % reportado ni
la proyección. Se pone en **Admin → Estado → Total de mesas** (se guarda en la nube, no
hay que volver a subir la carpeta).

### 4. Publica los cambios (ya es automático)

Buenas noticias: el repositorio **ya está conectado a Netlify** (proyecto
`elecciones-municipales-2026`), así que no hay que arrastrar ninguna carpeta. En cuanto el
pull request entre a `main`, Netlify publica solo.

Comprobado en el deploy preview del pull request: las cabeceras nuevas se aplican de verdad
(`comun.js` y `estilos.css` con una hora de caché, el HTML y `config.js` revalidando siempre,
y `noindex` en todo), y la app carga y funciona desde Netlify contra Supabase.

> El README todavía explica el método de arrastrar la carpeta a app.netlify.com/drop. Como el
> repo ya está conectado, ese paso sobra; conviene actualizarlo cuando haya tiempo.

### 5. Haz un ensayo con gente de verdad

Lo que no se puede medir desde aquí: 10 personeros reales, a la misma hora, con sus
propios celulares y su propia señal, cada uno subiendo una foto. Mira después
**Admin → Estado → Caudal a la nube**: si dice "sin frenadas", estás bien.

---

# Lo que se podría implementar después

Nada de esto es urgente ni cambia la pantalla del personero:

1. **Edge Function para la IA** (lo del punto 1 de arriba). Resuelve seguridad y de paso
   permite limitar peticiones por celular desde el servidor.
2. **Subir los pendientes solos al recuperar señal.** Hoy el personero tiene que tocar
   "⬆ Subir pendientes". Si la app lo hiciera sola al volver la señal, se evitarían los
   toques repetidos. No lo puse para no cambiar un comportamiento que ya probaste.
3. **Cerrar la escritura de la base.** Hoy cualquiera puede insertar o borrar actas. Con
   personeros identificados (un PIN por mesa, o Supabase Auth) se podría permitir solo
   escribir la mesa propia. Es el cambio más grande de todos.
4. **Avisar en el tablero cuándo fue el último acta.** Para distinguir "no llega nada
   porque nadie sube" de "no llega nada porque algo se rompió".
5. **Limitar el tamaño de la base.** Hoy nada impide que alguien inserte un millón de
   filas. Un límite por IP solo se puede hacer desde una Edge Function.

---

## Cómo se comprobó

Con un navegador real (Chromium) contra tu Supabase de verdad:

- Las 3 pantallas cargan sin errores de JavaScript.
- El personero muestra los 9 partidos y suma bien los votos.
- Los 4 botones: 3 toques seguidos → 1 sola operación.
- Las listas de columnas nuevas responden 200 (una columna mal escrita habría dado 400).
- La huella: 1ª consulta baja todo, 2ª baja directo tras un cambio, 3ª (ya tranquilo)
  pide **solo** `mesa,hash` y `mesa,estado` — ninguna columna pesada.
- Con la pestaña oculta no se programa ningún refresco; al volver, se reanuda.
- La cascada de IA se detiene en 10 peticiones con 3 claves y 14 modelos fallando.
- Se insertó un acta de verdad en la base: el tablero la detectó y la bajó; se borró y también lo
  detectó. **Aquí se encontró un error** (dos consultas simultáneas se pisaban la memoria y el tablero
  reportaba "sin cambios" habiendo cambios); se corrigió y la prueba volvió a pasar.
- Las 200 actas de prueba y el acta suelta se borraron: la base quedó en 0 actas y 0 aperturas.
- Y lo mismo **sobre Netlify de verdad**, en el deploy preview del pull request: la pantalla del
  personero carga, muestra los 9 partidos, suma bien y los cuatro botones no duplican peticiones.
  Las cabeceras llegan como se esperaba (una hora de caché en `comun.js` y `estilos.css`, el HTML y
  `config.js` revalidando siempre, `noindex` en todo).
