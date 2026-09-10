'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AdSpec } from './spec.js';
import type { Rect, ResolvedLayout } from './resolver.js';
import { AD_FONT } from './typography.js';
import { previewGeometry } from './preview-geometry.js';

type RendererProps = {
  ad: AdSpec;
  layout: ResolvedLayout;
  showSafeArea?: boolean;
  showBoxes?: boolean;
  onAction?: () => void;
};

function boxStyle(box: Rect): CSSProperties {
  return { left: box.x, top: box.y, width: box.width, height: box.height };
}

/** Native-pixel renderer. Parent previews may uniformly scale this whole canvas. */
export function ResolvedAd({ ad, layout, showSafeArea = false, showBoxes = false, onAction }: RendererProps) {
  const canvasStyle = {
    width: layout.surface.width, height: layout.surface.height,
    background: ad.theme.background, color: ad.theme.foreground ?? '#ffffff',
    fontFamily: AD_FONT,
    '--theme-accent': ad.theme.accent,
    '--theme-accent-ink': ad.theme.accentInk ?? '#111111',
  } as CSSProperties;
  return (
    <div className="resolved-ad" style={canvasStyle} aria-label={ad.name + ' on ' + layout.surface.name} data-native-width={layout.surface.width} data-native-height={layout.surface.height}>
      {layout.elements.filter(element => element.visible && element.box).map(element => {
        const source = ad.elements.find(item => item.id === element.id);
        if (!source || !element.box) return null;
        const style: CSSProperties = {
          ...boxStyle(element.box),
          ...(element.text ? { fontSize: element.text.fontSize, fontWeight: element.text.fontWeight, lineHeight: element.text.lineHeight } : {}),
        };
        const debug = showBoxes ? ' show-element-bounds' : '';
        if (source.type === 'image' && source.role === 'hero') {
          const fallback = { runner: '/assets/running-shoe-studio.png', serum: '/assets/serum-studio.png', coffee: '/assets/open-table-no7.png', audio: '/assets/headphones-studio.png' }[ad.theme.artwork];
          const focal = source.focalPoint ?? { x: 50, y: 50 };
          return (
            <div key={source.id} className={'ad-element ad-hero' + debug} style={style} data-element={source.id}>
              {/* Native local images keep this renderer independent of the hosting framework. */}
              {/* oxlint-disable-next-line next/no-img-element */}
              <img className="hero-upload" src={source.src || fallback} alt={source.alt} style={{ objectFit: source.fit ?? 'contain', objectPosition: focal.x + '% ' + focal.y + '%' }} onError={event => { if (event.currentTarget.getAttribute('src') !== fallback) event.currentTarget.src = fallback; }} />
            </div>
          );
        }
        if (!element.text) return null;
        if (source.type === 'button') return (
          <button key={source.id} type="button" className={'ad-element ad-action' + debug} style={style} onClick={onAction} data-element={source.id} aria-label={source.label} title={element.text.truncated ? source.label : undefined}>
            {element.text.lines.join(' ')}
          </button>
        );
        const content = source.type === 'text' ? source.text : ad.brand;
        return (
          <div key={source.id} className={'ad-element ad-copy' + (source.type === 'text' && source.treatment === 'price' ? ' ad-copy-price' : '') + debug} style={style} data-element={source.id} aria-label={content} title={element.text.truncated ? content : undefined}>
            {element.text.lines.map((line, index) => <span key={index} style={{ height: element.text!.fontSize * element.text!.lineHeight }}>{line}</span>)}
          </div>
        );
      })}
      {showSafeArea && <div className="safe-area" style={boxStyle(layout.safeFrame)} aria-hidden="true" />}
    </div>
  );
}

/** One scale for x/y geometry AND typography, including capped tall previews. */
export function PosterPreview(props: RendererProps & { maxHeight?: number; nativeSize?: boolean }) {
  const { maxHeight = 480, nativeSize = false } = props;
  const container = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(280);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(entries => setAvailableWidth(entries[0].contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const geometry = nativeSize
    ? { scale: 1, width: props.layout.surface.width, height: props.layout.surface.height }
    : previewGeometry(props.layout.surface.width, props.layout.surface.height, availableWidth, maxHeight);
  return (
    <div ref={container} className={'poster-preview' + (nativeSize ? ' native-size' : '')}>
      <div className="poster-preview-frame" style={{ width: geometry.width, height: geometry.height }}>
        <div className="poster-preview-stage" style={{ transform: 'scale(' + geometry.scale + ')' }}>
          <ResolvedAd {...props} />
        </div>
      </div>
    </div>
  );
}
