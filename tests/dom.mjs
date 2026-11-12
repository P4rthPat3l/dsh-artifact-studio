import { JSDOM } from 'jsdom';

/**
 * Install a jsdom window as the global browser environment.
 * @returns {JSDOM} the DOM.
 */
export function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="host"></div><div id="second"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/',
  });
  const window = dom.window;
  global.window = window;
  global.document = window.document;
  Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
  global.getComputedStyle = window.getComputedStyle.bind(window);
  global.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  global.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  global.DOMRect = window.DOMRect;
  global.Range = window.Range;
  global.Node = window.Node;
  global.Element = window.Element;
  global.HTMLElement = window.HTMLElement;
  global.Text = window.Text;
  global.Event = window.Event;
  global.KeyboardEvent = window.KeyboardEvent;
  global.MouseEvent = window.MouseEvent;
  global.MutationObserver = window.MutationObserver;
  global.Window = window.Window;
  global.Document = window.Document;
  global.ShadowRoot = window.ShadowRoot;
  global.HTMLIFrameElement = window.HTMLIFrameElement;
  global.HTMLInputElement = window.HTMLInputElement;
  global.HTMLTextAreaElement = window.HTMLTextAreaElement;
  global.PointerEvent = window.PointerEvent ?? window.MouseEvent;
  global.DOMParser = window.DOMParser;
  global.ClipboardEvent = window.ClipboardEvent;
  global.DragEvent = window.DragEvent;
  global.getSelection = window.getSelection.bind(window);
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  return dom;
}

/**

/**
 * Wait for effects and promises to settle.
 * @param {number} [ms] - the delay.
 * @returns {Promise<void>} resolution.
 */
export function settle(ms = 40) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
