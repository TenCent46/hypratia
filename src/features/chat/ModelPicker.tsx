import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store';
import { PROVIDERS, PROVIDER_ORDER, getModelMeta } from '../../services/llm';
import type { ModelRef, ProviderId } from '../../types';

type Option = {
  provider: ProviderId;
  model: string;
  label: string;
  hasThinking: boolean;
  hasReasoning: boolean;
};

/**
 * Top-of-chat multi-tier model selector.
 *
 * Layout (one row, all visible at once — no nested flyouts to hunt for):
 *   [Provider ▾]  [Model ▾]   [✓ Adaptive thinking]   [Effort: low/med/high]
 */
export function ModelPicker() {
  const conversationId = useStore((s) => s.settings.lastConversationId);
  const conv = useStore((s) =>
    conversationId
      ? s.conversations.find((c) => c.id === conversationId) ?? null
      : null,
  );
  const settings = useStore((s) => s.settings);
  const setConvModel = useStore((s) => s.setConversationModel);
  const setDefaultModel = useStore((s) => s.setDefaultModel);
  const setConvThinking = useStore((s) => s.setConversationThinking);
  const setConvReasoning = useStore((s) => s.setConversationReasoning);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const [providerOpen, setProviderOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const providerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  const active: ModelRef | undefined =
    conv?.modelOverride ?? settings.defaultModel;

  // Every option, every provider, regardless of "active". This is the bug fix.
  const options = useMemo<Option[]>(() => {
    const out: Option[] = [];
    for (const pid of PROVIDER_ORDER) {
      const cfg = settings.providers[pid];
      if (!cfg?.enabled) continue;
      const meta = PROVIDERS[pid];
      const hidden = new Set(cfg.hiddenModels ?? []);
      const all = [
        ...meta.defaultModels,
        ...(cfg.customModels ?? []),
      ].filter((m, i, arr) => arr.indexOf(m) === i && !hidden.has(m));
      for (const model of all) {
        const m = meta.models[model];
        out.push({
          provider: pid,
          model,
          label: m?.label ?? model,
          hasThinking: m?.capabilities?.includes('thinking') ?? false,
          hasReasoning: m?.capabilities?.includes('reasoning_effort') ?? false,
        });
      }
    }
    return out;
  }, [settings.providers]);

  const enabledProviders = useMemo<ProviderId[]>(() => {
    const ids: ProviderId[] = [];
    for (const pid of PROVIDER_ORDER) {
      if (settings.providers[pid]?.enabled) ids.push(pid);
    }
    return ids;
  }, [settings.providers]);

  // Resolve the chosen provider — if the active model's provider is enabled,
  // use it; otherwise fall back to the first enabled provider.
  const currentProvider: ProviderId | null =
    active && enabledProviders.includes(active.provider)
      ? active.provider
      : enabledProviders[0] ?? null;

  const currentModel: Option | null = useMemo(() => {
    if (!active) return null;
    return (
      options.find(
        (o) => o.provider === active.provider && o.model === active.model,
      ) ?? null
    );
  }, [active, options]);

  // Close popovers on outside click
  useEffect(() => {
    if (!providerOpen && !modelOpen) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (providerRef.current?.contains(t)) return;
      if (modelRef.current?.contains(t)) return;
      setProviderOpen(false);
      setModelOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [providerOpen, modelOpen]);

  function pick(provider: ProviderId, model: string) {
    if (conv) {
      setConvModel(conv.id, { provider, model });
    } else {
      setDefaultModel({ provider, model });
    }
    setProviderOpen(false);
    setModelOpen(false);
  }

  function pickProvider(pid: ProviderId) {
    // Switching provider — pick that provider's first available model
    const first = options.find((o) => o.provider === pid);
    if (first) pick(pid, first.model);
    setProviderOpen(false);
  }

  function toggleThinking() {
    if (!conv) return;
    if (conv.thinking?.enabled) {
      setConvThinking(conv.id, undefined);
    } else {
      setConvThinking(conv.id, {
        enabled: true,
        budgetTokens: conv.thinking?.budgetTokens ?? 8000,
      });
    }
  }

  if (enabledProviders.length === 0) {
    return (
      <button
        type="button"
        className="model-picker-empty"
        onClick={() => setSettingsOpen(true)}
      >
        Add provider →
      </button>
    );
  }

  const currentProviderMeta = currentProvider
    ? PROVIDERS[currentProvider]
    : null;
  const modelsForCurrent = options.filter(
    (o) => currentProvider && o.provider === currentProvider,
  );
  const meta = active ? getModelMeta(active.provider, active.model) : undefined;
  const hasThinking = meta?.capabilities?.includes('thinking') ?? false;
  const hasReasoning = meta?.capabilities?.includes('reasoning_effort') ?? false;
  const thinkingOn = !!conv?.thinking?.enabled;

  return (
    <div className="model-picker-bar">
      {/* Provider selector */}
      <div className="mp-control" ref={providerRef}>
        <button
          type="button"
          className="mp-button"
          onClick={() => {
            setProviderOpen((v) => !v);
            setModelOpen(false);
          }}
          title="Provider"
        >
          <span className="mp-button-label">
            {currentProviderMeta?.label ?? 'Provider'}
          </span>
          <span className="mp-button-caret">▾</span>
        </button>
        {providerOpen ? (
          <div className="mp-popover">
            {enabledProviders.map((pid) => {
              const m = PROVIDERS[pid];
              const count = options.filter((o) => o.provider === pid).length;
              return (
                <button
                  key={pid}
                  type="button"
                  className={`mp-row${
                    currentProvider === pid ? ' active' : ''
                  }`}
                  onClick={() => pickProvider(pid)}
                >
                  <span className="mp-row-label">{m.label}</span>
                  <span className="mp-row-meta muted">{count} models</span>
                </button>
              );
            })}
            <button
              type="button"
              className="mp-row add"
              onClick={() => {
                setProviderOpen(false);
                setSettingsOpen(true);
              }}
            >
              + Add another provider…
            </button>
          </div>
        ) : null}
      </div>

      {/* Model selector */}
      <div className="mp-control" ref={modelRef}>
        <button
          type="button"
          className="mp-button"
          onClick={() => {
            setModelOpen((v) => !v);
            setProviderOpen(false);
          }}
          title="Model"
        >
          <span className="mp-button-label">
            {currentModel?.label ??
              (modelsForCurrent[0]?.label ?? 'Choose model')}
          </span>
          <span className="mp-button-caret">▾</span>
        </button>
        {modelOpen ? (
          <div className="mp-popover wide">
            {modelsForCurrent.length === 0 ? (
              <div className="mp-empty">
                No models available for this provider. Add some in{' '}
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setModelOpen(false);
                    setSettingsOpen(true);
                  }}
                >
                  Settings
                </button>
                .
              </div>
            ) : (
              modelsForCurrent.map((opt) => (
                <button
                  key={`${opt.provider}|${opt.model}`}
                  type="button"
                  className={`mp-row${
                    currentModel &&
                    opt.provider === currentModel.provider &&
                    opt.model === currentModel.model
                      ? ' active'
                      : ''
                  }`}
                  onClick={() => pick(opt.provider, opt.model)}
                >
                  <div className="mp-row-stack">
                    <span className="mp-row-label">{opt.label}</span>
                    <span className="mp-row-meta muted">
                      {opt.hasThinking ? 'thinking · ' : ''}
                      {opt.hasReasoning ? 'reasoning · ' : ''}
                      {opt.model}
                    </span>
                  </div>
                  {currentModel &&
                  opt.provider === currentModel.provider &&
                  opt.model === currentModel.model ? (
                    <span className="mp-row-check">✓</span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      {/* Capabilities — only when supported */}
      {hasThinking && conv ? (
        <button
          type="button"
          className={`mp-cap-toggle${thinkingOn ? ' on' : ''}`}
          onClick={toggleThinking}
          title="Use extended thinking when this provider supports it"
        >
          <span className="mp-cap-icon" aria-hidden="true">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <circle cx="12" cy="13" r="7" />
              <path
                d="M12 9v4l2.5 2.5M9 3h6M12 6V3"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span>{thinkingOn ? 'Adaptive thinking' : 'Thinking'}</span>
        </button>
      ) : null}
      {hasReasoning && conv ? (
        <div className="mp-effort">
          <span className="muted small">Effort</span>
          {(['low', 'medium', 'high'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={
                (conv.reasoningEffort ?? 'medium') === v ? 'active' : ''
              }
              onClick={() => setConvReasoning(conv.id, v)}
            >
              {v}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
