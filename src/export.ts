'use client';

import { strToU8, zipSync } from 'fflate';
import type { AdSpec } from './spec.js';
import type { ResolvedElement, ResolvedLayout } from './resolver.js';
import type { SurfaceProfile } from './surfaces.js';
import { resolveLayout } from './resolver.js';

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);

function sourceFor(ad: AdSpec, resolved: ResolvedElement) {
  return ad.elements.find((element) => element.id === resolved.id);
}

function svgText(element: ResolvedElement, color: string): string {
  if (!element.box || !element.text) return '';
  const { box, text } = element;
  return `<text fill="${color}" font-family="Arial, Helvetica, sans-serif" font-size="${text.fontSize}" font-weight="${element.role === 'primary' ? 700 : element.role === 'secondary' ? 500 : 600}">${text.lines.map((line, index) => `<tspan x="${box.x}" y="${box.y + text.fontSize + index * text.fontSize * text.lineHeight}">${escapeXml(line)}</tspan>`).join('')}</text>`;
}

function heroSvg(
  ad: AdSpec,
  element: ResolvedElement,
  embeddedSource?: string,
): string {
  if (!element.box) return '';
  const { box } = element;
  const source = sourceFor(ad, element);
  if (source?.type === 'image' && source.role === 'hero' && (embeddedSource ?? source.src)) {
    return `<image href="${escapeXml(embeddedSource ?? source.src!)}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" preserveAspectRatio="xMidYMid slice"/>`;
  }
  const cx = box.x + box.width * 0.55;
  const cy = box.y + box.height * 0.48;
  if (ad.theme.artwork === 'runner') {
    return `<ellipse cx="${cx}" cy="${cy}" rx="${box.width * 0.42}" ry="${box.height * 0.22}" fill="${ad.theme.accent}" opacity=".25"/><path d="M${box.x + box.width * .1} ${box.y + box.height * .62} C${box.x + box.width * .35} ${box.y + box.height * .22}, ${box.x + box.width * .62} ${box.y + box.height * .8}, ${box.x + box.width * .9} ${box.y + box.height * .45} L${box.x + box.width * .83} ${box.y + box.height * .73} C${box.x + box.width * .5} ${box.y + box.height * .95}, ${box.x + box.width * .22} ${box.y + box.height * .83}, ${box.x + box.width * .1} ${box.y + box.height * .62}Z" fill="${ad.theme.accent}"/>`;
  }
  if (ad.theme.artwork === 'serum') {
    return `<ellipse cx="${cx}" cy="${cy}" rx="${box.width * .28}" ry="${box.height * .42}" fill="${ad.theme.accent}" opacity=".22"/><rect x="${box.x + box.width * .35}" y="${box.y + box.height * .22}" width="${box.width * .3}" height="${box.height * .62}" rx="${box.width * .08}" fill="#fff8f4" opacity=".94"/><rect x="${box.x + box.width * .42}" y="${box.y + box.height * .1}" width="${box.width * .16}" height="${box.height * .18}" rx="${box.width * .03}" fill="${ad.theme.accent}"/>`;
  }
  if (ad.theme.artwork === 'coffee') {
    return `<circle cx="${cx}" cy="${cy}" r="${Math.min(box.width, box.height) * .3}" fill="${ad.theme.accent}" opacity=".32"/><path d="M${cx - box.width * .23} ${cy - box.height * .14}h${box.width * .42}v${box.height * .36}h-${box.width * .42}z" fill="#f7e6c4"/><path d="M${cx + box.width * .19} ${cy - box.height * .04}c${box.width * .17} 0 ${box.width * .17} ${box.height * .2} 0 ${box.height * .2}" fill="none" stroke="#f7e6c4" stroke-width="${Math.max(4, box.width * .05)}"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${Math.min(box.width, box.height) * .31}" fill="none" stroke="${ad.theme.accent}" stroke-width="${Math.max(5, box.width * .1)}"/><circle cx="${cx - box.width * .31}" cy="${cy}" r="${Math.min(box.width, box.height) * .18}" fill="${ad.theme.accent}" opacity=".45"/><circle cx="${cx + box.width * .31}" cy="${cy}" r="${Math.min(box.width, box.height) * .18}" fill="${ad.theme.accent}" opacity=".45"/>`;
}

/** A portable export renderer fed by the same ResolvedLayout as the DOM. */
export function layoutToSvg(
  ad: AdSpec,
  layout: ResolvedLayout,
  embeddedHeroSource?: string,
): string {
  const { surface } = layout;
  const foreground = ad.theme.foreground ?? '#ffffff';
  const accentInk = ad.theme.accentInk ?? foreground;
  const body = layout.elements
    .filter((element) => element.visible)
    .map((element) => {
      if (element.role === 'hero') return heroSvg(ad, element, embeddedHeroSource);
      if (element.role === 'branding' && element.box) {
        return `<text x="${element.box.x}" y="${element.box.y + element.box.height * .76}" fill="${foreground}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(10, element.box.height * .48)}" font-weight="700" letter-spacing="${Math.max(1, element.box.height * .08)}">${escapeXml(ad.brand)}</text>`;
      }
      if (element.type === 'text') return svgText(element, foreground);
      if (element.type === 'button' && element.box) {
        return `<rect x="${element.box.x}" y="${element.box.y}" width="${element.box.width}" height="${element.box.height}" rx="${element.box.height / 2}" fill="${ad.theme.accent}"/>${svgText(element, accentInk)}`;
      }
      return '';
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${surface.width}" height="${surface.height}" viewBox="0 0 ${surface.width} ${surface.height}" role="img" aria-label="${escapeXml(`${ad.name} — ${surface.name}`)}"><rect width="${surface.width}" height="${surface.height}" fill="${ad.theme.background}"/>${body}</svg>`;
}

function heroSource(ad: AdSpec): string | undefined {
  const hero = ad.elements.find(
    (element) => element.type === 'image' && element.role === 'hero',
  );
  return hero?.src;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Image data was not text.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Produces a standalone SVG. Static project images are embedded as data URLs,
 * so a downloaded asset still renders after it leaves the demo website.
 */
export async function layoutToPortableSvg(
  ad: AdSpec,
  layout: ResolvedLayout,
): Promise<string> {
  const source = heroSource(ad);
  if (!source || source.startsWith('data:')) return layoutToSvg(ad, layout, source);
  const response = await fetch(source);
  if (!response.ok) throw new Error('The campaign hero asset could not be embedded.');
  const image = await response.blob();
  if (!/^image\/(png|jpeg|webp)$/i.test(image.type)) {
    throw new Error('The campaign hero asset is not an accepted image format.');
  }
  return layoutToSvg(ad, layout, await blobToDataUrl(image));
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
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG creation failed.'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export async function campaignKit(
  ad: AdSpec,
  profiles: readonly SurfaceProfile[],
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const manifest: Record<string, unknown>[] = [];
  for (const profile of profiles) {
    const layout = resolveLayout(ad, profile);
    const slug = profile.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    files[`assets/${slug}.svg`] = strToU8(await layoutToPortableSvg(ad, layout));
    manifest.push({
      surface: profile.name,
      dimensions: `${profile.width}×${profile.height}`,
      composition: layout.composition,
      dropped: layout.elements.filter((element) => !element.visible).map((element) => element.id),
    });
  }
  files['campaign.json'] = strToU8(JSON.stringify(ad, null, 2));
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  files['README.txt'] = strToU8('Surface Studio campaign kit. SVG exports are vector and use the same constraint resolver as the demo.');
  return new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' });
}
