import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import api from '../services/api'
import './Templates.css'
// @ts-ignore - react-doc-viewer may not have types
import DocViewer, { DocViewerRenderers } from '@cyntler/react-doc-viewer'
// @ts-ignore - docx-preview may not have types
import { renderAsync } from 'docx-preview'

interface Template {
  id: string
  doc_type: string
  name: string
  version: string
  status: string
  object_key: string
  file_hash: string
  mapping_manifest_json: any
  created_at: string
}

// Component for viewing Office documents using react-office-viewer
const OfficeDocumentViewer = ({ 
  fileUrl, 
  fileFormat,
  templateId
}: { 
  fileUrl: string
  fileFormat: string
  templateId?: string
}) => {
  // All hooks must be called at the top level, before any conditional returns
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [fileBlob, setFileBlob] = useState<Blob | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Normalize file type
  const normalizedFileType = fileFormat.toLowerCase().replace(/^\./, '')
  // @cyntler/react-doc-viewer supports: pdf, docx, xlsx, pptx, doc, xls, ppt, csv, txt, rtf
  const supportedFormats = ['docx', 'xlsx', 'pdf', 'doc', 'xls', 'pptx', 'ppt', 'csv', 'txt', 'rtf']
  const isSupported = supportedFormats.includes(normalizedFileType)

  useEffect(() => {
    const loadFile = async () => {
      try {
        setLoading(true)
        setError(null)
        
        // Build full URL to backend
        const backendBaseUrl = api.defaults.baseURL || 'http://localhost:8000/api/v1'
        const backendOrigin = backendBaseUrl.replace('/api/v1', '')
        const fullUrl = fileUrl.startsWith('http') ? fileUrl : `${backendOrigin}${fileUrl}`
        
        console.log('Loading file from URL:', fullUrl)
        
        // Download file as blob
        const response = await api.get(fullUrl, {
          responseType: 'blob',
          headers: {
            'Accept': '*/*'
          }
        })
        
        console.log('File response status:', response.status)
        console.log('File response data size:', response.data?.size || 'unknown')
        console.log('File response data type:', response.data?.type || 'unknown')
        
        if (!response.data || response.data.size === 0) {
          throw new Error('File is empty or could not be loaded')
        }
        
        // Create blob URL from response
        const blob = response.data instanceof Blob 
          ? response.data 
          : new Blob([response.data], { 
              type: response.headers['content-type'] || 'application/octet-stream' 
            })
        
        console.log('Blob size:', blob.size, 'bytes')
        console.log('Blob type:', blob.type)
        
        const url = URL.createObjectURL(blob)
        setBlobUrl(url)
        setFileBlob(blob) // Store blob for docx-preview
        console.log('Blob URL created:', url)
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
      // Use functional update to get current blobUrl value
      setBlobUrl((currentUrl) => {
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl)
        }
        return null
      })
      setFileBlob(null)
    }
  }, [fileUrl, templateId, normalizedFileType])

  // Render DOCX using docx-preview
  useEffect(() => {
    if (normalizedFileType === 'docx' && fileBlob) {
      const container = document.getElementById('docx-preview-container')
      if (container) {
        container.innerHTML = '' // Clear previous content
        
        // Render with options to preserve styles from the document
        renderAsync(fileBlob, container, undefined, {
          className: 'docx-wrapper',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false, // Preserve fonts from document
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          experimental: false,
          trimXmlDeclaration: true,
          useBase64URL: false,
        })
          .then(() => {
            console.log('DOCX rendered successfully')
            
            // MINIMAL STYLING - Let docx-preview handle everything
            // Only ensure white background on wrapper
            const wrapper = container.querySelector('.docx-wrapper')
            if (wrapper) {
              const wrapperEl = wrapper as HTMLElement
              wrapperEl.style.backgroundColor = 'white'
              wrapperEl.style.background = 'white'
              console.log('DOCX rendered - letting docx-preview handle all styling')
            }
          })
          .catch((err) => {
            console.error('Error rendering DOCX:', err)
            setError(`Failed to render DOCX: ${err.message}`)
          })
      }
    }
  }, [normalizedFileType, fileBlob])

  // Conditional returns after all hooks
  if (loading) {
    return <div className="loading">Loading document...</div>
  }

  if (error) {
    return (
      <div style={{ padding: '1rem', background: '#fee', border: '1px solid #fcc', borderRadius: '4px' }}>
        <strong>Error loading document:</strong> {error}
        <div style={{ marginTop: '8px' }}>
          <a
            href={blobUrl || fileUrl}
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

  if (!isSupported) {
    return (
      <div style={{ padding: '1rem', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px' }}>
        <strong>Format not supported:</strong> {normalizedFileType}
        <div style={{ marginTop: '8px' }}>
          <a
            href={blobUrl || fileUrl}
            download
            style={{ color: '#3498db' }}
          >
            Download file instead
          </a>
        </div>
      </div>
    )
  }

  if (!blobUrl) {
    return <div className="loading">Preparing document...</div>
  }

  if (!isSupported) {
    return (
      <div style={{ padding: '1rem', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px' }}>
        <strong>Format not supported for inline viewing:</strong> {normalizedFileType}
        <div style={{ marginTop: '8px' }}>
          <a
            href={blobUrl || fileUrl}
            download
            style={{ color: '#3498db' }}
          >
            Download file instead
          </a>
        </div>
      </div>
    )
  }

  // Use @cyntler/react-doc-viewer with blob URL
  // Check if DocViewer supports this file type
  const supportedByDocViewer = ['pdf', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt']
  
  if (!supportedByDocViewer.includes(normalizedFileType)) {
    return (
      <div style={{ padding: '1rem', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px' }}>
        <strong>Format not supported:</strong> {normalizedFileType}
        <div style={{ marginTop: '8px' }}>
          <a
            href={blobUrl || fileUrl}
            download
            style={{ color: '#3498db' }}
          >
            Download file instead
          </a>
        </div>
      </div>
    )
  }

  // For DOCX, use docx-preview which renders DOCX as HTML
  if (normalizedFileType === 'docx' && fileBlob) {
    return (
      <div 
        id="docx-preview-container"
        style={{ 
          width: '100%', 
          height: '100%',
          minHeight: '500px',
          position: 'relative',
          overflow: 'auto',
          display: 'block',
          padding: '3rem',
          backgroundColor: 'white',
          maxWidth: '210mm', // A4 width
          margin: '0 auto',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
        }}
      />
    )
  }

  // For other formats (PDF, XLSX, etc.), use DocViewer
  const docs = [{
    uri: blobUrl || fileUrl,
    fileType: normalizedFileType,
  }]

  console.log('DocViewer - Using blob URL:', blobUrl)
  console.log('DocViewer - File type:', normalizedFileType)
  console.log('DocViewer - Documents:', docs)

  // Use DocViewer for PDF and other formats
  return (
    <div style={{ 
      width: '100%', 
      height: '100%',
      minHeight: '500px',
      position: 'relative',
      overflow: 'auto',
      display: 'block'
    }}>
      <DocViewer
        documents={docs}
        pluginRenderers={DocViewerRenderers}
        style={{ width: '100%', height: '100%' }}
        config={{
          header: {
            disableHeader: true,
            disableFileName: true
          }
        }}
      />
    </div>
  )
}

const Templates = () => {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [viewingTemplate, setViewingTemplate] = useState<Template | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [formData, setFormData] = useState({
    doc_type: 'SDD',
    name: '',
    version: 'v1',
    object_key: '',
    file_hash: '',
    mapping_manifest_json: {},
  })
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = () => {
    api
      .get('/templates')
      .then((res) => setTemplates(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    setUploadingFile(true)

    try {
      // Upload file to backend
      const formDataUpload = new FormData()
      formDataUpload.append('file', file)

      const response = await api.post('/templates/upload', formDataUpload, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      // Automatically set object_key and file_hash
      setFormData({
        ...formData,
        object_key: response.data.object_key,
        file_hash: response.data.file_hash,
      })

      // If name is empty, use filename (without extension) as template name
      if (!formData.name) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '')
        setFormData((prev) => ({
          ...prev,
          name: nameWithoutExt,
          object_key: response.data.object_key,
          file_hash: response.data.file_hash,
        }))
      } else {
        setFormData((prev) => ({
          ...prev,
          object_key: response.data.object_key,
          file_hash: response.data.file_hash,
        }))
      }

      alert(`File uploaded successfully!\nObject Key: ${response.data.object_key}\nFile Hash: ${response.data.file_hash.substring(0, 20)}...`)
    } catch (err: any) {
      console.error('File upload error:', err)
      alert(err.response?.data?.detail || 'Failed to upload file')
      setSelectedFile(null)
    } finally {
      setUploadingFile(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate that file is uploaded
    if (!formData.object_key || !formData.file_hash) {
      alert('Please select and upload a file first')
      return
    }

    setCreating(true)
    try {
      await api.post('/templates', formData)
      setShowCreateForm(false)
      setSelectedFile(null)
      setFormData({
        doc_type: 'SDD',
        name: '',
        version: 'v1',
        object_key: '',
        file_hash: '',
        mapping_manifest_json: {},
      })
      loadTemplates()
      alert('Template created successfully!')
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create template')
    } finally {
      setCreating(false)
    }
  }

  const handleView = async (template: Template) => {
    try {
      const response = await api.get(`/templates/${template.id}`)
      setViewingTemplate(response.data)
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to load template')
    }
  }


  const handleFileSelectForEdit = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editingTemplate) return

    setUploadingFile(true)

    try {
      // Upload file to backend
      const formDataUpload = new FormData()
      formDataUpload.append('file', file)

      const response = await api.post('/templates/upload', formDataUpload, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      // Update editing template with new object_key and file_hash
      setEditingTemplate({
        ...editingTemplate,
        object_key: response.data.object_key,
        file_hash: response.data.file_hash,
      })

      alert(`File uploaded successfully!\nObject Key: ${response.data.object_key}\nFile Hash: ${response.data.file_hash.substring(0, 20)}...`)
    } catch (err: any) {
      console.error('File upload error:', err)
      alert(err.response?.data?.detail || 'Failed to upload file')
    } finally {
      setUploadingFile(false)
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTemplate) return
    setSaving(true)
    try {
      const updateData: any = {
        doc_type: editingTemplate.doc_type,
        name: editingTemplate.name,
        version: editingTemplate.version,
        object_key: editingTemplate.object_key,
        file_hash: editingTemplate.file_hash,
        mapping_manifest_json: editingTemplate.mapping_manifest_json,
      }
      
      await api.put(`/templates/${editingTemplate.id}`, updateData)
      setEditingTemplate(null)
      setSelectedFile(null)
      setFormData({
        doc_type: 'SDD',
        name: '',
        version: 'v1',
        object_key: '',
        file_hash: '',
        mapping_manifest_json: {},
      })
      loadTemplates()
      alert('Template updated successfully!')
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update template')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return
    try {
      await api.delete(`/templates/${templateId}`)
      loadTemplates()
      alert('Template deleted successfully!')
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete template')
    }
  }

  const handleApprove = async (templateId: string) => {
    try {
      await api.post(`/templates/${templateId}/approve`)
      loadTemplates()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to approve template')
    }
  }

  const getFileFormat = (template: Template): string | null => {
    if (template.object_key) {
      const parts = template.object_key.split('.')
      return parts.length > 1 ? parts.pop()!.toLowerCase() : null
    }
    const docTypeMap: { [key: string]: string } = {
      'SDD': 'docx',
      'PDD': 'docx',
      'TSS': 'docx',
      'TEST_PLAN': 'xlsx',
      'RELEASE_NOTES': 'docx',
      'UML': 'xml',
      'BPMN': 'xml',
    }
    return docTypeMap[template.doc_type] || 'docx'
  }

  const getFileUrl = (template: Template): string => {
    return `/api/v1/templates/${template.id}/file`
  }

  const renderContent = (template: Template) => {
    const fileFormat = getFileFormat(template)
    const fileUrl = getFileUrl(template)
    
    if (fileFormat && (fileFormat === 'docx' || fileFormat === 'doc' || fileFormat === 'xlsx' || fileFormat === 'xls')) {
      return <OfficeDocumentViewer fileUrl={fileUrl} fileFormat={fileFormat} templateId={template.id} />
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
            {JSON.stringify(template.mapping_manifest_json || {}, null, 2)}
          </pre>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
            {fileFormat.toUpperCase()} format detected. Content shown as structured data.
          </div>
        </div>
      )
    }
    
    return (
      <div>
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
          No specific viewer for {fileFormat ? fileFormat.toUpperCase() : 'this format'}. Showing template metadata.
        </div>
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
          {JSON.stringify(template.mapping_manifest_json || {}, null, 2)}
        </pre>
      </div>
    )
  }

  if (loading) {
    return (
      <Layout>
        <div className="loading">Loading templates...</div>
      </Layout>
    )
  }

  return (
    <>
      <Layout>
        <div className="templates-page">
          <div className="page-header">
            <h1>Templates Manager</h1>
            <button
              className="btn btn-primary"
              onClick={() => {
                setShowCreateForm(!showCreateForm)
                setEditingTemplate(null)
              }}
            >
              + New Template
            </button>
          </div>

          {(showCreateForm || editingTemplate) && (
            <div className="create-form">
              <h3>{editingTemplate ? 'Edit Template' : 'Create New Template'}</h3>
              <form onSubmit={editingTemplate ? handleUpdate : handleCreate}>
                <div className="form-group">
                  <label>Document Type</label>
                  <select
                    value={editingTemplate ? editingTemplate.doc_type : formData.doc_type}
                    onChange={(e) => editingTemplate 
                      ? setEditingTemplate({ ...editingTemplate, doc_type: e.target.value })
                      : setFormData({ ...formData, doc_type: e.target.value })
                    }
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
                  <label>Template File {editingTemplate && '(Optional - upload new file to replace existing)'}</label>
                  <input
                    type="file"
                    accept=".docx,.doc,.xlsx,.xls,.xml,.bpmn"
                    onChange={editingTemplate ? handleFileSelectForEdit : handleFileSelect}
                    disabled={uploadingFile}
                    style={{
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      width: '100%',
                    }}
                  />
                  {uploadingFile && (
                    <div style={{ marginTop: '8px', color: '#666', fontSize: '14px' }}>
                      Uploading file...
                    </div>
                  )}
                  {selectedFile && !uploadingFile && !editingTemplate && (
                    <div style={{ marginTop: '8px', color: '#28a745', fontSize: '14px' }}>
                      ✓ File selected: {selectedFile.name}
                    </div>
                  )}
                  {editingTemplate && editingTemplate.object_key && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                      Current file: {editingTemplate.object_key}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label>Template Name</label>
                  <input
                    type="text"
                    value={editingTemplate ? editingTemplate.name : formData.name}
                    onChange={(e) => editingTemplate
                      ? setEditingTemplate({ ...editingTemplate, name: e.target.value })
                      : setFormData({ ...formData, name: e.target.value })
                    }
                    required
                    placeholder="Template Name"
                  />
                </div>
                <div className="form-group">
                  <label>Version</label>
                  <input
                    type="text"
                    value={editingTemplate ? editingTemplate.version : formData.version}
                    onChange={(e) => editingTemplate
                      ? setEditingTemplate({ ...editingTemplate, version: e.target.value })
                      : setFormData({ ...formData, version: e.target.value })
                    }
                    required
                    placeholder="v1"
                  />
                </div>
                <div className="form-group">
                  <label>Object Key (Storage path)</label>
                  <input
                    type="text"
                    value={editingTemplate ? editingTemplate.object_key : formData.object_key}
                    onChange={(e) => editingTemplate
                      ? setEditingTemplate({ ...editingTemplate, object_key: e.target.value })
                      : setFormData({ ...formData, object_key: e.target.value })
                    }
                    required
                    placeholder="templates/sdd-template-v1.docx"
                    disabled={!editingTemplate && !!formData.object_key} // Disable if file was uploaded
                    style={{
                      backgroundColor: !editingTemplate && formData.object_key ? '#f5f5f5' : 'white',
                    }}
                  />
                  {!editingTemplate && formData.object_key && (
                    <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                      ✓ Automatically set from uploaded file
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label>File Hash</label>
                  <input
                    type="text"
                    value={editingTemplate ? editingTemplate.file_hash : formData.file_hash}
                    onChange={(e) => editingTemplate
                      ? setEditingTemplate({ ...editingTemplate, file_hash: e.target.value })
                      : setFormData({ ...formData, file_hash: e.target.value })
                    }
                    required
                    placeholder="SHA-256 hash"
                    disabled={!editingTemplate && !!formData.file_hash} // Disable if file was uploaded
                    style={{
                      backgroundColor: !editingTemplate && formData.file_hash ? '#f5f5f5' : 'white',
                    }}
                  />
                  {!editingTemplate && formData.file_hash && (
                    <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                      ✓ Automatically calculated from uploaded file
                    </div>
                  )}
                </div>
                <div className="form-actions">
                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    disabled={creating || saving}
                  >
                    {creating ? 'Creating...' : saving ? 'Saving...' : editingTemplate ? 'Update' : 'Create'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowCreateForm(false)
                      setEditingTemplate(null)
                      setFormData({
                        doc_type: 'SDD',
                        name: '',
                        version: 'v1',
                        object_key: '',
                        file_hash: '',
                        mapping_manifest_json: {},
                      })
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {templates.length === 0 ? (
            <div className="empty-state">
              <p>No templates yet. Create your first template!</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((template) => (
                    <tr key={template.id}>
                      <td>{template.name}</td>
                      <td>
                        <span className="badge">{template.doc_type}</span>
                      </td>
                      <td>{template.version}</td>
                      <td>
                        <span
                          className={`badge ${
                            template.status === 'APPROVED' ? 'badge-success' : 'badge-warning'
                          }`}
                        >
                          {template.status}
                        </span>
                      </td>
                      <td>{new Date(template.created_at).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="btn btn-sm btn-info"
                            onClick={() => handleView(template)}
                          >
                            View
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                              setEditingTemplate(template)
                              setFormData({
                                doc_type: template.doc_type,
                                name: template.name,
                                version: template.version,
                                object_key: template.object_key,
                                file_hash: template.file_hash,
                                mapping_manifest_json: template.mapping_manifest_json,
                              })
                              setShowCreateForm(false)
                            }}
                          >
                            Edit
                          </button>
                          {template.status !== 'APPROVED' && (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => handleApprove(template.id)}
                            >
                              Approve
                            </button>
                          )}
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDelete(template.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Layout>

      {viewingTemplate && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'stretch',
            overflow: 'hidden'
          }}
          onClick={() => setViewingTemplate(null)}
        >
          <div 
            style={{
              width: '100%',
              height: '100%',
              background: 'white',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '1.5rem',
              borderBottom: '1px solid #dee2e6',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0
            }}>
              <h2 style={{ margin: 0, color: '#2c3e50', fontSize: '1.5rem' }}>{viewingTemplate.name}</h2>
              <button
                onClick={() => setViewingTemplate(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '2rem',
                  cursor: 'pointer',
                  color: '#7f8c8d',
                  padding: 0,
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>

            {/* Body - Two columns */}
            <div style={{ 
              display: 'flex', 
              flex: 1,
              minHeight: 0,
              overflow: 'hidden'
            }}>
              {/* Left sidebar - File information (10%) */}
              <div style={{ 
                width: '10%',
                minWidth: '200px',
                padding: '1.5rem',
                background: '#f8f9fa',
                borderRight: '1px solid #dee2e6',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                flexShrink: 0
              }}>
                <div>
                  <label style={{ 
                    fontSize: '0.75rem', 
                    color: '#7f8c8d', 
                    marginBottom: '0.5rem',
                    display: 'block',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    fontWeight: 600
                  }}>
                    Document Type
                  </label>
                  <div style={{ 
                    padding: '0.75rem', 
                    background: 'white', 
                    borderRadius: '4px',
                    fontWeight: 500,
                    color: '#2c3e50',
                    border: '1px solid #dee2e6'
                  }}>
                    {viewingTemplate.doc_type}
                  </div>
                </div>

                <div>
                  <label style={{ 
                    fontSize: '0.75rem', 
                    color: '#7f8c8d', 
                    marginBottom: '0.5rem',
                    display: 'block',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    fontWeight: 600
                  }}>
                    Version
                  </label>
                  <div style={{ 
                    padding: '0.75rem', 
                    background: 'white', 
                    borderRadius: '4px',
                    fontWeight: 500,
                    color: '#2c3e50',
                    border: '1px solid #dee2e6'
                  }}>
                    {viewingTemplate.version}
                  </div>
                </div>

                <div>
                  <label style={{ 
                    fontSize: '0.75rem', 
                    color: '#7f8c8d', 
                    marginBottom: '0.5rem',
                    display: 'block',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    fontWeight: 600
                  }}>
                    Status
                  </label>
                  <div style={{ 
                    padding: '0.75rem', 
                    background: viewingTemplate.status === 'APPROVED' ? '#d4edda' : '#fff3cd', 
                    borderRadius: '4px',
                    fontWeight: 600,
                    color: viewingTemplate.status === 'APPROVED' ? '#155724' : '#856404',
                    textAlign: 'center',
                    border: '1px solid ' + (viewingTemplate.status === 'APPROVED' ? '#c3e6cb' : '#ffeaa7')
                  }}>
                    {viewingTemplate.status}
                  </div>
                </div>

                <div>
                  <label style={{ 
                    fontSize: '0.75rem', 
                    color: '#7f8c8d', 
                    marginBottom: '0.5rem',
                    display: 'block',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    fontWeight: 600
                  }}>
                    File Name
                  </label>
                  <div style={{ 
                    padding: '0.75rem', 
                    background: 'white', 
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                    color: '#495057',
                    border: '1px solid #dee2e6',
                    wordBreak: 'break-word'
                  }}>
                    {viewingTemplate.object_key?.split('/').pop() || 'N/A'}
                  </div>
                </div>

                <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #dee2e6' }}>
                  <a
                    href={`/api/v1/templates/${viewingTemplate.id}/file`}
                    download
                    style={{ 
                      display: 'block',
                      padding: '0.75rem',
                      background: '#3498db',
                      color: 'white',
                      textDecoration: 'none',
                      borderRadius: '4px',
                      textAlign: 'center',
                      fontWeight: 500,
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#2980b9'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#3498db'}
                  >
                    📥 Download File
                  </a>
                </div>
              </div>

              {/* Right side - Document preview (90%) */}
              <div style={{ 
                flex: 1,
                padding: '1rem',
                background: '#e9ecef',
                minWidth: 0,
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}>
                {/* Document viewer - fills entire right panel */}
                <div style={{
                  width: '100%',
                  height: '100%',
                  background: 'white',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                  position: 'relative',
                  overflow: 'auto',
                  display: 'block'
                }}>
                  {renderContent(viewingTemplate)}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid #dee2e6',
              display: 'flex',
              justifyContent: 'flex-end',
              flexShrink: 0
            }}>
              <button
                onClick={() => setViewingTemplate(null)}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#95a5a6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 500
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Templates
