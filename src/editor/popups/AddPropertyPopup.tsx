import { useState, useEffect, useRef } from 'react';
import { getAvailableProperties, detectSchemaType, type PropertyDescriptor } from '../../types/schemaRegistry';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

const TYPE_ICONS: Record<string, string> = {
  number: '#',
  string: 'T',
  boolean: '?',
  enum: '≡',
  color: '●',
  object: '{}',
  array: '[]',
  unknown: '·',
};

interface AddPropertyPopupProps {
  schemaPath: string;
  existingKeys: string[];
  position: { x: number; y: number };
  onSelect: (name: string, defaultValue: unknown) => void;
  onClose: () => void;
}

function getDefaultValue(prop: PropertyDescriptor): unknown {
  const type = detectSchemaType(prop.schema);
  switch (type) {
    case 'number': return 0;
    case 'string': return '';
    case 'boolean': return false;
    case 'color': return { h: 210, s: 80, l: 50 };
    case 'object': return {};
    case 'array': return [];
    default: return null;
  }
}

export function AddPropertyPopup({ schemaPath, existingKeys, position, onSelect, onClose }: AddPropertyPopupProps) {
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const allProps = getAvailableProperties(schemaPath);
  const available = allProps
    .filter(p => !existingKeys.includes(p.name))
    .filter(p => !p.name.startsWith('_'))
    .filter(p => p.name !== 'id' && p.name !== 'children')
    .filter(p => !search || p.name.includes(search.toLowerCase()));

  // Group by category
  const categories = [...new Set(available.map(p => p.category))];

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000,
        background: '#14161c',
        border: '1px solid #2a2d35',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        minWidth: 200,
        maxHeight: 300,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '4px 8px', borderBottom: '1px solid #1a1d24' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search properties..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '4px', fontSize: 11, fontFamily: FONT,
            background: 'transparent', border: 'none', color: '#e2e5ea',
            outline: 'none',
          }}
        />
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {categories.map(cat => (
          <div key={cat}>
            <div style={{
              padding: '4px 8px', fontSize: 9, color: '#4a4f59',
              fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, fontFamily: FONT,
            }}>
              {cat}
            </div>
            {available.filter(p => p.category === cat).map(prop => {
              const type = detectSchemaType(prop.schema);
              return (
                <div
                  key={prop.name}
                  onClick={() => onSelect(prop.name, getDefaultValue(prop))}
                  style={{
                    padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 8,
                    cursor: 'pointer', fontSize: 11, fontFamily: FONT,
                    color: '#c9cdd4',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(167,139,250,0.06)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  <span style={{ color: '#4a4f59', fontSize: 10, width: 16, textAlign: 'center' }}>
                    {TYPE_ICONS[type] ?? '·'}
                  </span>
                  <span>{prop.name}</span>
                  {prop.description && (
                    <span style={{ color: '#3a3f49', fontSize: 9, marginLeft: 'auto' }}>
                      {prop.description}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {available.length === 0 && (
          <div style={{ padding: 12, fontSize: 11, color: '#4a4f59', textAlign: 'center', fontFamily: FONT }}>
            No properties available
          </div>
        )}
      </div>
    </div>
  );
}
