import { EXPORT_FORMATS, MIME_TYPES, STANDARD_FONTS, CONFIG } from '../../constants.js'

export class PdfExporter {
  constructor(state, pdfService) {
    this.state = state
    this.pdfService = pdfService
  }

  async exportToPdf(options = {}) {
    const {
      compress = true,
      flatten = false,
      pdfA = false,
      pageRange = 'all',
      includeObjects = true
    } = options

    try {
      const pdfDoc = await PDFLib.PDFDocument.load(await this.pdfService.pdflib.save())
      const pages = pdfDoc.getPages()

      const fontCache = new Map()

      if (includeObjects) {
        for (const obj of this.state.objects) {
          const pageIndex = obj.page - 1
          if (pageIndex < 0 || pageIndex >= pages.length) continue

          const page = pages[pageIndex]
          const pageSize = this.state.document.pageSizes[pageIndex]

          await this.drawObjectToPdf(pdfDoc, page, obj, pageSize, fontCache)
        }
      }

      for (let i = 0; i < pages.length; i++) {
        const bgColor = this.state.document.backgrounds.get(i)
        if (bgColor) {
          const page = pages[i]
          const { width, height } = page.getSize()
          const color = this.hexToRgb(bgColor)
          
          page.drawRectangle({
            x: 0,
            y: 0,
            width,
            height,
            color: PDFLib.rgb(color.r, color.g, color.b),
            opacity: 1,
            borderWidth: 0
          })
        }
      }

      if (this.state.document.metadata) {
        const meta = this.state.document.metadata
        pdfDoc.setTitle(meta.title || this.state.document.name)
        pdfDoc.setAuthor(meta.author || '')
        pdfDoc.setSubject(meta.subject || '')
        pdfDoc.setKeywords(meta.keywords || [])
        pdfDoc.setProducer(CONFIG.APP_NAME)
        pdfDoc.setCreator(CONFIG.APP_NAME)
        pdfDoc.setCreationDate(new Date())
        pdfDoc.setModificationDate(new Date())
      }

      let pdfBytes
      if (compress) {
        pdfBytes = await pdfDoc.save({ useObjectStreams: true })
      } else {
        pdfBytes = await pdfDoc.save()
      }

      return new Blob([pdfBytes], { type: MIME_TYPES.PDF })
    } catch (error) {
      console.error('Failed to export PDF:', error)
      throw error
    }
  }

  async drawObjectToPdf(pdfDoc, page, obj, pageSize, fontCache) {
    const { width: pageWidth, height: pageHeight } = pageSize

    switch (obj.type) {
      case 'text':
        await this.drawTextObject(pdfDoc, page, obj, pageHeight, fontCache)
        break
      
      case 'rect':
        this.drawRectObject(page, obj, pageHeight)
        break
      
      case 'oval':
        this.drawOvalObject(page, obj, pageHeight)
        break
      
      case 'line':
        this.drawLineObject(page, obj, pageHeight)
        break
      
      case 'path':
        this.drawPathObject(page, obj, pageHeight)
        break
      
      case 'image':
        await this.drawImageObject(pdfDoc, page, obj, pageHeight)
        break
      
      case 'highlight':
        this.drawHighlightObject(page, obj, pageHeight)
        break
    }
  }

  async drawTextObject(pdfDoc, page, obj, pageHeight, fontCache) {
    let font
    const fontKey = `${obj.font || 'Helvetica'}_${obj.bold ? 'bold' : ''}${obj.italic ? 'italic' : ''}`

    if (fontCache.has(fontKey)) {
      font = fontCache.get(fontKey)
    } else {
      const standardFont = this.getStandardFont(obj.font, obj.bold, obj.italic)
      font = await pdfDoc.embedFont(standardFont)
      fontCache.set(fontKey, font)
    }

    const color = this.hexToRgb(obj.color || '#000000')
    const y = pageHeight - obj.y

    if (obj.highlight) {
      const textWidth = font.widthOfTextAtSize(obj.text, obj.size)
      const textHeight = font.heightAtSize(obj.size)
      
      page.drawRectangle({
        x: obj.x,
        y: y - textHeight,
        width: textWidth,
        height: textHeight,
        color: PDFLib.rgb(1, 1, 0),
        opacity: 0.4,
        borderWidth: 0
      })
    }

    page.drawText(obj.text, {
      x: obj.x,
      y: y,
      size: obj.size,
      font: font,
      color: PDFLib.rgb(color.r, color.g, color.b)
    })

    if (obj.underline) {
      const textWidth = font.widthOfTextAtSize(obj.text, obj.size)
      page.drawLine({
        start: { x: obj.x, y: y - 2 },
        end: { x: obj.x + textWidth, y: y - 2 },
        thickness: 1,
        color: PDFLib.rgb(color.r, color.g, color.b)
      })
    }

    if (obj.strikethrough) {
      const textWidth = font.widthOfTextAtSize(obj.text, obj.size)
      const textHeight = font.heightAtSize(obj.size)
      page.drawLine({
        start: { x: obj.x, y: y + textHeight / 2 },
        end: { x: obj.x + textWidth, y: y + textHeight / 2 },
        thickness: 1,
        color: PDFLib.rgb(color.r, color.g, color.b)
      })
    }
  }

  drawRectObject(page, obj, pageHeight) {
    const y = pageHeight - obj.y - obj.height
    const fill = obj.fill && obj.fill !== 'transparent' ? this.hexToRgb(obj.fill) : null
    const stroke = obj.stroke && obj.stroke !== 'transparent' ? this.hexToRgb(obj.stroke) : null

    page.drawRectangle({
      x: obj.x,
      y: y,
      width: obj.width,
      height: obj.height,
      color: fill ? PDFLib.rgb(fill.r, fill.g, fill.b) : undefined,
      borderColor: stroke ? PDFLib.rgb(stroke.r, stroke.g, stroke.b) : undefined,
      borderWidth: stroke ? (obj.strokeWidth || 2) : 0,
      opacity: obj.opacity || 1
    })
  }

  drawOvalObject(page, obj, pageHeight) {
    const y = pageHeight - obj.y - obj.height / 2
    const fill = obj.fill && obj.fill !== 'transparent' ? this.hexToRgb(obj.fill) : null
    const stroke = obj.stroke && obj.stroke !== 'transparent' ? this.hexToRgb(obj.stroke) : null

    page.drawEllipse({
      x: obj.x + obj.width / 2,
      y: y,
      xScale: Math.abs(obj.width / 2),
      yScale: Math.abs(obj.height / 2),
      color: fill ? PDFLib.rgb(fill.r, fill.g, fill.b) : undefined,
      borderColor: stroke ? PDFLib.rgb(stroke.r, stroke.g, stroke.b) : undefined,
      borderWidth: stroke ? (obj.strokeWidth || 2) : 0,
      opacity: obj.opacity || 1
    })
  }

  drawLineObject(page, obj, pageHeight) {
    const y1 = pageHeight - obj.y
    const y2 = pageHeight - (obj.y + obj.height)
    const color = this.hexToRgb(obj.stroke || '#000000')

    page.drawLine({
      start: { x: obj.x, y: y1 },
      end: { x: obj.x + obj.width, y: y2 },
      thickness: obj.strokeWidth || 2,
      color: PDFLib.rgb(color.r, color.g, color.b),
      opacity: obj.opacity || 1
    })
  }

  drawPathObject(page, obj, pageHeight) {
    if (!obj.points || obj.points.length < 2) return

    const color = this.hexToRgb(obj.color || '#000000')

    for (let i = 1; i < obj.points.length; i++) {
      const p1 = obj.points[i - 1]
      const p2 = obj.points[i]
      
      page.drawLine({
        start: { x: p1.x, y: pageHeight - p1.y },
        end: { x: p2.x, y: pageHeight - p2.y },
        thickness: obj.size || 2,
        color: PDFLib.rgb(color.r, color.g, color.b),
        opacity: obj.opacity || 1
      })
    }
  }

  async drawImageObject(pdfDoc, page, obj, pageHeight) {
    if (!obj.data) return

    try {
      let embeddedImage
      
      if (obj.format === 'png' || obj.data.startsWith('data:image/png')) {
        embeddedImage = await pdfDoc.embedPng(obj.data)
      } else {
        embeddedImage = await pdfDoc.embedJpg(obj.data)
      }

      const y = pageHeight - obj.y - obj.height

      page.drawImage(embeddedImage, {
        x: obj.x,
        y: y,
        width: obj.width,
        height: obj.height,
        opacity: obj.opacity || 1
      })
    } catch (error) {
      console.error('Failed to draw image:', error)
    }
  }

  drawHighlightObject(page, obj, pageHeight) {
    const y = pageHeight - obj.y - obj.height
    const color = this.hexToRgb(obj.color || '#FFFF00')

    page.drawRectangle({
      x: obj.x,
      y: y,
      width: obj.width,
      height: obj.height,
      color: PDFLib.rgb(color.r, color.g, color.b),
      opacity: obj.opacity || 0.4,
      borderWidth: 0
    })
  }

  async exportToImages(format = 'png', quality = 0.92, dpi = 300) {
    const images = []
    const scale = dpi / 72

    for (let i = 1; i <= this.state.document.pages; i++) {
      try {
        const page = await this.pdfService.pdfjs.getPage(i)
        const canvas = document.createElement('canvas')
        const viewport = page.getViewport({ scale })

        canvas.width = viewport.width
        canvas.height = viewport.height

        const ctx = canvas.getContext('2d')
        await page.render({
          canvasContext: ctx,
          viewport: viewport
        }).promise

        const blob = await new Promise(resolve => {
          canvas.toBlob(resolve, `image/${format}`, quality)
        })

        images.push({
          page: i,
          blob,
          name: `${this.state.document.name.replace('.pdf', '')}_page_${i}.${format}`
        })
      } catch (error) {
        console.error(`Failed to export page ${i}:`, error)
      }
    }

    return images
  }

  async exportToSvg() {
    const svgs = []

    for (let i = 1; i <= this.state.document.pages; i++) {
      try {
        const page = await this.pdfService.pdfjs.getPage(i)
        const viewport = page.getViewport({ scale: 1 })

        const svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs)
        const svg = await svgGfx.getSVG(page, viewport)

        const serializer = new XMLSerializer()
        const svgString = serializer.serializeToString(svg)

        svgs.push({
          page: i,
          svg: svgString,
          name: `${this.state.document.name.replace('.pdf', '')}_page_${i}.svg`
        })
      } catch (error) {
        console.error(`Failed to export SVG for page ${i}:`, error)
      }
    }

    return svgs
  }

  async exportToHtml() {
    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${this.state.document.name}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .page { page-break-after: always; margin-bottom: 40px; }
    h1 { color: #333; }
  </style>
</head>
<body>
  <h1>${this.state.document.name}</h1>
`

    for (let i = 1; i <= this.state.document.pages; i++) {
      try {
        const textContent = await this.pdfService.extractText(i)
        
        html += `  <div class="page">\n`
        html += `    <h2>Page ${i}</h2>\n`
        
        for (const item of textContent) {
          html += `    <p>${this.escapeHtml(item.text)}</p>\n`
        }
        
        html += `  </div>\n`
      } catch (error) {
        console.error(`Failed to extract text from page ${i}:`, error)
      }
    }

    html += `</body>\n</html>`

    return new Blob([html], { type: MIME_TYPES.HTML })
  }

  getStandardFont(fontFamily, bold, italic) {
    const family = fontFamily || 'Helvetica'
    
    if (bold && italic) {
      return PDFLib.StandardFonts[`${family}BoldOblique`] || PDFLib.StandardFonts.HelveticaBoldOblique
    } else if (bold) {
      return PDFLib.StandardFonts[`${family}Bold`] || PDFLib.StandardFonts.HelveticaBold
    } else if (italic) {
      return PDFLib.StandardFonts[`${family}Oblique`] || PDFLib.StandardFonts.HelveticaOblique
    }
    
    return PDFLib.StandardFonts[family] || PDFLib.StandardFonts.Helvetica
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255
    } : { r: 0, g: 0, b: 0 }
  }

  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  async downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}