/** The smallest and largest scale the dock offers, matching the Harness ZoomControls. */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

/** A wheel notch reports about this many pixels, or three lines. */
const NOTCH_PIXELS = 100;

/** Below this many pixels an event is a trackpad pinch, which reports many small deltas. */
const MIN_NOTCH_PIXELS = 50;

/** The scale one notch applies. The engine's own step is four times, too coarse for a small adjustment. */
const NOTCH_STEP = Math.log(1.15);

/** The scale per pixel of a pinched report, the rate the engine's own pinch handler uses. */
const PINCH_STEP_PER_PIXEL = 0.01386;

/** The most one event may change the scale, so one fast spin cannot jump the view. */
const MAX_NOTCH_STEP = Math.log(2);
const MAX_PINCH_STEP = Math.log(1.2);

/** What a delta in lines or pages is worth in pixels. */
const LINE_PIXELS = 40;
const PAGE_PIXELS = 800;

/**
 * Clamp a scale to the range the dock offers.
 * @param zoom the scale.
 * @returns the scale inside the range.
 */
export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * The scale one wheel event applies. A mouse wheel reports whole notches, so each
 * one zooms a fixed step; a trackpad pinch reports many small deltas and zooms in
 * proportion.
 * @param deltaY the event's vertical delta.
 * @param deltaMode the event's delta unit.
 * @returns the factor to multiply the current scale by.
 */
function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const pixels = deltaMode === 1 ? deltaY * LINE_PIXELS : deltaMode === 2 ? deltaY * PAGE_PIXELS : deltaY;
  const exponent =
    Math.abs(pixels) >= MIN_NOTCH_PIXELS
      ? -(pixels / NOTCH_PIXELS) * NOTCH_STEP
      : -pixels * PINCH_STEP_PER_PIXEL;
  const limit = Math.abs(pixels) >= MIN_NOTCH_PIXELS ? MAX_NOTCH_STEP : MAX_PINCH_STEP;
  return Math.exp(Math.min(limit, Math.max(-limit, exponent)));
}

/**
 * The next scale for a wheel event, kept inside the dock's range without pulling
 * a scale back that opening already put outside it.
 * @param zoom the current scale.
 * @param deltaY the event's vertical delta.
 * @param deltaMode the event's delta unit.
 * @returns the scale to apply.
 */
export function wheelZoom(zoom: number, deltaY: number, deltaMode: number): number {
  const next = zoom * wheelZoomFactor(deltaY, deltaMode);
  return Math.min(Math.max(next, Math.min(zoom, MIN_ZOOM)), Math.max(zoom, MAX_ZOOM));
}
