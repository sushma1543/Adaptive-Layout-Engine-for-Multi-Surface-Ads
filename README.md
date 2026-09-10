# Adaptive Layout Lab

Live deployment: https://adaptive-layout-assignment-khl83s97w-shushma.vercel.app

> FLAM AI Super Dream Internship / Placement — Frontend R&D assignment  
> A single declarative ad spec, resolved into safe, usable layouts for fundamentally different screens.

Adaptive Layout Lab is a TypeScript-first demo of constraint-aware advertising layouts. It deliberately keeps content definition separate from layout decisions: a campaign is defined once, then the same resolver places it on a tall mobile interstitial, a short broadcast lower-third, a square touch kiosk, and any valid custom surface.

The goal is not to scale one design uniformly. The engine chooses among generic composition candidates, sizes and wraps text against real available space, protects important content, and degrades lower-priority content before it ever allows an overlap or an out-of-bounds box.

## What the demo proves

| Requirement | Implementation |
| --- | --- |
| One content spec | Every campaign is created with defineAd and contains semantic elements: branding, headline, hero, body copy, price, and CTA. |
| Four required surface types | Mobile portrait, mobile landscape, broadcast lower-third, and retail kiosk profiles are included. |
| Real constraints | Each surface carries dimensions, safe-area insets, viewing distance, minimum type size, tap target, and touch-only constraints where applicable. |
| Meaningfully different layouts | The resolver evaluates vertical stack, horizontal split, and ultra-wide ribbon candidates. It chooses by geometry and fit score, not by a surface name. |
| Priority degradation | It contracts the hero before removing optional elements. Optional elements are removed from the highest numeric priority downward; required headline, hero, and CTA remain protected. |
| No overlaps or clipping | A final invariant checks every visible box against the safe frame and every other visible box. An impossible layout returns a clear error rather than silently rendering a broken creative. |
| Typed output | The renderer receives typed resolved rectangles, statuses, fitted text, a composition choice, and a human-readable decision trace. |

The demo also includes a QR landing panel, a deliberately constrained coupon profile, and an Interview Mode where an unknown surface can be created live without adding a resolver branch.

## Run it in VS Code

1. Extract the project ZIP.
2. Open the extracted **adaptive-layout-assignment** folder in Visual Studio Code. It must be the folder that contains package.json.
3. Install Node.js 22.13 or newer. Node 22 LTS is recommended.
4. In VS Code, choose **Terminal → New Terminal**, then run:

~~~sh
npm ci
npm run dev
~~~

5. Open the local URL printed by the terminal. It is normally [http://localhost:3000](http://localhost:3000).
6. Keep that terminal open while using the app. Press Ctrl+C when you want to stop the local server.

On Windows, if PowerShell blocks npm.ps1, use these commands instead:

~~~bat
npm.cmd ci
npm.cmd run dev
~~~

You can also select **Command Prompt** as the VS Code terminal profile. No API key, environment file, database, or account is needed.

## How to use the demo

1. Choose one of the four realistic campaign themes. Each has its own brand, quote, visual treatment, headline, price, CTA, and art direction.
2. Inspect the live surface matrix. Every preview is resolved independently from the same campaign spec.
3. Select a surface to open the focused inspector. It shows its usable area, hard constraints, selected composition, element statuses, and exact decision trace.
4. Edit the brand, headline, description, price, CTA, or hero image. The update flows through the same resolver for every surface.
5. Enable **Safe areas** and **Boxes** to inspect the resolved geometry.
6. Select the constrained coupon profile or enter a smaller custom surface in **Interview Mode**. Observe lower-priority branding and secondary copy disappear cleanly before required content is compromised.
7. Download the selected layout as SVG or PNG, save the editable JSON project, or export a campaign kit ZIP containing the spec, resolution manifest, and one SVG per active surface.

The editor autosaves the current working copy in the browser. JSON export is the portable way to move a campaign to another browser or computer.

## Included surface profiles

| Profile | Dimensions | Constraints that matter |
| --- | ---: | --- |
| Mobile interstitial | 390 × 844 | Notch-aware safe area, touch-only, 48 px minimum tap target |
| Mobile landscape | 844 × 390 | Short usable height, touch-only, 44 px minimum tap target |
| Broadcast lower-third | 1920 × 250 | Broadcast-safe margins, far-viewing distance, 32 px minimum type |
| Retail kiosk | 1080 × 1080 | Square composition, touch-only, 64 px minimum tap target |
| QR landing panel | 720 × 1280 | Large vertical touch destination with QR handoff context |
| Constrained coupon | 260 × 154 | Intentional priority pressure for visible degradation |

The resolver does not inspect profile.id or profile.name. A profile is only input data: dimensions, safe frame, and constraints.

## Resolution flow

~~~mermaid
flowchart LR
    A[Declarative Ad Spec] --> C[Constraint Resolver]
    B[Surface Profile] --> C
    C --> D[Resolved Layout]
    D --> E[DOM Renderer]
    D --> F[SVG / PNG / Campaign Kit Export]
~~~

The TypeScript resolver is framework-agnostic. React is only responsible for editing the campaign, calling the resolver, and rendering the result.

## How the layout algorithm works

1. **Validate the input.** defineAd checks element identifiers, required semantic roles, content, priorities, and theme colors. defineSurface checks positive dimensions, valid safe areas, touch-target requirements, and far-viewing minimum type.
2. **Calculate the usable frame.** Surface safe-area insets are subtracted before any element is positioned.
3. **Evaluate generic composition candidates.** Stack, split, and ribbon candidates all run for every surface. Each has a target aspect ratio and a starting hero share, but none is tied to a profile name.
4. **Reserve the non-negotiables.** A candidate establishes hero and copy regions, reserves an action box large enough for the surface’s touch and type requirements, then lays out branding and copy in the remaining region.
5. **Fit text within real boxes.** The text fitter wraps words using conservative character-width estimates, reduces font size only down to the allowed threshold, and adds an ellipsis when a configured line limit still cannot contain the content.
6. **Try graceful degradation.** If a candidate cannot fit, the resolver contracts its hero region step by step. If that is still insufficient, it removes optional elements in predictable priority order. Required elements are not intentionally removed.
7. **Verify the result.** Every visible rectangle must be inside the safe frame and pairwise non-overlapping. Invalid attempts are discarded.
8. **Score and select.** The engine scores valid candidates by geometric fitness, visible content, readability, hero compression, and degradation cost. The highest-scoring valid candidate becomes the resolved layout.

This is a deliberately small, explainable constraint solver. It is not a surface lookup table and it does not depend on CSS breakpoints to choose the creative arrangement.

### Priority and degradation behavior

Priority 1 is most important; larger numbers are less important. In the supplied campaigns:

| Element | Priority | Required | Expected behavior under pressure |
| --- | ---: | ---: | --- |
| Headline | 1 | Yes | Kept visible and fitted before optional content |
| Hero image | 1 | Yes | May contract before optional content is removed |
| CTA | 2 | Yes | Kept at a valid touch target; an unusually long label can be explicitly ellipsized |
| Price | 2 | No | May be removed only after higher-numbered optional content |
| Description | 3 | No | Can truncate or disappear before protected content |
| Branding | 4 | No | First optional element eligible to drop |

The constrained coupon makes this behavior visible. It is intentionally too small for the full creative at the preferred sizes, so the inspector records every change rather than leaving an element clipped or overlapped.

## TypeScript design

The public data model is intentionally narrow:

~~~ts
type AdElement =
  | CopyElement
  | HeroImageElement
  | BrandingImageElement
  | ActionElement;

type SurfaceProfile = {
  id: string;
  width: number;
  height: number;
  safeArea: EdgeInsets;
  minTapTarget?: number;
  minTextSize?: number;
  viewingDistance: "near" | "arm-length" | "far";
  touchOnly?: boolean;
};
~~~

The element union ties valid roles to valid element types. For example, a hero must be an image, an action must be a button, and copy is restricted to primary or secondary roles. Literal role and priority values survive through defineAd, while runtime guards make imported or untyped JSON fail clearly instead of reaching the renderer in an invalid state.

The resolved output is also typed. A renderer does not infer layout from a surface name: it consumes resolved boxes, text lines, font sizes, visibility, statuses, constraints, and decisions. That separation makes a Canvas or server-side renderer possible without changing the layout algorithm.

## Project structure

~~~text
adaptive-layout-assignment/
├── app/
│   ├── page.tsx                 # Application entry point
│   └── globals.css              # Product UI and resolved-ad presentation styles
├── src/
│   ├── spec.ts                  # Declarative ad types and validation
│   ├── surfaces.ts              # Surface types, profiles, and unknown-surface builder
│   ├── resolver.ts              # Framework-independent constraint resolution
│   ├── render-dom.tsx           # DOM backend for a ResolvedLayout
│   ├── export.ts                # SVG, PNG, and ZIP export backend
│   ├── campaigns.ts             # Realistic example campaign specs
│   └── App.tsx                  # Interactive demo and inspector
├── tests/                       # Automated regression checks
├── package.json
├── tsconfig.json
├── README.md
└── ARCHITECTURE.md
~~~

## Verification

Run these commands before submitting:

~~~sh
npm run typecheck
npm test
npm run build
~~~

The test script compiles the framework-independent resolver sources into a temporary folder, then runs the compiled suite with Node's built-in test runner. Type checking verifies the TypeScript contracts. The automated checks cover input validation, text fitting, safe-frame containment, non-overlap across standard and arbitrary surfaces, predictable degradation, and export safety. The production build confirms the complete application bundles successfully.

For a quick manual check:

1. Open each of the four required profiles and confirm that the chosen arrangements are visibly different.
2. Turn on safe-area and element-box overlays.
3. Replace the headline with a long sentence and verify that it truncates safely instead of overflowing.
4. Use the constrained coupon and confirm that branding and secondary content degrade before headline, hero, or CTA.
5. Create an unknown custom profile in Interview Mode and verify it resolves with no code change.
6. Export an SVG and a campaign kit, then inspect the manifest.

## Accessibility and practical UX

- Touch-only profiles pass a minimum tap target into the resolver, which sizes the CTA before copy uses the remaining area.
- Semantic image alternatives are required in the input spec.
- The CTA is rendered as a native button in the DOM backend.
- The inspector exposes a textual explanation of the resolved result instead of relying only on visual geometry.
- User-supplied hero images are restricted to local PNG, JPEG, or WebP data and size-limited before use.

## Known limitations

- Text fitting uses conservative character-width estimates, not browser font shaping or a true text-measurement API. Complex scripts, emoji, and brand fonts should receive visual review.
- The example engine supports text, image, and button elements. Adding multiple independently positioned heroes, legal copy blocks, or QR code elements would require extending the solver’s element model.
- The implementation contains a DOM renderer and SVG/PNG export path; a Canvas backend is an appropriate next extension.
- Safe areas are profile-provided design constraints. They are not a substitute for a platform’s latest advertising policy or broadcast standards.
- The resolver favors a sensible result over animation. Surface-switch transitions are outside the core algorithm.
- Extremely small surfaces may have no valid solution once required content and hard constraints are considered. The resolver reports this condition explicitly.

## Time spent

**Approximately 1 focused implementation day in this delivery, including the resolver, UI, assets, tests, and documentation.**

## AI disclosure

AI-assisted development tools were used to help explore the interface, scaffold implementation details, draft tests, and improve documentation. The layout model, constraints, degradation policy, and final code should be reviewed and understood by the submitter before the live interview. This disclosure is included because the assignment explicitly permits AI tools when their use is transparent.

## Suggested two-minute walkthrough

1. Start on the surface matrix and state: “This is one declarative campaign spec being independently resolved for several surfaces.”
2. Compare mobile portrait, broadcast lower-third, and retail kiosk. Point out the chosen stack, ribbon, and split compositions.
3. Select the constrained coupon and walk through the decision trace: hero compression, then optional-element removal in priority order.
4. Open Interview Mode, enter a new surface size, and resolve it live.
5. Show src/resolver.ts and explain that it scores generic candidates without a surface-id condition.
6. Export the selected surface or the campaign kit to demonstrate that the same resolved geometry drives rendering and output.

