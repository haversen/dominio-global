# Dominio Global

Juego web multijugador de estrategia y guerra mundial. Servidor Node.js + Socket.IO (autoridad del estado) y cliente en JavaScript sin paso de compilación.

## Requisitos

- Node.js 20 o superior (recomendado: la versión LTS de https://nodejs.org)

## Puesta en marcha

```bash
npm install
npm start          # o: npm run dev  (se reinicia al guardar cambios)
```

Abre http://localhost:3000. La consola también muestra la dirección de red local (`http://192.168.x.x:3000`) para que tus amigos se conecten desde su ordenador en la misma red Wi‑Fi.

Variables opcionales: `PORT` (por defecto 3000) y `HOST` (por defecto `0.0.0.0`).

### Jugar con amigos por Internet (desde tu ordenador)

Túnel rápido: `npx cloudflared tunnel --url http://localhost:3000` (o `ngrok http 3000`) y comparte la URL que te da. Funciona mientras tu ordenador y el túnel estén abiertos.

### Probar en local con varios jugadores

Cada **pestaña** del navegador es un jugador distinto. Abre varias pestañas (o ventanas de incógnito) en http://localhost:3000.

## Publicarlo en Internet (Render, gratis)

El repositorio incluye `render.yaml`, así que Render lo configura solo.

1. Sube el proyecto a GitHub (en la carpeta del proyecto):
   ```bash
   git init && git add . && git commit -m "Dominio Global"
   ```
   Crea un repositorio vacío en https://github.com/new y sigue las instrucciones de «push an existing repository».
2. En https://render.com crea una cuenta, pulsa **New → Blueprint** y elige tu repositorio. Render leerá `render.yaml`, instalará y arrancará el servidor.
3. En unos minutos tendrás una dirección del tipo `https://dominio-global.onrender.com`. Compártela con tus amigos.

Notas del plan gratuito: el servidor «se duerme» tras 15 minutos sin visitas y tarda ~1 minuto en despertar; al dormirse o redesplegar se pierden las partidas en curso (viven en memoria).

**Otras opciones**: el `Dockerfile` sirve para Fly.io, Railway o cualquier VPS (`docker build -t dominio-global . && docker run -p 3000:3000 dominio-global`).

El servidor está preparado para estar expuesto: valida todas las acciones, limita a cada jugador a ~10 acciones por segundo, rechaza mensajes de más de 64 KB, envía cabeceras de seguridad y se cierra de forma ordenada. `GET /health` informa de salas, jugadores, memoria y rendimiento.

## Pruebas

```bash
npm test                                   # pruebas unitarias y de integración
npm run load-test -- 20 4 30               # prueba de carga: 20 salas × 4 bots durante 30 s
npm run load-test -- 50 6 30 https://tu-servidor.onrender.com
```

Resultados de referencia en un portátil (servidor y bots en la misma máquina):

| Bots | Acciones/s | Latencia p50 / p95 | Ciclo del servidor |
|------|-----------:|-------------------:|-------------------:|
| 80 (20 salas)  | ~80  | ~1 ms / ~33 ms    | ~20 ms de 250 ms |
| 300 (50 salas) | ~210 | ~170 ms / ~600 ms | ~70 ms de 250 ms |

Para optimizar el tráfico, el estado de cada sala se envía como mucho una vez por ciclo (250 ms) y los países viajan en un formato compacto (`shared/wire.js`, ~3× más pequeño).

## Mapa

`shared/world.json` se genera a partir de Natural Earth (paquete `world-atlas`, escala 1:110m) y ya viene incluido. Solo hay que regenerarlo si cambias `scripts/build-world.js` (nombres, rutas marítimas, proyección):

```bash
npm run build:map
```

Cada país incluye su contorno ya proyectado, nombre en español, superficie, centroide y vecinos (fronteras terrestres + rutas marítimas para que las islas sean alcanzables). El script comprueba que todo el mundo forme un único grafo conectado.

## Tiempo real

No hay turnos: cada jugador actúa desde su dispositivo cuando quiere y el servidor aplica todo al momento sobre el mapa común. El servidor avanza las partidas 4 veces por segundo y la velocidad se ajusta en el lobby (lenta, normal, rápida). Si no queda nadie conectado, la partida se pausa.

### Economía

- Cada país produce dinero, alimentos, petróleo e industria por minuto según un perfil aproximado al real (`shared/economy.js`). La capital de cada jugador tiene una bonificación fija.
- Los recursos se cobran de forma continua, menos el mantenimiento de las tropas.
- Desarrollar un país (niveles 1–5) cuesta dinero e industria, tarda un tiempo en completarse y da +25 % de producción y +5 % de defensa por nivel.
- Los recursos de cada jugador son privados: el servidor solo se los envía a su dueño.

### Tropas y combate (`shared/military.js`)

| Unidad     | Ataque | Defensa | Mantenimiento | Notas                                           |
|------------|--------|---------|---------------|-------------------------------------------------|
| Infantería | 1      | 1,5     | alimentos     | barata, lenta                                    |
| Tanques    | 4      | 3       | petróleo      | sufren en montaña, selva y hielo                 |
| Aviación   | 5      | 2       | petróleo      | muy rápida, cruza el mar sin barcos              |
| Marina     | 3      | 3       | petróleo      | solo en países con costa; necesaria para cruzar el mar con tropas de tierra |

- Reclutar tarda unos segundos (entrenamiento). Las tropas se mueven solo a países vecinos y tardan según la distancia y la unidad más lenta. Todos los jugadores ven los ejércitos en marcha.
- Al llegar a un país ajeno hay batalla: fuerza de cada bando × terreno × capital (+25 %) × desarrollo × desembarco (−25 %) × suministro × azar (±20 %). Si gana el atacante, conquista el país (que pierde un nivel de desarrollo); si no, sus tropas se pierden. El ganador sufre bajas según lo igualada que estuviera la batalla.
- Sin alimentos o sin petróleo, las unidades que dependen de ellos rinden a la mitad.
- Los países neutrales tienen guarnición propia según su tamaño y economía.
- Perder la capital quita su bonificación. Un jugador sin países ni ejércitos queda eliminado.

### Diplomacia, comercio y tecnología

- Entre jugadores, la relación inicial es de **paz**: para atacar a otro jugador hay que **declararle la guerra** (unilateral, se anuncia a todos). Los países neutrales siempre se pueden atacar.
- **Paz**, **pacto de no agresión** (5 minutos en los que nadie puede declarar la guerra), **alianza** y **comercio** se proponen y el otro jugador acepta o rechaza. Las propuestas caducan en 1 minuto.
- Entre **aliados**, enviar tropas a un país del aliado lo refuerza (las tropas pasan a defenderlo). Romper una alianza es declarar la guerra y se anuncia como traición.
- Si se firma la paz mientras un ejército está en marcha, al llegar da media vuelta.
- **Comercio**: se ofrecen recursos a cambio de otros (o se regalan). El servidor comprueba que ambos los tengan en el momento de aceptar.
- **Tecnología** (`shared/tech.js`): Industrialización (+10 % producción), Doctrina militar (+10 % ataque), Fortificaciones (+10 % defensa) y Logística (+15 % velocidad, −10 % mantenimiento). Tres niveles cada una; una investigación a la vez.

### IA neutral y victoria

- **IA de los países neutrales** (`server/ai.js`, nivel elegido en el lobby):
  - *Pasiva*: las guarniciones solo se recuperan poco a poco.
  - *Normal*: además, los vecinos neutrales envían refuerzos a un país atacado (si llegan antes que el atacante) y la IA intenta recuperar los países recién conquistados si su defensa es débil.
  - *Agresiva*: se recupera más rápido y ataca cualquier frontera débil de los jugadores.
- **Condiciones de victoria** (`server/victory.js`):
  - *Dominación*: controlar el % configurado de la superficie mundial.
  - *Último en pie*: ser el único jugador no eliminado (solo si la partida empezó con 2 o más).
  - *Límite de tiempo*: al acabar, gana la mayor puntuación (territorio, países, desarrollo, tecnología, tropas y recursos).
  - Si la IA elimina a todos los jugadores, la partida termina en derrota común.
- Al terminar se muestra la clasificación con estadísticas de batallas, y el anfitrión puede volver al lobby para jugar la revancha.

## Sonido y avisos

Los efectos se sintetizan en el navegador con Web Audio (`public/js/sound.js`), sin archivos: reclutar, marchar, batallas, conquistas, alarma de ataque entrante, propuestas diplomáticas, inicio y fin de partida. El botón 🔊 los silencia (se recuerda en el navegador).

Cuando un ejército ajeno se dirige a uno de tus países, suena una alarma y aparece un aviso con quién viene, cuántas unidades y cuándo llega.

## Estructura

```
server/
  index.js    Arranque: escucha en el puerto y muestra las URLs
  app.js      Express + Socket.IO: traduce eventos de red a acciones
  rooms.js    RoomManager: salas, jugadores, lobby, reconexión, limpieza
  game.js     Estado de la partida: países, asignación, economía, ejércitos, batallas
  diplomacy.js Guerra, paz, pactos, alianzas y comercio
  ai.js       IA de los países neutrales
  victory.js  Clasificación y condiciones de victoria
  utils.js    Códigos de sala, ids, saneado de nombres y chat
shared/
  settings.js Esquema de ajustes de partida (lo usan servidor y cliente)
  economy.js  Producción por país, bonificación de capital y costes de desarrollo
  military.js Unidades, terreno, movimiento y resolución de batallas
  diplomacy.js Relaciones y propuestas entre jugadores
  tech.js     Árbol tecnológico
  score.js    Puntuación y textos de victoria
  wire.js     Formato compacto de los países para la red
  world.json  Mapa mundial generado (países, contornos, vecinos)
scripts/
  build-world.js  Genera shared/world.json
  load-test.js    Prueba de carga con bots
public/
  index.html  Pantallas: menú, lobby y partida
  css/        Estilos
  js/         main.js (menú/lobby), game-ui.js (partida), map.js (mapa SVG),
              diplomacy-ui.js (diplomacia, comercio y tecnología), sound.js (efectos),
              net.js (conexión), dom.js (utilidades)
test/         Pruebas unitarias y de integración (node:test)
```

## Protocolo

Todas las acciones del cliente usan *acknowledgements*: el servidor responde `{ ok: true, ... }` o `{ ok: false, code, error }`.

| Cliente → servidor | Datos                  | Descripción                          |
|--------------------|------------------------|--------------------------------------|
| `session:resume`   | —                      | Recupera la sala tras recargar/corte |
| `room:create`      | `{ name }`             | Crea sala y te hace anfitrión        |
| `room:join`        | `{ name, code }`       | Entra en una sala por código         |
| `room:leave`       | —                      | Sale de la sala                      |
| `room:settings`    | `{ patch }`            | Cambia ajustes (solo anfitrión)      |
| `room:ready`       | `{ ready }`            | Marca/desmarca "listo"               |
| `room:kick`        | `{ playerId }`         | Expulsa a un jugador (anfitrión)     |
| `room:start`       | —                      | Empieza la partida (anfitrión)       |
| `room:backToLobby` | —                      | Tras el final, vuelve al lobby (anfitrión) |
| `game:pick`        | `{ countryId }`        | Elige país inicial (modo «elegir»)   |
| `game:develop`     | `{ countryId }`        | Inicia el desarrollo de un país propio |
| `game:recruit`     | `{ countryId, type, count }` | Recluta unidades (tardan en estar listas) |
| `game:move`        | `{ from, to, units }`  | Envía tropas a un vecino (refuerzo o ataque) |
| `game:research`    | `{ tech }`             | Inicia una investigación             |
| `diplo:war`        | `{ playerId }`         | Declara la guerra                    |
| `diplo:propose`    | `{ playerId, type, trade? }` | Propone paz, pacto, alianza o comercio |
| `diplo:respond`    | `{ proposalId, accept }` | Acepta o rechaza una propuesta     |
| `diplo:cancel`     | `{ proposalId }`       | Retira una propuesta propia          |
| `chat:send`        | `{ text }`             | Mensaje de chat                      |

| Servidor → cliente | Descripción                                        |
|--------------------|----------------------------------------------------|
| `room:state`       | Instantánea pública de la sala                     |
| `game:self`        | Datos privados: recursos, tecnología y propuestas (cada segundo) |
| `diplo:answered`   | Respuesta del otro jugador a tu propuesta          |
| `chat:message`     | Mensaje de chat o de sistema                       |
| `room:kicked`      | Has sido expulsado                                 |
| `room:closed`      | La sala se ha borrado por inactividad              |
| `session:replaced` | Tu sesión se ha abierto en otra pestaña            |
