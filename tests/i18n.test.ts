import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const zh = JSON.parse(readFileSync('i18n/zh-TW.json', 'utf8')) as Record<string, string>;
const en = JSON.parse(readFileSync('i18n/en.json', 'utf8')) as Record<string, string>;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('i18n (spec §11 stage 8: no hard-coded interface strings)', () => {
  it('UI and render code contain no Chinese string literals', () => {
    const offenders: string[] = [];
    for (const f of [...files('src/ui'), ...files('src/render')]) {
      const code = stripComments(readFileSync(f, 'utf8'));
      for (const m of code.matchAll(/(['"`])((?:(?!\1).)*[一-鿿](?:(?!\1).)*)\1/g)) offenders.push(`${f}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('every literal t("key") in the source exists in zh-TW.json', () => {
    const missing: string[] = [];
    for (const f of files('src')) {
      const code = readFileSync(f, 'utf8');
      // Complete literal keys only (`t('err.' + code)` builds keys at runtime).
      for (const m of code.matchAll(/\bt\('([a-z0-9_.]*[a-z0-9_])'[,)]/g)) if (!(m[1] in zh)) missing.push(`${f}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });

  it('en.json has every key, each translated, with the same placeholders', () => {
    expect(Object.keys(zh).filter((k) => !(k in en))).toEqual([]);
    expect(Object.keys(zh).filter((k) => !en[k])).toEqual([]);
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
    expect(Object.keys(zh).filter((k) => ph(zh[k]) !== ph(en[k]))).toEqual([]);
  });

  it('English never uses derogatory terms (a cited title is quoted as published)', () => {
    const banned = /savage|barbarian|bandit|rebel|red-hair|primitive/i;
    expect(Object.entries(en).filter(([k, v]) => banned.test(v) && !k.startsWith('src.')).map(([k]) => k)).toEqual([]);
  });
});

describe('content principles (spec §2.4)', () => {
  it('never uses derogatory exonyms for Indigenous peoples or either side', () => {
    // 番／生番／野人 are banned outright (quotations from sources would need an annotation);
    // 賊／匪／紅毛／夷 would cast one side as villains.
    const banned = ['番', '野人', '蠻', '賊', '匪', '紅毛', '夷'];
    const hits = Object.entries(zh).flatMap(([k, v]) => banned.filter((b) => v.includes(b)).map((b) => `${k}: ${b}`));
    expect(hits).toEqual([]);
  });
});
