# Dominio Global

Juego web multijugador de estrategia (Node.js + Socket.IO, cliente sin compilación). Ver README.md.

## Flujo de trabajo

- El dueño del repositorio quiere que los cambios lleguen directamente a `main`: el juego publicado
  (Render) se actualiza solo con cada push a `main`. Al terminar un cambio: `npm test` en verde y
  `git push origin HEAD:main` (además de a la rama de trabajo, si la sesión usa una). Si `main` ha
  avanzado, integrar sus cambios primero; nunca forzar el push.
- Todo el texto del juego y los comentarios del código van en español.
- Mapas: `npm run build:map` regenera `shared/world.json` y `shared/maps/*.json` (mapas históricos).
