// 地形色テーブル（Okabe-Ito基準の低彩度パレット＋パターン冗長化はcanvasAdapterの占領ハッチで補う）
export const TERRAIN_COLORS: Record<string, string> = {
  plains: '#8aa66a',
  hills: '#a8a05a',
  mountains: '#9b8f7d',
  urban: '#b0a2b8',
  forest: '#5f8f6a',
  desert: '#c2ab6f',
};

const TERRAIN_NAMES = ['plains', 'hills', 'mountains', 'urban', 'forest', 'desert'];

export function terrainOf(idx: number): string {
  return TERRAIN_NAMES[idx] ?? 'plains';
}
