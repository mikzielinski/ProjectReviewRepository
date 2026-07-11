import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import api from '../services/api'
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
    Promise.all([loadOverview(), loadControls(), loadGaps(), loadAudit()])
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (tab === 'controls') loadControls()
  }, [overdueOnly, tab])

  return (
    <Layout>
      <div className="auditor-page">
        <header className="auditor-header">
          <div>
            <h1>Portal audytora</h1>
            <p>Widok tylko do odczytu — audit trail, status testów kontrolek i luki compliance we wszystkich projektach</p>
          </div>
          <span className="read-only-badge">Tylko odczyt</span>
        </header>

        <div className="auditor-tabs">
          <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
            Podsumowanie
          </button>
          <button className={tab === 'controls' ? 'active' : ''} onClick={() => setTab('controls')}>
            Kontrolki
          </button>
          <button className={tab === 'gaps' ? 'active' : ''} onClick={() => setTab('gaps')}>
            Luki compliance
            {overview && overview.gap_count > 0 && (
              <span className="tab-badge">{overview.gap_count}</span>
            )}
          </button>
          <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>
            Audit trail
          </button>
        </div>

        {loading ? (
          <p>Ładowanie…</p>
        ) : tab === 'overview' && overview ? (
          <section className="auditor-overview">
            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-value">{overview.compliance_project_count}</span>
                <span className="stat-label">Projekty compliance</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{overview.total_control_assignments}</span>
                <span className="stat-label">Przypisane kontrolki</span>
              </div>
              <div className="stat-card warn">
                <span className="stat-value">{overview.gap_count}</span>
                <span className="stat-label">Luki / do uzupełnienia</span>
              </div>
              <div className="stat-card alert">
                <span className="stat-value">{overview.overdue_count}</span>
                <span className="stat-label">Przeterminowane review</span>
              </div>
              <div className="stat-card ok">
                <span className="stat-value">{overview.tested_count}</span>
                <span className="stat-label">Przetestowane</span>
              </div>
            </div>
            {Object.keys(overview.by_status).length > 0 && (
              <div className="card status-breakdown">
                <h2>Status kontrolek</h2>
                <div className="status-chips">
                  {Object.entries(overview.by_status).map(([status, count]) => (
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
              <h2>Status testów kontrolek</h2>
              <label className="filter-check">
                <input
                  type="checkbox"
                  checked={overdueOnly}
                  onChange={(e) => setOverdueOnly(e.target.checked)}
                />
                Tylko przeterminowane
              </label>
            </div>
            {controls.length === 0 ? (
              <p className="empty-hint">Brak przypisanych kontrolek w dostępnych projektach.</p>
            ) : (
              <table className="auditor-table">
                <thead>
                  <tr>
                    <th>Projekt</th>
                    <th>Ref</th>
                    <th>Kontrolka</th>
                    <th>Framework</th>
                    <th>Owner</th>
                    <th>Status</th>
                    <th>Nast. review</th>
                  </tr>
                </thead>
                <tbody>
                  {controls.map((c) => (
                    <tr key={c.assignment_id} className={c.is_overdue ? 'overdue' : ''}>
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
            <h2>Luki compliance</h2>
            <p className="hint">Kontrolki wymagające uwagi — nieukończone statusy lub przeterminowany harmonogram testów.</p>
            {gaps.length === 0 ? (
              <p className="empty-hint">Brak wykrytych luk — wszystkie kontrolki są na bieżąco.</p>
            ) : (
              <table className="auditor-table">
                <thead>
                  <tr>
                    <th>Projekt</th>
                    <th>Kontrolka</th>
                    <th>Framework</th>
                    <th>Status</th>
                    <th>Powód luki</th>
                    <th>Termin review</th>
                  </tr>
                </thead>
                <tbody>
                  {gaps.map((g) => (
                    <tr key={g.assignment_id} className="gap-row">
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
            <h2>Audit trail (wszystkie projekty)</h2>
            {audit.length === 0 ? (
              <p className="empty-hint">Brak wpisów audit trail.</p>
            ) : (
              <div className="audit-list">
                {audit.map((entry) => (
                  <div key={entry.id} className="audit-row">
                    <div className="audit-meta">
                      <strong>{entry.action}</strong>
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
    </Layout>
  )
}
