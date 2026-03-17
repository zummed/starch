import { useState, useCallback, useEffect, useRef } from 'react';
import { EXPORT_TARGETS } from '../editor/exporters';

const FONT = "'JetBrains Mono', 'Fira Code', monospace";

interface ExportDialogProps {
  dsl: string;
  onClose: () => void;
}

export function ExportDialog({ dsl, onClose }: ExportDialogProps) {
  const [activeTarget, setActiveTarget] = useState<string>(EXPORT_TARGETS[0].id);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const target = EXPORT_TARGETS.find(t => t.id === activeTarget) || EXPORT_TARGETS[0];
  const code = target.generate(dsl);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid the click that opened the dialog
    const id = setTimeout(() => window.addEventListener('mousedown', handler), 50);
    return () => { clearTimeout(id); window.removeEventListener('mousedown', handler); };
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div
        ref={dialogRef}
        style={{
          width: 640,
          maxHeight: '80vh',
          background: '#0e1117',
          border: '1px solid #2a2d35',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: FONT,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #1a1d24',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e5ea' }}>Export</span>
          <span
            onClick={onClose}
            style={{ fontSize: 18, color: '#4a4f59', cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </span>
        </div>

        {/* Target tabs */}
        <div style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid #1a1d24',
          background: '#0a0c10',
        }}>
          {EXPORT_TARGETS.map(t => (
            <div
              key={t.id}
              onClick={() => { setActiveTarget(t.id); setCopied(false); }}
              style={{
                padding: '8px 16px',
                fontSize: 11,
                cursor: 'pointer',
                color: t.id === activeTarget ? '#e2e5ea' : '#6b7280',
                background: t.id === activeTarget ? '#0e1117' : 'transparent',
                borderBottom: t.id === activeTarget ? '2px solid #a78bfa' : '2px solid transparent',
                userSelect: 'none',
              }}
            >
              {t.label}
            </div>
          ))}
        </div>

        {/* Code preview */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: 16,
          minHeight: 200,
          maxHeight: '50vh',
        }}>
          <pre style={{
            margin: 0,
            fontSize: 11,
            lineHeight: 1.6,
            color: '#b0b5be',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            {code}
          </pre>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid #1a1d24',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}>
          <button
            onClick={handleCopy}
            style={{
              padding: '6px 16px',
              fontSize: 11,
              fontFamily: FONT,
              borderRadius: 6,
              border: '1px solid #a78bfa',
              background: copied ? 'rgba(52, 211, 153, 0.1)' : 'rgba(167, 139, 250, 0.06)',
              color: copied ? '#34d399' : '#a78bfa',
              cursor: 'pointer',
            }}
          >
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
        </div>
      </div>
    </div>
  );
}
