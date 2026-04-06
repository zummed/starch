# Responsive UI

**Date**: 2026-03-21
**Status**: Draft
**Branch**: feat/animatable-styles
**Depends on**: V2 Dev App (src/v2/app/)

## Overview

Make the v2 playground work well on phone, tablet, and desktop. One responsive layout with push-panels, plus a phone-specific tab mode. Users can override the default layout mode; their choice persists.

## Layout Modes

### Panel Mode (default for tablet + desktop)

The current side-by-side layout with sliding push-panels:

- **Samples panel**: slides in/out from the left, pushes the canvas
- **Editor panel**: slides in/out from the left (after samples), pushes the canvas
- **Canvas**: always visible, fills remaining space
- **Timeline**: always visible at the bottom

Panels have CSS transition on width for smooth slide animation. Toggled via header buttons.

**Default visibility by screen width:**
- Desktop (>1024px): samples + editor both open
- Tablet (768-1024px): both closed, canvas fills the space

### Tab Mode (default for phone)

Two-tab layout:

- **Tab 1 — Canvas**: diagram canvas with timeline at the bottom
- **Tab 2 — Editor**: code editor with a "Samples" button that opens the sample list inline (as a collapsible section within the editor tab, not a separate panel)

Bottom tab bar with two tabs. One panel fills the screen at a time.

### Layout Mode Toggle

A toggle in the header switches between panel mode and tab mode. Defaults are set by screen width on first visit, but the user's choice is persisted in localStorage. If a user selects tab mode on desktop (or panel mode on phone), it sticks.

If the user picks panel mode on a very small screen and the panels don't fit, the panels still push — the canvas will just be very narrow. The user can switch back to tab mode via the header toggle at any time.

## Touch & Sizing Adjustments

- Header buttons: minimum 44px touch target on screens <1024px
- Panel resize handle: wider hit area (12px instead of 5px) on touch devices
- Tab bar on phone: 48px tall, icons + labels
- Timeline scrubber: larger thumb (20px) on touch devices

## Persistence

All UI state persisted in localStorage (same `starch-prefs` key as current):

- `layoutMode`: `'panel' | 'tab'` — user's explicit choice (or `null` for auto-detect)
- `showBrowser`: boolean
- `showEditor`: boolean
- `editorWidth`: number

## Implementation

### Changes to App.tsx

1. Add `layoutMode` state (`'panel' | 'tab' | null`) — `null` means auto-detect from window width
2. Add `useEffect` that reads `window.innerWidth` on mount and sets default mode if `layoutMode` is null
3. Add `useEffect` with `ResizeObserver` or `matchMedia` listener to update auto-detect when window resizes (only when layoutMode is null)
4. Conditionally render panel layout or tab layout based on resolved mode
5. Add layout toggle button to header
6. Add CSS transitions to panel containers: `transition: width 0.2s ease, margin 0.2s ease`
7. Persist layoutMode in localStorage prefs

### Tab Mode Component

A simple wrapper:

```tsx
function TabLayout({ diagram, dsl, onDslChange, samples, ... }) {
  const [activeTab, setActiveTab] = useState<'canvas' | 'editor'>('canvas');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'canvas' && <CanvasPanel ... />}
        {activeTab === 'editor' && <EditorPanel ... />}
      </div>
      {activeTab === 'canvas' && <Timeline ... />}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
```

### Files Modified

- `src/v2/app/App.tsx` — layout mode state, conditional rendering, CSS transitions, touch targets
- `src/v2/app/components/TabLayout.tsx` — new: phone tab mode

### Files Unchanged

- V2Diagram, V2SampleBrowser, Timeline, Editor — these are content components, they don't know about layout mode
