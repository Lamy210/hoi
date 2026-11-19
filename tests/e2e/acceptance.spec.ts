// E2E受入テスト — docs/16の機能シナリオ相当＋外部ネットワーク要求ゼロ検査（A-8）
import { test, expect, type Page } from '@playwright/test';

const APP_URL = '/?e2e=1';

async function startAs(page: Page, countryId: string, seed = 20261114): Promise<void> {
  await page.goto(APP_URL);
  await page.click('[data-testid="btn-new-game"]');
  await expect(page.locator('[data-testid="scenario-card"]')).toBeVisible();
  await page.click('[data-testid="btn-to-country"]');
  await page.click(`[data-testid="country-${countryId}"]`);
  await page.fill('[data-testid="seed-input"]', String(seed));
  await page.click('[data-testid="btn-start"]');
  await expect(page.locator('[data-testid="date"]')).toContainText('2026-01-01');
  await expect(page.locator('[data-testid="map"]')).toBeVisible();
}

async function orbisStep(page: Page, ticks: number): Promise<number> {
  return page.evaluate((n) => (window as any).__orbis.step(n), ticks);
}

function provIndexOf(meta: { provIds: string[] }, id: string): number {
  const i = meta.provIds.indexOf(id);
  if (i < 0) throw new Error('province not found: ' + id);
  return i;
}

test('シナリオ: ゲーム開始（政治モードで5国家・110州の地図が表示される）', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('blob:') || url.startsWith('data:')) return; // インラインWorker/埋め込みリソース（同一Origin扱い）
    const u = new URL(url);
    if (!u.hostname.includes('localhost') && !u.hostname.includes('127.0.0.1')) external.push(url);
  });
  await startAs(page, 'JPN');
  const meta = await page.evaluate(() => (window as any).__orbis.appStore.get().meta);
  expect(meta.provIds.length).toBe(110);
  expect(meta.provIds).toContain('JP-13');
  expect(meta.provIds).toContain('KR-11');
  expect(meta.provIds).toContain('KP-01');
  expect(meta.provIds).toContain('CN-BJ');
  expect(meta.provIds).toContain('RU-KHA');
  // 州選択（地図クリックはジオメトリ依存のため、選択はストア経由で等価に検証し、
  // 地図の視覚描画はcanvas要素の存在とサイズで確認）
  // レンダラ（Canvas2D既定／MapLibreオプション）の初期化完了を待つ
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="map"] canvas').length > 0, undefined, { timeout: 20000 });
  const canvasCount = await page.evaluate(() => document.querySelectorAll('[data-testid="map"] canvas').length);
  expect(canvasCount).toBeGreaterThan(0);
  // 実際に描画されていること（黒画面回帰の検査: 色の多様性）
  await page.waitForFunction(() => {
    const c = document.querySelector('[data-testid="map"] canvas') as HTMLCanvasElement;
    if (!c) return false;
    const s2 = document.createElement('canvas');
    s2.width = 60;
    s2.height = 40;
    const ctx = s2.getContext('2d')!;
    ctx.drawImage(c, 0, 0, 60, 40);
    const d = ctx.getImageData(0, 0, 60, 40).data;
    const colors = new Set<number>();
    for (let i = 0; i < d.length; i += 40) colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return colors.size > 8;
  }, undefined, { timeout: 20000 });
  // 外部ネットワーク要求ゼロ（A-8）
  expect(external).toEqual([]);
});

test('シナリオ: 時間操作（×4で進行し、Space/速度ボタンで制御）', async ({ page }) => {
  await startAs(page, 'JPN');
  await page.click('[data-testid="speed-4"]');
  await page.waitForTimeout(800);
  await page.click('[data-testid="speed-0"]');
  const tick1 = await page.evaluate(() => (window as any).__orbis.appStore.get().snap.tick);
  expect(tick1).toBeGreaterThan(0);
  // 決定論ステップ（E2Eフック）
  const tick2 = await orbisStep(page, 50);
  expect(tick2).toBe(tick1 + 50);
  // 人力・装備が生産で増加している
  const mp = await page.evaluate(() => (window as any).__orbis.appStore.get().snap.countries[0].manpowerPool);
  const eq = await page.evaluate(() => (window as any).__orbis.appStore.get().snap.countries[0].infEquipmentStock);
  expect(mp).toBeGreaterThan(300000);
  expect(eq).toBeGreaterThan(32000);
});

test('シナリオ: 部隊作成→移動（合法性はエンジンが検証）', async ({ page }) => {
  await startAs(page, 'JPN');
  const ids = await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    const jp = app.snap.playerCountry;
    const tokyo = app.meta.provIds.indexOf('JP-13');
    const ibaraki = app.meta.provIds.indexOf('JP-08');
    (window as any).__orbis.command('createUnit', { country: jp, province: tokyo });
    return { jp, tokyo, ibaraki };
  });
  await orbisStep(page, 1);
  // 作成成功: 師団数7（開始6+1）
  let snap = await page.evaluate(() => (window as any).__orbis.appStore.get().snap);
  expect(snap.countries[ids.jp].divisions).toBe(7);
  // 東京→茨城へ移動命令（陸続き）
  const unitId = await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    const tokyo = app.meta.provIds.indexOf('JP-13');
    const u = app.snap.units.find((x: any) => x.loc === tokyo && x.owner === app.snap.playerCountry);
    (window as any).__orbis.command('moveUnits', { units: [u.id], target: app.meta.provIds.indexOf('JP-08') });
    return u.id;
  });
  await orbisStep(page, 10);
  snap = await page.evaluate(() => (window as any).__orbis.appStore.get().snap);
  const unit = snap.units.find((u: any) => u.id === unitId);
  expect(unit.loc).toBe(provIndexOf({ provIds: (await page.evaluate(() => (window as any).__orbis.appStore.get().meta)).provIds }, 'JP-08'));
  // 海越え（未開戦の韓国領）は却下されアラートが出る
  await page.evaluate((uid) => {
    const app = (window as any).__orbis.appStore.get();
    const seoul = app.meta.provIds.indexOf('KR-11');
    (window as any).__orbis.command('moveUnits', { units: [uid], target: seoul });
  }, unitId);
  await orbisStep(page, 1);
  const alerts = await page.evaluate(() => (window as any).__orbis.appStore.get().alertLog.map((a: any) => a.msgKey));
  expect(alerts).toContain('alert.commandRejected');
});

test('シナリオ: 宣戦→戦闘→占領→講和（決定論ステップで完走）', async ({ page }) => {
  await startAs(page, 'PRK');
  const state = await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    const prk = app.snap.playerCountry;
    const pyongyang = app.meta.provIds.indexOf('KP-01');
    const seoul = app.meta.provIds.indexOf('KR-11');
    for (let i = 0; i < 3; i++) {
      (window as any).__orbis.command('createUnit', { country: prk, province: pyongyang });
    }
    (window as any).__orbis.command('declareWar', { defender: 1 }); // KOR
    return { prk, seoul };
  });
  await orbisStep(page, 2);
  // 移動命令（平壌→ソウル）
  await page.evaluate(({ seoul }) => {
    const app = (window as any).__orbis.appStore.get();
    const pyongyang = app.meta.provIds.indexOf('KP-01');
    const ids = app.snap.units.filter((u: any) => u.owner === app.snap.playerCountry && u.loc === pyongyang).map((u: any) => u.id);
    (window as any).__orbis.command('moveUnits', { units: ids, target: seoul });
  }, state);
  // 進行: 移動＋戦闘＋占領14日（余裕を持って90日）
  await orbisStep(page, 90);
  const result = await page.evaluate(({ seoul }) => {
    const app = (window as any).__orbis.appStore.get();
    return {
      controller: app.snap.controller[seoul],
      owner: app.snap.owner[seoul],
      alerts: app.alertLog.map((a: any) => a.msgKey),
      wars: app.snap.wars.map((w: any) => w.status),
      warScoreA: app.snap.wars[0]?.scoreAggressor,
    };
  }, state);
  expect(result.alerts).toContain('alert.battleStarted');
  expect(result.controller).toBe(state.prk); // 占領
  expect(result.owner).toBe(1); // 領有はKORのまま（INV-1分離）
  expect(result.warScoreA).toBeGreaterThan(0);
  // 現状講和 → 占領地の解放（AIが先に提案してくる場合もあるため状態を見て受諾）
  await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    const war = app.snap.wars[0];
    if (war.status === 'active') {
      (window as any).__orbis.command('proposePeace', { warId: war.id });
    } else if (war.status === 'peaceOffered') {
      (window as any).__orbis.command('acceptPeace', { warId: war.id });
    }
  });
  await orbisStep(page, 2);
  const after = await page.evaluate(({ seoul }) => {
    const app = (window as any).__orbis.appStore.get();
    return { controller: app.snap.controller[seoul], wars: app.snap.wars.map((w: any) => w.status) };
  }, state);
  expect(after.wars.every((w: any) => w.status === 'ended')).toBe(true); // 終結した戦争はスナップショットから除外される
  expect(after.wars.length).toBe(0);
  expect(after.controller).toBe(1); // 白紙講和で解放
});

test('シナリオ: セーブ/ロード（往復後の状態一致）＋トレース表示', async ({ page }) => {
  await startAs(page, 'JPN');
  await orbisStep(page, 30);
  const saved = await page.evaluate(() => (window as any).__orbis.save());
  const tickAtSave = await page.evaluate(() => (window as any).__orbis.appStore.get().snap.tick);
  await orbisStep(page, 40);
  await page.evaluate((b) => (window as any).__orbis.load(b), Array.from(saved));
  const restored = await page.evaluate(() => (window as any).__orbis.appStore.get().snap.tick);
  expect(restored).toBe(tickAtSave);
  // トレース: 州の補給効率
  await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    app.selection && null;
    (window as any).__orbis.appStore.set({ selection: { prov: app.meta.provIds.indexOf('JP-13'), unitId: null, country: null } });
  });
  const trace = await page.evaluate(() => (window as any).__orbis.trace({ kind: 'provinceSupply', id: (window as any).__orbis.appStore.get().meta.provIds.indexOf('JP-13') }));
  expect(trace.title).toContain('補給');
  expect(trace.contribs.length).toBeGreaterThan(2);
});

test('シナリオ: ja/en多言語化（キー差分ゼロ・切替で全表示が英語）', async ({ page }) => {
  await startAs(page, 'JPN');
  await page.click('button:has-text("⚙")');
  await page.selectOption('[data-testid="lang-select"]', 'en');
  await expect(page.locator('[data-testid="btn-wars"]')).toContainText('Wars');
  await expect(page.locator('[data-testid="mode-political"]')).toContainText('Political');
  // 日本語へ戻す
  await page.selectOption('[data-testid="lang-select"]', 'ja');
  await expect(page.locator('[data-testid="btn-wars"]')).toContainText('戦争状況');
});

test('シナリオ: 戦線・生産配分・指揮官（Phase 2機能）', async ({ page }) => {
  await startAs(page, 'PRK');
  await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    const prk = app.snap.playerCountry;
    const pyongyang = app.meta.provIds.indexOf('KP-01');
    for (let i = 0; i < 3; i++) {
      (window as any).__orbis.command('createUnit', { country: prk, province: pyongyang });
    }
    (window as any).__orbis.command('declareWar', { defender: 1 });
    (window as any).__orbis.command('setProductionShare', { share: 0.4 });
  });
  await page.evaluate(() => (window as any).__orbis.step(2));
  const warOk = await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    return app.snap.wars.length > 0;
  });
  expect(warOk).toBe(true);
  // 戦線パネル: 作成→スタンス攻勢
  await page.click('[data-testid="btn-fronts-top"]');
  await page.click('[data-testid="btn-create-front"]');
  await page.evaluate(() => (window as any).__orbis.step(1));
  await page.waitForSelector('[data-testid="front-stance-attack"]');
  await page.click('[data-testid="front-stance-attack"]');
  // 師団を戦線へ割当（戦線AIは割当師団のみを運用する）
  await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    const frontId = app.snap.fronts[0].id;
    const ids = app.snap.units.filter((u: any) => u.owner === app.snap.playerCountry).map((u: any) => u.id);
    (window as any).__orbis.command('assignToFront', { units: ids, frontId });
  });
  await page.evaluate(() => (window as any).__orbis.step(1));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // 生産配分スライダが反映
  const share = await page.evaluate(() => (window as any).__orbis.appStore.get().snap.countries[2].productionShare);
  expect(share).toBeCloseTo(0.4, 5);
  // 指揮官が自動割当されている
  const cmdrAssigned = await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    return app.snap.units.some((u: any) => u.owner === app.snap.playerCountry && u.commanderId >= 0);
  });
  expect(cmdrAssigned).toBe(true);
  // 決定論ステップで戦線AIが師団を運用する（集結・攻勢のいずれかの命令がジャーナルに記録される）
  const beforeLocs = await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    return app.snap.units.filter((u: any) => u.owner === app.snap.playerCountry).map((u: any) => [u.id, u.loc]);
  });
  await page.evaluate(() => (window as any).__orbis.step(12));
  const frontActive = await page.evaluate(({ before }: any) => {
    const app = (window as any).__orbis.appStore.get();
    const beforeMap = new Map(before);
    const moved = app.snap.units.some((u: any) => u.owner === app.snap.playerCountry && (u.moving || u.loc !== beforeMap.get(u.id)));
    return moved;
  }, { before: beforeLocs });
  expect(frontActive).toBe(true);
});

test('性能: FPS計測（×8進行中に45fps以上）', async ({ page }) => {
  await startAs(page, 'JPN');
  await page.click('[data-testid="speed-8"]');
  const fps = await page.evaluate(async () => {
    let frames = 0;
    const start = performance.now();
    await new Promise<void>((res) => {
      const loop = () => {
        frames++;
        if (performance.now() - start >= 3000) res();
        else requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    return Math.round((frames / (performance.now() - start)) * 1000);
  });
  console.log('FPS:', fps);
  expect(fps).toBeGreaterThan(45);
  await page.click('[data-testid="speed-0"]');
});

test('シナリオ: 予算・法律・研究・スコア（Phase 3内政）', async ({ page }) => {
  await startAs(page, 'JPN');
  await page.click('[data-testid="btn-budget"]');
  await page.waitForSelector('[data-testid="budget-modal"]');
  // 税率スライダー
  await page.evaluate(() => (window as any).__orbis.command('setTaxRate', { rate: 0.4 }));
  await page.evaluate(() => (window as any).__orbis.step(1));
  await page.waitForTimeout(300);
  const tax = await page.evaluate(() => (window as any).__orbis.appStore.get().snap.countries[0].taxRate);
  expect(tax).toBeCloseTo(0.4, 5);
  // 研究開始
  await page.evaluate(() => (window as any).__orbis.command('startResearch', { techId: 'industry-basic' }));
  await page.evaluate(() => (window as any).__orbis.step(1));
  const researching = await page.evaluate(() => (window as any).__orbis.appStore.get().snap.countries[0].research.active.length);
  expect(researching).toBe(1);
  // 法律: PPは初期50でコスト50 → 回復後に制定
  await page.evaluate(() => (window as any).__orbis.command('enactLaw', { slot: 'economy', target: 2 }));
  await page.evaluate(() => (window as any).__orbis.step(1));
  const lawPending = await page.evaluate(() => (window as any).__orbis.appStore.get().snap.countries[0].lawPending);
  expect(lawPending).not.toBeNull();
  // スコアタブ: 5軸表示
  await page.click('[data-testid="budget-modal"] >> text=5軸スコア');
  const mil = await page.evaluate(() => (window as any).__orbis.appStore.get().snap.countries[0].scores.military);
  expect(mil).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
});

test('シナリオ: チュートリアル（ガイドが操作完了で直列進行）', async ({ page }) => {
  await startAs(page, 'JPN');
  // tut-1（開始直後・tick 2発火）がアラートフィードに存在（決定論ステップで進行）
  await page.evaluate(() => (window as any).__orbis.step(3));
  const hasTut1 = await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    return JSON.stringify(app.alertLog ?? []).includes('event.tut-1');
  });
  expect(hasTut1).toBe(true);
  // 師団作成 → tut-2
  await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    const jp = app.snap.playerCountry;
    const tokyo = app.meta.provIds.indexOf('JP-13');
    (window as any).__orbis.command('createUnit', { country: jp, province: tokyo });
  });
  await page.evaluate(() => (window as any).__orbis.step(2));
  const hasTut2 = await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    return JSON.stringify(app.alertLog ?? []).includes('event.tut-2');
  });
  expect(hasTut2).toBe(true);
});

test('シナリオ: AIの自律行動（判断ログの閲覧・開発者モード）', async ({ page }) => {
  await startAs(page, 'JPN');
  await page.click('button:has-text("⚙")');
  await page.click('[data-testid="toggle-devmode"]');
  await page.keyboard.press('Escape');
  await orbisStep(page, 40); // 40日 → 各AI国が数回思考
  await page.click('[data-testid="btn-ai"]');
  await page.waitForTimeout(500);
  const entries = await page.locator('.ai-log-entry').count();
  expect(entries).toBeGreaterThan(0);
});

test('シナリオ: 外交（条約提案→AI判断・関係トレース・Phase 4）', async ({ page }) => {
  await startAs(page, 'JPN');
  await page.click('[data-testid="btn-diplomacy"]');
  await page.waitForSelector('[data-testid="diplomacy-modal"]');
  // 関係タブにKORが表示される
  await page.waitForSelector('[data-testid="dip-rel-KOR"]');
  // 貿易協定を提案（AIが即時判断して締結する）
  await page.click('[data-testid="dip-propose-trade-KOR"]');
  await orbisStep(page, 2);
  const treatyState = await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    const tr = app.snap.treaties.find((t: any) => t.status === 'active' && t.type === 'trade');
    const alerts = app.alertLog.map((a: any) => a.msgKey);
    return { hasActive: !!tr, alerts, treaties: app.snap.treaties.length };
  });
  expect(treatyState.hasActive).toBe(true);
  expect(treatyState.alerts).toContain('alert.treatyAccepted');
  // 条約タブに締結済み条約が表示される
  await page.click('[data-testid="dip-tab-treaties"]');
  await page.waitForSelector('[data-testid^="dip-active-"]');
  // 関係トレースを表示
  await page.click('[data-testid="dip-tab-relations"]');
  await page.click('[data-testid="dip-trace-KOR"]');
  await page.waitForSelector('[data-testid="diplomacy-modal"] [data-testid="trace-box"]');
  const traceText = await page.locator('[data-testid="diplomacy-modal"] [data-testid="trace-box"]').textContent();
  expect(traceText).toContain('イデオロギー距離');
  await page.keyboard.press('Escape');
});

test('シナリオ: 講和会議（貢献度・領土要求・部分割譲）', async ({ page }) => {
  await startAs(page, 'PRK');
  await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    const prk = app.snap.playerCountry;
    const pyongyang = app.meta.provIds.indexOf('KP-01');
    for (let i = 0; i < 3; i++) {
      (window as any).__orbis.command('createUnit', { country: prk, province: pyongyang });
    }
    (window as any).__orbis.command('declareWar', { defender: 1 }); // KOR
  });
  await orbisStep(page, 2);
  await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    const pyongyang = app.meta.provIds.indexOf('KP-01');
    const seoul = app.meta.provIds.indexOf('KR-11');
    const ids = app.snap.units.filter((u: any) => u.owner === app.snap.playerCountry && u.loc === pyongyang).map((u: any) => u.id);
    (window as any).__orbis.command('moveUnits', { units: ids, target: seoul });
  });
  await orbisStep(page, 90); // 移動＋戦闘＋占領
  const warState = await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    const war = app.snap.wars[0];
    return {
      controller: app.snap.controller[app.meta.provIds.indexOf('KR-11')],
      player: app.snap.playerCountry,
      warId: war?.id,
      contrib: war ? Math.max(war.contribAggressor, war.contribDefender) : 0,
      status: war?.status,
    };
  });
  expect(warState.controller).toBe(warState.player);
  expect(warState.contrib).toBeGreaterThan(0);
  if (warState.status !== 'active') {
    // AIが講和を提案してきている場合は受諾せず拒否して会議を続ける
    await page.evaluate((id) => {
      (window as any).__orbis.command('declinePeace', { warId: id });
    }, warState.warId);
    await orbisStep(page, 1);
  }
  // 講和会議タブ: 貢献度表示・要求選択・提案
  await page.click('[data-testid="btn-diplomacy"]');
  await page.waitForSelector('[data-testid="diplomacy-modal"]');
  await page.click('[data-testid="dip-tab-peace"]');
  const contribText = await page.locator('[data-testid^="peace-contrib-"]').first().textContent();
  expect(Number(contribText?.split('/')[0])).toBeGreaterThan(0);
  // ソウル（首都）を要求
  const seoulIdx = await page.evaluate(() => (window as any).__orbis.appStore.get().meta.provIds.indexOf('KR-11'));
  await page.click(`[data-testid="peace-demand-${seoulIdx}"]`);
  await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    const war = app.snap.wars[0];
    (window as any).__orbis.command('proposePeace', { warId: war.id, demands: [app.meta.provIds.indexOf('KR-11')] });
  });
  await orbisStep(page, 2);
  const after = await page.evaluate(() => {
    const app = (window as any).__orbis.appStore.get();
    return {
      wars: app.snap.wars.map((w: any) => w.status),
      seoulOwner: app.snap.owner[app.meta.provIds.indexOf('KR-11')],
      player: app.snap.playerCountry,
    };
  });
  // 劣勢AI（首都を占領されている）は要求を受け入れ、領有が移転する
  expect(after.wars.every((w: any) => w.status === 'ended' || w === undefined) || after.wars.length === 0).toBe(true);
  expect(after.seoulOwner).toBe(after.player);
  await page.keyboard.press('Escape');
});
