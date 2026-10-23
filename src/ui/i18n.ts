import zhTW from '../../i18n/zh-TW.json';

const table: Record<string, string> = zhTW;

export const hasKey = (key: string) => key in table;

/** Looks up a display string; `{name}` placeholders are filled from params. */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const s = table[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}
