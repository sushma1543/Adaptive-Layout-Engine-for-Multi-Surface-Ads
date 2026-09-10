import type { AdSpec } from './spec.js';
import { resolveLayout, type ResolvedLayout, type ResolveOptions } from './resolver.js';
import type { SurfaceProfile } from './surfaces.js';

export type ResolutionResult = { layout: ResolvedLayout; error?: never } | { layout?: never; error: string };
/** An impossible interview profile is a recoverable result in the editor. */
export function resolveSafely(ad: AdSpec, surface: SurfaceProfile, options: ResolveOptions = {}): ResolutionResult {
  try {
    return { layout: resolveLayout(ad, surface, options) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'This content cannot fit the selected constraints.' };
  }
}
