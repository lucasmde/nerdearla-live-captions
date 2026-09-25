# Manual de uso — Live Captions

Guía para el equipo de producción de una conferencia. Cubre la instalación, la configuración de los escenarios, la operación durante el evento y qué hacer si algo falla.

## 1. Qué es y cómo funciona

Live Captions toma el audio en vivo de cada escenario y produce subtítulos en tiempo real en el idioma original y traducidos (español, inglés, portugués u otros). La audiencia los ve desde el celular o desde una pantalla de la sala, eligiendo sesión e idioma.

```
Escenario ──audio──▶ Consola del operador (browser) o ingest.js (ffmpeg)
                          │  WebSocket, PCM 16 kHz
                          ▼
                   Servidor Live Captions ──▶ Gemini Live (transcripción) + Gemini Flash / Gemma (traducción)
                          │
                          ▼
        /s/<sesión>?lang=es  (audiencia)   ·   /admin (producción)   ·   /api/.../transcript.srt
```

Tres roles:

- **Producción**: instala el servidor, define las sesiones, vigila `/admin`.
- **Operador de escenario**: abre `/operator/<sesión>` en la notebook de la sala y pone a transmitir el audio.
- **Audiencia**: abre `/` (o el QR de la sala), elige sesión e idioma.

## 2. Instalación (una vez, antes del evento)

### Requisitos

- Un servidor Linux con Docker (1 vCPU y 1 GB de RAM alcanzan para ~10 sesiones) **o** Node.js 20+.
- Un dominio con HTTPS (por ejemplo `captions.miconferencia.org`). Es obligatorio si vas a usar la consola del operador en el navegador: los navegadores sólo dan acceso al micrófono en páginas seguras.
- Una API key de Gemini: https://aistudio.google.com → *Get API key*. Activá la facturación del proyecto de Google Cloud para no quedar limitado por las cuotas del nivel gratuito (15 pedidos por minuto por modelo).

### En la nube en un clic

- **Render**: *New → Blueprint*, elegí el repo (usa `render.yaml`); cargá `GEMINI_API_KEY` y `PUBLIC_URL`. Así está montada la demo pública.
- **Railway**: *New project → Deploy from GitHub* (usa `railway.json`).
- **Google Cloud Run**: `GEMINI_API_KEY=... ./deploy/cloudrun.sh <proyecto> southamerica-east1`.
- **Kubernetes**: `kubectl apply -f deploy/kubernetes.yaml` (creá antes el secret `live-captions`).

### Con Docker (recomendado)

```bash
git clone https://github.com/lucasmde/nerdearla-live-captions
cd nerdearla-live-captions
cp .env.example .env              # editar: GEMINI_API_KEY e INGEST_TOKEN
cp sessions.example.json sessions.json   # editar: tus escenarios
docker compose up -d --build
```

El servidor queda en el puerto 8080. Ponelo detrás de un reverse proxy con TLS. Con Caddy es una línea:

```
captions.miconferencia.org {
    reverse_proxy localhost:8080
}
```

### Sin Docker

```bash
npm install
npm start
```

### Variables de entorno importantes (`.env`)

| Variable | Para qué sirve |
|---|---|
| `GEMINI_API_KEY` | Clave de Gemini. Sin ella el servidor arranca en modo demo (`ENGINE=mock`). |
| `INGEST_TOKEN` | Contraseña que deben conocer los operadores para enviar audio. **Siempre** poné una en producción. |
| `TRANSCRIBE_MODEL` | Modelo de transcripción en streaming (`gemini-3.5-transcribe-live`). |
| `TRANSLATE_MODEL` | Modelo de texto para traducir (`gemini-3.5-flash-lite`). |
| `TRANSLATE_FALLBACK_MODELS` | Modelos alternativos si el principal está saturado. |
| `TRANSLATE_PARTIALS` | `1` traduce también las frases a medio decir (menos espera, más costo). `0` sólo traduce frases completas. |
| `TRANSLATOR` | `gemini` (nube), `ollama` (Gemma local) o `none`. |

## 3. Configurar los escenarios (`sessions.json`)

```json
{
  "vocabulary": ["Nerdearla", "Kubernetes", "PostgreSQL", "Sysarmy"],
  "sessions": [
    { "id": "gran-sala", "name": "Gran sala", "room": "Konex", "color": "#FF323C", "sourceLang": "auto", "targetLangs": ["es", "en"],
      "agenda": [{ "day": "2026-09-25", "start": "13:45", "end": "14:25", "title": "El secreto para procesar terabytes de datos en JavaScript", "speaker": "Erick Wendel", "lang": "es" }] },
    { "id": "sala-b",  "name": "Sala B",              "room": "Piso 2",    "sourceLang": "en",   "targetLangs": ["es", "en"] },
    { "id": "taller",  "name": "Taller",              "room": "Lab",       "sourceLang": "es",   "targetLangs": ["es", "en", "pt"] }
  ]
}
```

- `id`: corto, sin espacios; aparece en las URLs (`/s/main`).
- `sourceLang`: `auto` si en ese escenario hay charlas en varios idiomas; un código fijo (`en`, `es`) mejora la precisión cuando el idioma es siempre el mismo.
- `targetLangs`: los idiomas que la audiencia puede elegir. Incluí siempre el idioma original de las charlas para que exista la opción "ver la transcripción literal".
- `color`: color de la sala (borde de la tarjeta y barra superior). `agenda`: charlas con `day`, `start`, `end`, `title`, `speaker`, `lang`; el sistema muestra "ahora / sigue" en hora del evento (`timezone` en el archivo) y suma los oradores al vocabulario.
- `vocabulary`: nombres propios, siglas y términos técnicos del evento. Mejora mucho el reconocimiento de nombres raros. Se puede poner uno global y otro por sesión.

Después de editar `sessions.json`, reiniciá el servidor (`docker compose restart`).

## 4. Operación durante el evento

### 4.1 Antes de cada bloque de charlas (operador)

1. En la notebook del escenario abrí `https://captions.miconferencia.org/operator/<id>`.
2. Conectá la salida de la consola de sonido a la entrada de audio de la notebook (line-in o interfaz USB). Elegí esa entrada en **Fuente de audio**.
3. Pegá el `INGEST_TOKEN` (queda guardado en el navegador).
4. Apretá **Iniciar**. El medidor de nivel debe moverse cuando alguien habla. Si está en cero, revisá la fuente elegida y el volumen de la consola.
5. Dejá esa pestaña abierta y la notebook sin suspender durante todo el bloque.

Alternativas a la consola web:

- **Desde el streaming**: si el escenario ya sale por RTMP/SRT, en el servidor corré
  `node tools/ingest.js --session main --input rtmp://encoder/live/main --token $INGEST_TOKEN`
  y no hace falta ninguna notebook en la sala.
- **Desde una pestaña**: para charlas remotas (Zoom, Meet, YouTube), el botón **Capturar audio de una pestaña** toma el audio de esa pestaña.

### 4.2 Qué ve la audiencia

- `https://captions.miconferencia.org/` lista los escenarios; cada tarjeta muestra si hay audio en vivo.
- `https://captions.miconferencia.org/s/main?lang=es` es la vista de subtítulos. Ese es el link para el **QR de la sala**.
- Botones: idioma, **ORIG** (muestra también la frase original debajo de la traducción), **A−/A+** tamaño de letra.
- Quien entra tarde ve las últimas frases de la charla, y con ⚙ → **¿Qué me perdí?** obtiene un resumen con IA de lo dicho hasta ahora, en su idioma.
- ⚙ → **Pausar para releer** congela la pantalla (los subtítulos siguen llegando por detrás) y **Volver al vivo** la retoma. **Alto contraste** activa el modo para baja visión / personas sordas: tipografía Atkinson Hyperlegible, letra grande, últimas tres líneas resaltadas. Se recuerda en ese dispositivo.

### 4.3 Pantalla de la sala y OBS

Agregá `&overlay=1` a la URL de la audiencia para obtener subtítulos grandes, centrados abajo, con fondo transparente:

- **OBS / vMix**: fuente *Browser* con `https://captions.miconferencia.org/s/main?lang=es&overlay=1&fs=44`, ancho 1920 × alto 1080. Los subtítulos quedan "quemados" en el stream.
- **Pantalla lateral**: un navegador a pantalla completa con la misma URL.

`fs=` fija el tamaño de letra en píxeles.

- **Pantalla de sala con QR**: `https://captions.miconferencia.org/s/main?lang=es&tv=1` muestra los subtítulos grandes y el QR de la sala abajo a la derecha, para el proyector o una TV lateral. El QR solo, para imprimir: `/api/sessions/main/qr.svg` (usa `PUBLIC_URL` del `.env`).
- **vMix / OBS fuente de texto / carteles LED**: `/api/sessions/main/now.txt?lang=es` devuelve el último subtítulo como texto; `now.json` agrega estado (`live`, `deadAir`) y hora.

### 4.4 Panel de producción

`https://captions.miconferencia.org/admin` muestra, por sesión:

- **Audio**: hace cuánto llegó el último paquete del escenario. Si pasa de unos segundos en rojo, el operador perdió la captura.
- **Motor**: si la conexión con Gemini está activa.
- **Último subtítulo**: hace cuánto salió el último parcial/final. Si hay audio pero no salen subtítulos, mirá los errores.
- **Traducción**: latencia promedio por frase.
- **Audiencia**: cuántas personas están conectadas a esa sesión.
- **Errores** y links rápidos al operador, la vista de audiencia, la pantalla con QR, el QR solo, `now.txt` y el SRT.
- **SIN SEÑAL** en la columna Audio: llega audio pero por debajo de −50 dBFS durante 20 s. Casi siempre es un cable desconectado, la consola muteada o la entrada equivocada.
- Para Grafana u otro monitoreo, `GET /metrics` expone todo en formato Prometheus.

### 4.5 Al terminar cada charla

Bajá la transcripción para publicarla con el video:

- `https://captions.miconferencia.org/api/sessions/main/transcript.srt?lang=es`
- Formatos: `.srt`, `.vtt`, `.txt`, `.json`. Sin `?lang=` devuelve el idioma original.

Los archivos también quedan en la carpeta `transcripts/` del servidor (`<id>.jsonl`), un archivo por sesión que acumula toda la jornada.

## 5. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El operador no puede iniciar el micrófono | La página no es HTTPS | Usar el dominio con TLS, no la IP. |
| "no se pudo conectar (¿token?)" en el operador | `INGEST_TOKEN` incorrecto | Copiar el token del `.env` del servidor. |
| Medidor en cero | Entrada de audio equivocada o muteada | Cambiar **Fuente de audio**; revisar la consola de sonido. |
| Subtítulos aparecen pero la traducción tarda o falta | Cuota de la API agotada (nivel gratuito) | Activar facturación en Google Cloud; el sistema rota entre modelos alternativos mientras tanto. |
| Se corta cada ~10 minutos | Límite de sesión del proveedor | El servidor rota la sesión solo; si ves cortes, subí `SESSION_ROTATE_MS` un poco por debajo de 10 min. |
| Idioma detectado incorrecto en la primera frase | Detección automática con poco audio | Se corrige solo en las frases siguientes; si el escenario es monolingüe, fijá `sourceLang`. |
| Nombres propios mal transcriptos | Falta vocabulario | Agregarlos a `vocabulary` en `sessions.json`. |

## 6. Costos y escala

- Cada sesión abre una conexión de transcripción en streaming y hace una llamada de traducción por frase (más algunas por parciales largos). Con `flash-lite` el costo es de pocos dólares por hora de escenario; ver https://ai.google.dev/pricing.
- El servidor es liviano: el trabajo pesado lo hace la API. Diez escenarios en paralelo corren en un contenedor de 1 GB.
- Para reducir costo: `TRANSLATE_PARTIALS=0`, o `TRANSLATOR=ollama` con Gemma en una máquina local.

## 7. Modo demo y pruebas

- `npm run mock` levanta el servidor sin API key con una charla simulada: sirve para probar la interfaz y los QR.
- `./tools/demo-parallel.sh` mete las charlas de ejemplo de `demo/` en cinco sesiones a la vez.
- `node tools/ingest.js --session main --input demo/talk_en.mp3` reproduce una charla en inglés a velocidad real contra el servidor; en `/s/main?lang=es` se ve el resultado.

## 8. Versión 2: cuentas, chat y mail

Todo lo de esta sección es opcional: sin configurar nada, la sala funciona como en la versión 1 (entrada con nombre, sin cuenta).

### Inicio de sesión con Google o GitHub

Para GitHub: creá una *OAuth App* en GitHub → Settings → Developer settings, con callback `https://captions.tu-dominio.org/api/auth/github/callback`, y poné `GITHUB_CLIENT_ID` y `GITHUB_CLIENT_SECRET` en `.env`. Para Google:

1. En https://console.cloud.google.com/apis/credentials creá un **ID de cliente OAuth** de tipo *Aplicación web*. En *Orígenes autorizados de JavaScript* agregá `https://captions.tu-dominio.org` (y `http://localhost:8080` para probar en tu PC).
2. Poné el ID en `.env` como `GOOGLE_CLIENT_ID=...` y reiniciá.
3. En la sala aparece el botón *Sign in with Google*. El nombre y la foto de la cuenta se muestran en la lista de conectados y en el chat.
4. `ALLOW_GUESTS=0` obliga a iniciar sesión. `SPEAKER_EMAILS=ana@conf.org,juan@conf.org` limita quién puede transmitir como expositor; vacío = cualquiera con sesión. `ALLOWED_DOMAINS=tu-dominio.org` limita quién puede entrar.

### Chat de la sala

Botón 💬 en la cabecera. Tiene emojis, audios (mantener apretado 🎙, hasta 20 s) y **levantar la mano ✋**: el expositor ve las manos levantadas en el chat y con *dar la palabra* habilita a esa persona; mientras tanto nadie más puede escribir (ven "Esperá: X tiene la palabra") hasta que el expositor apreta *Cerrar palabra*. Los mensajes se guardan con la transcripción (`transcripts/<id>.jsonl`) y los últimos 50 se muestran a quien entra tarde. Los expositores aparecen con 🎤.

### Enviar la transcripción por mail

En ⚙ → *Exportar* → escribí el mail destino (si iniciaste sesión, se completa con el tuyo), elegí "desde / hasta" y formato, y **Enviar por mail**. El servidor necesita un proveedor:

- **SMTP** (`SMTP_URL`): con Gmail usá una *contraseña de aplicación* (Cuenta de Google → Seguridad → Verificación en dos pasos → Contraseñas de aplicaciones):
  `SMTP_URL=smtps://tu-mail%40gmail.com:xxxx-xxxx-xxxx-xxxx@smtp.gmail.com:465`
- **Resend** (`RESEND_API_KEY`): sin SMTP, https://resend.com (gratis hasta 3.000 mails/mes) con tu dominio verificado.

`MAIL_FROM` define el remitente y `PUBLIC_URL` el link a la sala que va en el mail.
