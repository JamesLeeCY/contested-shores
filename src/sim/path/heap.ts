/** Binary min-heap of tile indices keyed by a float priority. Ties break on index for determinism. */
export class MinHeap {
  private items: number[] = [];
  private keys: number[] = [];

  get size() {
    return this.items.length;
  }

  clear() {
    this.items.length = 0;
    this.keys.length = 0;
  }

  push(item: number, key: number) {
    const { items, keys } = this;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] < key || (keys[p] === key && items[p] <= item)) break;
      items[i] = items[p];
      keys[i] = keys[p];
      i = p;
    }
    items[i] = item;
    keys[i] = key;
  }

  pop(): number {
    const { items, keys } = this;
    const top = items[0];
    const lastItem = items.pop()!;
    const lastKey = keys.pop()!;
    const n = items.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        let mk = lastKey;
        let mi = lastItem;
        if (l < n && (keys[l] < mk || (keys[l] === mk && items[l] < mi))) {
          m = l;
          mk = keys[l];
          mi = items[l];
        }
        if (r < n && (keys[r] < mk || (keys[r] === mk && items[r] < mi))) m = r;
        if (m === i) break;
        items[i] = items[m];
        keys[i] = keys[m];
        i = m;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}
