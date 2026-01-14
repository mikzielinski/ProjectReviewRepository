import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import api from '../services/api'
import './Templates.css'
// @ts-ignore - react-doc-viewer may not have types
import DocViewer, { DocViewerRenderers } from '@cyntler/react-doc-viewer'
// @ts-ignore - docx-preview may not have types
import { renderAsync } from 'docx-preview'
import ExcelCanvasModal from '../components/ExcelCanvasModal'
import TemplateInfoModal from '../components/TemplateInfoModal'

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

interface DocStyles {
  fonts?: string[]
  font_families?: { [key: string]: string }
  page_orientations?: Array<{
    section_index: number
    orientation: 'portrait' | 'landscape'
    width_px: number
    height_px: number
  }>
  detailed_table_styles?: Array<{
    index: number
    rows: Array<{
      cells: Array<{
        background_color?: string
      }>
    }>
  }>
  paragraph_formats?: any[]
  section_properties?: any[]
  list_styles?: { [key: string]: any }
  table_styles?: any[]
}

// Component to display various file formats (XML, images, text, data)
const FileViewer: React.FC<{ templateId: string; fileFormat: string | null }> = ({ templateId, fileFormat }) => {
  const [fileContent, setFileContent] = useState<string>('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const format = fileFormat?.toLowerCase() || ''

  useEffect(() => {
    const loadFile = async () => {
      try {
        setLoading(true)
        setError(null)
        setImageUrl(null)
        
        // For images, use blob URL
        const imageFormats = ['svg', 'png', 'jpg', 'jpeg', 'webp']
        if (format && imageFormats.includes(format)) {
          const response = await api.get(`/templates/${templateId}/file`, {
            responseType: 'blob'
          })
          const blob = new Blob([response.data], { 
            type: format === 'svg' ? 'image/svg+xml' : `image/${format === 'jpg' ? 'jpeg' : format}`
          })
          const url = URL.createObjectURL(blob)
          setImageUrl(url)
        } else {
          // For text-based formats, load as text
          const response = await api.get(`/templates/${templateId}/file`, {
            responseType: 'text'
          })
          setFileContent(response.data)
        }
      } catch (err: any) {
        console.error('Failed to load file:', err)
        setError(err.response?.data?.detail || 'Failed to load file')
      } finally {
        setLoading(false)
      }
    }
    
    loadFile()
    
    // Cleanup blob URL on unmount
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl)
      }
    }
  }, [templateId, format])

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="loading">Loading {fileFormat?.toUpperCase()} file...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ color: '#e74c3c' }}>
          <strong>Error:</strong> {error}
        </div>
      </div>
    )
  }

  // Display image
  if (imageUrl) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        overflow: 'auto',
        padding: '1rem',
        backgroundColor: '#f8f9fa',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <img 
          src={imageUrl} 
          alt={`${fileFormat} preview`}
          style={{ 
            maxWidth: '100%', 
            maxHeight: '100%',
            objectFit: 'contain'
          }}
        />
      </div>
    )
  }

  // Display JSON with formatting
  if (format === 'json') {
    try {
      const jsonObj = JSON.parse(fileContent)
      const formattedJson = JSON.stringify(jsonObj, null, 2)
      return (
        <div style={{ 
          width: '100%', 
          height: '100%', 
          overflow: 'auto',
          padding: '1rem',
          backgroundColor: '#f8f9fa',
          fontFamily: 'monospace',
          fontSize: '0.9rem',
          lineHeight: '1.5'
        }}>
          <pre style={{ 
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            backgroundColor: 'white',
            padding: '1rem',
            borderRadius: '4px',
            border: '1px solid #ddd'
          }}>
            <code>{formattedJson}</code>
          </pre>
        </div>
      )
    } catch {
      // If JSON parsing fails, show raw content
    }
  }

  // Display Markdown (basic rendering - could use a markdown library)
  if (format === 'md') {
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        overflow: 'auto',
        padding: '2rem',
        backgroundColor: 'white',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '1rem',
        lineHeight: '1.6'
      }}>
        <pre style={{ 
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word'
        }}>
          {fileContent}
        </pre>
      </div>
    )
  }

  // Display CSV/TSV as table
  if (format === 'csv' || format === 'tsv') {
    const delimiter = format === 'tsv' ? '\t' : ','
    const lines = fileContent.split('\n').filter(line => line.trim())
    const rows = lines.map(line => line.split(delimiter))
    
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        overflow: 'auto',
        padding: '1rem',
        backgroundColor: '#f8f9fa'
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          backgroundColor: 'white',
          borderRadius: '4px',
          overflow: 'hidden'
        }}>
          <thead>
            {rows[0] && (
              <tr style={{ backgroundColor: '#f0f0f0' }}>
                {rows[0].map((cell, i) => (
                  <th key={i} style={{ 
                    padding: '0.5rem', 
                    textAlign: 'left', 
                    borderBottom: '2px solid #ddd',
                    fontWeight: 'bold'
                  }}>
                    {cell.trim()}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {rows.slice(1).map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} style={{ 
                    padding: '0.5rem', 
                    borderBottom: '1px solid #eee'
                  }}>
                    {cell.trim()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // Default: display as plain text/code
  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      overflow: 'auto',
      padding: '1rem',
      backgroundColor: '#f8f9fa',
      fontFamily: 'monospace',
      fontSize: '0.9rem',
      lineHeight: '1.5'
    }}>
      <pre style={{ 
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        backgroundColor: 'white',
        padding: '1rem',
        borderRadius: '4px',
        border: '1px solid #ddd'
      }}>
        <code>{fileContent}</code>
      </pre>
    </div>
  )
}

// Component for viewing Office documents using react-office-viewer
// Note: This component is not currently used in Templates.tsx (there's a different OfficeDocumentViewer in DocumentsTab.tsx)
// @ts-expect-error - Component is intentionally unused, kept for future reference
const _OfficeDocumentViewer = ({ 
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
  const [docStyles, setDocStyles] = useState<DocStyles | null>(null)

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
        
        // Load document styles if templateId is provided
        if (templateId && normalizedFileType === 'docx') {
          try {
            const stylesResponse = await api.get(`/templates/${templateId}/styles`)
            setDocStyles(stylesResponse.data)
            console.log('=== LOADED DOCUMENT STYLES ===')
            console.log('Full response:', stylesResponse.data)
            console.log('Paragraph formats:', stylesResponse.data?.paragraph_formats?.length || 0, 'paragraphs')
            console.log('Detailed table styles:', stylesResponse.data?.detailed_table_styles?.length || 0, 'tables')
            console.log('Section properties:', stylesResponse.data?.section_properties?.length || 0, 'sections')
            console.log('Fonts:', stylesResponse.data?.fonts?.length || 0, 'fonts')
            console.log('List styles:', Object.keys(stylesResponse.data?.list_styles || {}).length, 'list styles')
            console.log('Table styles:', stylesResponse.data?.table_styles?.length || 0, 'tables')
            console.log('Page orientations:', stylesResponse.data?.page_orientations?.length || 0, 'sections')
            
            // Log sample data
            if (stylesResponse.data?.paragraph_formats?.length > 0) {
              console.log('Sample paragraph format:', stylesResponse.data.paragraph_formats[0])
            }
            if (stylesResponse.data?.detailed_table_styles?.length > 0) {
              console.log('Sample table style:', stylesResponse.data.detailed_table_styles[0])
            }
            if (stylesResponse.data?.section_properties?.length > 0) {
              console.log('Sample section properties:', stylesResponse.data.section_properties[0])
            }
          } catch (err: any) {
            console.warn('Could not load document styles:', err)
            // Continue without styles
          }
        }
        
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
      setDocStyles(null)
    }
  }, [fileUrl, templateId, normalizedFileType])

  // Inject dynamic fonts CSS from backend styles endpoint
  useEffect(() => {
    if (docStyles?.font_families) {
      // Remove existing style tag if any
      const existingStyle = document.getElementById('docx-dynamic-fonts')
      if (existingStyle) {
        existingStyle.remove()
      }

      // Create new style tag with font mappings from backend
      const style = document.createElement('style')
      style.id = 'docx-dynamic-fonts'
      let css = ''
      
      // Apply font-family mappings from backend response
      // Do not use !important - let docx-preview handle fonts natively
      Object.entries(docStyles.font_families).forEach(([fontName, fontFamily]) => {
        // Map fonts without forcing - only as fallback
        css += `.docx-wrapper [style*="font-family: ${fontName}"], .docx-wrapper [data-font="${fontName}"] { font-family: ${fontFamily}; }\n`
      })
      
      style.textContent = css
      document.head.appendChild(style)
      
      return () => {
        const styleToRemove = document.getElementById('docx-dynamic-fonts')
        if (styleToRemove) {
          styleToRemove.remove()
        }
      }
    }
  }, [docStyles])

  // Render DOCX as continuous surface with fit-to-viewport scaling
  useEffect(() => {
    if (normalizedFileType === 'docx' && fileBlob && docStyles) {
      // Use a small delay to ensure container exists in DOM
      let renderTimeout: NodeJS.Timeout | null = null
      
      renderTimeout = setTimeout(() => {
        const container = document.getElementById('docx-preview-container')
        if (!container) {
          console.error('DOCX preview container not found in DOM')
          setError('Document container not found')
          return
        }
        
        console.log('Found DOCX container:', container)
        console.log('Container dimensions:', container.getBoundingClientRect())
        
        container.innerHTML = '' // Clear previous content
        
        // Render with options to preserve styles from the document
        renderAsync(fileBlob, container, undefined, {
          className: 'docx-wrapper',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false, // Preserve fonts from document
          breakPages: true, // Enable page breaks for visual separation
          ignoreLastRenderedPageBreak: true,
          experimental: false,
          trimXmlDeclaration: true,
          useBase64URL: false,
        })
          .then(() => {
            console.log('DOCX rendered successfully')
            console.log('Applying styles from docStyles:', docStyles)
            
            // Post-render: fit-to-viewport scaling
            const wrapper = container.querySelector('.docx-wrapper') as HTMLElement
            if (wrapper) {
              // Store docStyles reference for later use
              const stylesData = docStyles as DocStyles
              // DIAGNOSTICS: Check all elements and their backgrounds
              console.log('=== DIAGNOSTICS: Checking all elements for background colors ===')
              const allElements = wrapper.querySelectorAll('*')
              const elementsWithNonWhiteBackground: Array<{element: HTMLElement, tag: string, className: string, bgColor: string, computedBg: string}> = []
              
              allElements.forEach((el) => {
                const htmlEl = el as HTMLElement
                const computedStyle = window.getComputedStyle(htmlEl)
                const bgColor = computedStyle.backgroundColor
                const inlineBg = htmlEl.style.backgroundColor
                
                // Check if background is not white/transparent
                if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent' && 
                    bgColor !== 'rgb(255, 255, 255)' && bgColor !== 'white') {
                  elementsWithNonWhiteBackground.push({
                    element: htmlEl,
                    tag: htmlEl.tagName,
                    className: htmlEl.className || '',
                    bgColor: inlineBg || 'none',
                    computedBg: bgColor
                  })
                }
              })
              
              if (elementsWithNonWhiteBackground.length > 0) {
                console.warn(`Found ${elementsWithNonWhiteBackground.length} elements with non-white backgrounds:`)
                elementsWithNonWhiteBackground.forEach((item, idx) => {
                  console.warn(`${idx + 1}. ${item.tag}.${item.className} - Inline: ${item.bgColor}, Computed: ${item.computedBg}`)
                  console.warn('   Element:', item.element)
                })
              } else {
                console.log('✓ All elements have white/transparent backgrounds')
              }
              
              // Check wrapper itself
              const wrapperStyle = window.getComputedStyle(wrapper)
              console.log('Wrapper background:', wrapperStyle.backgroundColor)
              console.log('Wrapper inline style background:', wrapper.style.backgroundColor)
              
              // Check container
              const containerStyle = window.getComputedStyle(container)
              console.log('Container background:', containerStyle.backgroundColor)
              
              // Ensure wrapper is visible
              wrapper.style.display = 'block'
              wrapper.style.visibility = 'visible'
              
              // Wait for layout to settle
              setTimeout(() => {
                // Measure natural document size
                const docRect = wrapper.getBoundingClientRect()
                const containerRect = container.getBoundingClientRect()
                
                console.log('Container dimensions:', {
                  width: containerRect.width,
                  height: containerRect.height,
                  visible: containerRect.width > 0 && containerRect.height > 0
                })
                
                console.log('Document dimensions:', {
                  width: docRect.width,
                  height: docRect.height,
                  visible: docRect.width > 0 && docRect.height > 0
                })
                
                // Get orientation from backend if available (for scaling strategy)
                const orientations = docStyles?.page_orientations || []
                const isLandscape = orientations.length > 0 && orientations[0].orientation === 'landscape'
                
                // Calculate scale to fit viewport
                // Strategy: always fit width, allow vertical scrolling
                let scale = 1
                const padding = 40 // Padding around document
                const availableWidth = containerRect.width - padding
                
                if (docRect.width > 0 && availableWidth > 0) {
                  // Always fit to width - document will scroll vertically
                  scale = availableWidth / docRect.width
                  
                  // Don't scale up (if document is smaller than container)
                  if (scale > 1) {
                    scale = 1
                  }
                  
                  // Apply transform scale
                  wrapper.style.transform = `scale(${scale})`
                  wrapper.style.transformOrigin = 'top center'
                  
                  // Ensure wrapper takes full width after scaling
                  wrapper.style.width = `${docRect.width}px`
                }
                
                // Fix black backgrounds on shapes/canvas elements (selective fix only)
                const canvasElements = wrapper.querySelectorAll('canvas')
                canvasElements.forEach((canvas) => {
                  const canvasEl = canvas as HTMLCanvasElement
                  const bgColor = window.getComputedStyle(canvasEl).backgroundColor
                  if (bgColor === 'rgb(0, 0, 0)' || bgColor === 'black') {
                    canvasEl.style.backgroundColor = 'transparent'
                  }
                })
                
                // Fix black div backgrounds (only for shape elements, not document content)
                wrapper.querySelectorAll('div').forEach((div) => {
                  const divEl = div as HTMLElement
                  if (divEl.classList.contains('docx-wrapper') || divEl.classList.contains('docx-page-separator')) {
                    return // Skip wrapper and separators
                  }
                  
                  const bgColor = window.getComputedStyle(divEl).backgroundColor
                  // Only fix if it's clearly a shape element (has specific dimensions or styles)
                  if ((bgColor === 'rgb(0, 0, 0)' || bgColor === 'black') && 
                      (divEl.style.width || divEl.style.height || divEl.querySelector('canvas'))) {
                    divEl.style.backgroundColor = 'transparent'
                  }
                })
                
                // DIAGNOSTICS: Check for green backgrounds before fixing
                console.log('=== DIAGNOSTICS: Checking for green backgrounds ===')
                const greenElements: Array<{element: HTMLElement, bgColor: string}> = []
                
                wrapper.querySelectorAll('*').forEach((el) => {
                  const htmlEl = el as HTMLElement
                  if (htmlEl.classList.contains('docx-page-separator')) {
                    return // Skip separators
                  }
                  
                  // Skip table headers and cells - preserve their background colors
                  if (htmlEl.tagName === 'TH' || htmlEl.tagName === 'TD' || 
                      htmlEl.tagName === 'THEAD' || htmlEl.closest('thead')) {
                    // Only fix if it's green, otherwise preserve the color
                    const bgColor = window.getComputedStyle(htmlEl).backgroundColor
                    const rgbMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
                    if (rgbMatch) {
                      const r = parseInt(rgbMatch[1])
                      const g = parseInt(rgbMatch[2])
                      const b = parseInt(rgbMatch[3])
                      // Only fix if it's green, otherwise preserve
                      if (!(g > r + 50 && g > b + 50 && g > 100)) {
                        return // Preserve non-green table colors
                      }
                    } else if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent' && 
                               !bgColor.includes('green')) {
                      return // Preserve table colors that aren't green
                    }
                  }
                  
                  const bgColor = window.getComputedStyle(htmlEl).backgroundColor
                  // Check for green colors (rgb values with high green component)
                  const rgbMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
                  if (rgbMatch) {
                    const r = parseInt(rgbMatch[1])
                    const g = parseInt(rgbMatch[2])
                    const b = parseInt(rgbMatch[3])
                    // If green is significantly higher than red and blue, it's likely green
                    if (g > r + 50 && g > b + 50 && g > 100) {
                      greenElements.push({element: htmlEl, bgColor: bgColor})
                      htmlEl.style.backgroundColor = 'white'
                      console.log('🔧 Fixed green background on element:', htmlEl.tagName, htmlEl.className, 'Color was:', bgColor)
                    }
                  }
                  
                  // Also check for common green color names
                  if (bgColor.includes('green') || bgColor === 'rgb(0, 128, 0)' || bgColor === 'rgb(0, 255, 0)') {
                    greenElements.push({element: htmlEl, bgColor: bgColor})
                    htmlEl.style.backgroundColor = 'white'
                    console.log('🔧 Fixed green background (named color) on element:', htmlEl.tagName, htmlEl.className, 'Color was:', bgColor)
                  }
                })
                
                if (greenElements.length === 0) {
                  console.log('✓ No green backgrounds found')
                } else {
                  console.warn(`⚠️ Found and fixed ${greenElements.length} elements with green backgrounds`)
                }
                
                // DIAGNOSTICS: Final check after all fixes
                console.log('=== DIAGNOSTICS: Final background check ===')
                const finalCheck = wrapper.querySelectorAll('*')
                const stillNonWhite: Array<{tag: string, className: string, bgColor: string}> = []
                finalCheck.forEach((el) => {
                  const htmlEl = el as HTMLElement
                  if (htmlEl.classList.contains('docx-page-separator')) return
                  const bgColor = window.getComputedStyle(htmlEl).backgroundColor
                  if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent' && 
                      bgColor !== 'rgb(255, 255, 255)' && bgColor !== 'white') {
                    stillNonWhite.push({
                      tag: htmlEl.tagName,
                      className: htmlEl.className || '',
                      bgColor: bgColor
                    })
                  }
                })
                
                if (stillNonWhite.length > 0) {
                  console.error('❌ Still found non-white backgrounds after fixes:', stillNonWhite)
                } else {
                  console.log('✓ All backgrounds are now white/transparent')
                }
                
                // Always wrap content in white page containers for visual separation
                // Strategy: wrap all content in page containers, even if single page
                const wrapperChildren = Array.from(wrapper.children) as HTMLElement[]
                const docHeight = docRect.height
                const estimatedPageHeight = 1100 // Typical A4 page height in pixels at 96 DPI
                
                console.log('Document height:', docHeight, 'Children count:', wrapperChildren.length)
                
                // ============================================
                // APPLY STYLES FROM BACKEND DATA
                // ============================================
                console.log('🎨 Applying styles from backend data...')
                
                // 1. Apply table cell background colors
                if (stylesData?.detailed_table_styles && stylesData.detailed_table_styles.length > 0) {
                  const allTables = wrapper.querySelectorAll('table')
                  console.log(`   📊 Found ${allTables.length} tables, have ${stylesData.detailed_table_styles.length} table styles`)
                  
                  allTables.forEach((table, tableIdx) => {
                    // Match table with detailed_table_styles by index
                    const tableStyle = stylesData.detailed_table_styles?.find((ts: any) => ts.index === tableIdx) || 
                                      stylesData.detailed_table_styles?.[tableIdx]
                    
                    if (!tableStyle || !tableStyle.rows) {
                      console.log(`   ⚠️ Table ${tableIdx}: No style data available`)
                      return
                    }
                    
                    const rows = table.querySelectorAll('tr')
                    console.log(`   📊 Table ${tableIdx}: Found ${rows.length} rows, have ${tableStyle.rows.length} row styles`)
                    
                    rows.forEach((row, rowIdx) => {
                      const rowStyle = tableStyle.rows[rowIdx]
                      if (!rowStyle || !rowStyle.cells) {
                        console.log(`   ⚠️ Table ${tableIdx}, Row ${rowIdx}: No cell data`)
                        return
                      }
                      
                      const cells = row.querySelectorAll('td, th')
                      console.log(`   📊 Table ${tableIdx}, Row ${rowIdx}: Found ${cells.length} cells, have ${rowStyle.cells.length} cell styles`)
                      
                      cells.forEach((cell, cellIdx) => {
                        const cellStyle = rowStyle.cells[cellIdx]
                        if (cellStyle?.background_color) {
                          const htmlCell = cell as HTMLElement
                          htmlCell.style.setProperty('background-color', cellStyle.background_color, 'important')
                          console.log(`   ✅ Table ${tableIdx}, Row ${rowIdx}, Cell ${cellIdx}: Applied ${cellStyle.background_color}`)
                        }
                      })
                    })
                  })
                }
                
                // 2. Apply paragraph text colors from paragraph_formats
                if (stylesData?.paragraph_formats && stylesData.paragraph_formats.length > 0) {
                  const allParagraphs = wrapper.querySelectorAll('p')
                  console.log(`   📝 Found ${allParagraphs.length} paragraphs, have ${stylesData.paragraph_formats.length} paragraph formats`)
                  
                  stylesData.paragraph_formats.forEach((paraFormat: any, paraIdx: number) => {
                    if (paraFormat.runs && paraFormat.runs.length > 0) {
                      // Find paragraph by index (approximate matching)
                      const paragraph = allParagraphs[paraIdx]
                      if (paragraph) {
                        const runs = paragraph.querySelectorAll('span, font, r')
                        paraFormat.runs.forEach((run: any, runIdx: number) => {
                          const runElement = runs[runIdx] as HTMLElement
                          if (runElement && run.color) {
                            runElement.style.setProperty('color', run.color, 'important')
                            console.log(`   ✅ Paragraph ${paraIdx}, Run ${runIdx}: color ${run.color}`)
                          }
                        })
                      }
                    }
                  })
                }
                
                // 3. Apply list styles (bullets, indentation)
                if (stylesData?.list_styles && Object.keys(stylesData.list_styles).length > 0) {
                  const allLists = wrapper.querySelectorAll('ul, ol')
                  console.log(`   📋 Found ${allLists.length} lists, have ${Object.keys(stylesData.list_styles).length} list styles`)
                  
                  // This is more complex - would need to match list items with list levels
                  // For now, just log that we have the data
                  Object.entries(stylesData.list_styles).forEach(([key, listStyle]: [string, any]) => {
                    console.log(`   📋 List style ${key}:`, listStyle)
                  })
                }
                
                console.log('✅ Finished applying styles from backend data')
                
                // Always wrap content in page containers
                if (wrapperChildren.length > 0) {
                  // Find large gaps between elements to detect page breaks
                  const pageBreakPoints: number[] = []
                  
                  // First, try to find explicit page breaks by checking gaps
                  for (let i = 1; i < wrapperChildren.length; i++) {
                    const prevRect = wrapperChildren[i - 1].getBoundingClientRect()
                    const currRect = wrapperChildren[i].getBoundingClientRect()
                    const gap = currRect.top - (prevRect.top + prevRect.height)
                    
                    // Large gap indicates page break
                    if (gap > 100) {
                      pageBreakPoints.push(i)
                    }
                  }
                  
                  // If no gaps found, divide by estimated page height
                  if (pageBreakPoints.length === 0 && docHeight > estimatedPageHeight) {
                    let accumulatedHeight = 0
                    wrapperChildren.forEach((child, idx) => {
                      const rect = child.getBoundingClientRect()
                      accumulatedHeight += rect.height
                      if (accumulatedHeight > estimatedPageHeight && idx < wrapperChildren.length - 1) {
                        pageBreakPoints.push(idx + 1)
                        accumulatedHeight = 0
                      }
                    })
                  }
                  
                  console.log('Page break points:', pageBreakPoints)
                  
                  // Group children into pages
                  const pages: HTMLElement[][] = []
                  let currentPageStart = 0
                  
                  pageBreakPoints.forEach(breakIdx => {
                    if (breakIdx > currentPageStart) {
                      pages.push(wrapperChildren.slice(currentPageStart, breakIdx))
                      currentPageStart = breakIdx
                    }
                  })
                  
                  // Add remaining elements as last page
                  if (currentPageStart < wrapperChildren.length) {
                    pages.push(wrapperChildren.slice(currentPageStart))
                  }
                  
                  // Always wrap in page containers (even if single page)
                  // Create page containers first, then move elements
                  const pageContainers: HTMLDivElement[] = []
                  
                  pages.forEach((_pageContent, pageIdx) => {
                    const pageDiv = document.createElement('div')
                    pageDiv.className = 'docx-page'
                    // Force white background with !important via setProperty
                    pageDiv.style.setProperty('background', 'white', 'important')
                    pageDiv.style.setProperty('background-color', 'white', 'important')
                    pageDiv.style.marginBottom = pageIdx < pages.length - 1 ? '60px' : '0'
                    pageDiv.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)'
                    pageDiv.style.padding = '0'
                    pageDiv.style.position = 'relative'
                    pageDiv.style.width = '100%'
                    pageDiv.style.minHeight = '100px'
                    
                    console.log(`Created page container ${pageIdx + 1} with white background`)
                    
                    // Add visible separator at bottom (except for last page)
                    if (pageIdx < pages.length - 1) {
                      const separator = document.createElement('div')
                      separator.className = 'docx-page-separator'
                      separator.style.position = 'absolute'
                      separator.style.bottom = '-30px'
                      separator.style.left = '0'
                      separator.style.right = '0'
                      separator.style.height = '3px'
                      separator.style.background = '#666'
                      separator.style.borderRadius = '2px'
                      separator.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.3)'
                      separator.style.zIndex = '10'
                      pageDiv.appendChild(separator)
                    }
                    
                    pageContainers.push(pageDiv)
                  })
                  
                  // Now move elements to their respective page containers
                  pages.forEach((pageContent, pageIdx) => {
                    const pageDiv = pageContainers[pageIdx]
                    pageContent.forEach(item => {
                      // Move element directly (don't clone - preserves all properties, canvas, etc.)
                      pageDiv.insertBefore(item, pageDiv.lastElementChild) // Insert before separator if exists
                    })
                    wrapper.appendChild(pageDiv)
                  })
                  
                  // After moving, ensure white backgrounds (styles already applied before wrapping)
                  setTimeout(() => {
                    wrapper.querySelectorAll('.docx-page').forEach((pageEl) => {
                      const page = pageEl as HTMLElement
                      // Force white on page container itself
                      page.style.setProperty('background', 'white', 'important')
                      page.style.setProperty('background-color', 'white', 'important')
                      
                      // Force white on all elements inside, except tables (which already have colors applied)
                      page.querySelectorAll('*').forEach((el) => {
                        const htmlEl = el as HTMLElement
                        
                        // Skip separators
                        if (htmlEl.classList.contains('docx-page-separator')) return
                        
                        // Skip ALL table elements - preserve their colors (already applied)
                        if (htmlEl.tagName === 'TABLE' || htmlEl.tagName === 'TH' || htmlEl.tagName === 'TD' || 
                            htmlEl.tagName === 'TR' || htmlEl.tagName === 'THEAD' || htmlEl.tagName === 'TBODY' ||
                            htmlEl.closest('table')) {
                          return
                        }
                        
                        // Force white background on everything else
                        htmlEl.style.setProperty('background', 'white', 'important')
                        htmlEl.style.setProperty('background-color', 'white', 'important')
                      })
                    })
                    
                    console.log('✅ Forced white background on non-table elements')
                  }, 50)
                  
                  console.log('Created', pages.length, 'page containers with white backgrounds')
                  
                  // DIAGNOSTICS: Check backgrounds AFTER wrapping in page containers
                  console.log('=== DIAGNOSTICS: Checking backgrounds AFTER page wrapping ===')
                  setTimeout(() => {
                    const allElementsAfterWrap = wrapper.querySelectorAll('*')
                    const nonWhiteAfterWrap: Array<{tag: string, className: string, bgColor: string, inlineBg: string, element: HTMLElement}> = []
                    
                    allElementsAfterWrap.forEach((el) => {
                      const htmlEl = el as HTMLElement
                      if (htmlEl.classList.contains('docx-page-separator')) return
                      
                      // Skip table headers and cells - preserve their colors
                      if (htmlEl.tagName === 'TH' || htmlEl.tagName === 'TD' || htmlEl.closest('thead')) {
                        return
                      }
                      
                      const computedStyle = window.getComputedStyle(htmlEl)
                      const bgColor = computedStyle.backgroundColor
                      const inlineBg = htmlEl.style.backgroundColor || htmlEl.style.background || ''
                      
                      // Check for any non-white/transparent background
                      if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent' && 
                          bgColor !== 'rgb(255, 255, 255)' && bgColor !== 'white') {
                        nonWhiteAfterWrap.push({
                          tag: htmlEl.tagName,
                          className: htmlEl.className || '',
                          bgColor: bgColor,
                          inlineBg: inlineBg,
                          element: htmlEl
                        })
                      }
                    })
                    
                    if (nonWhiteAfterWrap.length > 0) {
                      console.error('❌ Found non-white backgrounds AFTER wrapping:', nonWhiteAfterWrap.length)
                      nonWhiteAfterWrap.forEach((item, idx) => {
                        console.error(`${idx + 1}. ${item.tag}.${item.className} - Computed: ${item.bgColor}, Inline: ${item.inlineBg}`)
                        console.error('   Element:', item.element)
                        console.error('   Full inline style:', item.element.style.cssText)
                        
                        // Force white background (but preserve table colors)
                        if (item.tag !== 'TH' && item.tag !== 'TD' && !item.element.closest('thead')) {
                          item.element.style.backgroundColor = 'white'
                          item.element.style.background = 'white'
                          console.log('   🔧 Fixed to white')
                        }
                      })
                    } else {
                      console.log('✓ All backgrounds are white/transparent after wrapping')
                    }
                    
                    // Check page containers themselves
                    const pageContainers = wrapper.querySelectorAll('.docx-page')
                    console.log(`Found ${pageContainers.length} page containers`)
                    pageContainers.forEach((page, idx) => {
                      const pageEl = page as HTMLElement
                      const computedStyle = window.getComputedStyle(pageEl)
                      const bgColor = computedStyle.backgroundColor
                      const inlineBg = pageEl.style.backgroundColor || pageEl.style.background
                      console.log(`Page ${idx + 1}:`, {
                        computed: bgColor,
                        inline: inlineBg,
                        width: computedStyle.width,
                        height: computedStyle.height,
                        element: pageEl
                      })
                      
                      // Force white if not white
                      if (bgColor !== 'rgb(255, 255, 255)' && bgColor !== 'white') {
                        pageEl.style.setProperty('background', 'white', 'important')
                        pageEl.style.setProperty('background-color', 'white', 'important')
                        console.log(`   🔧 Fixed page ${idx + 1} background to white (was: ${bgColor})`)
                      }
                    })
                    
                    // Final fix: ONLY fix green backgrounds, preserve all other colors
                    console.log('=== FINAL FIX: Only fix green backgrounds, preserve other colors ===')
                    wrapper.querySelectorAll('*').forEach((el) => {
                      const htmlEl = el as HTMLElement
                      if (htmlEl.classList.contains('docx-page-separator')) return
                      
                      // NEVER touch table elements - preserve their colors
                      if (htmlEl.tagName === 'TH' || htmlEl.tagName === 'TD' || 
                          htmlEl.tagName === 'THEAD' || htmlEl.tagName === 'TBODY' ||
                          htmlEl.tagName === 'TR' || htmlEl.tagName === 'TABLE' ||
                          htmlEl.closest('table')) {
                        return // Preserve all table colors
                      }
                      
                      const computedStyle = window.getComputedStyle(htmlEl)
                      const bgColor = computedStyle.backgroundColor
                      
                      // ONLY fix if it's green - preserve all other colors
                      const rgbMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
                      if (rgbMatch) {
                        const r = parseInt(rgbMatch[1])
                        const g = parseInt(rgbMatch[2])
                        const b = parseInt(rgbMatch[3])
                        // Only fix if green is significantly higher (it's actually green)
                        if (g > r + 50 && g > b + 50 && g > 100) {
                          htmlEl.style.setProperty('background-color', 'white', 'important')
                          htmlEl.style.setProperty('background', 'white', 'important')
                          console.log(`🔧 Fixed green background on ${htmlEl.tagName}.${htmlEl.className} (was: ${bgColor})`)
                        }
                      } else if (bgColor.includes('green')) {
                        htmlEl.style.setProperty('background-color', 'white', 'important')
                        htmlEl.style.setProperty('background', 'white', 'important')
                        console.log(`🔧 Fixed green background (named) on ${htmlEl.tagName}.${htmlEl.className} (was: ${bgColor})`)
                      }
                      // Otherwise, preserve the color - don't touch it!
                    })
                  }, 100)
                } else {
                  // No children - ensure wrapper has white background
                  wrapper.style.background = 'white'
                  wrapper.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)'
                }
                
                console.log('DOCX fit-to-viewport complete', {
                  scale,
                  docSize: { width: docRect.width, height: docRect.height },
                  containerSize: { width: containerRect.width, height: containerRect.height },
                  orientation: isLandscape ? 'landscape' : 'portrait'
                })
              }, 200) // Increased delay to ensure layout is complete
            } else {
              console.error('DOCX wrapper not found after render')
            }
          })
          .catch((err) => {
            console.error('Error rendering DOCX:', err)
            setError(`Failed to render DOCX: ${err.message}`)
          })
      }, 100) // Small delay to ensure container is in DOM
      
      return () => {
        if (renderTimeout) {
          clearTimeout(renderTimeout)
        }
      }
    }
  }, [normalizedFileType, fileBlob, docStyles])

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
  // TODO: PDF fallback for documents with complex graphics (gradients, shapes)
  // When backend endpoint /templates/{id}/pdf is available, detect complex graphics
  // and use PDF preview for better visual fidelity
  if (normalizedFileType === 'docx' && fileBlob) {
    return (
      <div 
        id="docx-preview-container"
        className="docx-preview-wrapper"
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
  const [pdfExists, setPdfExists] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null) // For document versions
  const [availableVersions, setAvailableVersions] = useState<any[]>([]) // List of document versions
  const [templateDocuments, setTemplateDocuments] = useState<any[]>([]) // Documents using this template
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null) // Selected document
  // const [loadingVersions, setLoadingVersions] = useState(false) // Not used currently
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false)
  const [excelModalTemplateId, setExcelModalTemplateId] = useState<string | null>(null)
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false)
  const [infoModalTemplateId, setInfoModalTemplateId] = useState<string | null>(null)
  const [showDocumentTypeForm, setShowDocumentTypeForm] = useState(false)
  const [documentTypeData, setDocumentTypeData] = useState({
    code: '',
    name: '',
    description: '',
    default_file_extension: 'docx',
    org_specific: false
  })
  const [creatingDocumentType, setCreatingDocumentType] = useState(false)
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
  const [activeVersions, setActiveVersions] = useState<Record<string, string>>({}) // key: doc_type:name, value: template_id
  const [documentTypes, setDocumentTypes] = useState<Array<{code: string, name: string}>>([])

  useEffect(() => {
    loadTemplates()
    loadDocumentTypes()
  }, [])

  const loadDocumentTypes = async () => {
    try {
      const response = await api.get('/document-types')
      // Filter only active document types and map to simple format
      const activeTypes = (response.data || [])
        .filter((dt: any) => dt.is_active !== false)
        .map((dt: any) => ({
          code: dt.code,
          name: dt.name || dt.code
        }))
      setDocumentTypes(activeTypes)
    } catch (err: any) {
      console.error('Error loading document types:', err)
      // Fallback to hardcoded types if API fails
      setDocumentTypes([
        { code: 'PDD', name: 'PDD' },
        { code: 'SDD', name: 'SDD' },
        { code: 'TSS', name: 'TSS' },
        { code: 'TEST_PLAN', name: 'Test Plan' },
        { code: 'RELEASE_NOTES', name: 'Release Notes' }
      ])
    }
  }

  const handleCreateDocumentType = async () => {
    setCreatingDocumentType(true)
    try {
      await api.post('/document-types', documentTypeData)
      alert('Document type created successfully!')
      setShowDocumentTypeForm(false)
      setDocumentTypeData({
        code: '',
        name: '',
        description: '',
        default_file_extension: 'docx',
        org_specific: false
      })
      // Reload document types to show new type in dropdown
      await loadDocumentTypes()
    } catch (err: any) {
      console.error('Error creating document type:', err)
      alert(err.response?.data?.detail || 'Failed to create document type')
    } finally {
      setCreatingDocumentType(false)
    }
  }

  const loadTemplates = () => {
    api
      .get('/templates')
      .then((res) => {
        const templatesList = res.data || []
        setTemplates(templatesList)
        
        // Initialize active versions - if multiple templates with same doc_type:name, 
        // set the latest APPROVED one as active, or latest DRAFT if no approved
        const versionsMap: Record<string, Template> = {}
        templatesList.forEach((template: Template) => {
          const key = `${template.doc_type}:${template.name}`
          if (!versionsMap[key]) {
            versionsMap[key] = template
          } else {
            // Prefer APPROVED over DRAFT, then newer version
            const current = versionsMap[key]
            if (template.status === 'APPROVED' && current.status !== 'APPROVED') {
              versionsMap[key] = template
            } else if (template.status === current.status) {
              // Same status - prefer newer version (higher version number or later date)
              if (new Date(template.created_at) > new Date(current.created_at)) {
                versionsMap[key] = template
              }
            }
          }
        })
        
        // Set active versions
        const activeMap: Record<string, string> = {}
        Object.keys(versionsMap).forEach(key => {
          activeMap[key] = versionsMap[key].id
        })
        setActiveVersions(activeMap)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  const handleSetActiveVersion = (docType: string, name: string, templateId: string) => {
    const key = `${docType}:${name}`
    setActiveVersions(prev => ({
      ...prev,
      [key]: templateId
    }))
  }

  const getActiveVersion = (docType: string, name: string): string | null => {
    const key = `${docType}:${name}`
    return activeVersions[key] || null
  }

  // const getTemplateVersions = (docType: string, name: string): Template[] => {
  //   return templates.filter(t => t.doc_type === docType && t.name === name)
  //     .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  // }

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
      'UML': 'uml',
      'BPMN': 'bpmn',
      'TOGAF': 'xml',
      'ARCHIMATE': 'archimate',
      'VISIO': 'vsdx',
      'DRAWIO': 'drawio',
    }
    return docTypeMap[template.doc_type] || 'docx'
  }

  // const getFileUrl = (template: Template): string => {
  //   return `/api/v1/templates/${template.id}/file`
  // }

  const loadPdfAsBlob = async (templateId: string) => {
    console.log('=== LOADING PDF AS BLOB ===')
    console.log('Template ID:', templateId)
    
    try {
      const token = localStorage.getItem('token')
      const headers: any = {
        'Accept': 'application/pdf'
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
        console.log('✅ Using token for authentication')
      } else {
        console.warn('⚠️ No token found in localStorage')
      }
      
      console.log('📤 Sending GET request to:', `/templates/${templateId}/pdf`)
      const startTime = Date.now()
      
      const response = await api.get(`/templates/${templateId}/pdf`, {
        responseType: 'blob',
        headers
      })
      
      const duration = Date.now() - startTime
      console.log('✅ PDF loaded:', response.status, response.statusText)
      console.log('⏱️ Load took:', duration, 'ms')
      console.log('Response data type:', response.data?.constructor?.name)
      console.log('Response data size:', response.data?.size || 'unknown', 'bytes')
      console.log('Response headers:', response.headers)
      
      const blob = new Blob([response.data], { type: 'application/pdf' })
      console.log('Blob created:', blob.size, 'bytes, type:', blob.type)
      
      const url = URL.createObjectURL(blob)
      console.log('Blob URL created:', url)
      setPdfUrl(url)
      console.log('✅ PDF URL set successfully')
    } catch (err: any) {
      console.error('❌ Failed to load PDF:', err)
      console.error('Error response:', err.response)
      console.error('Error status:', err.response?.status)
      console.error('Error data:', err.response?.data)
      console.error('Error message:', err.message)
      setPdfUrl(null)
    }
  }

  const handleView = async (template: Template) => {
    // Check if this is an Excel file - if so, use canvas modal
    const fileFormat = getFileFormat(template)
    if (fileFormat === 'xlsx' || fileFormat === 'xls') {
      setExcelModalTemplateId(template.id)
      setIsExcelModalOpen(true)
      return
    }
    
                // Files that don't have PDF - show directly (images, XML, text, data)
                const directViewFormats = [
                  'xml', 'bpmn', 'bpmn20', 'bpmn2', 'uml', 'xmi', 'archimate', 'archi',
                  'drawio', 'lucid', 'vsdx', 'vsdm', 'vsd', 'xsd',
                  'svg', 'png', 'jpg', 'jpeg', 'webp',
                  'csv', 'tsv', 'json', 'parquet', 'yaml', 'yml', 'md', 'txt', 'rst'
                ]
                if (fileFormat && directViewFormats.includes(fileFormat.toLowerCase())) {
                  setViewingTemplate(template)
                  setPdfUrl(null)
                  setPdfExists(false)
                  setGeneratingPdf(false)
                  return
                }
    
    // Clean up previous PDF URL
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl)
      setPdfUrl(null)
    }
    
    setViewingTemplate(template)
    setSelectedVersion(null)
    setAvailableVersions([])
    setTemplateDocuments([])
    setSelectedDocument(null)
    setGeneratingPdf(true)
    
    // Check if PDF exists, if not generate it automatically
    console.log('=== CHECKING PDF EXISTENCE ===')
    console.log('Template ID:', template.id)
    
    try {
      console.log('📤 Sending GET request to:', `/templates/${template.id}/pdf/check`)
      const checkResponse = await api.get(`/templates/${template.id}/pdf/check`)
      console.log('✅ PDF check response:', checkResponse.data)
      // Backend returns "exists", not "pdf_exists"
      const pdfExists = checkResponse.data.exists === true
      console.log('PDF exists:', pdfExists)
      console.log('PDF object_key:', checkResponse.data.pdf_object_key)
      
      if (!pdfExists) {
        // PDF doesn't exist, generate it automatically
        console.log('📄 PDF does not exist, generating...')
        try {
          console.log('📤 Sending POST request to:', `/templates/${template.id}/pdf/generate`)
          const generateResponse = await api.post(`/templates/${template.id}/pdf/generate`)
          console.log('✅ PDF generation response:', generateResponse.data)
          setPdfExists(true)
          // Load PDF as blob URL after generation
          await loadPdfAsBlob(template.id)
        } catch (err: any) {
          console.error('❌ Error generating PDF:', err)
          console.error('Error response:', err.response)
          console.error('Error status:', err.response?.status)
          console.error('Error data:', err.response?.data)
          // Even if generation fails, try to show what we have
          setPdfExists(false)
        }
      } else {
        console.log('✅ PDF exists, loading...')
        setPdfExists(true)
        // Load PDF as blob URL
        await loadPdfAsBlob(template.id)
      }
    } catch (err: any) {
      console.error('❌ Error checking PDF:', err)
      console.error('Error response:', err.response)
      console.error('Error status:', err.response?.status)
      console.error('Error data:', err.response?.data)
      // Try to generate PDF anyway
      console.log('🔄 Attempting to generate PDF anyway...')
      try {
        const generateResponse = await api.post(`/templates/${template.id}/pdf/generate`)
        console.log('✅ PDF generation response:', generateResponse.data)
        setPdfExists(true)
        // Load PDF as blob URL after generation
        await loadPdfAsBlob(template.id)
      } catch (genErr: any) {
        console.error('❌ Error generating PDF:', genErr)
        console.error('Error response:', genErr.response)
        console.error('Error status:', genErr.response?.status)
        console.error('Error data:', genErr.response?.data)
        setPdfExists(false)
      }
    } finally {
      setGeneratingPdf(false)
      console.log('=== PDF CHECK/GENERATION FINISHED ===')
    }
    
    // Load documents using this template
    try {
      const docsResponse = await api.get(`/templates/${template.id}/documents`)
      const documents = docsResponse.data || []
      setTemplateDocuments(documents)
      
      // If there are documents, select the first one and load its versions
      if (documents.length > 0) {
        const firstDoc = documents[0]
        setSelectedDocument(firstDoc.id)
        setAvailableVersions(firstDoc.versions || [])
        // Set current version as selected if available
        if (firstDoc.current_version_id) {
          setSelectedVersion(firstDoc.current_version_id)
        } else if (firstDoc.versions && firstDoc.versions.length > 0) {
          setSelectedVersion(firstDoc.versions[0].id)
        }
      }
    } catch (err: any) {
      console.error('Error loading template documents:', err)
      setTemplateDocuments([])
    }
  }

  const handleDocumentChange = (documentId: string) => {
    setSelectedDocument(documentId)
    const document = templateDocuments.find((d: any) => d.id === documentId)
    if (document) {
      setAvailableVersions(document.versions || [])
      // Set current version as selected if available
      if (document.current_version_id) {
        setSelectedVersion(document.current_version_id)
      } else if (document.versions && document.versions.length > 0) {
        setSelectedVersion(document.versions[0].id)
      } else {
        setSelectedVersion(null)
      }
    }
  }

  const handleSetCurrentVersion = async (documentId: string, versionId: string) => {
    try {
      await api.put(`/documents/${documentId}/versions/${versionId}/set-current`)
      setSelectedVersion(versionId)
      // Update the document in templateDocuments to reflect the change
      setTemplateDocuments((prev) =>
        prev.map((doc: any) => {
          if (doc.id === documentId) {
            return { ...doc, current_version_id: versionId }
          }
          return doc
        })
      )
      alert('Active version updated successfully!')
    } catch (err: any) {
      console.error('Error setting current version:', err)
      alert(err.response?.data?.detail || 'Failed to set current version')
    }
  }

  const handleGeneratePdf = async () => {
    if (!viewingTemplate) {
      console.log('❌ handleGeneratePdf: No template selected')
      return
    }
    
    console.log('=== PDF GENERATION STARTED ===')
    console.log('Template ID:', viewingTemplate.id)
    console.log('Template name:', viewingTemplate.name)
    console.log('Template doc_type:', viewingTemplate.doc_type)
    
    setGeneratingPdf(true)
    
    // Clean up old PDF URL if exists
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl)
      setPdfUrl(null)
    }
    setPdfExists(false)
    
    try {
      console.log('📤 Sending POST request to:', `/templates/${viewingTemplate.id}/pdf/generate`)
      const startTime = Date.now()
      
      const response = await api.post(`/templates/${viewingTemplate.id}/pdf/generate`)
      
      const duration = Date.now() - startTime
      console.log('✅ PDF generation response received:', response.status, response.statusText)
      console.log('⏱️ Generation took:', duration, 'ms')
      console.log('Response data:', response.data)
      
      if (response.data) {
        console.log('PDF object_key:', response.data.pdf_object_key)
        console.log('PDF hash:', response.data.pdf_hash)
        console.log('PDF status:', response.data.status)
      }
      
      setPdfExists(true)
      console.log('✅ PDF generation completed successfully')
      
      // Reload PDF
      console.log('🔄 Reloading PDF...')
      await loadPdfAsBlob(viewingTemplate.id)
    } catch (err: any) {
      console.error('❌ Error generating PDF:', err)
      console.error('Error response:', err.response)
      console.error('Error status:', err.response?.status)
      console.error('Error data:', err.response?.data)
      console.error('Error message:', err.message)
      console.error('Full error:', JSON.stringify(err, null, 2))
      alert(err.response?.data?.detail || 'Failed to generate PDF')
      setPdfExists(false)
    } finally {
      setGeneratingPdf(false)
      console.log('=== PDF GENERATION FINISHED ===')
    }
  }

  const handleDownload = async (format: 'docx' | 'pdf') => {
    if (!viewingTemplate) return
    try {
      const endpoint = format === 'pdf' 
        ? `/templates/${viewingTemplate.id}/pdf`
        : `/templates/${viewingTemplate.id}/file`
      
      // Get token from localStorage to ensure it's included
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
      
      // Determine MIME type and file extension based on format
      let mimeType: string
      let fileExtension: string
      
      if (format === 'pdf') {
        mimeType = 'application/pdf'
        fileExtension = 'pdf'
      } else {
        // Get actual file format from template
        const fileFormat = getFileFormat(viewingTemplate) || 'docx'
        fileExtension = fileFormat
        
        // Set appropriate MIME type based on file format
        switch (fileFormat) {
          case 'pptx':
            mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            break
          case 'xlsx':
            mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            break
          case 'docx':
          default:
            mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            break
        }
      }
      
      const blob = new Blob([response.data], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${viewingTemplate.name}_${viewingTemplate.doc_type}.${fileExtension}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('Download error:', err)
      alert(err.response?.data?.detail || 'Failed to download file')
    }
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
            <div className="templates-header-actions" style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowDocumentTypeForm(!showDocumentTypeForm)
                }}
              >
                + New Document Type
              </button>
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
          </div>

          {showDocumentTypeForm && (
            <div className="create-form" style={{ marginBottom: '20px', border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>
              <h3>Create New Document Type</h3>
              <form onSubmit={(e) => {
                e.preventDefault()
                handleCreateDocumentType()
              }}>
                <div className="form-group">
                  <label>Code *</label>
                  <input
                    type="text"
                    value={documentTypeData.code}
                    onChange={(e) => setDocumentTypeData({ ...documentTypeData, code: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
                    placeholder="e.g., CUSTOM_DOC, PRESENTATION"
                    required
                    style={{ padding: '8px', width: '100%' }}
                  />
                  <small style={{ fontSize: '12px', color: '#666' }}>Unique code in UPPERCASE with underscores (e.g., PDD, SDD, CUSTOM_DOC)</small>
                </div>
                <div className="form-group">
                  <label>Name *</label>
                  <input
                    type="text"
                    value={documentTypeData.name}
                    onChange={(e) => setDocumentTypeData({ ...documentTypeData, name: e.target.value })}
                    placeholder="e.g., Custom Document Type"
                    required
                    style={{ padding: '8px', width: '100%' }}
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={documentTypeData.description}
                    onChange={(e) => setDocumentTypeData({ ...documentTypeData, description: e.target.value })}
                    placeholder="Optional description"
                    rows={3}
                    style={{ padding: '8px', width: '100%' }}
                  />
                </div>
                <div className="form-group">
                  <label>Default File Extension *</label>
                  <select
                    value={documentTypeData.default_file_extension}
                    onChange={(e) => setDocumentTypeData({ ...documentTypeData, default_file_extension: e.target.value })}
                    required
                    style={{ padding: '8px', width: '100%' }}
                  >
                    <option value="docx">DOCX (Word Document)</option>
                    <option value="xlsx">XLSX (Excel Spreadsheet)</option>
                    <option value="pptx">PPTX (PowerPoint Presentation)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={documentTypeData.org_specific}
                      onChange={(e) => setDocumentTypeData({ ...documentTypeData, org_specific: e.target.checked })}
                      style={{ marginRight: '8px' }}
                    />
                    Organization-specific (only visible to your organization)
                  </label>
                </div>
                <div className="form-actions" style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowDocumentTypeForm(false)
                      setDocumentTypeData({
                        code: '',
                        name: '',
                        description: '',
                        default_file_extension: 'docx',
                        org_specific: false
                      })
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={creatingDocumentType}
                  >
                    {creatingDocumentType ? 'Creating...' : 'Create Document Type'}
                  </button>
                </div>
              </form>
            </div>
          )}

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
                    {documentTypes.length > 0 ? (
                      documentTypes.map((dt) => (
                        <option key={dt.code} value={dt.code}>
                          {dt.name}
                        </option>
                      ))
                    ) : (
                      // Fallback options if document types haven't loaded yet
                      <>
                        <option value="PDD">PDD</option>
                        <option value="SDD">SDD</option>
                        <option value="TSS">TSS</option>
                        <option value="TEST_PLAN">Test Plan</option>
                        <option value="RELEASE_NOTES">Release Notes</option>
                      </>
                    )}
                  </select>
                </div>
                <div className="form-group">
                  <label>Template File {editingTemplate && '(Optional - upload new file to replace existing)'}</label>
                  <input
                    type="file"
                    accept=".docx,.doc,.xlsx,.xls,.pptx,.ppt,.xml,.bpmn,.bpmn20.xml,.bpmn2,.uml,.xmi,.archimate,.archi,.vsdx,.vsdm,.vsd,.drawio,.lucid,.svg,.png,.jpg,.jpeg,.webp,.csv,.tsv,.json,.parquet,.yaml,.yml,.md,.txt,.rst,.xsd"
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
                    <th>Active Version</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Group templates by doc_type:name and show one row per group
                    const grouped = templates.reduce((acc: Record<string, Template[]>, template) => {
                      const key = `${template.doc_type}:${template.name}`
                      if (!acc[key]) {
                        acc[key] = []
                      }
                      acc[key].push(template)
                      return acc
                    }, {})
                    
                    return Object.keys(grouped).map((key) => {
                      const groupTemplates = grouped[key].sort((a, b) => 
                        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                      )
                      const activeTemplateId = getActiveVersion(groupTemplates[0].doc_type, groupTemplates[0].name)
                      const activeTemplate = groupTemplates.find(t => t.id === activeTemplateId) || groupTemplates[0]
                      
                      return (
                        <tr key={key}>
                          <td>{activeTemplate.name}</td>
                          <td>
                            <span className="badge">{activeTemplate.doc_type}</span>
                          </td>
                          <td>
                            <select
                              value={activeTemplate.id}
                              onChange={(e) => handleSetActiveVersion(
                                activeTemplate.doc_type,
                                activeTemplate.name,
                                e.target.value
                              )}
                              className="version-select"
                              style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                border: '1px solid #ddd',
                                fontSize: '14px'
                              }}
                            >
                              {groupTemplates.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.version} ({t.status})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <span className="badge badge-info" style={{ fontSize: '12px' }}>
                              {activeTemplate.version}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                activeTemplate.status === 'APPROVED' ? 'badge-success' : 'badge-warning'
                              }`}
                            >
                              {activeTemplate.status}
                            </span>
                          </td>
                          <td>{new Date(activeTemplate.created_at).toLocaleDateString()}</td>
                          <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="btn btn-sm btn-info"
                            onClick={() => {
                              setInfoModalTemplateId(activeTemplate.id)
                              setIsInfoModalOpen(true)
                            }}
                            title="View template information"
                          >
                            Info
                          </button>
                          <button
                            className="btn btn-sm btn-info"
                            onClick={() => handleView(activeTemplate)}
                          >
                            View
                          </button>
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => {
                                  setEditingTemplate(activeTemplate)
                                  setFormData({
                                    doc_type: activeTemplate.doc_type,
                                    name: activeTemplate.name,
                                    version: activeTemplate.version,
                                    object_key: activeTemplate.object_key,
                                    file_hash: activeTemplate.file_hash,
                                    mapping_manifest_json: activeTemplate.mapping_manifest_json,
                                  })
                                  setShowCreateForm(false)
                                }}
                              >
                                Update
                              </button>
                              {activeTemplate.status !== 'APPROVED' && (
                                <button
                                  className="btn btn-sm btn-primary"
                                  onClick={() => handleApprove(activeTemplate.id)}
                                >
                                  Approve
                                </button>
                              )}
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={() => handleDelete(activeTemplate.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Layout>

      {/* Template Viewer Modal */}
      {viewingTemplate && (
        <div 
          className="template-viewer-modal"
          onClick={() => {
            setViewingTemplate(null)
            setPdfExists(false)
          }}
        >
          <div 
            className="template-viewer-content"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="template-viewer-header">
              <div style={{ flex: 1 }}>
                <h2>{viewingTemplate.name}</h2>
                {templateDocuments.length > 0 && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '0.9rem', color: '#666' }}>Document:</label>
                    <select
                      value={selectedDocument || ''}
                      onChange={(e) => handleDocumentChange(e.target.value)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        border: '1px solid #ddd',
                        fontSize: '0.9rem',
                        minWidth: '200px'
                      }}
                    >
                      {templateDocuments.map((doc: any) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.title} ({doc.doc_type})
                        </option>
                      ))}
                    </select>
                    {availableVersions.length > 0 && (
                      <>
                        <label style={{ fontSize: '0.9rem', color: '#666', marginLeft: '0.5rem' }}>Version:</label>
                        <select
                          value={selectedVersion || ''}
                          onChange={(e) => {
                            setSelectedVersion(e.target.value)
                          }}
                          style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            border: '1px solid #ddd',
                            fontSize: '0.9rem'
                          }}
                        >
                          {availableVersions.map((version: any) => {
                            const currentDoc = templateDocuments.find((d: any) => d.id === selectedDocument)
                            const isCurrent = currentDoc?.current_version_id === version.id
                            return (
                              <option key={version.id} value={version.id}>
                                {version.version_string} ({version.state}){isCurrent ? ' [Current]' : ''}
                              </option>
                            )
                          })}
                        </select>
                        {selectedVersion && selectedDocument && (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => {
                              handleSetCurrentVersion(selectedDocument, selectedVersion)
                            }}
                            disabled={templateDocuments.find((d: any) => d.id === selectedDocument)?.current_version_id === selectedVersion}
                            style={{ fontSize: '0.85rem', padding: '0.25rem 0.75rem' }}
                          >
                            Set as Active
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              <button
                className="template-viewer-close"
                onClick={() => {
                  // Clean up blob URL
                  if (pdfUrl) {
                    URL.revokeObjectURL(pdfUrl)
                  }
                  setViewingTemplate(null)
                  setPdfExists(false)
                  setPdfUrl(null)
                  setSelectedVersion(null)
                  setAvailableVersions([])
                  setTemplateDocuments([])
                  setSelectedDocument(null)
                  setGeneratingPdf(false)
                }}
              >
                ×
              </button>
            </div>

            {/* Document viewer */}
            <div className="template-viewer-body">
              {(() => {
                const fileFormat = viewingTemplate ? getFileFormat(viewingTemplate) : null
                const xmlFormats = ['xml', 'bpmn', 'bpmn2', 'uml', 'xmi']
                const isXmlFile = fileFormat && xmlFormats.includes(fileFormat.toLowerCase())
                
                // For files that don't need PDF (images, XML, text, data), show directly
                if (isXmlFile && viewingTemplate) {
                  return <FileViewer templateId={viewingTemplate.id} fileFormat={fileFormat} />
                }
                
                // For other files, show PDF preview
                if (generatingPdf) {
                  return (
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                      <div className="loading">Generating PDF...</div>
                      <p style={{ marginTop: '1rem', color: '#666' }}>Please wait while we create the PDF version.</p>
                    </div>
                  )
                } else if (pdfExists && pdfUrl) {
                  return (
                    <iframe
                      src={pdfUrl}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      title="PDF Preview"
                    />
                  )
                } else {
                  return (
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                      <div style={{ color: '#e74c3c', marginBottom: '1rem' }}>
                        <strong>Error:</strong> Could not generate PDF.
                      </div>
                      <p style={{ color: '#666', marginBottom: '1rem' }}>
                        PDF generation requires LibreOffice to be installed on the server.
                      </p>
                      <p style={{ color: '#666', fontSize: '0.9rem' }}>
                        To install LibreOffice on macOS: <code>brew install --cask libreoffice</code>
                      </p>
                      <p style={{ color: '#666', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                        After installation, restart the backend server and try again.
                      </p>
                    </div>
                  )
                }
              })()}
            </div>

            {/* Footer */}
            <div className="template-viewer-footer">
              {viewingTemplate && (() => {
                const fileFormat = getFileFormat(viewingTemplate)
                const formatUpper = fileFormat ? fileFormat.toUpperCase() : 'DOCX'
                const buttonLabel = `📥 Download ${formatUpper}`
                return (
                  <button
                    onClick={() => handleDownload('docx')}
                    className="btn btn-secondary"
                  >
                    {buttonLabel}
                  </button>
                )
              })()}
              {pdfExists && (
                <>
                  <button
                    onClick={() => handleDownload('pdf')}
                    className="btn btn-primary"
                  >
                    📥 Download PDF
                  </button>
                  <button
                    onClick={handleGeneratePdf}
                    className="btn btn-secondary"
                    disabled={generatingPdf}
                    style={{ marginLeft: '0.5rem' }}
                    title="Re-generate PDF (useful if DOCX was updated)"
                  >
                    {generatingPdf ? '⏳ Regenerating...' : '🔄 Re-generate PDF'}
                  </button>
                </>
              )}
              {!pdfExists && (
                <button
                  onClick={handleGeneratePdf}
                  className="btn btn-primary"
                  disabled={generatingPdf}
                  style={{ marginLeft: '0.5rem' }}
                >
                  {generatingPdf ? '⏳ Generating...' : '🔄 Generate PDF'}
                </button>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => {
                  // Clean up blob URL
                  if (pdfUrl) {
                    URL.revokeObjectURL(pdfUrl)
                  }
                  setViewingTemplate(null)
                  setPdfExists(false)
                  setPdfUrl(null)
                  setSelectedVersion(null)
                  setAvailableVersions([])
                  setTemplateDocuments([])
                  setSelectedDocument(null)
                  setGeneratingPdf(false)
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Canvas Modal */}
      {excelModalTemplateId && (
        <ExcelCanvasModal
          templateId={excelModalTemplateId}
          isOpen={isExcelModalOpen}
          onClose={() => {
            setIsExcelModalOpen(false)
            setExcelModalTemplateId(null)
          }}
        />
      )}

      {/* Template Info Modal */}
      {infoModalTemplateId && (
        <TemplateInfoModal
          templateId={infoModalTemplateId}
          isOpen={isInfoModalOpen}
          onClose={() => {
            setIsInfoModalOpen(false)
            setInfoModalTemplateId(null)
          }}
        />
      )}
    </>
  )
}

export default Templates
