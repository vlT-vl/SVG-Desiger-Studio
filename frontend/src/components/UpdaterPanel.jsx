import { useEffect, useState } from 'react'
import { FiDownload, FiRefreshCw, FiRotateCw } from 'react-icons/fi'
import * as nex from '../lib/nex.js'
import '../styles/Updater.css'

const emptyState = {
  configured: false,
  source: '',
  currentVersion: '',
  currentBuild: '',
  status: 'idle',
  update: null,
  progress: { received: 0, total: 0 },
  settings: { autoCheck: true, autoDownload: false, includePrerelease: false },
  lastCheck: '',
  error: '',
}

const settingKeys = ['autoCheck', 'autoDownload']

function mergeState(prev, next) {
  return {
    ...prev,
    ...next,
    progress: { ...prev.progress, ...(next?.progress ?? {}) },
    settings: { ...prev.settings, ...(next?.settings ?? {}) },
  }
}

function formatBytes(value) {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

function Row({ label, children }) {
  return (
    <div className="sn-row">
      <dt className="sn-row__label">{label}</dt>
      <dd className="sn-row__value">{children}</dd>
    </div>
  )
}

export function UpdaterPanel({ labels }) {
  const [state, setState] = useState(emptyState)
  const [lastResult, setLastResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!nex.isReady()) return undefined
    nex.updater.getState().then(next => setState(prev => mergeState(prev, next))).catch(e => setError(e.message))
    let cancelled = false
    const timers = []
    const pollLastResult = attempt => {
      nex.updater
        .getLastResult()
        .then(result => {
          if (cancelled) return
          if (result) setLastResult(result)
          else if (attempt < 5) timers.push(setTimeout(() => pollLastResult(attempt + 1), 1500))
        })
        .catch(() => {})
    }
    pollLastResult(0)
    const offState = nex.updater.onState(next => setState(prev => mergeState(prev, next)))
    const offProgress = nex.updater.onProgress(progress =>
      setState(prev => ({ ...prev, progress: { ...prev.progress, ...progress } }))
    )
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
      offState()
      offProgress()
    }
  }, [])

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      const next = await action()
      if (next && typeof next === 'object') setState(prev => mergeState(prev, next))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function changeSetting(key, value) {
    await run(async () => {
      await nex.updater.setSettings({ ...state.settings, [key]: value })
      return nex.updater.getState()
    })
  }

  if (!nex.isReady()) {
    return (
      <div className="sn-card">
        <div className="sn-card__title">{labels.title}</div>
        <p className="sn-hint">{labels.unavailable}</p>
      </div>
    )
  }

  const update = state.update
  const installable = Boolean(update?.installable)
  const downloading = state.status === 'downloading'
  const total = state.progress.total || 0
  const percent = total > 0 ? Math.min(100, Math.round((state.progress.received / total) * 100)) : 0
  const errorText = error || state.error
  const statusText = state.configured ? labels.states[state.status] ?? state.status : labels.notConfigured

  return (
    <div className="sn-card">
      <div className="sn-card__title">{labels.title}</div>

      <dl className="sn-table">
        <Row label={labels.current}>
          {state.currentVersion || '…'}
          {state.currentBuild ? ` · ${state.currentBuild}` : ''}
        </Row>
        <Row label={labels.status}>{statusText}</Row>
        {state.source ? <Row label={labels.source}>{state.source}</Row> : null}
        {state.lastCheck ? <Row label={labels.lastCheck}>{new Date(state.lastCheck).toLocaleString()}</Row> : null}
      </dl>

      {lastResult ? (
        <div className={`sn-updater__banner ${lastResult.status === 'updated' ? 'is-ok' : 'is-err'}`}>
          {lastResult.status === 'updated'
            ? `${labels.updatedOk}${state.currentVersion ? ` ${state.currentVersion} · ${state.currentBuild}` : ''}.`
            : `${labels.rolledBackResult}${lastResult.reason ? `: ${lastResult.reason}` : '.'}`}
        </div>
      ) : null}

      {update ? (
        <div className="sn-updater__update">
          <div className="sn-updater__head">
            <span className="sn-updater__version">{update.version} · {update.build}</span>
            {update.date ? <span className="sn-updater__date">{update.date}</span> : null}
            {update.mandatory ? <span className="sn-updater__tag">{labels.mandatory}</span> : null}
            {update.rolledBack ? <span className="sn-updater__tag">{labels.rolledBack}</span> : null}
          </div>
          {update.notes ? <pre className="sn-updater__notes">{update.notes}</pre> : null}
          {!installable && update.reason ? <p className="sn-hint">{update.reason}</p> : null}
          {downloading ? (
            <div className="sn-updater__progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <div className="sn-updater__bar" style={{ width: `${percent}%` }} />
              <span className="sn-updater__progress-text">
                {formatBytes(state.progress.received)} / {total > 0 ? formatBytes(total) : '?'}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {errorText ? <div className="sn-updater__banner is-err" role="alert">{errorText}</div> : null}

      <div className="sn-updater__actions">
        <button
          className="sn-updater__button"
          type="button"
          disabled={busy || !state.configured || downloading || state.status === 'installing'}
          onClick={() => run(() => nex.updater.check({ manual: true }))}
        >
          <FiRefreshCw aria-hidden="true" size={14} />
          {labels.check}
        </button>
        {update && installable && state.status === 'available' ? (
          <button className="sn-updater__button" type="button" disabled={busy} onClick={() => run(() => nex.updater.download())}>
            <FiDownload aria-hidden="true" size={14} />
            {labels.download}
          </button>
        ) : null}
        {update && installable && state.status === 'downloaded' ? (
          <button className="sn-updater__button sn-updater__button--primary" type="button" disabled={busy} onClick={() => run(() => nex.updater.install())}>
            <FiRotateCw aria-hidden="true" size={14} />
            {labels.install}
          </button>
        ) : null}
      </div>

      <div className="sn-updater__options">
        {settingKeys.map(key => (
          <label className="sn-updater__toggle" key={key}>
            <input
              type="checkbox"
              checked={Boolean(state.settings[key])}
              disabled={busy || !state.configured}
              onChange={event => changeSetting(key, event.target.checked)}
            />
            <span>{labels[key]}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
