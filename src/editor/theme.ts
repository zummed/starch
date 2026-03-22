import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export const starchTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#0a0c10',
      color: '#b0b5be',
      fontSize: '12px',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      height: '100%',
    },
    '.cm-content': {
      caretColor: '#22d3ee',
      lineHeight: '1.65',
      padding: '10px 0',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#22d3ee',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(167, 139, 250, 0.15) !important',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255, 255, 255, 0.03)',
    },
    '.cm-gutters': {
      backgroundColor: '#0a0c10',
      color: '#3a3f49',
      border: 'none',
      paddingRight: '8px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(255, 255, 255, 0.03)',
      color: '#5a5f69',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(167, 139, 250, 0.2)',
      outline: 'none',
    },
    '.cm-tooltip': {
      backgroundColor: '#141720',
      border: '1px solid #1a1d24',
      color: '#b0b5be',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li': {
        padding: '2px 8px',
      },
      '& > ul > li[aria-selected]': {
        backgroundColor: 'rgba(167, 139, 250, 0.15)',
        color: '#e2e5ea',
      },
    },
    '.cm-completionLabel': {
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: '12px',
    },
    '.cm-completionDetail': {
      fontStyle: 'normal',
      color: '#5a5f69',
      marginLeft: '8px',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
    // Dark scrollbars
    '& ::-webkit-scrollbar': {
      width: '8px',
      height: '8px',
    },
    '& ::-webkit-scrollbar-track': {
      background: 'transparent',
    },
    '& ::-webkit-scrollbar-thumb': {
      background: '#2a2d35',
      borderRadius: '4px',
    },
    '& ::-webkit-scrollbar-thumb:hover': {
      background: '#3a3f49',
    },
    '& ::-webkit-scrollbar-corner': {
      background: 'transparent',
    },
    // Lint diagnostics
    '.cm-diagnostic': {
      padding: '4px 8px',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: '11px',
    },
    '.cm-diagnostic-error': {
      borderLeft: '3px solid #ef4444',
    },
    '.cm-diagnostic-warning': {
      borderLeft: '3px solid #fbbf24',
    },
    '.cm-lintRange-error': {
      backgroundImage: 'none',
      backgroundColor: 'rgba(239, 68, 68, 0.15)',
    },
    '.cm-lintRange-warning': {
      backgroundImage: 'none',
      backgroundColor: 'rgba(251, 191, 36, 0.1)',
    },
    '.cm-lint-marker': {
      width: '8px !important',
      content: '"" !important',
    },
    '.cm-lint-marker-error': {
      content: '"" !important',
    },
    '.cm-lint-marker-error::after': {
      content: '"●"',
      color: '#ef4444',
      fontSize: '14px',
      lineHeight: '1',
    },
    '.cm-lint-marker-warning::after': {
      content: '"●"',
      color: '#fbbf24',
      fontSize: '14px',
      lineHeight: '1',
    },
    '.cm-gutter-lint': {
      width: '14px',
    },
    '.cm-panel.cm-panel-lint': {
      backgroundColor: '#141720',
      borderTop: '1px solid #1a1d24',
    },
    '.cm-panel.cm-panel-lint ul [aria-selected]': {
      backgroundColor: 'rgba(167, 139, 250, 0.15)',
    },
  },
  { dark: true },
);

export const starchHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.string, color: '#98c379' },
    { tag: tags.special(tags.string), color: '#98c379' },
    { tag: tags.literal, color: '#98c379' },
    { tag: tags.number, color: '#a78bfa' },
    { tag: tags.bool, color: '#f472b6' },
    { tag: tags.null, color: '#f472b6' },
    { tag: tags.propertyName, color: '#61afef' },
    { tag: tags.special(tags.propertyName), color: '#61afef' },
    { tag: tags.comment, color: '#4a4f59' },
    { tag: tags.punctuation, color: '#5a5f69' },
  ]),
);
