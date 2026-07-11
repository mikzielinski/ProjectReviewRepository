import { useEffect, useState } from 'react'
import axios from 'axios'
import Layout from '../components/Layout'
import api from '../services/api'
import './FrameworkOwner.css'

function formatError(err: unknown, context: string): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (err.response?.status === 403) return 'You do not have permission to manage this framework.'
    if (err.response?.status === 404) return 'Framework or control not found.'
    return `Failed: ${context} (${err.response?.status ?? 'network error'}).`
  }
  return `Failed: ${context}.`
}

interface Framework {
  id: string
  code: string
  name: string
  version?: string
  description?: string
  source_url?: string
  is_system: boolean
  control_count: number
}

interface Control {
  id: string
  framework_code?: string
  control_ref: string
  title: string
  description?: string
  domain?: string
  control_type?: string
  testing_frequency_days?: number
  evidence_requirements_json?: string[]
}

interface ControlForm {
  control_ref: string
  title: string
  description: string
  domain: string
  control_type: string
  testing_frequency_days: string
  evidence_requirements: string
}

const EMPTY_FORM: ControlForm = {
  control_ref: '',
  title: '',
  description: '',
  domain: '',
  control_type: 'preventive',
  testing_frequency_days: '365',
  evidence_requirements: '',
}

export default function FrameworkOwner() {
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [selectedCode, setSelectedCode] = useState('')
  const [frameworkDesc, setFrameworkDesc] = useState('')
  const [controls, setControls] = useState<Control[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingFramework, setSavingFramework] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ControlForm>(EMPTY_FORM)
  const [savingControl, setSavingControl] = useState(false)

  const selected = frameworks.find((f) => f.code === selectedCode)

  const loadFrameworks = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/admin/my-frameworks')
      const list: Framework[] = res.data || []
      setFrameworks(list)
      if (list.length && !selectedCode) {
        setSelectedCode(list[0].code)
        setFrameworkDesc(list[0].description || '')
      }
    } catch (err) {
      setError(formatError(err, 'load frameworks'))
    } finally {
      setLoading(false)
    }
  }

  const loadControls = async (code: string) => {
    if (!code) return
    try {
      const res = await api.get('/admin/controls', { params: { framework_code: code, flat: true } })
      setControls(res.data || [])
      setError(null)
    } catch (err) {
      setError(formatError(err, 'load controls'))
    }
  }

  useEffect(() => { loadFrameworks() }, [])
  useEffect(() => {
    if (selectedCode) {
      const fw = frameworks.find((f) => f.code === selectedCode)
      setFrameworkDesc(fw?.description || '')
      loadControls(selectedCode)
    }
  }, [selectedCode, frameworks.length])

  const saveFramework = async () => {
    if (!selectedCode) return
    setSavingFramework(true)
    setError(null)
    try {
      await api.put(`/admin/frameworks/${selectedCode}`, { description: frameworkDesc })
      await loadFrameworks()
    } catch (err) {
      setError(formatError(err, 'save framework'))
    } finally {
      setSavingFramework(false)
    }
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEdit = (ctrl: Control) => {
    setEditingId(ctrl.id)
    setForm({
      control_ref: ctrl.control_ref,
      title: ctrl.title,
      description: ctrl.description || '',
      domain: ctrl.domain || '',
      control_type: ctrl.control_type || 'preventive',
      testing_frequency_days: ctrl.testing_frequency_days?.toString() || '',
      evidence_requirements: (ctrl.evidence_requirements_json || []).join('\n'),
    })
    setShowForm(true)
  }

  const saveControl = async () => {
    if (!selectedCode || !form.control_ref.trim() || !form.title.trim()) return
    setSavingControl(true)
    setError(null)
    const payload = {
      control_ref: form.control_ref.trim(),
      title: form.title.trim(),
      description: form.description || null,
      domain: form.domain || null,
      control_type: form.control_type || null,
      testing_frequency_days: form.testing_frequency_days ? parseInt(form.testing_frequency_days, 10) : null,
      evidence_requirements_json: form.evidence_requirements
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    }
    try {
      if (editingId) {
        await api.put(`/admin/frameworks/${selectedCode}/controls/${editingId}`, payload)
      } else {
        await api.post(`/admin/frameworks/${selectedCode}/controls`, payload)
      }
      setShowForm(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
      await loadControls(selectedCode)
      await loadFrameworks()
    } catch (err) {
      setError(formatError(err, 'save control'))
    } finally {
      setSavingControl(false)
    }
  }

  const deleteControl = async (ctrl: Control) => {
    if (!selectedCode) return
    if (!window.confirm(`Delete control ${ctrl.control_ref} — ${ctrl.title}?`)) return
    setError(null)
    try {
      await api.delete(`/admin/frameworks/${selectedCode}/controls/${ctrl.id}`)
      await loadControls(selectedCode)
      await loadFrameworks()
    } catch (err) {
      setError(formatError(err, 'delete control'))
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="framework-owner-page"><p>Loading…</p></div>
      </Layout>
    )
  }

  if (!frameworks.length) {
    return (
      <Layout>
        <div className="framework-owner-page">
          <header className="fo-header">
            <h1>Framework Owner</h1>
            <p>No frameworks assigned to your account.</p>
          </header>
          {error && <p className="fo-error">{error}</p>}
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="framework-owner-page">
        <header className="fo-header">
          <div>
            <h1>Framework Owner</h1>
            <p>Manage your assigned compliance framework and its controls</p>
          </div>
          <select
            className="fo-select"
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value)}
          >
            {frameworks.map((fw) => (
              <option key={fw.id} value={fw.code}>
                {fw.code} — {fw.name} ({fw.control_count} controls)
              </option>
            ))}
          </select>
        </header>

        {error && <p className="fo-error">{error}</p>}

        {selected && (
          <section className="card fo-section">
            <h2>Framework metadata</h2>
            <div className="fo-meta-grid">
              <div>
                <label>Code</label>
                <code>{selected.code}</code>
              </div>
              <div>
                <label>Name</label>
                <span>{selected.name}</span>
              </div>
              <div>
                <label>Version</label>
                <span>{selected.version || '—'}</span>
              </div>
              <div>
                <label>Type</label>
                <span>{selected.is_system ? 'System (seeded)' : 'Custom'}</span>
              </div>
            </div>
            <label className="fo-label">Description</label>
            <textarea
              className="fo-textarea"
              rows={3}
              value={frameworkDesc}
              onChange={(e) => setFrameworkDesc(e.target.value)}
              placeholder="Framework description…"
            />
            <button className="fo-btn primary" onClick={saveFramework} disabled={savingFramework}>
              {savingFramework ? 'Saving…' : 'Save description'}
            </button>
          </section>
        )}

        <section className="card fo-section">
          <div className="fo-controls-toolbar">
            <h2>Controls ({controls.length})</h2>
            <button className="fo-btn primary" onClick={openCreate}>Add control</button>
          </div>

          {showForm && (
            <div className="fo-form card">
              <h3>{editingId ? 'Edit control' : 'New control'}</h3>
              <div className="fo-form-grid">
                <div>
                  <label>Ref *</label>
                  <input value={form.control_ref} onChange={(e) => setForm({ ...form, control_ref: e.target.value })} />
                </div>
                <div>
                  <label>Title *</label>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div>
                  <label>Domain</label>
                  <input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
                </div>
                <div>
                  <label>Type</label>
                  <select value={form.control_type} onChange={(e) => setForm({ ...form, control_type: e.target.value })}>
                    <option value="preventive">Preventive</option>
                    <option value="detective">Detective</option>
                    <option value="corrective">Corrective</option>
                  </select>
                </div>
                <div>
                  <label>Test frequency (days)</label>
                  <input
                    type="number"
                    value={form.testing_frequency_days}
                    onChange={(e) => setForm({ ...form, testing_frequency_days: e.target.value })}
                  />
                </div>
              </div>
              <label>Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
              <label>Evidence requirements (one per line)</label>
              <textarea
                rows={3}
                value={form.evidence_requirements}
                onChange={(e) => setForm({ ...form, evidence_requirements: e.target.value })}
                placeholder="Policy document&#10;Test evidence"
              />
              <div className="fo-form-actions">
                <button className="fo-btn primary" onClick={saveControl} disabled={savingControl}>
                  {savingControl ? 'Saving…' : editingId ? 'Update' : 'Create'}
                </button>
                <button className="fo-btn" onClick={() => { setShowForm(false); setEditingId(null) }}>Cancel</button>
              </div>
            </div>
          )}

          <table className="fo-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Title</th>
                <th>Domain</th>
                <th>Type</th>
                <th>Frequency</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {controls.length === 0 ? (
                <tr><td colSpan={6} className="fo-empty">No controls yet. Add your first control.</td></tr>
              ) : controls.map((c) => (
                <tr key={c.id}>
                  <td><code>{c.control_ref}</code></td>
                  <td>{c.title}</td>
                  <td>{c.domain || '—'}</td>
                  <td>{c.control_type || '—'}</td>
                  <td>{c.testing_frequency_days ? `${c.testing_frequency_days}d` : '—'}</td>
                  <td className="fo-actions">
                    <button className="fo-btn small" onClick={() => openEdit(c)}>Edit</button>
                    <button className="fo-btn small danger" onClick={() => deleteControl(c)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </Layout>
  )
}
