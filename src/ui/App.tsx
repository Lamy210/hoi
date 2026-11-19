// アプリルータ＋タイトル/シナリオ/国家選択画面
import { useEffect, useSyncExternalStore, useState } from 'react';
import { appStore, type AppState } from './store';
import { t } from './i18n';
import { GameScreen } from './GameScreen';
import { SettingsModal } from './panels';
import { listScenarios, getPack, engineClient, type ScenarioInfo } from './engineClient';
import type { Pack } from '../engine/scenario/types';
import './styles.css';

export function useApp(): AppState {
  return useSyncExternalStore(appStore.subscribe, appStore.get);
}

function TitleScreen() {
  const st = useApp();
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="screen">
      <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: 2 }}>Orbis</div>
      <div className="screen-sub">{t(st.lang, 'app.tagline')}</div>
      <div className="row" style={{ flexDirection: 'column', gap: 8 }}>
        <button
          className="primary"
          data-testid="btn-new-game"
          style={{ padding: '10px 30px', fontSize: 16 }}
          onClick={async () => {
            setNote(null);
            try {
              const infos = await listScenarios();
              appStore.set({ screen: 'scenario', scenarioNote: null });
              void infos;
            } catch (err) {
              setNote(String(err));
            }
          }}
        >
          {t(st.lang, 'title.newGame')}
        </button>
        <button data-testid="btn-title-settings" onClick={() => appStore.set({ panel: 'settings', screen: 'title' })}>
          {t(st.lang, 'common.settings')}
        </button>
      </div>
      {note && <div className="muted" role="alert">{note}</div>}
      {st.panel === 'settings' && <SettingsModal />}
    </div>
  );
}

function ScenarioScreen() {
  const st = useApp();
  const [info, setInfo] = useState<ScenarioInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void listScenarios().then((arr) => {
      if (!active) return;
      if (!arr[0]) setError('No available scenario');
      else setInfo(arr[0]);
    }).catch((err) => { if (active) setError(String(err)); });
    return () => { active = false; };
  }, []);
  const lang = st.lang;
  return (
    <div className="screen">
      <div className="screen-title">{t(lang, 'scenario.select')}</div>
      {error && <div className="card" style={{ color: '#e08b84' }}>{error}</div>}
      {info && (
        <div className="card" data-testid="scenario-card">
          <h3>{lang === 'ja' ? info.nameJa : info.nameEn} (v{info.version})</h3>
          <div className="kv"><span className="k">{t(lang, 'scenario.provinces')}</span><span data-testid="prov-count">{info.provinceCount}</span></div>
          <div className="kv"><span className="k">{t(lang, 'scenario.countries')}</span><span>{info.countryCount}</span></div>
          <div className="kv"><span className="k">{t(lang, 'scenario.epoch')}</span><span>{info.epoch.join('-')}</span></div>
          <div style={{ marginTop: 8 }} className="muted">{lang === 'ja' ? info.descriptionJa : info.descriptionEn}</div>
          <h4 style={{ marginBottom: 4, fontSize: 13 }}>{t(lang, 'scenario.sources')}</h4>
          <ul className="sourcelist">
            {info.sources.map((s, i) => (
              <li key={i}>{s.name} — {s.license}（{s.attribution}）</li>
            ))}
          </ul>
          {st.fileMode && <div className="muted">{t(lang, 'scenario.checksumNote')}</div>}
          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="primary"
              data-testid="btn-to-country"
              onClick={() => appStore.set({ screen: 'country' })}
            >
              {t(lang, 'common.start')}
            </button>
            <button onClick={() => appStore.set({ screen: 'title' })}>{t(lang, 'common.back')}</button>
          </div>
        </div>
      )}
      {!info && !error && <div className="muted">{t(lang, 'misc.loading')}</div>}
    </div>
  );
}

function CountryScreen() {
  const st = useApp();
  const lang = st.lang;
  const [pack, setPack] = useState<Pack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<0 | 1 | 2>(1);
  const [seed, setSeed] = useState<number>(() => 20261114);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    let active = true;
    void getPack().then((r) => { if (active) setPack(r.pack); })
      .catch((err) => { if (active) setError(String(err)); });
    return () => { active = false; };
  }, []);
  return (
    <div className="screen">
      <div className="screen-title">{t(lang, 'country.select')}</div>
      {error && <div className="card" style={{ color: '#e08b84' }}>{error}</div>}
      {pack && (
        <>
          <div className="country-grid">
            {pack.countries.map((c) => {
              const qualityKey =
                c.popQuality === 'real' ? 'quality.real' : 'quality.estimated';
              return (
                <div
                  key={c.id}
                  className={'country-card' + (selected === c.id ? ' selected' : '')}
                  data-testid={'country-' + c.id}
                  onClick={() => setSelected(c.id)}
                >
                  <div><span className="color-dot" style={{ background: c.color }} /><b>{lang === 'ja' ? c.nameJa : c.nameEn}</b></div>
                  <div className="muted">{t(lang, 'country.population')}: {new Intl.NumberFormat(lang === 'ja' ? 'ja-JP' : 'en-US').format(c.population)}（{t(lang, qualityKey)}）</div>
                  <div className="muted">{t(lang, 'country.factories')}: {c.milFactories}</div>
                  <div className="muted">{t(lang, 'country.claims')}: {c.claims.length}</div>
                </div>
              );
            })}
          </div>
          <div className="card">
            <div className="row">
              <span>{t(lang, 'country.difficulty')}:</span>
              {[0, 1, 2].map((d) => (
                <label key={d} className="row" style={{ gap: 4 }}>
                  <input type="radio" name="difficulty" checked={difficulty === d} onChange={() => setDifficulty(d as 0 | 1 | 2)} />
                  {t(lang, 'difficulty.' + d)}
                </label>
              ))}
            </div>
            <div className="muted" style={{ marginTop: 4 }}>{t(lang, 'difficulty.note')}</div>
            <div className="row" style={{ marginTop: 8 }}>
              <span>{t(lang, 'country.select')} seed:</span>
              <input data-testid="seed-input" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} style={{ width: 130 }} />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button
                className="primary"
                data-testid="btn-start"
                disabled={!selected || starting || !Number.isSafeInteger(seed)}
                onClick={async () => {
                  if (!selected || starting || !Number.isSafeInteger(seed)) return;
                  setStarting(true);
                  setError(null);
                  try {
                    const { pack: p } = await getPack();
                    await engineClient.startGame(p, { seed, playerCountryId: selected, difficulty });
                    appStore.set({ screen: 'game', panel: null, gameOpts: { seed, playerCountryId: selected, difficulty } });
                  } catch (err) {
                    engineClient.dispose();
                    setError(String(err));
                    setStarting(false);
                  }
                }}
              >
                {t(lang, 'common.start')}
              </button>
              <button disabled={starting} onClick={() => appStore.set({ screen: 'scenario' })}>{t(lang, 'common.back')}</button>
            </div>
          </div>
        </>
      )}
      {!pack && !error && <div className="muted">{t(lang, 'misc.loading')}</div>}
    </div>
  );
}

export function App() {
  const st = useApp();
  switch (st.screen) {
    case 'title':
      return <TitleScreen />;
    case 'scenario':
      return <ScenarioScreen />;
    case 'country':
      return <CountryScreen />;
    case 'game':
      return <GameScreen />;
  }
}
