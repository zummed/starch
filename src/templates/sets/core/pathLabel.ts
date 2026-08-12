/**
 * Label that rides a path — the text at an arrow's or line's midpoint.
 *
 * Two backing treatments, because neither wins everywhere:
 *
 *   halo  — a close-fitting outline around the glyphs themselves (what
 *           Mapbox calls text-halo). Over empty canvas it reads as no
 *           background at all, and on wrapped text it follows the ragged
 *           line ends instead of boxing them into one slab.
 *   plate — an opaque rounded slab, one per rendered line. Survives crossing
 *           a filled shape of a different colour, where a halo painted in
 *           the canvas colour turns into a smudge.
 *
 * Both size themselves from the measured text. Neither scales the text down
 * to fit: a label that can't fit wraps (maxWidth) or overlaps, so a declared
 * `size` always means the size it renders at.
 */
import type { Node } from '../../../types/node';
import { createNode } from '../../../types/node';
import type { HslColor } from '../../../types/properties';
import type { TextMeasurer } from '../../../text/measure';

export type LabelBacking = 'halo' | 'plate' | 'none';

/** Canvas-coloured backing, matching the dark default theme. */
const BACKING: HslColor = { h: 0, s: 0, l: 8 };
const TEXT_FILL: HslColor = { h: 0, s: 0, l: 80 };

/**
 * Halo geometry. The core is an SVG stroke, centred on the glyph outline and
 * painted behind the fill, so 2 buys 1px of solid backing — enough to stop a
 * line showing through a tight letter pair, narrow enough not to fatten the
 * text. The blur then carries it out to about 3px, fading, which is what
 * keeps it from reading as a lump stuck to the letters.
 */
const HALO_CORE = 2;
const HALO_BLUR = 3;

const PAD_X = 6;
const PAD_Y = 3;

/** svgBackend.drawText's fallback when text.lineHeight is unset — plate
 *  stacking has to agree with it or the slabs drift off their lines. */
const LINE_HEIGHT_RATIO = 1.4;

export interface PathLabelOptions {
  /** Font size in px. */
  size: number;
  /** Backing treatment. */
  backing: LabelBacking;
  /** Wrap width in px; unset means the label stays on one line. */
  maxWidth?: number;
  /** Text colour. */
  fill?: HslColor;
}

/**
 * Build the `<id>` label group: an optional backing plus `<id>.text`,
 * positioned along `follow.path`. The group is the animation handle; the
 * `.text` child exists in every backing mode so ids stay stable when the
 * backing changes.
 */
export function pathLabelNode(
  id: string,
  content: string,
  follow: { path: string; progress?: number },
  opts: PathLabelOptions,
  measure?: TextMeasurer,
): Node {
  // Template props aren't schema-validated on the way in, and every
  // unrecognised backing would otherwise render as 'none' — a typo that
  // silently drops the label's background rather than reporting itself.
  if (opts.backing !== 'halo' && opts.backing !== 'plate' && opts.backing !== 'none') {
    throw new Error(
      `Unknown label backing "${opts.backing}" on "${id}" — expected halo, plate, or none`,
    );
  }

  const size = opts.size;
  const lineHeight = size * LINE_HEIGHT_RATIO;

  const lines = measure
    ? measure.measure(content, {
        size,
        ...(opts.maxWidth !== undefined ? { maxWidth: opts.maxWidth } : {}),
      }).lines
    : content.split('\n').map(text => ({ text, width: text.length * size * 0.6 }));

  // Round up: the render-time measurement pass re-measures at exactly this
  // width, and a fractional shortfall would re-break a line that already fit.
  const contentWidth = Math.ceil(Math.max(...lines.map(l => l.width), 0));

  const children: Node[] = [];

  if (opts.backing === 'plate') {
    // One slab per line, each only as wide as its own text. Slabs are opaque
    // and overlap slightly (plate height > line height) so a wrapped label
    // reads as one ribbon — at partial alpha the overlap would composite
    // twice and band along every line boundary.
    const top = -(lines.length * lineHeight) / 2 + lineHeight / 2;
    lines.forEach((line, i) => {
      children.push(createNode({
        id: lines.length > 1 ? `${id}.bg.${i}` : `${id}.bg`,
        rect: {
          w: Math.ceil(line.width) + PAD_X * 2,
          h: Math.ceil(size) + PAD_Y * 2,
          radius: 3,
        },
        fill: BACKING,
        ...(lines.length > 1 ? { transform: { y: top + i * lineHeight } } : {}),
      }));
    });
  }

  children.push(createNode({
    id: `${id}.text`,
    text: { content, size, align: 'middle' },
    fill: opts.fill ?? TEXT_FILL,
    ...(opts.backing === 'halo'
      ? { _halo: { color: BACKING, width: HALO_CORE, blur: HALO_BLUR } }
      : {}),
  }));

  return createNode({
    id,
    transform: { pathFollow: follow.path, pathProgress: follow.progress ?? 0.5 },
    _textMaxWidth: contentWidth,
    children,
  });
}
