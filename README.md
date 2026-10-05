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

Cada navegador recuerda a su jugador (aunque se cierre), así que para probar con varios jugadores en un mismo ordenador usa **ventanas de incógnito** o navegadores distintos.

## Publicarlo en Internet (Render, gratis)

El repositorio incluye `render.yaml`, así que Render lo configura solo.

1. Sube el proyecto a GitHub (en la carpeta del proyecto):
   ```bash
   git init && git add . && git commit -m "Dominio Global"
   ```
   Crea un repositorio vacío en https://github.com/new y sigue las instrucciones de «push an existing repository».
2. En https://render.com crea una cuenta, pulsa **New → Blueprint** y elige tu repositorio. Render leerá `render.yaml`, instalará y arrancará el servidor.
3. En unos minutos tendrás una dirección del tipo `https://dominio-global.onrender.com`. Compártela con tus amigos.

Notas del plan gratuito: el servidor «se duerme» tras 15 minutos sin visitas y tarda ~1 minuto en despertar.

### Cuentas y «Mis partidas»

En el menú se puede **crear una cuenta** o **iniciar sesión** (usuario y contraseña), o seguir jugando como invitado. Con cuenta:

- Tus partidas quedan guardadas en tu cuenta y aparecen en **Mis partidas**, con su estado, tu país y los jugadores. Puedes estar en varias partidas a la vez y entrar en la que quieras.
- El botón **☰ Partidas** (en la sala y en la partida) vuelve al menú **sin abandonar** la partida.
- Puedes iniciar sesión en otro dispositivo y seguir donde lo dejaste.

Seguridad (`server/accounts.js`): las contraseñas se guardan como huella *scrypt* con sal (nunca en claro), las sesiones son claves aleatorias de las que solo se guarda el hash, y tras 5 intentos fallidos el usuario queda bloqueado un minuto. Las cuentas se guardan junto a las partidas (`data/accounts.json` o Upstash).

### Partidas largas (de días o una semana)

Las partidas en marcha se guardan cada minuto y al apagarse el servidor, y se recuperan al arrancar (`server/storage.js`). Mientras tanto el mundo sigue: si nadie está conectado, los ingresos y los ejércitos siguen avanzando, y una partida sin nadie dura hasta 8 días. Cada dispositivo recuerda a su jugador, así que basta con volver a abrir la página para seguir.

- **En tu ordenador** se guardan en `data/rooms.json` (o en la carpeta `DATA_DIR`).
- **En Render** el disco se borra al dormirse o al actualizar, así que hace falta una base de datos gratuita de [Upstash](https://upstash.com):
  1. Crea una cuenta en https://console.upstash.com y pulsa **Create Database** (tipo Redis, plan Free, la región más cercana).
  2. En la base de datos, en la sección **REST API**, copia `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.
  3. En Render, abre el servicio → **Environment** → **Add Environment Variable** y añade las dos con sus valores. Render se reinicia solo.
  4. En los registros (*Logs*) de Render verás `Guardado en Upstash Redis`.

Para partidas de varios días conviene la velocidad **Muy lenta** y un límite de tiempo de **1 día**, **3 días** o **1 semana**.

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

No hay turnos: cada jugador actúa desde su dispositivo cuando quiere y el servidor aplica todo al momento sobre el mapa común. El servidor avanza las partidas 4 veces por segundo. La velocidad de la economía y la investigación se ajusta en el lobby (muy lenta, lenta, normal, rápida). La partida sigue aunque no quede nadie conectado.

### Movimiento de las tropas, como en la vida real

El tiempo de viaje es la **distancia real en km** entre los dos países (calculada con sus coordenadas, +15 % porque los caminos no son rectos) dividida por la **velocidad real en km/h** de la unidad más lenta: infantería 20 km/h, tanques 25, carros modernos 40, barcos 65-80, bombarderos 260, cazas 320, reactores 520… Cruzar el mar añade un 30 %.

En la sala se elige el ritmo:

| Ritmo | Equivalencia | España → Francia a pie |
|-------|--------------|------------------------|
| Realista | como en la vida real | ~2 días |
| Lenta | 1 h real = 1 min | ~50 min |
| Normal | 1 h real = 10 s | ~8 min |
| Rápida (por defecto) | 1 h real = 2 s | ~1,5 min |
| Arcade | casi al instante | ~25 s |

### Mapas (`shared/scenarios.js`)

- **Mundo entero**, **solo Europa**, **solo Asia**, **solo América** y **solo África**.
- Escenarios inspirados en guerras: **Gran Guerra (1914-1918)**, **Segunda Guerra Mundial**, **Guerra del Pacífico** y **Guerra Fría**. Tienen países protagonistas (⭐) que se reparten primero, y en los tres primeros se puede empezar al lado de otro jugador.
- **🏛 Antigua Grecia (450 a. C.)**: un mapa propio con 44 polis, reinos y satrapías persas (Atenas, Esparta, Tebas, Corinto, Macedonia, Lidia…) recortados sobre la costa real del Egeo (`shared/ancient.js`, generado con `npm run build:historic`).
- **🏯 Japón samurái (1560)**: la época Sengoku con 39 clanes y reinos japoneses (Oda, Takeda, Uesugi, Mōri, Shimazu, Tokugawa, Date, Hōjō, el shogunato Ashikaga, el reino de Ryūkyū, los ainu…), las 8 provincias de la Corea Joseon y la China Ming con los yurchen y los mongoles. Tropas de la época: ashigaru, samuráis, ninjas, caballería samurái, arqueros, arcabuceros, cañones, kobaya, sekibune y atakebune.
- **🦅 Imperio romano (117 d. C.)**: el imperio de Trajano en su máxima extensión, dividido en 128 regiones con el nombre de su gran ciudad (Roma, Bizancio, Alejandría, Cartago, Antioquía, Lugdunum, Londinium, Éfeso, Tarraco…) y rodeado de los imperios y pueblos de la época: el Imperio parto (Ctesifonte, Ecbatana, Persépolis…), el Imperio kushán (Bactra), Armenia, el reino del Bósforo, Kush (Meroe), los germanos (marcomanos, queruscos, godos, vándalos…), los sármatas, los dacios libres, los garamantes, los caledonios e Hibernia. Las tropas son legionarios, cohortes pretorianas, speculatores, caballería auxiliar, catafractos, elefantes, sagitarios, onagros, escorpiones, liburnas, trirremes y quinquerremes; se paga en denarios, trigo, aceite y hierro, y la asamblea es el **Senado romano**. En «Dos bandos» se enfrentan el Imperio romano contra los partos y bárbaros. Los desiertos y estepas enormes cuentan como mucho 150.000 km² para la dominación.
- En la Antigua Grecia las tropas son de la época (`shared/eras.js`): hoplitas, falange, espartanos, caballería, carros, elefantes, arqueros, catapultas, balistas, trirremes, birremes y quinquerremes, con velocidades reales a pie, a caballo y a remo. Los materiales son dracmas, trigo, aceite y bronce; hay flechas incendiarias y fuego griego, pero no bomba nuclear ni carrera espacial.
- En el mapa de Europa, **Rusia es solo su parte europea** (hasta los Urales): se dibuja recortada y las distancias se miden desde la Rusia europea; el resto se ve apagado.
- **Partidas por equipos** (ajuste «Equipos»): equipos de 2, de 3 o dos bandos (Eje contra Aliados, OTAN contra Pacto de Varsovia, Liga de Delos contra Liga del Peloponeso, Imperio romano contra partos y bárbaros…). Los compañeros empiezan aliados, no pueden atacarse, no pueden aliarse con el equipo contrario y ganan juntos (la dominación suma los países del equipo). En «Dos bandos» cada bando recibe sus países históricos (`shared/teams.js`).
- Enviar tropas por porcentaje (10–100 %, redondeando hacia abajo).
- Reclutar escribiendo la cantidad (hasta 500 por orden) o con «Max» (todo lo que puedes pagar). Los lotes grandes tardan más: cada unidad extra añade un 25 % del tiempo de una.
- Equilibrio: la infantería cuesta más y defiende menos, y por encima de 40 unidades en un mismo combate cada unidad extra cuenta la mitad (`stackFactor` en `shared/military.js`).
- **Préstamos** (Mercado → 🏦): quien pide elige cantidad, interés y plazo; cualquier jugador o bot puede concederlo y al vencer se cobra solo (con un 10 % de recargo si no hay dinero suficiente). Ver `server/loans.js`.
- Qué pasa al tomar la capital de un jugador se elige en la sala (ajuste «Al tomar la capital de un jugador»):
  - **el conquistador se queda con todo su imperio** (por defecto; con sus tropas, y los países anexionados empiezan con estabilidad baja). Si la capital la toman las fuerzas neutrales, su imperio pasa a ser neutral;
  - **queda eliminado y su imperio se vuelve neutral**;
  - **traslada la capital y sigue jugando**: la nueva capital es su país más desarrollado (si no le quedan países, queda eliminado).
- **Marcas en el mapa** (📍 en el panel del país): atacar aquí, defender aquí u ojo aquí. Solo las ven tus compañeros de equipo y aliados, con un aviso y un anillo que late sobre el país unos segundos.
- Una partida terminada (por victoria o por tiempo) **se borra del servidor a los 10 minutos** (antes, si el anfitrión vuelve al lobby para la revancha). Nunca se guarda en el almacenamiento.
- **☰ Menú de la partida**: Diplomacia, Mundo, Mercado, Tecnología, Clasificación, sonido, avisos, gráficos ligeros, tutorial y salir, en un solo botón.
- La victoria científica (llegar a la Luna) solo existe en la **Guerra Fría**; en los demás mapas la Luna da puntos.
- Los países neutrales (controlados por la IA) se pintan todos del mismo gris para distinguirlos de los jugadores.
- Los países de fuera del mapa se ven apagados y no se pueden pisar ni bombardear. El % de dominación se mide sobre el mapa elegido (de Rusia, en Europa, solo cuenta su parte europea).

### Niebla de guerra y espionaje

Con la **niebla de guerra** (activada por defecto) cada jugador solo ve las tropas de sus países, de sus vecinos, de sus aliados y de los destinos de sus ejércitos; del resto solo sabe quién es el dueño. El servidor envía a cada jugador su propia vista, así que no se puede hacer trampa mirando los datos.

**Espionaje** (`shared/espionage.js`): desde el panel de un país ajeno se envían espías:

| Misión | Efecto | Éxito |
|--------|--------|------:|
| 🔭 Reconocimiento | Revela sus tropas 3 minutos | 90 % |
| 💥 Sabotaje | Detiene sus obras y daña un edificio (o parte de la guarnición) | 55 % |
| 📄 Robar tecnología | Copia una investigación del dueño | 35 % |
| ✊ Fomentar revuelta | Baja 40 puntos su estabilidad | 45 % |

Si una misión falla, el espía puede ser capturado y se anuncia quién lo envió.

### Estabilidad, rebeliones y cansancio de guerra

- Cada país conquistado tiene **estabilidad** (0-100 %): empieza en 40 % (si era neutral) o 25 % (si era de otro jugador) y sube con el tiempo, más rápido con al menos 5 tropas dentro; sin tropas se desmorona. Un país inestable produce menos (50 % con estabilidad 0) y, por debajo del 25 %, puede **sublevarse** y volver a ser neutral. La capital nunca se subleva.
- **Cansancio de guerra**: cada unidad perdida baja los ingresos (hasta un 40 %) y se recupera poco a poco.

### Recursos estratégicos

☢️ **Uranio**, 💎 **tierras raras** y 🌳 **caucho** solo existen en algunos países (como en la vida real) y aparecen en el mapa bajo su nombre. Hacen falta para las armas y tropas avanzadas: caucho para la infantería mecanizada, los tanques pesados y los bombarderos; tierras raras para los carros modernos, los reactores y los misiles; uranio para la bomba nuclear. Basta con controlar un país que los tenga o ser aliado de quien lo controla.

### El mundo: eventos, ONU, misiones y carrera espacial (pestaña 🌐 Mundo)

- **Eventos mundiales** cada pocos minutos, con su titular en **El Diario Global**: crisis del petróleo, cosecha histórica, boom económico, pandemia, huracanes, terremotos, golpes de estado, avances científicos y fiebres del oro.
- **Naciones Unidas**: cada pocos minutos se vota una resolución (sanciones contra quien usó una bomba nuclear o contra el imperio más grande, alto el fuego entre dos jugadores en guerra, ayuda humanitaria al más débil o prohibición de las nucleares). Cada voto pesa tantos países como controla quien vota. En los mapas históricos la asamblea lleva el nombre de la época: la Liga Anfictiónica en la antigua Grecia y la Corte Imperial de Kioto en el Japón samurái.
- **Misiones secretas**: cada jugador recibe un objetivo oculto (controlar media región, construir, desarrollar, eliminar a un rival, dominar el mar, espiar, acumular dinero o reunir los tres recursos estratégicos). Cumplirlo da 250 puntos o, si se activa en la sala, la victoria.
- **Carrera espacial** (en Tecnología): 🛰️ satélite espía (te quita la niebla de guerra), 🏗️ estación espacial (investigación un 20 % más rápida) y 🌕 llegada a la Luna (**victoria científica**).

### Bots (opcionales)

En la sala se pueden añadir de 0 a 5 **bots** (por defecto ninguno) que juegan con las mismas reglas: gestionan su economía, investigan, construyen, protegen su capital, atacan, declaran la guerra a vecinos más débiles, responden a la diplomacia y votan en la ONU. Su carácter depende de la dificultad elegida para la IA.

### Perfil, logros y clasificación global

Los jugadores con cuenta acumulan estadísticas y una **puntuación** que sube al ganar y baja al perder, y consiguen **12 medallas** (Primera victoria, Conquistador, Destructor de mundos, Agente secreto, Pequeño paso, Pacifista...). En el menú se ven el perfil y la **clasificación global**.

### Tutorial

La primera partida muestra una guía de 7 pasos que señala cada parte de la pantalla. Se puede repetir con el botón ❓ junto al mapa.

### App instalable y avisos al móvil

El juego se puede **instalar** en la pantalla de inicio del móvil u ordenador (manifest + service worker) y envía **avisos** (Web Push, botón 🔔) cuando no lo estás mirando: te atacan, pierdes un país, te bombardean, te eliminan, te proponen algo, te escriben, hay votación en la ONU o empieza la partida. En iPhone hay que añadirlo antes a la pantalla de inicio. Las claves de los avisos se generan solas y se guardan (o se pueden poner en `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`).

### Rendimiento

- **Envío por diferencias** (`shared/delta.js`): tras el primer estado, cada jugador solo recibe lo que ha cambiado.
- **Compresión** gzip de los archivos (el mapa pasa de 250 KB a 80 KB) y de los mensajes grandes.
- **Contornos simplificados** del mapa para el zoom alejado y botón ⚡ de **gráficos ligeros** (activo por defecto en dispositivos con poca memoria).
- En pantallas táctiles se usan los contornos simplificados hasta un zoom mayor, y mientras se arrastra el mapa el minimapa solo se actualiza cada 250 ms.

### Expediciones navales

Con al menos un barco en la expedición se puede zarpar desde un país con costa hacia **cualquier país con costa del mapa**, no solo a los vecinos (por ejemplo, de Estados Unidos a Australia), llevando también tropas de tierra y aviones a bordo. Viajan a la velocidad del barco más lento, las rutas por mar cuentan un 40 % más de distancia y el desembarco es un ataque anfibio (salvo con la modificación *Desembarco anfibio*). En el panel de un país propio con costa aparece **Expedición naval** con la lista de destinos; en un país ajeno, **Atacar por mar desde** muestra tus puertos con barcos. En el mapa, las flotas que cruzan medio mundo dan la vuelta por el borde (por el Pacífico).

### Aspecto del mapa

Mapa topográfico al estilo de los juegos de estrategia como Call of War: tierra en tonos de pergamino con curvas de nivel y sombreado de relieve, símbolos de terreno (montañas, árboles, dunas), mar azul claro con aguas poco profundas en las costas, nombres en mayúsculas oscuras y los países de cada jugador teñidos con su color. Los ejércitos avanzan por rutas curvas dejando un rastro, con el icono de su tipo (🪖 infantería, silueta de tanque, ✈️ aviación orientada hacia su destino, 🚢 por mar). Los recursos se muestran con su emoticono: 💰 dinero, 🌾 alimentos, 🛢️ petróleo y 🏭 industria.

### Economía

- Cada país produce dinero, alimentos, petróleo e industria por minuto según un perfil aproximado al real (`shared/economy.js`). La capital de cada jugador tiene una bonificación fija.
- Los recursos se cobran de forma continua, menos el mantenimiento de las tropas.
- Desarrollar un país (niveles 1–5) cuesta dinero e industria, tarda un tiempo en completarse y da +25 % de producción y +5 % de defensa por nivel.
- Los recursos de cada jugador son privados: el servidor solo se los envía a su dueño.

### Tropas y combate (`shared/military.js`)

Doce tipos de unidad en cuatro ramas. El nivel I viene de serie; los niveles II y III se desbloquean en el árbol tecnológico.

| Rama        | Nivel I            | Nivel II                 | Nivel III                     |
|-------------|--------------------|--------------------------|-------------------------------|
| Infantería  | Infantería (1,3/1,8) | Infantería mecanizada (2/2,5) | Fuerzas especiales (4/3, ignoran el terreno) |
| Blindados   | Tanques (4/3)      | Tanques pesados (7/6)    | Carros de combate modernos (10/8) |
| Aviación    | Cazas (5/2)        | Bombarderos (9/1)        | Cazas a reacción (8/5)        |
| Marina      | Destructores (3/3) | Submarinos (6/2)         | Portaaviones (5/8)            |

(ataque/defensa). La infantería consume alimentos y el resto petróleo; los barcos solo se construyen en países con costa y hacen falta para cruzar el mar con tropas de tierra; cazas y portaaviones interceptan bombas.

- Reclutar tarda unos segundos (entrenamiento). Las tropas se mueven solo a países vecinos y tardan según la distancia y la unidad más lenta. Todos los jugadores ven los ejércitos en marcha.
- Al llegar a un país ajeno hay batalla: fuerza de cada bando × terreno × capital (+25 %) × desarrollo × desembarco (−25 %) × suministro × azar (±20 %). Si gana el atacante, conquista el país (que pierde un nivel de desarrollo); si no, sus tropas se pierden. El ganador sufre bajas según lo igualada que estuviera la batalla.
- Sin alimentos o sin petróleo, las unidades que dependen de ellos rinden a la mitad.
- Los países neutrales tienen guarnición propia según su tamaño y economía.
- **Si te conquistan la capital, quedas eliminado** (salvo con la regla «traslada la capital»): según el ajuste de la sala, el resto de tus países pasa al conquistador o se vuelve neutral (con sus tropas como guarnición) y tus ejércitos en marcha se disuelven. También queda eliminado quien se queda sin países ni ejércitos.

### Diplomacia, comercio y tecnología

- Entre jugadores, la relación inicial es de **paz**: para atacar a otro jugador hay que **declararle la guerra** (unilateral, se anuncia a todos). Los países neutrales siempre se pueden atacar.
- **Paz**, **pacto de no agresión** (5 minutos en los que nadie puede declarar la guerra), **alianza** y **comercio** se proponen y el otro jugador acepta o rechaza. Las propuestas caducan en 1 minuto.
- Entre **aliados**, enviar tropas a un país del aliado lo refuerza (las tropas pasan a defenderlo). Romper una alianza es declarar la guerra y se anuncia como traición.
- Si se firma la paz mientras un ejército está en marcha, al llegar da media vuelta.
- **Comercio**: se ofrecen recursos a cambio de otros (o se regalan). El servidor comprueba que ambos los tengan en el momento de aceptar.
- **Mercado** (`shared/market.js`, `server/market.js`):
  - *Bolsa*: compra y venta de alimentos, petróleo e industria a cambio de dinero. El precio sube al comprar y baja al vender (0,3 % por unidad), vuelve poco a poco a su valor normal y se guarda su historial para la gráfica. Comisión del 10 %.
  - *Ofertas entre jugadores*: «doy X a cambio de Y», visibles para todos; lo ofrecido queda reservado hasta que alguien acepta, se retira o caduca (10 min). Máximo 3 por jugador; no se comercia con quien estás en guerra.
- **Mensajes privados**: desde Diplomacia se puede hablar en privado con cada jugador; solo lo ven remitente y destinatario.
- **Tecnología** (`shared/tech.js`), al estilo de War Thunder: **cada rama investiga por su cuenta**, con una investigación en marcha por rama y todas a la vez (infantería, blindados, aviación, marina, bombas y doctrinas).
  - *Árbol*: una columna por rama y rangos I-IV. Cada rama tiene sus tropas (las de rango I vienen de serie) y sus **modificaciones**, que exigen el nodo anterior:

    | Rama | Modificaciones |
    |------|----------------|
    | Infantería | Entrenamiento de élite (+15 % ataque), Reclutamiento rápido (−30 % entrenamiento), Visión nocturna (+20 % defensa) |
    | Blindados | Blindaje reforzado (+15 % defensa), Motores diésel (+25 % velocidad), Munición perforante (+20 % ataque) |
    | Aviación | Radar (+50 % intercepción), Pilotos veteranos (+15 % ataque), Reabastecimiento en vuelo (+30 % velocidad) |
    | Marina | Sonar (+15 % defensa), Desembarco anfibio (sin penalización), Torpedos guiados (+20 % ataque) |
    | Bombas | Bombas de racimo (+10 % destrucción), Escudo antimisiles (+50 % intercepción) |

  - *Doctrinas*: Industrialización (+10 % producción), Doctrina militar (+10 % ataque), Fortificaciones (+10 % defensa) y Logística (+15 % velocidad, −10 % mantenimiento), con tres niveles cada una.

### Construcciones (`shared/buildings.js`)

En cada país propio se pueden construir edificios de nivel 1 a 3. Solo hay una obra a la vez por país y el espacio depende del desarrollo (2 niveles de edificio por nivel de desarrollo):

| Edificio | Efecto por nivel |
|----------|------------------|
| 🏭 Fábrica | +6 industria/min |
| 🛢️ Pozo petrolífero | +5 petróleo/min |
| 🌾 Granja | +6 alimentos/min |
| 🏦 Banco | +8 dinero/min |
| 🎖️ Cuartel | tropas un 20 % más rápidas de entrenar |
| 🛡️ Búnker | +15 % de defensa del país |

Al conquistar un país, sus edificios pierden un nivel; los misiles también los dañan y una bomba nuclear los destruye.

### Antes de empezar: avatar, presidente y país

En la sala, cada jugador elige su **avatar**, su **país inicial** (no puede ser vecino del de otro jugador) y un **presidente** con una ventaja para toda la partida (`shared/leaders.js`):

| Presidente | Ventaja |
|------------|---------|
| La Economista | +15 % de ingresos |
| El General | +12 % de ataque |
| La Defensora | +15 % de defensa |
| La Científica | Investigación un 30 % más rápida |
| El Mercader | Bolsa sin comisión |
| La Industrial | Tropas y desarrollo un 15 % más baratos |

Quien no elija país recibe uno al azar o lo elige en el mapa, según los ajustes.

### Bombas

| Arma | Alcance | Efecto | Recarga |
|------|---------|--------|---------|
| 💣 Bombardeo convencional | 1 país | destruye el 25 % de las tropas | 20 s |
| 🚀 Misil balístico | 3 países | 40 % de las tropas y −1 nivel de desarrollo | 45 s |
| ☢ Bomba nuclear | 5 países | 85 % de las tropas, desarrollo a nivel 1 y 3 min sin producción | 3 min |

Se compran al lanzarlas, solo contra neutrales o jugadores con los que estás en guerra, y se ven volar por el mapa. Los cazas, cazas a reacción y portaaviones del objetivo pueden interceptarlas. Un lanzamiento nuclear se anuncia a todos.

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

En el móvil, el mapa ocupa la pantalla y el panel del país es una hoja que se desliza desde abajo (se abre al tocar un país).

Los efectos se sintetizan en el navegador con Web Audio (`public/js/sound.js`), sin archivos: reclutar, marchar, batallas, conquistas, alarma de ataque entrante, propuestas diplomáticas, inicio y fin de partida. El botón 🔊 los silencia (se recuerda en el navegador).

Cuando un ejército ajeno se dirige a uno de tus países, suena una alarma y aparece un aviso con quién viene, cuántas unidades y cuándo llega.

## Estructura

```
server/
  index.js    Arranque: recupera partidas guardadas, escucha y guarda cada minuto
  storage.js  Guardado de partidas (archivo local o Upstash Redis)
  market.js   Bolsa y ofertas entre jugadores
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
  leaders.js  Avatares y presidentes
  market.js   Precios y reglas del mercado
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
| `auth:register`    | `{ username, password }` | Crea una cuenta y abre sesión (devuelve `session`) |
| `auth:login`       | `{ username, password }` | Inicia sesión |
| `auth:logout`      | `{ session }`          | Cierra la sesión                     |
| `account:me`       | —                      | Cuenta y partidas de la sesión actual |
| `account:games`    | —                      | Lista de «Mis partidas»              |
| `room:enter`       | `{ code }`             | Entra en una de tus partidas         |
| `room:detach`      | —                      | Vuelve al menú sin abandonar la partida |
| `room:resync`      | —                      | Pide de nuevo el estado completo     |
| `session:peek`     | —                      | Invitado: ¿tiene una partida a la que volver? |
| `account:profile`  | —                      | Perfil, logros y puesto              |
| `ranking:global`   | —                      | Clasificación global                 |
| `push:key`         | —                      | Clave pública de los avisos          |
| `push:subscribe`   | `{ subscription }`     | Activa los avisos en este dispositivo |
| `game:build`       | `{ countryId, type }`  | Construye un edificio                |
| `game:spy`         | `{ mission, countryId }` | Misión de espionaje                |
| `game:space`       | —                      | Siguiente etapa de la carrera espacial |
| `un:vote`          | `{ vote }`             | Vota en la ONU (`yes` / `no`)        |
| `map:ping`         | `{ countryId, kind }`  | Marca un país para el equipo (`attack` / `defend` / `look`) |
| `room:create`      | `{ name, avatar? }`    | Crea sala y te hace anfitrión        |
| `room:join`        | `{ name, code, avatar? }` | Entra en una sala por código      |
| `room:profile`     | `{ avatar?, president?, country? }` | Tu avatar, presidente y país en la sala |
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
| `game:research`    | `{ tech }`             | Investiga un nivel de doctrina       |
| `game:researchNode`| `{ node }`             | Investiga un nodo del árbol          |
| `game:strike`      | `{ weapon, countryId }`| Lanza una bomba                      |
| `market:trade`     | `{ good, side, amount }` | Compra (`buy`) o vende (`sell`) en la bolsa |
| `market:offer`     | `{ give, want }`       | Publica una oferta (`{ resource, amount }`) |
| `market:accept`    | `{ offerId }`          | Acepta la oferta de otro jugador     |
| `market:cancel`    | `{ offerId }`          | Retira tu oferta                     |
| `dm:send`          | `{ playerId, text }`   | Mensaje privado                      |
| `diplo:war`        | `{ playerId }`         | Declara la guerra                    |
| `diplo:propose`    | `{ playerId, type, trade? }` | Propone paz, pacto, alianza o comercio |
| `diplo:respond`    | `{ proposalId, accept }` | Acepta o rechaza una propuesta     |
| `diplo:cancel`     | `{ proposalId }`       | Retira una propuesta propia          |
| `chat:send`        | `{ text }`             | Mensaje de chat                      |

| Servidor → cliente | Descripción                                        |
|--------------------|----------------------------------------------------|
| `room:state`       | Estado completo de la sala (con la niebla de guerra de cada jugador) |
| `room:delta`       | Solo lo que ha cambiado desde el último envío       |
| `account:achievements` | Logros conseguidos al acabar una partida        |
| `game:self`        | Datos privados: recursos, tecnología y propuestas (cada segundo) |
| `diplo:answered`   | Respuesta del otro jugador a tu propuesta          |
| `market:filled`    | Alguien ha aceptado tu oferta                      |
| `dm:message`       | Mensaje privado (solo a remitente y destinatario)  |
| `chat:message`     | Mensaje de chat o de sistema                       |
| `room:kicked`      | Has sido expulsado                                 |
| `room:closed`      | La sala se ha borrado por inactividad              |
| `session:replaced` | Tu sesión se ha abierto en otra pestaña            |
