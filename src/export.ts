'use client';

import { strToU8, zipSync } from 'fflate';
import type { AdSpec, HeroImageElement } from './spec.js';
import { resolveLayout, type Rect, type ResolvedElement, type ResolvedLayout, type ResolveOptions } from './resolver.js';
import type { SurfaceProfile } from './surfaces.js';

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);

export type ImageSize = { width: number; height: number };
const defaultAssets = { runner: '/assets/running-shoe-studio.png', serum: '/assets/serum-studio.png', coffee: '/assets/open-table-no7.png', audio: '/assets/headphones-studio.png' };

function heroFor(ad: AdSpec): HeroImageElement {
  return ad.elements.find((element): element is HeroImageElement => element.type === 'image' && element.role === 'hero')!;
}

/** Matches CSS object-fit/object-position, including non-central cropping. */
export function imageGeometry(box: Rect, image: ImageSize, fit: 'cover' | 'contain', focal = { x: 50, y: 50 }): Rect {
  const scale = fit === 'cover'
    ? Math.max(box.width / image.width, box.height / image.height)
    : Math.min(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { x: box.x + (box.width - width) * focal.x / 100, y: box.y + (box.height - height) * focal.y / 100, width, height };
}

function svgText(element: ResolvedElement, color: string, centered = false): string {
  if (!element.box || !element.text) return '';
  const { box, text } = element;
  const x = centered ? box.x + box.width / 2 : box.x;
  // Arial's em ascent/descent are 0.905/0.212. Add half the CSS line leading.
  const baseline = text.fontSize * (0.905 + (text.lineHeight - 1.117) / 2);
  const firstY = centered ? box.y + (box.height - text.fontSize * text.lineHeight) / 2 : box.y;
  return '<text fill="' + color + '" font-family="Arial, Helvetica, sans-serif" font-size="' + text.fontSize + '" font-weight="' + text.fontWeight + '" text-anchor="' + (centered ? 'middle' : 'start') + '" xml:space="preserve">'
    + text.lines.map((line, index) => '<tspan x="' + x + '" y="' + (firstY + baseline + index * text.fontSize * text.lineHeight) + '">' + escapeXml(line) + '</tspan>').join('') + '</text>';
}

/** Pure second renderer. Browser export supplies decoded intrinsic image dimensions. */
export function layoutToSvg(ad: AdSpec, layout: ResolvedLayout, embeddedHeroSource?: string, imageSize?: ImageSize): string {
  const { surface } = layout;
  const foreground = ad.theme.foreground ?? '#ffffff';
  const hero = heroFor(ad);
  const source = embeddedHeroSource ?? hero.src ?? defaultAssets[ad.theme.artwork];
  const knownSource = hero.src ?? defaultAssets[ad.theme.artwork];
  const intrinsic = imageSize ?? (/(headphones|running-shoe|serum)-studio\.png$/.test(knownSource) ? { width: 1536, height: 1024 } : { width: 1024, height: 1536 });
  const body = layout.elements.filter(element => element.visible && element.box).map(element => {
    const box = element.box!;
    if (element.role === 'hero') {
      const image = imageGeometry(box, intrinsic, hero.fit ?? 'contain', hero.focalPoint);
      return '<defs><clipPath id="hero-clip"><rect x="' + box.x + '" y="' + box.y + '" width="' + box.width + '" height="' + box.height + '" rx="16"/></clipPath></defs>'
        + '<image href="' + escapeXml(source) + '" x="' + image.x + '" y="' + image.y + '" width="' + image.width + '" height="' + image.height + '" preserveAspectRatio="none" clip-path="url(#hero-clip)"/>';
    }
    if (element.type === 'button') {
      return '<rect x="' + box.x + '" y="' + box.y + '" width="' + box.width + '" height="' + box.height + '" rx="' + box.height / 2 + '" fill="' + ad.theme.accent + '"/>' + svgText(element, ad.theme.accentInk ?? '#111111', true);
    }
    const original = ad.elements.find(item => item.id === element.id);
    return svgText(element, original?.type === 'text' && original.treatment === 'price' ? ad.theme.accent : foreground);
  }).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + surface.width + '" height="' + surface.height + '" viewBox="0 0 ' + surface.width + ' ' + surface.height + '" role="img" aria-label="' + escapeXml(ad.name + ' — ' + surface.name) + '"><rect width="' + surface.width + '" height="' + surface.height + '" fill="' + ad.theme.background + '"/>' + body + '</svg>';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image data was not text.'));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image.'));
    reader.readAsDataURL(blob);
  });
}

export function decodeImage(source: string): Promise<ImageSize> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0
      ? resolve({ width: image.naturalWidth, height: image.naturalHeight })
      : reject(new Error('This image has no usable dimensions.'));
    image.onerror = () => reject(new Error('This image could not be decoded. Choose a valid PNG, JPEG or WebP.'));
    image.src = source;
  });
}

const embeddedCache = new Map<string, Promise<string>>();
async function embedSource(source: string): Promise<string> {
  if (source.startsWith('data:')) return source;
  let pending = embeddedCache.get(source);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(source);
      if (!response.ok) throw new Error('The product image could not be loaded for export.');
      const blob = await response.blob();
      if (!/^image\/(png|jpeg|webp)$/i.test(blob.type)) throw new Error('The product image has an unsupported format.');
      return blobToDataUrl(blob);
    })();
    embeddedCache.set(source, pending);
    pending.catch(() => embeddedCache.delete(source));
  }
  return pending;
}

/** Embeds the selected image so saved projects also work on another computer. */
export async function portableAd(ad: AdSpec): Promise<AdSpec> {
  const hero = heroFor(ad);
  const src = await embedSource(hero.src ?? defaultAssets[ad.theme.artwork]);
  return { ...ad, elements: ad.elements.map(element => element.id === hero.id ? { ...hero, src } : element) };
}

export async function layoutToPortableSvg(ad: AdSpec, layout: ResolvedLayout): Promise<string> {
  const hero = heroFor(ad);
  const source = await embedSource(hero.src ?? defaultAssets[ad.theme.artwork]);
  return layoutToSvg(ad, layout, source, await decodeImage(source));
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function layoutToPng(ad: AdSpec, layout: ResolvedLayout): Promise<Blob> {
  const svg = await layoutToPortableSvg(ad, layout);
  const sourceUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The SVG could not be rasterized.'));
      image.src = sourceUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = layout.surface.width;
    canvas.height = layout.surface.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas export is unavailable in this browser.');
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG creation failed.')), 'image/png'));
  } finally { URL.revokeObjectURL(sourceUrl); }
}

export async function campaignKit(ad: AdSpec, profiles: readonly SurfaceProfile[], options: ResolveOptions = {}): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const manifest: Record<string, unknown>[] = [];
  const portable = await portableAd(ad);
  const source = heroFor(portable).src!;
  const dimensions = await decodeImage(source);
  for (const profile of profiles) {
    const layout = resolveLayout(ad, profile, options);
    const slug = profile.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    files['assets/' + slug + '.svg'] = strToU8(layoutToSvg(ad, layout, source, dimensions));
    manifest.push({
      surface: profile.name, width: profile.width, height: profile.height, composition: layout.composition,
      dropped: layout.elements.filter(element => !element.visible).map(element => element.id),
      shortened: layout.elements.filter(element => element.text?.truncated).map(element => element.id),
      decisions: layout.decisions,
    });
  }
  files['campaign.json'] = strToU8(JSON.stringify(portable, null, 2));
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  files['README.txt'] = strToU8('Surface Studio campaign kit. Every SVG embeds its product image and preserves native surface dimensions. Text is vector; product photographs are raster. The manifest explains each composition and any degradation. Import campaign.json to continue editing.');
  return new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' });
}
