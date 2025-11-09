import { BaseTool } from './base-tool.js'
import { CURSORS, TRANSFORM_HANDLES, EVENTS } from '../constants.js'
import { pointInRect, rectIntersects } from '../utils/geom.js'

export class SelectTool extends BaseTool {
  constructor(state, renderer, elements, eventBus) {
    super(state, renderer, elements, eventBus)
    this.cursor = CURSORS.DEFAULT
    this.dragging = false
    this.resizing = false
    this.selecting = false
    this.resizeHandle = null
    this.dragStart = null
    this.dragOffsets = []
    this.selectionBox = null
    this.transformStart = null
  }

  activate() {
    super.activate()
    this.els.objectsCanvas.addEventListener('dblclick', this.handleDoubleClick)
  }

  deactivate() {
    super.deactivate()
    this.els.objectsCanvas.removeEventListener('dblclick', this.handleDoubleClick)
  }

  cleanup() {
    this.dragging = false
    this.resizing = false
    this.selecting = false
    this.selectionBox = null
  }

  onPointerDown(e) {
    const point = this.snapToGrid(this.getPoint(e))
    
    const handle = this.getHandleAtPoint(point)
    if (handle) {
      this.startResize(point, handle)
      return
    }

    const object = this.getObjectAtPoint(point)
    
    if (object) {
      if (!e.shiftKey && !this.state.selection.includes(object)) {
        this.state.selection = [object]
      } else if (e.shiftKey) {
        if (this.state.selection.includes(object)) {
          this.state.selection = this.state.selection.filter(o => o !== object)
        } else {
          this.state.selection.push(object)
        }
      }

      if (this.state.selection.length > 0) {
        this.startDrag(point)
      }

      this.emit(EVENTS.SELECTION_CHANGED, { selection: this.state.selection })
    } else {
      if (!e.shiftKey) {
        this.state.selection = []
        this.emit(EVENTS.SELECTION_CHANGED, { selection: [] })
      }
      this.startBoxSelect(point)
    }

    this.renderer.render()
  }

  onPointerMove(e) {
    const point = this.snapToGrid(this.getPoint(e))

    if (this.resizing) {
      this.updateResize(point)
      this.renderer.render()
      return
    }

    if (this.dragging) {
      this.updateDrag(point)
      this.renderer.render()
      return
    }

    if (this.selecting) {
      this.updateBoxSelect(point)
      this.drawSelectionBox()
      return
    }

    const handle = this.getHandleAtPoint(point)
    if (handle) {
      this.updateCursorForHandle(handle)
      return
    }

    const object = this.getObjectAtPoint(point)
    this.cursor = object ? CURSORS.MOVE : CURSORS.DEFAULT
    this.updateCursor()
  }

  onPointerUp(e) {
    if (this.resizing) {
      this.resizing = false
      this.resizeHandle = null
    }

    if (this.dragging) {
      this.dragging = false
    }

    if (this.selecting) {
      this.finishBoxSelect()
      this.selecting = false
      this.renderer.render()
    }

    this.cursor = CURSORS.DEFAULT
    this.updateCursor()
  }

  handleDoubleClick = (e) => {
    const point = this.getPoint(e)
    const object = this.getObjectAtPoint(point)

    if (object && object.type === 'text') {
      this.editText(object)
    }
  }

  startDrag(point) {
    this.dragging = true
    this.dragStart = point
    this.dragOffsets = this.state.selection.map(obj => ({
      x: point.x - (obj.x || 0),
      y: point.y - (obj.y || 0)
    }))
  }

  updateDrag(point) {
    this.state.selection.forEach((obj, index) => {
      if (obj.type === 'path') return

      obj.x = point.x - this.dragOffsets[index].x
      obj.y = point.y - this.dragOffsets[index].y
      obj.modified = Date.now()
    })

    this.emit(EVENTS.OBJECT_UPDATED, { objects: this.state.selection })
  }

  startResize(point, handle) {
    this.resizing = true
    this.resizeHandle = handle
    this.dragStart = point
    this.transformStart = this.state.selection.map(obj => ({
      x: obj.x,
      y: obj.y,
      width: obj.width,
      height: obj.height
    }))
  }

  updateResize(point) {
    if (this.state.selection.length !== 1) return

    const obj = this.state.selection[0]
    const start = this.transformStart[0]
    const dx = point.x - this.dragStart.x
    const dy = point.y - this.dragStart.y

    switch (this.resizeHandle) {
      case TRANSFORM_HANDLES.TOP_LEFT:
        obj.x = start.x + dx
        obj.y = start.y + dy
        obj.width = start.width - dx
        obj.height = start.height - dy
        break

      case TRANSFORM_HANDLES.TOP_CENTER:
        obj.y = start.y + dy
        obj.height = start.height - dy
        break

      case TRANSFORM_HANDLES.TOP_RIGHT:
        obj.y = start.y + dy
        obj.width = start.width + dx
        obj.height = start.height - dy
        break

      case TRANSFORM_HANDLES.MIDDLE_LEFT:
        obj.x = start.x + dx
        obj.width = start.width - dx
        break

      case TRANSFORM_HANDLES.MIDDLE_RIGHT:
        obj.width = start.width + dx
        break

      case TRANSFORM_HANDLES.BOTTOM_LEFT:
        obj.x = start.x + dx
        obj.width = start.width - dx
        obj.height = start.height + dy
        break

      case TRANSFORM_HANDLES.BOTTOM_CENTER:
        obj.height = start.height + dy
        break

      case TRANSFORM_HANDLES.BOTTOM_RIGHT:
        obj.width = start.width + dx
        obj.height = start.height + dy
        break
    }

    if (obj.type === 'image' && e.shiftKey) {
      const aspectRatio = start.height / start.width
      obj.height = obj.width * aspectRatio
    }

    obj.modified = Date.now()
    this.emit(EVENTS.OBJECT_UPDATED, { objects: [obj] })
  }

  startBoxSelect(point) {
    this.selecting = true
    this.selectionBox = { x1: point.x, y1: point.y, x2: point.x, y2: point.y }
  }

  updateBoxSelect(point) {
    if (this.selectionBox) {
      this.selectionBox.x2 = point.x
      this.selectionBox.y2 = point.y
    }
  }

  finishBoxSelect() {
    if (!this.selectionBox) return

    const box = this.normalizeBox(this.selectionBox)
    const pageObjects = this.state.objects.filter(obj => obj.page === this.state.view.page)

    this.state.selection = pageObjects.filter(obj => {
      if (obj.type === 'path') {
        return obj.points.some(p => pointInRect(p, box))
      }

      const objRect = {
        x: obj.x,
        y: obj.y,
        width: obj.width || 0,
        height: obj.height || 0
      }

      return rectIntersects(box, objRect)
    })

    this.selectionBox = null
    this.emit(EVENTS.SELECTION_CHANGED, { selection: this.state.selection })
  }

  drawSelectionBox() {
    if (!this.selectionBox) return

    this.renderer.render()

    const ctx = this.els.objectsCanvas.getContext('2d')
    const box = this.normalizeBox(this.selectionBox)
    
    const p1 = this.renderer.pdfToCanvas({ x: box.x, y: box.y })
    const p2 = this.renderer.pdfToCanvas({ x: box.x + box.width, y: box.y + box.height })

    ctx.save()
    ctx.strokeStyle = '#3B82F6'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y)
    ctx.restore()
  }

  normalizeBox(box) {
    return {
      x: Math.min(box.x1, box.x2),
      y: Math.min(box.y1, box.y2),
      width: Math.abs(box.x2 - box.x1),
      height: Math.abs(box.y2 - box.y1)
    }
  }

  getObjectAtPoint(point) {
    const pageObjects = [...this.state.objects]
      .filter(obj => obj.page === this.state.view.page && !obj.hidden)
      .reverse()

    for (const obj of pageObjects) {
      if (obj.type === 'path') {
        if (this.pointInPath(point, obj)) return obj
      } else {
        const rect = {
          x: obj.x,
          y: obj.y,
          width: obj.width || 0,
          height: obj.height || 0
        }
        if (pointInRect(point, rect)) return obj
      }
    }

    return null
  }

  pointInPath(point, pathObj) {
    if (!pathObj.points || pathObj.points.length === 0) return false

    const threshold = (pathObj.size || 2) + 5

    for (const p of pathObj.points) {
      const dist = Math.sqrt(Math.pow(point.x - p.x, 2) + Math.pow(point.y - p.y, 2))
      if (dist <= threshold) return true
    }

    return false
  }

  getHandleAtPoint(point) {
    if (this.state.selection.length !== 1) return null

    const obj = this.state.selection[0]
    if (obj.type === 'path') return null

    const bounds = this.renderer.getObjectBounds(obj)
    if (!bounds) return null

    const handles = this.renderer.getTransformHandles(bounds)
    const handleSize = 10 / this.state.view.zoom

    for (const [name, pos] of Object.entries(handles)) {
      const canvasPos = this.renderer.pdfToCanvas(pos)
      const dist = Math.sqrt(
        Math.pow(point.x - pos.x, 2) + Math.pow(point.y - pos.y, 2)
      )

      if (dist <= handleSize) {
        return name
      }
    }

    return null
  }

  updateCursorForHandle(handle) {
    const cursorMap = {
      [TRANSFORM_HANDLES.TOP_LEFT]: CURSORS.RESIZE_NW,
      [TRANSFORM_HANDLES.TOP_CENTER]: CURSORS.RESIZE_N,
      [TRANSFORM_HANDLES.TOP_RIGHT]: CURSORS.RESIZE_NE,
      [TRANSFORM_HANDLES.MIDDLE_LEFT]: CURSORS.RESIZE_W,
      [TRANSFORM_HANDLES.MIDDLE_RIGHT]: CURSORS.RESIZE_E,
      [TRANSFORM_HANDLES.BOTTOM_LEFT]: CURSORS.RESIZE_SW,
      [TRANSFORM_HANDLES.BOTTOM_CENTER]: CURSORS.RESIZE_S,
      [TRANSFORM_HANDLES.BOTTOM_RIGHT]: CURSORS.RESIZE_SE
    }

    this.cursor = cursorMap[handle] || CURSORS.DEFAULT
    this.updateCursor()
  }

  editText(textObj) {
    const input = document.createElement('input')
    input.type = 'text'
    input.value = textObj.text
    input.className = 'absolute z-50 border-2 border-blue-500 rounded px-2 py-1'

    const bounds = this.renderer.getObjectBounds(textObj)
    const pos = this.renderer.pdfToCanvas({ x: textObj.x, y: textObj.y })

    input.style.left = pos.x + 'px'
    input.style.top = pos.y + 'px'
    input.style.fontSize = (textObj.size * this.state.view.zoom) + 'px'
    input.style.fontFamily = textObj.font || 'Helvetica'

    this.els.canvasWrapper.appendChild(input)
    input.focus()
    input.select()

    const finish = () => {
      textObj.text = input.value || 'Text'
      textObj.modified = Date.now()
      input.remove()
      this.renderer.render()
      this.emit(EVENTS.OBJECT_UPDATED, { objects: [textObj] })
    }

    input.addEventListener('blur', finish)
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') finish()
      if (e.key === 'Escape') {
        input.remove()
        this.renderer.render()
      }
    })
  }
}