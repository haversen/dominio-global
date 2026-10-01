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
