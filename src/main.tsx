import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { appStore } from './ui/store';
import { engineClient } from './ui/engineClient';
import { useHotkeys } from './ui/hotkeys';

function Root() {
  useHotkeys();
  return <App />;
}

const root = createRoot(document.getElementById('root')!);
root.render(<Root />);

// E2E/dev hooks（?e2e=1 のみ有効。外部には公開しない決定論的ステップ実行）
if ((import.meta.env.DEV || import.meta.env.MODE === 'e2e') &&
    typeof location !== 'undefined' && new URLSearchParams(location.search).get('e2e') === '1') {
  (window as unknown as Record<string, unknown>).__orbis = {
    appStore,
    engineClient,
    step(n: number): Promise<number> {
      const before = appStore.get().snap?.tick ?? -1;
      engineClient.step(n, appStore.get().lastAlertId);
      return new Promise((resolve) => {
        const check = () => {
          const now = appStore.get().snap?.tick ?? -1;
          if (now >= before + n) resolve(now);
          else setTimeout(check, 30);
        };
        check();
      });
    },
    command: (type: string, p: Record<string, unknown>) => engineClient.command(type, p),
    async trace(req: { kind: string; id: number }) {
      return engineClient.trace(req as never);
    },
    async save(): Promise<number[]> {
      const r = await engineClient.save();
      return Array.from(r.buf);
    },
    async load(arr: number[]): Promise<boolean> {
      const r = await engineClient.load(new Uint8Array(arr));
      return r.ok;
    },
  };
}
