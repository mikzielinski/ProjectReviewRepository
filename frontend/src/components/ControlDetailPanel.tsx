import { useEffect, useState } from 'react'
import api from '../services/api'
import { getAuditActionLabel } from '../utils/auditLabels'
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

export interface ControlListPreview {
  control_ref?: string
  control_title?: string
  description?: string
  framework_code?: string
  domain?: string
  control_owner_user_id?: string
  control_owner_name?: string
  assignee_user_id?: string
  assignee_name?: string
  status: string
  is_applicable?: boolean
  implementation_notes?: string
  review_frequency_days?: number
  next_review_at?: string
  last_tested_at?: string
}

interface UserOption {
  id: string
  name: string
}

interface Props {
  projectId: string
  assignmentId: string
  listPreview?: ControlListPreview
  readOnly?: boolean
  onClose: () => void
  onUpdated?: () => void
}

const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED', 'TESTED', 'NON_APPLICABLE']

function isDetailUnavailable(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status
  return status === 404 || status === 405
}

function buildDetailFromPreview(
  projectId: string,
  assignmentId: string,
  preview: ControlListPreview,
): ControlDetail {
  return {
    id: assignmentId,
    project_id: projectId,
    control_ref: preview.control_ref,
    control_title: preview.control_title,
    description: preview.description,
    framework_code: preview.framework_code,
    domain: preview.domain,
    control_owner_user_id: preview.control_owner_user_id,
    control_owner_name: preview.control_owner_name,
    assignee_user_id: preview.assignee_user_id,
    assignee_name: preview.assignee_name,
    status: preview.status,
    is_applicable: preview.is_applicable ?? true,
    implementation_notes: preview.implementation_notes,
    review_frequency_days: preview.review_frequency_days,
    next_review_at: preview.next_review_at,
    last_tested_at: preview.last_tested_at,
  }
}

export default function ControlDetailPanel({
  projectId,
  assignmentId,
  listPreview,
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
  const [notice, setNotice] = useState<string | null>(null)

  const [notes, setNotes] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [evidenceLabel, setEvidenceLabel] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    setNotice(null)
    let detailData: ControlDetail | null = null
    let usedFallback = false

    try {
      const detailRes = await api.get<ControlDetail>(`/projects/${projectId}/controls/${assignmentId}`)
      detailData = detailRes.data
    } catch (err: unknown) {
      if (listPreview && isDetailUnavailable(err)) {
        detailData = buildDetailFromPreview(projectId, assignmentId, listPreview)
        usedFallback = true
      } else {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        setError(typeof msg === 'string' ? msg : 'Failed to load control details')
      }
    }

    if (!detailData && listPreview) {
      detailData = buildDetailFromPreview(projectId, assignmentId, listPreview)
      usedFallback = true
    }

    if (detailData) {
      setDetail(detailData)
      setNotes(detailData.implementation_notes || '')
    } else {
      setDetail(null)
    }

    try {
      const runsRes = await api.get<ControlTestRun[]>(`/projects/${projectId}/controls/${assignmentId}/run-history`)
      setRuns(runsRes.data || [])
    } catch {
      setRuns([])
    }

    if (usedFallback) {
      setNotice('Full control details are temporarily unavailable. Showing list data — library description and test history will appear after the API is deployed.')
    }

    if (!readOnly) {
      const usersRes = await api.get<UserOption[]>('/users').catch(() => ({ data: [] as UserOption[] }))
      setUsers(usersRes.data || [])
    }

    setLoading(false)
  }

  useEffect(() => { load() }, [projectId, assignmentId, listPreview])

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
      label: evidenceLabel.trim() || 'Control evidence',
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
          <p>Loading…</p>
        </div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="cdp-overlay" onClick={onClose}>
        <div className="cdp-panel" onClick={(e) => e.stopPropagation()}>
          <header className="cdp-header">
            <h3>Control details</h3>
            <button className="cdp-close" onClick={onClose} aria-label="Close">✕</button>
          </header>
          {error && <div className="cdp-error">{error}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="cdp-overlay" onClick={onClose}>
      <div className="cdp-panel" onClick={(e) => e.stopPropagation()}>
        <header className="cdp-header">
          <div>
            <code className="cdp-ref">{detail.control_ref}</code>
            <h3>{detail.control_title}</h3>
            {detail.framework_code && (
              <span className="cdp-framework">{detail.framework_code}</span>
            )}
          </div>
          <button className="cdp-close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        {error && <div className="cdp-error">{error}</div>}
        {notice && <div className="cdp-notice">{notice}</div>}

        <div className="cdp-body">
            <section className="cdp-section cdp-section-description">
              <h4>What this control requires</h4>
              {detail.description ? (
                <p className="cdp-description">{detail.description}</p>
              ) : (
                <p className="cdp-description cdp-description-missing">No description available for this control.</p>
              )}
              <div className="cdp-meta-grid">
                {detail.domain && <div><span>Domain</span><strong>{detail.domain}</strong></div>}
                {detail.control_type && <div><span>Type</span><strong>{detail.control_type}</strong></div>}
                {detail.testing_frequency_days != null && (
                  <div><span>Test frequency</span><strong>{detail.testing_frequency_days} days</strong></div>
                )}
                {detail.review_frequency_days != null && (
                  <div><span>Review (project)</span><strong>{detail.review_frequency_days} days</strong></div>
                )}
              </div>
            </section>

            {(detail.mapped_document_types_json?.length || detail.evidence_requirements_json?.length) ? (
              <section className="cdp-section">
                <h4>Requirements</h4>
                {detail.mapped_document_types_json?.length ? (
                  <div className="cdp-tags">
                    <span className="cdp-tags-label">Document types:</span>
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
              <h4>Implementation status</h4>
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
                  <span>Next review</span>
                  <strong>{detail.next_review_at ? new Date(detail.next_review_at).toLocaleDateString() : '—'}</strong>
                </div>
                <div>
                  <span>Last test</span>
                  <strong>{detail.last_tested_at ? new Date(detail.last_tested_at).toLocaleString() : '—'}</strong>
                </div>
              </div>
              {!readOnly && (
                <div className="cdp-notes">
                  <label>Implementation notes</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                  <button className="btn-secondary" onClick={saveNotes} disabled={saving}>Save notes</button>
                </div>
              )}
              {readOnly && detail.implementation_notes && (
                <p className="cdp-notes-readonly">{detail.implementation_notes}</p>
              )}
            </section>

            <section className="cdp-section">
              <h4>Evidence</h4>
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
                <p className="muted">No evidence attached.</p>
              )}
              {!readOnly && (
                <div className="cdp-evidence-form">
                  <input
                    type="url"
                    placeholder="Evidence URL (e.g. link to document)"
                    value={evidenceUrl}
                    onChange={(e) => setEvidenceUrl(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Label (optional)"
                    value={evidenceLabel}
                    onChange={(e) => setEvidenceLabel(e.target.value)}
                  />
                  <button
                    className="btn-primary"
                    onClick={addEvidenceAndTest}
                    disabled={saving || !evidenceUrl.trim()}
                  >
                    Add evidence and mark as tested
                  </button>
                </div>
              )}
            </section>

            <section className="cdp-section">
              <h4>Previous test runs</h4>
              {runs.length === 0 ? (
                <p className="muted">No recorded test runs in the audit trail.</p>
              ) : (
                <div className="cdp-runs">
                  {runs.map((run) => (
                    <div key={run.id} className="cdp-run-row">
                      <div className="cdp-run-meta">
                        <strong>{getAuditActionLabel(run.action)}</strong>
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
      </div>
    </div>
  )
}
