import type { ArtDirection } from './spec.js';

export type ProductAsset = { src: string; label: string; alt: string; category: ArtDirection };
export const productAssets: ProductAsset[] = [
  { src: '/assets/headphones-studio.png', label: 'Midnight / studio', alt: 'Black over-ear headphones in a navy studio', category: 'audio' },
  { src: '/assets/cerca-studio.png', label: 'Listening / atmosphere', alt: 'Cerca headphones on a studio pedestal', category: 'audio' },
  { src: '/assets/running-shoe-studio.png', label: 'Trail / side profile', alt: 'Teal and lime running shoe, complete side view', category: 'runner' },
  { src: '/assets/halo-trail-01.png', label: 'First light / campaign', alt: 'Halo running shoe campaign image', category: 'runner' },
  { src: '/assets/serum-studio.png', label: 'Amber / still life', alt: 'Amber serum bottle against a rose background', category: 'serum' },
  { src: '/assets/veya-cloud-serum.png', label: 'Cloud / campaign', alt: 'Veya Cloud Serum product photograph', category: 'serum' },
  { src: '/assets/open-table-no7.png', label: 'Morning / coffee', alt: 'Coffee bag and cup in a warm studio scene', category: 'coffee' },
];
