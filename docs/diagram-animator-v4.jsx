import { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ═══════════════════════════════════════════
   DSL PARSER
   ═══════════════════════════════════════════ */

function parseDSL(src) {
  const objects = {};
  const animConfig = { duration: 5, loop: true, keyframes: [] };
  const lines = src.split("\n");
  let i = 0;

  const skipWhitespace = () => {
    while (i < lines.length && (!lines[i].trim() || lines[i].trim().startsWith("#"))) i++;
  };

  const parseValue = (val) => {
    val = val.trim();
    if (val === "true") return true;
    if (val === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(val)) return parseFloat(val);
    if (val.startsWith('"') && val.endsWith('"')) return val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) return val.slice(1, -1);
    return val;
  };

  while (i < lines.length) {
    skipWhitespace();
    if (i >= lines.length) break;
    const line = lines[i].trim();

    // @animate block
    if (line.startsWith("@animate")) {
      const durMatch = line.match(/duration:\s*(\d+(?:\.\d+)?)s/);
      const loopMatch = line.match(/loop:\s*(true|false)/);
      if (durMatch) animConfig.duration = parseFloat(durMatch[1]);
      if (loopMatch) animConfig.loop = loopMatch[1] === "true";
      if (line.includes("{")) {
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("}")) {
          const kfLine = lines[i].trim();
          if (kfLine && !kfLine.startsWith("#")) {
            // Parse: 0.5s: obj.prop = value  OR  0.5s: obj.prop = value ease:easeOut, obj2.prop2 = value2
            const timeMatch = kfLine.match(/^(\d+(?:\.\d+)?)s:\s*(.+)/);
            if (timeMatch) {
              const t = parseFloat(timeMatch[1]);
              const assignments = timeMatch[2].split(",");
              for (const assign of assignments) {
                const am = assign.trim().match(/(\w+)\.(\w+)\s*=\s*(.+)/);
                if (am) {
                  let rawVal = am[3].trim();
                  let easing = "linear";
                  const easeMatch = rawVal.match(/\s+ease:(\w+)\s*$/);
                  if (easeMatch) {
                    easing = easeMatch[1];
                    rawVal = rawVal.slice(0, easeMatch.index).trim();
                  }
                  animConfig.keyframes.push({
                    time: t,
                    target: am[1],
                    prop: am[2],
                    value: parseValue(rawVal),
                    easing,
                  });
                }
              }
            }
          }
          i++;
        }
      }
      i++;
      continue;
    }

    // Object block: type id { ... }  (inline or multi-line)
    const blockMatch = line.match(/^(\w+)\s+(\w+)\s*\{/);
    if (blockMatch) {
      const type = blockMatch[1];
      const id = blockMatch[2];
      const obj = { type, id, props: {} };

      // Collect the body: either inline { ... } or multi-line
      let body;
      const afterBrace = line.slice(line.indexOf("{") + 1);
      if (afterBrace.includes("}")) {
        // Inline: everything between { and } on the same line
        body = afterBrace.slice(0, afterBrace.indexOf("}")).trim();
        i++;
      } else {
        // Multi-line: gather until }
        const bodyLines = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("}")) {
          bodyLines.push(lines[i].trim());
          i++;
        }
        body = bodyLines.join("\n");
        i++; // skip the }
      }

      // Parse properties from body
      const propEntries = [];
      if (body.includes("\n")) {
        // Multi-line: each line is a prop
        for (const pl of body.split("\n")) {
          const trimmed = pl.trim();
          if (trimmed && !trimmed.startsWith("#")) {
            propEntries.push(trimmed);
          }
        }
      } else {
        // Inline: find key: positions. Value for key[k] runs from after its colon
        // to the start of key[k+1]'s word (or end of string).
        const keyPattern = /(\w+)\s*:/g;
        const keys = [];
        let m;
        while ((m = keyPattern.exec(body)) !== null) {
          keys.push({
            key: m[1],
            matchStart: m.index,
            valueStart: m.index + m[0].length,
          });
        }
        for (let k = 0; k < keys.length; k++) {
          const valueEnd = k + 1 < keys.length ? keys[k + 1].matchStart : body.length;
          const rawVal = body.slice(keys[k].valueStart, valueEnd).trim();
          propEntries.push(`${keys[k].key}: ${rawVal}`);
        }
      }

      for (const propLine of propEntries) {
        const colonIdx = propLine.indexOf(":");
        if (colonIdx > 0) {
          const key = propLine.slice(0, colonIdx).trim();
          const rawVal = propLine.slice(colonIdx + 1).trim();
          if (key === "pos") {
            const parts = rawVal.split(/\s+/).map(Number);
            obj.props.x = parts[0];
            obj.props.y = parts[1];
          } else if (key === "size") {
            const parts = rawVal.split(/\s+/).map(Number);
            obj.props.w = parts[0];
            obj.props.h = parts[1];
          } else if (key === "cols") {
            obj.props.cols = rawVal.split("|").map((s) => s.trim());
          } else if (key === "row") {
            if (!obj.props.rows) obj.props.rows = [];
            obj.props.rows.push(rawVal.split("|").map((s) => s.trim()));
          } else {
            obj.props[key] = parseValue(rawVal);
          }
        }
      }

      objects[id] = obj;
      continue;
    }
    i++;
  }

  return { objects, animConfig };
}

/* ═══════════════════════════════════════════
   EASING FUNCTIONS
   ═══════════════════════════════════════════ */

const EASINGS = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => { const u = t - 1; return u * u * u + 1; },
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => { const u = t - 1; return 1 - u * u * u * u; },
  easeInOutQuart: (t) => { const u = t - 1; return t < 0.5 ? 8 * t * t * t * t : 1 - 8 * u * u * u * u; },
  easeOutBack: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  easeInBack: (t) => { const c = 1.70158; return (c + 1) * t * t * t - c * t * t; },
  bounce: (t) => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) { const u = t - 1.5 / 2.75; return 7.5625 * u * u + 0.75; }
    if (t < 2.5 / 2.75) { const u = t - 2.25 / 2.75; return 7.5625 * u * u + 0.9375; }
    const u = t - 2.625 / 2.75; return 7.5625 * u * u + 0.984375;
  },
  elastic: (t) => t === 0 || t === 1 ? t : -Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI),
  spring: (t) => 1 - Math.cos(t * 4.5 * Math.PI) * Math.exp(-t * 6),
  snap: (t) => {
    const s = t * t * (3 - 2 * t);
    return s * s * (3 - 2 * s);
  },
  step: (t) => t < 1 ? 0 : 1,
};

function applyEasing(t, easingName) {
  if (!easingName || easingName === "linear") return t;
  const fn = EASINGS[easingName];
  return fn ? fn(t) : t;
}

/* ═══════════════════════════════════════════
   ANIMATION ENGINE
   ═══════════════════════════════════════════ */

function buildTimeline(animConfig) {
  // Group keyframes by target+prop, sorted by time
  const tracks = {};
  for (const kf of animConfig.keyframes) {
    const key = `${kf.target}.${kf.prop}`;
    if (!tracks[key]) tracks[key] = [];
    tracks[key].push({ time: kf.time, value: kf.value, easing: kf.easing || "linear" });
  }
  for (const key of Object.keys(tracks)) {
    tracks[key].sort((a, b) => a.time - b.time);
  }
  return tracks;
}

function lerpColor(a, b, t) {
  const pa = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
  const ma = pa.exec(a);
  const mb = pa.exec(b);
  if (!ma || !mb) return t < 0.5 ? a : b;
  const r = Math.round(parseInt(ma[1], 16) * (1 - t) + parseInt(mb[1], 16) * t);
  const g = Math.round(parseInt(ma[2], 16) * (1 - t) + parseInt(mb[2], 16) * t);
  const bl = Math.round(parseInt(ma[3], 16) * (1 - t) + parseInt(mb[3], 16) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

function interpolate(keyframes, time) {
  if (keyframes.length === 0) return undefined;
  if (time <= keyframes[0].time) return keyframes[0].value;
  if (time >= keyframes[keyframes.length - 1].time)
    return keyframes[keyframes.length - 1].value;
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
      const rawT =
        (time - keyframes[i].time) /
        (keyframes[i + 1].time - keyframes[i].time);
      // Easing on the destination keyframe controls how we arrive there
      const t = applyEasing(rawT, keyframes[i + 1].easing);
      const a = keyframes[i].value;
      const b = keyframes[i + 1].value;
      if (typeof a === "number" && typeof b === "number") {
        return a + (b - a) * t;
      }
      if (typeof a === "string" && a.startsWith("#")) {
        return lerpColor(a, b, t);
      }
      return t < 0.5 ? a : b;
    }
  }
  return keyframes[keyframes.length - 1].value;
}

function evaluateAnimatedProps(objects, tracks, time) {
  const result = {};
  for (const [id, obj] of Object.entries(objects)) {
    result[id] = { ...obj.props };
  }
  for (const [key, keyframes] of Object.entries(tracks)) {
    const [target, prop] = key.split(".");
    if (result[target]) {
      const val = interpolate(keyframes, time);
      if (val !== undefined) result[target][prop] = val;
    }
  }
  return result;
}

/* ═══════════════════════════════════════════
   ANCHOR SYSTEM
   ═══════════════════════════════════════════ */

// Returns the local-space anchor point (relative to object center)
// anchor: center | top | bottom | left | right | topleft | topright | bottomleft | bottomright
function anchorLocal(anchor = "center", hw = 0, hh = 0) {
  let ax = 0, ay = 0;
  if (anchor.includes("top"))    ay = -hh;
  if (anchor.includes("bottom")) ay =  hh;
  if (anchor.includes("left"))   ax = -hw;
  if (anchor.includes("right"))  ax =  hw;
  return { ax, ay };
}

// Scales around anchor: translate to anchor, scale, translate back.
// Returns the SVG transforms as two nested group transforms:
//   outer: translate(x, y)         — positions the anchor point in world space
//   inner: translate(ax*(1-s), ay*(1-s)) scale(s) — scales around anchor
function scaleAroundAnchor(x, y, scale, anchor, hw, hh) {
  const { ax, ay } = anchorLocal(anchor, hw, hh);
  return {
    outerTranslate: `translate(${x}, ${y})`,
    innerTransform: `translate(${ax * (1 - scale)}, ${ay * (1 - scale)}) scale(${scale})`,
  };
}

// For bounds calculation: where does the visual center end up
// after scaling around an anchor?
function scaledCenter(x, y, scale, anchor, hw, hh) {
  const { ax, ay } = anchorLocal(anchor, hw, hh);
  // The anchor stays fixed at (x + ax, y + ay) in world space.
  // The center (local 0,0) ends up at:
  //   anchorWorld + (center - anchor) * scale
  //   = (x + ax) + (0 - ax) * scale
  //   = x + ax * (1 - scale)
  return {
    cx: x + ax * (1 - scale),
    cy: y + ay * (1 - scale),
  };
}

/* ═══════════════════════════════════════════
   SVG RENDERERS
   ═══════════════════════════════════════════ */

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

function RenderBox({ props }) {
  const {
    x = 0, y = 0, w = 140, h = 50,
    fill = "#1a1d24", stroke = "#22d3ee", strokeWidth = 1.5,
    radius = 8, text, textColor = "#e2e5ea", textSize = 13,
    opacity = 1, scale = 1, bold = false, anchor = "center",
  } = props;

  const { outerTranslate, innerTransform } = scaleAroundAnchor(x, y, scale, anchor, w / 2, h / 2);

  return (
    <g transform={outerTranslate} opacity={opacity}>
      <g transform={innerTransform}>
        <rect
          x={-w / 2} y={-h / 2}
          width={w} height={h}
          rx={radius} fill={fill}
          stroke={stroke} strokeWidth={strokeWidth}
        />
        {text && (
          <text
            x={0} y={1}
            textAnchor="middle" dominantBaseline="middle"
            fill={textColor} fontSize={textSize}
            fontFamily={FONT}
            fontWeight={bold ? 700 : 400}
          >
            {text}
          </text>
        )}
      </g>
    </g>
  );
}

function RenderCircle({ props }) {
  const {
    x = 0, y = 0, r = 20,
    fill = "#1a1d24", stroke = "#22d3ee", strokeWidth = 1.5,
    text, textColor = "#e2e5ea", textSize = 12,
    opacity = 1, scale = 1, anchor = "center",
  } = props;

  const { outerTranslate, innerTransform } = scaleAroundAnchor(x, y, scale, anchor, r, r);

  return (
    <g transform={outerTranslate} opacity={opacity}>
      <g transform={innerTransform}>
        <circle cx={0} cy={0} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        {text && (
          <text x={0} y={1} textAnchor="middle" dominantBaseline="middle"
            fill={textColor} fontSize={textSize} fontFamily={FONT}>
            {text}
          </text>
        )}
      </g>
    </g>
  );
}

function RenderText({ props }) {
  const {
    x = 0, y = 0, text = "", color = "#e2e5ea",
    size = 14, bold = false, opacity = 1, align = "middle",
  } = props;

  return (
    <text
      x={x} y={y}
      textAnchor={align} dominantBaseline="middle"
      fill={color} fontSize={size}
      fontFamily={FONT} fontWeight={bold ? 700 : 400}
      opacity={opacity}
    >
      {text}
    </text>
  );
}

function RenderTable({ props }) {
  const {
    x = 0, y = 0, cols = [], rows = [],
    fill = "#1a1d24", stroke = "#2a2d35", headerFill = "#14161c",
    textColor = "#c9cdd4", headerColor = "#e2e5ea", textSize = 12,
    colWidth = 100, rowHeight = 30, opacity = 1, scale = 1,
    strokeWidth = 1, anchor = "center",
  } = props;

  const totalW = cols.length * colWidth;
  const totalH = (rows.length + 1) * rowHeight;
  const { outerTranslate, innerTransform } = scaleAroundAnchor(x, y, scale, anchor, totalW / 2, totalH / 2);

  return (
    <g transform={outerTranslate} opacity={opacity}>
      <g transform={innerTransform}>
        {/* Header */}
        <rect x={-totalW / 2} y={-totalH / 2} width={totalW} height={rowHeight}
          rx={6} fill={headerFill} stroke={stroke} strokeWidth={strokeWidth} />
        {cols.map((col, ci) => (
          <text key={ci} x={-totalW / 2 + ci * colWidth + colWidth / 2} y={-totalH / 2 + rowHeight / 2 + 1}
            textAnchor="middle" dominantBaseline="middle"
            fill={headerColor} fontSize={textSize} fontWeight={700} fontFamily={FONT}>
            {col}
          </text>
        ))}
        {/* Rows */}
        {rows.map((row, ri) => (
          <g key={ri}>
            <rect x={-totalW / 2} y={-totalH / 2 + (ri + 1) * rowHeight} width={totalW} height={rowHeight}
              fill={fill} stroke={stroke} strokeWidth={strokeWidth}
              rx={ri === rows.length - 1 ? 6 : 0} />
            {row.map((cell, ci) => (
              <text key={ci}
                x={-totalW / 2 + ci * colWidth + colWidth / 2}
                y={-totalH / 2 + (ri + 1) * rowHeight + rowHeight / 2 + 1}
                textAnchor="middle" dominantBaseline="middle"
                fill={textColor} fontSize={textSize} fontFamily={FONT}>
                {cell}
              </text>
            ))}
          </g>
        ))}
        {/* Outer border */}
        <rect x={-totalW / 2} y={-totalH / 2} width={totalW} height={totalH}
          rx={6} fill="none" stroke={stroke} strokeWidth={strokeWidth + 0.5} />
      </g>
    </g>
  );
}

function getObjectCenter(obj, allProps) {
  const p = allProps[obj];
  if (!p) return { x: 0, y: 0 };
  return { x: p.x || 0, y: p.y || 0 };
}

function getObjectBounds(id, objects, allProps) {
  const obj = objects[id];
  const p = allProps[id];
  if (!obj || !p) return { x: 0, y: 0, hw: 0, hh: 0, type: "box" };
  const type = obj.type;
  const scale = p.scale || 1;
  const anchor = p.anchor || "center";

  if (type === "circle") {
    const r = p.r || 20;
    const { cx, cy } = scaledCenter(p.x || 0, p.y || 0, scale, anchor, r, r);
    return { x: cx, y: cy, hw: r * scale + 4, hh: r * scale + 4, type: "circle" };
  }
  if (type === "table") {
    const cols = p.cols || [];
    const rows = p.rows || [];
    const cw = p.colWidth || 100;
    const rh = p.rowHeight || 30;
    const hw = (cols.length * cw) / 2;
    const hh = ((rows.length + 1) * rh) / 2;
    const { cx, cy } = scaledCenter(p.x || 0, p.y || 0, scale, anchor, hw, hh);
    return { x: cx, y: cy, hw: hw * scale + 4, hh: hh * scale + 4, type: "box" };
  }
  const hw = (p.w || 140) / 2;
  const hh = (p.h || 50) / 2;
  const { cx, cy } = scaledCenter(p.x || 0, p.y || 0, scale, anchor, hw, hh);
  return { x: cx, y: cy, hw: hw * scale + 4, hh: hh * scale + 4, type: "box" };
}

function edgePoint(bounds, angle) {
  const { hw, hh, type } = bounds;
  if (type === "circle") {
    return { x: bounds.x + Math.cos(angle) * hw, y: bounds.y + Math.sin(angle) * hh };
  }
  // Rectangle edge intersection
  const tanA = Math.tan(angle);
  const candidates = [];
  // Right edge
  let y = tanA * hw;
  if (Math.abs(y) <= hh) candidates.push({ x: bounds.x + hw, y: bounds.y + y, d: Math.abs(Math.cos(angle)) > 0 ? hw / Math.abs(Math.cos(angle)) : Infinity });
  // Left edge
  y = -tanA * hw;
  if (Math.abs(y) <= hh) candidates.push({ x: bounds.x - hw, y: bounds.y - y, d: Math.abs(Math.cos(angle)) > 0 ? hw / Math.abs(Math.cos(angle)) : Infinity });
  // Top/Bottom
  const x1 = hh / (tanA || 0.001);
  if (Math.abs(x1) <= hw) candidates.push({ x: bounds.x + x1, y: bounds.y + hh, d: hh / Math.abs(Math.sin(angle) || 0.001) });
  const x2 = -hh / (tanA || 0.001);
  if (Math.abs(x2) <= hw) candidates.push({ x: bounds.x + x2, y: bounds.y - hh, d: hh / Math.abs(Math.sin(angle) || 0.001) });

  // Pick the point closest along the angle direction
  if (candidates.length === 0) return { x: bounds.x + Math.cos(angle) * hw, y: bounds.y + Math.sin(angle) * hh };
  // Pick point that's in the right direction
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const valid = candidates.filter(c => {
    const dx = c.x - bounds.x;
    const dy = c.y - bounds.y;
    return dx * cos + dy * sin > -0.01;
  });
  if (valid.length === 0) return candidates[0];
  valid.sort((a, b) => a.d - b.d);
  return valid[0];
}

function RenderLine({ id, props, objects, allProps }) {
  const {
    from, to,
    x1: explicitX1, y1: explicitY1, x2: explicitX2, y2: explicitY2,
    stroke = "#4a4f59", strokeWidth = 1.5, dashed = false,
    label, labelColor = "#8a8f98", labelSize = 11,
    opacity = 1, progress = 1, arrow = true,
  } = props;

  let sx, sy, ex, ey;
  if (from && to && objects[from] && objects[to]) {
    const fromB = getObjectBounds(from, objects, allProps);
    const toB = getObjectBounds(to, objects, allProps);
    const angle = Math.atan2(toB.y - fromB.y, toB.x - fromB.x);
    const start = edgePoint(fromB, angle);
    const end = edgePoint(toB, angle + Math.PI);
    sx = start.x; sy = start.y;
    ex = end.x; ey = end.y;
  } else {
    sx = explicitX1 || 0; sy = explicitY1 || 0;
    ex = explicitX2 || 100; ey = explicitY2 || 100;
  }

  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = len > 0 ? dx / len : 0;
  const ny = len > 0 ? dy / len : 0;

  // Progress: draw only a portion of the line
  const drawLen = len * Math.max(0, Math.min(1, progress));

  // Arrowhead
  const arrowSize = 8;
  const aex = sx + nx * drawLen;
  const aey = sy + ny * drawLen;

  // Label position
  const mx = (sx + aex) / 2;
  const my = (sy + aey) / 2;

  return (
    <g opacity={opacity}>
      <line
        x1={sx} y1={sy} x2={aex} y2={aey}
        stroke={stroke} strokeWidth={strokeWidth}
        strokeDasharray={dashed ? "6 4" : "none"}
      />
      {arrow && progress > 0.1 && (
        <polygon
          points={`${aex},${aey} ${aex - nx * arrowSize - ny * 4},${aey - ny * arrowSize + nx * 4} ${aex - nx * arrowSize + ny * 4},${aey - ny * arrowSize - nx * 4}`}
          fill={stroke}
        />
      )}
      {label && progress > 0.4 && (
        <g>
          <rect
            x={mx - label.length * 3.3 - 6} y={my - 20}
            width={label.length * 6.6 + 12} height={18}
            rx={4} fill="#0e1117" opacity={0.85}
          />
          <text
            x={mx} y={my - 10}
            textAnchor="middle" dominantBaseline="middle"
            fill={labelColor} fontSize={labelSize} fontFamily={FONT}
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */

const EXAMPLES = {
  "State Machine": `# HTTP Connection State Machine

text title {
  x: 400
  y: 35
  text: "Connection Lifecycle"
  size: 18
  color: #e2e5ea
  bold: true
}

circle start {
  x: 400
  y: 90
  r: 12
  fill: #22d3ee
  stroke: #22d3ee
}

box idle {
  x: 400
  y: 170
  size: 130 46
  fill: #0f1923
  stroke: #22d3ee
  radius: 23
  text: "Idle"
  anchor: bottom
}

box connecting {
  x: 180
  y: 300
  size: 150 46
  fill: #191710
  stroke: #fbbf24
  radius: 8
  text: "Connecting"
  anchor: top
}

box connected {
  x: 400
  y: 430
  size: 150 46
  fill: #0f1916
  stroke: #34d399
  radius: 8
  text: "Connected"
  anchor: top
}

box error {
  x: 620
  y: 300
  size: 130 46
  fill: #1c0f0f
  stroke: #ef4444
  radius: 8
  text: "Error"
  anchor: top
}

line s0 {
  from: start
  to: idle
  stroke: #22d3ee
  label: "init"
}

line s1 {
  from: idle
  to: connecting
  stroke: #fbbf24
  label: "connect()"
}

line s2 {
  from: connecting
  to: connected
  stroke: #34d399
  label: "TCP established"
}

line s3 {
  from: connecting
  to: error
  stroke: #ef4444
  label: "timeout / refused"
}

line s4 {
  from: error
  to: idle
  stroke: #8a8f98
  label: "retry()"
  dashed: true
}

line s5 {
  from: connected
  to: idle
  stroke: #8a8f98
  label: "close()"
  dashed: true
}

@animate duration:8s loop:true {
  0.0s: start.scale = 1.3
  0.4s: start.scale = 1 ease:easeOutCubic
  0.2s: s0.progress = 0
  0.8s: s0.progress = 1 ease:easeInOut
  0.8s: idle.scale = 1.12
  1.2s: idle.scale = 1 ease:easeOutBack
  1.2s: s1.progress = 0
  2.0s: s1.progress = 1 ease:easeInOut
  2.0s: connecting.scale = 1.12, connecting.fill = #2a2410
  2.5s: connecting.scale = 1 ease:easeOutBack, connecting.fill = #191710 ease:easeOut
  2.5s: s2.progress = 0
  3.3s: s2.progress = 1 ease:easeInOut
  3.3s: connected.scale = 1.12, connected.fill = #1a2e22
  3.8s: connected.scale = 1 ease:easeOutBack, connected.fill = #0f1916 ease:easeOut
  4.2s: s5.progress = 0
  5.0s: s5.progress = 1 ease:easeInOut
  5.0s: idle.scale = 1.12
  5.4s: idle.scale = 1 ease:easeOutBack
  5.4s: s1.progress = 0
  6.0s: s1.progress = 1 ease:easeInOut
  6.0s: connecting.scale = 1.12
  6.3s: connecting.scale = 1 ease:easeOutBack
  6.3s: s3.progress = 0
  7.0s: s3.progress = 1 ease:easeInOut
  7.0s: error.scale = 1.15, error.fill = #2c1010
  7.4s: error.scale = 1 ease:bounce, error.fill = #1c0f0f ease:easeOut
  7.4s: s4.progress = 0
  8.0s: s4.progress = 1 ease:easeInOut
}`,

  "Data Pipeline": `# Data Processing Pipeline

text title {
  x: 450
  y: 30
  text: "ETL Pipeline"
  size: 18
  color: #e2e5ea
  bold: true
}

box ingest {
  x: 100
  y: 120
  size: 130 50
  fill: #131825
  stroke: #60a5fa
  text: "Ingest"
}

box validate {
  x: 300
  y: 120
  size: 130 50
  fill: #131825
  stroke: #60a5fa
  text: "Validate"
}

box transform {
  x: 500
  y: 120
  size: 140 50
  fill: #131825
  stroke: #a78bfa
  text: "Transform"
}

box load {
  x: 700
  y: 120
  size: 130 50
  fill: #131825
  stroke: #34d399
  text: "Load"
}

table schema {
  x: 300
  y: 280
  cols: Field | Type | Nullable
  row: id | u64 | no
  row: name | String | no
  row: score | f64 | yes
  row: ts | DateTime | no
}

table metrics {
  x: 650
  y: 310
  cols: Metric | Value
  row: rows/s | 12,450
  row: errors | 0.02%
  row: p99 lat | 23ms
}

line l1 {
  from: ingest
  to: validate
  stroke: #60a5fa
  label: "raw bytes"
}

line l2 {
  from: validate
  to: transform
  stroke: #a78bfa
  label: "parsed rows"
}

line l3 {
  from: transform
  to: load
  stroke: #34d399
  label: "clean records"
}

line l4 {
  from: validate
  to: schema
  stroke: #3a3f49
  label: "check against"
  dashed: true
}

line l5 {
  from: load
  to: metrics
  stroke: #3a3f49
  label: "report"
  dashed: true
}

@animate duration:6s loop:true {
  0.0s: ingest.scale = 1.1, ingest.fill = #1a2540
  0.4s: ingest.scale = 1, ingest.fill = #131825
  0.3s: l1.progress = 0
  1.0s: l1.progress = 1
  1.0s: validate.scale = 1.1
  1.4s: validate.scale = 1
  1.0s: l4.progress = 0
  1.8s: l4.progress = 1
  1.4s: schema.opacity = 0.4
  2.0s: schema.opacity = 1
  1.5s: l2.progress = 0
  2.3s: l2.progress = 1
  2.3s: transform.scale = 1.1, transform.fill = #1c1840
  2.7s: transform.scale = 1, transform.fill = #131825
  2.7s: l3.progress = 0
  3.5s: l3.progress = 1
  3.5s: load.scale = 1.1, load.fill = #132e22
  3.9s: load.scale = 1, load.fill = #131825
  3.5s: l5.progress = 0
  4.3s: l5.progress = 1
  4.3s: metrics.opacity = 0.4
  5.0s: metrics.opacity = 1
}`,

  "Easing Demo": `# Easing comparison — boxes slide left to right

text title {
  x: 400
  y: 30
  text: "Easing Functions"
  size: 18
  color: #e2e5ea
  bold: true
}

text t1 { x: 100  y: 80  text: "linear"       size: 11  color: #4a4f59 }
text t2 { x: 100  y: 130 text: "easeInOut"     size: 11  color: #4a4f59 }
text t3 { x: 100  y: 180 text: "easeOutCubic"  size: 11  color: #4a4f59 }
text t4 { x: 100  y: 230 text: "easeOutBack"   size: 11  color: #4a4f59 }
text t5 { x: 100  y: 280 text: "bounce"        size: 11  color: #4a4f59 }
text t6 { x: 100  y: 330 text: "elastic"       size: 11  color: #4a4f59 }
text t7 { x: 100  y: 380 text: "spring"        size: 11  color: #4a4f59 }
text t8 { x: 100  y: 430 text: "snap"          size: 11  color: #4a4f59 }

box b1 { x: 200 y: 80  size: 60 26  fill: #131825  stroke: #60a5fa  radius: 4 }
box b2 { x: 200 y: 130 size: 60 26  fill: #131825  stroke: #22d3ee  radius: 4 }
box b3 { x: 200 y: 180 size: 60 26  fill: #131825  stroke: #34d399  radius: 4 }
box b4 { x: 200 y: 230 size: 60 26  fill: #131825  stroke: #a78bfa  radius: 4 }
box b5 { x: 200 y: 280 size: 60 26  fill: #131825  stroke: #f472b6  radius: 4 }
box b6 { x: 200 y: 330 size: 60 26  fill: #131825  stroke: #fbbf24  radius: 4 }
box b7 { x: 200 y: 380 size: 60 26  fill: #131825  stroke: #fb923c  radius: 4 }
box b8 { x: 200 y: 430 size: 60 26  fill: #131825  stroke: #ef4444  radius: 4 }

@animate duration:4s loop:true {
  0.0s: b1.x = 200, b2.x = 200, b3.x = 200, b4.x = 200
  0.0s: b5.x = 200, b6.x = 200, b7.x = 200, b8.x = 200
  2.0s: b1.x = 650 ease:linear
  2.0s: b2.x = 650 ease:easeInOut
  2.0s: b3.x = 650 ease:easeOutCubic
  2.0s: b4.x = 650 ease:easeOutBack
  2.0s: b5.x = 650 ease:bounce
  2.0s: b6.x = 650 ease:elastic
  2.0s: b7.x = 650 ease:spring
  2.0s: b8.x = 650 ease:snap
  3.0s: b1.x = 650, b2.x = 650, b3.x = 650, b4.x = 650
  3.0s: b5.x = 650, b6.x = 650, b7.x = 650, b8.x = 650
  4.0s: b1.x = 200 ease:linear
  4.0s: b2.x = 200 ease:easeInOut
  4.0s: b3.x = 200 ease:easeOutCubic
  4.0s: b4.x = 200 ease:easeOutBack
  4.0s: b5.x = 200 ease:bounce
  4.0s: b6.x = 200 ease:elastic
  4.0s: b7.x = 200 ease:spring
  4.0s: b8.x = 200 ease:snap
}`,
};

export default function DiagramAnimator() {
  const [dsl, setDsl] = useState(EXAMPLES["State Machine"]);
  const [activeExample, setActiveExample] = useState("State Machine");
  const [showEditor, setShowEditor] = useState(true);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [parseError, setParseError] = useState(null);
  const rafRef = useRef(null);
  const lastFrameRef = useRef(null);

  // Parse
  const parsed = useMemo(() => {
    try {
      const result = parseDSL(dsl);
      setParseError(null);
      return result;
    } catch (e) {
      setParseError(e.message);
      return { objects: {}, animConfig: { duration: 5, loop: true, keyframes: [] } };
    }
  }, [dsl]);

  const { objects, animConfig } = parsed;
  const tracks = useMemo(() => buildTimeline(animConfig), [animConfig]);
  const duration = animConfig.duration;

  // Playback loop
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    lastFrameRef.current = performance.now();
    const tick = (now) => {
      const dt = ((now - lastFrameRef.current) / 1000) * speed;
      lastFrameRef.current = now;
      setTime((prev) => {
        let next = prev + dt;
        if (next >= duration) {
          next = animConfig.loop ? next % duration : duration;
          if (!animConfig.loop) setPlaying(false);
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, speed, duration, animConfig.loop]);

  const animatedProps = useMemo(
    () => evaluateAnimatedProps(objects, tracks, time),
    [objects, tracks, time]
  );

  // Render order: lines last so they draw on top? Actually lines under nodes.
  const renderOrder = useMemo(() => {
    const entries = Object.entries(objects);
    const texts = entries.filter(([, o]) => o.type === "text");
    const lines = entries.filter(([, o]) => o.type === "line");
    const rest = entries.filter(([, o]) => o.type !== "text" && o.type !== "line");
    return [...texts, ...lines, ...rest];
  }, [objects]);

  const renderObject = (id, obj) => {
    const p = animatedProps[id] || obj.props;
    switch (obj.type) {
      case "box": return <RenderBox key={id} props={p} />;
      case "circle": return <RenderCircle key={id} props={p} />;
      case "text": return <RenderText key={id} props={p} />;
      case "table": return <RenderTable key={id} props={p} />;
      case "line": return <RenderLine key={id} id={id} props={p} objects={objects} allProps={animatedProps} />;
      default: return null;
    }
  };

  const pct = duration > 0 ? (time / duration) * 100 : 0;

  return (
    <div style={{
      width: "100%", height: "100vh", display: "flex", flexDirection: "column",
      background: "#0e1117", fontFamily: FONT, color: "#c9cdd4", overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
        textarea:focus { outline: none; border-color: #22d3ee !important; }
        .ex-btn {
          padding: 5px 12px; border-radius: 6px; border: 1px solid #2a2d35;
          background: #14161c; color: #6b7280; font-size: 11px; font-family: inherit;
          cursor: pointer; transition: all 0.15s; white-space: nowrap;
        }
        .ex-btn:hover { border-color: #22d3ee; color: #e2e5ea; }
        .ex-btn.active { border-color: #22d3ee; color: #22d3ee; background: rgba(34,211,238,0.06); }
        .ctrl-btn {
          width: 32px; height: 32px; border-radius: 6px; border: 1px solid #2a2d35;
          background: #14161c; color: #8a8f98; font-size: 14px; font-family: inherit;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .ctrl-btn:hover { border-color: #a78bfa; color: #e2e5ea; }
        .ctrl-btn.active { border-color: #a78bfa; color: #a78bfa; }
        input[type=range] {
          -webkit-appearance: none; height: 4px; background: #1e2028;
          border-radius: 2px; outline: none;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 14px; height: 14px;
          border-radius: 50%; background: #a78bfa; cursor: pointer;
          border: 2px solid #0e1117;
        }
      `}</style>

      {/* Header */}
      <div style={{
        padding: "10px 20px", display: "flex", alignItems: "center",
        justifyContent: "space-between", borderBottom: "1px solid #1a1d24", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%", background: "#a78bfa",
            boxShadow: "0 0 8px rgba(167,139,250,0.5)",
          }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: "#e2e5ea" }}>diagram::animate</span>
          <span style={{ fontSize: 10, color: "#3a3f49", marginLeft: 2 }}>
            define objects → animate anything
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {Object.keys(EXAMPLES).map((name) => (
            <button key={name} className={`ex-btn ${activeExample === name ? "active" : ""}`}
              onClick={() => { setDsl(EXAMPLES[name]); setActiveExample(name); setTime(0); }}>
              {name}
            </button>
          ))}
          <div style={{ width: 1, height: 20, background: "#1e2028", margin: "0 4px" }} />
          <button className="ex-btn" onClick={() => setShowEditor(!showEditor)}>
            {showEditor ? "⌃ Hide" : "⌄ Edit"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Editor */}
        {showEditor && (
          <div style={{
            width: 360, borderRight: "1px solid #1a1d24",
            display: "flex", flexDirection: "column", flexShrink: 0,
          }}>
            <div style={{
              padding: "10px 14px 6px", fontSize: 10, color: "#3a3f49",
              display: "flex", justifyContent: "space-between",
            }}>
              <span>DSL</span>
              {parseError && <span style={{ color: "#ef4444" }}>Parse error</span>}
            </div>
            <textarea
              value={dsl}
              onChange={(e) => { setDsl(e.target.value); setActiveExample(""); }}
              spellCheck={false}
              style={{
                flex: 1, padding: "10px 14px", background: "#0a0c10",
                border: "none", color: "#b0b5be", fontSize: 12,
                lineHeight: 1.65, fontFamily: "inherit", resize: "none",
              }}
            />
            <div style={{
              padding: "8px 14px", fontSize: 10, color: "#2a2d35",
              borderTop: "1px solid #1a1d24", lineHeight: 1.8,
            }}>
              <span style={{ color: "#4a4f59" }}>Objects:</span> box circle text table line<br/>
              <span style={{ color: "#4a4f59" }}>Props:</span> pos size fill stroke text radius r opacity scale anchor bold<br/>
              <span style={{ color: "#4a4f59" }}>Anchor:</span> center top bottom left right topleft topright bottomleft bottomright<br/>
              <span style={{ color: "#4a4f59" }}>Lines:</span> from to label arrow progress<br/>
              <span style={{ color: "#4a4f59" }}>Tables:</span> cols row colWidth rowHeight<br/>
              <span style={{ color: "#4a4f59" }}>Anim:</span> @animate {"{"} time: obj.prop = val ease:fn {"}"}<br/>
              <span style={{ color: "#4a4f59" }}>Easing:</span> linear easeIn easeOut easeInOut easeInCubic easeOutCubic easeOutBack bounce elastic spring snap step
            </div>
          </div>
        )}

        {/* Canvas */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <svg width="100%" height="100%"
              style={{ background: "#0e1117", display: "block" }}>
              <defs>
                <pattern id="grid2" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff04" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid2)" />
              {renderOrder.map(([id, obj]) => renderObject(id, obj))}
            </svg>
          </div>

          {/* Timeline controls */}
          <div style={{
            height: 48, borderTop: "1px solid #1a1d24", padding: "0 20px",
            display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
          }}>
            <button className={`ctrl-btn ${playing ? "active" : ""}`}
              onClick={() => setPlaying(!playing)}>
              {playing ? "⏸" : "▶"}
            </button>
            <button className="ctrl-btn" onClick={() => { setTime(0); setPlaying(true); }}>
              ⏮
            </button>
            <input
              type="range" min={0} max={1000} value={pct * 10}
              onChange={(e) => { setTime((e.target.value / 1000) * duration); setPlaying(false); }}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, color: "#4a4f59", minWidth: 70, textAlign: "right" }}>
              {time.toFixed(1)}s / {duration.toFixed(1)}s
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              {[0.5, 1, 2].map((s) => (
                <button key={s} className={`ex-btn ${speed === s ? "active" : ""}`}
                  style={{ padding: "3px 8px", fontSize: 10 }}
                  onClick={() => setSpeed(s)}>
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
