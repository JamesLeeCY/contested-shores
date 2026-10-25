// Fingerprint of everything that decides how a game plays out (simulation code and game data),
// computed at build time (vite.config.ts). A save made under another fingerprint may replay
// differently: the AI's commands are not stored, it re-decides them under the new rules.
declare const __SIM_BUILD__: string | undefined;

export const SIM_BUILD: string = typeof __SIM_BUILD__ !== 'undefined' ? __SIM_BUILD__ : 'dev';
