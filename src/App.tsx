'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronRight,
  Code2,
  Download,
  Grid2X2,
  ImagePlus,
  Layers3,
  Maximize2,
  MonitorCog,
  MousePointerClick,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Upload,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';
import { campaignPresets } from './campaigns';
import { campaignKit, downloadBlob, layoutToPng, layoutToPortableSvg } from './export';
import { degradationSummary, resolveLayout, type ResolvedLayout } from './resolver';
import { ResolvedAd } from './render-dom';
import {
  isLocalRasterSource,
  parseAd,
  updateElementText,
  withHeroSource,
  type ActionElement,
  type AdSpec,
  type CopyElement,
  type HeroImageElement,
} from './spec';
import { demoSurfaces, makeInterviewSurface, type SurfaceProfile, type ViewingDistance } from './surfaces';

type CustomForm = {
  width: string;
  height: string;
  safeEdge: string;
  minTextSize: string;
  minTapTarget: string;
  touchOnly: boolean;
  viewingDistance: ViewingDistance;
};

const initialCustom: CustomForm = {
  width: '720',
  height: '320',
  safeEdge: '24',
  minTextSize: '16',
  minTapTarget: '48',
  touchOnly: true,
  viewingDistance: 'arm-length',
};

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
}) {
  return (
    <label className="field field-number">
      <span>{label}</span>
      <input type="number" value={value} min={min} max={max} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function statusFor(layout: ResolvedLayout) {
  const dropped = layout.elements.filter((element) => !element.visible).length;
  const truncated = layout.elements.filter((element) => element.status === 'truncated').length;
  if (dropped) return { label: `${dropped} element${dropped === 1 ? '' : 's'} degraded`, tone: 'warning' };
  if (truncated) return { label: 'Copy shortened safely', tone: 'warning' };
  return { label: 'Constraints satisfied', tone: 'success' };
}

function copyById(ad: AdSpec, id: string): CopyElement | undefined {
  return ad.elements.find(
    (element): element is CopyElement =>
      element.type === 'text' && element.id === id,
  );
}

function actionById(ad: AdSpec, id: string): ActionElement | undefined {
  return ad.elements.find(
    (element): element is ActionElement =>
      element.type === 'button' && element.id === id,
  );
}

function heroElement(ad: AdSpec): HeroImageElement | undefined {
  return ad.elements.find(
    (element): element is HeroImageElement =>
      element.type === 'image' && element.role === 'hero',
  );
}

function SurfaceCard({
  profile,
  ad,
  selected,
  showGuides,
  showBoxes,
  onSelect,
  onAction,
}: {
  profile: SurfaceProfile;
  ad: AdSpec;
  selected: boolean;
  showGuides: boolean;
  showBoxes: boolean;
  onSelect: () => void;
  onAction?: () => void;
}) {
  const layout = useMemo(() => resolveLayout(ad, profile), [ad, profile]);
  const status = statusFor(layout);
  return (
    <article className={`surface-card ${selected ? 'is-selected' : ''}`}>
      <button className="surface-card-top surface-select" type="button" onClick={onSelect} aria-pressed={selected} aria-label={`Inspect ${profile.name}`}>
        <span>
          <b>{profile.name}</b>
          <small>{profile.context}</small>
        </span>
        <span className={`surface-health ${status.tone}`}><i />{status.label}</span>
      </button>
      <div className="surface-ad-wrap" onClick={onSelect} role="presentation">
        <ResolvedAd ad={ad} layout={layout} showSafeArea={showGuides} showBoxes={showBoxes} onAction={onAction} />
      </div>
      <div className="surface-card-bottom">
        <span>{layout.composition} composition</span>
        <span>{profile.touchOnly ? `${layout.constraints.minTapTarget}px tap` : `${layout.constraints.minTextSize}px min type`}</span>
      </div>
    </article>
  );
}

export default function App() {
  const [activePreset, setActivePreset] = useState(campaignPresets[0].id);
  const [ad, setAd] = useState<AdSpec>(campaignPresets[0].spec);
  const [history, setHistory] = useState<AdSpec[]>([]);
  const [future, setFuture] = useState<AdSpec[]>([]);
  const [selectedSurfaceId, setSelectedSurfaceId] = useState('mobile-interstitial');
  const [focusMode, setFocusMode] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  const [showBoxes, setShowBoxes] = useState(false);
  const [customForm, setCustomForm] = useState<CustomForm>(initialCustom);
  const [customSurface, setCustomSurface] = useState<SurfaceProfile | null>(null);
  const [notice, setNotice] = useState('');
  const [exporting, setExporting] = useState<'png' | 'svg' | 'kit' | null>(null);
  const [restored, setRestored] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);

  const profiles = useMemo(
    () => (customSurface ? [...demoSurfaces, customSurface] : [...demoSurfaces]),
    [customSurface],
  );
  const selected = profiles.find((profile) => profile.id === selectedSurfaceId) ?? profiles[0];
  const resolved = useMemo(() => resolveLayout(ad, selected), [ad, selected]);
  const resolvedStatus = statusFor(resolved);

  const commit = (next: AdSpec) => {
    setHistory((entries) => [...entries.slice(-29), ad]);
    setFuture([]);
    setAd(next);
  };

  const undo = () => {
    if (!history.length) return;
    const previous = history[history.length - 1];
    setFuture((entries) => [ad, ...entries]);
    setHistory((entries) => entries.slice(0, -1));
    setAd(previous);
    setNotice('Previous edit restored.');
  };

  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setHistory((entries) => [...entries, ad]);
    setFuture((entries) => entries.slice(1));
    setAd(next);
    setNotice('Edit reapplied.');
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem('adaptive-layout-lab-v1');
        if (raw) {
          const parsed = JSON.parse(raw) as { preset?: unknown; ad?: unknown };
          if (parsed.ad) {
            setAd(parseAd(parsed.ad));
            setActivePreset(typeof parsed.preset === 'string' ? parsed.preset : 'custom');
            setNotice('Restored your local working copy.');
          }
        }
      } catch {
        setNotice('A previous local copy could not be restored.');
      } finally {
        setRestored(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!restored) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem('adaptive-layout-lab-v1', JSON.stringify({ preset: activePreset, ad }));
      } catch {
        setNotice('Browser storage is full. Download the JSON project to preserve this version.');
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [activePreset, ad, restored]);

  function selectPreset(id: string) {
    const preset = campaignPresets.find((item) => item.id === id);
    if (!preset) return;
    setActivePreset(id);
    commit(preset.spec);
    setNotice(`${preset.label} is now the single shared ad specification.`);
  }

  function setCopy(id: string, value: string) {
    commit(updateElementText(ad, id, value));
  }

  async function chooseImage(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2_000_000) {
      setNotice('Choose a PNG, JPG or WebP under 2 MB.');
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('Image data was not text.'));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      if (!isLocalRasterSource(dataUrl)) throw new Error('Unsafe image source.');
      commit(withHeroSource(ad, dataUrl));
      setActivePreset('custom');
      setNotice('Your local image now drives the hero element across every surface.');
    } catch {
      setNotice('That image could not be processed.');
    }
  }

  function createCustomSurface() {
    try {
      const profile = makeInterviewSurface({
        width: Number(customForm.width),
        height: Number(customForm.height),
        safeEdge: Number(customForm.safeEdge),
        minTextSize: Number(customForm.minTextSize),
        minTapTarget: Number(customForm.minTapTarget),
        touchOnly: customForm.touchOnly,
        viewingDistance: customForm.viewingDistance,
      });
      setCustomSurface(profile);
      setSelectedSurfaceId(profile.id);
      setFocusMode(true);
      setNotice('New unknown surface resolved with the same engine path.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The custom surface is not valid.');
    }
  }

  async function downloadPng() {
    setExporting('png');
    try {
      const png = await layoutToPng(ad, resolved);
      downloadBlob(`${ad.id}-${selected.id}.png`, png);
      setNotice(`Full-resolution ${selected.name} PNG exported.`);
    } catch {
      setNotice('PNG export did not complete. SVG export is still available.');
    } finally {
      setExporting(null);
    }
  }

  async function downloadSvg() {
    setExporting('svg');
    try {
      const svg = await layoutToPortableSvg(ad, resolved);
      downloadBlob(`${ad.id}-${selected.id}.svg`, new Blob([svg], { type: 'image/svg+xml' }));
      setNotice(`Portable ${selected.name} SVG exported.`);
    } catch {
      setNotice('SVG export did not complete. Check the selected hero image and try again.');
    } finally {
      setExporting(null);
    }
  }

  async function downloadKit() {
    setExporting('kit');
    try {
      const kit = await campaignKit(ad, profiles);
      downloadBlob(`${ad.id}-adaptive-kit.zip`, kit);
      setNotice('Campaign kit saved with one SVG for every active surface and a resolution manifest.');
    } catch {
      setNotice('The campaign kit could not be created.');
    } finally {
      setExporting(null);
    }
  }

  function saveProject() {
    downloadBlob(`${ad.id}-project.json`, new Blob([JSON.stringify(ad, null, 2)], { type: 'application/json' }));
    setNotice('Project JSON saved. Import it later to continue working.');
  }

  async function importProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > 4_000_000) throw new Error('Project exceeds the 4 MB limit.');
      const parsed = parseAd(JSON.parse(await file.text()));
      commit(parsed);
      setActivePreset('custom');
      setNotice('Project imported. The resolver will re-check every surface now.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Project import failed.');
    }
  }

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <a href="#lab" className="brand-lockup" aria-label="Adaptive Layout Lab home">
          <span className="brand-glyph"><Layers3 size={20} /></span>
          <span>adaptive<span>/</span>layout</span>
        </a>
        <div className="top-breadcrumb"><span>FLAM Frontend R&amp;D</span><ChevronRight size={14} /><b>Constraint lab</b></div>
        <div className="top-actions">
          <span className="engine-live"><i /> RESOLVER ACTIVE</span>
          <button className="icon-button" type="button" title="Import project JSON" onClick={() => jsonInput.current?.click()}><Upload size={17} /></button>
          <button className="button button-quiet" type="button" onClick={saveProject}><Save size={16} /> Save JSON</button>
        </div>
      </header>

      <section className="lab-header" id="lab">
        <div>
          <span className="eyebrow"><Zap size={13} /> ADAPTIVE LAYOUT ENGINE / 01</span>
          <h1>One ad spec. <em>Every real-world surface.</em></h1>
          <p>Constraint-aware placement chooses a composition, protects high-priority content, and makes its trade-offs visible.</p>
        </div>
        <div className="header-controls">
          <button className="icon-button" type="button" disabled={!history.length} onClick={undo} title="Undo"><RotateCcw size={17} /></button>
          <button className="icon-button" type="button" disabled={!future.length} onClick={redo} title="Redo"><Redo2 size={17} /></button>
          <i className="bar-divider" />
          <button className="button button-quiet" type="button" disabled={exporting !== null} onClick={() => void downloadSvg()}><Download size={16} /> SVG</button>
          <button className="button button-accent" type="button" disabled={exporting !== null} onClick={() => void downloadPng()}><ArrowDownToLine size={16} /> {exporting === 'png' ? 'Rendering…' : 'Export PNG'} <span>{selected.name}</span></button>
        </div>
      </section>

      <div className="lab-grid">
        <aside className="control-rail">
          <div className="panel-heading"><SlidersHorizontal size={17} /><h2>Content spec</h2><span>typed</span></div>
          <div className="rail-scroll">
            <section className="rail-section">
              <p className="section-kicker">REALISTIC CAMPAIGN THEMES</p>
              <div className="theme-list">
                {campaignPresets.map((preset) => (
                  <button key={preset.id} className={`theme-choice theme-choice-${preset.id} ${activePreset === preset.id ? 'selected' : ''}`} type="button" onClick={() => selectPreset(preset.id)}>
                    <i /><span><b>{preset.label}</b><small>{preset.industry}</small></span><Check size={15} />
                  </button>
                ))}
              </div>
              <blockquote>{ad.theme.quote}</blockquote>
            </section>

            <section className="rail-section content-fields">
              <p className="section-kicker">DECLARATIVE ELEMENTS <span>06</span></p>
              <label className="field"><span>Brand / logo</span><input value={ad.brand} maxLength={32} onChange={(event) => commit({ ...ad, brand: event.target.value })} /></label>
              <label className="field"><span>Headline <small>priority 1 · protected</small></span><textarea rows={3} maxLength={120} value={copyById(ad, 'headline')?.text ?? ''} onChange={(event) => setCopy('headline', event.target.value)} /></label>
              <label className="field"><span>Body copy <small>priority 3 · optional</small></span><textarea rows={2} maxLength={150} value={copyById(ad, 'description')?.text ?? ''} onChange={(event) => setCopy('description', event.target.value)} /></label>
              <div className="compact-fields">
                <label className="field"><span>Price <small>priority 2</small></span><input maxLength={32} value={copyById(ad, 'price')?.text ?? ''} onChange={(event) => setCopy('price', event.target.value)} /></label>
                <label className="field"><span>CTA <small>required</small></span><input maxLength={36} value={actionById(ad, 'cta')?.label ?? ''} onChange={(event) => setCopy('cta', event.target.value)} /></label>
              </div>
            </section>

            <section className="rail-section">
              <p className="section-kicker">HERO IMAGE</p>
              <button type="button" className="image-upload" onClick={() => imageInput.current?.click()}><ImagePlus size={21} /><b>{heroElement(ad)?.src ? 'Replace local hero image' : 'Add a local hero image'}</b><small>PNG, JPG or WebP · max 2 MB</small></button>
              <p className="rail-note"><Sparkles size={15} /> Built-in art direction keeps every theme presentation-ready without external assets.</p>
            </section>
          </div>
        </aside>

        <section className="canvas-column">
          <div className="canvas-toolbar">
            <div><Grid2X2 size={17} /><h2>{focusMode ? selected.name : 'Live surface matrix'}</h2><span className="count-pill">{focusMode ? '01' : String(profiles.length).padStart(2, '0')}</span></div>
            <div className="canvas-tools">
              <label className="toggle-label"><span>Safe areas</span><input type="checkbox" checked={showGuides} onChange={(event) => setShowGuides(event.target.checked)} /></label>
              <label className="toggle-label"><span>Boxes</span><input type="checkbox" checked={showBoxes} onChange={(event) => setShowBoxes(event.target.checked)} /></label>
              <button className={`view-button ${!focusMode ? 'selected' : ''}`} type="button" onClick={() => setFocusMode(false)} title="Show all surfaces"><Grid2X2 size={16} /></button>
              <button className={`view-button ${focusMode ? 'selected' : ''}`} type="button" onClick={() => setFocusMode(true)} title="Focus selected surface"><Maximize2 size={16} /></button>
            </div>
          </div>
          <div className="matrix-caption"><span><i /> SAME SPEC · FRESH RESOLUTION</span><span>Click any surface to inspect the decision trace <ArrowUpRight size={13} /></span></div>
          <div className={`surface-matrix ${focusMode ? 'focus' : ''}`}>
            {(focusMode ? [selected] : profiles).map((profile) => <SurfaceCard key={profile.id} profile={profile} ad={ad} selected={profile.id === selected.id} showGuides={showGuides} showBoxes={showBoxes} onSelect={() => { setSelectedSurfaceId(profile.id); setFocusMode(true); }} onAction={() => setNotice(`${actionById(ad, 'cta')?.label ?? 'Action'} activated on ${profile.name}.`)} />)}
          </div>
          <footer className="canvas-footer"><span><i /> All visible boxes are bounded and non-overlapping</span><span><Code2 size={14} /> DOM renderer consumes resolved coordinates only</span></footer>
        </section>

        <aside className="inspector-rail">
          <div className="panel-heading"><MonitorCog size={17} /><h2>Resolution inspector</h2></div>
          <div className="inspector-scroll">
            <section className="selected-surface">
              <span className="section-kicker">SELECTED SURFACE</span>
              <h2>{selected.name}<ArrowUpRight size={19} /></h2>
              <p>{selected.context}</p>
              <div className="constraint-grid"><div><small>USABLE AREA</small><b>{Math.round(resolved.safeFrame.width)}<em>px</em> × {Math.round(resolved.safeFrame.height)}<em>px</em></b></div><div><small>VIEWING</small><b>{selected.viewingDistance}</b></div><div><small>MIN TYPE</small><b>{resolved.constraints.minTextSize}<em>px</em></b></div><div><small>MIN TAP</small><b>{resolved.constraints.minTapTarget}<em>px</em></b></div></div>
            </section>

            <section className="composition-card">
              <span className="section-kicker">CHOSEN CANDIDATE</span>
              <div className="composition-title"><span className={`composition-mark composition-${resolved.composition}`}><i /><i /><i /></span><div><b>{resolved.composition}</b><small>score {resolved.score.toFixed(1)} · generic geometry</small></div></div>
              <p>{resolved.composition === 'stack' ? 'Hero leads vertically; copy flows beneath the image.' : resolved.composition === 'split' ? 'Copy and product divide the available width.' : 'A compact lateral composition preserves far-view readability.'}</p>
            </section>

            <section className={`health-card ${resolvedStatus.tone}`}><span><Check size={18} /></span><div><b>{resolvedStatus.label}</b><p>{degradationSummary(resolved)}</p></div></section>

            <section className="layout-elements">
              <p className="section-kicker">ELEMENT RESOLUTION</p>
              {resolved.elements.sort((left, right) => left.priority - right.priority).map((element) => (
                <div key={element.id} className={`element-row ${element.visible ? '' : 'dropped'}`}><span className={`role-dot role-${element.role}`} /><div><b>{element.id}</b><small>{element.type} · p{element.priority}{element.text ? ` · ${Math.round(element.text.fontSize)}px` : ''}</small></div><em>{element.visible ? element.status : 'dropped'}</em></div>
              ))}
            </section>

            <section className="decision-trace">
              <p className="section-kicker">DECISION TRACE</p>
              <ol>{resolved.decisions.map((decision, index) => <li key={`${decision.stage}-${index}`}><i>{index + 1}</i><span>{decision.message}</span></li>)}</ol>
            </section>

            <section className="export-box"><button className="button button-quiet full" type="button" disabled={exporting !== null} onClick={() => void downloadKit()}><Download size={16} /> {exporting === 'kit' ? 'Packaging…' : 'Export campaign kit'}</button><p>One SVG per active profile, the declarative spec, and a layout manifest.</p></section>
          </div>
        </aside>
      </div>

      <section className="unknown-lab">
        <div className="unknown-copy"><span className="eyebrow"><WandSparkles size={13} /> INTERVIEW MODE</span><h2>Hand the engine a surface it has never seen.</h2><p>These values create a new typed profile at runtime. The resolver receives only constraints, not a profile name or a special layout rule.</p></div>
        <div className="unknown-controls">
          <NumberInput label="Width" value={customForm.width} min={96} max={3840} onChange={(value) => setCustomForm((form) => ({ ...form, width: value }))} />
          <NumberInput label="Height" value={customForm.height} min={72} max={3840} onChange={(value) => setCustomForm((form) => ({ ...form, height: value }))} />
          <NumberInput label="Safe edge" value={customForm.safeEdge} min={0} max={240} onChange={(value) => setCustomForm((form) => ({ ...form, safeEdge: value }))} />
          <NumberInput label="Min type" value={customForm.minTextSize} min={10} max={96} onChange={(value) => setCustomForm((form) => ({ ...form, minTextSize: value }))} />
          <NumberInput label="Min tap" value={customForm.minTapTarget} min={24} max={120} onChange={(value) => setCustomForm((form) => ({ ...form, minTapTarget: value }))} />
          <label className="field field-select"><span>Viewing distance</span><select value={customForm.viewingDistance} onChange={(event) => setCustomForm((form) => ({ ...form, viewingDistance: event.target.value as ViewingDistance }))}><option value="near">Near</option><option value="arm-length">Arm-length</option><option value="far">Far</option></select></label>
          <label className="check-field"><input type="checkbox" checked={customForm.touchOnly} onChange={(event) => setCustomForm((form) => ({ ...form, touchOnly: event.target.checked }))} /><span><MousePointerClick size={15} /> Touch-only surface</span></label>
          <button className="button button-accent" type="button" onClick={createCustomSurface}><Plus size={16} /> Resolve unknown surface</button>
        </div>
      </section>

      <input ref={imageInput} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(event) => { void chooseImage(event.target.files?.[0]); event.target.value = ''; }} />
      <input ref={jsonInput} type="file" hidden accept="application/json,.json" onChange={(event) => { void importProject(event.target.files?.[0]); event.target.value = ''; }} />
      {notice && <output className="app-notice"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={16} /></button></output>}
    </main>
  );
}
