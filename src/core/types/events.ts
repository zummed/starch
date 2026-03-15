import type { Chapter } from './animation';

// ─── Events ─────────────────────────────────────────────────────

export type StarchEventType =
  | 'chapterEnter'
  | 'chapterExit'
  | 'animationEnd'
  | 'animationLoop';

export interface StarchEvent {
  type: StarchEventType;
  chapter?: Chapter;
  time: number;
}

export type StarchEventHandler = (event: StarchEvent) => void;

// ─── Diagram Component Props ────────────────────────────────────

export interface DiagramHandle {
  play(): void;
  pause(): void;
  seek(time: number): void;
  nextChapter(): void;
  prevChapter(): void;
  goToChapter(id: string): void;
}
