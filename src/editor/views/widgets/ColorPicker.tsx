import { useState, useCallback, useRef } from 'react';
import { TabbedPopup } from './TabbedPopup';
import { NumberSlider } from './NumberSlider';
import type { Color } from '../../../types/properties';
import {
  colorToHsl, hslToRgb, hslToHex, hslToName, resolveNamedColor,
} from '../../../types/color';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";
const SQ_SIZE = 160;
const HUE_H = 14;

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

// ─── Color conversions (local helpers) ─────────────────────────

function localRgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const r1 = r / 255, g1 = g / 255, b1 = b / 255;
  const max = Math.max(r1, g1, b1), min = Math.min(r1, g1, b1);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r1) h = ((g1 - b1) / d + (g1 < b1 ? 6 : 0)) / 6;
  else if (max === g1) h = ((b1 - r1) / d + 2) / 6;
  else h = ((r1 - g1) / d + 4) / 6;
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hexToHsl(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) {
    const m3 = hex.replace('#', '').match(/^([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    if (!m3) return null;
    return localRgbToHsl(parseInt(m3[1]+m3[1], 16), parseInt(m3[2]+m3[2], 16), parseInt(m3[3]+m3[3], 16));
  }
  return localRgbToHsl(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16));
}

// ─── Format detection ──────────────────────────────────────────

type ColorFormat = 'named' | 'hex' | 'rgb' | 'hsl';

const FORMAT_INDEX: Record<ColorFormat, number> = { named: 0, hex: 1, rgb: 2, hsl: 3 };

function detectFormat(value: Color): ColorFormat {
  if (typeof value === 'string') {
    return value.startsWith('#') ? 'hex' : 'named';
  }
  if (typeof value === 'object' && value !== null) {
    if ('h' in value && 's' in value && 'l' in value) return 'hsl';
    if ('r' in value && 'g' in value && 'b' in value) return 'rgb';
    if ('name' in value && 'a' in value) return 'named';
    if ('hex' in value && 'a' in value) return 'hex';
  }
  return 'hex';
}

function extractAlpha(value: Color): number | undefined {
  if (typeof value === 'string') return undefined;
  if (typeof value === 'object' && value !== null && 'a' in value) {
    return (value as Record<string, unknown>).a as number;
  }
  return undefined;
}

// ─── Output builder ────────────────────────────────────────────

function buildOutput(h: number, s: number, l: number, alpha: number | undefined, format: ColorFormat): Color {
  if (format === 'named') {
    const name = hslToName({ h, s, l });
    if (name) {
      return alpha !== undefined ? { name, a: alpha } : name;
    }
    return buildOutput(h, s, l, alpha, 'hex');
  }
  if (format === 'hex') {
    const hex = hslToHex(h, s, l);
    return alpha !== undefined ? { hex, a: alpha } : hex;
  }
  if (format === 'rgb') {
    const { r, g, b } = hslToRgb(h, s, l);
    return alpha !== undefined ? { r, g, b, a: alpha } : { r, g, b };
  }
  return alpha !== undefined ? { h, s, l, a: alpha } : { h, s, l };
}

// ─── Swatch colors ─────────────────────────────────────────────

const SWATCH_COLORS = [
  // Reds / pinks
  'indianred', 'red', 'crimson', 'hotpink', 'deeppink', 'pink',
  // Oranges / yellows
  'orangered', 'orange', 'coral', 'gold', 'yellow', 'khaki',
  // Greens
  'darkgreen', 'green', 'seagreen', 'limegreen', 'lime', 'palegreen',
  // Cyans / teals
  'darkcyan', 'teal', 'cadetblue', 'cyan', 'aquamarine', 'lightcyan',
  // Blues
  'darkblue', 'navy', 'blue', 'dodgerblue', 'deepskyblue', 'lightskyblue',
  // Purples
  'indigo', 'purple', 'darkviolet', 'mediumpurple', 'orchid', 'plum',
  // Neutrals
  'black', 'dimgray', 'gray', 'darkgray', 'silver', 'white',
];

// ─── Components ────────────────────────────────────────────────

export interface ColorPickerProps {
  value: Color;
  onChange: (value: Color) => void;
}

// HSL ↔ HSB conversion for the 2D picker square
function hslToHsb(h: number, s: number, l: number): { hb_s: number; hb_b: number } {
  const s1 = s / 100, l1 = l / 100;
  const b = l1 + s1 * Math.min(l1, 1 - l1);
  const sb = b === 0 ? 0 : 2 * (1 - l1 / b);
  return { hb_s: sb * 100, hb_b: b * 100 };
}

function hsbToHsl(h: number, hb_s: number, hb_b: number): { s: number; l: number } {
  const s1 = hb_s / 100, b1 = hb_b / 100;
  const l = b1 * (1 - s1 / 2);
  const sl = (l === 0 || l === 1) ? 0 : (b1 - l) / Math.min(l, 1 - l);
  return { s: Math.round(sl * 100), l: Math.round(l * 100) };
}

/** 2D Saturation/Brightness square (HSB) + Hue strip */
function VisualPicker({ h, s, l, onChange }: { h: number; s: number; l: number; onChange: (h: number, s: number, l: number) => void }) {
  const sqRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const draggingSq = useRef(false);
  const draggingHue = useRef(false);

  const pickFromSquare = useCallback((clientX: number, clientY: number) => {
    if (!sqRef.current) return;
    const rect = sqRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const hb_s = x * 100;
    const hb_b = (1 - y) * 100;
    const { s: newS, l: newL } = hsbToHsl(h, hb_s, hb_b);
    onChange(h, newS, newL);
  }, [h, onChange]);

  const pickHue = useCallback((clientX: number) => {
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onChange(Math.round(x * 360), s, l);
  }, [s, l, onChange]);

  return (
    <div style={{ padding: 8 }} onMouseDown={stop} onPointerDown={stop}>
      {/* SL Square */}
      <div
        ref={sqRef}
        onPointerDown={(e) => { e.stopPropagation(); draggingSq.current = true; e.currentTarget.setPointerCapture(e.pointerId); pickFromSquare(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (draggingSq.current) pickFromSquare(e.clientX, e.clientY); }}
        onPointerUp={(e) => { draggingSq.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }}
        style={{
          width: SQ_SIZE, height: SQ_SIZE, position: 'relative', cursor: 'crosshair',
          borderRadius: 4, overflow: 'hidden',
          background: `
            linear-gradient(to top, #000, transparent),
            linear-gradient(to right, #fff, hsl(${h}, 100%, 50%))
          `,
        }}
      >
        {(() => { const { hb_s, hb_b } = hslToHsb(h, s, l); return (
        <div style={{
          position: 'absolute',
          left: `${hb_s}%`, top: `${100 - hb_b}%`,
          width: 10, height: 10,
          border: '2px solid white',
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 2px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }} />
        ); })()}
      </div>

      {/* Hue strip */}
      <div
        ref={hueRef}
        onPointerDown={(e) => { e.stopPropagation(); draggingHue.current = true; e.currentTarget.setPointerCapture(e.pointerId); pickHue(e.clientX); }}
        onPointerMove={(e) => { if (draggingHue.current) pickHue(e.clientX); }}
        onPointerUp={(e) => { draggingHue.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }}
        style={{
          width: SQ_SIZE, height: HUE_H, marginTop: 6, borderRadius: 3, cursor: 'ew-resize',
          position: 'relative',
          background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
        }}
      >
        <div style={{
          position: 'absolute',
          left: `${(h / 360) * 100}%`, top: -1, bottom: -1,
          width: 4,
          background: 'white',
          borderRadius: 2,
          transform: 'translateX(-50%)',
          boxShadow: '0 0 2px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Preview + hex */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 4,
          background: `hsl(${h}, ${s}%, ${l}%)`,
          border: '1px solid #2a2d35', flexShrink: 0,
        }} />
        <span style={{ fontSize: 11, color: '#8a8f98', fontFamily: FONT }}>{hslToHex(h, s, l)}</span>
      </div>
    </div>
  );
}

/** Named color swatch grid — full tab content */
function NamedTab({ h, s, l, alpha, activeName, onNameSelect, onAlphaChange }: {
  h: number; s: number; l: number;
  alpha: number | undefined;
  activeName: string | null;
  onNameSelect: (name: string) => void;
  onAlphaChange?: (alpha: number) => void;
}) {
  return (
    <div style={{ padding: 8 }} onMouseDown={stop} onPointerDown={stop}>
      {/* Preview */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 4,
          background: `hsl(${h}, ${s}%, ${l}%)`,
          border: '1px solid #2a2d35', flexShrink: 0,
        }} />
        <span style={{ fontSize: 11, color: '#8a8f98', fontFamily: FONT }}>
          {activeName ?? hslToHex(h, s, l)}
        </span>
      </div>

      {/* Swatch grid — 6 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 22px)', gap: 3 }}>
        {SWATCH_COLORS.map(name => {
          const rgb = resolveNamedColor(name);
          const bg = rgb ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : '#000';
          const isActive = activeName === name;
          return (
            <div
              key={name}
              title={name}
              onClick={() => onNameSelect(name)}
              onMouseDown={stop}
              style={{
                width: 22, height: 22, borderRadius: 3, cursor: 'pointer',
                background: bg,
                border: isActive ? '2px solid #a78bfa' : '1px solid #2a2d35',
                boxSizing: 'border-box',
              }}
            />
          );
        })}
      </div>

      {/* Alpha */}
      {alpha !== undefined && onAlphaChange && (
        <div style={{ marginTop: 8 }}>
          <NumberSlider value={alpha} min={0} max={1} step={0.01} label="Alpha" onChange={onAlphaChange} />
        </div>
      )}
    </div>
  );
}

/** Hex input tab */
function HexTab({ h, s, l, alpha, onChange, onAlphaChange }: {
  h: number; s: number; l: number;
  alpha: number | undefined;
  onChange: (h: number, s: number, l: number) => void;
  onAlphaChange?: (alpha: number) => void;
}) {
  const [hexInput, setHexInput] = useState(hslToHex(h, s, l));

  const inputStyle: React.CSSProperties = {
    width: 64, padding: '2px 4px', fontSize: 10, fontFamily: FONT,
    background: '#0e1117', border: '1px solid #2a2d35', borderRadius: 3,
    color: '#e2e5ea', textAlign: 'left', outline: 'none',
  };

  return (
    <div>
      <VisualPicker h={h} s={s} l={l} onChange={onChange} />
      <div style={{ padding: '4px 8px 8px', display: 'flex', alignItems: 'center', gap: 4 }} onMouseDown={stop} onPointerDown={stop}>
        <span style={{ fontSize: 9, color: '#4a4f59', fontFamily: FONT }}>#</span>
        <input
          type="text" value={hexInput.replace('#', '')}
          onChange={(e) => {
            const val = e.target.value;
            setHexInput('#' + val);
            const parsed = hexToHsl('#' + val);
            if (parsed) onChange(parsed[0], parsed[1], parsed[2]);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          onMouseDown={stop} onPointerDown={stop}
          style={inputStyle}
        />
      </div>
      {alpha !== undefined && onAlphaChange && (
        <div style={{ padding: '0 8px 4px' }} onMouseDown={stop} onPointerDown={stop}>
          <NumberSlider value={alpha} min={0} max={1} step={0.01} label="Alpha" onChange={onAlphaChange} />
        </div>
      )}
    </div>
  );
}

/** RGB input tab */
function RgbTab({ h, s, l, alpha, onChange, onAlphaChange }: {
  h: number; s: number; l: number;
  alpha: number | undefined;
  onChange: (h: number, s: number, l: number) => void;
  onAlphaChange?: (alpha: number) => void;
}) {
  const [rgb, setRgb] = useState(() => {
    const c = hslToRgb(h, s, l);
    return [c.r, c.g, c.b] as [number, number, number];
  });

  const inputStyle: React.CSSProperties = {
    width: 42, padding: '2px 4px', fontSize: 10, fontFamily: FONT,
    background: '#0e1117', border: '1px solid #2a2d35', borderRadius: 3,
    color: '#e2e5ea', textAlign: 'right', outline: 'none',
  };

  return (
    <div>
      <VisualPicker h={h} s={s} l={l} onChange={onChange} />
      <div style={{ padding: '4px 8px 8px', display: 'flex', gap: 4, alignItems: 'center' }} onMouseDown={stop} onPointerDown={stop}>
        {[
          { label: 'R', val: rgb[0], set: (v: string) => { const nr = [parseInt(v) || 0, rgb[1], rgb[2]] as [number, number, number]; setRgb(nr); const [nh, ns, nl] = localRgbToHsl(...nr); onChange(nh, ns, nl); } },
          { label: 'G', val: rgb[1], set: (v: string) => { const nr = [rgb[0], parseInt(v) || 0, rgb[2]] as [number, number, number]; setRgb(nr); const [nh, ns, nl] = localRgbToHsl(...nr); onChange(nh, ns, nl); } },
          { label: 'B', val: rgb[2], set: (v: string) => { const nr = [rgb[0], rgb[1], parseInt(v) || 0] as [number, number, number]; setRgb(nr); const [nh, ns, nl] = localRgbToHsl(...nr); onChange(nh, ns, nl); } },
        ].map(f => (
          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 9, color: '#4a4f59', fontFamily: FONT }}>{f.label}</span>
            <input
              type="number" min={0} max={255} value={f.val}
              onChange={(e) => f.set(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              onMouseDown={stop} onPointerDown={stop}
              style={inputStyle}
            />
          </div>
        ))}
      </div>
      {alpha !== undefined && onAlphaChange && (
        <div style={{ padding: '0 8px 4px' }} onMouseDown={stop} onPointerDown={stop}>
          <NumberSlider value={alpha} min={0} max={1} step={0.01} label="Alpha" onChange={onAlphaChange} />
        </div>
      )}
    </div>
  );
}

/** HSL input tab */
function HslTab({ h, s, l, alpha, onChange, onAlphaChange }: {
  h: number; s: number; l: number;
  alpha: number | undefined;
  onChange: (h: number, s: number, l: number) => void;
  onAlphaChange?: (alpha: number) => void;
}) {
  const inputStyle: React.CSSProperties = {
    width: 42, padding: '2px 4px', fontSize: 10, fontFamily: FONT,
    background: '#0e1117', border: '1px solid #2a2d35', borderRadius: 3,
    color: '#e2e5ea', textAlign: 'right', outline: 'none',
  };

  return (
    <div>
      <VisualPicker h={h} s={s} l={l} onChange={onChange} />
      <div style={{ padding: '4px 8px 8px', display: 'flex', gap: 4, alignItems: 'center' }} onMouseDown={stop} onPointerDown={stop}>
        {[
          { label: 'H', val: h, max: 360, set: (v: string) => onChange(parseInt(v) || 0, s, l) },
          { label: 'S', val: s, max: 100, set: (v: string) => onChange(h, parseInt(v) || 0, l) },
          { label: 'L', val: l, max: 100, set: (v: string) => onChange(h, s, parseInt(v) || 0) },
        ].map(f => (
          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 9, color: '#4a4f59', fontFamily: FONT }}>{f.label}</span>
            <input
              type="number" min={0} max={f.max} value={f.val}
              onChange={(e) => f.set(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              onMouseDown={stop} onPointerDown={stop}
              style={inputStyle}
            />
          </div>
        ))}
      </div>
      {alpha !== undefined && onAlphaChange && (
        <div style={{ padding: '0 8px 4px' }} onMouseDown={stop} onPointerDown={stop}>
          <NumberSlider value={alpha} min={0} max={1} step={0.01} label="Alpha" onChange={onAlphaChange} />
        </div>
      )}
    </div>
  );
}

// ─── Main export ────────────────────────────────────────────────

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const initHsl = (() => {
    try { return colorToHsl(value); }
    catch { return { h: 0, s: 0, l: 50 }; }
  })();

  const hasAlpha = extractAlpha(value) !== undefined;
  const [h, setH] = useState(initHsl.h);
  const [s, setS] = useState(initHsl.s);
  const [l, setL] = useState(initHsl.l);
  const [a, setA] = useState(extractAlpha(value) ?? 1);
  const [format, setFormat] = useState<ColorFormat>(() => detectFormat(value));
  // Track active name separately to avoid HSL round-trip precision loss
  const [activeName, setActiveName] = useState<string | null>(() => {
    if (typeof value === 'string' && !value.startsWith('#')) return value;
    if (typeof value === 'object' && value !== null && 'name' in value) return (value as any).name;
    return null;
  });

  const alpha = hasAlpha ? a : undefined;

  const emit = useCallback((nh: number, ns: number, nl: number, na: number | undefined, fmt: ColorFormat) => {
    onChange(buildOutput(nh, ns, nl, na, fmt));
  }, [onChange]);

  const update = useCallback((nh: number, ns: number, nl: number) => {
    setH(nh); setS(ns); setL(nl);
    setActiveName(null); // Clear name when picking via visual controls
    emit(nh, ns, nl, alpha, format);
  }, [emit, alpha, format]);

  const updateAlpha = useCallback((na: number) => {
    setA(na);
    if (activeName) {
      // Emit name directly with alpha
      onChange(na !== undefined ? { name: activeName, a: na } : activeName);
    } else {
      emit(h, s, l, na, format);
    }
  }, [onChange, emit, h, s, l, format, activeName]);

  const handleNameSelect = useCallback((name: string) => {
    // Update HSL state for the visual preview
    const rgb = resolveNamedColor(name);
    if (!rgb) return;
    const [nh, ns, nl] = localRgbToHsl(rgb.r, rgb.g, rgb.b);
    setH(nh); setS(ns); setL(nl);
    setActiveName(name);
    // Emit the name string directly — no HSL round-trip
    onChange(alpha !== undefined ? { name, a: alpha } : name);
  }, [onChange, alpha]);

  const formats: ColorFormat[] = ['named', 'hex', 'rgb', 'hsl'];

  return (
    <TabbedPopup
      defaultTab={FORMAT_INDEX[format]}
      onTabChange={(i) => {
        const newFormat = formats[i];
        setFormat(newFormat);
        if (newFormat !== 'named') setActiveName(null);
        emit(h, s, l, alpha, newFormat);
      }}
      tabs={[
        {
          label: 'Named',
          content: (
            <NamedTab h={h} s={s} l={l} alpha={alpha} activeName={activeName}
              onNameSelect={handleNameSelect}
              onAlphaChange={hasAlpha ? updateAlpha : undefined} />
          ),
        },
        {
          label: 'Hex',
          content: (
            <HexTab h={h} s={s} l={l} alpha={alpha} onChange={update}
              onAlphaChange={hasAlpha ? updateAlpha : undefined} />
          ),
        },
        {
          label: 'RGB',
          content: (
            <RgbTab h={h} s={s} l={l} alpha={alpha} onChange={update}
              onAlphaChange={hasAlpha ? updateAlpha : undefined} />
          ),
        },
        {
          label: 'HSL',
          content: (
            <HslTab h={h} s={s} l={l} alpha={alpha} onChange={update}
              onAlphaChange={hasAlpha ? updateAlpha : undefined} />
          ),
        },
      ]}
    />
  );
}
