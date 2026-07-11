import { useEffect, useState } from 'react'
import api from '../services/api'
import './ControlDetailPanel.css'

export interface EvidenceLink {
  url: string
  label?: string
  uploaded_at?: string
  run_date?: string
}

export interface ControlDetail {
  id: string
  project_id: string
  control_ref?: string
  control_title?: string
  description?: string
  framework_code?: string
  domain?: string
  control_type?: string
  testing_frequency_days?: number
  mapped_document_types_json?: unknown[]
  evidence_requirements_json?: unknown[]
  control_owner_user_id?: string
  control_owner_name?: string
  assignee_user_id?: string
  assignee_name?: string
  status: string
  is_applicable: boolean
  implementation_notes?: string
  evidence_links_json?: EvidenceLink[]
  review_frequency_days?: number
  next_review_at?: string
  last_tested_at?: string
}

export interface ControlTestRun {
  id: string
  action: string
  tested_at?: string
  tested_by_name?: string
  status?: string
  evidence_links_json?: EvidenceLink[]
  notes?: string
  created_at?: string
}

interface UserOption {
  id: string
  name: string
}

interface Props {
  projectId: string
  assignmentId: string
  readOnly?: boolean
  onClose: () => void
  onUpdated?: () => void
}

const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED', 'TESTED', 'NON_APPLICABLE']

export default function ControlDetailPanel({
  projectId,
  assignmentId,
  readOnly = false,
  onClose,
  onUpdated,
}: Props) {
  const [detail, setDetail] = useState<ControlDetail | null>(null)
  const [runs, setRuns] = useState<ControlTestRun[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [notes, setNotes] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [evidenceLabel, setEvidenceLabel] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [detailRes, runsRes] = await Promise.all([
        api.get<ControlDetail>(`/projects/${projectId}/controls/${assignmentId}`),
        api.get<ControlTestRun[]>(`/projects/${projectId}/controls/${assignmentId}/run-history`),
      ])
      setDetail(detailRes.data)
      setRuns(runsRes.data || [])
      setNotes(detailRes.data.implementation_notes || '')

      if (!readOnly) {
        const usersRes = await api.get<UserOption[]>('/users').catch(() => ({ data: [] as UserOption[] }))
        setUsers(usersRes.data || [])
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Nie udało się załadować szczegółów kontrolki')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId, assignmentId])

  const savePatch = async (patch: Record<string, unknown>) => {
    setSaving(true)
    try {
      await api.put(`/projects/${projectId}/controls/${assignmentId}`, patch)
      await load()
      onUpdated?.()
    } finally {
      setSaving(false)
    }
  }

  const addEvidenceAndTest = async () => {
    if (!detail || !evidenceUrl.trim()) return
    const now = new Date().toISOString()
    const newLink: EvidenceLink = {
      url: evidenceUrl.trim(),
      label: evidenceLabel.trim() || 'Dowód kontroli',
      uploaded_at: now,
      run_date: now.split('T')[0],
    }
    const links = [...(detail.evidence_links_json || []), newLink]
    await savePatch({
      evidence_links_json: links,
      status: 'TESTED',
      last_tested_at: now,
      implementation_notes: notes || detail.implementation_notes,
    })
    setEvidenceUrl('')
    setEvidenceLabel('')
  }

  const saveNotes = async () => {
    await savePatch({ implementation_notes: notes })
  }

  if (!detail && loading) {
    return (
      <div className="cdp-overlay" onClick={onClose}>
        <div className="cdp-panel" onClick={(e) => e.stopPropagation()}>
          <p>Ładowanie…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="cdp-overlay" onClick={onClose}>
      <div className="cdp-panel" onClick={(e) => e.stopPropagation()}>
        <header className="cdp-header">
          <div>
            <code className="cdp-ref">{detail?.control_ref}</code>
            <h3>{detail?.control_title}</h3>
            {detail?.framework_code && (
              <span className="cdp-framework">{detail.framework_code}</span>
            )}
          </div>
          <button className="cdp-close" onClick={onClose} aria-label="Zamknij">✕</button>
        </header>

        {error && <div className="cdp-error">{error}</div>}

        {detail && (
          <div className="cdp-body">
            <section className="cdp-section">
              <h4>Opis kontrolki</h4>
              <p className="cdp-description">{detail.description || 'Brak opisu w bibliotece kontrolek.'}</p>
              <div className="cdp-meta-grid">
                {detail.domain && <div><span>Domena</span><strong>{detail.domain}</strong></div>}
                {detail.control_type && <div><span>Typ</span><strong>{detail.control_type}</strong></div>}
                {detail.testing_frequency_days != null && (
                  <div><span>Częstotliwość testów</span><strong>{detail.testing_frequency_days} dni</strong></div>
                )}
                {detail.review_frequency_days != null && (
                  <div><span>Review (projekt)</span><strong>{detail.review_frequency_days} dni</strong></div>
                )}
              </div>
            </section>

            {(detail.mapped_document_types_json?.length || detail.evidence_requirements_json?.length) ? (
              <section className="cdp-section">
                <h4>Wymagania</h4>
                {detail.mapped_document_types_json?.length ? (
                  <div className="cdp-tags">
                    <span className="cdp-tags-label">Typy dokumentów:</span>
                    {detail.mapped_document_types_json.map((t, i) => (
                      <span key={i} className="cdp-tag">{String(t)}</span>
                    ))}
                  </div>
                ) : null}
                {detail.evidence_requirements_json?.length ? (
                  <ul className="cdp-list">
                    {detail.evidence_requirements_json.map((req, i) => (
                      <li key={i}>{typeof req === 'string' ? req : JSON.stringify(req)}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}

            <section className="cdp-section">
              <h4>Status implementacji</h4>
              <div className="cdp-meta-grid">
                <div>
                  <span>Status</span>
                  {readOnly ? (
                    <strong className={`status-pill status-${detail.status.toLowerCase()}`}>{detail.status}</strong>
                  ) : (
                    <select
                      value={detail.status}
                      onChange={(e) => savePatch({ status: e.target.value })}
                      disabled={saving}
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <span>Control Owner</span>
                  {readOnly ? (
                    <strong>{detail.control_owner_name || '—'}</strong>
                  ) : (
                    <select
                      value={detail.control_owner_user_id || ''}
                      onChange={(e) => savePatch({ control_owner_user_id: e.target.value || null })}
                      disabled={saving}
                    >
                      <option value="">—</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <span>Assignee</span>
                  {readOnly ? (
                    <strong>{detail.assignee_name || '—'}</strong>
                  ) : (
                    <select
                      value={detail.assignee_user_id || ''}
                      onChange={(e) => savePatch({ assignee_user_id: e.target.value || null })}
                      disabled={saving}
                    >
                      <option value="">—</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <span>Nast. review</span>
                  <strong>{detail.next_review_at ? new Date(detail.next_review_at).toLocaleDateString() : '—'}</strong>
                </div>
                <div>
                  <span>Ostatni test</span>
                  <strong>{detail.last_tested_at ? new Date(detail.last_tested_at).toLocaleString() : '—'}</strong>
                </div>
              </div>
              {!readOnly && (
                <div className="cdp-notes">
                  <label>Notatki implementacji</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                  <button className="btn-secondary" onClick={saveNotes} disabled={saving}>Zapisz notatki</button>
                </div>
              )}
              {readOnly && detail.implementation_notes && (
                <p className="cdp-notes-readonly">{detail.implementation_notes}</p>
              )}
            </section>

            <section className="cdp-section">
              <h4>Dowody / evidence</h4>
              {detail.evidence_links_json?.length ? (
                <ul className="cdp-evidence-list">
                  {detail.evidence_links_json.map((ev, i) => (
                    <li key={i}>
                      <a href={ev.url} target="_blank" rel="noopener noreferrer">{ev.label || ev.url}</a>
                      {ev.run_date && <span className="muted"> — run: {ev.run_date}</span>}
                      {ev.uploaded_at && <span className="muted"> ({new Date(ev.uploaded_at).toLocaleDateString()})</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Brak załączonych dowodów.</p>
              )}
              {!readOnly && (
                <div className="cdp-evidence-form">
                  <input
                    type="url"
                    placeholder="URL dowodu (np. link do dokumentu)"
                    value={evidenceUrl}
                    onChange={(e) => setEvidenceUrl(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Etykieta (opcjonalnie)"
                    value={evidenceLabel}
                    onChange={(e) => setEvidenceLabel(e.target.value)}
                  />
                  <button
                    className="btn-primary"
                    onClick={addEvidenceAndTest}
                    disabled={saving || !evidenceUrl.trim()}
                  >
                    Dodaj dowód i oznacz jako przetestowane
                  </button>
                </div>
              )}
            </section>

            <section className="cdp-section">
              <h4>Poprzednie uruchomienia</h4>
              {runs.length === 0 ? (
                <p className="muted">Brak zapisanych uruchomień testów w audit trail.</p>
              ) : (
                <div className="cdp-runs">
                  {runs.map((run) => (
                    <div key={run.id} className="cdp-run-row">
                      <div className="cdp-run-meta">
                        <strong>{run.action.replace(/_/g, ' ')}</strong>
                        <span>{run.tested_by_name || 'System'}</span>
                        <time>{run.tested_at ? new Date(run.tested_at).toLocaleString() : ''}</time>
                        {run.status && <span className={`status-pill status-${run.status.toLowerCase()}`}>{run.status}</span>}
                      </div>
                      {run.evidence_links_json?.length ? (
                        <ul className="cdp-run-evidence">
                          {run.evidence_links_json.map((ev, i) => (
                            <li key={i}>
                              <a href={ev.url} target="_blank" rel="noopener noreferrer">{ev.label || ev.url}</a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {run.notes && <p className="muted">{run.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
