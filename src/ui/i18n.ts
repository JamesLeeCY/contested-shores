// Display strings: Traditional Chinese (the original) and English. The language follows the
// player's choice (settings, stored separately so this module has no dependencies), else the
// browser: Chinese browsers get Chinese, everyone else English. A missing English text falls back
// to the Chinese one.
import en from '../../i18n/en.json';
import zhTW from '../../i18n/zh-TW.json';

export type Lang = 'zh-TW' | 'en';
const LANG_KEY = 'contested.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'zh-TW' || saved === 'en') return saved;
  } catch {
    /* storage unavailable: go by the browser */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'zh-TW';
  return /^zh/i.test(nav) ? 'zh-TW' : 'en';
}

export const lang: Lang = initialLang();
const zh: Record<string, string> = zhTW;
const table: Record<string, string> = lang === 'en' ? en : zh;

/** Stores the choice; the page reloads to rebuild every screen in the new language. */
export function setLang(next: Lang) {
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    /* not persisted */
  }
  location.reload();
}

export const hasKey = (key: string) => key in zh;

/** Looks up a display string; `{name}` placeholders are filled from params. */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const s = table[key] || zh[key] || key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}
