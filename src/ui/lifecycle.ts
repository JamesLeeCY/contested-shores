// Global listeners registered by a session are tied to its AbortSignal, so ending a chapter
// removes them all.
export const life: { signal?: AbortSignal } = {};

export function on<K extends keyof WindowEventMap>(target: Window, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions): void;
export function on<K extends keyof DocumentEventMap>(target: Document, type: K, fn: (e: DocumentEventMap[K]) => void, opts?: AddEventListenerOptions): void;
export function on(target: EventTarget, type: string, fn: (e: never) => void, opts: AddEventListenerOptions = {}) {
  target.addEventListener(type, fn as EventListener, { ...opts, signal: life.signal });
}
