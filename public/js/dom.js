// Utilidades mínimas de DOM. Todo el texto se inserta como texto (nunca HTML).

export const $ = (sel, root = document) => root.querySelector(sel);

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else {
      el.setAttribute(key, value === true ? '' : value);
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

export function toast(message, kind = 'info', durationMs = 3200) {
  const el = h('div', { class: `toast toast-${kind}` }, message);
  $('#toasts').append(el);
  setTimeout(() => el.classList.add('leaving'), durationMs);
  setTimeout(() => el.remove(), durationMs + 400);
}

// navigator.clipboard solo existe en contextos seguros (https / localhost).
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

/**
 * Zona con botones que se redibuja a menudo (llega estado nuevo cada segundo).
 * - Mientras el dedo o el ratón está pulsado dentro, isPressed() es true para no redibujar.
 * - Se libera también si el navegador cancela el toque (p. ej. al desplazar), para no quedarse bloqueada.
 * - En pantallas táctiles, el botón se activa al levantar el dedo, aunque el navegador
 *   no llegue a generar el «click» porque el botón se ha redibujado.
 */
export function guardTaps(el, onRelease) {
  let pressed = false;
  let down = null;
  let lastSynthetic = 0;
  let safety = null;

  const release = () => {
    if (!pressed) return;
    pressed = false;
    down = null;
    clearTimeout(safety);
    setTimeout(onRelease, 0);
  };

  el.addEventListener('pointerdown', (e) => {
    pressed = true;
    down = { button: e.target.closest('button'), x: e.clientX, y: e.clientY, type: e.pointerType };
    clearTimeout(safety);
    safety = setTimeout(release, 3000); // nunca bloquear más de 3 s
  });
  el.addEventListener('pointerup', (e) => {
    if (down?.type !== 'mouse' && down?.button && !down.button.disabled
        && e.target.closest('button') === down.button
        && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 12) {
      lastSynthetic = Date.now();
      down.button.click();
    }
  });
  // Evita el doble disparo cuando el navegador sí genera su propio click tras el toque.
  el.addEventListener('click', (e) => {
    if (e.isTrusted && Date.now() - lastSynthetic < 700) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('touchcancel', release);
  return { isPressed: () => pressed };
}
