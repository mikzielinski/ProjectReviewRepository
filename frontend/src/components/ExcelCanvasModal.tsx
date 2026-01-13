import { useEffect, useState } from 'react'
import api from '../services/api'
import './ExcelCanvasModal.css'

interface Template {
  id: string
  name: string
  version: string
  status: string
  doc_type: string
}

interface Props {
  templateId: string
  isOpen: boolean
  onClose: () => void
}

interface Column {
  key: string
  label: string
  type?: 'string' | 'number' | 'date' | 'boolean'
}

interface Sheet {
  name: string
  columns: Column[]
  rows: Record<string, any>[]
}

interface ExcelCanvasResponse {
  sheets: Sheet[]
}

export default function ExcelCanvasModal({
  templateId,
  isOpen,
  onClose
}: Props) {
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [activeSheet, setActiveSheet] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [template, setTemplate] = useState<Template | null>(null)

  useEffect(() => {
    if (!isOpen || !templateId) return

    setLoading(true)
    setError(null)
    
    // Load template info and canvas data in parallel
    // Use Promise.allSettled to handle partial failures
    Promise.allSettled([
      api.get<Template>(`/templates/${templateId}`),
      api.get<ExcelCanvasResponse>(`/templates/${templateId}/canvas`)
    ])
      .then(([templateResult, canvasResult]) => {
        // Handle template info (optional - if it fails, we still show canvas)
        if (templateResult.status === 'fulfilled') {
          setTemplate(templateResult.value.data)
        } else {
          console.warn('Failed to load template info:', templateResult.reason)
          // Don't fail the whole modal if template info fails
        }
        
        // Handle canvas data (required - if it fails, show error)
        if (canvasResult.status === 'fulfilled') {
          setSheets(canvasResult.value.data.sheets || [])
          setActiveSheet(0)
        } else {
          console.error('Failed to load Excel canvas data:', canvasResult.reason)
          setError(canvasResult.reason?.response?.data?.detail || 'Failed to load Excel data')
        }
      })
      .catch(err => {
        console.error('Unexpected error loading Excel data:', err)
        setError(err?.response?.data?.detail || 'Failed to load Excel data')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [isOpen, templateId])

  const handleDownload = async () => {
    if (!templateId || downloading) return
    
    setDownloading(true)
    try {
      // Get token from localStorage to ensure it's included
      const token = localStorage.getItem('token')
      const headers: any = {
        'Accept': '*/*'
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      
      const response = await api.get(`/templates/${templateId}/file`, {
        responseType: 'blob',
        headers
      })
      
      // Create blob URL and trigger download
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      
      // Try to get filename from Content-Disposition header or use template name
      const contentDisposition = response.headers['content-disposition']
      let filename = template ? `${template.name}_${template.version}.xlsx` : 'template.xlsx'
      
      if (contentDisposition) {
        // Handle both quoted and unquoted filenames
        // Match: filename="name.ext" or filename=name.ext or filename*=UTF-8''name.ext
        const quotedMatch = contentDisposition.match(/filename\*?=['"]?([^'";]+)['"]?/i)
        if (quotedMatch) {
          let extracted = quotedMatch[1]
          // Remove any remaining quotes
          extracted = extracted.replace(/^["']|["']$/g, '')
          // Decode if it's URL encoded (for filename*=UTF-8''...)
          try {
            extracted = decodeURIComponent(extracted)
          } catch {
            // If decoding fails, use as is
          }
          if (extracted && !extracted.endsWith('"')) {
            filename = extracted
          }
        }
      }
      
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('Error downloading Excel file:', err)
      alert(err.response?.data?.detail || 'Failed to download Excel file')
    } finally {
      setDownloading(false)
    }
  }


  if (!isOpen) return null

  return (
    <div className="canvas-overlay" onClick={onClose}>
      <div className="canvas-modal" onClick={(e) => e.stopPropagation()}>
        <header className="canvas-header">
          <div className="canvas-header-left">
            <h3>Excel – Model View</h3>
            {template && (
              <div className="canvas-template-info">
                <span className={`canvas-status-badge canvas-status-${template.status.toLowerCase()}`}>
                  {template.status}
                </span>
                <span className="canvas-version">v{template.version}</span>
              </div>
            )}
          </div>
          <div className="canvas-header-actions">
            <button 
              className="canvas-download-btn" 
              onClick={handleDownload}
              disabled={downloading}
              title="Download Excel file"
            >
              {downloading ? '⏳ Downloading...' : '📥 Download XLSX'}
            </button>
            <button className="canvas-close-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        {loading && (
          <div className="canvas-loading">
            <div>Loading Excel data…</div>
          </div>
        )}

        {error && (
          <div className="canvas-error">
            <div>Error: {error}</div>
          </div>
        )}

        {!loading && !error && sheets.length > 0 && (
          <>
            {sheets.length > 1 && (
              <nav className="canvas-tabs">
                {sheets.map((sheet, i) => (
                  <button
                    key={sheet.name}
                    className={i === activeSheet ? 'active' : ''}
                    onClick={() => setActiveSheet(i)}
                  >
                    {sheet.name}
                  </button>
                ))}
              </nav>
            )}

            <div className="canvas-table-wrapper">
              <table className="canvas-table">
                <thead>
                  <tr>
                    {sheets[activeSheet].columns.map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheets[activeSheet].rows.length === 0 ? (
                    <tr>
                      <td colSpan={sheets[activeSheet].columns.length} className="canvas-empty">
                        No data rows
                      </td>
                    </tr>
                  ) : (
                    sheets[activeSheet].rows.map((row, idx) => (
                      <tr key={idx}>
                        {sheets[activeSheet].columns.map((col) => (
                          <td key={col.key}>{String(row[col.key] ?? '')}</td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && !error && sheets.length === 0 && (
          <div className="canvas-empty-message">
            No sheets found in this Excel file
          </div>
        )}
      </div>
    </div>
  )
}
