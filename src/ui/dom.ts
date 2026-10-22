export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  parent?: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

/** Sets textContent only when it changed (avoids layout churn every frame). */
export function setText(e: HTMLElement, text: string) {
  if (e.textContent !== text) e.textContent = text;
}
