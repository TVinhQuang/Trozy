// Navigation scroll behavior in a deterministic DOM, with no browser or business data.
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer as createVite } from 'vite';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://127.0.0.1:5173/', pretendToBeVisual: true });
const previous = new Map();
function install(name, value) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MutationObserver']) install(name, name === 'window' ? dom.window : dom.window[name]);
install('IS_REACT_ACT_ENVIRONMENT', true);
let y = 0, nextFrame = 0;
const frames = new Map(), scrollListeners = new Set();
let lastScrollOptions;
Object.defineProperty(dom.window, 'scrollY', { configurable: true, get: () => y });
dom.window.requestAnimationFrame = callback => { const id = ++nextFrame; frames.set(id, callback); return id; };
dom.window.cancelAnimationFrame = id => frames.delete(id);
const add = dom.window.addEventListener.bind(dom.window), remove = dom.window.removeEventListener.bind(dom.window);
dom.window.addEventListener = (type, listener, options) => { if (type === 'scroll') { scrollListeners.add(listener); lastScrollOptions = options; } add(type, listener, options); };
dom.window.removeEventListener = (type, listener, options) => { if (type === 'scroll') scrollListeners.delete(listener); remove(type, listener, options); };

const vite = await createVite({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const { renderHook, act, cleanup } = await import('@testing-library/react');
const { useScrollNavigation } = await vite.ssrLoadModule('/src/frontend/use-scroll-navigation.ts');
function event(nextY) { y = nextY; dom.window.dispatchEvent(new dom.window.Event('scroll')); }
function flush() { const batch = [...frames]; frames.clear(); for (const [, callback] of batch) callback(0); }
function scroll(nextY) { act(() => { event(nextY); flush(); }); }
let checks = 0;
function pass(label) { checks++; console.log(`PASS ${label}`); }

try {
  let props = { locked: false, resetKey: 'dashboard:' };
  const hook = renderHook(options => useScrollNavigation(options), { initialProps: props });
  const hidden = () => hook.result.current.hidden;
  assert.equal(hidden(), false);
  assert.deepEqual(lastScrollOptions, { passive: true });
  scroll(90); scroll(139); assert.equal(hidden(), false);
  scroll(150); scroll(160); assert.equal(hidden(), false);
  scroll(164); assert.equal(hidden(), true);
  pass('Header remains visible near the top and hides after sustained downward travel below 140px');

  scroll(160); scroll(163); scroll(159); assert.equal(hidden(), true);
  scroll(153); assert.equal(hidden(), true);
  scroll(151); assert.equal(hidden(), false);
  scroll(160); assert.equal(hidden(), false);
  scroll(170); assert.equal(hidden(), false);
  scroll(175); assert.equal(hidden(), true);
  scroll(-35); assert.equal(hidden(), false);
  pass('Direction reversal thresholds ignore scroll jitter and negative overscroll reveals navigation');

  scroll(200); assert.equal(hidden(), true);
  act(() => hook.result.current.reveal()); assert.equal(hidden(), false);
  scroll(210); assert.equal(hidden(), false);
  scroll(225); assert.equal(hidden(), true);
  props = { ...props, locked: true }; hook.rerender(props);
  assert.equal(hidden(), false);
  scroll(400); assert.equal(hidden(), false);
  props = { ...props, locked: false }; hook.rerender(props);
  scroll(410); assert.equal(hidden(), false);
  scroll(425); assert.equal(hidden(), true);
  props = { ...props, resetKey: 'rooms:property-one' }; hook.rerender(props);
  assert.equal(hidden(), false);
  scroll(435); assert.equal(hidden(), false);
  pass('Manual reveal, interaction locks and route/property changes reset scroll intent and show the header');

  act(() => { event(450); event(460); event(480); });
  assert.equal(frames.size, 1); assert.equal(hidden(), false);
  act(flush); assert.equal(hidden(), true);
  act(() => event(510)); assert.equal(frames.size, 1);
  hook.unmount();
  assert.equal(frames.size, 0); assert.equal(scrollListeners.size, 0);
  pass('Scroll work batches into one animation frame, and unmount cancels pending work and listeners');
  console.log(`PASS: ${checks} scroll-navigation interaction groups. CSS motion and browser layout are verified separately.`);
} finally {
  cleanup(); await vite.close(); dom.window.close();
  for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
}
