import { useEffect, useState } from 'react'
import axios from 'axios'
import Layout from '../components/Layout'
import api from '../services/api'
import './Admin.css'

function formatAdminError(err: unknown, context: string): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    const detail = err.response?.data?.detail
    if (status === 404) {
      return 'Admin endpoint not found (404). Backend requires the latest version with the admin router.'
    }
    if (!err.response) {
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        return 'Request timed out — the backend on Render may be waking up. Try again in ~30 s.'
      }
      return `Network error — cannot connect to API (${context}).`
    }
    if (typeof detail === 'string') return detail
    if (status === 401) return 'Session expired — please log in again.'
    if (status === 403) return 'You do not have permission to access the admin panel.'
    return `API error (${status ?? '?'}): ${context}.`
  }
  return `Failed to load: ${context}.`
}

interface ProjectType {
  id: string
  code: string
  name: string
  description?: string
  category: string
  default_compliance_settings_json?: Record<string, boolean>
  default_required_document_types_json?: Array<{ document_type_code: string }>
  default_control_framework_codes_json?: string[]
  is_active: boolean
}

interface Framework {
  id: string
  code: string
  name: string
  version?: string
  description?: string
  owner_email?: string
  is_system: boolean
  control_count: number
}

interface Control {
  id: string
  framework_code?: string
  control_ref: string
  title: string
  domain?: string
  control_type?: string
  testing_frequency_days?: number
  sub_controls?: Control[]
}

interface Permissions {
  is_admin: boolean
  owned_framework_codes: string[]
  can_manage_frameworks: boolean
}

interface FrameworkForm {
  code: string
  name: string
  version: string
  description: string
  owner_email: string
}

const EMPTY_FW_FORM: FrameworkForm = {
  code: '',
  name: '',
  version: '',
  description: '',
  owner_email: '',
}

export default function Admin() {
  const [tab, setTab] = useState<'types' | 'controls' | 'frameworks'>('types')
  const [permissions, setPermissions] = useState<Permissions | null>(null)
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([])
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [controls, setControls] = useState<Control[]>([])
  const [frameworkFilter, setFrameworkFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fwForm, setFwForm] = useState<FrameworkForm>(EMPTY_FW_FORM)
  const [creatingFw, setCreatingFw] = useState(false)
  const [showFwForm, setShowFwForm] = useState(false)

  const isAdmin = permissions?.is_admin ?? false

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [permRes, typesRes, fwRes] = await Promise.all([
        api.get('/admin/permissions'),
        api.get('/admin/project-types'),
        api.get('/admin/frameworks'),
      ])
      setPermissions(permRes.data)
      setProjectTypes(typesRes.data || [])
      setFrameworks(fwRes.data || [])
    } catch (err) {
      setError(formatAdminError(err, 'admin data'))
    } finally {
      setLoading(false)
    }
  }

  const loadControls = async (code?: string) => {
    try {
      const params = code ? { framework_code: code } : {}
      const res = await api.get('/admin/controls', { params })
      setControls(res.data || [])
      setError(null)
    } catch (err) {
      setError(formatAdminError(err, 'controls library'))
    }
  }

  const createFramework = async () => {
    if (!fwForm.code.trim() || !fwForm.name.trim()) return
    setCreatingFw(true)
    setError(null)
    try {
      await api.post('/admin/frameworks', {
        code: fwForm.code.trim(),
        name: fwForm.name.trim(),
        version: fwForm.version || null,
        description: fwForm.description || null,
        owner_email: fwForm.owner_email || null,
      })
      setFwForm(EMPTY_FW_FORM)
      setShowFwForm(false)
      const fwRes = await api.get('/admin/frameworks')
      setFrameworks(fwRes.data || [])
    } catch (err) {
      setError(formatAdminError(err, 'create framework'))
    } finally {
      setCreatingFw(false)
    }
  }

  const deleteFramework = async (fw: Framework) => {
    if (!window.confirm(`Deactivate framework ${fw.code} — ${fw.name}?`)) return
    setError(null)
    try {
      await api.delete(`/admin/frameworks/${fw.code}`)
      const fwRes = await api.get('/admin/frameworks')
      setFrameworks(fwRes.data || [])
    } catch (err) {
      setError(formatAdminError(err, 'delete framework'))
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (tab === 'controls') loadControls(frameworkFilter || undefined)
  }, [tab, frameworkFilter])

  return (
    <Layout>
      <div className="admin-page">
        <header className="admin-header">
          <div>
            <h1>Admin Panel</h1>
            <p>Project types, framework standards, and regulatory controls library</p>
          </div>
        </header>

        <div className="admin-tabs">
          <button className={tab === 'types' ? 'active' : ''} onClick={() => setTab('types')}>
            Project types
          </button>
          {isAdmin && (
            <button className={tab === 'frameworks' ? 'active' : ''} onClick={() => setTab('frameworks')}>
              Framework standards
            </button>
          )}
          <button className={tab === 'controls' ? 'active' : ''} onClick={() => setTab('controls')}>
            Controls library
          </button>
        </div>

        {loading ? (
          <p>Loading…</p>
        ) : error ? (
          <p className="admin-error">{error}</p>
        ) : tab === 'types' ? (
          <section className="card admin-section">
            <h2>Project types</h2>
            <p className="hint">
              Development (SDLC) vs compliance/security projects — each type defines required documents, templates, and control frameworks.
            </p>
            {projectTypes.length === 0 ? (
              <p className="hint">No project types defined.</p>
            ) : (
            <div className="type-grid">
              {projectTypes.map((t) => (
                <article key={t.id} className={`type-card ${t.category.toLowerCase()}`}>
                  <div className="type-card-head">
                    <span className={`badge ${t.category === 'COMPLIANCE' ? 'compliance' : 'dev'}`}>
                      {t.category === 'COMPLIANCE' ? 'Compliance' : 'Development'}
                    </span>
                    <code>{t.code}</code>
                  </div>
                  <h3>{t.name}</h3>
                  {t.description && <p>{t.description}</p>}
                  {t.default_control_framework_codes_json?.length ? (
                    <div className="tags">
                      {t.default_control_framework_codes_json.map((fw) => (
                        <span key={fw} className="tag">{fw}</span>
                      ))}
                    </div>
                  ) : null}
                  {t.default_required_document_types_json?.length ? (
                    <p className="meta">
                      Documents: {t.default_required_document_types_json.map((d) => d.document_type_code).join(', ')}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
            )}
          </section>
        ) : tab === 'frameworks' ? (
          <section className="card admin-section">
            <div className="controls-toolbar">
              <h2>Framework standards</h2>
              <button className="admin-btn primary" onClick={() => setShowFwForm(!showFwForm)}>
                {showFwForm ? 'Cancel' : 'Add framework'}
              </button>
            </div>
            <p className="hint">
              Create new compliance standards (ISO, SOC, custom). Assign an owner email to delegate control management.
            </p>

            {showFwForm && (
              <div className="admin-form card">
                <h3>New framework standard</h3>
                <div className="admin-form-grid">
                  <div>
                    <label>Code *</label>
                    <input
                      placeholder="e.g. ISO27017"
                      value={fwForm.code}
                      onChange={(e) => setFwForm({ ...fwForm, code: e.target.value })}
                    />
                  </div>
                  <div>
                    <label>Name *</label>
                    <input
                      placeholder="e.g. ISO/IEC 27017"
                      value={fwForm.name}
                      onChange={(e) => setFwForm({ ...fwForm, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label>Version</label>
                    <input
                      placeholder="e.g. 2015"
                      value={fwForm.version}
                      onChange={(e) => setFwForm({ ...fwForm, version: e.target.value })}
                    />
                  </div>
                  <div>
                    <label>Owner email</label>
                    <input
                      placeholder="framework.owner@company.com"
                      value={fwForm.owner_email}
                      onChange={(e) => setFwForm({ ...fwForm, owner_email: e.target.value })}
                    />
                  </div>
                </div>
                <label>Description</label>
                <textarea
                  rows={2}
                  value={fwForm.description}
                  onChange={(e) => setFwForm({ ...fwForm, description: e.target.value })}
                />
                <button className="admin-btn primary" onClick={createFramework} disabled={creatingFw}>
                  {creatingFw ? 'Creating…' : 'Create framework'}
                </button>
              </div>
            )}

            <table className="controls-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Version</th>
                  <th>Owner</th>
                  <th>Type</th>
                  <th>Controls</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {frameworks.length === 0 ? (
                  <tr><td colSpan={7} className="empty-cell">No frameworks defined.</td></tr>
                ) : frameworks.map((fw) => (
                  <tr key={fw.id}>
                    <td><code>{fw.code}</code></td>
                    <td>{fw.name}</td>
                    <td>{fw.version || '—'}</td>
                    <td>{fw.owner_email || '—'}</td>
                    <td>{fw.is_system ? 'System' : 'Custom'}</td>
                    <td>{fw.control_count}</td>
                    <td>
                      {!fw.is_system && (
                        <button className="admin-btn small danger" onClick={() => deleteFramework(fw)}>
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : (
          <section className="card admin-section">
            <div className="controls-toolbar">
              <h2>Controls library</h2>
              <select value={frameworkFilter} onChange={(e) => setFrameworkFilter(e.target.value)}>
                <option value="">All frameworks</option>
                {frameworks.map((fw) => (
                  <option key={fw.id} value={fw.code}>{fw.code} — {fw.name} ({fw.control_count})</option>
                ))}
              </select>
            </div>
            <div className="framework-summary">
              {frameworks.map((fw) => (
                <div key={fw.id} className="fw-chip" onClick={() => setFrameworkFilter(fw.code)}>
                  <strong>{fw.code}</strong>
                  <span>{fw.control_count} controls</span>
                </div>
              ))}
            </div>
            <table className="controls-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Title</th>
                  <th>Framework</th>
                  <th>Domain</th>
                  <th>Type</th>
                  <th>Test frequency</th>
                </tr>
              </thead>
              <tbody>
                {controls.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty-cell">No controls for the selected filter.</td>
                  </tr>
                ) : controls.flatMap((c) => {
                  const rows: JSX.Element[] = []
                  const walk = (ctrl: Control, depth: number) => {
                    rows.push(
                      <tr key={ctrl.id}>
                        <td style={{ paddingLeft: `${depth * 1.25}rem` }}><code>{ctrl.control_ref}</code></td>
                        <td>{ctrl.title}</td>
                        <td>{ctrl.framework_code}</td>
                        <td>{ctrl.domain || '—'}</td>
                        <td>{ctrl.control_type || '—'}</td>
                        <td>{ctrl.testing_frequency_days ? `${ctrl.testing_frequency_days}d` : '—'}</td>
                      </tr>
                    )
                    ;(ctrl.sub_controls || []).forEach((sub) => walk(sub, depth + 1))
                  }
                  walk(c, 0)
                  return rows
                })}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </Layout>
  )
}
