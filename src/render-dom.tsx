'use client';

import type { CSSProperties } from 'react';
import type { AdSpec, HeroImageElement } from './spec.js';
import type { Rect, ResolvedElement, ResolvedLayout } from './resolver.js';

type RendererProps = {
  ad: AdSpec;
  layout: ResolvedLayout;
  showSafeArea?: boolean;
  showBoxes?: boolean;
  onAction?: () => void;
};

function scaleStyle(box: Rect, layout: ResolvedLayout): CSSProperties {
  const { width, height } = layout.surface;
  return {
    left: `${(box.x / width) * 100}%`,
    top: `${(box.y / height) * 100}%`,
    width: `${(box.width / width) * 100}%`,
    height: `${(box.height / height) * 100}%`,
  };
}

function elementSource(ad: AdSpec, resolved: ResolvedElement) {
  return ad.elements.find((element) => element.id === resolved.id);
}

function HeroArtwork({ element, art }: { element: HeroImageElement; art: AdSpec['theme']['artwork'] }) {
  if (element.src) {
    const focal = element.focalPoint ?? { x: 50, y: 50 };
    // oxlint-disable-next-line next/no-img-element
    return <img className="hero-upload" src={element.src} alt={element.alt} style={{ objectPosition: `${focal.x}% ${focal.y}%` }} />;
  }
  // The procedural fallback is a visual region with a meaningful accessible label.
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    <div className={`hero-art hero-art-${art}`} aria-label={element.alt} role="img">
      <i className="art-glow art-glow-one" />
      <i className="art-glow art-glow-two" />
      <i className="art-object art-object-one" />
      <i className="art-object art-object-two" />
      <i className="art-detail art-detail-one" />
      <i className="art-detail art-detail-two" />
    </div>
  );
}

function Wordmark({ ad }: { ad: AdSpec }) {
  const initials = ad.brand
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 2);
  return (
    <span className="ad-wordmark" aria-label={`${ad.brand} logo`}>
      <i>{initials}</i>
      <b>{ad.brand}</b>
    </span>
  );
}

function VisibleElement({
  resolved,
  ad,
  layout,
  showBoxes,
  onAction,
}: {
  resolved: ResolvedElement;
  ad: AdSpec;
  layout: ResolvedLayout;
  showBoxes: boolean;
  onAction?: () => void;
}) {
  const source = elementSource(ad, resolved);
  if (!resolved.visible || !resolved.box || !source) return null;
  const debug = showBoxes ? 'show-element-bounds' : '';
  const style = scaleStyle(resolved.box, layout);
  if (source.type === 'image' && source.role === 'hero') {
    return (
      <div className={`ad-element ad-hero ${debug}`} style={style} data-element={source.id}>
        <HeroArtwork element={source} art={ad.theme.artwork} />
      </div>
    );
  }
  if (source.type === 'image' && source.role === 'branding') {
    return (
      <div className={`ad-element ad-brand ${debug}`} style={style} data-element={source.id}>
        <Wordmark ad={ad} />
      </div>
    );
  }
  if (source.type === 'text' && resolved.text) {
    return (
      <div
        className={`ad-element ad-copy ad-copy-${source.treatment ?? 'body'} ${resolved.status === 'truncated' ? 'is-truncated' : ''} ${debug}`}
        style={{
          ...style,
          fontSize: `calc(var(--ad-unit) * ${resolved.text.fontSize})`,
          lineHeight: resolved.text.lineHeight,
        }}
        data-element={source.id}
      >
        {resolved.text.lines.map((line, index) => (
          <span key={`${source.id}-${index}`}>{line}</span>
        ))}
      </div>
    );
  }
  if (source.type === 'button' && resolved.text) {
    return (
      <button
        type="button"
        className={`ad-element ad-action ${debug}`}
        style={{
          ...style,
          fontSize: `calc(var(--ad-unit) * ${resolved.text.fontSize})`,
        }}
        onClick={onAction}
        data-element={source.id}
      >
        {resolved.text.lines.join(' ')} <span aria-hidden="true">↗</span>
      </button>
    );
  }
  return null;
}

/**
 * DOM renderer only: every position, size and font scale comes from
 * ResolvedLayout. It has no surface id checks and no responsive layout rules.
 */
export function ResolvedAd({
  ad,
  layout,
  showSafeArea = false,
  showBoxes = false,
  onAction,
}: RendererProps) {
  const { surface, safeFrame } = layout;
  const canvasStyle = {
    aspectRatio: `${surface.width} / ${surface.height}`,
    '--ad-unit': `calc(100cqw / ${surface.width})`,
  } as CSSProperties;
  return (
    <div
      className={`resolved-ad theme-${ad.theme.id}`}
      style={{ ...canvasStyle, background: ad.theme.background, color: ad.theme.foreground ?? '#ffffff' }}
      aria-label={`${ad.name} on ${surface.name}`}
    >
      <div className="ad-atmosphere" aria-hidden="true" />
      {layout.elements
        .filter((element) => element.role === 'hero')
        .map((element) => (
          <VisibleElement key={element.id} resolved={element} ad={ad} layout={layout} showBoxes={showBoxes} onAction={onAction} />
        ))}
      {layout.elements
        .filter((element) => element.role !== 'hero')
        .map((element) => (
          <VisibleElement key={element.id} resolved={element} ad={ad} layout={layout} showBoxes={showBoxes} onAction={onAction} />
        ))}
      {showSafeArea && <div className="safe-area" style={scaleStyle(safeFrame, layout)} aria-hidden="true" />}
    </div>
  );
}
