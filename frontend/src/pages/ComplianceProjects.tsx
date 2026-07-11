import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import api from '../services/api'
import './ComplianceProjects.css'

interface Project {
  id: string
  key: string
  name: string
  description?: string
  project_type: string
  project_category?: string
  compliance_settings_json?: Record<string, boolean>
  status: string
}

const COMPLIANCE_LABELS: Record<string, string> = {
  hipaa: 'HIPAA',
  sox: 'SOX',
  gxp: 'GxP',
  gisc: 'GIS',
  iso27001: 'ISO 27001',
  soc2: 'SOC 2',
  iso42001: 'ISO 42001',
  knf: 'KNF / DORA',
  eu_ai_act: 'EU AI Act',
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  ARCHIVED: 'Archived',
}

type ComplianceSubTab = 'controls' | 'schedule' | 'audit'

function getStandards(p: Project): string[] {
  const s = p.compliance_settings_json || {}
  return Object.entries(s)
    .filter(([, v]) => v)
    .map(([k]) => COMPLIANCE_LABELS[k] || k.toUpperCase())
}

function getStandardKeys(p: Project): string[] {
  const s = p.compliance_settings_json || {}
  return Object.entries(s).filter(([, v]) => v).map(([k]) => k)
}

export default function ComplianceProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [standardFilter, setStandardFilter] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/projects/my-projects', { params: { category: 'COMPLIANCE' } })
      .then((res) => setProjects(res.data || []))
      .finally(() => setLoading(false))
  }, [])

  const availableFilters = useMemo(() => {
    const keys = new Set<string>()
    projects.forEach((p) => getStandardKeys(p).forEach((k) => keys.add(k)))
    return Array.from(keys).sort()
  }, [projects])

  const filteredProjects = useMemo(() => {
    if (!standardFilter) return projects
    return projects.filter((p) => getStandardKeys(p).includes(standardFilter))
  }, [projects, standardFilter])

  const stats = useMemo(() => {
    const active = projects.filter((p) => p.status === 'ACTIVE').length
    const standards = new Set<string>()
    projects.forEach((p) => getStandardKeys(p).forEach((k) => standards.add(k)))
    return { total: projects.length, active, standards: standards.size }
  }, [projects])

  const openProject = (projectId: string, subTab?: ComplianceSubTab) => {
    const params = new URLSearchParams({ tab: 'compliance' })
    if (subTab) params.set('subtab', subTab)
    navigate(`/projects/${projectId}?${params.toString()}`)
  }

  return (
    <Layout>
      <div className="compliance-projects-page">
        <header className="cp-header">
          <div>
            <h1>Compliance & Security Projects</h1>
            <p className="cp-subtitle">
              ISO, SOC 2, SOX, HIPAA, GxP, AI Act, KNF/DORA — controls, audit, and test schedule in one place.
            </p>
          </div>
          <button type="button" className="cp-btn-auditor" onClick={() => navigate('/auditor')}>
            Auditor portal
          </button>
        </header>

        {!loading && projects.length > 0 && (
          <section className="cp-kpi-grid" aria-label="Portfolio statistics">
            <div className="cp-kpi-card">
              <span className="cp-kpi-value">{stats.total}</span>
              <span className="cp-kpi-label">Projects</span>
            </div>
            <div className="cp-kpi-card">
              <span className="cp-kpi-value">{stats.active}</span>
              <span className="cp-kpi-label">Active</span>
            </div>
            <div className="cp-kpi-card accent">
              <span className="cp-kpi-value">{stats.standards}</span>
              <span className="cp-kpi-label">Standards in portfolio</span>
            </div>
          </section>
        )}

        {!loading && availableFilters.length > 0 && (
          <section className="cp-filters" aria-label="Standard filter">
            <span className="cp-filters-label">Filter:</span>
            <button
              type="button"
              className={`cp-filter-chip ${standardFilter === null ? 'active' : ''}`}
              onClick={() => setStandardFilter(null)}
            >
              All
            </button>
            {availableFilters.map((key) => (
              <button
                key={key}
                type="button"
                className={`cp-filter-chip ${standardFilter === key ? 'active' : ''}`}
                onClick={() => setStandardFilter(standardFilter === key ? null : key)}
              >
                {COMPLIANCE_LABELS[key] || key.toUpperCase()}
              </button>
            ))}
          </section>
        )}

        {loading ? (
          <div className="cp-loading">Loading compliance projects…</div>
        ) : projects.length === 0 ? (
          <div className="cp-empty card">
            <p>No compliance projects yet. Create a project with the COMPLIANCE category or use an ISMS / SOC2 / SOX type in the admin panel.</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="cp-empty card">
            <p>No projects match the selected filter.</p>
            <button type="button" className="cp-filter-reset" onClick={() => setStandardFilter(null)}>
              Clear filter
            </button>
          </div>
        ) : (
          <div className="cp-project-grid">
            {filteredProjects.map((p) => {
              const standards = getStandards(p)
              return (
                <article
                  key={p.id}
                  className="cp-card"
                  onClick={() => openProject(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openProject(p.id)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="cp-card-top">
                    <code className="cp-key">{p.key}</code>
                    <span className={`cp-status cp-status-${p.status.toLowerCase()}`}>
                      {STATUS_LABELS[p.status] || p.status}
                    </span>
                  </div>

                  <h3 className="cp-title">{p.name}</h3>
                  {p.description && <p className="cp-desc">{p.description}</p>}

                  {standards.length > 0 && (
                    <div className="cp-standards">
                      {standards.map((st) => (
                        <span key={st} className="cp-std-tag">{st}</span>
                      ))}
                    </div>
                  )}

                  <div className="cp-actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="cp-action-btn" onClick={() => openProject(p.id, 'controls')}>
                      Controls
                    </button>
                    <button type="button" className="cp-action-btn" onClick={() => openProject(p.id, 'audit')}>
                      Audit trail
                    </button>
                    <button type="button" className="cp-action-btn primary" onClick={() => openProject(p.id, 'schedule')}>
                      Schedule
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
