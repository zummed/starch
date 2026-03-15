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
  },
  { dark: true },
);

export const starchHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.string, color: '#22d3ee' },
    { tag: tags.number, color: '#a78bfa' },
    { tag: tags.bool, color: '#f472b6' },
    { tag: tags.null, color: '#f472b6' },
    { tag: tags.propertyName, color: '#34d399' },
    { tag: tags.comment, color: '#3a3f49' },
    { tag: tags.punctuation, color: '#5a5f69' },
  ]),
);
