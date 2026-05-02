import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { storage } from '../../services/storage';
import { dialog } from '../../services/dialog';
import { secrets, SECRET_KEY } from '../../services/secrets';
import { chat, PROVIDERS, PROVIDER_ORDER, modelLabel } from '../../services/llm';
import {
  estimateUsdFromTokens,
  formatUsd,
} from '../../services/llm/costEstimator';
import {
  obsidianExporter,
  type ExportSummary,
} from '../../services/export/ObsidianExporter';
import {
  defaultMarkdownStorageDir,
  resolveMarkdownStorageDir,
  validateMarkdownStorageDir,
} from '../../services/export/markdownStorage';
import type { ProviderId, Theme } from '../../types';
import {
  CANVAS_FONT_SIZE_DEFAULT,
  CANVAS_FONT_SIZE_MAX,
  CANVAS_FONT_SIZE_MIN,
  NIGHT_MODE_DEFAULT_END,
  NIGHT_MODE_DEFAULT_START,
  NIGHT_MODE_DEFAULT_THEME,
} from '../../types';

type Tab = 'providers' | 'usage' | 'appearance' | 'vault' | 'workflow' | 'about';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'white', label: 'White' },
  { id: 'violet', label: 'Violet' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'dark', label: 'Dark' },
  { id: 'high-contrast', label: 'High contrast' },
];

export function SettingsModal({ onDetach }: { onDetach?: () => void }) {
  const open = useStore((s) => s.ui.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  if (!open) return null;
  return <SettingsModalInner onClose={() => setOpen(false)} onDetach={onDetach} />;
}

export function SettingsPanel() {
  const [tab, setTab] = useState<Tab>('providers');
  return (
    <div className="settings-body">
      <nav className="settings-tabs">
        <button
          className={tab === 'providers' ? 'active' : ''}
          onClick={() => setTab('providers')}
        >
          Providers & keys
        </button>
        <button
          className={tab === 'usage' ? 'active' : ''}
          onClick={() => setTab('usage')}
        >
          Usage & cost
        </button>
        <button
          className={tab === 'appearance' ? 'active' : ''}
          onClick={() => setTab('appearance')}
        >
          Appearance
        </button>
        <button
          className={tab === 'vault' ? 'active' : ''}
          onClick={() => setTab('vault')}
        >
          Vault & data
        </button>
        <button
          className={tab === 'workflow' ? 'active' : ''}
          onClick={() => setTab('workflow')}
        >
          Daily & templates
        </button>
        <button
          className={tab === 'about' ? 'active' : ''}
          onClick={() => setTab('about')}
        >
          About
        </button>
      </nav>
      <div className="settings-content">
        {tab === 'providers' ? <ProvidersTab /> : null}
        {tab === 'usage' ? <UsageTab /> : null}
        {tab === 'appearance' ? <AppearanceTab /> : null}
        {tab === 'vault' ? <VaultTab /> : null}
        {tab === 'workflow' ? <WorkflowTab /> : null}
        {tab === 'about' ? <AboutTab /> : null}
      </div>
    </div>
  );
}

function SettingsModalInner({
  onClose,
  onDetach,
}: {
  onClose: () => void;
  onDetach?: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Settings</h2>
          {onDetach ? (
            <button
              type="button"
              className="close"
              onClick={onDetach}
              aria-label="Open settings in window"
              title="Open settings in window"
            >
              ⧉
            </button>
          ) : null}
          <button type="button" className="close" onClick={onClose}>
            ×
          </button>
        </header>
        <SettingsPanel />
      </div>
    </div>
  );
}

function ProvidersTab() {
  const settings = useStore((s) => s.settings);
  const setDefaultModel = useStore((s) => s.setDefaultModel);
  const [customProvider, setCustomProvider] = useState<ProviderId>('openai');
  const [customModel, setCustomModel] = useState('');

  function applyCustom() {
    const m = customModel.trim();
    if (!m) return;
    setDefaultModel({ provider: customProvider, model: m });
    setCustomModel('');
  }

  const enabledProviders = PROVIDER_ORDER.filter(
    (pid) => settings.providers[pid]?.enabled,
  );

  return (
    <section className="settings-section">
      <h3>API keys</h3>
      <p className="muted">
        Keys are stored locally at <code>&lt;appData&gt;/secrets.json</code>.
        On macOS this file inherits FileVault's at-rest encryption. (v1.0 final
        will move them into the OS keychain.)
      </p>
      {PROVIDER_ORDER.map((id) => (
        <ProviderRow key={id} id={id} />
      ))}

      <h3 style={{ marginTop: 24 }}>Default model</h3>
      <p className="muted">
        Used for new conversations and the AI palette unless a conversation
        overrides it. The list below combines built-in models with anything you
        added or fetched from each provider's API.
      </p>
      <select
        value={
          settings.defaultModel
            ? `${settings.defaultModel.provider}|${settings.defaultModel.model}`
            : ''
        }
        onChange={(e) => {
          const v = e.target.value;
          if (!v) {
            setDefaultModel(undefined);
            return;
          }
          const [provider, ...rest] = v.split('|');
          setDefaultModel({
            provider: provider as ProviderId,
            model: rest.join('|'),
          });
        }}
      >
        <option value="">— None —</option>
        {PROVIDER_ORDER.flatMap((pid) => {
          const cfg = settings.providers[pid];
          if (!cfg?.enabled) return [];
          const meta = PROVIDERS[pid];
          const hidden = new Set(cfg.hiddenModels ?? []);
          const all = [
            ...meta.defaultModels,
            ...(cfg.customModels ?? []),
          ].filter((m, i, arr) => arr.indexOf(m) === i && !hidden.has(m));
          return all.map((m) => (
            <option key={`${pid}|${m}`} value={`${pid}|${m}`}>
              {meta.label} · {m}
            </option>
          ));
        })}
      </select>

      <h4 style={{ marginTop: 16 }}>Use any model name</h4>
      <p className="muted">
        Type a model identifier exactly as the provider's API expects it (e.g.{' '}
        <code>claude-opus-4-7</code>, <code>llama-3.3-70b-versatile</code>,{' '}
        <code>o3-mini</code>, <code>gemini-2.5-pro</code>). The model gets saved
        to that provider's custom list so it appears in the dropdown next time.
      </p>
      <div className="settings-inline-row">
        <select
          value={customProvider}
          onChange={(e) => setCustomProvider(e.target.value as ProviderId)}
        >
          {(enabledProviders.length > 0 ? enabledProviders : PROVIDER_ORDER).map(
            (pid) => (
              <option key={pid} value={pid}>
                {PROVIDERS[pid].label}
              </option>
            ),
          )}
        </select>
        <input
          type="text"
          value={customModel}
          onChange={(e) => setCustomModel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyCustom();
          }}
          placeholder="model identifier"
        />
        <button
          type="button"
          onClick={applyCustom}
          disabled={!customModel.trim()}
        >
          Use & save
        </button>
      </div>
    </section>
  );
}

function ProviderModels({ id }: { id: ProviderId }) {
  const cfg = useStore((s) => s.settings.providers[id]);
  const setProvider = useStore((s) => s.setProvider);
  const meta = PROVIDERS[id];
  const [adding, setAdding] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  if (!cfg?.enabled) return null;
  const config = cfg;

  const builtInsHidden = new Set(config.hiddenModels ?? []);
  const customs = config.customModels ?? [];

  function addCustom() {
    const m = adding.trim();
    if (!m) return;
    if (meta.defaultModels.includes(m) || customs.includes(m)) {
      setAdding('');
      return;
    }
    setProvider(id, { id, customModels: [...customs, m] });
    setAdding('');
  }

  function removeCustom(model: string) {
    setProvider(id, {
      id,
      customModels: customs.filter((m) => m !== model),
    });
  }

  function toggleBuiltin(model: string) {
    const next = builtInsHidden.has(model)
      ? (config.hiddenModels ?? []).filter((m) => m !== model)
      : [...(config.hiddenModels ?? []), model];
    setProvider(id, { id, hiddenModels: next });
  }

  async function refreshFromApi() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const r = await chat.listModels(id, config.baseUrl);
      if (r.ok) {
        const merged = [...new Set([...customs, ...r.models])].sort();
        setProvider(id, {
          id,
          customModels: merged,
          modelsRefreshedAt: new Date().toISOString(),
        });
        setRefreshMsg(`✅ Fetched ${r.models.length} models`);
      } else {
        setRefreshMsg(`❌ ${r.error}`);
      }
    } finally {
      setRefreshing(false);
    }
  }

  const canRefresh =
    id === 'groq' ||
    id === 'openai' ||
    id === 'mistral' ||
    id === 'openai-compatible' ||
    id === 'ollama' ||
    id === 'anthropic' ||
    id === 'google';

  return (
    <details className="provider-models">
      <summary>
        Models{' '}
        <span className="muted small">
          ({meta.defaultModels.length - builtInsHidden.size + customs.length}{' '}
          available)
        </span>
      </summary>
      <div className="provider-models-body">
        {meta.defaultModels.length > 0 ? (
          <>
            <div className="muted small">Built-in</div>
            <ul className="model-list">
              {meta.defaultModels.map((m) => (
                <li key={m}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!builtInsHidden.has(m)}
                      onChange={() => toggleBuiltin(m)}
                    />
                    {m}
                  </label>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <div className="muted small" style={{ marginTop: 8 }}>
          Custom & fetched
        </div>
        {customs.length === 0 ? (
          <div className="muted small">None yet.</div>
        ) : (
          <ul className="model-list">
            {customs.map((m) => (
              <li key={m}>
                <span>{m}</span>
                <button
                  type="button"
                  className="link"
                  onClick={() => removeCustom(m)}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="settings-inline-row">
          <input
            type="text"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addCustom();
            }}
            placeholder="add model id"
          />
          <button type="button" onClick={addCustom} disabled={!adding.trim()}>
            Add
          </button>
          {canRefresh ? (
            <button
              type="button"
              onClick={refreshFromApi}
              disabled={refreshing}
              title={`Fetch the live list from ${meta.label}`}
            >
              {refreshing ? 'Fetching…' : 'Refresh from API'}
            </button>
          ) : null}
        </div>
        {refreshMsg ? (
          <div
            className={`result ${refreshMsg.startsWith('✅') ? 'ok' : 'error'}`}
          >
            {refreshMsg}
          </div>
        ) : null}
        {config.modelsRefreshedAt ? (
          <div className="muted small">
            Last refresh: {new Date(config.modelsRefreshedAt).toLocaleString()}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function ProviderRow({ id }: { id: ProviderId }) {
  const cfg = useStore((s) => s.settings.providers[id]);
  const setProvider = useStore((s) => s.setProvider);
  const removeProvider = useStore((s) => s.removeProvider);
  const meta = PROVIDERS[id];

  const [keyValue, setKeyValue] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultOk, setResultOk] = useState(false);

  useEffect(() => {
    let on = true;
    secrets.has(SECRET_KEY(id)).then((v) => on && setHasKey(v));
    return () => {
      on = false;
    };
  }, [id]);

  async function saveKey() {
    if (!keyValue.trim()) return;
    await secrets.set(SECRET_KEY(id), keyValue.trim());
    setKeyValue('');
    setHasKey(true);
    setProvider(id, { id, enabled: true });
  }

  async function clearKey() {
    await secrets.remove(SECRET_KEY(id));
    setHasKey(false);
    setProvider(id, { id, enabled: false });
  }

  async function test() {
    setBusy(true);
    setResult(null);
    try {
      const r = await chat.testKey(id, cfg?.baseUrl);
      if (r.ok) {
        setResult(`✅ verified · ${r.sampleModel}`);
        setResultOk(true);
        setProvider(id, { id, enabled: true, lastVerifiedAt: new Date().toISOString() });
      } else {
        setResult(`❌ ${r.error}`);
        setResultOk(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="provider-row">
      <div className="provider-head">
        <strong>{meta.label}</strong>
        <a href={meta.docsUrl} target="_blank" rel="noreferrer noopener" className="muted">
          (get key →)
        </a>
        {cfg?.enabled ? <span className="badge enabled">enabled</span> : null}
      </div>
      <div className="provider-fields">
        {meta.needsKey ? (
          <input
            type="password"
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            placeholder={hasKey ? '••••••••  (saved)' : 'Paste API key'}
          />
        ) : (
          <input
            type="text"
            value={cfg?.baseUrl ?? meta.defaultBaseUrl ?? ''}
            onChange={(e) => setProvider(id, { id, baseUrl: e.target.value })}
            placeholder="Base URL"
          />
        )}
        {meta.needsKey ? (
          <>
            <button type="button" onClick={saveKey} disabled={!keyValue.trim()}>
              Save key
            </button>
            <button type="button" onClick={test} disabled={!hasKey || busy}>
              {busy ? 'Testing…' : 'Test'}
            </button>
            {hasKey ? (
              <button type="button" className="danger" onClick={clearKey}>
                Clear
              </button>
            ) : null}
          </>
        ) : (
          <>
            <button type="button" onClick={() => setProvider(id, { id, enabled: !cfg?.enabled })}>
              {cfg?.enabled ? 'Disable' : 'Enable'}
            </button>
            <button type="button" onClick={test} disabled={busy}>
              {busy ? 'Testing…' : 'Test'}
            </button>
          </>
        )}
        {meta.id === 'openai-compatible' || meta.id === 'ollama' ? null : null}
      </div>
      {result ? (
        <div className={`result ${resultOk ? 'ok' : 'error'}`}>{result}</div>
      ) : null}
      {(meta.id === 'openai-compatible' || meta.id === 'ollama') && cfg ? (
        <div className="provider-extra">
          <label>
            Base URL
            <input
              type="text"
              value={cfg.baseUrl ?? meta.defaultBaseUrl ?? ''}
              onChange={(e) => setProvider(id, { id, baseUrl: e.target.value })}
            />
          </label>
        </div>
      ) : null}
      {meta.id !== 'ollama' && meta.id !== 'openai-compatible' && hasKey ? (
        <div
          className="provider-cleanup-hidden"
          onClick={() => removeProvider(id)}
          style={{ display: 'none' }}
        />
      ) : null}
      <ProviderModels id={id} />
    </div>
  );
}

function UsageTab() {
  const conversations = useStore((s) => s.conversations);
  const messages = useStore((s) => s.messages);
  const projects = useStore((s) => s.projects);

  type Aggregate = {
    input: number;
    output: number;
    usd: number;
    messages: number;
  };

  const byModel = new Map<string, Aggregate>();
  const byProject = new Map<string, Aggregate>();
  const totals: Aggregate = { input: 0, output: 0, usd: 0, messages: 0 };

  function bump(map: Map<string, Aggregate>, key: string, agg: Aggregate) {
    const cur = map.get(key) ?? { input: 0, output: 0, usd: 0, messages: 0 };
    cur.input += agg.input;
    cur.output += agg.output;
    cur.usd += agg.usd;
    cur.messages += agg.messages;
    map.set(key, cur);
  }

  for (const m of messages) {
    if (!m.model || !m.usage) continue;
    const usd =
      estimateUsdFromTokens(m.model.provider, m.model.model, m.usage) ?? 0;
    const agg: Aggregate = {
      input: m.usage.input,
      output: m.usage.output,
      usd,
      messages: 1,
    };
    bump(byModel, `${m.model.provider}|${m.model.model}`, agg);
    const conv = conversations.find((c) => c.id === m.conversationId);
    const projectKey = conv?.projectId ?? '__none__';
    bump(byProject, projectKey, agg);
    totals.input += agg.input;
    totals.output += agg.output;
    totals.usd += agg.usd;
    totals.messages += agg.messages;
  }

  const conversationRows = conversations
    .map((c) => {
      const usage = c.tokenUsage ?? { input: 0, output: 0 };
      const model = c.modelOverride;
      const usd = model
        ? estimateUsdFromTokens(model.provider, model.model, usage) ?? 0
        : 0;
      return { conv: c, usage, usd };
    })
    .filter((r) => r.usage.input > 0 || r.usage.output > 0)
    .sort((a, b) => b.usd - a.usd);

  function exportCsv() {
    const lines = [
      'Type,Key,Messages,Input tokens,Output tokens,USD',
      `Total,All,${totals.messages},${totals.input},${totals.output},${totals.usd.toFixed(6)}`,
    ];
    for (const [key, a] of byModel.entries()) {
      lines.push(
        `Model,${key},${a.messages},${a.input},${a.output},${a.usd.toFixed(6)}`,
      );
    }
    for (const [key, a] of byProject.entries()) {
      const name =
        key === '__none__'
          ? '(no project)'
          : projects.find((p) => p.id === key)?.name ?? key;
      lines.push(
        `Project,${name},${a.messages},${a.input},${a.output},${a.usd.toFixed(6)}`,
      );
    }
    for (const r of conversationRows) {
      lines.push(
        `Conversation,${r.conv.title.replace(/,/g, ' ')},${r.conv.messageIds.length},${r.usage.input},${r.usage.output},${r.usd.toFixed(6)}`,
      );
    }
    const blob = new Blob([lines.join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usage-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <section className="settings-section">
      <h3>Total spend</h3>
      <div className="usage-totals">
        <div className="usage-stat">
          <div className="usage-stat-label">Total cost</div>
          <div className="usage-stat-value">{formatUsd(totals.usd)}</div>
        </div>
        <div className="usage-stat">
          <div className="usage-stat-label">Messages</div>
          <div className="usage-stat-value">{totals.messages.toLocaleString()}</div>
        </div>
        <div className="usage-stat">
          <div className="usage-stat-label">Input tokens</div>
          <div className="usage-stat-value">{totals.input.toLocaleString()}</div>
        </div>
        <div className="usage-stat">
          <div className="usage-stat-label">Output tokens</div>
          <div className="usage-stat-value">{totals.output.toLocaleString()}</div>
        </div>
      </div>
      <p className="muted">
        Estimates use the per-model rate table in{' '}
        <code>src/services/llm/providers.ts</code>. Custom-named models without
        a known rate are skipped (your spend is still real — set rates manually
        if needed).
      </p>
      <button
        type="button"
        onClick={exportCsv}
        disabled={totals.messages === 0}
        style={{ alignSelf: 'flex-start', marginBottom: 16 }}
      >
        Export CSV
      </button>

      <h3>By model</h3>
      {byModel.size === 0 ? (
        <p className="muted">No usage tracked yet.</p>
      ) : (
        <table className="usage-table">
          <thead>
            <tr>
              <th>Model</th>
              <th className="num">Messages</th>
              <th className="num">In</th>
              <th className="num">Out</th>
              <th className="num">USD</th>
            </tr>
          </thead>
          <tbody>
            {[...byModel.entries()]
              .sort((a, b) => b[1].usd - a[1].usd)
              .map(([key, a]) => {
                const [pid, ...rest] = key.split('|');
                const model = rest.join('|');
                const meta = PROVIDERS[pid as ProviderId];
                return (
                  <tr key={key}>
                    <td>
                      {meta?.label ?? pid} ·{' '}
                      {modelLabel(pid as ProviderId, model)}
                    </td>
                    <td className="num">{a.messages}</td>
                    <td className="num">{a.input.toLocaleString()}</td>
                    <td className="num">{a.output.toLocaleString()}</td>
                    <td className="num">{formatUsd(a.usd)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      )}

      <h3>By project</h3>
      {byProject.size === 0 ? (
        <p className="muted">No usage tracked yet.</p>
      ) : (
        <table className="usage-table">
          <thead>
            <tr>
              <th>Project</th>
              <th className="num">Messages</th>
              <th className="num">In</th>
              <th className="num">Out</th>
              <th className="num">USD</th>
            </tr>
          </thead>
          <tbody>
            {[...byProject.entries()]
              .sort((a, b) => b[1].usd - a[1].usd)
              .map(([key, a]) => {
                const name =
                  key === '__none__'
                    ? '(no project)'
                    : projects.find((p) => p.id === key)?.name ?? key;
                return (
                  <tr key={key}>
                    <td>{name}</td>
                    <td className="num">{a.messages}</td>
                    <td className="num">{a.input.toLocaleString()}</td>
                    <td className="num">{a.output.toLocaleString()}</td>
                    <td className="num">{formatUsd(a.usd)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      )}

      <h3>By conversation (top 50)</h3>
      {conversationRows.length === 0 ? (
        <p className="muted">No conversation usage yet.</p>
      ) : (
        <table className="usage-table">
          <thead>
            <tr>
              <th>Conversation</th>
              <th className="num">In</th>
              <th className="num">Out</th>
              <th className="num">USD</th>
            </tr>
          </thead>
          <tbody>
            {conversationRows.slice(0, 50).map((r) => (
              <tr key={r.conv.id}>
                <td title={r.conv.title}>
                  {r.conv.title.length > 60
                    ? `${r.conv.title.slice(0, 60)}…`
                    : r.conv.title}
                </td>
                <td className="num">{r.usage.input.toLocaleString()}</td>
                <td className="num">{r.usage.output.toLocaleString()}</td>
                <td className="num">{formatUsd(r.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ArtifactUsageSection />
    </section>
  );
}

function ArtifactUsageSection() {
  const artifactUsage = useStore((s) => s.artifactUsage);
  if (artifactUsage.length === 0) return null;
  return (
    <>
      <h3>Artifact generation (this session)</h3>
      <p className="muted">
        Token / character / second counts reported by the artifact provider
        for each generation call. Cleared on app restart.
      </p>
      <table className="usage-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Provider</th>
            <th>Kind</th>
            <th>Filename</th>
            <th className="num">In tok</th>
            <th className="num">Out tok</th>
            <th className="num">Chars</th>
            <th className="num">Sec</th>
            <th className="num">Size</th>
          </tr>
        </thead>
        <tbody>
          {artifactUsage.slice(0, 50).map((r) => (
            <tr key={r.artifactId}>
              <td>{new Date(r.createdAt).toLocaleTimeString()}</td>
              <td>{r.provider}</td>
              <td>
                {r.kind}
                {r.format ? ` · ${r.format}` : ''}
              </td>
              <td title={r.filename}>
                {r.filename.length > 32
                  ? `${r.filename.slice(0, 32)}…`
                  : r.filename}
              </td>
              <td className="num">
                {r.usage?.inputTokens?.toLocaleString() ?? '—'}
              </td>
              <td className="num">
                {r.usage?.outputTokens?.toLocaleString() ?? '—'}
              </td>
              <td className="num">
                {r.usage?.characters?.toLocaleString() ?? '—'}
              </td>
              <td className="num">{r.usage?.seconds ?? '—'}</td>
              <td className="num">
                {r.sizeBytes < 1024
                  ? `${r.sizeBytes} B`
                  : r.sizeBytes < 1024 * 1024
                    ? `${(r.sizeBytes / 1024).toFixed(1)} KB`
                    : `${(r.sizeBytes / 1024 / 1024).toFixed(2)} MB`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function AppearanceTab() {
  const theme = useStore((s) => s.settings.theme);
  const workspaceName = useStore((s) => s.settings.workspaceName ?? '');
  const setTheme = useStore((s) => s.setTheme);
  const setWorkspaceName = useStore((s) => s.setWorkspaceName);
  return (
    <section className="settings-section">
      <h3>Workspace</h3>
      <label className="settings-row">
        <span>Workspace name</span>
        <input
          type="text"
          value={workspaceName}
          onChange={(e) => {
            const next = e.target.value;
            setWorkspaceName(next.trim() ? next : undefined);
          }}
          placeholder="Hypratia"
        />
      </label>

      <h3>Theme</h3>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`theme-card ${t.id} ${theme === t.id ? 'selected' : ''}`}
            onClick={() => setTheme(t.id)}
          >
            <span className="theme-swatch" />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 12 }}>
        Theme applies instantly. Custom accent and brand themes are coming in v1.0.1.
      </p>

      <NightModeSection />
    </section>
  );
}

function NightModeSection() {
  const auto = useStore((s) => s.settings.nightModeAuto ?? false);
  const nightTheme = useStore(
    (s) => s.settings.nightModeTheme ?? NIGHT_MODE_DEFAULT_THEME,
  );
  const start = useStore(
    (s) => s.settings.nightModeStart ?? NIGHT_MODE_DEFAULT_START,
  );
  const end = useStore(
    (s) => s.settings.nightModeEnd ?? NIGHT_MODE_DEFAULT_END,
  );
  const setNightModeAuto = useStore((s) => s.setNightModeAuto);
  const setNightModeTheme = useStore((s) => s.setNightModeTheme);
  const setNightModeWindow = useStore((s) => s.setNightModeWindow);
  return (
    <>
      <h3 style={{ marginTop: 24 }}>Auto night theme</h3>
      <label>
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => setNightModeAuto(e.target.checked)}
        />{' '}
        Switch to a dark theme at night
      </label>
      <p className="muted small">
        Your selected theme above stays as the day theme; only the displayed
        appearance is overridden during the night window.
      </p>
      {auto ? (
        <>
          <div className="settings-row">
            <label htmlFor="night-theme-select">Night theme</label>
            <select
              id="night-theme-select"
              value={nightTheme}
              onChange={(e) =>
                setNightModeTheme(e.target.value as Theme)
              }
            >
              <option value="dark">Dark</option>
              <option value="high-contrast">High contrast</option>
            </select>
          </div>
          <div className="settings-row">
            <label htmlFor="night-start">Starts at</label>
            <input
              id="night-start"
              type="time"
              value={start}
              onChange={(e) =>
                setNightModeWindow({ start: e.target.value })
              }
            />
          </div>
          <div className="settings-row">
            <label htmlFor="night-end">Ends at</label>
            <input
              id="night-end"
              type="time"
              value={end}
              onChange={(e) =>
                setNightModeWindow({ end: e.target.value })
              }
            />
          </div>
        </>
      ) : null}
    </>
  );
}

function VaultTab() {
  return (
    <>
      <MarkdownEditorSettingsSection />
      <ChatHistoryStorageSection />
      <ObsidianVaultSection />
      <ArtifactSettingsSection />
      <ConversationMapSection />
    </>
  );
}

function MarkdownEditorSettingsSection() {
  const autoSave = useStore((s) => s.settings.markdownAutoSave ?? true);
  const setMarkdownAutoSave = useStore((s) => s.setMarkdownAutoSave);
  const incognito = useStore(
    (s) => s.settings.incognitoUnprojectedChats ?? false,
  );
  const setIncognito = useStore((s) => s.setIncognitoUnprojectedChats);
  return (
    <section className="settings-section">
      <h3>Markdown editor</h3>
      <label>
        <input
          type="checkbox"
          checked={autoSave}
          onChange={(e) => setMarkdownAutoSave(e.target.checked)}
        />{' '}
        Auto Save
      </label>
      <p className="muted small">
        Saves Markdown changes automatically by default. Turn this off to use
        manual save commands instead.
      </p>
      <label>
        <input
          type="checkbox"
          checked={incognito}
          onChange={(e) => setIncognito(e.target.checked)}
        />{' '}
        Incognito for chats without a project
      </label>
      <p className="muted small">
        Unprojected chats stay in the running app state but are not mirrored
        into the Knowledge Base. Project chats still save to their project
        folder.
      </p>
    </section>
  );
}

function ConversationMapSection() {
  const wheelMode = useStore((s) => s.settings.canvasWheelMode ?? 'pan');
  const setCanvasWheelMode = useStore((s) => s.setCanvasWheelMode);
  const classifier = useStore(
    (s) => s.settings.themesClassifier ?? 'auto',
  );
  const setThemesClassifier = useStore((s) => s.setThemesClassifier);
  return (
    <section>
      <h3>Conversation map</h3>
      <p className="muted">
        The canvas is a compact map of your chat history. Each ask becomes a
        node; clicking a node jumps the chat to the source message. See spec
        32.
      </p>
      <div className="settings-row">
        <label htmlFor="canvas-wheel-mode">Wheel behavior</label>
        <select
          id="canvas-wheel-mode"
          value={wheelMode}
          onChange={(e) =>
            setCanvasWheelMode(e.target.value as 'pan' | 'zoom')
          }
        >
          <option value="pan">Scroll / pan (Cmd-wheel zooms)</option>
          <option value="zoom">Zoom (wheel zooms)</option>
        </select>
      </div>
      <p className="muted small">
        Toggle live with the <kbd>S</kbd> key. Pinch always zooms.
      </p>
      <div className="settings-row">
        <label htmlFor="themes-classifier">Theme classifier</label>
        <select
          id="themes-classifier"
          value={classifier}
          onChange={(e) =>
            setThemesClassifier(
              e.target.value as 'auto' | 'heuristic' | 'llm',
            )
          }
        >
          <option value="auto">
            Auto (LLM when a key is set, heuristic otherwise)
          </option>
          <option value="heuristic">Heuristic only (offline)</option>
          <option value="llm">LLM only</option>
        </select>
      </div>
      <CanvasFontSizeRow />
    </section>
  );
}

function CanvasFontSizeRow() {
  const stored = useStore((s) => s.settings.canvasFontSize);
  const setCanvasFontSize = useStore((s) => s.setCanvasFontSize);
  const value = stored ?? CANVAS_FONT_SIZE_DEFAULT;
  // Local draft only while the number input has focus, so partial
  // typing (e.g. "" mid-backspace, or "1" before "12") doesn't get
  // clobbered by the store's clamp. When not editing, the displayed
  // value is derived directly from the store — slider drags and the
  // Reset button update the field with no extra wiring.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const display = editing ? draft : String(value);
  function commit(raw: string) {
    const n = Math.round(Number(raw));
    if (Number.isFinite(n)) setCanvasFontSize(n);
    setEditing(false);
  }
  return (
    <div className="settings-row settings-row-canvas-font">
      <label htmlFor="canvas-font-size-input">Canvas text size</label>
      <div className="canvas-font-controls">
        <input
          id="canvas-font-size-slider"
          type="range"
          min={CANVAS_FONT_SIZE_MIN}
          max={CANVAS_FONT_SIZE_MAX}
          step={1}
          value={value}
          onChange={(e) => setCanvasFontSize(Number(e.target.value))}
          aria-label="Canvas text size slider"
        />
        <input
          id="canvas-font-size-input"
          type="number"
          min={CANVAS_FONT_SIZE_MIN}
          max={CANVAS_FONT_SIZE_MAX}
          step={1}
          value={display}
          onFocus={() => {
            setDraft(String(value));
            setEditing(true);
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span className="canvas-font-unit">px</span>
        <button
          type="button"
          className="canvas-font-reset"
          onClick={() => setCanvasFontSize(CANVAS_FONT_SIZE_DEFAULT)}
          disabled={value === CANVAS_FONT_SIZE_DEFAULT}
          title={`Reset to ${CANVAS_FONT_SIZE_DEFAULT}px`}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function ArtifactSettingsSection() {
  const settings = useStore((s) => s.settings.artifacts);
  const setArtifactSettings = useStore((s) => s.setArtifactSettings);
  const documentProvider = settings?.documentProvider ?? 'claude';
  const ttsVoice = settings?.ttsVoice ?? 'coral';
  const ttsFormat = settings?.ttsFormat ?? 'mp3';
  const mirror = settings?.mirrorTextToKnowledgeBase !== false;
  const videoEnabled = settings?.videoEnabled === true;
  return (
    <section>
      <h3>Artifact generation</h3>
      <p className="muted">
        Generated documents (`.docx`, `.pptx`, `.xlsx`, `.pdf`), audio, and
        video produced by the model are saved as attachments. See spec 17 for
        the full pipeline.
      </p>
      <div className="settings-row">
        <label htmlFor="artifact-document-provider">Document provider</label>
        <select
          id="artifact-document-provider"
          value={documentProvider}
          onChange={(e) =>
            setArtifactSettings({
              documentProvider: e.target.value as 'claude' | 'openai',
            })
          }
        >
          <option value="claude">Claude (code execution)</option>
          <option value="openai">OpenAI (code interpreter)</option>
        </select>
      </div>
      <div className="settings-row">
        <label htmlFor="artifact-tts-voice">TTS voice</label>
        <input
          id="artifact-tts-voice"
          type="text"
          value={ttsVoice}
          onChange={(e) =>
            setArtifactSettings({ ttsVoice: e.target.value || undefined })
          }
          placeholder="coral"
        />
      </div>
      <div className="settings-row">
        <label htmlFor="artifact-tts-format">TTS format</label>
        <select
          id="artifact-tts-format"
          value={ttsFormat}
          onChange={(e) =>
            setArtifactSettings({
              ttsFormat: e.target.value as
                | 'mp3'
                | 'wav'
                | 'opus'
                | 'aac'
                | 'flac',
            })
          }
        >
          <option value="mp3">mp3</option>
          <option value="wav">wav</option>
          <option value="opus">opus</option>
          <option value="aac">aac</option>
          <option value="flac">flac</option>
        </select>
      </div>
      <div className="settings-row">
        <label>
          <input
            type="checkbox"
            checked={mirror}
            onChange={(e) =>
              setArtifactSettings({
                mirrorTextToKnowledgeBase: e.target.checked,
              })
            }
          />{' '}
          Mirror text artifacts (and binary sidecars) into the Knowledge Base
        </label>
      </div>
      <div className="settings-row">
        <label>
          <input
            type="checkbox"
            checked={videoEnabled}
            onChange={(e) =>
              setArtifactSettings({ videoEnabled: e.target.checked })
            }
          />{' '}
          Enable video generation (experimental — Sora 2 deprecating in 2026)
        </label>
      </div>
    </section>
  );
}

function ChatHistoryStorageSection() {
  const customPath = useStore((s) => s.settings.markdownStorageDir);
  const setMarkdownDir = useStore((s) => s.setMarkdownStorageDir);

  const [resolved, setResolved] = useState<string | null>(null);
  const [defaultPath, setDefaultPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let on = true;
    Promise.all([
      resolveMarkdownStorageDir(customPath),
      defaultMarkdownStorageDir(),
    ])
      .then(([r, d]) => {
        if (!on) return;
        setResolved(r);
        setDefaultPath(d);
      })
      .catch((err) => {
        if (on) setError(`Could not resolve folder: ${String(err)}`);
      });
    return () => {
      on = false;
    };
  }, [customPath]);

  const isCustom = Boolean(customPath && customPath.trim().length > 0);

  async function changeFolder() {
    setError(null);
    setInfo(null);
    try {
      const picked = await dialog.pickFolder();
      if (!picked) return;
      setBusy(true);
      const check = await validateMarkdownStorageDir(picked);
      if (!check.ok) {
        setError(check.error);
        return;
      }
      setMarkdownDir(picked);
      setInfo(
        'Existing markdown files remain in the old location. New files will be saved to the selected folder.',
      );
    } catch (err) {
      setError(`Could not open folder picker: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    if (!resolved) return;
    setError(null);
    try {
      await dialog.revealInFinder(resolved);
    } catch (err) {
      setError(`Could not reveal folder: ${String(err)}`);
    }
  }

  function reset() {
    setError(null);
    setInfo(null);
    setMarkdownDir(undefined);
    setInfo('Reset to the default app-data folder.');
  }

  return (
    <section className="settings-section">
      <h3>Local Markdown Storage</h3>
      <p className="muted">
        Folder where chat history is saved as Markdown. Defaults to the app's
        local data directory; point this at an Obsidian vault folder if you
        want chats to land there directly.
      </p>
      <div className="path-row">
        <code title={resolved ?? ''}>{resolved ?? '(resolving…)'}</code>
        <button type="button" onClick={changeFolder} disabled={busy}>
          {isCustom ? 'Change Folder…' : 'Change Folder…'}
        </button>
      </div>
      <div className="settings-inline-row">
        <button type="button" onClick={reveal} disabled={!resolved}>
          Reveal in Finder
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={!isCustom}
          title={
            isCustom
              ? 'Use the default folder under app data'
              : 'Already using the default folder'
          }
        >
          Reset to Default
        </button>
        {!isCustom && defaultPath ? (
          <span className="muted small">Using default location.</span>
        ) : null}
      </div>
      {info ? <div className="result ok">{info}</div> : null}
      {error ? <div className="result error">{error}</div> : null}
    </section>
  );
}

function ObsidianVaultSection() {
  const vaultPath = useStore((s) => s.settings.obsidianVaultPath);
  const setVault = useStore((s) => s.setObsidianVault);
  const conversations = useStore((s) => s.conversations);
  const messages = useStore((s) => s.messages);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const attachmentList = useStore((s) => s.attachments);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appDataPath, setAppDataPath] = useState<string | null>(null);

  async function pickVault() {
    setError(null);
    try {
      const picked = await dialog.pickFolder();
      if (picked) setVault(picked);
    } catch (err) {
      setError(`Could not open folder picker: ${String(err)}`);
    }
  }

  async function exportNow() {
    if (!vaultPath) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const summary = await obsidianExporter.exportAll(vaultPath, {
        conversations,
        messages,
        nodes,
        edges,
        attachments: attachmentList,
      });
      setResult(summary);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function showAppData() {
    try {
      setAppDataPath(await storage.baseDirPath());
    } catch (err) {
      setError(`Could not resolve app data dir: ${String(err)}`);
    }
  }

  return (
    <section className="settings-section">
      <h3>Obsidian vault</h3>
      <p className="muted">
        Folder where conversations, nodes, and maps export as Markdown.
      </p>
      <div className="path-row">
        <code>{vaultPath ?? '(not set)'}</code>
        <button type="button" onClick={pickVault}>
          {vaultPath ? 'Change…' : 'Choose folder…'}
        </button>
      </div>
      <button
        type="button"
        disabled={!vaultPath || busy}
        onClick={exportNow}
        className="primary"
      >
        {busy ? 'Exporting…' : 'Export to Markdown'}
      </button>
      {result ? (
        <div className="result ok">
          Exported {result.nodes} nodes, {result.conversations} conversations,{' '}
          {result.maps} maps, {result.attachments} attachments.{' '}
          {result.skipped.length} skipped.
        </div>
      ) : null}
      {error ? <div className="result error">{error}</div> : null}

      <h3 style={{ marginTop: 24 }}>App data</h3>
      <p className="muted">Where local JSON state and attachments live.</p>
      <div className="path-row">
        <code>{appDataPath ?? '(not yet shown)'}</code>
        <button type="button" onClick={showAppData}>
          Show path
        </button>
      </div>
    </section>
  );
}

function WorkflowTab() {
  const dailyFolder = useStore((s) => s.settings.dailyNotesFolder);
  const dailyTemplate = useStore((s) => s.settings.dailyNoteTemplate);
  const templatesFolder = useStore((s) => s.settings.templatesFolder);
  const setDailyNotesFolder = useStore((s) => s.setDailyNotesFolder);
  const setDailyNoteTemplate = useStore((s) => s.setDailyNoteTemplate);
  const setTemplatesFolder = useStore((s) => s.setTemplatesFolder);

  return (
    <section className="settings-section">
      <h3>Daily notes</h3>
      <p className="muted">
        Daily notes are conversations titled <code>YYYY-MM-DD</code>. ⌘D opens or
        creates today's daily note. Daily notes export under{' '}
        <code>LLM-Daily/</code> in the vault.
      </p>
      <label className="settings-row">
        <span>Daily notes folder</span>
        <input
          type="text"
          value={dailyFolder ?? 'LLM-Daily'}
          onChange={(e) => setDailyNotesFolder(e.target.value)}
        />
      </label>
      <label className="settings-row">
        <span>Daily-note template path (optional)</span>
        <input
          type="text"
          placeholder="e.g. Templates/daily.md"
          value={dailyTemplate ?? ''}
          onChange={(e) => setDailyNoteTemplate(e.target.value || undefined)}
        />
      </label>

      <h3 style={{ marginTop: 24 }}>Templates</h3>
      <p className="muted">
        Markdown files with frontmatter. <code>{'{{date}}'}</code>,{' '}
        <code>{'{{time}}'}</code>, and <code>{'{{title}}'}</code> get
        substituted on insert.
      </p>
      <label className="settings-row">
        <span>Templates folder</span>
        <input
          type="text"
          value={templatesFolder ?? 'LLM-Templates'}
          onChange={(e) => setTemplatesFolder(e.target.value)}
        />
      </label>

      <h3 style={{ marginTop: 24 }}>Quick capture</h3>
      <p className="muted">
        ⌘⇧Space opens a quick-capture window into the Inbox conversation. (OS
        global shortcut requires the Tauri global-shortcut plugin; this build
        ships with the in-app shortcut only.)
      </p>
    </section>
  );
}

function AboutTab() {
  return (
    <section className="settings-section">
      <h3>Hypratia</h3>
      <p className="muted">
        A local-first AI thinking workspace for conversations, documents, and
        spatial memory. Bring your own API keys; your workspace stays on your
        machine.
      </p>
      <ul className="about-list">
        <li>Version: 1.1.0-beta.1</li>
        <li>License: MIT</li>
        <li>Platform: macOS first, Tauri native desktop shell</li>
        <li>AI providers: OpenAI, Anthropic, Google, Mistral, and compatible APIs</li>
        <li>
          <strong>No telemetry.</strong> The app does not phone home.
        </li>
      </ul>

      <h3 style={{ marginTop: 20 }}>What it is</h3>
      <p className="muted">
        Hypratia combines a streaming AI chat, an infinite canvas, a Markdown
        knowledge workspace, and an in-app PDF/document viewer. It is designed
        for keeping source material, generated notes, citations, and follow-up
        thinking in one local workspace.
      </p>

      <h3 style={{ marginTop: 20 }}>What it can do</h3>
      <ul className="about-list">
        <li>Chat with AI using your own provider keys.</li>
        <li>Turn useful messages and document excerpts into canvas nodes.</li>
        <li>Open Markdown, PDF, CSV, DOCX, and other project files from the file viewer.</li>
        <li>Use project folders with raw documents, instructions, memory, and processed indexes.</li>
        <li>Export conversations and notes as Markdown for Obsidian-style workflows.</li>
      </ul>

      <h3 style={{ marginTop: 20 }}>Privacy</h3>
      <p className="muted">
        The only network calls Hypratia makes are: (1) you, talking to the AI
        provider whose key you configured; (2) update checks against the public
        GitHub release endpoint, anonymous. We do not track content, events, or
        identifiers.
      </p>

      <h3 style={{ marginTop: 20 }}>Where your data lives</h3>
      <p className="muted">
        On your machine, in the platform app-data directory:
        <code> conversations.json</code>, <code>messages.json</code>,{' '}
        <code>nodes.json</code>, <code>edges.json</code>,{' '}
        <code>settings.json</code>, <code>attachments.json</code>, and the
        <code> attachments/</code> blob folder. Export anytime to your Obsidian
        vault.
      </p>
    </section>
  );
}
