import { defineAd, type AdSpec } from './spec.js';

export type CampaignPreset = {
  id: string;
  label: string;
  industry: string;
  spec: AdSpec;
};

const running = defineAd({
  id: 'halo-runner',
  name: 'First light / SS27',
  brand: 'HALO RUNNING',
  theme: {
    id: 'runner',
    name: 'First light',
    quote: '“Every road lets you begin again.”',
    background: '#152f39',
    foreground: '#fbfff8',
    accent: '#d8f76f',
    accentInk: '#14241d',
    artwork: 'runner',
  },
  elements: [
    { id: 'logo', type: 'image', role: 'branding', priority: 4, alt: 'Halo Running wordmark', mark: 'wordmark' },
    { id: 'headline', type: 'text', role: 'primary', priority: 1, required: true, treatment: 'headline', maxLines: 3, text: 'Run toward\nthe next version\nof you.' },
    { id: 'hero', type: 'image', role: 'hero', priority: 1, required: true, alt: 'Halo Trail 01 running shoe', src: '/assets/halo-trail-01.png', focalPoint: { x: 58, y: 56 } },
    { id: 'description', type: 'text', role: 'secondary', priority: 3, treatment: 'body', maxLines: 2, text: 'Trail 01 is tuned for the long way home.' },
    { id: 'price', type: 'text', role: 'secondary', priority: 2, treatment: 'price', maxLines: 1, text: '₹ 4,990' },
    { id: 'cta', type: 'button', role: 'action', priority: 2, required: true, label: 'Meet Trail 01', href: '#trail-01' },
  ],
});

const skincare = defineAd({
  id: 'veya-serum',
  name: 'Cloud ritual / 04',
  brand: 'VĒYA',
  theme: {
    id: 'serum',
    name: 'Soft signal',
    quote: '“Do not save the good light.”',
    background: '#f3e5de',
    foreground: '#38252f',
    accent: '#a24f68',
    accentInk: '#fff8f4',
    artwork: 'serum',
  },
  elements: [
    { id: 'logo', type: 'image', role: 'branding', priority: 4, alt: 'Veya wordmark', mark: 'wordmark' },
    { id: 'headline', type: 'text', role: 'primary', priority: 1, required: true, treatment: 'headline', maxLines: 3, text: 'Let your skin\nexhale.' },
    { id: 'hero', type: 'image', role: 'hero', priority: 1, required: true, alt: 'Veya Cloud Serum bottle', src: '/assets/veya-cloud-serum.png', focalPoint: { x: 58, y: 58 } },
    { id: 'description', type: 'text', role: 'secondary', priority: 3, treatment: 'body', maxLines: 2, text: 'A quiet layer of hydration for the way your day actually feels.' },
    { id: 'price', type: 'text', role: 'secondary', priority: 2, treatment: 'price', maxLines: 1, text: '₹ 1,840 · 30 ml' },
    { id: 'cta', type: 'button', role: 'action', priority: 2, required: true, label: 'Begin the ritual', href: '#cloud-serum' },
  ],
});

const coffee = defineAd({
  id: 'open-table-coffee',
  name: 'Morning belongs to you',
  brand: 'OPEN TABLE',
  theme: {
    id: 'coffee',
    name: 'Slow morning',
    quote: '“Good mornings do not hurry.”',
    background: '#4b3026',
    foreground: '#fff7e7',
    accent: '#f2c976',
    accentInk: '#39251e',
    artwork: 'coffee',
  },
  elements: [
    { id: 'logo', type: 'image', role: 'branding', priority: 4, alt: 'Open Table wordmark', mark: 'wordmark' },
    { id: 'headline', type: 'text', role: 'primary', priority: 1, required: true, treatment: 'headline', maxLines: 3, text: 'Make a little\nroom for morning.' },
    { id: 'hero', type: 'image', role: 'hero', priority: 1, required: true, alt: 'Open Table whole bean coffee bag and cup', src: '/assets/open-table-no7.png', focalPoint: { x: 58, y: 56 } },
    { id: 'description', type: 'text', role: 'secondary', priority: 3, treatment: 'body', maxLines: 2, text: 'Notes of cacao, apricot, and the first page of your day.' },
    { id: 'price', type: 'text', role: 'secondary', priority: 2, treatment: 'price', maxLines: 1, text: 'From ₹ 480' },
    { id: 'cta', type: 'button', role: 'action', priority: 2, required: true, label: 'Brew slower', href: '#open-table' },
  ],
});

const audio = defineAd({
  id: 'cerca-audio',
  name: 'Closer / listening room',
  brand: 'CERCA',
  theme: {
    id: 'audio',
    name: 'Listening room',
    quote: '“Stay close to the sound.”',
    background: '#202642',
    foreground: '#fbfcff',
    accent: '#a9c8ff',
    accentInk: '#17233b',
    artwork: 'audio',
  },
  elements: [
    { id: 'logo', type: 'image', role: 'branding', priority: 4, alt: 'Cerca Audio wordmark', mark: 'wordmark' },
    { id: 'headline', type: 'text', role: 'primary', priority: 1, required: true, treatment: 'headline', maxLines: 3, text: 'Keep the world\nout. Keep the music in.' },
    { id: 'hero', type: 'image', role: 'hero', priority: 1, required: true, alt: 'Cerca Studio headphones', src: '/assets/cerca-studio.png', focalPoint: { x: 62, y: 54 } },
    { id: 'description', type: 'text', role: 'secondary', priority: 3, treatment: 'body', maxLines: 2, text: 'Spatial sound, all-day comfort, and a room of your own.' },
    { id: 'price', type: 'text', role: 'secondary', priority: 2, treatment: 'price', maxLines: 1, text: '₹ 7,290' },
    { id: 'cta', type: 'button', role: 'action', priority: 2, required: true, label: 'Enter the room', href: '#cerca-studio' },
  ],
});

export const campaignPresets: CampaignPreset[] = [
  { id: 'runner', label: 'HALO / Trail 01', industry: 'Performance footwear', spec: running },
  { id: 'serum', label: 'VĒYA / Cloud Serum', industry: 'Skincare ritual', spec: skincare },
  { id: 'coffee', label: 'OPEN TABLE / No. 07', industry: 'Specialty coffee', spec: coffee },
  { id: 'audio', label: 'CERCA / Studio', industry: 'Listening technology', spec: audio },
];
