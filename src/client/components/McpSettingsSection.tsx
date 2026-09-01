import { useEffect, useState } from 'react';
import { Check, ExternalLink, PlugZap, RefreshCw, Save, ShieldAlert, X } from 'lucide-react';
import { Button, InlineStatus } from '../ui';
import type { McpServerSetting, McpSettingsView } from '../../shared/domain';
import { api } from '../lib/api';
import { SettingsSection } from './SettingsSection';

interface McpSettingsSectionProps {
  open: boolean;
  onToggle: (open: boolean) => void;
}

export function McpSettingsSection({ open, onToggle }: McpSettingsSectionProps) {
  const [settings, setSettings] = useState<McpSettingsView>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    api.loadMcpSettings().then(setSettings).catch((error: Error) => setMessage(error.message));
  }, []);

  function updateServer(id: string, update: Partial<McpServerSetting>) {
    setSettings((current) => current && ({ ...current, servers: current.servers.map((server) => server.id === id ? { ...server, ...update } : server) }));
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setMessage(undefined);
    try {
      setSettings(await api.saveMcpSettings({ servers: settings.servers, updatedAt: settings.updatedAt }));
      setMessage('Настройки MCP сохранены.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось сохранить настройки MCP.');
    } finally {
      setSaving(false);
    }
  }

  const enabledCount = settings?.servers.filter((server) => server.enabled).length ?? 0;
  return <SettingsSection
    title="MCP-серверы"
    description="Дополнительные источники для исследований"
    icon={<PlugZap size={15} />}
    status={<InlineStatus tone={enabledCount > 0 ? 'success' : 'info'}>{enabledCount > 0 ? `Включено: ${enabledCount}` : 'Не используются'}</InlineStatus>}
    open={open}
    onToggle={onToggle}
    className="mcp-settings-section"
  >
    <div className="mcp-section-toolbar"><p>Включённые серверы передаются только текущему процессу Codex.</p><Button variant="primary" disabled={!settings || saving} onClick={save}><Save size={12} />{saving ? 'Сохраняем…' : 'Сохранить'}</Button></div>
    {message && <div className="mcp-message">{message}</div>}
    {!settings ? <div className="mcp-loading"><RefreshCw size={13} className="spin" /> Загружаем…</div> : <div className="mcp-server-list">
      {settings.servers.map((server) => {
        const readiness = settings.readiness.find((item) => item.id === server.id);
        return <details className={`mcp-server ${server.enabled ? 'is-enabled' : ''}`} key={server.id}>
          <summary>
            <label className="mcp-toggle" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={server.enabled} onChange={(event) => updateServer(server.id, { enabled: event.target.checked })} /><span /></label>
            <PlugZap size={14} />
            <span className="mcp-server__title"><strong>{server.name}</strong><small>{server.description}</small></span>
            <span className={`mcp-readiness ${readiness?.ready ? 'ok' : 'fail'}`}>{readiness?.ready ? <Check size={10} /> : <X size={10} />}{readiness?.ready ? 'Готов' : 'Нужна настройка'}</span>
            <span className="mcp-server__chevron">›</span>
          </summary>
          <div className="mcp-server__content">
            <p className="mcp-readiness-detail">{readiness?.message}</p>
            <div className="mcp-fields">
              <label>Транспорт<select value={server.transport} onChange={(event) => updateServer(server.id, { transport: event.target.value as McpServerSetting['transport'] })}><option value="stdio">stdio</option><option value="http">HTTP</option></select></label>
              {server.transport === 'stdio' ? <><label>Команда<input value={server.command} onChange={(event) => updateServer(server.id, { command: event.target.value })} placeholder="npx или uvx" /></label><label className="mcp-field-wide">Аргументы — один на строку<textarea value={server.args.join('\n')} onChange={(event) => updateServer(server.id, { args: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) })} /></label></> : <><label className="mcp-field-wide">Streamable HTTP URL<input value={server.url} onChange={(event) => updateServer(server.id, { url: event.target.value })} placeholder="https://example.org/mcp" /></label><label className="mcp-field-wide">Переменная bearer-токена<input value={server.bearerTokenEnvVar} onChange={(event) => updateServer(server.id, { bearerTokenEnvVar: event.target.value.trim().toUpperCase() })} placeholder="MCP_BEARER_TOKEN" /></label></>}
              <label className="mcp-field-wide">Переменные окружения<input value={server.envVars.join(', ')} onChange={(event) => updateServer(server.id, { envVars: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="BRAVE_API_KEY" /></label>
            </div>
            <footer><ShieldAlert size={11} /><span>{server.caution}</span>{server.sourceUrl && <a href={server.sourceUrl} target="_blank" rel="noreferrer">Исходный код <ExternalLink size={10} /></a>}</footer>
          </div>
        </details>;
      })}
    </div>}
  </SettingsSection>;
}
