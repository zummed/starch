import { useEffect, useRef, useCallback, useState } from 'react';
import {
  detectSchemaType, getEnumValues, getNumberConstraints, getPropertySchema,
  getAvailableProperties, getSchemaDefault, isOptional, type PropertyDescriptor, type SchemaType,
} from '../../types/schemaRegistry';
import { ColorPicker } from './ColorPicker';
import { NumberSlider } from './NumberSlider';
import { EnumDropdown } from './EnumDropdown';
import { PointRefEditor } from './PointRefEditor';
import { AnchorEditor } from './AnchorEditor';
import type { Color } from '../../types/properties';
import type { SchemaSection } from '../schemaSpan';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

const TYPE_ICONS: Record<string, string> = {
  number: '#',
  string: 'T',
  boolean: '?',
  enum: '\u2261',
  color: '\u25CF',
  object: '{}',
  array: '[]',
  record: '{}',
  pointref: '\u25CE',
  anchor: '\u2295',
  unknown: '\u00B7',
};

const stop = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation();

/** Properties filtered from compound editors (identity/structural). */
const EXCLUDED_PROPS = new Set(['id', 'children']);

/** Geometry types -- mutually exclusive per node. */
const GEOMETRY_PROPS = new Set(['rect', 'ellipse', 'text', 'path', 'image', 'camera']);

// --- Value summaries for compact compound rows ---

function getValueSummary(value: unknown, type: SchemaType): string {
  if (value == null) return '';
  if (type === 'color') {
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      const v = value as Record<string, unknown>;
      if ('name' in v) return String(v.name);
      if ('hex' in v) return String(v.hex);
      if ('h' in v) return `hsl(${v.h}, ${v.s}, ${v.l})`;
      if ('r' in v) return `rgb(${v.r}, ${v.g}, ${v.b})`;
    }
    return '';
  }
  if (type === 'object' && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if ('w' in v && 'h' in v && !('content' in v)) return `${v.w} \u00D7 ${v.h}`;
    if ('rx' in v && 'ry' in v) return `${v.rx} \u00D7 ${v.ry}`;
    if ('content' in v) return String(v.content).slice(0, 20);
    if ('color' in v) {
      const c = v.color;
      if (typeof c === 'string') return c;
    }
    const keys = Object.keys(v);
    if (keys.length > 3) return `${keys.length} props`;
    return keys.join(', ');
  }
  return '';
}

// --- Per-property widget renderer ---

function renderScalarWidget(
  prop: PropertyDescriptor,
  value: unknown,
  onChange: (v: unknown) => void,
): React.ReactNode {
  const type = detectSchemaType(prop.schema);

  switch (type) {
    case 'number': {
      const constraints = getNumberConstraints(prop.schema);
      const hasRange = constraints?.min !== undefined && constraints?.max !== undefined;
      const range = hasRange ? (constraints!.max! - constraints!.min!) : 100;
      const step = range <= 1 ? 0.01 : range <= 20 ? 0.5 : 1;
      return (
        <NumberSlider
          value={(value as number) ?? 0}
          min={constraints?.min}
          max={constraints?.max}
          step={step}
          label={prop.name}
          onChange={onChange}
        />
      );
    }
    case 'boolean':
      return (
        <div style={{ padding: '4px 8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={value as boolean ?? false}
              onChange={(e) => onChange(e.target.checked)}
            />
            <span style={{ fontSize: 11, fontFamily: FONT, color: '#c9cdd4' }}>
              {prop.name}
            </span>
          </label>
        </div>
      );
    case 'enum': {
      const options = getEnumValues(prop.schema);
      if (!options) return null;
      return (
        <div style={{ padding: '4px 8px' }}>
          <div style={{ fontSize: 10, color: '#6b7280', fontFamily: FONT, marginBottom: 2 }}>{prop.name}</div>
          <EnumDropdown
            value={(value as string) ?? options[0]}
            options={options}
            onChange={onChange}
          />
        </div>
      );
    }
    case 'string':
      return (
        <div style={{ padding: '4px 8px' }}>
          <div style={{ fontSize: 10, color: '#6b7280', fontFamily: FONT, marginBottom: 2 }}>{prop.name}</div>
          <input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            onMouseDown={stop}
            onPointerDown={stop}
            style={{
              width: '100%', padding: '4px 6px', fontSize: 11, fontFamily: FONT,
              background: '#0e1117', border: '1px solid #2a2d35', borderRadius: 4,
              color: '#e2e5ea', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
      );
    case 'pointref':
      return (
        <div style={{ padding: '4px 8px' }}>
          <div style={{ fontSize: 10, color: '#6b7280', fontFamily: FONT, marginBottom: 2 }}>{prop.name}</div>
          <PointRefEditor value={value} onChange={onChange} />
        </div>
      );
    case 'anchor':
      return (
        <div style={{ padding: '4px 8px' }}>
          <div style={{ fontSize: 10, color: '#6b7280', fontFamily: FONT, marginBottom: 2 }}>{prop.name}</div>
          <AnchorEditor value={value} onChange={onChange} />
        </div>
      );
    default:
      return null;
  }
}

// --- Remove button ---

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      onMouseDown={stop}
      onPointerDown={stop}
      style={{
        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
        color: '#ef4444', cursor: 'pointer', fontSize: 11,
        width: 20, height: 20, padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: FONT, flexShrink: 0, lineHeight: 1, borderRadius: 3,
      }}
      title="Remove property"
    >\u00D7</button>
  );
}

// --- Compact compound row (for compound sub-properties at node level) ---

function CompactRow({ prop, value, onRemove, inactive, onClick }: {
  prop: PropertyDescriptor;
  value: unknown;
  onRemove?: () => void;
  inactive?: boolean;
  onClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const type = detectSchemaType(prop.schema);
  return (
    <div
      onClick={onClick}
      onMouseEnter={onClick ? () => setHovered(true) : undefined}
      onMouseLeave={onClick ? () => setHovered(false) : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 8px', fontSize: 11, fontFamily: FONT,
        color: inactive ? '#6b7280' : '#c9cdd4',
        opacity: inactive ? 0.8 : 1,
        cursor: onClick ? 'pointer' : undefined,
        background: hovered ? 'rgba(167, 139, 250, 0.06)' : undefined,
        borderRadius: 4,
      }}
    >
      <span style={{ color: '#4a4f59', fontSize: 10, width: 16, textAlign: 'center', flexShrink: 0 }}>
        {TYPE_ICONS[type] ?? '\u00B7'}
      </span>
      <span style={{ flexShrink: 0 }}>{prop.name}</span>
      {!inactive && value != null && (
        <span style={{
          color: '#6b7280', fontSize: 10, flex: 1, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right',
        }}>
          {getValueSummary(value, type)}
        </span>
      )}
      {inactive && <span style={{ flex: 1 }} />}
      {onRemove && <RemoveButton onClick={onRemove} />}
      {onClick && (
        <span style={{ color: '#4a4f59', fontSize: 10, flexShrink: 0 }}>\u203A</span>
      )}
    </div>
  );
}

// --- Scalar property row with inline widget ---

function ScalarRow({ prop, value, onChange, onRemove, inactive }: {
  prop: PropertyDescriptor;
  value: unknown;
  onChange: (v: unknown) => void;
  onRemove?: () => void;
  inactive?: boolean;
}) {
  const defaultVal = getSchemaDefault(prop.schema);
  const displayValue = value ?? defaultVal;

  return (
    <div style={{ opacity: inactive ? 0.6 : 1, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {renderScalarWidget(prop, displayValue, onChange)}
      </div>
      {onRemove && (
        <div style={{ paddingRight: 4, paddingBottom: 6 }}>
          <RemoveButton onClick={onRemove} />
        </div>
      )}
    </div>
  );
}

// --- Separator ---

function Separator() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '4px 8px', color: '#3a3f49', fontSize: 9,
      fontFamily: FONT, textTransform: 'uppercase', letterSpacing: 1,
    }}>
      <div style={{ flex: 1, height: 1, background: '#2a2d35' }} />
      <span>inactive</span>
      <div style={{ flex: 1, height: 1, background: '#2a2d35' }} />
    </div>
  );
}

// --- Compound Editor (simplified with direct model bindings) ---

/** Animate a newly promoted row sliding into the active section. */
const slideInRef = (el: HTMLDivElement | null) => {
  if (el) {
    el.animate([
      { transform: 'translateY(16px)', opacity: 0 },
      { transform: 'translateY(0)', opacity: 1 },
    ], { duration: 300, easing: 'ease-out' });
  }
};

/** Compound editor with direct model bindings per widget. */
function CompoundEditor({ schemaPath, modelPath, onPropertyChange, readValue, onDescend }: {
  schemaPath: string;
  modelPath: string;
  onPropertyChange: (path: string, value: unknown) => void;
  readValue: (path: string) => unknown;
  onDescend?: (key: string) => void;
}) {
  const modelValue = (readValue(modelPath) as Record<string, unknown>) ?? {};

  // Snapshot active keys on mount.
  const [activeKeys, setActiveKeys] = useState<Set<string>>(
    () => new Set(Object.keys(modelValue)),
  );

  // Promotion: inactive -> active on pointer release after interaction
  const pendingPromotions = useRef<Set<string>>(new Set());
  const promoteDelay = useRef<ReturnType<typeof setTimeout>>(undefined);
  const upHandler = useRef<(() => void) | null>(null);
  const [justPromoted, setJustPromoted] = useState<Set<string>>(new Set());
  const activeKeysRef = useRef(activeKeys);
  activeKeysRef.current = activeKeys;

  const doPromote = useCallback(() => {
    if (pendingPromotions.current.size === 0) return;
    const toPromote = new Set(pendingPromotions.current);
    pendingPromotions.current.clear();
    setActiveKeys(prev => new Set([...prev, ...toPromote]));
    setJustPromoted(toPromote);
    setTimeout(() => setJustPromoted(new Set()), 400);
  }, []);

  useEffect(() => () => {
    if (promoteDelay.current) clearTimeout(promoteDelay.current);
    if (upHandler.current) document.removeEventListener('pointerup', upHandler.current, true);
  }, []);

  const allProps = getAvailableProperties(schemaPath);
  const existingGeom = Object.keys(modelValue).find(k => GEOMETRY_PROPS.has(k));
  const editableProps = allProps.filter(p => {
    if (EXCLUDED_PROPS.has(p.name)) return false;
    if (existingGeom && GEOMETRY_PROPS.has(p.name) && p.name !== existingGeom) return false;
    return true;
  });

  const activeProps = editableProps.filter(p => activeKeys.has(p.name));
  const inactiveProps = editableProps.filter(p => !activeKeys.has(p.name));

  const handleChange = useCallback((key: string, newVal: unknown) => {
    const propPath = `${modelPath}.${key}`;
    onPropertyChange(propPath, newVal);

    // If this is an inactive property, promote after interaction ends.
    if (!activeKeysRef.current.has(key)) {
      pendingPromotions.current.add(key);
      if (promoteDelay.current) clearTimeout(promoteDelay.current);

      if (!upHandler.current) {
        const onUp = () => {
          document.removeEventListener('pointerup', onUp, true);
          upHandler.current = null;
          if (promoteDelay.current) clearTimeout(promoteDelay.current);
          promoteDelay.current = setTimeout(doPromote, 150);
        };
        upHandler.current = onUp;
        document.addEventListener('pointerup', onUp, true);
      }

      promoteDelay.current = setTimeout(() => {
        if (upHandler.current) {
          document.removeEventListener('pointerup', upHandler.current, true);
          upHandler.current = null;
        }
        doPromote();
      }, 300);
    }
  }, [modelPath, onPropertyChange, doPromote]);

  const handleRemove = useCallback((key: string) => {
    setActiveKeys(prev => { const next = new Set(prev); next.delete(key); return next; });
    const propPath = `${modelPath}.${key}`;
    onPropertyChange(propPath, undefined);
  }, [modelPath, onPropertyChange]);

  if (editableProps.length === 0) return null;

  const renderRow = (prop: PropertyDescriptor, inactive?: boolean) => {
    const type = detectSchemaType(prop.schema);
    const isCompound = type === 'object' || type === 'color' || type === 'array' || type === 'record';
    const canRemove = !inactive && !prop.required;
    const animated = justPromoted.has(prop.name);
    const propPath = `${modelPath}.${prop.name}`;
    const value = readValue(propPath);

    if (isCompound) {
      return (
        <div key={prop.name} ref={animated ? slideInRef : undefined}>
          <CompactRow
            prop={prop}
            value={value}
            onRemove={canRemove ? () => handleRemove(prop.name) : undefined}
            inactive={inactive}
            onClick={onDescend ? () => onDescend(prop.name) : undefined}
          />
        </div>
      );
    }

    return (
      <div key={prop.name} ref={animated ? slideInRef : undefined}>
        <ScalarRow
          prop={prop}
          value={value}
          onChange={(v) => handleChange(prop.name, v)}
          onRemove={canRemove ? () => handleRemove(prop.name) : undefined}
          inactive={inactive}
        />
      </div>
    );
  };

  return (
    <div onMouseDown={stop} onPointerDown={stop} style={{ maxHeight: 400, overflowY: 'auto' }}>
      {activeProps.map(p => renderRow(p))}
      {activeProps.length > 0 && inactiveProps.length > 0 && <Separator />}
      {inactiveProps.map(p => renderRow(p, true))}
    </div>
  );
}

// --- PropertyPopup ---

interface PropertyPopupProps {
  schemaPath: string;
  modelPath: string;
  section: SchemaSection;
  position: { x: number; y: number };
  initialFocusKey?: string;
  /** Called per-widget with the specific property's full model path and new value. */
  onPropertyChange: (modelPath: string, value: unknown) => void;
  /** Read the current value for a model path from the model. */
  readValue: (modelPath: string) => unknown;
  onClose: () => void;
}

export function PropertyPopup({
  schemaPath, modelPath, section: _section, position, initialFocusKey,
  onPropertyChange, readValue, onClose,
}: PropertyPopupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [navStack, setNavStack] = useState<string[]>([]);

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

  // Scroll initialFocusKey into view
  useEffect(() => {
    if (!initialFocusKey || !ref.current) return;
    const timer = setTimeout(() => {
      const label = ref.current?.querySelector(`[data-prop-key="${initialFocusKey}"]`);
      label?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(timer);
  }, [initialFocusKey]);

  // Derive effective schema path and model path based on navigation stack
  const effectiveSchemaPath = navStack.length > 0
    ? [schemaPath, ...navStack].filter(Boolean).join('.')
    : schemaPath;

  const effectiveModelPath = navStack.length > 0
    ? [modelPath, ...navStack].join('.')
    : modelPath;

  const effectiveSchema = getPropertySchema(effectiveSchemaPath);

  const handleDescend = useCallback((key: string) => {
    setNavStack(prev => [...prev, key]);
  }, []);

  // If navigated schema doesn't resolve, pop back (after all hooks)
  if (!effectiveSchema) {
    if (navStack.length > 0) {
      setTimeout(() => setNavStack(prev => prev.slice(0, -1)), 0);
    }
    return null;
  }

  const effectiveType = detectSchemaType(effectiveSchema);

  let content: React.ReactNode = null;

  switch (effectiveType) {
    case 'color': {
      const colorVal = (readValue(effectiveModelPath) ?? 'red') as Color;
      content = (
        <div onMouseDown={stop} onPointerDown={stop}>
          <ColorPicker value={colorVal} onChange={(v) => onPropertyChange(effectiveModelPath, v)} />
        </div>
      );
      break;
    }
    case 'object': {
      content = (
        <CompoundEditor
          key={effectiveSchemaPath}
          schemaPath={effectiveSchemaPath}
          modelPath={effectiveModelPath}
          onPropertyChange={onPropertyChange}
          readValue={readValue}
          onDescend={handleDescend}
        />
      );
      break;
    }
    case 'number': {
      const constraints = getNumberConstraints(effectiveSchema);
      const hasRange = constraints?.min !== undefined && constraints?.max !== undefined;
      const range = hasRange ? (constraints!.max! - constraints!.min!) : 100;
      const step = range <= 1 ? 0.01 : range <= 20 ? 0.5 : 1;
      const numVal = readValue(effectiveModelPath);
      content = (
        <NumberSlider
          value={(numVal as number) ?? 0}
          min={constraints?.min}
          max={constraints?.max}
          step={step}
          label={effectiveSchemaPath.split('.').pop()}
          onChange={(v) => onPropertyChange(effectiveModelPath, v)}
        />
      );
      break;
    }
    case 'enum': {
      const options = getEnumValues(effectiveSchema);
      if (options) {
        const enumVal = readValue(effectiveModelPath);
        content = (
          <EnumDropdown
            value={(enumVal as string) ?? options[0]}
            options={options}
            onChange={(v) => onPropertyChange(effectiveModelPath, v)}
          />
        );
      }
      break;
    }
    case 'boolean': {
      const boolVal = readValue(effectiveModelPath);
      content = (
        <div style={{ padding: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={boolVal as boolean ?? false}
              onChange={(e) => onPropertyChange(effectiveModelPath, e.target.checked)}
            />
            <span style={{ fontSize: 11, fontFamily: FONT, color: '#c9cdd4' }}>
              {effectiveSchemaPath.split('.').pop()}
            </span>
          </label>
        </div>
      );
      break;
    }
    case 'pointref': {
      const prVal = readValue(effectiveModelPath);
      content = <PointRefEditor value={prVal} onChange={(v) => onPropertyChange(effectiveModelPath, v)} />;
      break;
    }
    case 'anchor': {
      const ancVal = readValue(effectiveModelPath);
      content = <AnchorEditor value={ancVal} onChange={(v) => onPropertyChange(effectiveModelPath, v)} />;
      break;
    }
    case 'string': {
      const strVal = readValue(effectiveModelPath);
      content = (
        <div style={{ padding: '4px 8px' }}>
          <div style={{ fontSize: 10, color: '#6b7280', fontFamily: FONT, marginBottom: 2 }}>
            {effectiveSchemaPath.split('.').pop()}
          </div>
          <input
            type="text"
            value={(strVal as string) ?? ''}
            onChange={(e) => onPropertyChange(effectiveModelPath, e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            onMouseDown={stop}
            onPointerDown={stop}
            style={{
              width: '100%', padding: '4px 6px', fontSize: 11, fontFamily: FONT,
              background: '#0e1117', border: '1px solid #2a2d35', borderRadius: 4,
              color: '#e2e5ea', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
      );
      break;
    }
    default:
      return null;
  }

  // Build breadcrumb segments
  const rootLabel = schemaPath.split('.').pop() || 'node';
  const breadcrumbSegments = [rootLabel, ...navStack];

  return (
    <div
      ref={ref}
      onMouseDown={stop}
      onPointerDown={stop}
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
        minWidth: effectiveType === 'object' ? 260 : 120,
      }}
    >
      <div style={{
        padding: '4px 8px', borderBottom: '1px solid #1a1d24',
        fontSize: 10, color: '#6b7280', fontFamily: FONT,
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {navStack.length > 0 && (
          <span
            onClick={() => setNavStack(prev => prev.slice(0, -1))}
            style={{ cursor: 'pointer', color: '#a78bfa', marginRight: 2 }}
            title="Go back"
          >{'\u2190'}</span>
        )}
        {breadcrumbSegments.map((seg, i) => {
          const isLast = i === breadcrumbSegments.length - 1;
          const clickable = !isLast && navStack.length > 0;
          return (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ color: '#3a3f49' }}>{'\u203A'}</span>}
              <span
                onClick={clickable ? () => setNavStack(navStack.slice(0, i)) : undefined}
                style={{
                  cursor: clickable ? 'pointer' : undefined,
                  color: clickable ? '#a78bfa' : '#6b7280',
                }}
              >
                {seg}
              </span>
            </span>
          );
        })}
      </div>
      {content}
    </div>
  );
}
