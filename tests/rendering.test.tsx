import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { campaignPresets } from '../src/campaigns.js';
import { demoSurfaces, makeInterviewSurface } from '../src/surfaces.js';
import { resolveLayout, type ResolvedLayout } from '../src/resolver.js';
import { ResolvedAd } from '../src/render-dom.js';
import { previewGeometry } from '../src/preview-geometry.js';
import { estimateText, type TextMeasurer } from '../src/typography.js';
import { imageGeometry, layoutToSvg } from '../src/export.js';
import { productAssets } from '../src/assets.js';
import { parseAd } from '../src/spec.js';
import { resolveSafely } from '../src/resolve-safely.js';

function assertTextFits(layout: ResolvedLayout, measure: TextMeasurer) {
  for (const element of layout.elements) {
    if (!element.visible || !element.text || !element.box) continue;
    const inset = element.type === 'button' ? Math.max(7, element.box.height * 0.18) : 0;
    assert.ok(element.text.lines.length * element.text.fontSize * element.text.lineHeight <= element.box.height - inset * 2 + 0.001, element.id + ' line boxes fit vertically');
    for (const line of element.text.lines) {
      assert.ok(measure(line, element.text.fontSize, element.text.fontWeight) <= element.box.width - inset * 2 - 2 + 0.001, element.id + ' line fits horizontally: ' + line);
    }
  }
}

void test('tall preview height limits scale typography and both axes by the same factor', () => {
  for (const surface of demoSurfaces) {
    for (const width of [180, 280, 720]) {
      const preview = previewGeometry(surface.width, surface.height, width, 480);
      assert.ok(Math.abs(preview.width / preview.height - surface.width / surface.height) < 1e-9);
      assert.ok(preview.width <= width && preview.height <= 480);
      assert.equal(preview.width, surface.width * preview.scale);
      assert.equal(preview.height, surface.height * preview.scale);
    }
  }
});

void test('DOM emits native canvas dimensions and the exact resolved line metrics', () => {
  const ad = campaignPresets[3].spec;
  const layout = resolveLayout(ad, demoSurfaces[0]);
  const html = renderToStaticMarkup(<ResolvedAd ad={ad} layout={layout} />);
  assert.ok(html.includes('width:390px;height:844px'));
  assert.ok(!html.includes('cqw'));
  for (const element of layout.elements.filter(item => item.visible && item.text)) {
    assert.ok(html.includes('font-size:' + element.text!.fontSize + 'px'));
    assert.ok(html.includes('line-height:' + element.text!.lineHeight));
  }
  const css = readFileSync('app/globals.css', 'utf8');
  assert.ok(!/\.ad-copy\s*\{[^}]*display:\s*flex/.test(css), 'text line boxes cannot be flex-shrunk');
});

void test('all campaigns honor both horizontal and vertical text bounds with injected measurement', () => {
  const measured: TextMeasurer = (text, size, weight) => estimateText(text, size, weight) * 1.12;
  const families = new Set<string>();
  for (const { spec } of campaignPresets) for (const surface of demoSurfaces) {
    const layout = resolveLayout(spec, surface, { measureText: measured });
    assertTextFits(layout, measured);
    families.add(layout.composition);
  }
  assert.equal(families.size, 4, 'four genuinely different region arrangements are used');
});

void test('a single oversized glyph or ellipsis never passes as a valid narrow layout', () => {
  const surface = makeInterviewSurface({ width: 96, height: 600, safeEdge: 0, minTextSize: 64, minTapTarget: 40, touchOnly: true });
  const result = resolveSafely(campaignPresets[0].spec, surface);
  if (result.layout) assertTextFits(result.layout, estimateText);
  else assert.match(result.error, /No valid layout/);
});

void test('SVG shares centered CTA, resolved branding metrics, escaped copy and accent price', () => {
  const original = campaignPresets[0].spec;
  const ad = { ...original, brand: 'A & B <studio>' };
  const layout = resolveLayout(ad, demoSurfaces[0]);
  const svg = layoutToSvg(ad, layout);
  assert.ok(svg.includes('A &amp; B &lt;studio&gt;'));
  const action = layout.elements.find(element => element.type === 'button')!;
  assert.ok(svg.includes('text-anchor="middle"'));
  assert.ok(svg.includes('x="' + (action.box!.x + action.box!.width / 2) + '"'));
  assert.ok(svg.includes('<text fill="' + ad.theme.accent + '"'));
  assert.ok(svg.includes('clip-path="url(#hero-clip)"'));
});

void test('contain preserves the whole image and cover honors focal position without distortion', () => {
  const box = { x: 10, y: 20, width: 300, height: 100 };
  assert.deepEqual(imageGeometry(box, { width: 100, height: 200 }, 'contain'), { x: 135, y: 20, width: 50, height: 100 });
  assert.deepEqual(imageGeometry(box, { width: 100, height: 200 }, 'cover', { x: 0, y: 100 }), { x: 10, y: -480, width: 300, height: 600 });
});

void test('every library photograph exists as a real PNG with useful resolution', () => {
  assert.equal(productAssets.length, 7);
  for (const asset of productAssets) {
    const bytes = readFileSync('public' + asset.src);
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    assert.ok(header.getUint32(16) >= 1024 && header.getUint32(20) >= 1024);
  }
});

void test('JSON round trip preserves image fit and rejects unsupported fit modes', () => {
  const original = campaignPresets[0].spec;
  const ad = { ...original, elements: original.elements.map(element => element.role === 'hero' ? { ...element, fit: 'contain' as const } : element) };
  assert.deepEqual(parseAd(JSON.parse(JSON.stringify(ad))), ad);
  assert.throws(() => parseAd({ ...ad, elements: ad.elements.map(element => element.role === 'hero' ? { ...element, fit: 'stretch' } : element) }), /Image fit/);
});
