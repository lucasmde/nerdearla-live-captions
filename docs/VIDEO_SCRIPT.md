# Guion de grabación — video de demo completo

Guion de ~4 minutos, pensado para grabar en una sola pasada (o en bloques cortos que se
pegan sin edición compleja), siguiendo el mismo orden que la [guía paso a paso del
manual](MANUAL.md#41-guía-paso-a-paso-armar-una-sala-y-ponerla-en-vivo-de-punta-a-punta):
**portada con eventos agendados → admin crea la sala → cualquiera crea su propia sala de
sandbox → admin genera el código de orador → el orador conecta el audio (dos caminos) → la
audiencia usa todas las funciones → producción monitorea.**

Grabar en **2560×1440 (o 4K si la placa de captura lo permite) y exportar sin recomprimir de
más** — así, al ampliar el video en YouTube o hacer zoom digital, el texto de subtítulos,
menús y códigos de 6 dígitos se sigue leyendo nítido en vez de pixelarse. Chrome con el zoom
al 100%, ventana maximizada, sin marcadores de favoritos visibles. Subir cursor grande /
resaltado de clicks si el software de grabación lo permite — ayuda mucho a que se entienda
cada paso en pantalla completa. Bitrate de exportación sugerido: al menos 12–16 Mbps para
1440p (más si es 4K), formato H.264 o H.265, para que YouTube no vuelva a comprimir de más
sobre un original ya blando.

> **Ya existe un primer corte silencioso a 2560×1440** (con leyendas en pantalla en vez de
> narración) que cubre exactamente los bloques nuevos de este guion — código de orador, sala
> de sandbox, orador conectando el audio y vista de audiencia con traducción en vivo. Sirve
> como referencia de encuadre/orden y como B-roll de partida: se le puede agregar narración
> de voz encima y listo, o usarlo de guía para grabar una toma propia con la cara/voz de
> Lucas. Quien lo tenga puede pedirlo o volver a generarlo corriendo
> `node server/index.js` en local con `ENGINE=mock` y `MOCK_AUTOPLAY=1` (no depende de la
> clave de Gemini ni toca producción).

Nota para quien mire este video después y quiera probarlo con sus propias manos: no hace
falta pedirle acceso a nadie. Cualquier cuenta de Google o GitHub puede entrar a
`/admin/sessions` y crear su propia sala de prueba para repetir exactamente estos pasos
(sección 3.1 del manual) — solo la administración de las 4 salas reales del evento está
restringida al equipo organizador.

## Pestañas a preparar antes de grabar

1. `https://nerdearla-live-captions.onrender.com/` — portada de salas.
2. `https://nerdearla-live-captions.onrender.com/admin/sessions` — panel de admin (logueado
   con una cuenta de `ADMIN_EMAILS`).
3. `https://nerdearla-live-captions.onrender.com/admin/sessions` **en una segunda ventana o
   perfil, logueada con una cuenta que NO está en `ADMIN_EMAILS`** — para mostrar cómo
   cualquiera crea su propia sala de sandbox.
4. `https://nerdearla-live-captions.onrender.com/operator/gran-sala` — consola de operador,
   **en una ventana de incógnito o con otra cuenta de Google** (para mostrar el flujo del
   código de orador desde cero, sin permisos previos).
5. `https://nerdearla-live-captions.onrender.com/s/gran-sala?lang=es` — vista de audiencia,
   sesión iniciada con una tercera cuenta (para mostrar chat, mano alzada, etc.).
6. `https://nerdearla-live-captions.onrender.com/s/gran-sala?lang=en` — la misma sala en
   inglés, en el celular o en otra ventana, para mostrar el cambio de idioma en vivo.
7. `https://nerdearla-live-captions.onrender.com/admin` — panel de producción.
8. Una pestaña de YouTube con una charla en inglés reproduciéndose (para el camino
   "pestaña de streaming" del orador) — cualquier charla técnica sirve.
9. `docs/manual.pdf` abierto, para el cierre.
10. Antes de grabar, crear con la cuenta de admin un evento de prueba con `scheduledAt` a
    varios meses en el futuro (sección 3.1 del manual, campo "Fecha y hora") para que la
    portada ya tenga algo en **🗓️ Próximamente** al arrancar la grabación.

## Bloques

**0:00–0:15 — Cold open**
Portada (pestaña 1): mostrar las salas con sus charlas actuales/siguientes, la cuenta
regresiva y cuántas hay en vivo en simultáneo. Narración: *"Live Captions: subtítulos en
vivo con traducción, para todas las salas de una conferencia en simultáneo, con licencia
abierta para que cualquier evento lo instale gratis."*

**0:15–0:30 — NUEVO: eventos agendados a futuro**
En la misma portada, bajar hasta la sección **🗓️ Próximamente** y detenerse en la pastilla
del evento de prueba creado antes de grabar: mostrar la cuenta regresiva, la fecha y hora, y
el nombre de quien lo creó. Narración: *"Un evento se puede cargar hoy para dentro de varios
meses y queda esperando, aparte de las salas en vivo, con cuenta regresiva y el nombre de
quien lo armó."*

**0:30–0:55 — El admin arma la sala**
Pestaña 2 (`/admin/sessions`). Mostrar la cabecera con el mail logueado y el botón **Cerrar
sesión**. Crear una sala nueva en vivo (id, nombre, ubicación, idiomas) o abrir una
existente y cargar una charla en la agenda (título, orador, horario). Narración: *"Quien
organiza el evento arma las salas y la agenda sin tocar un archivo ni reiniciar el
servidor."*

**0:55–1:20 — NUEVO: cualquiera puede crear su propia sala**
Cambiar a pestaña 3 (`/admin/sessions`, logueado con una cuenta que no es de
`ADMIN_EMAILS`). Mostrar que ve solo su propia sala de prueba (nunca las 4 reales) y crear
una nueva completando nombre, ubicación e idiomas. Narración: *"No hace falta pedirle acceso
a nadie: cualquier cuenta de Google o GitHub puede crear y administrar su propia sala de
prueba para aprender a usarlo, separada de las salas reales del evento."*

**1:20–1:40 — El código de orador**
Volver a la sala real con la cuenta admin, apretar **🔑 Código de orador**. Mostrar el código
de 6 dígitos grande en pantalla y leerlo en voz alta. Narración: *"Cuando no se sabe de
antemano el mail de quien va a hablar, se genera un código temporal por sala — nadie
necesita estar en ninguna lista."*

**1:40–2:15 — El orador conecta el audio: camino 1, micrófono**
Cambiar a pestaña 4 (`/operator/gran-sala`, sesión sin permisos). Mostrar el cuadro
**Habilitar como orador de esta sala**: iniciar sesión con Google, cargar el código leído
en el paso anterior, confirmar. Elegir **🎤 Detectar micrófono** (hablar mientras corre la
detección) y apretar **▶ Iniciar con micrófono**. Mostrar el medidor de nivel moviéndose y
el preview de "Últimos subtítulos" llenándose en vivo mientras se habla a cámara. Narración:
*"El orador entra, pone el código que le pasaron, y con un clic ya está transmitiendo — acá
mismo ve confirmado que está funcionando antes de arrancar la charla."*

**2:15–2:35 — El orador conecta el audio: camino 2, pestaña de streaming**
Apretar **■ Detener**. Cambiar la fuente: apretar **▶ Capturar audio de una pestaña**, elegir
en el selector de Chrome la pestaña de YouTube preparada (pestaña 8) y tildar "Compartir
audio de la pestaña". Mostrar que el preview sigue funcionando igual, ahora con el audio de
esa charla en inglés. Narración: *"Si la charla llega por Zoom, Meet o YouTube en vez de un
micrófono físico, es la misma consola: se captura el audio de esa pestaña del navegador."*

**2:35–3:15 — Lo que ve la audiencia**
Cambiar a pestaña 5 (`/s/gran-sala?lang=es`, sesión iniciada). Mostrar los subtítulos en
vivo traduciéndose, el botón **ORIG** (frase original debajo), **A−/A+**. Abrir ⚙ → **¿Qué
me perdí?** y mostrar el resumen con IA. Abrir el chat 💬: mandar un mensaje, levantar la
mano ✋. Mostrar la tarjeta de cuenta en la cabecera con **Cerrar sesión**. Narración: *"La
audiencia elige sala e idioma desde el celular, puede repasar lo que se perdió con un
resumen de IA, chatear, pedir la palabra, y todo funciona igual logueado o como invitado de
solo lectura."*

**3:15–3:30 — Multi-idioma y multi-sala en simultáneo**
Mostrar pestaña 6 (`?lang=en`) lado a lado con la 5, mismos subtítulos en dos idiomas al
mismo tiempo. Volver a la portada y mostrar el selector ▾ de sala cambiando entre las 4
salas del evento sin recargar. Narración: *"Cada persona elige su propio idioma, y el
sistema corre varias salas del evento al mismo tiempo sin perder sincronía."*

**3:30–3:45 — Integraciones de producción**
Pestaña 7 (`/admin`): mostrar la tabla con audio, motor, traducción, errores y audiencia de
las 4 salas en vivo. Mencionar rápido, superpuesto en pantalla o narrado: overlay para OBS
(`&overlay=1`), pantalla con QR (`&tv=1`), `now.txt` para vMix, exportación SRT/VTT/TXT, y
envío de la transcripción por mail. Narración: *"Todo queda monitoreado en un panel central,
con métricas para Grafana, y se integra directo con OBS, vMix y pantallas de sala."*

**3:45–4:00 — Cierre**
Volver a la portada. Mostrar el manual en PDF (pestaña 9) pasando un par de páginas.
Narración de cierre: *"Node.js, licencia Apache 2.0, deploy con un clic en Render, Railway,
Cloud Run o Kubernetes, y manual completo paso a paso — para que cualquier conferencia lo
use gratis."* Mostrar el link del repo en pantalla.

## Después de grabar

- Subir a YouTube en la mayor calidad disponible (elegir 1440p/2160p al exportar, no dejar
  que YouTube reciba un archivo ya recomprimido a 720p) y esperar a que termine de procesar
  "en alta resolución" antes de compartir el link — recién ahí se puede ampliar sin que se
  vea borroso.
- Reemplazar el link viejo (`https://youtu.be/35TdPJCY5dw`) por el nuevo en **los tres
  lugares**: `README.md` (badge/link de "Video"), `docs/DEVPOST.md`, y la descripción del
  proyecto en Devpost.com — los tres deben apuntar siempre al mismo video.
- Si se graba en bloques separados, un editor simple (o `ffmpeg -f concat`) alcanza para
  pegarlos sin necesidad de transiciones.
