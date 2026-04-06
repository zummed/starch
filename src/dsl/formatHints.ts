export interface FormatHints {
  nodes: Record<string, NodeFormat>;
}

export interface NodeFormat {
  display: 'inline' | 'block';
}

export function emptyFormatHints(): FormatHints {
  return { nodes: {} };
}
