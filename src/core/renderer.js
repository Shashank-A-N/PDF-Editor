import { CONFIG, EVENTS, CURSORS, TRANSFORM_HANDLES } from '../constants.js'
import { clamp } from '../utils/misc.js'

export class Renderer {
  constructor(state, elements, eventBus) {
    this.state = state
    this.els = elements
    this.eventBus = eventBus
    this.pdfService = null
    this.renderQueue = []
    this.isRendering = false
    this.thumbnailCache = new Map()
    this.objectCache = new Map()
  }
  
  bindPdfService(pdfService) {
    this.pdfService = pdfService
  }
  
  init() {
    this.resize()
    this.setupCanvasContexts()
  }
  
  setupCanvasContexts() {
    const ctxOptions = {
      alpha: true,
      desynchronized: true,
      willReadFrequently: false
    }
    
    this.pdfCtx = this.els.pdfCanvas.getContext('2d', ctxOptions)
    this.objectsCtx = this.els.objectsCanvas.getContext('2d', ctxOptions)
    this.annotationCtx = this.els.annotationCanvas.getContext('2d', ctxOptions)
  }
  
  resize() {
    const pageIndex = this.state.view.page - 1
    if (!this.pdfService?.pdfjs || pageIndex < 0 || pageIndex >= this.state.document.pages) {
      return
    }
    
    const pageSize = this.state.document.pageSizes[pageIndex]
    if (!pageSize) return
    
    const zoom = this.state.view.zoom
    const rotation = this.state.view.rotation
    
    let width = pageSize.width
    let height = pageSize.height
    
    if (rotation === 90 || rotation === 270) {
      [width, height] = [height, width]
    }
    
    this.state.canvas.cssWidth = Math.floor(width * zoom)
    this.state.canvas.cssHeight = Math.floor(height * zoom)
    
    const ratio = this.state.canvas.ratio
    this.state.canvas.width = Math.floor(this.state.canvas.cssWidth * ratio)
    this.state.canvas.height = Math.floor(this.state.canvas.cssHeight * ratio)
    
    this.els.canvasWrapper.style.width = this.state.canvas.cssWidth + 'px'
    this.els.canvasWrapper.style.height = this.state.canvas.cssHeight + 'px'
    
    ;[this.els.pdfCanvas, this.els.objectsCanvas, this.els.annotationCanvas].forEach(canvas => {
      canvas.width = this.state.canvas.width
      canvas.height = this.state.canvas.height
      canvas.style.width = this.state.canvas.cssWidth + 'px'
      canvas.style.height = this.state.canvas.cssHeight + 'px'
    })
    
    if (this.state.view.rulers) {
      this.drawRulers()
    }
  }
  
  async render() {
    if (!this.pdfService?.pdfjs || this.state.flags.rendering) {
      return
    }
    
    this.state.flags.rendering = true
    const startTime = performance.now()
    
    try {
      await this.renderPdf()
      this.renderObjects()
      this.renderAnnotations()
      this.renderSelection()
      
      const renderTime = performance.now() - startTime
      this.updatePerformanceMetrics(renderTime)
      
      if (this.eventBus) {
        this.eventBus.emit(EVENTS.RENDER_REQUESTED, { renderTime })
      }
    } catch (error) {
      console.error('Render error:', error)
      if (this.eventBus) {
        this.eventBus.emit(EVENTS.ERROR, { message: 'Render failed', error })
      }
    } finally {
      this.state.flags.rendering = false
    }
  }
  
  async renderPdf() {
    const page = await this.pdfService.pdfjs.getPage(this.state.view.page)
    const viewport = page.getViewport({
      scale: this.state.view.zoom,
      rotation: this.state.view.rotation
    })
    
    this.pdfCtx.save()
    this.pdfCtx.setTransform(this.state.canvas.ratio, 0, 0, this.state.canvas.ratio, 0, 0)
    this.pdfCtx.clearRect(0, 0, this.state.canvas.cssWidth, this.state.canvas.cssHeight)
    
    const bgIndex = this.state.view.page - 1
    const bgColor = this.state.document.backgrounds.get(bgIndex)
    if (bgColor) {
      this.pdfCtx.fillStyle = bgColor
      this.pdfCtx.fillRect(0, 0, this.state.canvas.cssWidth, this.state.canvas.cssHeight)
    }
    
    await page.render({
      canvasContext: this.pdfCtx,
      viewport: viewport
    }).promise
    
    this.pdfCtx.restore()
  }
  
  renderObjects() {
    this.objectsCtx.save()
    this.objectsCtx.setTransform(this.state.canvas.ratio, 0, 0, this.state.canvas.ratio, 0, 0)
    this.objectsCtx.clearRect(0, 0, this.state.canvas.cssWidth, this.state.canvas.cssHeight)
    
    const pageObjects = this.state.objects.filter(obj => obj.page === this.state.view.page)
    
    const sortedLayers = [...this.state.layers].sort((a, b) => a.order - b.order)
    
    for (const layer of sortedLayers) {
      if (!layer.visible) continue
      
      const layerObjects = pageObjects.filter(obj => obj.layerId === layer.id)
      
      this.objectsCtx.globalAlpha = layer.opacity
      this.objectsCtx.globalCompositeOperation = layer.blendMode
      
      for (const obj of layerObjects) {
        if (obj.hidden) continue
        this.drawObject(this.objectsCtx, obj)
      }
    }
    
    this.objectsCtx.restore()
  }
  
  drawObject(ctx, obj) {
    ctx.save()
    
    if (obj.transform) {
      ctx.translate(obj.transform.x || 0, obj.transform.y || 0)
      ctx.rotate((obj.transform.rotation || 0) * Math.PI / 180)
      ctx.scale(obj.transform.scaleX || 1, obj.transform.scaleY || 1)
    }
    
    switch (obj.type) {
      case 'path':
        this.drawPath(ctx, obj)
        break
      case 'text':
        this.drawText(ctx, obj)
        break
      case 'rect':
        this.drawRect(ctx, obj)
        break
      case 'oval':
        this.drawOval(ctx, obj)
        break
      case 'line':
        this.drawLine(ctx, obj)
        break
      case 'image':
        this.drawImage(ctx, obj)
        break
      case 'highlight':
        this.drawHighlight(ctx, obj)
        break
    }
    
    ctx.restore()
  }
  
  drawPath(ctx, obj) {
    if (!obj.points || obj.points.length === 0) return
    
    ctx.globalAlpha = obj.opacity || 1
    ctx.strokeStyle = obj.color || CONFIG.DEFAULT_COLOR
    ctx.lineWidth = this.scaleValue(obj.size || 2)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    
    if (obj.smoothing) {
      this.drawSmoothPath(ctx, obj.points)
    } else {
      ctx.beginPath()
      obj.points.forEach((p, i) => {
        const sp = this.pdfToCanvas(p)
        if (i === 0) ctx.moveTo(sp.x, sp.y)
        else ctx.lineTo(sp.x, sp.y)
      })
      ctx.stroke()
    }
  }
  
  drawSmoothPath(ctx, points) {
    if (points.length < 3) {
      ctx.beginPath()
      points.forEach((p, i) => {
        const sp = this.pdfToCanvas(p)
        if (i === 0) ctx.moveTo(sp.x, sp.y)
        else ctx.lineTo(sp.x, sp.y)
      })
      ctx.stroke()
      return
    }
    
    ctx.beginPath()
    const sp0 = this.pdfToCanvas(points[0])
    ctx.moveTo(sp0.x, sp0.y)
    
    for (let i = 1; i < points.length - 1; i++) {
      const p1 = this.pdfToCanvas(points[i])
      const p2 = this.pdfToCanvas(points[i + 1])
      const cpx = (p1.x + p2.x) / 2
      const cpy = (p1.y + p2.y) / 2
      ctx.quadraticCurveTo(p1.x, p1.y, cpx, cpy)
    }
    
    const last = this.pdfToCanvas(points[points.length - 1])
    ctx.lineTo(last.x, last.y)
    ctx.stroke()
  }
  
  drawText(ctx, obj) {
    const pos = this.pdfToCanvas({ x: obj.x, y: obj.y })
    const fontSize = this.scaleValue(obj.size || CONFIG.DEFAULT_FONT_SIZE)
    
    let fontStyle = ''
    if (obj.italic) fontStyle += 'italic '
    if (obj.bold) fontStyle += 'bold '
    
    ctx.font = `${fontStyle}${fontSize}px ${obj.font || CONFIG.DEFAULT_FONT}`
    ctx.fillStyle = obj.color || CONFIG.DEFAULT_COLOR
    ctx.textAlign = obj.align || 'left'
    ctx.textBaseline = 'top'
    
    if (obj.highlight) {
      const metrics = ctx.measureText(obj.text)
      const height = fontSize * (obj.lineHeight || 1.2)
      ctx.fillStyle = 'rgba(255, 255, 0, 0.4)'
      ctx.fillRect(pos.x, pos.y, metrics.width, height)
      ctx.fillStyle = obj.color || CONFIG.DEFAULT_COLOR
    }
    
    ctx.fillText(obj.text, pos.x, pos.y)
    
    if (obj.underline) {
      const metrics = ctx.measureText(obj.text)
      ctx.strokeStyle = obj.color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y + fontSize + 2)
      ctx.lineTo(pos.x + metrics.width, pos.y + fontSize + 2)
      ctx.stroke()
    }
    
    if (obj.strikethrough) {
      const metrics = ctx.measureText(obj.text)
      ctx.strokeStyle = obj.color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y + fontSize / 2)
      ctx.lineTo(pos.x + metrics.width, pos.y + fontSize / 2)
      ctx.stroke()
    }
  }
  
  drawRect(ctx, obj) {
    const pos = this.pdfToCanvas({ x: obj.x, y: obj.y })
    const w = this.scaleValue(obj.width)
    const h = this.scaleValue(obj.height)
    
    if (obj.fill && obj.fill !== 'transparent') {
      ctx.fillStyle = obj.fill
      ctx.fillRect(pos.x, pos.y, w, h)
    }
    
    if (obj.stroke && obj.stroke !== 'transparent') {
      ctx.strokeStyle = obj.stroke
      ctx.lineWidth = this.scaleValue(obj.strokeWidth || 2)
      ctx.strokeRect(pos.x, pos.y, w, h)
    }
  }
  
  drawOval(ctx, obj) {
    const pos = this.pdfToCanvas({ x: obj.x, y: obj.y })
    const w = this.scaleValue(obj.width)
    const h = this.scaleValue(obj.height)
    
    ctx.beginPath()
    ctx.ellipse(
      pos.x + w / 2,
      pos.y + h / 2,
      Math.abs(w / 2),
      Math.abs(h / 2),
      0, 0, Math.PI * 2
    )
    
    if (obj.fill && obj.fill !== 'transparent') {
      ctx.fillStyle = obj.fill
      ctx.fill()
    }
    
    if (obj.stroke && obj.stroke !== 'transparent') {
      ctx.strokeStyle = obj.stroke
      ctx.lineWidth = this.scaleValue(obj.strokeWidth || 2)
      ctx.stroke()
    }
  }
  
  drawLine(ctx, obj) {
    const p1 = this.pdfToCanvas({ x: obj.x, y: obj.y })
    const p2 = this.pdfToCanvas({ x: obj.x + obj.width, y: obj.y + obj.height })
    
    ctx.strokeStyle = obj.stroke || CONFIG.DEFAULT_COLOR
    ctx.lineWidth = this.scaleValue(obj.strokeWidth || 2)
    ctx.lineCap = obj.lineCap || 'round'
    
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
  }
  
  drawImage(ctx, obj) {
    if (!obj.image) return
    
    const pos = this.pdfToCanvas({ x: obj.x, y: obj.y })
    const w = this.scaleValue(obj.width)
    const h = this.scaleValue(obj.height)
    
    ctx.globalAlpha = obj.opacity || 1
    ctx.drawImage(obj.image, pos.x, pos.y, w, h)
    ctx.globalAlpha = 1
  }
  
  drawHighlight(ctx, obj) {
    const pos = this.pdfToCanvas({ x: obj.x, y: obj.y })
    const w = this.scaleValue(obj.width)
    const h = this.scaleValue(obj.height)
    
    ctx.fillStyle = obj.color || '#FFFF00'
    ctx.globalAlpha = obj.opacity || 0.4
    ctx.fillRect(pos.x, pos.y, w, h)
    ctx.globalAlpha = 1
  }
  
  renderAnnotations() {
    this.annotationCtx.save()
    this.annotationCtx.setTransform(this.state.canvas.ratio, 0, 0, this.state.canvas.ratio, 0, 0)
    this.annotationCtx.clearRect(0, 0, this.state.canvas.cssWidth, this.state.canvas.cssHeight)
    
    const pageAnnotations = this.state.annotations.filter(a => a.page === this.state.view.page)
    
    for (const annotation of pageAnnotations) {
      this.drawAnnotation(this.annotationCtx, annotation)
    }
    
    this.annotationCtx.restore()
  }
  
  drawAnnotation(ctx, annotation) {
    const pos = this.pdfToCanvas({ x: annotation.x, y: annotation.y })
    
    ctx.fillStyle = '#FEF3C7'
    ctx.strokeStyle = '#F59E0B'
    ctx.lineWidth = 2
    
    const width = 24
    const height = 24
    
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    ctx.lineTo(pos.x + width, pos.y)
    ctx.lineTo(pos.x + width, pos.y + height * 0.7)
    ctx.lineTo(pos.x + width * 0.7, pos.y + height)
    ctx.lineTo(pos.x, pos.y + height)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    
    ctx.fillStyle = '#F59E0B'
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('!', pos.x + width / 2, pos.y + height / 2 - 2)
  }
  
  renderSelection() {
    if (this.state.selection.length === 0) return
    
    this.objectsCtx.save()
    this.objectsCtx.setTransform(this.state.canvas.ratio, 0, 0, this.state.canvas.ratio, 0, 0)
    
    for (const obj of this.state.selection) {
      this.drawSelectionBox(this.objectsCtx, obj)
      this.drawTransformHandles(this.objectsCtx, obj)
    }
    
    this.objectsCtx.restore()
  }
  
  drawSelectionBox(ctx, obj) {
    const bounds = this.getObjectBounds(obj)
    if (!bounds) return
    
    ctx.strokeStyle = CONFIG.SELECTION_COLOR
    ctx.lineWidth = 2 / this.state.view.zoom
    ctx.setLineDash([6 / this.state.view.zoom, 4 / this.state.view.zoom])
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
    ctx.setLineDash([])
  }
  
  drawTransformHandles(ctx, obj) {
    if (obj.type === 'path') return
    
    const bounds = this.getObjectBounds(obj)
    if (!bounds) return
    
    const handleSize = CONFIG.SELECTION_HANDLE_SIZE / this.state.view.zoom
    const handles = this.getTransformHandles(bounds)
    
    ctx.fillStyle = '#FFFFFF'
    ctx.strokeStyle = CONFIG.SELECTION_COLOR
    ctx.lineWidth = 1.5 / this.state.view.zoom
    
    for (const handle of Object.values(handles)) {
      ctx.fillRect(
        handle.x - handleSize / 2,
        handle.y - handleSize / 2,
        handleSize,
        handleSize
      )
      ctx.strokeRect(
        handle.x - handleSize / 2,
        handle.y - handleSize / 2,
        handleSize,
        handleSize
      )
    }
  }
  
  getObjectBounds(obj) {
    if (obj.type === 'path') {
      if (!obj.points || obj.points.length === 0) return null
      
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      
      for (const p of obj.points) {
        const cp = this.pdfToCanvas(p)
        minX = Math.min(minX, cp.x)
        minY = Math.min(minY, cp.y)
        maxX = Math.max(maxX, cp.x)
        maxY = Math.max(maxY, cp.y)
      }
      
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    }
    
    const pos = this.pdfToCanvas({ x: obj.x, y: obj.y })
    const width = this.scaleValue(obj.width || 0)
    const height = this.scaleValue(obj.height || 0)
    
    return { x: pos.x, y: pos.y, width, height }
  }
  
  getTransformHandles(bounds) {
    return {
      [TRANSFORM_HANDLES.TOP_LEFT]: { x: bounds.x, y: bounds.y },
      [TRANSFORM_HANDLES.TOP_CENTER]: { x: bounds.x + bounds.width / 2, y: bounds.y },
      [TRANSFORM_HANDLES.TOP_RIGHT]: { x: bounds.x + bounds.width, y: bounds.y },
      [TRANSFORM_HANDLES.MIDDLE_LEFT]: { x: bounds.x, y: bounds.y + bounds.height / 2 },
      [TRANSFORM_HANDLES.MIDDLE_RIGHT]: { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
      [TRANSFORM_HANDLES.BOTTOM_LEFT]: { x: bounds.x, y: bounds.y + bounds.height },
      [TRANSFORM_HANDLES.BOTTOM_CENTER]: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
      [TRANSFORM_HANDLES.BOTTOM_RIGHT]: { x: bounds.x + bounds.width, y: bounds.y + bounds.height }
    }
  }
  
  drawRulers() {
    const rulerH = this.els.rulerH
    const rulerV = this.els.rulerV
    
    if (!rulerH || !rulerV) return
    
    rulerH.innerHTML = ''
    rulerV.innerHTML = ''
    
    const step = 50
    
    for (let i = 0; i < this.state.canvas.cssWidth; i += step) {
      const tick = document.createElement('div')
      tick.className = 'ruler-tick'
      tick.style.cssText = `position:absolute;left:${i}px;top:18px;width:1px;height:6px;`
      rulerH.appendChild(tick)
      
      if (i % (step * 2) === 0) {
        const label = document.createElement('div')
        label.style.cssText = `position:absolute;left:${i + 2}px;top:2px;`
        label.textContent = i
        rulerH.appendChild(label)
      }
    }
    
    for (let i = 0; i < this.state.canvas.cssHeight; i += step) {
      const tick = document.createElement('div')
      tick.className = 'ruler-tick'
      tick.style.cssText = `position:absolute;left:18px;top:${i}px;width:6px;height:1px;`
      rulerV.appendChild(tick)
      
      if (i % (step * 2) === 0) {
        const label = document.createElement('div')
        label.style.cssText = `position:absolute;left:2px;top:${i + 2}px;writing-mode:vertical-lr;`
        label.textContent = i
        rulerV.appendChild(label)
      }
    }
  }
  
  async renderThumbnails() {
    const container = this.els.thumbnails
    if (!container) return
    
    container.innerHTML = ''
    
    for (let i = 1; i <= this.state.document.pages; i++) {
      const item = this.createThumbnailItem(i)
      container.appendChild(item)
      
      const canvas = item.querySelector('canvas')
      await this.renderThumbnail(i, canvas)
    }
    
    this.highlightCurrentThumbnail()
  }
  
  createThumbnailItem(pageNum) {
    const item = document.createElement('div')
    item.className = 'thumbnail-item p-2 border-2 border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800'
    item.dataset.page = pageNum
    
    const canvas = document.createElement('canvas')
    canvas.width = CONFIG.THUMBNAIL_WIDTH
    canvas.height = CONFIG.THUMBNAIL_HEIGHT
    canvas.className = 'w-full h-auto rounded'
    
    const label = document.createElement('div')
    label.className = 'text-center text-xs mt-2 font-medium'
    label.textContent = `Page ${pageNum}`
    
    item.appendChild(canvas)
    item.appendChild(label)
    
    item.addEventListener('click', () => {
      this.state.view.page = pageNum
      this.resize()
      this.render()
      this.highlightCurrentThumbnail()
    })
    
    return item
  }
  
  async renderThumbnail(pageNum, canvas) {
    if (this.thumbnailCache.has(pageNum)) {
      const cached = this.thumbnailCache.get(pageNum)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(cached, 0, 0)
      return
    }
    
    try {
      const page = await this.pdfService.pdfjs.getPage(pageNum)
      const viewport = page.getViewport({ scale: 1 })
      const scale = CONFIG.THUMBNAIL_WIDTH / viewport.width
      const scaledViewport = page.getViewport({ scale })
      
      canvas.height = scaledViewport.height
      
      const ctx = canvas.getContext('2d')
      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise
      
      this.thumbnailCache.set(pageNum, canvas)
      
      if (this.eventBus) {
        this.eventBus.emit(EVENTS.THUMBNAIL_RENDERED, { page: pageNum })
      }
    } catch (error) {
      console.error(`Failed to render thumbnail for page ${pageNum}:`, error)
    }
  }
  
  highlightCurrentThumbnail() {
    const items = this.els.thumbnails?.querySelectorAll('.thumbnail-item')
    if (!items) return
    
    items.forEach(item => {
      const pageNum = parseInt(item.dataset.page)
      if (pageNum === this.state.view.page) {
        item.classList.add('active')
      } else {
        item.classList.remove('active')
      }
    })
  }
  
  clientToPdf(e) {
    const rect = this.els.objectsCanvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / this.state.view.zoom
    const y = (e.clientY - rect.top) / this.state.view.zoom
    return { x, y }
  }
  
  pdfToCanvas(point) {
    const pageSize = this.state.document.pageSizes[this.state.view.page - 1]
    if (!pageSize) return { x: 0, y: 0 }
    
    const x = (point.x / pageSize.width) * this.state.canvas.cssWidth
    const y = (point.y / pageSize.height) * this.state.canvas.cssHeight
    return { x, y }
  }
  
  scaleValue(value) {
    return value * this.state.view.zoom
  }
  
  fitWidth() {
    const container = this.els.canvasWrapper.parentElement
    if (!container) return
    
    const pageSize = this.state.document.pageSizes[this.state.view.page - 1]
    if (!pageSize) return
    
    const containerWidth = container.clientWidth - CONFIG.CANVAS_PADDING * 2
    const zoom = containerWidth / pageSize.width
    
    this.state.view.zoom = clamp(zoom, CONFIG.MIN_ZOOM, CONFIG.MAX_ZOOM)
    this.state.view.fit = 'width'
    this.resize()
    this.render()
  }
  
  fitPage() {
    const container = this.els.canvasWrapper.parentElement
    if (!container) return
    
    const pageSize = this.state.document.pageSizes[this.state.view.page - 1]
    if (!pageSize) return
    
    const containerWidth = container.clientWidth - CONFIG.CANVAS_PADDING * 2
    const containerHeight = container.clientHeight - CONFIG.CANVAS_PADDING * 2
    
    const zoomW = containerWidth / pageSize.width
    const zoomH = containerHeight / pageSize.height
    const zoom = Math.min(zoomW, zoomH)
    
    this.state.view.zoom = clamp(zoom, CONFIG.MIN_ZOOM, CONFIG.MAX_ZOOM)
    this.state.view.fit = 'page'
    this.resize()
    this.render()
  }
  
  updatePerformanceMetrics(renderTime) {
    this.state.performance.lastRenderTime = renderTime
    this.state.performance.renderCount++
    
    const total = this.state.performance.averageRenderTime * (this.state.performance.renderCount - 1)
    this.state.performance.averageRenderTime = (total + renderTime) / this.state.performance.renderCount
    this.state.performance.objectCount = this.state.objects.length
  }
  
  clearCache() {
    this.thumbnailCache.clear()
    this.objectCache.clear()
  }
}