import { useEffect, useState } from 'react'
import api from '../services/api'
import './Tabs.css'
import './ProjectDocumentsTree.css'
import './TemplateInfoModal.css'
// import AuditLogModal from './AuditLogModal' // Not used currently
// @ts-ignore - react-doc-viewer may not have types
import DocViewer, { DocViewerRenderers } from '@cyntler/react-doc-viewer'

interface Document {
  id: string
  doc_type: string
  title: string
  current_version_id: string | null
  current_version_state: string | null  // DRAFT, IN_REVIEW, APPROVED, RELEASED, ARCHIVED
  created_at: string
}

interface DocumentVersion {
  id: string
  version_string: string
  state: string
  content_json: any
  template_id: string | null
  template?: {
    id: string
    doc_type: string
    name: string
    version?: string
    object_key: string
    file_hash: string
  }
  file_object_key: string | null
  file_hash: string | null
  created_at: string
  submitted_at: string | null
}

interface Template {
  id: string
  name: string
  doc_type: string
  version: string
  status: string
}

interface DocumentsTabProps {
  projectId: string
  projectName?: string
}

// Component for viewing Office documents with blob URL
const OfficeDocumentViewer = ({ 
  fileUrl, 
  fileFormat, 
  editingVersion, 
  setEditingVersion 
}: { 
  fileUrl: string
  fileFormat: string
  editingVersion: DocumentVersion
  setEditingVersion: (v: DocumentVersion) => void
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadFile = async () => {
      try {
        setLoading(true)
        setError(null)
        // Build full URL using backend base URL, not frontend origin
        // fileUrl is already relative (e.g., "/api/v1/templates/.../file")
        // We need to use the backend URL (localhost:8000) not frontend (localhost:5173)
        const backendBaseUrl = api.defaults.baseURL || 'http://localhost:8000/api/v1'
        const backendOrigin = backendBaseUrl.replace('/api/v1', '') // Remove /api/v1 to get base URL
        const fullUrl = fileUrl.startsWith('http') ? fileUrl : `${backendOrigin}${fileUrl}`
        console.log('Loading file from URL:', fullUrl)
        console.log('Backend origin:', backendOrigin)
        console.log('File URL (relative):', fileUrl)
        
        // Use axios with responseType: 'blob' as recommended by react-doc-viewer docs
        const response = await api.get(fullUrl, {
          responseType: 'blob',
          headers: {
            'Accept': '*/*'
          }
        })
        
        console.log('File response status:', response.status)
        console.log('File response headers:', response.headers)
        console.log('File response data type:', typeof response.data)
        console.log('File response data size:', response.data?.size || 'unknown')
        
        if (!response.data || response.data.size === 0) {
          throw new Error('File is empty or could not be loaded')
        }
        
        // Create blob URL from response data (axios already handles blob conversion)
        const blob = response.data instanceof Blob 
          ? response.data 
          : new Blob([response.data], { 
              type: response.headers['content-type'] || 'application/octet-stream' 
            })
        
        console.log('Blob size:', blob.size, 'bytes')
        console.log('Blob type:', blob.type)
        
        const url = URL.createObjectURL(blob)
        setBlobUrl(url)
        console.log('File loaded successfully, blob URL created:', url)
      } catch (err: any) {
        console.error('Error loading file:', err)
        const errorMessage = err.response?.data 
          ? (err.response.data instanceof Blob 
              ? `Failed to load file: ${err.response.status} ${err.response.statusText}`
              : err.response.data.message || err.response.data.detail || JSON.stringify(err.response.data))
          : err.message || 'Failed to load document'
        setError(errorMessage)
      } finally {
        setLoading(false)
      }
    }

    loadFile()

    // Cleanup blob URL on unmount
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
      }
    }
  }, [fileUrl])

  if (loading) {
    return <div className="loading">Loading document...</div>
  }

  if (error) {
    return (
      <div style={{ padding: '1rem', background: '#fee', border: '1px solid #fcc', borderRadius: '4px' }}>
        <strong>Error loading document:</strong> {error}
        <div style={{ marginTop: '8px' }}>
          <a
            href={fileUrl.startsWith('http') ? fileUrl : `${window.location.origin}${fileUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#3498db' }}
          >
            Try downloading the file directly
          </a>
        </div>
      </div>
    )
  }

  if (!blobUrl) {
    return <div className="loading">Preparing document...</div>
  }

  // Map file format to correct fileType for react-doc-viewer
  // react-doc-viewer expects fileType without dot (e.g., 'docx' not '.docx')
  const normalizedFileType = fileFormat.toLowerCase().replace(/^\./, '')
  
  const docs = [{
    uri: blobUrl,
    fileType: normalizedFileType,
  }]
  
  console.log('DocViewer documents config:', docs)

  return (
    <div>
      <div style={{ 
        border: '1px solid #ddd', 
        borderRadius: '4px',
        height: '600px',
        overflow: 'auto',
        background: '#fff'
      }}>
        <DocViewer
          documents={docs}
          pluginRenderers={DocViewerRenderers}
          style={{ height: '100%', width: '100%' }}
          config={{
            header: {
              disableHeader: false,
              disableFileName: false,
              retainURLParams: false
            }
          }}
        />
      </div>
      <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
        Viewing {fileFormat.toUpperCase()} document. To edit content structure, use the JSON editor below.
      </div>
      <details style={{ marginTop: '8px' }}>
        <summary style={{ cursor: 'pointer', color: '#3498db' }}>Show JSON Editor</summary>
        <textarea
          value={JSON.stringify(editingVersion.content_json || {}, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value)
              setEditingVersion({ ...editingVersion, content_json: parsed })
            } catch {
              setEditingVersion({ ...editingVersion, content_json: e.target.value as any })
            }
          }}
          className="form-control"
          rows={10}
          style={{ fontFamily: 'monospace', fontSize: '12px', marginTop: '8px' }}
          disabled={editingVersion.state !== 'DRAFT'}
        />
      </details>
    </div>
  )
}

// Component for displaying document information panel (similar to TemplateInfoModal but as a panel)
const DocumentInfoPanel = ({ 
  document, 
  currentVersion, 
  versions 
}: { 
  document: any
  currentVersion: DocumentVersion | null
  versions: DocumentVersion[]
}) => {
  const handleDownloadDocx = async () => {
    if (!currentVersion?.id) {
      alert('No version available for download')
      return
    }
    
    try {
      const endpoint = `/versions/${currentVersion.id}/download`
      const token = localStorage.getItem('token')
      const headers: any = {
        'Accept': '*/*'
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      
      const response = await api.get(endpoint, {
        responseType: 'blob',
        headers
      })
      
      // Create blob URL and trigger download
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      })
      const url = window.URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.setAttribute('download', `${document.title || 'document'}.docx`)
      window.document.body.appendChild(link)
      link.click()
      window.document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('Error downloading DOCX:', err)
      alert(err.response?.data?.detail || 'Failed to download document')
    }
  }

  const handleDownloadPdf = async () => {
    // TODO: Implement PDF download when endpoint is available
    alert('PDF download will be available soon')
  }

  // Build creator info
  let createdByInfo: { id: string; name: string; email: string } | null = null
  if (document.created_by) {
    if (typeof document.created_by === 'object' && document.created_by.id) {
      createdByInfo = {
        id: document.created_by.id,
        name: document.created_by.name || 'Unknown',
        email: document.created_by.email || ''
      }
    } else {
      createdByInfo = {
        id: typeof document.created_by === 'string' ? document.created_by : String(document.created_by),
        name: 'Unknown',
        email: ''
      }
    }
  }

  return (
    <div>
      {/* Basic Information */}
      <section className="info-section">
        <h4>Basic Information</h4>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Title:</span>
            <span className="info-value">{document.title}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Type:</span>
            <span className="info-value">{document.doc_type}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Version:</span>
            <span className="info-value">{currentVersion?.version_string || 'N/A'}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Status:</span>
            <span className={`info-badge info-status-${(document.current_version_state || 'draft').toLowerCase()}`}>
              {document.current_version_state || 'DRAFT'}
            </span>
          </div>
        </div>
      </section>

      {/* Creator Information */}
      <section className="info-section">
        <h4>Creator Information</h4>
        {createdByInfo ? (
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Created by:</span>
              <span className="info-value">{createdByInfo.name}</span>
            </div>
            {createdByInfo.email && (
              <div className="info-item">
                <span className="info-label">Email:</span>
                <span className="info-value">{createdByInfo.email}</span>
              </div>
            )}
            <div className="info-item">
              <span className="info-label">Created at:</span>
              <span className="info-value">
                {document.created_at ? new Date(document.created_at).toLocaleString() : 'N/A'}
              </span>
            </div>
          </div>
        ) : (
          <div className="info-value">No creator information available</div>
        )}
      </section>

      {/* Template Information */}
      {currentVersion?.template && (
        <section className="info-section">
          <h4>Template Information</h4>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Template:</span>
              <span className="info-value">{currentVersion.template.name}</span>
            </div>
            {currentVersion.template.version && (
              <div className="info-item">
                <span className="info-label">Template Version:</span>
                <span className="info-value">{currentVersion.template.version}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Version Information */}
      <section className="info-section">
        <h4>Version Information</h4>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Total Versions:</span>
            <span className="info-value">{versions.length}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Current Version:</span>
            <span className="info-value">{currentVersion?.version_string || 'N/A'}</span>
          </div>
        </div>
      </section>

      {/* File Downloads */}
      <section className="info-section">
        <h4>File Downloads</h4>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            className="info-audit-btn"
            onClick={handleDownloadDocx}
            disabled={!currentVersion?.id}
            style={{ background: currentVersion?.id ? '#1976d2' : '#ccc', cursor: currentVersion?.id ? 'pointer' : 'not-allowed' }}
          >
            📄 Download DOCX
          </button>
          <button
            className="info-audit-btn"
            onClick={handleDownloadPdf}
            style={{ background: '#666' }}
          >
            📄 Download PDF
          </button>
        </div>
      </section>

      {/* File Integrity */}
      {currentVersion?.file_hash && (
        <section className="info-section">
          <h4>File Integrity</h4>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">File Hash (SHA-256):</span>
              <span className="info-value info-hash">{currentVersion.file_hash}</span>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

const DocumentsTab = ({ projectId, projectName }: DocumentsTabProps) => {
  const [documents, setDocuments] = useState<Document[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({ doc_type: 'SDD', title: '', template_id: '' })
  const [creating, setCreating] = useState(false)
  const [viewingDocument, setViewingDocument] = useState<Document | null>(null)
  const [editingDocument, setEditingDocument] = useState<Document | null>(null)
  const [editingVersion, setEditingVersion] = useState<DocumentVersion | null>(null)
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['project-root', 'documents-folder']))
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [showAuditLog, setShowAuditLog] = useState(false)
  const [selectedDocumentInfo, setSelectedDocumentInfo] = useState<any>(null)
  const [selectedDocumentVersions, setSelectedDocumentVersions] = useState<DocumentVersion[]>([])
  const [loadingDocumentInfo, setLoadingDocumentInfo] = useState(false)

  useEffect(() => {
    loadDocuments()
    loadTemplates()
  }, [projectId])

  const loadDocuments = () => {
    api
      .get(`/projects/${projectId}/documents`)
      .then((res) => setDocuments(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  const loadTemplates = () => {
    api
      .get('/templates')
      .then((res) => setTemplates(res.data || []))
      .catch(console.error)
  }

  // Filter templates by selected doc_type
  const filteredTemplates = templates.filter(t => t.doc_type === formData.doc_type && t.status === 'APPROVED')

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      // Create document (backend automatically creates version 1.0)
      const docResponse = await api.post(`/projects/${projectId}/documents`, {
        project_id: projectId,
        doc_type: formData.doc_type,
        title: formData.title,
      })
      
      const documentId = docResponse.data.id

      // If template is selected, update the automatically created version with template
      if (formData.template_id) {
        try {
          // Get the automatically created version (should be 1.0)
          const versionsRes = await api.get(`/documents/${documentId}/versions`)
          if (versionsRes.data && versionsRes.data.length > 0) {
            const versionId = versionsRes.data[0].id
            await api.put(`/versions/${versionId}`, {
              template_id: formData.template_id,
              content_json: {}
            })
          }
        } catch (versionErr: any) {
          console.error('Failed to update version with template:', versionErr)
          alert('Document created, but failed to assign template. You can assign it manually later.')
        }
      }

      setShowCreateForm(false)
      setFormData({ doc_type: 'SDD', title: '', template_id: '' })
      loadDocuments()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create document')
    } finally {
      setCreating(false)
    }
  }

  const handleViewDocument = async (doc: Document) => {
    setSelectedDocumentId(doc.id)
    setViewingDocument(doc)
    setLoadingVersions(true)
    try {
      const versionsRes = await api.get(`/documents/${doc.id}/versions`)
      const versionsData = versionsRes.data || []
      console.log('Loaded versions:', versionsData)
      setVersions(versionsData)
      if (versionsData.length > 0) {
        // Load the current version or latest
        const currentVersion = doc.current_version_id 
          ? versionsData.find((v: DocumentVersion) => v.id === doc.current_version_id)
          : versionsData[0]
        if (currentVersion) {
          const versionRes = await api.get(`/versions/${currentVersion.id}`)
          console.log('Loaded version details:', versionRes.data)
          console.log('Version template info:', versionRes.data.template)
          console.log('Version file_object_key:', versionRes.data.file_object_key)
          setEditingVersion(versionRes.data)
        }
      }
    } catch (err: any) {
      console.error('Failed to load versions:', err)
      setVersions([])
    } finally {
      setLoadingVersions(false)
    }
  }

  // const handleEditDocument = (doc: Document) => {
  //   setEditingDocument(doc)
  //   setViewingDocument(null)
  // }

  const handleUpdateDocument = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingDocument) return
    
    setSaving(true)
    try {
      await api.put(`/documents/${editingDocument.id}`, {
        title: editingDocument.title,
        doc_type: editingDocument.doc_type
      })
      setEditingDocument(null)
      loadDocuments()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update document')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateVersion = async () => {
    if (!editingVersion || !viewingDocument) return
    
    setSaving(true)
    try {
      await api.put(`/versions/${editingVersion.id}`, {
        content_json: editingVersion.content_json
      })
      alert('Document version saved successfully!')
      // Reload versions
      const versionsRes = await api.get(`/documents/${viewingDocument.id}/versions`)
      setVersions(versionsRes.data || [])
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save version')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateVersion = async () => {
    if (!viewingDocument) return
    
    setSaving(true)
    try {
      const newVersionNum = versions.length + 1
      await api.post(`/documents/${viewingDocument.id}/versions`, {
        version_string: `v${newVersionNum}`,
        template_id: null,
        content_json: editingVersion?.content_json || {}
      })
      await handleViewDocument(viewingDocument)
      alert('New version created successfully!')
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create version')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitVersion = async () => {
    if (!editingVersion) return
    
    if (!confirm('Submit this version for review? It will be locked for editing.')) return
    
    setSaving(true)
    try {
      await api.post(`/versions/${editingVersion.id}/submit`)
      await handleViewDocument(viewingDocument!)
      alert('Version submitted for review!')
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to submit version')
    } finally {
      setSaving(false)
    }
  }

  // Get file format from template or document type
  const getFileFormat = (version: DocumentVersion | null): string | null => {
    if (!version) {
      console.log('getFileFormat: version is null')
      return null
    }
    
    console.log('getFileFormat: checking version', {
      file_object_key: version.file_object_key,
      template: version.template,
      doc_type: viewingDocument?.doc_type
    })
    
    // Check if version has a rendered file
    if (version.file_object_key) {
      const ext = version.file_object_key.split('.').pop()?.toLowerCase()
      console.log('getFileFormat: found file_object_key, extension:', ext)
      return ext || null
    }
    
    // Check template object_key
    if (version.template?.object_key) {
      const ext = version.template.object_key.split('.').pop()?.toLowerCase()
      console.log('getFileFormat: found template object_key, extension:', ext)
      return ext || null
    }
    
    // Fallback to doc_type mapping
    const docTypeMap: Record<string, string> = {
      'PDD': 'docx',
      'SDD': 'docx',
      'TSS': 'docx',
      'TEST_PLAN': 'docx',
      'RELEASE_NOTES': 'docx',
    }
    
    const fallbackFormat = docTypeMap[viewingDocument?.doc_type || ''] || null
    console.log('getFileFormat: using fallback format:', fallbackFormat)
    return fallbackFormat
  }

  // Get file URL for viewing
  const getFileUrl = (version: DocumentVersion | null): string | null => {
    if (!version) {
      console.log('getFileUrl: version is null')
      return null
    }
    
    console.log('getFileUrl: checking version', {
      file_object_key: version.file_object_key,
      template_id: version.template?.id,
      version_id: version.id
    })
    
    // If version has a rendered file, return its URL
    if (version.file_object_key) {
      const url = `/api/v1/documents/versions/${version.id}/download`
      console.log('getFileUrl: using rendered file URL:', url)
      return url
    }
    
    // If template exists, return template file URL
    if (version.template?.id) {
      const url = `/api/v1/templates/${version.template.id}/file`
      console.log('getFileUrl: using template file URL:', url)
      return url
    }
    
    console.log('getFileUrl: no file URL found')
    return null
  }

  // Group documents by state
  const groupDocumentsByState = () => {
    const groups: Record<string, Document[]> = {
      'DRAFT': [],
      'IN_REVIEW': [],
      'APPROVED': [],
      'ARCHIVED': []
    }
    
    documents.forEach(doc => {
      const state = doc.current_version_state || 'DRAFT'
      if (groups[state]) {
        groups[state].push(doc)
      } else {
        groups['DRAFT'].push(doc)
      }
    })
    
    return groups
  }

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId)
    } else {
      newExpanded.add(folderId)
    }
    setExpandedFolders(newExpanded)
  }

  const documentGroups = groupDocumentsByState()

  if (loading) {
    return <div className="loading">Loading documents...</div>
  }

  const selectedDocumentForAudit = showAuditLog && selectedDocumentId 
    ? documents.find(d => d.id === selectedDocumentId) 
    : null

  return (
    <>
    <div className="tab-panel">
      <div className="panel-header">
        <h2>Documents</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          + New Document
        </button>
      </div>

      {showCreateForm && (
        <div className="create-form">
          <h3>Create New Document</h3>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>Document Type</label>
              <select
                value={formData.doc_type}
                onChange={(e) => setFormData({ ...formData, doc_type: e.target.value, template_id: '' })}
                required
              >
                <option value="PDD">PDD</option>
                <option value="SDD">SDD</option>
                <option value="TSS">TSS</option>
                <option value="TEST_PLAN">Test Plan</option>
                <option value="RELEASE_NOTES">Release Notes</option>
              </select>
            </div>
            <div className="form-group">
              <label>Template (Optional)</label>
              <select
                value={formData.template_id}
                onChange={(e) => setFormData({ ...formData, template_id: e.target.value })}
              >
                <option value="">No template - create blank document</option>
                {filteredTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} (v{template.version})
                  </option>
                ))}
              </select>
              {formData.doc_type && filteredTemplates.length === 0 && (
                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  No approved templates available for {formData.doc_type}. Document will be created blank.
                </div>
              )}
            </div>
            <div className="form-group">
              <label>Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                placeholder="Document Title"
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="project-documents-tree">
        <div className="documents-tree-sidebar">
          <div className="documents-tree-header">
            {projectName || 'Project'} Documents
          </div>
          <div className="documents-tree-content">
            {documents.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#999', fontSize: '0.9rem' }}>
                No documents yet. Create your first document!
              </div>
            ) : (
              <>
                {/* Project Root */}
                <div 
                  className="documents-tree-item folder"
                  onClick={() => toggleFolder('project-root')}
                >
                  <span className="documents-tree-toggle">
                    {expandedFolders.has('project-root') ? (
                      <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                  <span className="documents-tree-item-icon">📁</span>
                  <span className="documents-tree-item-name">{projectName || 'Project'}</span>
                </div>

                {expandedFolders.has('project-root') && (
                  <>
                    {/* Documents Folder */}
                    <div 
                      className="documents-tree-item folder"
                      style={{ paddingLeft: '1.5rem' }}
                      onClick={() => toggleFolder('documents-folder')}
                    >
                      <span className="documents-tree-toggle">
                        {expandedFolders.has('documents-folder') ? (
                          <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : (
                          <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </span>
                      <span className="documents-tree-item-icon">📂</span>
                      <span className="documents-tree-item-name">Documents</span>
                    </div>

                    {expandedFolders.has('documents-folder') && (
                      <>
                        {/* Draft Folder */}
                        <div 
                          className="documents-tree-item folder"
                          style={{ paddingLeft: '3rem' }}
                          onClick={() => toggleFolder('draft-folder')}
                        >
                          <span className="documents-tree-toggle">
                            {expandedFolders.has('draft-folder') ? (
                              <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            ) : (
                              <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                          <span className="documents-tree-item-icon">📄</span>
                          <span className="documents-tree-item-name">Draft</span>
                          <span className="documents-tree-item-badge">{documentGroups['DRAFT'].length}</span>
                        </div>
                        {expandedFolders.has('draft-folder') && documentGroups['DRAFT'].map((doc) => (
                          <div
                            key={doc.id}
                            className={`documents-tree-item document ${selectedDocumentId === doc.id ? 'selected' : ''}`}
                            style={{ paddingLeft: '4.5rem', cursor: 'pointer' }}
                            onClick={async () => {
                              setSelectedDocumentId(doc.id)
                              setLoadingDocumentInfo(true)
                              try {
                                const [docResponse, versionsResponse] = await Promise.all([
                                  api.get(`/documents/${doc.id}`),
                                  api.get(`/documents/${doc.id}/versions`)
                                ])
                                const document = docResponse.data
                                const versions = versionsResponse.data || []
                                const currentVersion = document.current_version_id
                                  ? versions.find((v: DocumentVersion) => v.id === document.current_version_id)
                                  : versions[0]
                                setSelectedDocumentVersions(versions)
                                setSelectedDocumentInfo({
                                  document,
                                  currentVersion
                                })
                              } catch (err: any) {
                                console.error('Error loading document info:', err)
                              } finally {
                                setLoadingDocumentInfo(false)
                              }
                            }}
                          >
                            <span className="documents-tree-item-icon">📝</span>
                            <span className="documents-tree-item-name" title={doc.title}>{doc.title}</span>
                            <span className="documents-tree-item-badge">{doc.doc_type}</span>
                          </div>
                        ))}

                        {/* In Review Folder */}
                        <div 
                          className="documents-tree-item folder"
                          style={{ paddingLeft: '3rem' }}
                          onClick={() => toggleFolder('in-review-folder')}
                        >
                          <span className="documents-tree-toggle">
                            {expandedFolders.has('in-review-folder') ? (
                              <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            ) : (
                              <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                          <span className="documents-tree-item-icon">👁️</span>
                          <span className="documents-tree-item-name">In Review</span>
                          <span className="documents-tree-item-badge">{documentGroups['IN_REVIEW'].length}</span>
                        </div>
                        {expandedFolders.has('in-review-folder') && documentGroups['IN_REVIEW'].map((doc) => (
                          <div
                            key={doc.id}
                            className={`documents-tree-item document ${selectedDocumentId === doc.id ? 'selected' : ''}`}
                            style={{ paddingLeft: '4.5rem', cursor: 'pointer' }}
                            onClick={async () => {
                              setSelectedDocumentId(doc.id)
                              setLoadingDocumentInfo(true)
                              try {
                                const [docResponse, versionsResponse] = await Promise.all([
                                  api.get(`/documents/${doc.id}`),
                                  api.get(`/documents/${doc.id}/versions`)
                                ])
                                const document = docResponse.data
                                const versions = versionsResponse.data || []
                                const currentVersion = document.current_version_id
                                  ? versions.find((v: DocumentVersion) => v.id === document.current_version_id)
                                  : versions[0]
                                setSelectedDocumentVersions(versions)
                                setSelectedDocumentInfo({
                                  document,
                                  currentVersion
                                })
                              } catch (err: any) {
                                console.error('Error loading document info:', err)
                              } finally {
                                setLoadingDocumentInfo(false)
                              }
                            }}
                          >
                            <span className="documents-tree-item-icon">📝</span>
                            <span className="documents-tree-item-name" title={doc.title}>{doc.title}</span>
                            <span className="documents-tree-item-badge">{doc.doc_type}</span>
                          </div>
                        ))}

                        {/* Approved Folder */}
                        <div 
                          className="documents-tree-item folder"
                          style={{ paddingLeft: '3rem' }}
                          onClick={() => toggleFolder('approved-folder')}
                        >
                          <span className="documents-tree-toggle">
                            {expandedFolders.has('approved-folder') ? (
                              <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            ) : (
                              <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                          <span className="documents-tree-item-icon">✅</span>
                          <span className="documents-tree-item-name">Approved</span>
                          <span className="documents-tree-item-badge">{documentGroups['APPROVED'].length}</span>
                        </div>
                        {expandedFolders.has('approved-folder') && documentGroups['APPROVED'].map((doc) => (
                          <div
                            key={doc.id}
                            className={`documents-tree-item document ${selectedDocumentId === doc.id ? 'selected' : ''}`}
                            style={{ paddingLeft: '4.5rem', cursor: 'pointer' }}
                            onClick={async () => {
                              setSelectedDocumentId(doc.id)
                              setLoadingDocumentInfo(true)
                              try {
                                const [docResponse, versionsResponse] = await Promise.all([
                                  api.get(`/documents/${doc.id}`),
                                  api.get(`/documents/${doc.id}/versions`)
                                ])
                                const document = docResponse.data
                                const versions = versionsResponse.data || []
                                const currentVersion = document.current_version_id
                                  ? versions.find((v: DocumentVersion) => v.id === document.current_version_id)
                                  : versions[0]
                                setSelectedDocumentVersions(versions)
                                setSelectedDocumentInfo({
                                  document,
                                  currentVersion
                                })
                              } catch (err: any) {
                                console.error('Error loading document info:', err)
                              } finally {
                                setLoadingDocumentInfo(false)
                              }
                            }}
                          >
                            <span className="documents-tree-item-icon">📝</span>
                            <span className="documents-tree-item-name" title={doc.title}>{doc.title}</span>
                            <span className="documents-tree-item-badge">{doc.doc_type}</span>
                          </div>
                        ))}

                        {/* Archived Folder */}
                        <div 
                          className="documents-tree-item folder"
                          style={{ paddingLeft: '3rem' }}
                          onClick={() => toggleFolder('archived-folder')}
                        >
                          <span className="documents-tree-toggle">
                            {expandedFolders.has('archived-folder') ? (
                              <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            ) : (
                              <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                          <span className="documents-tree-item-icon">📦</span>
                          <span className="documents-tree-item-name">Archived</span>
                          <span className="documents-tree-item-badge">{documentGroups['ARCHIVED'].length}</span>
                        </div>
                        {expandedFolders.has('archived-folder') && documentGroups['ARCHIVED'].map((doc) => (
                          <div
                            key={doc.id}
                            className={`documents-tree-item document ${selectedDocumentId === doc.id ? 'selected' : ''}`}
                            style={{ paddingLeft: '4.5rem', cursor: 'pointer' }}
                            onClick={async () => {
                              setSelectedDocumentId(doc.id)
                              setLoadingDocumentInfo(true)
                              try {
                                const [docResponse, versionsResponse] = await Promise.all([
                                  api.get(`/documents/${doc.id}`),
                                  api.get(`/documents/${doc.id}/versions`)
                                ])
                                const document = docResponse.data
                                const versions = versionsResponse.data || []
                                const currentVersion = document.current_version_id
                                  ? versions.find((v: DocumentVersion) => v.id === document.current_version_id)
                                  : versions[0]
                                setSelectedDocumentVersions(versions)
                                setSelectedDocumentInfo({
                                  document,
                                  currentVersion
                                })
                              } catch (err: any) {
                                console.error('Error loading document info:', err)
                              } finally {
                                setLoadingDocumentInfo(false)
                              }
                            }}
                          >
                            <span className="documents-tree-item-icon">📝</span>
                            <span className="documents-tree-item-name" title={doc.title}>{doc.title}</span>
                            <span className="documents-tree-item-badge">{doc.doc_type}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Document Info Panel - Right side */}
        {selectedDocumentId && (
          <div className="documents-viewer">
            <div className="documents-viewer-header">
            <h3>Document Information</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                className="btn btn-sm btn-info" 
                onClick={() => setShowAuditLog(true)}
                title="View Audit Log"
              >
                📋 Audit Log
              </button>
              <button 
                className="btn btn-sm btn-secondary" 
                onClick={() => {
                  setSelectedDocumentId(null)
                  setSelectedDocumentInfo(null)
                  setSelectedDocumentVersions([])
                }}
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="documents-viewer-content" style={{ padding: '1rem', overflowY: 'auto' }}>
            {loadingDocumentInfo ? (
              <div style={{ padding: '2rem', textAlign: 'center' }}>Loading document information…</div>
            ) : selectedDocumentInfo ? (
              <DocumentInfoPanel
                document={selectedDocumentInfo.document}
                currentVersion={selectedDocumentInfo.currentVersion}
                versions={selectedDocumentVersions}
              />
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center' }}>Document not found</div>
            )}
          </div>
          </div>
        )}
      </div>
    </div>

    {/* View/Edit Document Modal - Outside tab-panel */}
    {viewingDocument && (
        <div className="modal-overlay" onClick={() => {
          if (!saving) {
            setViewingDocument(null)
            setEditingVersion(null)
            setVersions([])
          }
        }}>
          <div className="modal-content document-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{viewingDocument.title}</h2>
              <button
                className="modal-close"
                onClick={() => {
                  if (!saving) {
                    setViewingDocument(null)
                    setEditingVersion(null)
                    setVersions([])
                  }
                }}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              {loadingVersions ? (
                <div className="loading">Loading document versions...</div>
              ) : (
                <>
                  <div className="form-group">
                    <label>Document Type</label>
                    <input
                      type="text"
                      value={viewingDocument.doc_type}
                      disabled
                      className="form-control"
                    />
                  </div>

                  <div className="form-group">
                    <label>Version</label>
                    <select
                      value={editingVersion?.id || ''}
                      onChange={async (e) => {
                        if (e.target.value) {
                          try {
                            const versionRes = await api.get(`/versions/${e.target.value}`)
                            setEditingVersion(versionRes.data)
                          } catch (err: any) {
                            alert(err.response?.data?.detail || 'Failed to load version')
                          }
                        }
                      }}
                      className="form-control"
                    >
                      <option value="">Select version...</option>
                      {versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.version_string} ({v.state})
                        </option>
                      ))}
                    </select>
                    {versions.length === 0 && (
                      <div style={{ marginTop: '8px' }}>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={handleCreateVersion}
                          disabled={saving}
                        >
                          + Create First Version
                        </button>
                      </div>
                    )}
                  </div>

                  {editingVersion && (
                    <>
                      <div className="form-group">
                        <label>Version State</label>
                        <input
                          type="text"
                          value={editingVersion.state}
                          disabled
                          className="form-control"
                        />
                      </div>

                      <div className="form-group">
                        <label>Template</label>
                        {editingVersion.template ? (
                          <div style={{ 
                            padding: '0.75rem', 
                            background: '#f5f5f5', 
                            borderRadius: '4px',
                            border: '1px solid #ddd'
                          }}>
                            <strong>{editingVersion.template.name}</strong> ({editingVersion.template.doc_type})
                            <br />
                            <small style={{ color: '#666' }}>
                              File: {editingVersion.template.object_key}
                            </small>
                            {editingVersion.template.object_key && (
                              <div style={{ marginTop: '8px' }}>
                                <button
                                  onClick={async () => {
                                    try {
                                      const response = await api.get(`/templates/${editingVersion.template!.id}/file`, {
                                        responseType: 'blob'
                                      })
                                      const blob = new Blob([response.data])
                                      const url = URL.createObjectURL(blob)
                                      const a = document.createElement('a')
                                      a.href = url
                                      a.download = `${editingVersion.template!.name}.${editingVersion.template!.object_key.split('.').pop()}`
                                      document.body.appendChild(a)
                                      a.click()
                                      document.body.removeChild(a)
                                      URL.revokeObjectURL(url)
                                    } catch (err: any) {
                                      alert(err.response?.data?.detail || 'Failed to download template file')
                                    }
                                  }}
                                  style={{ 
                                    color: '#3498db', 
                                    textDecoration: 'none',
                                    fontSize: '14px',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: 0
                                  }}
                                >
                                  📄 Download Template File
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div style={{ 
                              padding: '0.75rem', 
                              background: '#fff3cd', 
                              borderRadius: '4px',
                              border: '1px solid #ffc107',
                              marginBottom: '8px'
                            }}>
                              <small style={{ color: '#856404' }}>
                                ⚠️ No template assigned. Select a template to view the document.
                              </small>
                            </div>
                            <select
                              value={editingVersion.template_id || ''}
                              onChange={async (e) => {
                                if (e.target.value) {
                                  try {
                                    await api.put(`/versions/${editingVersion.id}`, {
                                      template_id: e.target.value,
                                      content_json: editingVersion.content_json
                                    })
                                    // Reload version to get template info
                                    const versionRes = await api.get(`/versions/${editingVersion.id}`)
                                    setEditingVersion(versionRes.data)
                                    // Reload versions list
                                    const versionsRes = await api.get(`/documents/${viewingDocument!.id}/versions`)
                                    setVersions(versionsRes.data || [])
                                    alert('Template assigned successfully!')
                                  } catch (err: any) {
                                    alert(err.response?.data?.detail || 'Failed to assign template')
                                  }
                                }
                              }}
                              className="form-control"
                              disabled={editingVersion.state !== 'DRAFT'}
                            >
                              <option value="">Select template...</option>
                              {templates
                                .filter(t => t.doc_type === viewingDocument?.doc_type && t.status === 'APPROVED')
                                .map((template) => (
                                  <option key={template.id} value={template.id}>
                                    {template.name} (v{template.version})
                                  </option>
                                ))}
                            </select>
                            {editingVersion.state !== 'DRAFT' && (
                              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                                Template can only be assigned to DRAFT versions.
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="form-group">
                        <label>Content</label>
                        {(() => {
                          const fileFormat = getFileFormat(editingVersion)
                          const fileUrl = getFileUrl(editingVersion)
                          
                          console.log('Rendering content - Format:', fileFormat, 'URL:', fileUrl)
                          console.log('Template:', editingVersion?.template)
                          console.log('Full editingVersion:', editingVersion)
                          
                          // If we have a file format, show appropriate viewer
                          if (fileFormat && fileUrl) {
                            // Office documents (Word, Excel) - use react-doc-viewer
                            if (fileFormat === 'docx' || fileFormat === 'doc' || fileFormat === 'xlsx' || fileFormat === 'xls') {
                              // Use OfficeViewer component that handles blob URLs
                              return <OfficeDocumentViewer 
                                fileUrl={fileUrl} 
                                fileFormat={fileFormat}
                                editingVersion={editingVersion}
                                setEditingVersion={setEditingVersion}
                              />
                            } else if (fileFormat === 'xml' || fileFormat === 'bpmn' || fileFormat === 'uml') {
                              return (
                                <div>
                                  <pre style={{ 
                                    background: '#f5f5f5', 
                                    padding: '1rem', 
                                    borderRadius: '4px',
                                    overflow: 'auto',
                                    maxHeight: '400px',
                                    fontSize: '12px',
                                    fontFamily: 'monospace',
                                    border: '1px solid #ddd'
                                  }}>
                                    {typeof editingVersion.content_json === 'string' 
                                      ? editingVersion.content_json 
                                      : JSON.stringify(editingVersion.content_json || {}, null, 2)}
                                  </pre>
                                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                                    {fileFormat.toUpperCase()} format detected. Content shown as structured data.
                                  </div>
                                  {editingVersion.state === 'DRAFT' && (
                                    <textarea
                                      value={typeof editingVersion.content_json === 'string' 
                                        ? editingVersion.content_json 
                                        : JSON.stringify(editingVersion.content_json || {}, null, 2)}
                                      onChange={(e) => {
                                        try {
                                          const parsed = JSON.parse(e.target.value)
                                          setEditingVersion({ ...editingVersion, content_json: parsed })
                                        } catch {
                                          setEditingVersion({ ...editingVersion, content_json: e.target.value })
                                        }
                                      }}
                                      className="form-control"
                                      rows={10}
                                      style={{ fontFamily: 'monospace', fontSize: '12px', marginTop: '8px' }}
                                    />
                                  )}
                                </div>
                              )
                            }
                          }
                          
                          // Default: JSON editor
                          return (
                            <>
                              <textarea
                                value={JSON.stringify(editingVersion.content_json || {}, null, 2)}
                                onChange={(e) => {
                                  try {
                                    const parsed = JSON.parse(e.target.value)
                                    setEditingVersion({ ...editingVersion, content_json: parsed })
                                  } catch {
                                    setEditingVersion({ ...editingVersion, content_json: e.target.value as any })
                                  }
                                }}
                                className="form-control"
                                rows={15}
                                style={{ fontFamily: 'monospace', fontSize: '12px' }}
                                disabled={editingVersion.state !== 'DRAFT'}
                              />
                              {editingVersion.state !== 'DRAFT' && (
                                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                                  This version is locked. Only DRAFT versions can be edited.
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (!saving) {
                    setViewingDocument(null)
                    setEditingVersion(null)
                    setVersions([])
                  }
                }}
                disabled={saving}
              >
                Close
              </button>
              {editingVersion && editingVersion.state === 'DRAFT' && (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={handleUpdateVersion}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={handleSubmitVersion}
                    disabled={saving}
                  >
                    Submit for Review
                  </button>
                </>
              )}
              {versions.length > 0 && !editingVersion && (
                <button
                  className="btn btn-primary"
                  onClick={handleCreateVersion}
                  disabled={saving}
                >
                  + Create New Version
                </button>
              )}
            </div>
          </div>
        </div>
    )}

    {/* Audit Log Modal - For now, we'll use project audit with filtering */}
    {showAuditLog && selectedDocumentForAudit && (
        <div className="modal-overlay" onClick={() => setShowAuditLog(false)} key="audit-log-modal">
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h2>Audit Log: {selectedDocumentForAudit.title}</h2>
              <button className="modal-close" onClick={() => setShowAuditLog(false)}>×</button>
            </div>
            <div className="modal-body">
              <p>Audit log for documents will be available soon. Currently, audit log is available for templates only.</p>
              <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '1rem' }}>
                To view document audit logs, use the project audit log with entity type filter.
              </p>
            </div>
          </div>
        </div>
    )}

    {/* Edit Document Info Modal - Outside tab-panel */}
    {editingDocument && (
        <div className="modal-overlay" onClick={() => {
          if (!saving) {
            setEditingDocument(null)
          }
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Document: {editingDocument.title}</h2>
              <button
                className="modal-close"
                onClick={() => {
                  if (!saving) {
                    setEditingDocument(null)
                  }
                }}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <form onSubmit={handleUpdateDocument}>
                <div className="form-group">
                  <label>Title</label>
                  <input
                    type="text"
                    value={editingDocument.title}
                    onChange={(e) => setEditingDocument({ ...editingDocument, title: e.target.value })}
                    className="form-control"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Document Type</label>
                  <select
                    value={editingDocument.doc_type}
                    onChange={(e) => setEditingDocument({ ...editingDocument, doc_type: e.target.value })}
                    className="form-control"
                    required
                  >
                    <option value="PDD">PDD</option>
                    <option value="SDD">SDD</option>
                    <option value="TSS">TSS</option>
                    <option value="TEST_PLAN">Test Plan</option>
                    <option value="RELEASE_NOTES">Release Notes</option>
                  </select>
                </div>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditingDocument(null)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
    )}
    </>
  )
}

export default DocumentsTab

