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
         const [docStyles, setDocStyles] = useState<{
           fonts: string[]
           font_families: Record<string, string>
           styles: Record<string, any>
           default_fonts: Record<string, string>
           list_styles?: Record<string, any>
           table_styles?: Array<{
             index: number
             rows: Array<{
               index: number
               cells: Array<{
                 index: number
                 background_color: string | null
                 shading: string | null
               }>
             }>
           }>
           page_orientations?: Array<{
             section_index: number
             orientation: 'portrait' | 'landscape'
             width_px: number
             height_px: number
             width_cm: number
             height_cm: number
             left_margin_cm: number
             right_margin_cm: number
             top_margin_cm: number
             bottom_margin_cm: number
             orientation_attribute: string | null
           }>
         } | null>(null)

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

    const loadDocStyles = async () => {
      if (normalizedFileType === 'docx' && templateId) {
        try {
          const response = await api.get(`/templates/${templateId}/styles`)
          setDocStyles(response.data)
          console.log('Loaded DOCX styles:', response.data)
          if (response.data.list_styles) {
            console.log('List styles from document:', JSON.stringify(response.data.list_styles, null, 2))
          }
        } catch (err) {
          console.error('Error loading DOCX styles:', err)
        }
      }
    }

    loadFile()
    loadDocStyles()

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
            
            // Apply styles with retry mechanism - docx-preview renders tables asynchronously
            const applyStyles = (attempt: number = 0) => {
              const wrapper = container.querySelector('.docx-wrapper')
              if (!wrapper) {
                if (attempt < 20) {
                  setTimeout(() => applyStyles(attempt + 1), 100)
                }
                return
              }
              
              console.log(`DOCX wrapper found (attempt ${attempt}), applying styles...`)
              const wrapperEl = wrapper as HTMLElement
              wrapperEl.style.backgroundColor = 'white'
              wrapperEl.style.background = 'white'
              
              // Apply page orientations from backend data
              // Use page_orientations from docStyles if available, otherwise detect from dimensions
              const pageElements = wrapper.querySelectorAll('section, div[class*="page"], div[style*="page"]')
              
              if (docStyles?.page_orientations && docStyles.page_orientations.length > 0) {
                // Use orientation data from backend
                const pageOrientations = docStyles.page_orientations
                console.log(`Applying page orientations from backend: ${pageOrientations.length} sections`)
                
                pageElements.forEach((pageEl: Element, index: number) => {
                  const htmlPage = pageEl as HTMLElement
                  
                  // Find matching section (docx-preview may create pages in order)
                  let pageOrientation = null
                  if (index < pageOrientations.length) {
                    pageOrientation = pageOrientations[index]
                  } else {
                    // Fallback: use last orientation
                    pageOrientation = pageOrientations[pageOrientations.length - 1]
                  }
                  
                  if (pageOrientation) {
                    const orientation = pageOrientation.orientation
                    const widthPx = pageOrientation.width_px
                    const heightPx = pageOrientation.height_px
                    
                    // Convert margins from cm to px (1 cm = 37.8 px at 96 DPI)
                    const leftMarginPx = Math.round(pageOrientation.left_margin_cm * 37.8)
                    const rightMarginPx = Math.round(pageOrientation.right_margin_cm * 37.8)
                    const topMarginPx = Math.round(pageOrientation.top_margin_cm * 37.8)
                    const bottomMarginPx = Math.round(pageOrientation.bottom_margin_cm * 37.8)
                    
                    htmlPage.setAttribute('data-orientation', orientation)
                    htmlPage.setAttribute('data-section-index', pageOrientation.section_index.toString())
                    htmlPage.style.width = `${widthPx}px`
                    htmlPage.style.minHeight = `${heightPx}px`
                    htmlPage.style.maxWidth = `${widthPx}px`
                    
                    // Apply margins from document as padding
                    htmlPage.style.paddingTop = `${topMarginPx}px`
                    htmlPage.style.paddingRight = `${rightMarginPx}px`
                    htmlPage.style.paddingBottom = `${bottomMarginPx}px`
                    htmlPage.style.paddingLeft = `${leftMarginPx}px`
                    
                    console.log(`Applied ${orientation} orientation to page ${index}: ${widthPx}x${heightPx}px, margins: ${topMarginPx}/${rightMarginPx}/${bottomMarginPx}/${leftMarginPx}px`)
                  }
                  
                  // Ensure page styling
                  htmlPage.style.margin = '0 auto 20px auto'
                  htmlPage.style.backgroundColor = 'white'
                  htmlPage.style.background = 'white'
                  htmlPage.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.1)'
                  htmlPage.style.pageBreakAfter = 'always'
                  htmlPage.style.boxSizing = 'border-box'
                })
              } else {
                // Fallback: detect orientation from dimensions
                console.log('No page orientation data from backend, detecting from dimensions')
                pageElements.forEach((pageEl: Element) => {
                  const htmlPage = pageEl as HTMLElement
                  const computedStyle = window.getComputedStyle(htmlPage)
                  const width = parseFloat(computedStyle.width)
                  const height = parseFloat(computedStyle.height)
                  
                  // A4 dimensions at 96dpi:
                  // Portrait: ~794px x 1123px
                  // Landscape: ~1123px x 794px
                  if (width > 0 && height > 0) {
                    if (width > height || (width > 1000 && height < 900)) {
                      // Landscape orientation
                      htmlPage.setAttribute('data-orientation', 'landscape')
                      htmlPage.style.width = '1123px'
                      htmlPage.style.minHeight = '794px'
                      htmlPage.style.maxWidth = '1123px'
                      console.log(`Detected landscape page: ${width}x${height}`)
                    } else {
                      // Portrait orientation (default)
                      htmlPage.setAttribute('data-orientation', 'portrait')
                      htmlPage.style.width = '794px'
                      htmlPage.style.minHeight = '1123px'
                      htmlPage.style.maxWidth = '794px'
                    }
                    
                    // Ensure page styling (fallback margins if no backend data)
                    htmlPage.style.margin = '0 auto 20px auto'
                    htmlPage.style.padding = '40px' // Default padding if no margin data
                    htmlPage.style.backgroundColor = 'white'
                    htmlPage.style.background = 'white'
                    htmlPage.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.1)'
                    htmlPage.style.pageBreakAfter = 'always'
                    htmlPage.style.boxSizing = 'border-box'
                  }
                })
              }
              
              // Also check for pages by checking for page-break styles
              const allDivs = wrapper.querySelectorAll('div')
              allDivs.forEach((div: Element) => {
                const htmlDiv = div as HTMLElement
                const computedStyle = window.getComputedStyle(htmlDiv)
                const pageBreak = computedStyle.pageBreakAfter || computedStyle.breakAfter
                const width = parseFloat(computedStyle.width)
                const height = parseFloat(computedStyle.height)
                
                // If it has page-break and significant dimensions, it's likely a page
                if ((pageBreak === 'always' || pageBreak === 'page') && width > 700 && height > 700) {
                  if (width > height) {
                    htmlDiv.setAttribute('data-orientation', 'landscape')
                    htmlDiv.style.width = '1123px'
                    htmlDiv.style.minHeight = '794px'
                    htmlDiv.style.maxWidth = '1123px'
                  } else {
                    htmlDiv.setAttribute('data-orientation', 'portrait')
                    htmlDiv.style.width = '794px'
                    htmlDiv.style.minHeight = '1123px'
                    htmlDiv.style.maxWidth = '794px'
                  }
                  
                  htmlDiv.style.margin = '0 auto 20px auto'
                  htmlDiv.style.padding = '40px'
                  htmlDiv.style.backgroundColor = 'white'
                  htmlDiv.style.background = 'white'
                  htmlDiv.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.1)'
                }
              })
              
              // FIRST: Systematically fix ALL black/transparent backgrounds on non-table elements
              // Check every element and fix black/transparent backgrounds
              const allElements = wrapper.querySelectorAll('*')
              allElements.forEach((el: Element) => {
                const htmlEl = el as HTMLElement
                const tagName = el.tagName.toLowerCase()
                
                // Skip table cells - we'll handle them separately
                if (tagName === 'td' || tagName === 'th' || tagName === 'tr' || tagName === 'table') {
                  return
                }
                
                // Get both inline and computed styles
                const inlineBg = htmlEl.style.backgroundColor || htmlEl.style.background
                const computedStyle = window.getComputedStyle(htmlEl)
                const computedBg = computedStyle.backgroundColor
                const computedBgFull = computedStyle.background
                
                // Check if background is black (any variation)
                const isBlack = 
                  inlineBg === 'black' || inlineBg === 'rgb(0, 0, 0)' || inlineBg === '#000' || inlineBg === '#000000' ||
                  computedBg === 'rgb(0, 0, 0)' || computedBg === 'black' || computedBg === '#000' || computedBg === '#000000' ||
                  computedBg.startsWith('rgba(0, 0, 0,') || computedBg.startsWith('rgb(0, 0, 0)') ||
                  computedBgFull.includes('rgb(0, 0, 0)') || computedBgFull.includes('black') ||
                  computedBgFull.includes('rgba(0, 0, 0')
                
                // Check if background is transparent or no-fill
                const isTransparent = 
                  inlineBg === 'transparent' || inlineBg === 'rgba(0, 0, 0, 0)' ||
                  computedBg === 'transparent' || computedBg === 'rgba(0, 0, 0, 0)' ||
                  computedBg.startsWith('rgba') && computedBg.includes(', 0)') ||
                  computedBg === 'initial' || computedBg === 'inherit' ||
                  !computedBg || computedBg === 'none'
                
                // If black or transparent, force white
                if (isBlack || isTransparent) {
                  htmlEl.style.setProperty('background-color', 'white', 'important')
                  htmlEl.style.setProperty('background', 'white', 'important')
                  htmlEl.setAttribute('data-bg-fixed', 'true') // Mark as fixed
                }
                
                // For SVG elements, also fix fill
                if (tagName === 'svg' || htmlEl.closest('svg')) {
                  const svgEl = el as unknown as SVGElement
                  const fillAttr = svgEl.getAttribute ? svgEl.getAttribute('fill') : null
                  const fillStyle = computedStyle.fill
                  
                  // If fill is black, transparent, none, or not set, make it white
                  if (!fillAttr || fillAttr === 'black' || fillAttr === 'rgb(0, 0, 0)' || 
                      fillAttr === 'transparent' || fillAttr === 'none' || fillAttr === 'rgba(0, 0, 0, 0)' ||
                      fillStyle === 'black' || fillStyle === 'rgb(0, 0, 0)' || 
                      fillStyle === 'transparent' || fillStyle === 'none' || 
                      fillStyle === 'rgba(0, 0, 0, 0)' || !fillStyle || fillStyle === 'initial') {
                    if (svgEl.setAttribute) {
                      svgEl.setAttribute('fill', 'white')
                    }
                    htmlEl.style.setProperty('fill', 'white', 'important')
                  }
                }
              })
              
              // SECOND: Apply table styles from document (AFTER fixing black backgrounds)
              if (docStyles?.table_styles && docStyles.table_styles.length > 0) {
                const allTables = container.querySelectorAll('table')
                console.log(`Found ${allTables.length} tables in container (need ${docStyles.table_styles.length})`)
                
                if (allTables.length >= docStyles.table_styles.length) {
                  // All tables rendered, apply colors with !important to override any CSS
                  docStyles.table_styles.forEach((tableStyle: any) => {
                    if (allTables[tableStyle.index]) {
                      const table = allTables[tableStyle.index] as HTMLTableElement
                      tableStyle.rows.forEach((rowStyle: any) => {
                        const rows = table.querySelectorAll('tr')
                        if (rows[rowStyle.index]) {
                          const row = rows[rowStyle.index] as HTMLTableRowElement
                          rowStyle.cells.forEach((cellStyle: any) => {
                            const cells = row.querySelectorAll('td, th')
                            if (cells[cellStyle.index] && cellStyle.background_color) {
                              const cell = cells[cellStyle.index] as HTMLTableCellElement
                              // Use setProperty with !important to ensure it's not overridden
                              cell.style.setProperty('background-color', cellStyle.background_color, 'important')
                              cell.style.setProperty('background', cellStyle.background_color, 'important')
                              cell.setAttribute('data-doc-color', cellStyle.background_color)
                              console.log(`✓ Applied ${cellStyle.background_color} to table[${tableStyle.index}] row[${rowStyle.index}] cell[${cellStyle.index}]`)
                            }
                          })
                        }
                      })
                    }
                  })
                  
                  // THIRD: Fix black/transparent/no-fill backgrounds in table cells that don't have document colors
                  allTables.forEach((table: HTMLTableElement) => {
                    const cells = table.querySelectorAll('td, th')
                    cells.forEach((cell: Element) => {
                      const htmlCell = cell as HTMLTableCellElement
                      // Skip cells that have document colors - they're already set correctly
                      if (htmlCell.getAttribute('data-doc-color')) {
                        return
                      }
                      
                      // Force white background for cells without document colors
                      const computedBg = window.getComputedStyle(htmlCell).backgroundColor
                      if (computedBg === 'rgb(0, 0, 0)' || computedBg === 'black' || 
                          computedBg === 'transparent' || computedBg === 'rgba(0, 0, 0, 0)' ||
                          computedBg.startsWith('rgba(0, 0, 0,')) {
                        htmlCell.style.setProperty('background-color', 'white', 'important')
                        htmlCell.style.setProperty('background', 'white', 'important')
                      }
                    })
                  })
                } else if (attempt < 20) {
                  // Tables not ready, retry
                  setTimeout(() => applyStyles(attempt + 1), 300)
                  return
                }
              }
              
              // FOURTH: Additional pass - check for any remaining black backgrounds (shapes, divs, etc.)
              // This catches elements that might have been missed or rendered later
              const shapesAndDivs = wrapper.querySelectorAll('div, span, p, section, article, figure, aside')
              shapesAndDivs.forEach((shapeEl: Element) => {
                const htmlShape = shapeEl as HTMLElement
                
                // Skip if already fixed
                if (htmlShape.getAttribute('data-bg-fixed')) {
                  return
                }
                
                const computedStyle = window.getComputedStyle(htmlShape)
                const bgColor = computedStyle.backgroundColor
                const bgFull = computedStyle.background
                const width = parseFloat(computedStyle.width)
                const height = parseFloat(computedStyle.height)
                
                // Check if black or transparent
                const isBlack = bgColor === 'rgb(0, 0, 0)' || bgColor === 'black' || 
                               bgColor === '#000' || bgColor === '#000000' ||
                               bgFull.includes('rgb(0, 0, 0)') || bgFull.includes('black')
                const isTransparent = bgColor === 'transparent' || bgColor === 'rgba(0, 0, 0, 0)' ||
                                     !bgColor || bgColor === 'none'
                
                // If element has dimensions and black/transparent background, fix it
                if ((width > 0 || height > 0) && (isBlack || isTransparent)) {
                  htmlShape.style.setProperty('background-color', 'white', 'important')
                  htmlShape.style.setProperty('background', 'white', 'important')
                  htmlShape.setAttribute('data-bg-fixed', 'true')
                }
              })
              
              // FIFTH: Final pass - check ALL elements one more time for any black backgrounds
              const finalCheck = wrapper.querySelectorAll('*')
              finalCheck.forEach((el: Element) => {
                const htmlEl = el as HTMLElement
                
                // Skip if already fixed or is a table element
                if (htmlEl.getAttribute('data-bg-fixed') || 
                    htmlEl.getAttribute('data-doc-color') ||
                    ['td', 'th', 'tr', 'table'].includes(el.tagName.toLowerCase())) {
                  return
                }
                
                const computedBg = window.getComputedStyle(htmlEl).backgroundColor
                
                // Final check for black backgrounds
                if (computedBg === 'rgb(0, 0, 0)' || computedBg === 'black' || 
                    computedBg === '#000' || computedBg === '#000000' ||
                    computedBg.startsWith('rgba(0, 0, 0,')) {
                  htmlEl.style.setProperty('background-color', 'white', 'important')
                  htmlEl.style.setProperty('background', 'white', 'important')
                  htmlEl.setAttribute('data-bg-fixed', 'true')
                }
              })
              
              // Fix bullet points and apply indentation
              const listItems = wrapper.querySelectorAll('li')
              listItems.forEach((li: Element) => {
                const htmlLi = li as HTMLElement
                const parent = li.parentElement
                if (!parent) return
                
                htmlLi.style.display = 'list-item'
                htmlLi.style.listStylePosition = 'outside'
                
                let level = 0
                let listStyle: any = null
                
                if (parent.tagName.toLowerCase() === 'ul') {
                  let currentParent: Element | null = parent
                  while (currentParent && currentParent.tagName.toLowerCase() === 'ul') {
                    level++
                    const nextParent: Element | null = currentParent.parentElement
                    if (nextParent) {
                      const grandParent: Element | null = nextParent.parentElement
                      if (grandParent && grandParent.tagName.toLowerCase() === 'ul') {
                        currentParent = grandParent
                      } else break
                    } else break
                  }
                  
                  const listStyleKey = `list_level_${level}`
                  listStyle = docStyles?.list_styles?.[listStyleKey]
                  
                  // Log list style info for debugging bullet symbols
                  if (listStyle) {
                    console.log(`📋 List style for level ${level}:`, {
                      number_format: listStyle.number_format,
                      bullet_char: listStyle.bullet_char,
                      bullet_text: listStyle.bullet_text,
                      bullet_font: listStyle.bullet_font,
                      bullet_image_id: listStyle.bullet_image_id,
                    })
                    
                    // Log character codes if available
                    if (listStyle.bullet_char || listStyle.bullet_text) {
                      const bulletStr = String(listStyle.bullet_char || listStyle.bullet_text)
                      console.log(`  📌 Bullet string: "${bulletStr}"`)
                      const charCodes: string[] = []
                      for (let i = 0; i < bulletStr.length; i++) {
                        const c = bulletStr[i]
                        const code = c.charCodeAt(0)
                        charCodes.push(`${c} (U+${code.toString(16).toUpperCase().padStart(4, '0')})`)
                      }
                      console.log(`  📌 Character codes:`, charCodes)
                    }
                  } else {
                    console.log(`⚠️ No list style found for level ${level}`)
                  }
                  
                  // Determine bullet character from document
                  let bulletChar = '•'
                  let bulletFont: string | null = null
                  
                  // Map Symbol/Wingdings font characters to Unicode equivalents
                  // In Symbol/Wingdings fonts, the same character code represents different symbols
                  const mapFontSymbolToUnicode = (char: string, font: string | null | undefined): string => {
                    if (!char) return '•'
                    
                    const charCode = char.charCodeAt(0)
                    
                    // Private Use Area characters (U+F000-U+FFFF) - common in Word documents
                    // These are font-specific symbols that need to be mapped
                    if (charCode >= 0xF000 && charCode <= 0xFFFF) {
                      // U+F0B7 (61623) - common bullet in Symbol/Wingdings
                      if (charCode === 0xF0B7) return '•' // bullet
                      // U+F0A7 (61607) - small bullet/square
                      if (charCode === 0xF0A7) return '▪' // black small square
                      // U+F0B6 (61622) - paragraph symbol
                      if (charCode === 0xF0B6) return '¶'
                      // U+F0A8 (61608) - small circle
                      if (charCode === 0xF0A8) return '○'
                      // Default for Private Use Area: try to map based on font
                      if (font) {
                        if (font.toLowerCase().includes('symbol') || font.toLowerCase().includes('wingdings')) {
                          // Most Private Use Area bullets in Symbol/Wingdings are bullets
                          return '•'
                        }
                      }
                      // Fallback for unknown Private Use Area
                      return '•'
                    }
                    
                    // Symbol font mapping (common bullet characters)
                    if (font && font.toLowerCase().includes('symbol')) {
                      // Symbol font uses different mappings
                      // U+00B7 (middle dot) in Symbol = bullet
                      // U+2022 (bullet) in Symbol = filled circle
                      if (charCode === 0x00B7 || charCode === 0x2022) return '•' // U+2022 bullet
                      if (charCode === 0x25CF) return '●' // black circle
                      if (charCode === 0x25CB) return '○' // white circle
                      if (charCode === 0x25A0) return '■' // black square
                      if (charCode === 0x25A1) return '□' // white square
                    }
                    
                    // Wingdings font mapping
                    if (font && font.toLowerCase().includes('wingdings')) {
                      // Common Wingdings bullet characters
                      if (charCode === 0x00A7 || charCode === 0x2022) return '•' // bullet
                      if (charCode === 0x25CF) return '●' // black circle
                      if (charCode === 0x25CB) return '○' // white circle
                      if (charCode === 0x25A0) return '■' // black square
                      if (charCode === 0x25A1) return '□' // white square
                      if (charCode === 0x25AA) return '▪' // black small square
                      if (charCode === 0x25AB) return '▫' // white small square
                      if (charCode === 0x25B6) return '▶' // black right-pointing triangle
                      if (charCode === 0x25C0) return '◀' // black left-pointing triangle
                      if (charCode === 0x25B2) return '▲' // black up-pointing triangle
                      if (charCode === 0x25BC) return '▼' // black down-pointing triangle
                      if (charCode === 0x2713) return '✓' // check mark
                      if (charCode === 0x2714) return '✔' // heavy check mark
                      if (charCode === 0x2715) return '✕' // multiplication x
                      if (charCode === 0x2716) return '✖' // heavy multiplication x
                    }
                    
                    // If character is already a valid Unicode bullet, use it
                    const unicodeBullets = ['•', '◦', '▪', '▫', '○', '●', '■', '□', '▶', '◀', '▲', '▼', '✓', '✔', '✕', '✖', 'o', 'O']
                    if (unicodeBullets.includes(char)) return char
                    
                    // If it's a regular letter (like 'o'), check if it should be a bullet
                    if (char.length === 1 && /[a-zA-Z]/.test(char)) {
                      // In some fonts, 'o' is used as a bullet
                      if (char.toLowerCase() === 'o' && font && (font.toLowerCase().includes('symbol') || font.toLowerCase().includes('wingdings'))) {
                        return '○' // white circle
                      }
                      return char
                    }
                    
                    // Default: return the character as-is
                    return char || '•'
                  }
                  
                  // First, check if document specifies the actual bullet text/character
                  if (listStyle?.bullet_char || listStyle?.bullet_text) {
                    const docBullet = listStyle.bullet_char || listStyle.bullet_text
                    const docFont = listStyle.bullet_font
                    
                    // DOCX may use placeholders like %1, %2, but also actual Unicode characters
                    // Remove placeholders and get the actual symbol
                    let cleanBullet = docBullet.replace(/%\d+/g, '').trim()
                    
                    if (cleanBullet) {
                      // Map font-specific symbols to Unicode
                      bulletChar = mapFontSymbolToUnicode(cleanBullet, docFont)
                      bulletFont = docFont || null
                      console.log(`✓ Using document bullet: "${bulletChar}" (from "${cleanBullet}" in font "${docFont || 'default'}") for level ${level}`)
                    } else {
                      console.log(`⚠ Bullet text "${docBullet}" contains only placeholders, using fallback`)
                    }
                  } else if (listStyle?.number_format) {
                    // Map Word number formats to bullet characters
                    const formatMap: Record<string, string> = {
                      'bullet': '•',
                      'decimal': '1.',
                      'lowerLetter': 'a.',
                      'upperLetter': 'A.',
                      'lowerRoman': 'i.',
                      'upperRoman': 'I.',
                      'none': '',
                    }
                    bulletChar = formatMap[listStyle.number_format] || '•'
                    console.log(`Using format-based bullet: "${bulletChar}" (format: ${listStyle.number_format}) for level ${level}`)
                  } else {
                    // Fallback to level-based bullets
                    bulletChar = level === 0 ? '•' : level === 1 ? '○' : '▪'
                    console.log(`Using fallback bullet: "${bulletChar}" for level ${level} (no document style found)`)
                  }
                  
                  const children = Array.from(li.children)
                  let foundBullet = false
                  
                  // More aggressive detection of empty rectangles/bullet placeholders
                  children.forEach((child: Element) => {
                    const childEl = child as HTMLElement
                    const text = childEl.textContent?.trim() || ''
                    const innerHTML = childEl.innerHTML?.trim() || ''
                    const computedStyle = window.getComputedStyle(childEl)
                    const hasBorder = computedStyle.borderWidth !== '0px' && computedStyle.borderWidth !== '0'
                    const width = parseFloat(computedStyle.width)
                    const height = parseFloat(computedStyle.height)
                    const isSmallRect = (width > 0 && width <= 30) || (height > 0 && height <= 30)
                    const tagName = childEl.tagName.toLowerCase()
                    const charCode = text.length === 1 ? text.charCodeAt(0) : 0
                    
                    // Check for Private Use Area characters (U+F000-U+FFFF) - these are bullet placeholders
                    const isPrivateUseChar = charCode >= 0xF000 && charCode <= 0xFFFF
                    
                    // Check for empty elements, rectangles, or placeholder bullets
                    const isEmpty = text === '' && innerHTML === ''
                    const isPlaceholder = text === '□' || text === '▪' || text === '▫' || text === '▭' || text === '▬'
                    const hasRectangularStyle = hasBorder || isSmallRect || 
                                               (width > 0 && height > 0 && Math.abs(width - height) < 5)
                    
                    // Check if element looks like a bullet placeholder
                    if ((isEmpty || isPlaceholder || isPrivateUseChar) && (hasRectangularStyle || tagName === 'span' || tagName === 'div' || tagName === 'p')) {
                      childEl.textContent = bulletChar + ' '
                      childEl.style.display = 'inline'
                      childEl.style.width = 'auto'
                      childEl.style.height = 'auto'
                      childEl.style.border = 'none'
                      childEl.style.backgroundColor = 'transparent'
                      childEl.style.marginRight = '0.25em'
                      childEl.style.color = 'inherit'
                      childEl.style.fontSize = 'inherit'
                      childEl.style.lineHeight = 'inherit'
                      childEl.style.verticalAlign = 'baseline'
                      if (bulletFont) {
                        childEl.style.fontFamily = bulletFont
                        console.log(`  Applied font "${bulletFont}" to bullet element`)
                      }
                      foundBullet = true
                      console.log(`  ✓ Replaced ${isPrivateUseChar ? 'Private Use Area char' : isEmpty ? 'empty rectangle' : 'placeholder'} with bullet "${bulletChar}"`)
                    } else if (text === '•' || text === '○' || text === '▪' || text === '▫' || 
                              text === bulletChar || text.trim() === bulletChar.trim() ||
                              isPrivateUseChar) {
                      // Update existing bullet to use correct character and font
                      // Also handle Private Use Area characters
                      if (text !== bulletChar && !isPrivateUseChar) {
                        childEl.textContent = bulletChar + ' '
                      } else if (isPrivateUseChar) {
                        // Replace Private Use Area character with mapped bullet
                        childEl.textContent = bulletChar + ' '
                        console.log(`  ✓ Replaced Private Use Area char (U+${charCode.toString(16).toUpperCase()}) with "${bulletChar}"`)
                      }
                      if (bulletFont) {
                        childEl.style.fontFamily = bulletFont
                        console.log(`  Updated existing bullet to "${bulletChar}" with font "${bulletFont}"`)
                      }
                      foundBullet = true
                    }
                  })
                  
                  // Also check the li itself for empty content that might be a bullet placeholder
                  const liText = htmlLi.textContent?.trim() || ''
                  if (!foundBullet && (liText === '' || liText === '□' || liText === '▪' || liText === '▫')) {
                    // The entire li is empty or just a placeholder
                    foundBullet = true // Mark as found so we don't add another bullet
                  }
                  
                  if (!foundBullet && li.textContent?.trim()) {
                    const bulletSpan = document.createElement('span')
                    bulletSpan.textContent = bulletChar + ' '
                    bulletSpan.style.marginRight = '0.25em'
                    bulletSpan.style.display = 'inline'
                    bulletSpan.style.color = 'inherit'
                    if (bulletFont) {
                      bulletSpan.style.fontFamily = bulletFont
                      console.log(`  Created bullet span with font "${bulletFont}"`)
                    }
                    if (li.firstChild) li.insertBefore(bulletSpan, li.firstChild)
                    else li.appendChild(bulletSpan)
                    console.log(`✓ Added bullet "${bulletChar}" to list item at level ${level}`)
                  }
                  
                  htmlLi.style.listStyleType = level === 0 ? 'disc' : level === 1 ? 'circle' : 'square'
                } else if (parent.tagName.toLowerCase() === 'ol') {
                  htmlLi.style.listStyleType = 'decimal'
                  htmlLi.style.listStylePosition = 'outside'
                }
                
                // Apply indentation from document if available
                // Word indentation model:
                // - left_indent: total indent from left margin (where text starts)
                // - hanging_indent: how much first line goes back (where bullet is)
                // - Bullet position = left_indent - hanging_indent
                // - Text starts at = left_indent
                if (listStyle) {
                  // Convert points to pixels (1 pt = 1.33 px at 96 DPI, more precisely 96/72 = 1.333...)
                  const leftIndentPx = listStyle.left_indent_pt !== null && listStyle.left_indent_pt !== undefined
                    ? Math.round(listStyle.left_indent_pt * (96 / 72))
                    : null
                  const hangingIndentPx = listStyle.hanging_indent_pt !== null && listStyle.hanging_indent_pt !== undefined
                    ? Math.round(listStyle.hanging_indent_pt * (96 / 72))
                    : null
                  const firstLineIndentPx = listStyle.first_line_indent_pt !== null && listStyle.first_line_indent_pt !== undefined
                    ? Math.round(listStyle.first_line_indent_pt * (96 / 72))
                    : null
                  
                  // Apply indentation to parent ul/ol (where the list container starts)
                  if (parent.tagName.toLowerCase() === 'ul' || parent.tagName.toLowerCase() === 'ol') {
                    const parentEl = parent as HTMLElement
                    
                    if (leftIndentPx !== null && hangingIndentPx !== null) {
                      // Bullet position = left_indent - hanging_indent
                      // This is the base padding for the list container
                      const bulletPositionPx = leftIndentPx - hangingIndentPx
                      parentEl.style.paddingLeft = `${bulletPositionPx}px`
                      parentEl.style.marginLeft = '0'
                      parentEl.style.paddingRight = '0'
                      console.log(`✓ Applied base indent to ${parent.tagName}: ${bulletPositionPx}px (bullet position, level ${level})`)
                    } else if (leftIndentPx !== null) {
                      parentEl.style.paddingLeft = `${leftIndentPx}px`
                      parentEl.style.marginLeft = '0'
                      console.log(`✓ Applied left indent to ${parent.tagName}: ${leftIndentPx}px (level ${level})`)
                    }
                  }
                  
                  // Apply hanging indent to list items
                  // In Word: text starts at left_indent, first line goes back by hanging_indent
                  // In CSS: paddingLeft = hanging_indent, textIndent = -hanging_indent
                  if (hangingIndentPx !== null && leftIndentPx !== null) {
                    // The li needs padding for the hanging indent space
                    // textIndent makes the first line go back
                    htmlLi.style.paddingLeft = `${hangingIndentPx}px`
                    htmlLi.style.textIndent = `-${hangingIndentPx}px`
                    htmlLi.style.marginLeft = '0'
                    htmlLi.style.marginRight = '0'
                    console.log(`✓ Applied hanging indent to li: paddingLeft=${hangingIndentPx}px, textIndent=-${hangingIndentPx}px (level ${level})`)
                  } else if (leftIndentPx !== null) {
                    // Just left indent, no hanging
                    htmlLi.style.paddingLeft = `${leftIndentPx}px`
                    htmlLi.style.textIndent = '0'
                    htmlLi.style.marginLeft = '0'
                    console.log(`✓ Applied left indent to li: ${leftIndentPx}px (level ${level})`)
                  }
                  
                  // Apply first line indent (positive first line indent) - only if no hanging indent
                  if (firstLineIndentPx !== null && hangingIndentPx === null) {
                    htmlLi.style.textIndent = `${firstLineIndentPx}px`
                    if (leftIndentPx !== null) {
                      htmlLi.style.paddingLeft = `${leftIndentPx}px`
                    }
                    console.log(`✓ Applied first line indent: ${firstLineIndentPx}px (level ${level})`)
                  }
                } else {
                  // Fallback: use default padding if no document indentation
                  if (!htmlLi.style.paddingLeft || htmlLi.style.paddingLeft === '0px') {
                    htmlLi.style.paddingLeft = '0.5em'
                  }
                }
              })
              
              console.log('DOCX styles applied from document')
            }
            
            // Start applying with multiple retries
            applyStyles(0)
            setTimeout(() => applyStyles(5), 500)
            setTimeout(() => applyStyles(10), 1000)
            setTimeout(() => applyStyles(15), 2000)
          })
          .catch((err) => {
            console.error('Error rendering DOCX:', err)
            setError(`Failed to render DOCX: ${err.message}`)
          })
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

  const handleEdit = (template: Template) => {
    setEditingTemplate(template)
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
