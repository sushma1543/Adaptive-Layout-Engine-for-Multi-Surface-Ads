import type { AdElement, AdSpec, CopyElement, Priority } from './spec.js';
import type { SurfaceProfile } from './surfaces.js';
import { AD_LINE_HEIGHT, estimateText, type TextMeasurer } from './typography.js';

export type ResolveOptions = { measureText?: TextMeasurer };

export type Rect = { x: number; y: number; width: number; height: number };
export type Composition = 'stack' | 'editorial' | 'split' | 'ribbon';
export type ElementStatus = 'placed' | 'truncated' | 'dropped';

export type ResolvedText = {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  truncated: boolean;
  fontWeight: number;
};

export type ResolvedElement = {
  id: string;
  type: AdElement['type'];
  role: AdElement['role'];
  priority: Priority;
  visible: boolean;
  status: ElementStatus;
  box?: Rect;
  text?: ResolvedText;
  reason?: string;
};

export type LayoutDecision = {
  stage: 'input' | 'candidate' | 'constraint' | 'degradation' | 'output';
  message: string;
  elementId?: string;
};

export type ResolvedLayout = {
  surface: SurfaceProfile;
  safeFrame: Rect;
  composition: Composition;
  score: number;
  elements: ResolvedElement[];
  decisions: LayoutDecision[];
  constraints: {
    minTapTarget: number;
    minTextSize: number;
    safeAreaHonored: true;
  };
};

type CandidateTemplate = {
  composition: Composition;
  targetAspect: number;
  initialHeroShare: number;
  minimumHeroShare: number;
  step: number;
};

type Regions = { hero: Rect; copy: Rect; action?: Rect; heroShare: number };
type Attempt = {
  elements: ResolvedElement[];
  valid: boolean;
  decisions: LayoutDecision[];
  heroShare: number;
  readability: number;
};

const candidates: CandidateTemplate[] = [
  { composition: 'stack', targetAspect: 0.55, initialHeroShare: 0.44, minimumHeroShare: 0.22, step: 0.055 },
  { composition: 'editorial', targetAspect: 1, initialHeroShare: 0.52, minimumHeroShare: 0.3, step: 0.055 },
  { composition: 'split', targetAspect: 1.9, initialHeroShare: 0.43, minimumHeroShare: 0.25, step: 0.045 },
  { composition: 'ribbon', targetAspect: 5.8, initialHeroShare: 0.24, minimumHeroShare: 0.14, step: 0.035 },
];

const roleRank: Record<AdElement['role'], number> = {
  branding: 0,
  primary: 1,
  secondary: 2,
  action: 3,
  hero: 4,
};

const textRank: Record<NonNullable<CopyElement['treatment']>, number> = {
  eyebrow: 0,
  headline: 1,
  body: 2,
  price: 3,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width: Math.max(0, width), height: Math.max(0, height) };
}

function inset(frame: Rect, amount: number): Rect {
  return rect(frame.x + amount, frame.y + amount, frame.width - amount * 2, frame.height - amount * 2);
}

/** Framework-independent conservative word wrapping. */
export function wrapText(text: string, maxWidth: number, fontSize: number, measure: TextMeasurer = estimateText, weight = 500): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next, fontSize, weight) <= maxWidth) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      for (const character of word) {
        if (line && measure(line + character, fontSize, weight) > maxWidth) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    if (line || paragraph === '') lines.push(line);
  }
  return lines.length ? lines : [''];
}

function truncateLines(lines: string[], maxLines: number, maxWidth: number, fontSize: number, measure: TextMeasurer, weight: number): string[] {
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, Math.max(1, maxLines));
  let last = visible[visible.length - 1];
  while (last && measure(`${last}…`, fontSize, weight) > maxWidth) last = last.slice(0, -1);
  visible[visible.length - 1] = `${last}…`;
  return visible;
}

function fitText(
  text: string,
  box: Rect,
  preferred: number,
  minimum: number,
  maxLines: number,
  measure: TextMeasurer,
  fontWeight: number,
): ResolvedText {
  const lineHeight = AD_LINE_HEIGHT;
  let fontSize = Math.max(minimum, preferred);
  let lines = wrapText(text, Math.max(1, box.width - 2), fontSize, measure, fontWeight);
  while (fontSize > minimum && (lines.length > maxLines || lines.length * fontSize * lineHeight > box.height || lines.some(line => measure(line, fontSize, fontWeight) > box.width - 2))) {
    fontSize = Math.max(minimum, fontSize - 1);
    lines = wrapText(text, Math.max(1, box.width - 2), fontSize, measure, fontWeight);
  }
  const heightLines = Math.max(1, Math.floor(box.height / (fontSize * lineHeight)));
  const actualMaxLines = Math.max(1, Math.min(maxLines, heightLines));
  const truncated = lines.length > actualMaxLines;
  return {
    lines: truncateLines(lines, actualMaxLines, box.width - 2, fontSize, measure, fontWeight),
    fontSize,
    lineHeight,
    fontWeight,
    truncated,
  };
}

function isWithin(inner: Rect, outer: Rect): boolean {
  const epsilon = 0.001;
  return (
    inner.x >= outer.x - epsilon &&
    inner.y >= outer.y - epsilon &&
    inner.x + inner.width <= outer.x + outer.width + epsilon &&
    inner.y + inner.height <= outer.y + outer.height + epsilon
  );
}

function overlaps(first: Rect, second: Rect): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function safeFrame(surface: SurfaceProfile): Rect {
  const { safeArea } = surface;
  return rect(
    safeArea.left,
    safeArea.top,
    surface.width - safeArea.left - safeArea.right,
    surface.height - safeArea.top - safeArea.bottom,
  );
}

function makeRegions(template: CandidateTemplate, frame: Rect, share: number): Regions | null {
  const gap = clamp(Math.min(frame.width, frame.height) * 0.035, 6, 28);
  if (template.composition === 'stack' || template.composition === 'editorial') {
    const heroHeight = frame.height * share;
    const copyHeight = frame.height - heroHeight - gap;
    if (copyHeight <= 0) return null;
    if (template.composition === 'editorial') return {
      hero: rect(frame.x, frame.y + copyHeight + gap, frame.width, heroHeight),
      copy: rect(frame.x, frame.y, frame.width, copyHeight),
      heroShare: share,
    };
    return {
      hero: rect(frame.x, frame.y, frame.width, heroHeight),
      copy: rect(frame.x, frame.y + heroHeight + gap, frame.width, copyHeight),
      heroShare: share,
    };
  }
  const heroWidth = frame.width * share;
  const copyWidth = frame.width - heroWidth - gap;
  if (copyWidth <= 0) return null;
  if (template.composition === 'ribbon') {
    const actionWidth = frame.width * 0.2;
    return {
      hero: rect(frame.x, frame.y, heroWidth, frame.height),
      copy: rect(frame.x + heroWidth + gap, frame.y, copyWidth - actionWidth - gap, frame.height),
      action: rect(frame.x + frame.width - actionWidth, frame.y, actionWidth, frame.height),
      heroShare: share,
    };
  }
  return {
    hero: rect(frame.x + copyWidth + gap, frame.y, heroWidth, frame.height),
    copy: rect(frame.x, frame.y, copyWidth, frame.height),
    heroShare: share,
  };
}

function emptyElement(element: AdElement): ResolvedElement {
  return {
    id: element.id,
    type: element.type,
    role: element.role,
    priority: element.priority,
    visible: false,
    status: 'dropped',
  };
}

function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}

function sortText(elements: CopyElement[]): CopyElement[] {
  return [...elements].sort(
    (left, right) =>
      textRank[left.treatment ?? 'body'] - textRank[right.treatment ?? 'body'] ||
      left.priority - right.priority,
  );
}

function textMinimum(element: CopyElement, surface: SurfaceProfile): number {
  const base = surface.minTextSize ?? 13;
  // A surface's declared floor is hard: optional text drops before it shrinks
  // below a legible size. The caller decides whether to remove it.
  return Math.max(base, element.role === 'primary' ? base : 11);
}

function textPreferred(element: CopyElement, zone: Rect, surface: SurfaceProfile): number {
  const base = surface.minTextSize ?? 13;
  if (element.role === 'primary') {
    return clamp(zone.width * 0.105, base * 1.18, Math.max(base * 2.2, zone.width * 0.13));
  }
  if (element.treatment === 'price') {
    return clamp(zone.width * 0.047, base, Math.max(base * 1.45, zone.width * 0.06));
  }
  return clamp(zone.width * 0.035, textMinimum(element, surface), Math.max(base * 1.05, zone.width * 0.045));
}

function targetLines(element: CopyElement): number {
  if (element.maxLines) return element.maxLines;
  if (element.role === 'primary') return 3;
  if (element.treatment === 'price') return 1;
  return 2;
}

function copyElements(ad: AdSpec, included: Set<string>): CopyElement[] {
  return sortText(
    ad.elements.filter(
      (element): element is CopyElement =>
        element.type === 'text' && included.has(element.id),
    ),
  );
}

function attempt(
  ad: AdSpec,
  surface: SurfaceProfile,
  template: CandidateTemplate,
  included: Set<string>,
  heroShare: number,
  measure: TextMeasurer,
  allowShortening: boolean,
): Attempt {
  const frame = safeFrame(surface);
  const regions = makeRegions(template, frame, heroShare);
  const decisions: LayoutDecision[] = [];
  const output = ad.elements.map(emptyElement);
  const byId = new Map(output.map((element) => [element.id, element]));
  const hero = first(ad.elements.filter((element) => element.role === 'hero'));
  const action = first(ad.elements.filter((element) => element.role === 'action'));
  const branding = first(ad.elements.filter((element) => element.role === 'branding'));
  const primary = first(
    ad.elements.filter(
      (element): element is CopyElement => element.type === 'text' && element.role === 'primary',
    ),
  );

  if (!regions || !hero || !action || !primary || regions.hero.width < 28 || regions.hero.height < 28) {
    return { elements: output, valid: false, decisions, heroShare, readability: 0 };
  }

  const gap = clamp(Math.min(regions.copy.width, regions.copy.height) * 0.035, 6, 24);
  const tapTarget = Math.max(surface.minTapTarget ?? 40, 40);
  const actionMinFont = Math.max(surface.minTextSize ?? 13, 12);
  const actionFont = Math.max(actionMinFont, regions.copy.width * 0.037);
  const actionHeight = Math.max(tapTarget, actionFont * 2.4);
  const actionZone = regions.action ?? regions.copy;
  const desiredActionWidth = Math.max(
    measure(action.label, actionFont, 700) + actionHeight * 0.75,
    tapTarget * 1.9,
  );
  const actionWidth = Math.min(actionZone.width, desiredActionWidth);

  if (
    actionWidth < tapTarget ||
    actionHeight < tapTarget ||
    actionZone.height < actionHeight ||
    regions.copy.height < (regions.action ? 0 : actionHeight + gap) + textMinimum(primary, surface) * AD_LINE_HEIGHT
  ) {
    return { elements: output, valid: false, decisions, heroShare, readability: 0 };
  }

  const heroTarget = byId.get(hero.id)!;
  heroTarget.visible = true;
  heroTarget.status = 'placed';
  heroTarget.box = regions.hero;

  let top = regions.copy.y;
  const bottom = regions.copy.y + regions.copy.height;
  if (branding && included.has(branding.id)) {
    const fontSize = Math.max(surface.minTextSize ?? 13, regions.copy.width * 0.033);
    const brandingHeight = fontSize * AD_LINE_HEIGHT;
    if (top + brandingHeight + gap > bottom - (regions.action ? 0 : actionHeight + gap)) {
      return { elements: output, valid: false, decisions, heroShare, readability: 0 };
    }
    const brandTarget = byId.get(branding.id)!;
    brandTarget.visible = true;
    brandTarget.box = rect(regions.copy.x, top, regions.copy.width, brandingHeight);
    brandTarget.text = fitText(ad.brand, brandTarget.box, fontSize, surface.minTextSize ?? 13, 1, measure, 700);
    brandTarget.status = brandTarget.text.truncated ? 'truncated' : 'placed';
    top += brandingHeight + gap;
  }

  const actionBox = rect(actionZone.x, regions.action ? actionZone.y + (actionZone.height - actionHeight) / 2 : bottom - actionHeight, actionWidth, actionHeight);
  const actionText = fitText(
    action.label,
    inset(actionBox, Math.max(7, actionHeight * 0.18)),
    actionFont,
    actionMinFont,
    1,
    measure,
    700,
  );
  if (!allowShortening && actionText.truncated) return { elements: output, valid: false, decisions, heroShare, readability: 0 };
  const actionTarget = byId.get(action.id)!;
  actionTarget.visible = true;
  actionTarget.status = actionText.truncated ? 'truncated' : 'placed';
  actionTarget.box = actionBox;
  actionTarget.text = actionText;
  if (actionText.truncated) {
    decisions.push({
      stage: 'constraint',
      elementId: action.id,
      message: `${action.id} kept its tap-safe button and ellipsized the label to fit the available width.`,
    });
  }

  const textItems = copyElements(ad, included);
  const textBottom = regions.action ? bottom : actionTarget.box.y - gap;
  const minimumNeeded = textItems.reduce((sum, element, index) => {
    const lines = element.role === 'primary' ? 2 : 1;
    return sum + textMinimum(element, surface) * AD_LINE_HEIGHT * lines + (index ? gap * 0.55 : 0);
  }, 0);
  if (top + minimumNeeded > textBottom + 0.01) {
    return { elements: output, valid: false, decisions, heroShare, readability: 0 };
  }

  let readability = 0;
  for (let index = 0; index < textItems.length; index += 1) {
    const element = textItems[index];
    const remaining = textItems.slice(index + 1);
    const remainderMinimum = remaining.reduce(
      (sum, item) => sum + textMinimum(item, surface) * AD_LINE_HEIGHT + gap * 0.55,
      0,
    );
    const space = Math.max(
      textMinimum(element, surface) * AD_LINE_HEIGHT,
      textBottom - top - remainderMinimum,
    );
    const provisional = rect(regions.copy.x, top, regions.copy.width, space);
    const text = fitText(
      element.text,
      provisional,
      textPreferred(element, provisional, surface),
      textMinimum(element, surface),
      targetLines(element),
      measure,
      element.role === 'primary' || element.treatment === 'price' ? 700 : 500,
    );
    if (!allowShortening && (element.required || element.priority === 1) && text.truncated) {
      return { elements: output, valid: false, decisions, heroShare, readability: 0 };
    }
    const consumed = Math.min(
      provisional.height,
      Math.max(text.fontSize * text.lineHeight * text.lines.length, textMinimum(element, surface) * text.lineHeight),
    );
    const target = byId.get(element.id)!;
    target.visible = true;
    target.status = text.truncated ? 'truncated' : 'placed';
    target.box = rect(provisional.x, provisional.y, provisional.width, consumed);
    target.text = text;
    if (text.truncated) {
      decisions.push({
        stage: 'constraint',
        elementId: element.id,
        message: `${element.id} reached its line limit and was ellipsized cleanly.`,
      });
    }
    readability += text.fontSize;
    top += consumed + gap * 0.55;
  }

  const visible = output.filter((element) => element.visible && element.box);
  const textFits = visible.every(element => {
    if (!element.text) return true;
    const textBox = element.type === 'button' ? inset(element.box!, Math.max(7, element.box!.height * 0.18)) : element.box!;
    return element.text.lines.length * element.text.fontSize * element.text.lineHeight <= textBox.height + 0.001
      && element.text.lines.every(line => measure(line, element.text!.fontSize, element.text!.fontWeight) <= textBox.width - 2 + 0.001);
  });
  const valid = textFits && visible.every((element) => isWithin(element.box!, frame)) && visible.every(
    (element, index) => visible.slice(index + 1).every((other) => !overlaps(element.box!, other.box!)),
  );
  return { elements: output, valid, decisions, heroShare, readability };
}

function optionalElements(ad: AdSpec): AdElement[] {
  return ad.elements
    .filter((element) => !element.required && element.priority > 1 && element.role !== 'hero' && element.role !== 'action' && element.role !== 'primary')
    .sort(
      (left, right) =>
        right.priority - left.priority || roleRank[left.role] - roleRank[right.role],
    );
}

function resolveCandidate(
  ad: AdSpec,
  surface: SurfaceProfile,
  template: CandidateTemplate,
  measure: TextMeasurer,
  allowShortening: boolean,
): Attempt & { removed: AdElement[] } | null {
  const included = new Set(ad.elements.map((element) => element.id));
  const removals: AdElement[] = [];
  const degradable = optionalElements(ad);

  for (let removalIndex = 0; removalIndex <= degradable.length; removalIndex += 1) {
    for (let share = template.initialHeroShare; share >= template.minimumHeroShare - 0.0001; share -= template.step) {
      const result = attempt(ad, surface, template, included, Number(share.toFixed(3)), measure, allowShortening);
      if (result.valid) return { ...result, removed: removals };
    }
    const next = degradable[removalIndex];
    if (next) included.delete(next.id);
    if (next) removals.push(next);
  }
  return null;
}

function scoreCandidate(
  candidate: CandidateTemplate,
  surface: SurfaceProfile,
  result: Attempt & { removed: AdElement[] },
): number {
  const frame = safeFrame(surface);
  const aspect = frame.width / frame.height;
  const geometryFitness = 100 - Math.min(75, Math.abs(Math.log(aspect / candidate.targetAspect)) * 38);
  const visibilityReward = result.elements.filter((element) => element.visible).length * 7;
  const readabilityReward = result.readability * 0.16;
  const degradationPenalty = result.removed.reduce((sum, element) => sum + element.priority * 8, 0);
  const heroCompressionPenalty =
    ((candidate.initialHeroShare - result.heroShare) / candidate.step) * 2.5;
  return geometryFitness + visibilityReward + readabilityReward - degradationPenalty - heroCompressionPenalty;
}

/**
 * The framework-agnostic, priority-ordered layout resolver.
 *
 * It evaluates generic candidate compositions against a surface's dimensions,
 * safe areas, tap target, and text-size constraints. It never branches on a
 * profile id or name. When a candidate cannot fit, it first lets the hero
 * contract, then removes optional elements from the highest numeric priority
 * downward. Required elements remain protected.
 */
export function resolveLayout(ad: AdSpec, surface: SurfaceProfile, options: ResolveOptions = {}): ResolvedLayout {
  const frame = safeFrame(surface);
  const measure = options.measureText ?? estimateText;
  const collect = (allowShortening: boolean) => candidates
    .map((candidate) => {
      const result = resolveCandidate(ad, surface, candidate, measure, allowShortening);
      return result ? { candidate, result, score: scoreCandidate(candidate, surface, result) } : null;
    })
    .filter((choice): choice is NonNullable<typeof choice> => choice !== null)
    .sort((left, right) => right.score - left.score);
  let choices = collect(false);
  if (!choices.length) choices = collect(true);

  if (!choices.length) {
    throw new Error(
      `No valid layout can satisfy ${surface.name}. Increase usable area or relax its constraints.`,
    );
  }

  const selected = choices[0];
  const decisions: LayoutDecision[] = [
    {
      stage: 'input',
      message: `Resolved ${ad.elements.length} declarative elements inside ${Math.round(frame.width)} × ${Math.round(frame.height)} usable pixels.`,
    },
    {
      stage: 'candidate',
      message: `${selected.candidate.composition} won after scoring all generic composition candidates at ${selected.score.toFixed(1)}.`,
    },
    {
      stage: 'constraint',
      message: `Honored safe area, ${surface.minTextSize ?? 13}px minimum text, and ${surface.minTapTarget ?? 40}px action target.`,
    },
  ];
  if (selected.result.heroShare < selected.candidate.initialHeroShare) {
    decisions.push({
      stage: 'degradation',
      message: `Hero contracted to ${(selected.result.heroShare * 100).toFixed(0)}% of the composition before optional content was removed.`,
    });
  }
  for (const element of selected.result.removed) {
    const target = selected.result.elements.find((item) => item.id === element.id)!;
    target.reason = `Dropped at priority ${element.priority} to protect required content.`;
    decisions.push({
      stage: 'degradation',
      elementId: element.id,
      message: `${element.id} dropped at priority ${element.priority}; higher-priority content stays intact.`,
    });
  }
  decisions.push(...selected.result.decisions);
  decisions.push({
    stage: 'output',
    message: 'All visible boxes are bounded by the safe frame and mutually non-overlapping.',
  });

  return {
    surface,
    safeFrame: frame,
    composition: selected.candidate.composition,
    score: selected.score,
    elements: selected.result.elements,
    decisions,
    constraints: {
      minTapTarget: surface.minTapTarget ?? 40,
      minTextSize: surface.minTextSize ?? 13,
      safeAreaHonored: true,
    },
  };
}

export function assertResolvedLayout(layout: ResolvedLayout): void {
  const visible = layout.elements.filter((element) => element.visible && element.box);
  for (const element of visible) {
    if (!isWithin(element.box!, layout.safeFrame)) {
      throw new Error(`${element.id} escapes the safe frame.`);
    }
  }
  for (let index = 0; index < visible.length; index += 1) {
    for (const other of visible.slice(index + 1)) {
      if (overlaps(visible[index].box!, other.box!)) {
        throw new Error(`${visible[index].id} overlaps ${other.id}.`);
      }
    }
  }
}

export function degradationSummary(layout: ResolvedLayout): string {
  const dropped = layout.elements.filter((element) => !element.visible);
  const shortened = layout.elements.filter((element) => element.status === 'truncated');
  if (!dropped.length && !shortened.length) return 'All declared elements fit.';
  if (!dropped.length) return shortened.map((element) => element.id).join(', ') + ' shortened with an explicit ellipsis.';
  return `${dropped.map((element) => element.id).join(', ')} dropped by priority.`;
}
