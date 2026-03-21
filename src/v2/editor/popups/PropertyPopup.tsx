import { useEffect, useRef } from 'react';
import { detectSchemaType, getEnumValues, getNumberConstraints, getPropertySchema } from '../../types/schemaRegistry';
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

export function PropertyPopup({ schemaPath, value, position, onChange, onClose }: PropertyPopupProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside — delayed to avoid catching the click that opened us
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Add listener on next frame so the opening click doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const schema = getPropertySchema(schemaPath);
  if (!schema) return null;

  const type = detectSchemaType(schema);

  let content: React.ReactNode = null;

  switch (type) {
    case 'color': {
      const colorVal = (value as { h: number; s: number; l: number }) ?? { h: 210, s: 80, l: 50 };
      content = <ColorPicker value={colorVal} onChange={onChange} />;
      break;
    }
    case 'number': {
      const constraints = getNumberConstraints(schema);
      content = (
        <NumberSlider
          value={(value as number) ?? 0}
          min={constraints?.min ?? 0}
          max={constraints?.max ?? 1000}
          step={constraints?.max && constraints.max <= 1 ? 0.01 : 1}
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
    default:
      return null;
  }

  return (
    <div
      ref={ref}
      onMouseDown={(e) => e.stopPropagation()}
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
