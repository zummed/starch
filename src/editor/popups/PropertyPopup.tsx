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

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

const TYPE_ICONS: Record<string, string> = {
  number: '#',
  string: 'T',
  boolean: '?',
  enum: '≡',
  color: '●',
  object: '{}',
  array: '[]',
  record: '{}',
  pointref: '◎',
  anchor: '⊕',
  unknown: '·',
};

const stop = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation();

/** Properties filtered from compound editors (identity/structural). */
const EXCLUDED_PROPS = new Set(['id', 'children']);

// ─── Value summaries for compact compound rows ────────────────────

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
    if ('w' in v && 'h' in v && !('content' in v)) return `${v.w} × ${v.h}`;
    if ('rx' in v && 'ry' in v) return `${v.rx} × ${v.ry}`;
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

// ─── Per-property widget renderer ──────────────────────────────────

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

// ─── Remove button ─────────────────────────────────────────────────

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
    >×</button>
  );
}

// ─── Compact compound row (for compound sub-properties at node level) ─

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
        {TYPE_ICONS[type] ?? '·'}
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
        <span style={{ color: '#4a4f59', fontSize: 10, flexShrink: 0 }}>›</span>
      )}
    </div>
  );
}

// ─── Scalar property row with inline widget ────────────────────────

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

// ─── Separator ─────────────────────────────────────────────────────

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

// ─── Compound Editor ───────────────────────────────────────────────

/** Animate a newly promoted row sliding into the active section. */
const slideInRef = (el: HTMLDivElement | null) => {
  if (el) {
    el.animate([
      { transform: 'translateY(16px)', opacity: 0 },
      { transform: 'translateY(0)', opacity: 1 },
    ], { duration: 300, easing: 'ease-out' });
  }
};

/** Compound editor with active/inactive property separation and remove buttons. */
function CompoundEditor({ schemaPath, value, onChange, onDescend }: {
  schemaPath: string;
  value: Record<string, unknown>;
  onChange: (value: unknown) => void;
  onDescend?: (key: string) => void;
}) {
  // Snapshot active keys on mount.
  // Removal updates immediately; promotion is debounced after interaction ends.
  const [activeKeys, setActiveKeys] = useState<Set<string>>(
    () => new Set(Object.keys(value ?? {})),
  );

  // Keep refs for latest values to avoid stale closures during fast slider drags
  const valueRef = useRef(value);
  valueRef.current = value;
  const activeKeysRef = useRef(activeKeys);
  activeKeysRef.current = activeKeys;

  // Promotion: inactive → active on pointer release after interaction
  const pendingPromotions = useRef<Set<string>>(new Set());
  const promoteDelay = useRef<ReturnType<typeof setTimeout>>(undefined);
  const upHandler = useRef<(() => void) | null>(null);
  const [justPromoted, setJustPromoted] = useState<Set<string>>(new Set());

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
  const editableProps = allProps.filter(p => !EXCLUDED_PROPS.has(p.name));

  const activeProps = editableProps.filter(p => activeKeys.has(p.name));
  const inactiveProps = editableProps.filter(p => !activeKeys.has(p.name));

  const handleChange = useCallback((key: string, newVal: unknown) => {
    onChange({ ...valueRef.current, [key]: newVal });

    // If this is an inactive property, promote after interaction ends.
    if (!activeKeysRef.current.has(key)) {
      pendingPromotions.current.add(key);
      // Clear any pending fallback timer (slider drags reset it on each change)
      if (promoteDelay.current) clearTimeout(promoteDelay.current);

      // Listen for pointer release (capture phase — slider stopPropagation can't block it)
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

      // Fallback: for single-click interactions (checkbox, enum, anchor button)
      // where pointerup already fired before this handler ran
      promoteDelay.current = setTimeout(() => {
        if (upHandler.current) {
          document.removeEventListener('pointerup', upHandler.current, true);
          upHandler.current = null;
        }
        doPromote();
      }, 300);
    }
  }, [onChange, doPromote]);

  const handleRemove = useCallback((key: string) => {
    setActiveKeys(prev => { const next = new Set(prev); next.delete(key); return next; });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [key]: _, ...rest } = valueRef.current;
    onChange(rest);
  }, [onChange]);

  if (editableProps.length === 0) return null;

  const renderRow = (prop: PropertyDescriptor, inactive?: boolean) => {
    const type = detectSchemaType(prop.schema);
    const isCompound = type === 'object' || type === 'color' || type === 'array' || type === 'record';
    const canRemove = !inactive && !prop.required;
    const animated = justPromoted.has(prop.name);

    if (isCompound) {
      return (
        <div key={prop.name} ref={animated ? slideInRef : undefined}>
          <CompactRow
            prop={prop}
            value={value[prop.name]}
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
          value={value[prop.name]}
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

// ─── PropertyPopup ─────────────────────────────────────────────────

interface PropertyPopupProps {
  schemaPath: string;
  value: unknown;
  position: { x: number; y: number };
  onChange: (value: unknown) => void;
  onClose: () => void;
}

export function PropertyPopup({ schemaPath, value, position, onChange, onClose }: PropertyPopupProps) {
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

  // Derive effective schema path and value based on navigation stack
  const effectiveSchemaPath = navStack.length > 0
    ? [schemaPath, ...navStack].filter(Boolean).join('.')
    : schemaPath;

  let effectiveValue: unknown = value;
  for (const key of navStack) {
    effectiveValue = (effectiveValue as Record<string, unknown>)?.[key];
  }

  const effectiveSchema = getPropertySchema(effectiveSchemaPath);

  // Wrap onChange to reconstruct root value when navigated into a child
  const wrappedOnChange = navStack.length > 0
    ? (newChildValue: unknown) => {
        const rootValue = (value as Record<string, unknown>) ?? {};
        let result: Record<string, unknown> = { ...rootValue };
        let current = result;
        for (let i = 0; i < navStack.length - 1; i++) {
          const copy = { ...(current[navStack[i]] as Record<string, unknown> ?? {}) };
          current[navStack[i]] = copy;
          current = copy;
        }
        current[navStack[navStack.length - 1]] = newChildValue;
        onChange(result);
      }
    : onChange;

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
      const colorVal = (effectiveValue ?? 'red') as Color;
      content = (
        <div onMouseDown={stop} onPointerDown={stop}>
          <ColorPicker value={colorVal} onChange={wrappedOnChange} />
        </div>
      );
      break;
    }
    case 'object': {
      const objVal = (effectiveValue as Record<string, unknown>) ?? {};
      content = (
        <CompoundEditor
          key={effectiveSchemaPath}
          schemaPath={effectiveSchemaPath}
          value={objVal}
          onChange={wrappedOnChange}
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
      content = (
        <NumberSlider
          value={(effectiveValue as number) ?? 0}
          min={constraints?.min}
          max={constraints?.max}
          step={step}
          label={effectiveSchemaPath.split('.').pop()}
          onChange={wrappedOnChange}
        />
      );
      break;
    }
    case 'enum': {
      const options = getEnumValues(effectiveSchema);
      if (options) {
        content = (
          <EnumDropdown
            value={(effectiveValue as string) ?? options[0]}
            options={options}
            onChange={wrappedOnChange}
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
              checked={effectiveValue as boolean ?? false}
              onChange={(e) => wrappedOnChange(e.target.checked)}
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
      content = <PointRefEditor value={effectiveValue} onChange={wrappedOnChange} />;
      break;
    }
    case 'anchor': {
      content = <AnchorEditor value={effectiveValue} onChange={wrappedOnChange} />;
      break;
    }
    case 'string': {
      content = (
        <div style={{ padding: '4px 8px' }}>
          <div style={{ fontSize: 10, color: '#6b7280', fontFamily: FONT, marginBottom: 2 }}>
            {effectiveSchemaPath.split('.').pop()}
          </div>
          <input
            type="text"
            value={(effectiveValue as string) ?? ''}
            onChange={(e) => wrappedOnChange(e.target.value)}
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
          >←</span>
        )}
        {breadcrumbSegments.map((seg, i) => {
          const isLast = i === breadcrumbSegments.length - 1;
          const clickable = !isLast && navStack.length > 0;
          return (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ color: '#3a3f49' }}>›</span>}
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
