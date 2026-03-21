import { useEffect, useRef, useCallback } from 'react';
import { detectSchemaType, getEnumValues, getNumberConstraints, getPropertySchema, getAvailableProperties } from '../../types/schemaRegistry';
import { ColorPicker } from './ColorPicker';
import { NumberSlider } from './NumberSlider';
import { EnumDropdown } from './EnumDropdown';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

interface PropertyPopupProps {
  schemaPath: string;
  value: unknown;
  position: { x: number; y: number };
  onChange: (value: unknown) => void;
  onClose: () => void;
}

/** Generic compound editor: auto-detects color fields (h/s/l) and shows color picker for those, jog wheels for the rest */
function CompoundEditor({ schemaPath, value, onChange }: { schemaPath: string; value: Record<string, unknown>; onChange: (value: unknown) => void }) {
  const props = getAvailableProperties(schemaPath);
  const propNames = props.map(p => p.name);

  // Detect if this object contains h/s/l color fields (and optionally a)
  const hasColor = ['h', 's', 'l'].every(k => propNames.includes(k));
  const colorKeys = new Set(['h', 's', 'l', 'a']);

  // Non-color numeric properties
  const otherNumericProps = props.filter(p => {
    if (hasColor && colorKeys.has(p.name)) return false;
    return detectSchemaType(p.schema) === 'number';
  });

  const handleColorChange = useCallback((color: { h: number; s: number; l: number }) => {
    onChange({ ...value, ...color });
  }, [value, onChange]);

  const handleSubChange = useCallback((key: string, newVal: unknown) => {
    onChange({ ...value, [key]: newVal });
  }, [value, onChange]);

  if (!hasColor && otherNumericProps.length === 0) return null;

  return (
    <div onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {hasColor && (
        <ColorPicker
          value={{
            h: (value.h as number) ?? 0,
            s: (value.s as number) ?? 0,
            l: (value.l as number) ?? 50,
            ...(propNames.includes('a') ? { a: (value.a as number) ?? 1 } : {}),
          }}
          onChange={handleColorChange}
        />
      )}
      {otherNumericProps.map(prop => {
        const constraints = getNumberConstraints(prop.schema);
        const hasRange = constraints?.min !== undefined && constraints?.max !== undefined;
        const range = hasRange ? (constraints!.max! - constraints!.min!) : 100;
        const step = range <= 1 ? 0.01 : range <= 20 ? 0.5 : 1;
        return (
          <NumberSlider
            key={prop.name}
            value={(value[prop.name] as number) ?? 0}
            min={constraints?.min}
            max={constraints?.max}
            step={step}
            label={prop.name}
            onChange={(v) => handleSubChange(prop.name, v)}
          />
        );
      })}
    </div>
  );
}

export function PropertyPopup({ schemaPath, value, position, onChange, onClose }: PropertyPopupProps) {
  const ref = useRef<HTMLDivElement>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
      document.addEventListener('keydown', keyHandler);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, []);

  const schema = getPropertySchema(schemaPath);
  if (!schema) return null;

  const type = detectSchemaType(schema);

  let content: React.ReactNode = null;

  switch (type) {
    case 'color':
    case 'object': {
      const objVal = (value as Record<string, unknown>) ?? {};
      content = <CompoundEditor schemaPath={schemaPath} value={objVal} onChange={onChange} />;
      break;
    }
    case 'number': {
      const constraints = getNumberConstraints(schema);
      const hasRange = constraints?.min !== undefined && constraints?.max !== undefined;
      const range = hasRange ? (constraints!.max! - constraints!.min!) : 100;
      const step = range <= 1 ? 0.01 : range <= 20 ? 0.5 : 1;
      content = (
        <NumberSlider
          value={(value as number) ?? 0}
          min={constraints?.min}
          max={constraints?.max}
          step={step}
          label={schemaPath.split('.').pop()}
          onChange={onChange}
        />
      );
      break;
    }
    case 'enum': {
      const options = getEnumValues(schema);
      if (options) {
        content = (
          <EnumDropdown
            value={(value as string) ?? options[0]}
            options={options}
            onChange={onChange}
          />
        );
      }
      break;
    }
    case 'boolean': {
      content = (
        <div style={{ padding: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={value as boolean ?? false}
              onChange={(e) => onChange(e.target.checked)}
            />
            <span style={{ fontSize: 11, fontFamily: FONT, color: '#c9cdd4' }}>
              {schemaPath.split('.').pop()}
            </span>
          </label>
        </div>
      );
      break;
    }
    case 'pointref': {
      // PointRef: string ID, [x,y], or ["id", dx, dy]
      const strVal = typeof value === 'string' ? value
        : Array.isArray(value) ? JSON.stringify(value)
        : '';
      content = (
        <div style={{ padding: 8, minWidth: 180 }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4, fontFamily: FONT }}>
            {schemaPath.split('.').pop()} — ID, [x,y], or ["id", dx, dy]
          </div>
          <input
            type="text"
            defaultValue={strVal}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                const v = (e.target as HTMLInputElement).value.trim();
                // Try to parse as JSON array, otherwise treat as string ID
                try {
                  const parsed = JSON.parse(v);
                  if (Array.isArray(parsed)) { onChange(parsed); return; }
                } catch { /* not JSON */ }
                onChange(v.replace(/^["']|["']$/g, ''));
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              width: '100%', padding: '4px 6px', fontSize: 11, fontFamily: FONT,
              background: '#0e1117', border: '1px solid #2a2d35', borderRadius: 4,
              color: '#e2e5ea', outline: 'none',
            }}
          />
        </div>
      );
      break;
    }
    default:
      return null;
  }

  return (
    <div
      ref={ref}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000,
        background: '#14161c',
        border: '1px solid #2a2d35',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        minWidth: 120,
      }}
    >
      <div style={{
        padding: '4px 8px', borderBottom: '1px solid #1a1d24',
        fontSize: 10, color: '#6b7280', fontFamily: FONT,
      }}>
        {schemaPath}
      </div>
      {content}
    </div>
  );
}
