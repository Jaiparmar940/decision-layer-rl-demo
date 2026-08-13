import { useModelRegistry } from '../hooks/useModelRegistry';
import { SimLabel } from './SimLabel';

export function ModelsView() {
  const { models, apiKey, setChecked, setApiKey, clearApiKey } = useModelRegistry();
  const masked = apiKey.length > 8 ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}` : apiKey ? '••••' : '';

  return (
    <div className="page-view models-view">
      <header className="page-hero">
        <div>
          <h1 className="page-h1">MODELS // API KEYS</h1>
          <p className="page-sub">
            Select planners for comparison. Keys stay in this browser only.
          </p>
        </div>
        <SimLabel />
      </header>

      <div className="models-grid">
        <section className="panel-like models-list-panel">
          <div className="detail-kicker">CHECKABLE MODELS</div>
          <ul className="models-checklist">
            {models.map((m) => (
              <li key={m.id}>
                <label className="model-check">
                  <input
                    type="checkbox"
                    checked={m.checked}
                    onChange={(e) => setChecked(m.id, e.target.checked)}
                  />
                  <span className="model-name">{m.name}</span>
                  <span className="model-provider">{m.provider}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel-like models-key-panel">
          <div className="detail-kicker">API KEY</div>
          <p className="key-help">
            Paste an OpenRouter / provider key for offline eval scripts. Not sent
            by this static web app — stored in <code>localStorage</code> only.
          </p>
          <textarea
            className="key-input"
            rows={4}
            spellCheck={false}
            placeholder="sk-or-…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onBlur={(e) => setApiKey(e.target.value.trim())}
            aria-label="API key"
          />
          <div className="key-status">
            <span>{apiKey ? `Saved locally · ${masked}` : 'No key saved'}</span>
            <button type="button" onClick={clearApiKey} disabled={!apiKey}>
              Clear
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
