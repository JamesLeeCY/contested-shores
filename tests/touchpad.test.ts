import { describe, expect, it } from 'vitest';
import { TouchpadDetector, touchpadScore } from '../src/ui/touchpad-hint';

const wheel = (deltaY: number, extra: Partial<WheelEvent> = {}) => ({ deltaX: 0, deltaY, deltaMode: 0, ctrlKey: false, shiftKey: false, ...extra });

describe('touchpad detection', () => {
  it('scores pinch, sideways scroll and small deltas; not mouse notches', () => {
    expect(touchpadScore(wheel(-2.37, { ctrlKey: true }))).toBe(4);
    expect(touchpadScore(wheel(3, { deltaX: 5 }))).toBe(3);
    expect(touchpadScore(wheel(6))).toBe(1);
    expect(touchpadScore(wheel(100))).toBe(0);
    expect(touchpadScore(wheel(-120, { ctrlKey: true }))).toBe(0);
    expect(touchpadScore(wheel(3, { deltaMode: 1 }))).toBe(0);
    expect(touchpadScore(wheel(0, { deltaX: 100, shiftKey: true }))).toBe(0);
  });

  it('fires on a two-finger scroll burst, never on mouse-wheel scrolling', () => {
    const tp = new TouchpadDetector();
    let fired = false;
    for (let i = 0; i < 20 && !fired; i++) fired = tp.feed(wheel(4 + (i % 5)), i * 16);
    expect(fired).toBe(true);

    const mouse = new TouchpadDetector();
    for (let i = 0; i < 200; i++) expect(mouse.feed(wheel(i % 2 ? 100 : -100), i * 200)).toBe(false);
  });

  it('isolated small deltas spread over time do not add up', () => {
    const d = new TouchpadDetector();
    for (let i = 0; i < 100; i++) expect(d.feed(wheel(8), i * 2000)).toBe(false);
  });
});
