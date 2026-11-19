// キーボードショートカット（game-ui仕様）: Space=一時停止、1-5=速度、M=モード巡回、
// Ctrl+S=クイックセーブ、Esc=パネルを閉じる、F=州検索、?=ショートカット一覧
import { useEffect } from 'react';
import { appStore } from './store';

const MODES = ['political', 'terrain', 'supply'] as const;
const SPEEDS = [0, 1, 2, 4, 8];

export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      const st = appStore.get();
      if (st.screen !== 'game') return;
      if (e.code === 'Space') {
        e.preventDefault();
        appStore.set({ speed: st.speed === 0 ? 1 : 0 });
      } else if (e.key >= '1' && e.key <= '5') {
        const idx = Number(e.key) - 1;
        appStore.set({ speed: SPEEDS[idx] });
      } else if (e.key === 'm' || e.key === 'M') {
        const cur = MODES.indexOf(st.mapMode);
        appStore.set({ mapMode: MODES[(cur + 1) % MODES.length] });
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        appStore.set({ panel: 'saveLoad' });
      } else if (e.key === 'Escape') {
        appStore.set({ panel: null, selection: { prov: null, unitId: null, country: null }, trace: null });
      } else if (e.key === 'f' || e.key === 'F') {
        // 検索はGameScreenのボタン経由（ここではトグル代替なし）
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
