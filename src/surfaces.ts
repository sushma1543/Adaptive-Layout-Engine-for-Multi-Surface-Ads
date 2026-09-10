/** Real device/channel constraints. A profile can be added without touching resolver.ts. */
export type EdgeInsets = { top: number; right: number; bottom: number; left: number };
export type ViewingDistance = 'near' | 'arm-length' | 'far';

export type SurfaceProfile = {
  id: string;
  name: string;
  context: string;
  width: number;
  height: number;
  safeArea: EdgeInsets;
  minTapTarget?: number;
  minTextSize?: number;
  viewingDistance: ViewingDistance;
  touchOnly?: boolean;
  notes?: string;
};

export class SurfaceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SurfaceValidationError';
  }
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Clearly rejects impossible or contradictory constraints at the boundary. */
export function defineSurface<const T extends SurfaceProfile>(profile: T): T {
  if (!profile.id.trim() || !profile.name.trim()) {
    throw new SurfaceValidationError('A surface needs an id and a name.');
  }
  if (!finitePositive(profile.width) || !finitePositive(profile.height)) {
    throw new SurfaceValidationError(`${profile.name} needs positive dimensions.`);
  }
  if (!Number.isInteger(profile.width) || !Number.isInteger(profile.height) || profile.width > 8192 || profile.height > 8192) {
    throw new SurfaceValidationError(`${profile.name} needs whole-pixel dimensions no larger than 8192px.`);
  }
  if (!profile.safeArea || typeof profile.safeArea !== 'object') {
    throw new SurfaceValidationError(`${profile.name} needs a complete safe area.`);
  }
  for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
    const value = profile.safeArea[edge];
    if (!Number.isFinite(value) || value < 0) {
      throw new SurfaceValidationError(`${profile.name} has an invalid ${edge} safe area.`);
    }
  }
  const innerWidth = profile.width - profile.safeArea.left - profile.safeArea.right;
  const innerHeight = profile.height - profile.safeArea.top - profile.safeArea.bottom;
  if (innerWidth < 96 || innerHeight < 72) {
    throw new SurfaceValidationError(
      `${profile.name} leaves too little usable area after safe areas.`,
    );
  }
  if (!['near', 'arm-length', 'far'].includes(profile.viewingDistance)) {
    throw new SurfaceValidationError(`${profile.name} has an invalid viewing distance.`);
  }
  if (profile.touchOnly !== undefined && typeof profile.touchOnly !== 'boolean') {
    throw new SurfaceValidationError(`${profile.name} has an invalid touch-only flag.`);
  }
  if (profile.touchOnly && (!profile.minTapTarget || profile.minTapTarget < 24)) {
    throw new SurfaceValidationError(
      `${profile.name} is touch-only and needs a minimum tap target of at least 24px.`,
    );
  }
  if (profile.minTapTarget !== undefined && !finitePositive(profile.minTapTarget)) {
    throw new SurfaceValidationError(`${profile.name} has an invalid tap target.`);
  }
  if (profile.minTextSize !== undefined && !finitePositive(profile.minTextSize)) {
    throw new SurfaceValidationError(`${profile.name} has an invalid minimum text size.`);
  }
  if (profile.viewingDistance === 'far' && (profile.minTextSize ?? 0) < 24) {
    throw new SurfaceValidationError(
      `${profile.name} is far-viewing and needs a minimum text size of at least 24px.`,
    );
  }
  return profile;
}

export const requiredSurfaces = [
  defineSurface({
    id: 'mobile-interstitial',
    name: 'Mobile interstitial',
    context: '390 × 844 · In-app full screen',
    width: 390,
    height: 844,
    safeArea: { top: 54, right: 20, bottom: 34, left: 20 },
    minTapTarget: 48,
    minTextSize: 14,
    viewingDistance: 'near',
    touchOnly: true,
    notes: 'Tall, thumb-reachable, and notch-aware.',
  }),
  defineSurface({
    id: 'mobile-landscape',
    name: 'Mobile landscape',
    context: '844 × 390 · Companion placement',
    width: 844,
    height: 390,
    safeArea: { top: 14, right: 24, bottom: 14, left: 24 },
    minTapTarget: 44,
    minTextSize: 14,
    viewingDistance: 'near',
    touchOnly: true,
    notes: 'Short and wide, with reachable controls.',
  }),
  defineSurface({
    id: 'broadcast-lower-third',
    name: 'Broadcast lower-third',
    context: '1920 × 250 · Studio program feed',
    width: 1920,
    height: 250,
    safeArea: { top: 24, right: 96, bottom: 24, left: 96 },
    minTextSize: 32,
    viewingDistance: 'far',
    notes: 'Distant viewing; keeps broadcast-safe edges clear.',
  }),
  defineSurface({
    id: 'retail-kiosk',
    name: 'Retail kiosk',
    context: '1080 × 1080 · Touch display',
    width: 1080,
    height: 1080,
    safeArea: { top: 64, right: 64, bottom: 64, left: 64 },
    minTapTarget: 64,
    minTextSize: 24,
    viewingDistance: 'arm-length',
    touchOnly: true,
    notes: 'Large square display designed for standing users.',
  }),
] as const;

export const bonusSurfaces = [
  defineSurface({
    id: 'qr-landing-panel',
    name: 'QR landing panel',
    context: '720 × 1280 · Print-to-digital handoff',
    width: 720,
    height: 1280,
    safeArea: { top: 42, right: 42, bottom: 52, left: 42 },
    minTapTarget: 52,
    minTextSize: 18,
    viewingDistance: 'arm-length',
    touchOnly: true,
    notes: 'A vertical panel for QR-assisted journeys.',
  }),
  defineSurface({
    id: 'constrained-coupon',
    name: 'Constrained coupon',
    context: '260 × 154 · Intentional priority pressure',
    width: 260,
    height: 154,
    safeArea: { top: 10, right: 12, bottom: 10, left: 12 },
    minTapTarget: 44,
    minTextSize: 13,
    viewingDistance: 'near',
    touchOnly: true,
    notes: 'Deliberately small: secondary and branding may drop first.',
  }),
] as const;

export const additionalSurfaces = [
  defineSurface({
    id: 'social-story', name: 'Social story', context: '1080 × 1920 · Story placement',
    width: 1080, height: 1920, safeArea: { top: 160, right: 60, bottom: 200, left: 60 },
    minTextSize: 28, minTapTarget: 72, touchOnly: true, viewingDistance: 'near',
  }),
  defineSurface({
    id: 'editorial-feed', name: 'Editorial feed', context: '1080 × 1350 · Portrait feed',
    width: 1080, height: 1350, safeArea: { top: 54, right: 54, bottom: 54, left: 54 },
    minTextSize: 26, minTapTarget: 64, touchOnly: true, viewingDistance: 'near',
  }),
  defineSurface({
    id: 'desktop-billboard', name: 'Desktop billboard', context: '1600 × 900 · Web display',
    width: 1600, height: 900, safeArea: { top: 48, right: 64, bottom: 48, left: 64 },
    minTextSize: 24, minTapTarget: 48, viewingDistance: 'arm-length',
  }),
  defineSurface({
    id: 'transit-display', name: 'Transit display', context: '900 × 1600 · Station poster',
    width: 900, height: 1600, safeArea: { top: 72, right: 54, bottom: 72, left: 54 },
    minTextSize: 32, viewingDistance: 'far',
  }),
] as const;

export const demoSurfaces = [...requiredSurfaces, ...bonusSurfaces, ...additionalSurfaces] as const;

export function makeInterviewSurface(input: {
  width: number;
  height: number;
  safeEdge: number;
  minTapTarget?: number;
  minTextSize?: number;
  touchOnly?: boolean;
  viewingDistance?: ViewingDistance;
}): SurfaceProfile {
  const safeEdge = Math.max(0, input.safeEdge);
  return defineSurface({
    id: 'live-interview-surface',
    name: 'Live interview surface',
    context: `${input.width} × ${input.height} · Added without resolver changes`,
    width: input.width,
    height: input.height,
    safeArea: { top: safeEdge, right: safeEdge, bottom: safeEdge, left: safeEdge },
    minTapTarget: input.touchOnly ? input.minTapTarget ?? 44 : undefined,
    minTextSize: input.minTextSize ?? 14,
    viewingDistance: input.viewingDistance ?? 'near',
    touchOnly: input.touchOnly ?? false,
    notes: 'Runtime-defined from the unknown-surface lab.',
  });
}
