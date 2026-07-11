import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import api from '../services/api'
import './ItDashboard.css'

interface ItProjectSummary {
  project_id: string
  key: string
  name: string
  project_type: string
  status: string
  compliance_standards: string[]
  documents_total: number
  documents_approved: number
  documents_in_review: number
  documents_draft: number
  open_tasks: number
  overdue_tasks: number
  required_docs_missing: number
  governance_score: number
  tech_stack: string[]
}

interface ItPortfolioDashboard {
  total_projects: number
  active_projects: number
  open_tasks: number
  documents_in_review: number
  compliance_gaps: number
  projects: ItProjectSummary[]
}

const PROJECT_TYPE_LABELS: Record<string, string> = {
  IT: 'IT',
  RPA: 'RPA / Automation',
  INFRA: 'Infrastructure',
  DATA: 'Data / Analytics',
  SECURITY: 'Security',
  INTEGRATION: 'Integration',
}

export default function ItDashboard() {
  const [data, setData] = useState<ItPortfolioDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/dashboard/it-portfolio')
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.detail || 'Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Layout><div className="it-dash-loading">Loading IT portfolio…</div></Layout>
  if (error) return <Layout><div className="it-dash-error">{error}</div></Layout>
  if (!data) return <Layout><div>No data</div></Layout>

  return (
    <Layout>
      <div className="it-dashboard">
        <header className="it-dash-header">
          <div>
            <h1>IT Project Portfolio</h1>
            <p className="it-dash-sub">Governance, SDLC documentation, and regulatory compliance in one view.</p>
          </div>
          <button className="btn-primary" onClick={() => navigate('/projects')}>+ New IT project</button>
        </header>

        <section className="kpi-grid">
          <div className="kpi-card"><span className="kpi-value">{data.total_projects}</span><span className="kpi-label">Projects</span></div>
          <div className="kpi-card"><span className="kpi-value">{data.active_projects}</span><span className="kpi-label">Active</span></div>
          <div className="kpi-card"><span className="kpi-value">{data.open_tasks}</span><span className="kpi-label">Open tasks</span></div>
          <div className="kpi-card"><span className="kpi-value">{data.documents_in_review}</span><span className="kpi-label">Docs in review</span></div>
          <div className="kpi-card warn"><span className="kpi-value">{data.compliance_gaps}</span><span className="kpi-label">Documentation gaps</span></div>
        </section>

        <section className="it-projects-table card">
          <h2>IT Projects</h2>
          {data.projects.length === 0 ? (
            <p className="empty">No projects yet. Create your first IT project from the setup wizard.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Type</th>
                  <th>Score</th>
                  <th>Documents</th>
                  <th>Tasks</th>
                  <th>Compliance</th>
                  <th>Stack</th>
                </tr>
              </thead>
              <tbody>
                {data.projects.map((p) => (
                  <tr key={p.project_id} className="clickable" onClick={() => navigate(`/projects/${p.project_id}`)}>
                    <td>
                      <strong>{p.key}</strong>
                      <div className="sub">{p.name}</div>
                    </td>
                    <td><span className="type-badge">{PROJECT_TYPE_LABELS[p.project_type] || p.project_type}</span></td>
                    <td>
                      <span className={`score ${p.governance_score >= 70 ? 'good' : p.governance_score >= 40 ? 'mid' : 'low'}`}>
                        {p.governance_score}%
                      </span>
                    </td>
                    <td>
                      {p.documents_approved}/{p.documents_total} OK
                      {p.documents_in_review > 0 && <span className="pill review">{p.documents_in_review} review</span>}
                      {p.required_docs_missing > 0 && <span className="pill gap">-{p.required_docs_missing} missing</span>}
                    </td>
                    <td>
                      {p.open_tasks} open
                      {p.overdue_tasks > 0 && <span className="pill overdue">{p.overdue_tasks} overdue</span>}
                    </td>
                    <td>
                      <div className="compliance-tags">
                        {p.compliance_standards.map((s) => <span key={s} className="compliance-tag">{s}</span>)}
                      </div>
                    </td>
                    <td className="stack">{p.tech_stack.slice(0, 3).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </Layout>
  )
}
