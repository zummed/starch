import { z } from 'zod';
import { dsl } from '../dsl/dslMeta';

// ─── Animation Schemas ──────────────────────────────────────────

export const EasingNameSchema = z.enum([
  'linear', 'easeIn', 'easeOut', 'easeInOut',
  'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
  'easeInQuart', 'easeOutQuart', 'easeInOutQuart',
  'easeInBack', 'easeOutBack',
  'bounce', 'elastic', 'spring',
  'snap', 'step',
]).describe('Easing function name (string)');

export const PropertyChangeSchema = z.object({
  value: z.union([z.number(), z.string(), z.boolean()]).describe('Target property value (number, string, or boolean)'),
  easing: EasingNameSchema.describe('Per-property easing override (EasingName)').optional(),
});

export const ChangeValueSchema = z.union([
  z.number().describe('Direct numeric value'),
  z.string().describe('Direct string value'),
  z.boolean().describe('Direct boolean value'),
  z.array(z.unknown()).describe('Array value for multi-element properties like route'),
  PropertyChangeSchema.describe('Value with per-property easing { value, easing? }'),
  z.record(z.string(), z.unknown()).describe('Sub-object shorthand (e.g., fill: { h: 180, s: 50, l: 60 })'),
]);

export const KeyframeBlockSchema = dsl(z.object({
  time: z.number().min(0).describe('Absolute time in seconds (number, >= 0)'),
  plus: z.number().describe('Relative time offset added to previous keyframe time (number)').optional(),
  delay: z.number().min(0).describe('Delay before this keyframe starts in seconds (number, >= 0)').optional(),
  easing: EasingNameSchema.describe('Default easing for all changes in this block (EasingName)').optional(),
  autoKey: z.boolean().describe('When true, hold property values between keyframe blocks (boolean)').optional(),
  changes: z.record(z.string(), ChangeValueSchema).describe('Property changes — keys are dot-separated track paths like "box.fill.h"'),
}), {
  positional: [{ keys: ['time'] }],
  kwargs: ['easing'],
  record: {
    key: 'changes',
    entryHints: { positional: [{ keys: ['_key'] }, { keys: ['_value'] }] },
  },
});

export const ChapterSchema = dsl(z.object({
  name: z.string().describe('Chapter display name (string)'),
  time: z.number().min(0).describe('Chapter start time in seconds (number, >= 0)'),
}), {
  keyword: 'chapter',
  positional: [{ keys: ['name'], format: 'quoted' }, { keys: ['time'], keyword: 'at' }],
});

export const AnimConfigSchema = dsl(z.object({
  duration: z.number().min(0).describe('Total animation duration in seconds (number, >= 0)'),
  loop: z.boolean().describe('Loop animation continuously (boolean, default false)').optional(),
  autoKey: z.boolean().describe('Global autoKey — hold values between blocks by default (boolean, default false)').optional(),
  easing: EasingNameSchema.describe('Global default easing applied to all keyframes (EasingName, default "linear")').optional(),
  keyframes: z.array(KeyframeBlockSchema).describe('Ordered list of keyframe blocks'),
  chapters: z.array(ChapterSchema).describe('Named chapter markers for timeline navigation').optional(),
}), {
  keyword: 'animate',
  positional: [{ keys: ['duration'], suffix: 's' }],
  flags: ['loop', 'autoKey'],
  kwargs: ['easing'],
  children: { keyframes: 'block', chapters: 'block' },
});

export const TrackKeyframeSchema = z.object({
  time: z.number().min(0).describe('Keyframe time in seconds (number, >= 0)'),
  value: z.unknown().describe('Keyframe value (any type)'),
  easing: EasingNameSchema.describe('Easing function for interpolation to this keyframe'),
});

// ─── Derived Types ──────────────────────────────────────────────

export type EasingName = z.infer<typeof EasingNameSchema>;
export type PropertyChange = z.infer<typeof PropertyChangeSchema>;
export type KeyframeBlock = z.infer<typeof KeyframeBlockSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type AnimConfig = z.infer<typeof AnimConfigSchema>;
export type TrackKeyframe = z.infer<typeof TrackKeyframeSchema>;
export type Tracks = Map<string, TrackKeyframe[]>;
