/**
 * Declarative input types for the layout engine. The resolver never receives
 * React elements or CSS rules: it receives this portable content spec only.
 */
export const elementRoles = [
  'primary',
  'hero',
  'action',
  'branding',
  'secondary',
] as const;

export type ElementRole = (typeof elementRoles)[number];
export type Priority = 1 | 2 | 3 | 4;
export type ArtDirection = 'runner' | 'serum' | 'coffee' | 'audio';

type ElementBase<
  TType extends 'text' | 'image' | 'button',
  TRole extends ElementRole,
> = {
  /** Stable identifier, used by renderers and diagnostics. */
  id: string;
  type: TType;
  role: TRole;
  /** 1 is most important. Larger numbers are removed first under pressure. */
  priority: Priority;
  /** Required elements are never intentionally dropped by degradation. */
  required?: boolean;
};

export type CopyElement = ElementBase<'text', 'primary' | 'secondary'> & {
  text: string;
  /** A semantic treatment, not a surface-specific placement instruction. */
  treatment?: 'headline' | 'body' | 'price' | 'eyebrow';
  maxLines?: number;
};

export type HeroImageElement = ElementBase<'image', 'hero'> & {
  alt: string;
  /** An uploaded local data URL may replace the built-in art direction. */
  src?: string;
  focalPoint?: { x: number; y: number };
};

export type BrandingImageElement = ElementBase<'image', 'branding'> & {
  alt: string;
  mark?: 'monogram' | 'wordmark';
};

export type ActionElement = ElementBase<'button', 'action'> & {
  label: string;
  href?: string;
};

export type AdElement =
  | CopyElement
  | HeroImageElement
  | BrandingImageElement
  | ActionElement;

export type CampaignTheme = {
  id: string;
  name: string;
  quote: string;
  background: string;
  foreground?: string;
  accent: string;
  accentInk?: string;
  artwork: ArtDirection;
};

export type AdSpec<TElements extends readonly AdElement[] = readonly AdElement[]> = {
  id: string;
  name: string;
  brand: string;
  theme: CampaignTheme;
  elements: TElements;
};

export class SpecValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpecValidationError';
  }
}

const safeHex = /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i;
const requiredRoles: ElementRole[] = ['primary', 'hero', 'action', 'branding'];
const textTreatments = ['headline', 'body', 'price', 'eyebrow'] as const;
const brandingMarks = ['monogram', 'wordmark'] as const;

function isSafeActionHref(value: string): boolean {
  return value.startsWith('#') || value.startsWith('/') || /^https?:\/\//i.test(value);
}

function fail(message: string): never {
  throw new SpecValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPriority(value: unknown): value is Priority {
  return Number.isInteger(value) && typeof value === 'number' && value >= 1 && value <= 4;
}

function validateElementShape(element: AdElement): void {
  const id = element.id;
  if (!id.trim()) fail('Every element needs a non-empty id.');
  if (!isPriority(element.priority)) fail(`${id} has an invalid priority.`);
  if (element.type === 'text') {
    if (element.role !== 'primary' && element.role !== 'secondary') {
      fail(`${id} uses an invalid role for text.`);
    }
    if (!element.text.trim()) fail(`${id} needs text content.`);
    if (element.treatment && !textTreatments.includes(element.treatment)) {
      fail(`${id} has an invalid text treatment.`);
    }
    if (element.maxLines !== undefined && (!Number.isInteger(element.maxLines) || element.maxLines < 1 || element.maxLines > 6)) {
      fail(`${id} has an invalid line limit.`);
    }
  }
  if (element.type === 'button') {
    if (element.role !== 'action') fail(`${id} uses an invalid role for a button.`);
    if (!element.label.trim()) fail(`${id} needs a button label.`);
    if (element.href && !isSafeActionHref(element.href)) {
      fail(`${id} has an unsafe action link.`);
    }
  }
  if (element.type === 'image') {
    if (element.role !== 'hero' && element.role !== 'branding') {
      fail(`${id} uses an invalid role for an image.`);
    }
    if (!element.alt.trim()) fail(`${id} needs meaningful alternative text.`);
    if (element.role === 'hero') {
      if (!isLocalRasterSource(element.src)) fail(`${id} has an unsafe image source.`);
      const focal = element.focalPoint;
      if (focal && (!Number.isFinite(focal.x) || !Number.isFinite(focal.y) || focal.x < 0 || focal.x > 100 || focal.y < 0 || focal.y > 100)) {
        fail(`${id} has an invalid focal point.`);
      }
    }
    if (element.role === 'branding' && element.mark && !brandingMarks.includes(element.mark)) {
      fail(`${id} has an invalid branding mark.`);
    }
  }
}

/**
 * Defines a typed campaign and performs a defensive runtime validation for
 * imported/untyped data. TypeScript catches invalid role/type combinations at
 * authoring time because AdElement is a discriminated union.
 */
export function defineAd<const TElements extends readonly AdElement[]>(
  spec: AdSpec<TElements>,
): AdSpec<TElements> {
  if (!isRecord(spec) || !isRecord(spec.theme) || !Array.isArray(spec.elements)) {
    fail('An ad spec needs a theme and an element list.');
  }
  if (!spec.id.trim()) fail('An ad spec needs a non-empty id.');
  if (!spec.name.trim()) fail('An ad spec needs a non-empty name.');
  if (!spec.brand.trim()) fail('An ad spec needs a non-empty brand name.');
  if (!spec.theme.id.trim() || !spec.theme.name.trim() || !spec.theme.quote.trim()) {
    fail('A theme needs an id, name, and quote.');
  }
  if (
    !safeHex.test(spec.theme.background) ||
    !safeHex.test(spec.theme.accent) ||
    (spec.theme.foreground !== undefined && !safeHex.test(spec.theme.foreground)) ||
    (spec.theme.accentInk !== undefined && !safeHex.test(spec.theme.accentInk))
  ) {
    fail('Theme colors must be three- or six-digit hex colors.');
  }
  if (spec.elements.length === 0) fail('An ad spec needs at least one element.');

  const ids = new Set<string>();
  const presentRoles = new Set<ElementRole>();
  const roleCounts = new Map<ElementRole, number>();
  for (const element of spec.elements) {
    validateElementShape(element);
    if (ids.has(element.id)) fail(`Duplicate element id: ${element.id}.`);
    ids.add(element.id);
    presentRoles.add(element.role);
    roleCounts.set(element.role, (roleCounts.get(element.role) ?? 0) + 1);
  }
  for (const role of requiredRoles) {
    if (!presentRoles.has(role)) fail(`An ad spec needs a ${role} element.`);
    if (roleCounts.get(role) !== 1) fail(`An ad spec needs exactly one ${role} element.`);
  }
  return spec;
}

export function isLocalRasterSource(value: string | undefined): boolean {
  return (
    value === undefined ||
    value === '' ||
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) ||
    /^\/assets\/[a-z0-9-]+\.(png|jpe?g|webp)$/i.test(value)
  );
}

export function updateElementText(
  spec: AdSpec,
  id: string,
  value: string,
): AdSpec {
  return {
    ...spec,
    elements: spec.elements.map((element) => {
      if (element.id !== id) return element;
      if (element.type === 'text') return { ...element, text: value };
      if (element.type === 'button') return { ...element, label: value };
      return element;
    }),
  };
}

export function withHeroSource(spec: AdSpec, src: string): AdSpec {
  return {
    ...spec,
    elements: spec.elements.map((element) =>
      element.type === 'image' && element.role === 'hero' ? { ...element, src } : element,
    ),
  };
}

/** Parses untyped JSON at the file-import boundary before it reaches the resolver. */
export function parseAd(value: unknown): AdSpec {
  if (!isRecord(value) || !isRecord(value.theme) || !Array.isArray(value.elements)) {
    fail('Unsupported project structure.');
  }
  const { theme } = value;
  const string = (input: unknown, name: string) => {
    if (typeof input !== 'string') fail(`${name} must be a string.`);
    return input;
  };
  const parseElement = (input: unknown): AdElement => {
    if (!isRecord(input)) fail('Every element must be an object.');
    const type = string(input.type, 'element type');
    const role = string(input.role, 'element role');
    const base = {
      id: string(input.id, 'element id'),
      type,
      role,
      priority: input.priority,
      required: input.required,
    };
    if (!isPriority(base.priority)) fail(`${base.id} has an invalid priority.`);
    if (base.required !== undefined && typeof base.required !== 'boolean') fail(`${base.id} has an invalid required flag.`);
    if (type === 'text') {
      if (role !== 'primary' && role !== 'secondary') fail(`${base.id} uses an invalid role for text.`);
      const treatment = input.treatment;
      if (treatment !== undefined && (typeof treatment !== 'string' || !textTreatments.includes(treatment as (typeof textTreatments)[number]))) fail(`${base.id} has an invalid text treatment.`);
      const maxLines = input.maxLines;
      if (maxLines !== undefined && (!Number.isInteger(maxLines) || typeof maxLines !== 'number' || maxLines < 1 || maxLines > 6)) fail(`${base.id} has an invalid line limit.`);
      return { id: base.id, type: 'text', role, priority: base.priority, ...(base.required === undefined ? {} : { required: base.required }), text: string(input.text, `${base.id} text`), ...(treatment === undefined ? {} : { treatment: treatment as CopyElement['treatment'] }), ...(maxLines === undefined ? {} : { maxLines }) };
    }
    if (type === 'button') {
      if (role !== 'action') fail(`${base.id} uses an invalid role for a button.`);
      const href = input.href;
      if (href !== undefined && (typeof href !== 'string' || !isSafeActionHref(href))) fail(`${base.id} has an unsafe action link.`);
      return { id: base.id, type: 'button', role: 'action', priority: base.priority, ...(base.required === undefined ? {} : { required: base.required }), label: string(input.label, `${base.id} label`), ...(href === undefined ? {} : { href }) };
    }
    if (type === 'image') {
      if (role === 'hero') {
        const src = input.src;
        if (src !== undefined && (typeof src !== 'string' || !isLocalRasterSource(src))) fail(`${base.id} has an unsafe image source.`);
        const focalPoint = input.focalPoint;
        if (focalPoint !== undefined && (!isRecord(focalPoint) || typeof focalPoint.x !== 'number' || typeof focalPoint.y !== 'number')) fail(`${base.id} has an invalid focal point.`);
        return { id: base.id, type: 'image', role: 'hero', priority: base.priority, ...(base.required === undefined ? {} : { required: base.required }), alt: string(input.alt, `${base.id} alt`), ...(src === undefined ? {} : { src }), ...(focalPoint === undefined ? {} : { focalPoint: focalPoint as { x: number; y: number } }) };
      }
      if (role === 'branding') {
        const mark = input.mark;
        if (mark !== undefined && (typeof mark !== 'string' || !brandingMarks.includes(mark as (typeof brandingMarks)[number]))) fail(`${base.id} has an invalid branding mark.`);
        return { id: base.id, type: 'image', role: 'branding', priority: base.priority, ...(base.required === undefined ? {} : { required: base.required }), alt: string(input.alt, `${base.id} alt`), ...(mark === undefined ? {} : { mark: mark as BrandingImageElement['mark'] }) };
      }
      fail(`${base.id} uses an invalid role for an image.`);
    }
    fail(`Unsupported element type: ${type}.`);
  };
  const artwork = string(theme.artwork, 'theme artwork');
  if (!['runner', 'serum', 'coffee', 'audio'].includes(artwork)) fail('Theme has an invalid artwork treatment.');
  return defineAd({
    id: string(value.id, 'ad id'),
    name: string(value.name, 'ad name'),
    brand: string(value.brand, 'brand'),
    theme: {
      id: string(theme.id, 'theme id'),
      name: string(theme.name, 'theme name'),
      quote: string(theme.quote, 'theme quote'),
      background: string(theme.background, 'theme background'),
      accent: string(theme.accent, 'theme accent'),
      ...(theme.foreground === undefined ? {} : { foreground: string(theme.foreground, 'theme foreground') }),
      ...(theme.accentInk === undefined ? {} : { accentInk: string(theme.accentInk, 'theme accent ink') }),
      artwork: artwork as ArtDirection,
    },
    elements: value.elements.map(parseElement),
  });
}
