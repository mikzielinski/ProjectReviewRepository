import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import ControlDetailPanel from '../components/ControlDetailPanel'
import api from '../services/api'
import { getAuditActionLabel } from '../utils/auditLabels'
import './Auditor.css'

interface Overview {
  compliance_project_count: number
  total_control_assignments: number
  overdue_count: number
  gap_count: number
  tested_count: number
  by_status: Record<string, number>
}

interface ControlItem {
  assignment_id: string
  project_id: string
  project_key?: string
  project_name?: string
  control_ref: string
  control_title: string
  framework_code?: string
  domain?: string
  status: string
  control_owner_name?: string
  assignee_name?: string
  next_review_at?: string
  last_tested_at?: string
  is_overdue?: boolean
  gap_reason?: string
}

interface AuditEntry {
  id: string
  project_id?: string
  project_key?: string
  project_name?: string
  action: string
  action_label?: string
  entity_type: string
  actor_name?: string
  created_at?: string
}

type Tab = 'overview' | 'controls' | 'gaps' | 'audit'

export default function Auditor() {
  const [tab, setTab] = useState<Tab>('overview')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [controls, setControls] = useState<ControlItem[]>([])
  const [gaps, setGaps] = useState<ControlItem[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedControl, setSelectedControl] = useState<ControlItem | null>(null)
  const [exporting, setExporting] = useState(false)

  const emptyOverview: Overview = {
    compliance_project_count: 0,
    total_control_assignments: 0,
    overdue_count: 0,
    gap_count: 0,
    tested_count: 0,
    by_status: {},
  }

  const loadOverview = async () => {
    const res = await api.get('/auditor/overview')
    setOverview(res.data)
  }

  const loadControls = async () => {
    const params = overdueOnly ? { overdue_only: true } : {}
    const res = await api.get('/auditor/controls', { params })
    setControls(res.data || [])
  }

  const loadGaps = async () => {
    const res = await api.get('/auditor/gaps')
    setGaps(res.data || [])
  }

  const loadAudit = async () => {
    const res = await api.get('/auditor/audit-trail', { params: { limit: 200 } })
    setAudit(res.data || [])
  }

  useEffect(() => {
    setLoading(true)
    setLoadError(null)
    Promise.allSettled([loadOverview(), loadControls(), loadGaps(), loadAudit()])
      .then((results) => {
        const failed = results.filter((r) => r.status === 'rejected')
        if (failed.length === results.length) {
          setLoadError('Failed to load auditor portal data. Check that the backend is deployed with /auditor/ endpoints.')
        } else if (failed.length > 0) {
          setLoadError('Some data could not be loaded.')
        }
        if (results[0].status === 'rejected') {
          setOverview(emptyOverview)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (tab === 'controls') loadControls()
  }, [overdueOnly, tab])

  const exportReport = async () => {
    setExporting(true)
    try {
      const res = await api.get('/auditor/report', {
        params: { format: 'csv' },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `auditor-report-${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Layout>
      <div className="auditor-page">
        <header className="auditor-header">
          <div>
            <h1>Auditor Portal</h1>
            <p>Read-only view — audit trail, control test status, and compliance gaps across all projects</p>
          </div>
          <div className="auditor-header-actions">
            <button className="btn-export" onClick={exportReport} disabled={exporting}>
              {exporting ? 'Exporting…' : 'Export report'}
            </button>
            <span className="read-only-badge">Read only</span>
          </div>
        </header>

        <div className="auditor-tabs">
          <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
            Overview
          </button>
          <button className={tab === 'controls' ? 'active' : ''} onClick={() => setTab('controls')}>
            Controls
          </button>
          <button className={tab === 'gaps' ? 'active' : ''} onClick={() => setTab('gaps')}>
            Compliance gaps
            {overview && overview.gap_count > 0 && (
              <span className="tab-badge">{overview.gap_count}</span>
            )}
          </button>
          <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>
            Audit trail
          </button>
        </div>

        {loadError && (
          <div className="auditor-error" role="alert">{loadError}</div>
        )}

        {loading ? (
          <p>Loading…</p>
        ) : tab === 'overview' ? (
          <section className="auditor-overview">
            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-value">{(overview ?? emptyOverview).compliance_project_count}</span>
                <span className="stat-label">Compliance projects</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{(overview ?? emptyOverview).total_control_assignments}</span>
                <span className="stat-label">Assigned controls</span>
              </div>
              <div className="stat-card warn">
                <span className="stat-value">{(overview ?? emptyOverview).gap_count}</span>
                <span className="stat-label">Gaps / to address</span>
              </div>
              <div className="stat-card alert">
                <span className="stat-value">{(overview ?? emptyOverview).overdue_count}</span>
                <span className="stat-label">Overdue reviews</span>
              </div>
              <div className="stat-card ok">
                <span className="stat-value">{(overview ?? emptyOverview).tested_count}</span>
                <span className="stat-label">Tested</span>
              </div>
            </div>
            {Object.keys((overview ?? emptyOverview).by_status).length > 0 && (
              <div className="card status-breakdown">
                <h2>Control status</h2>
                <div className="status-chips">
                  {Object.entries((overview ?? emptyOverview).by_status).map(([status, count]) => (
                    <div key={status} className="status-chip">
                      <strong>{status}</strong>
                      <span>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : tab === 'controls' ? (
          <section className="card auditor-section">
            <div className="section-toolbar">
              <h2>Control test status</h2>
              <label className="filter-check">
                <input
                  type="checkbox"
                  checked={overdueOnly}
                  onChange={(e) => setOverdueOnly(e.target.checked)}
                />
                Overdue only
              </label>
            </div>
            {controls.length === 0 ? (
              <p className="empty-hint">No assigned controls in accessible projects.</p>
            ) : (
              <table className="auditor-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Ref</th>
                    <th>Control</th>
                    <th>Framework</th>
                    <th>Owner</th>
                    <th>Status</th>
                    <th>Next review</th>
                  </tr>
                </thead>
                <tbody>
                  {controls.map((c) => (
                    <tr
                      key={c.assignment_id}
                      className={`auditor-row-clickable ${c.is_overdue ? 'overdue' : ''}`}
                      onClick={() => setSelectedControl(c)}
                    >
                      <td>
                        <Link to={`/projects/${c.project_id}`} className="project-link">
                          <code>{c.project_key}</code>
                        </Link>
                      </td>
                      <td><code>{c.control_ref}</code></td>
                      <td>
                        <strong>{c.control_title}</strong>
                        {c.domain && <div className="muted">{c.domain}</div>}
                      </td>
                      <td>{c.framework_code}</td>
                      <td>{c.control_owner_name || '—'}</td>
                      <td><span className={`status-pill status-${c.status.toLowerCase()}`}>{c.status}</span></td>
                      <td>{c.next_review_at ? new Date(c.next_review_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ) : tab === 'gaps' ? (
          <section className="card auditor-section">
            <h2>Compliance gaps</h2>
            <p className="hint">Controls requiring attention — incomplete statuses or overdue test schedule.</p>
            {gaps.length === 0 ? (
              <p className="empty-hint">No gaps detected — all controls are up to date.</p>
            ) : (
              <table className="auditor-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Control</th>
                    <th>Framework</th>
                    <th>Status</th>
                    <th>Gap reason</th>
                    <th>Review due</th>
                  </tr>
                </thead>
                <tbody>
                  {gaps.map((g) => (
                    <tr
                      key={g.assignment_id}
                      className="gap-row auditor-row-clickable"
                      onClick={() => setSelectedControl(g)}
                    >
                      <td>
                        <Link to={`/projects/${g.project_id}`} className="project-link">
                          <code>{g.project_key}</code>
                        </Link>
                      </td>
                      <td><code>{g.control_ref}</code> {g.control_title}</td>
                      <td>{g.framework_code}</td>
                      <td><span className={`status-pill status-${g.status.toLowerCase()}`}>{g.status}</span></td>
                      <td className="gap-reason">{g.gap_reason}</td>
                      <td>{g.next_review_at ? new Date(g.next_review_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ) : (
          <section className="card auditor-section">
            <h2>Audit trail (all projects)</h2>
            {audit.length === 0 ? (
              <p className="empty-hint">No audit trail entries.</p>
            ) : (
              <div className="audit-list">
                {audit.map((entry) => (
                  <div key={entry.id} className="audit-row">
                    <div className="audit-meta">
                      <strong>{entry.action_label || getAuditActionLabel(entry.action)}</strong>
                      <span>{entry.entity_type}</span>
                      {entry.project_key && (
                        entry.project_id ? (
                          <Link to={`/projects/${entry.project_id}`} className="project-link">
                            <code>{entry.project_key}</code>
                          </Link>
                        ) : (
                          <code>{entry.project_key}</code>
                        )
                      )}
                      <span>{entry.actor_name || 'System'}</span>
                      <time>{entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}</time>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {selectedControl && (
        <ControlDetailPanel
          projectId={selectedControl.project_id}
          assignmentId={selectedControl.assignment_id}
          listPreview={{
            control_ref: selectedControl.control_ref,
            control_title: selectedControl.control_title,
            framework_code: selectedControl.framework_code,
            domain: selectedControl.domain,
            control_owner_name: selectedControl.control_owner_name,
            assignee_name: selectedControl.assignee_name,
            status: selectedControl.status,
            next_review_at: selectedControl.next_review_at,
            last_tested_at: selectedControl.last_tested_at,
            is_applicable: true,
          }}
          readOnly
          onClose={() => setSelectedControl(null)}
        />
      )}
    </Layout>
  )
}
