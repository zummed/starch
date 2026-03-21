import { useState, useCallback, useRef } from 'react';
import { TabbedPopup } from './TabbedPopup';
import { NumberSlider } from './NumberSlider';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";
const SQ_SIZE = 160;
const HUE_H = 14;

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

// ─── Color conversions ──────────────────────────────────────────

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const s1 = s / 100, l1 = l / 100;
  if (s1 === 0) { const v = Math.round(l1 * 255); return [v, v, v]; }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l1 < 0.5 ? l1 * (1 + s1) : l1 + s1 - l1 * s1;
  const p = 2 * l1 - q;
  const h1 = h / 360;
  return [
    Math.round(hue2rgb(p, q, h1 + 1/3) * 255),
    Math.round(hue2rgb(p, q, h1) * 255),
    Math.round(hue2rgb(p, q, h1 - 1/3) * 255),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
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

function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function hexToHsl(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) {
    const m3 = hex.replace('#', '').match(/^([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    if (!m3) return null;
    return rgbToHsl(parseInt(m3[1]+m3[1], 16), parseInt(m3[2]+m3[2], 16), parseInt(m3[3]+m3[3], 16));
  }
  return rgbToHsl(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16));
}

// ─── Components ─────────────────────────────────────────────────

interface ColorPickerProps {
  value: { h: number; s: number; l: number };
  onChange: (value: { h: number; s: number; l: number }) => void;
}

/** 2D Saturation/Lightness square + Hue strip */
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
    onChange(h, Math.round(x * 100), Math.round((1 - y) * 100));
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
        {/* Crosshair indicator */}
        <div style={{
          position: 'absolute',
          left: `${s}%`, top: `${100 - l}%`,
          width: 10, height: 10,
          border: '2px solid white',
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 2px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }} />
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

/** Format inputs: HSL / RGB / Hex */
function FormatInputs({ h, s, l, onChange }: { h: number; s: number; l: number; onChange: (h: number, s: number, l: number) => void }) {
  const [format, setFormat] = useState<'hsl' | 'rgb' | 'hex'>('hsl');
  const [hexInput, setHexInput] = useState(hslToHex(h, s, l));
  const [rgb, setRgb] = useState(() => hslToRgb(h, s, l));

  const inputStyle: React.CSSProperties = {
    width: 42, padding: '2px 4px', fontSize: 10, fontFamily: FONT,
    background: '#0e1117', border: '1px solid #2a2d35', borderRadius: 3,
    color: '#e2e5ea', textAlign: 'right', outline: 'none',
  };

  return (
    <div style={{ padding: '4px 8px 8px' }} onMouseDown={stop} onPointerDown={stop}>
      {/* Format tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 6 }}>
        {(['hsl', 'rgb', 'hex'] as const).map(f => (
          <button
            key={f}
            onClick={() => {
              setFormat(f);
              if (f === 'hex') setHexInput(hslToHex(h, s, l));
              if (f === 'rgb') setRgb(hslToRgb(h, s, l));
            }}
            onMouseDown={stop}
            style={{
              padding: '2px 8px', fontSize: 9, fontFamily: FONT, cursor: 'pointer',
              border: '1px solid ' + (format === f ? '#a78bfa' : '#2a2d35'),
              borderRadius: 3,
              background: format === f ? 'rgba(167,139,250,0.1)' : 'transparent',
              color: format === f ? '#a78bfa' : '#4a4f59',
              textTransform: 'uppercase',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {format === 'hsl' && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
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
      )}

      {format === 'rgb' && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {[
            { label: 'R', val: rgb[0], set: (v: string) => { const nr = [parseInt(v) || 0, rgb[1], rgb[2]] as [number, number, number]; setRgb(nr); const [nh, ns, nl] = rgbToHsl(...nr); onChange(nh, ns, nl); } },
            { label: 'G', val: rgb[1], set: (v: string) => { const nr = [rgb[0], parseInt(v) || 0, rgb[2]] as [number, number, number]; setRgb(nr); const [nh, ns, nl] = rgbToHsl(...nr); onChange(nh, ns, nl); } },
            { label: 'B', val: rgb[2], set: (v: string) => { const nr = [rgb[0], rgb[1], parseInt(v) || 0] as [number, number, number]; setRgb(nr); const [nh, ns, nl] = rgbToHsl(...nr); onChange(nh, ns, nl); } },
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
      )}

      {format === 'hex' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
            style={{ ...inputStyle, width: 64, textAlign: 'left' }}
          />
        </div>
      )}
    </div>
  );
}

/** Jog wheel sliders for H, S, L */
function SliderTab({ h, s, l, onChange }: { h: number; s: number; l: number; onChange: (h: number, s: number, l: number) => void }) {
  return (
    <div onMouseDown={stop} onPointerDown={stop}>
      <NumberSlider value={h} step={1} label="Hue" onChange={(v) => onChange(v, s, l)} />
      <NumberSlider value={s} step={1} label="Saturation" onChange={(v) => onChange(h, v, l)} />
      <NumberSlider value={l} step={1} label="Lightness" onChange={(v) => onChange(h, s, v)} />
    </div>
  );
}

// ─── Main export ────────────────────────────────────────────────

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [h, setH] = useState(value.h);
  const [s, setS] = useState(value.s);
  const [l, setL] = useState(value.l);

  const update = useCallback((nh: number, ns: number, nl: number) => {
    setH(nh); setS(ns); setL(nl);
    onChange({ h: nh, s: ns, l: nl });
  }, [onChange]);

  return (
    <TabbedPopup tabs={[
      {
        label: 'Picker',
        content: (
          <div>
            <VisualPicker h={h} s={s} l={l} onChange={update} />
            <FormatInputs h={h} s={s} l={l} onChange={update} />
          </div>
        ),
      },
      {
        label: 'Sliders',
        content: <SliderTab h={h} s={s} l={l} onChange={update} />,
      },
    ]} />
  );
}
