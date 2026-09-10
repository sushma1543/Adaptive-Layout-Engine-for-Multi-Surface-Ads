import assert from 'node:assert/strict';
import test from 'node:test';
import { campaignPresets } from '../src/campaigns.js';
import {
  defineAd,
  type AdElement,
  type AdSpec,
  SpecValidationError,
} from '../src/spec.js';
import {
  assertResolvedLayout,
  resolveLayout,
  type Rect,
  type ResolvedLayout,
} from '../src/resolver.js';
import {
  bonusSurfaces,
  demoSurfaces,
  defineSurface,
  requiredSurfaces,
  SurfaceValidationError,
  type SurfaceProfile,
} from '../src/surfaces.js';

const epsilon = 0.001;
const demoProfiles = demoSurfaces;

// These declarations are compile-time contracts. `tsc --noEmit` must keep
// reporting both invalid role/type combinations and invalid priority values.
// @ts-expect-error A button can only carry the action role.
const invalidButtonRole: AdElement = {
  id: 'compile-time-role-check',
  type: 'button',
  role: 'primary',
  priority: 2,
  label: 'Invalid',
};
const invalidPriority: AdElement = {
  id: 'compile-time-priority-check',
  type: 'text',
  role: 'secondary',
  // @ts-expect-error Priority is deliberately limited to 1 through 4.
  priority: 5,
  text: 'Invalid',
};
void invalidButtonRole;
void invalidPriority;

function overlaps(left: Rect, right: Rect): boolean {
  return (
    left.x < right.x + right.width - epsilon &&
    left.x + left.width > right.x + epsilon &&
    left.y < right.y + right.height - epsilon &&
    left.y + left.height > right.y + epsilon
  );
}

function assertBoxInFrame(box: Rect, frame: Rect, label: string): void {
  for (const [name, value] of Object.entries(box)) {
    assert.ok(Number.isFinite(value), `${label}.${name} must be finite`);
  }
  assert.ok(box.width > 0, `${label} width must be positive`);
  assert.ok(box.height > 0, `${label} height must be positive`);
  assert.ok(box.x >= frame.x - epsilon, `${label} crosses the safe left edge`);
  assert.ok(box.y >= frame.y - epsilon, `${label} crosses the safe top edge`);
  assert.ok(
    box.x + box.width <= frame.x + frame.width + epsilon,
    `${label} crosses the safe right edge`,
  );
  assert.ok(
    box.y + box.height <= frame.y + frame.height + epsilon,
    `${label} crosses the safe bottom edge`,
  );
}

/**
 * Independent postconditions: this deliberately does not rely solely on the
 * resolver's own assertResolvedLayout implementation.
 */
function assertLayoutIntegrity(ad: AdSpec, surface: SurfaceProfile, layout: ResolvedLayout): void {
  assert.equal(layout.elements.length, ad.elements.length, 'every declared element receives an output record');
  assert.equal(layout.constraints.safeAreaHonored, true);
  assertBoxInFrame(layout.safeFrame, {
    x: 0,
    y: 0,
    width: surface.width,
    height: surface.height,
  }, 'safeFrame');

  const sources = new Map(ad.elements.map((element) => [element.id, element]));
  const visible = layout.elements.filter((element) => element.visible);
  for (const element of layout.elements) {
    const source = sources.get(element.id);
    assert.ok(source, `resolved element ${element.id} belongs to the supplied spec`);
    if (!element.visible) {
      assert.equal(element.status, 'dropped', `${element.id} has an explicit dropped status`);
      assert.equal(element.box, undefined, `${element.id} has no invisible box`);
      continue;
    }

    assert.notEqual(element.status, 'dropped', `${element.id} cannot be visible and dropped`);
    assert.ok(element.box, `${element.id} has a visible box`);
    assertBoxInFrame(element.box!, layout.safeFrame, element.id);

    if (source?.type === 'button') {
      const minTapTarget = surface.minTapTarget ?? 40;
      assert.ok(
        element.box!.width + epsilon >= minTapTarget,
        `${element.id} width honors the ${minTapTarget}px minimum tap target`,
      );
      assert.ok(
        element.box!.height + epsilon >= minTapTarget,
        `${element.id} height honors the ${minTapTarget}px minimum tap target`,
      );
    }

    if (element.text) {
      const minTextSize = surface.minTextSize ?? 13;
      assert.ok(
        element.text.fontSize + epsilon >= minTextSize,
        `${element.id} uses ${element.text.fontSize}px below the ${minTextSize}px hard text minimum`,
      );
      assert.ok(element.text.lines.length >= 1, `${element.id} emits at least one text line`);
      if (element.status === 'truncated') {
        assert.equal(element.text.truncated, true, `${element.id} reports a truncated text result`);
        assert.ok(
          element.text.lines.at(-1)?.endsWith('…'),
          `${element.id} ends a truncated line with an ellipsis`,
        );
      }
    }
  }

  for (let index = 0; index < visible.length; index += 1) {
    const first = visible[index];
    for (const second of visible.slice(index + 1)) {
      assert.ok(
        !overlaps(first.box!, second.box!),
        `${first.id} overlaps ${second.id} on ${surface.id}`,
      );
    }
  }

  for (const source of ad.elements.filter((element) => element.required)) {
    const resolved = layout.elements.find((element) => element.id === source.id);
    assert.equal(resolved?.visible, true, `required ${source.id} remains visible`);
  }

  assert.doesNotThrow(() => assertResolvedLayout(layout));
}

function makeSurface(
  id: string,
  width: number,
  height: number,
  options: Partial<SurfaceProfile> = {},
): SurfaceProfile {
  return defineSurface({
    id,
    name: `Uncatalogued ${id}`,
    context: 'Generated only for resolver verification',
    width,
    height,
    safeArea: { top: 18, right: 18, bottom: 18, left: 18 },
    minTapTarget: 48,
    minTextSize: 16,
    viewingDistance: 'near',
    touchOnly: true,
    ...options,
  });
}

function copyWith(ad: AdSpec, replacements: Record<string, string>): AdSpec {
  return defineAd({
    ...ad,
    elements: ad.elements.map((element) => {
      const value = replacements[element.id];
      if (value === undefined) return element;
      if (element.type === 'text') return { ...element, text: value };
      if (element.type === 'button') return { ...element, label: value };
      return element;
    }),
  });
}

function projectLayout(layout: ResolvedLayout) {
  return {
    composition: layout.composition,
    safeFrame: layout.safeFrame,
    constraints: layout.constraints,
    elements: layout.elements,
  };
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomInt(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

void test('all ten profiles resolve every shipped campaign without overlap or clipping', () => {
  assert.equal(requiredSurfaces.length, 4, 'the required demo profile count is preserved');
  assert.equal(bonusSurfaces.length, 2, 'the intentional pressure and QR profiles are covered');
  assert.equal(demoProfiles.length, 10);

  for (const { spec } of campaignPresets) {
    for (const surface of demoProfiles) {
      const layout = resolveLayout(spec, surface);
      assertLayoutIntegrity(spec, surface, layout);
    }
  }
});

void test('candidate choice comes from generic geometry, not a profile name, and demonstrates three composition families', () => {
  const ad = campaignPresets[0].spec;
  const tall = makeSurface('unknown-tall', 420, 1180, {
    safeArea: { top: 36, right: 22, bottom: 36, left: 22 },
  });
  const square = makeSurface('unknown-square', 960, 960, {
    safeArea: { top: 56, right: 56, bottom: 56, left: 56 },
    minTapTarget: 64,
    minTextSize: 24,
  });
  const landscape = makeSurface('unknown-landscape', 1440, 600);
  const wide = makeSurface('unknown-wide', 2400, 330, {
    safeArea: { top: 28, right: 90, bottom: 28, left: 90 },
    minTextSize: 28,
    touchOnly: false,
    minTapTarget: undefined,
    viewingDistance: 'far',
  });

  const tallLayout = resolveLayout(ad, tall);
  const squareLayout = resolveLayout(ad, square);
  const landscapeLayout = resolveLayout(ad, landscape);
  const wideLayout = resolveLayout(ad, wide);
  for (const [surface, layout] of [
    [tall, tallLayout],
    [square, squareLayout],
    [landscape, landscapeLayout],
    [wide, wideLayout],
  ] as const) {
    assertLayoutIntegrity(ad, surface, layout);
  }

  assert.equal(tallLayout.composition, 'stack');
  assert.equal(landscapeLayout.composition, 'split');
  assert.equal(wideLayout.composition, 'ribbon');
  assert.ok(
    new Set([tallLayout.composition, squareLayout.composition, landscapeLayout.composition, wideLayout.composition]).size >= 3,
    'tall, square, and wide input geometry selects meaningfully different arrangements',
  );

  const tallHero = tallLayout.elements.find((element) => element.role === 'hero')!.box!;
  const wideHero = wideLayout.elements.find((element) => element.role === 'hero')!.box!;
  assert.ok(tallHero.width / tallLayout.safeFrame.width > 0.98, 'tall input places a full-width hero region');
  assert.ok(wideHero.height / wideLayout.safeFrame.height > 0.98, 'wide input places a full-height hero region');

  const renamedTall = { ...tall, id: 'surface-never-seen-before', name: 'Completely renamed surface' };
  assert.deepEqual(
    projectLayout(resolveLayout(ad, tall)),
    projectLayout(resolveLayout(ad, renamedTall)),
    'changing a profile id or name cannot choose a different layout path',
  );
});

void test('randomized valid, unknown profiles retain all geometric and hard-constraint invariants', () => {
  const random = seededRandom(0x5eedc0de);
  const specs = campaignPresets.map((preset) => preset.spec);

  for (let index = 0; index < 256; index += 1) {
    const shortSide = randomInt(random, 440, 820);
    const aspect = 0.25 + random() * 6.25;
    const width = Math.round(shortSide * Math.max(1, aspect));
    const height = Math.round(shortSide / Math.min(1, aspect));
    const safe = randomInt(random, 0, Math.floor(shortSide * 0.09));
    const far = random() > 0.7;
    const touchOnly = random() > 0.3;
    const surface = makeSurface(`interview-${index}-${width}x${height}`, width, height, {
      safeArea: { top: safe, right: safe, bottom: safe, left: safe },
      minTapTarget: touchOnly ? randomInt(random, 40, 72) : undefined,
      minTextSize: far ? randomInt(random, 24, 36) : randomInt(random, 13, 22),
      viewingDistance: far ? 'far' : random() > 0.5 ? 'arm-length' : 'near',
      touchOnly,
    });
    const spec = specs[index % specs.length];
    const layout = resolveLayout(spec, surface);
    assertLayoutIntegrity(spec, surface, layout);
  }
});

void test('long unbroken, multilingual secondary copy is bounded, truncated, or dropped without compromising protected content', () => {
  const ad = copyWith(campaignPresets[0].spec, {
    description: `From a single unbroken run ${'x'.repeat(360)} to a second\nintentional paragraph, every word stays inside its resolved box.`,
  });

  for (const surface of demoProfiles) {
    const layout = resolveLayout(ad, surface);
    assertLayoutIntegrity(ad, surface, layout);
    const description = layout.elements.find((element) => element.id === 'description');
    assert.ok(description, `${surface.id} resolves the secondary copy record`);
    assert.ok(
      description.status === 'truncated' || description.status === 'dropped',
      `${surface.id} reports the copy-pressure outcome instead of clipping`,
    );
  }
});

void test('a required CTA remains tap-safe when its label exceeds a constrained surface', () => {
  const ad = copyWith(campaignPresets[0].spec, {
    cta: 'Shop the complete everyday ritual for only a limited time',
  });
  const layout = resolveLayout(ad, bonusSurfaces.find((surface) => surface.id === 'constrained-coupon')!);
  const cta = layout.elements.find((element) => element.id === 'cta');
  assert.equal(cta?.visible, true, 'the action remains visible');
  assert.equal(cta?.status, 'truncated', 'the label reports its explicit ellipsis state');
  assert.ok((cta?.box?.width ?? 0) >= layout.constraints.minTapTarget);
  assert.ok((cta?.box?.height ?? 0) >= layout.constraints.minTapTarget);
  assert.ok(cta?.text?.lines.at(-1)?.endsWith('…'));
});

void test('pressure degrades optional content from the lowest priority upward while protecting required content', () => {
  const ad = campaignPresets[0].spec;
  const pressure = makeSurface('priority-pressure', 180, 120, {
    safeArea: { top: 6, right: 6, bottom: 6, left: 6 },
    minTapTarget: 44,
    minTextSize: 13,
  });
  const layout = resolveLayout(ad, pressure);
  assertLayoutIntegrity(ad, pressure, layout);

  const optional = new Map(ad.elements.filter((element) => !element.required).map((element) => [element.id, element]));
  const dropped = layout.elements.filter((element) => !element.visible);
  const visibleOptional = layout.elements.filter((element) => element.visible && optional.has(element.id));
  assert.ok(dropped.length > 0, 'the pressure profile demonstrates actual degradation');
  for (const element of dropped) {
    assert.ok(optional.has(element.id), `${element.id} is optional before it can be dropped`);
    assert.match(element.reason ?? '', /Dropped at priority \d+/, `${element.id} explains its removal`);
    for (const retained of visibleOptional) {
      assert.ok(
        retained.priority <= element.priority,
        `${element.id} (p${element.priority}) cannot be dropped while lower-priority ${retained.id} (p${retained.priority}) remains`,
      );
    }
  }

  const decisionIds = layout.decisions
    .filter((decision) => decision.stage === 'degradation' && decision.elementId)
    .map((decision) => decision.elementId!);
  assert.deepEqual(decisionIds, dropped.map((element) => element.id), 'decision trace matches the actual degradation order');
});

void test('resolution is deterministic and does not mutate the declarative spec or profile', () => {
  const ad = campaignPresets[1].spec;
  const surface = requiredSurfaces[0];
  const adBefore = structuredClone(ad);
  const surfaceBefore = structuredClone(surface);
  const first = resolveLayout(ad, surface);
  const second = resolveLayout(ad, surface);

  assert.deepEqual(first, second, 'identical inputs have identical output');
  assert.deepEqual(ad, adBefore, 'the resolver does not mutate a spec');
  assert.deepEqual(surface, surfaceBefore, 'the resolver does not mutate a profile');
});

void test('defineAd rejects malformed untyped input with clear validation errors', () => {
  const valid = campaignPresets[0].spec;
  assert.doesNotThrow(() => defineAd(valid));

  const invalidSpecs: unknown[] = [
    { ...valid, id: ' ' },
    { ...valid, theme: { ...valid.theme, background: '#ggg' } },
    { ...valid, elements: valid.elements.slice(1) },
    {
      ...valid,
      elements: valid.elements.map((element, index) => (index === 1 ? { ...element, id: valid.elements[0].id } : element)),
    },
    {
      ...valid,
      elements: [
        ...valid.elements,
        { id: 'second-hero', type: 'image', role: 'hero', priority: 1, alt: 'A conflicting second hero image' },
      ],
    },
    {
      ...valid,
      elements: valid.elements.map((element) =>
        element.type === 'text' && element.role === 'primary' ? { ...element, text: ' ' } : element,
      ),
    },
    {
      ...valid,
      elements: valid.elements.map((element) =>
        element.type === 'button' ? { ...element, label: ' ' } : element,
      ),
    },
    {
      ...valid,
      elements: valid.elements.map((element) =>
        element.type === 'image' && element.role === 'hero' ? { ...element, alt: ' ' } : element,
      ),
    },
    {
      ...valid,
      elements: valid.elements.map((element) =>
        element.id === 'logo' ? { ...element, priority: 5 } : element,
      ),
    },
    {
      ...valid,
      elements: valid.elements.map((element) =>
        element.type === 'image' && element.role === 'hero'
          ? { ...element, src: 'javascript:alert(1)', focalPoint: { x: 101, y: -1 } }
          : element,
      ),
    },
    {
      ...valid,
      elements: valid.elements.map((element) =>
        element.type === 'button' ? { ...element, role: 'primary' } : element,
      ),
    },
  ];

  for (const invalid of invalidSpecs) {
    assert.throws(() => defineAd(invalid as AdSpec), SpecValidationError);
  }
});

void test('defineSurface rejects invalid and contradictory runtime constraint combinations', () => {
  const valid = {
    id: 'runtime-validation',
    name: 'Runtime validation surface',
    context: 'Test only',
    width: 640,
    height: 480,
    safeArea: { top: 12, right: 12, bottom: 12, left: 12 },
    minTapTarget: 48,
    minTextSize: 16,
    viewingDistance: 'near' as const,
    touchOnly: true,
  };
  assert.doesNotThrow(() => defineSurface(valid));

  const invalidSurfaces: unknown[] = [
    { ...valid, id: ' ' },
    { ...valid, width: 0 },
    { ...valid, height: Number.NaN },
    { ...valid, safeArea: { ...valid.safeArea, left: -1 } },
    { ...valid, safeArea: { top: 400, right: 200, bottom: 400, left: 200 } },
    { ...valid, touchOnly: true, minTapTarget: undefined },
    { ...valid, minTapTarget: 0 },
    { ...valid, minTapTarget: Number.NaN },
    { ...valid, minTextSize: 0 },
    { ...valid, minTextSize: Number.NaN },
    { ...valid, viewingDistance: 'far', minTextSize: 23 },
    { ...valid, viewingDistance: 'across-the-room' },
    { ...valid, safeArea: { top: 10 } },
  ];

  for (const invalid of invalidSurfaces) {
    assert.throws(() => defineSurface(invalid as SurfaceProfile), SurfaceValidationError);
  }
});

void test('an infeasible but well-formed surface fails explicitly rather than producing a clipped layout', () => {
  const impossible = defineSurface({
    id: 'explicit-infeasible-case',
    name: 'Explicit infeasible case',
    context: 'Small frame used to verify failure behavior',
    width: 96,
    height: 72,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    minTapTarget: 72,
    minTextSize: 24,
    viewingDistance: 'near',
    touchOnly: true,
  });
  assert.throws(
    () => resolveLayout(campaignPresets[0].spec, impossible),
    /No valid layout can satisfy Explicit infeasible case/,
  );
});
