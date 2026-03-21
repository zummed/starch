import { z } from 'zod';

// ─── Animation Schemas ──────────────────────────────────────────

export const EasingNameSchema = z.enum([
  'linear', 'easeIn', 'easeOut', 'easeInOut',
  'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
  'easeInQuart', 'easeOutQuart', 'easeInOutQuart',
  'easeInBack', 'easeOutBack',
  'bounce', 'elastic', 'spring',
  'snap', 'step',
]);

export const PropertyChangeSchema = z.object({
  value: z.unknown().describe('Target value'),
  easing: EasingNameSchema.describe('Per-property easing override').optional(),
});

export const KeyframeBlockSchema = z.object({
  time: z.number().min(0).describe('Absolute time (seconds)'),
  plus: z.number().describe('Relative time offset').optional(),
  delay: z.number().min(0).describe('Delay before this keyframe').optional(),
  easing: EasingNameSchema.describe('Block-level easing').optional(),
  autoKey: z.boolean().describe('Hold values between blocks').optional(),
  changes: z.record(z.string(), z.unknown()).describe('Property changes'),
});

export const ChapterSchema = z.object({
  name: z.string().describe('Chapter name'),
  time: z.number().min(0).describe('Chapter time (seconds)'),
});

export const AnimConfigSchema = z.object({
  duration: z.number().min(0).describe('Animation duration (seconds)'),
  loop: z.boolean().describe('Loop animation').optional(),
  autoKey: z.boolean().describe('Global autoKey default').optional(),
  easing: EasingNameSchema.describe('Global default easing').optional(),
  keyframes: z.array(KeyframeBlockSchema).describe('Keyframe blocks'),
  chapters: z.array(ChapterSchema).describe('Chapter markers').optional(),
});

export const TrackKeyframeSchema = z.object({
  time: z.number().min(0),
  value: z.unknown(),
  easing: EasingNameSchema,
});

// ─── Derived Types ──────────────────────────────────────────────

export type EasingName = z.infer<typeof EasingNameSchema>;
export type PropertyChange = z.infer<typeof PropertyChangeSchema>;
export type KeyframeBlock = z.infer<typeof KeyframeBlockSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type AnimConfig = z.infer<typeof AnimConfigSchema>;
export type TrackKeyframe = z.infer<typeof TrackKeyframeSchema>;
export type Tracks = Map<string, TrackKeyframe[]>;
