# Architecture: Adaptive Layout Engine

This document explains the engine as a system rather than as a user interface. The central design decision is simple:

> Content and intent are declarative input. Geometry is calculated output.

A surface profile never asks for a named layout. It states physical and interaction constraints. The resolver applies the same candidate-generation, fitting, validation, degradation, and scoring path to every profile.

## Design goals

1. **Keep the resolver framework-agnostic.** It receives plain TypeScript data and returns plain TypeScript data. React, DOM, SVG, Canvas, or a server renderer can consume the result.
2. **Make invalid layouts impossible to emit.** Visible rectangles must be inside the safe frame and must not overlap.
3. **Make trade-offs predictable.** Content priority is explicit, degradation has a fixed order, and the output includes a decision trace.
4. **Adapt composition, not only scale.** A tall screen, a broad banner, and a square kiosk are evaluated against different generic geometric candidates.
5. **Keep new surfaces data-only.** Adding a profile should not require modifying resolver.ts.

## System boundaries

~~~mermaid
flowchart TB
    subgraph Input
        Spec[AdSpec<br/>content, roles, priorities, theme]
        Surface[SurfaceProfile<br/>dimensions, safe area, viewing, touch]
    end

    subgraph Core["Framework-independent core"]
        Validate[defineAd / defineSurface]
        Resolve[resolveLayout]
        Verify[Bounds + overlap invariant]
    end

    subgraph Outputs
        DOM[ResolvedAd DOM renderer]
        SVG[SVG export renderer]
        PNG[PNG rasterization]
        Inspector[Decision inspector]
    end

    Spec --> Validate
    Surface --> Validate
    Validate --> Resolve
    Resolve --> Verify
    Verify --> DOM
    Verify --> SVG
    SVG --> PNG
    Verify --> Inspector
~~~

## Modules and responsibilities

| Module | Owns | Does not own |
| --- | --- | --- |
| src/spec.ts | Ad element union, campaign theme, defineAd validation, safe local image-source checks | Surface logic, rectangles, DOM |
| src/surfaces.ts | SurfaceProfile, defineSurface validation, required profiles, unknown-surface factory | Candidate selection, rendering |
| src/resolver.ts | Candidate generation, text fitting, placement, degradation, scoring, resolved output, geometry assertions | JSX, CSS, browser state |
| src/render-dom.tsx | Converts resolved physical rectangles into percentage-based DOM styles | Composition decisions or media queries for ad layout |
| src/export.ts | Consumes ResolvedLayout to create SVG, PNG, and campaign ZIP files | Re-running a second layout algorithm |
| src/campaigns.ts | Realistic declarative demo campaigns and themes | Solver policy |
| src/App.tsx | User edits, surface picker, debug overlays, inspector, export actions, local working copy | Layout mathematics |

The visible product UI may use ordinary responsive CSS to make its editor usable on a browser window. The ad itself does not. The renderer receives resolved coordinates and contains no checks for a surface id or a surface-specific CSS breakpoint.

## Input contracts

### Ad specification

The spec uses a discriminated union to make semantic mismatches difficult to construct:

~~~ts
type CopyElement =
  { type: "text"; role: "primary" | "secondary"; text: string; ... }

type HeroImageElement =
  { type: "image"; role: "hero"; alt: string; src?: string; ... }

type BrandingImageElement =
  { type: "image"; role: "branding"; alt: string; ... }

type ActionElement =
  { type: "button"; role: "action"; label: string; href?: string; ... }

type AdElement =
  | CopyElement
  | HeroImageElement
  | BrandingImageElement
  | ActionElement;
~~~

Each element has a stable id, a priority from 1 through 4, and an optional required flag. Lower numeric priorities are more important. The type model prevents an action from accidentally being supplied as text or a hero from being supplied as a button.

defineAd adds defensive runtime validation for imported JSON:

- campaign identity, theme colors, and element ids must be valid;
- ids must be unique;
- text, button labels, and image alternatives must not be empty;
- every demo spec must contain primary, hero, action, and branding roles;
- element priorities must be an integer in the supported range.

This dual approach matters because TypeScript protects authored source but cannot protect a JSON file supplied at runtime.

### Surface profile

~~~ts
type SurfaceProfile = {
  id: string;
  name: string;
  context: string;
  width: number;
  height: number;
  safeArea: { top: number; right: number; bottom: number; left: number };
  minTapTarget?: number;
  minTextSize?: number;
  viewingDistance: "near" | "arm-length" | "far";
  touchOnly?: boolean;
};
~~~

defineSurface rejects invalid dimensions and insets, profiles with too little usable content space, touch-only profiles without a usable tap target, and far-viewing profiles without a meaningful minimum text size. The resolver receives the profile as data; it has no knowledge of whether the profile represents a phone, kiosk, broadcast feed, or a profile invented in an interview.

## Resolved output

The resolver output is intentionally a renderer contract:

~~~ts
type ResolvedLayout = {
  surface: SurfaceProfile;
  safeFrame: Rect;
  composition: "stack" | "split" | "ribbon";
  score: number;
  elements: ResolvedElement[];
  decisions: LayoutDecision[];
  constraints: {
    minTapTarget: number;
    minTextSize: number;
    safeAreaHonored: true;
  };
};
~~~

Each visible ResolvedElement carries a Rect in physical surface pixels plus a status of placed, truncated, or dropped. Text additionally carries the exact lines, font size, line height, and truncation state. A renderer therefore has nothing left to infer about placement.

## Resolver pipeline

~~~mermaid
flowchart TD
    A[Ad spec + surface] --> B[Build safe frame]
    B --> C[Evaluate each generic candidate]
    C --> D[Attempt initial hero share]
    D --> E{Fits bounds, text, tap target,<br/>and no-overlap invariant?}
    E -- Yes --> F[Score candidate]
    E -- No --> G[Contract hero share]
    G --> E
    G --> H{Minimum hero share reached?}
    H -- No --> E
    H -- Yes --> I[Drop next optional element]
    I --> D
    F --> J[Choose highest-scoring valid candidate]
    J --> K[Emit boxes, text metrics, statuses, trace]
~~~

### 1. Safe frame

The resolver calculates the only region in which content may appear:

~~~ts
safeFrame = {
  x: safeArea.left,
  y: safeArea.top,
  width: surface.width - safeArea.left - safeArea.right,
  height: surface.height - safeArea.top - safeArea.bottom,
};
~~~

Every subsequent candidate uses this frame. There is no second set of CSS margins that can disagree with the engine.

### 2. Generic candidates

The engine has three reusable candidates:

| Candidate | Natural geometry | Region split |
| --- | --- | --- |
| stack | Tall or near-square surfaces | Hero on top, copy below |
| split | Wide but not extremely shallow surfaces | Copy at left, hero at right |
| ribbon | Very wide, shallow surfaces | Compact horizontal hero-and-copy treatment |

Each candidate carries a target aspect ratio, initial hero share, minimum hero share, and adjustment step. The resolver runs every candidate against the actual safe-frame aspect ratio. A candidate is neither selected nor rejected because a profile has a particular id.

### 3. Candidate attempt

For one candidate and one hero share, the solver:

1. Creates hero and copy regions with a proportional gap.
2. Protects the required hero, primary headline, and CTA.
3. Reserves the action region from the bottom of the copy region. Its height is at least the surface tap target and sufficient for its fitted label.
4. Places branding if it remains included.
5. Sorts text semantically, then fits it into the remaining vertical space.
6. Produces a box for every visible element and checks all layout invariants.

The implementation is a priority-aware box model rather than an attempt to reproduce CSS Flexbox. That makes it small enough to explain in an interview and deterministic enough to test.

### 4. Text fitting

The text fitter uses a conservative width model:

- wide and uppercase characters consume more estimated width than narrow punctuation;
- words wrap before exceeding the allocated box width;
- font size decreases only until its permitted minimum;
- the resolver enforces the element’s configured line limit;
- if more text remains, the final visible line ends in an ellipsis.

The result is carried in ResolvedText, so the DOM and SVG renderers use the same resolved line breaks and font metrics. This avoids a preview/export mismatch.

### 5. Degradation order

The solver does not begin by dropping content. It tries the following phases for each candidate:

| Phase | Action | Reason |
| --- | --- | --- |
| 1 | Try preferred hero share with all elements | Preserve the intended creative |
| 2 | Contract the hero in bounded steps | Recover copy space while retaining required visual content |
| 3 | Remove optional elements by descending numeric priority | Preserve the message and interaction first |
| 4 | Reject the candidate if required content still cannot fit | Never output clipping or overlap |

Optional elements are sorted from priority 4 down to priority 1; elements at the same priority use a deterministic role order. In the supplied campaign, the branding mark is eligible before the body, body before price, and protected headline/hero/CTA are never deliberately removed. A required CTA always keeps its hard tap target; if its label exceeds the available width, the label receives an explicit ellipsis while the button remains usable.

The resolver records every removal in LayoutDecision. The demo’s inspector exposes this trace, so a reviewer can answer “why did this element disappear?” from output data rather than guesses.

### 6. Validity and scoring

A candidate attempt is valid only when:

~~~text
visible element box ⊆ safe frame
AND
no two visible element boxes intersect
AND
the CTA reaches the profile’s tap-target requirement
AND
text has a valid resolved box
~~~

Valid candidates receive a score that balances:

- closeness to the candidate’s natural aspect ratio;
- number of visible elements;
- fitted text readability;
- cost of hero compression;
- cost of degrading lower-priority content.

The highest-scoring valid candidate becomes the answer. If no candidate can honor the hard constraints, resolveLayout throws a clear error. Producing no layout is safer and more debuggable than silently emitting one that clips.

## Rendering architecture

### DOM

ResolvedAd converts physical-pixel boxes into percentage values relative to the actual surface:

~~~ts
left   = box.x / surface.width  * 100%
top    = box.y / surface.height * 100%
width  = box.width / surface.width  * 100%
height = box.height / surface.height * 100%
~~~

Font sizes use the same surface-relative unit. The DOM renderer can therefore scale a preview for the desktop UI while preserving the geometric decision already made by the resolver. It only maps boxes to HTML elements; it does not decide which box goes where.

### Export

The export module consumes the same ResolvedLayout:

- SVG uses resolved rectangles and resolved text lines directly.
- PNG rasterizes that SVG at the profile’s native pixel dimensions.
- The campaign kit ZIP contains an SVG for every active surface, the declarative campaign JSON, and a manifest listing surface dimensions, selected composition, and dropped elements.

This single-layout-to-many-renderers boundary prevents a separate export layout from drifting away from the demo preview.

## Extension points

### Add a new surface

No resolver edits are needed:

~~~ts
const transitPillar = defineSurface({
  id: "transit-pillar",
  name: "Transit pillar",
  context: "1200 × 2400 · Station display",
  width: 1200,
  height: 2400,
  safeArea: { top: 80, right: 80, bottom: 100, left: 80 },
  minTextSize: 30,
  viewingDistance: "far",
});

const layout = resolveLayout(adSpec, transitPillar);
~~~

The profile participates in stack, split, and ribbon evaluation like every other profile. The live Interview Mode performs this same operation from form values.

### Add a renderer

Implement a small adapter that maps ResolvedElement rectangles and text to the target drawing API. It should not import candidate data or call surface-name conditions. A Canvas renderer, a PDF renderer, or a server-side SVG renderer can share the current core.

### Add a new semantic element

This is intentionally a core change:

1. Add the element variant to AdElement in spec.ts.
2. Define its priority semantics and minimum requirements.
3. Teach the resolver how it consumes a region or flows with copy.
4. Add output support in render-dom.tsx and export.ts.
5. Add invariant and degradation tests.

For example, a legal-disclaimer element could be secondary, optional, and only appear when enough post-CTA space remains. A QR element could introduce an aspect-ratio constraint and become required on QR landing profiles.

## Testing strategy

The important tests are behavioral rather than snapshot-only:

| Test area | Example assertion |
| --- | --- |
| Input validation | Invalid roles, duplicate ids, impossible safe areas, or far-viewing profiles without minimum type are rejected |
| Geometry invariant | Every visible element lies within safeFrame and no visible pair intersects |
| Surface generalization | Hundreds of arbitrary width/height profiles resolve through the same path or report a clear impossible-layout error |
| Degradation | Branding is dropped before body/price; required elements remain visible whenever a valid layout exists |
| Text | Long copy terminates, honors line limits, and reports truncation instead of overflowing |
| Rendering | DOM and SVG consume resolved output; exported SVG escapes user content safely |

Run the repository checks with:

~~~sh
npm run typecheck
npm test
npm run build
~~~

The test script compiles the resolver suite into a temporary folder and runs it with Node's built-in test runner.

## Intentional limitations

This engine favors explicit rules and explainability over a broad general-purpose solver:

- It uses a small set of geometric candidate families instead of linear programming.
- Text fitting estimates character widths. A production typography system should use actual font measurement and shaping.
- It supports a focused element taxonomy, with one primary hero, action, and branding element in the supplied campaign model.
- It does not animate between resolved layouts.
- It does not include platform certification for ad-network safe zones, broadcast standards, print bleed, or accessibility contrast ratios.

These boundaries are deliberate. They leave a compact, well-tested core that can be explained, extended, and demonstrated live.

