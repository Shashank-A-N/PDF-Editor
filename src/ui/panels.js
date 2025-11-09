import { EVENTS } from '../constants.js'

export class Panels {
  constructor(state, elements, eventBus, renderer, pdfService, history) {
    this.state = state
    this.els = elements
    this.eventBus = eventBus
    this.renderer = renderer
    this.pdfService = pdfService
    this.history = history
  }

  init() {
    this.initSidebarTabs()
    this.initPagesPanel()
    this.initLayersPanel()
    this.initBookmarksPanel()
    this.initPropertiesPanel()
    this.updateAllPanels()
  }

  initSidebarTabs() {
    const tabs = document.querySelectorAll('.sidebar-tab')
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const panel = tab.dataset.panel
        this.switchPanel(panel)
      })
    })
  }

  switchPanel(panelName) {
    const panels = {
      pages: this.els.panelPages,
      layers: this.els.panelLayers,
      bookmarks: this.els.panelBookmarks
    }

    const tabs = document.querySelectorAll('.sidebar-tab')

    Object.values(panels).forEach(panel => {
      if (panel) panel.classList.add('hidden')
    })

    tabs.forEach(tab => {
      tab.classList.remove('border-brand', 'text-brand')
      tab.classList.add('border-transparent', 'text-slate-500')
    })

    if (panels[panelName]) {
      panels[panelName].classList.remove('hidden')
    }

    const activeTab = document.querySelector(`[data-panel="${panelName}"]`)
    if (activeTab) {
      activeTab.classList.add('border-brand', 'text-brand')
      activeTab.classList.remove('border-transparent', 'text-slate-500')
    }

    this.state.ui.leftSidebarPanel = panelName
  }

  initPagesPanel() {
    this.els.addPageBtn?.addEventListener('click', async () => {
      await this.pdfService.addBlankPage()
      this.history.checkpoint('Add blank page')
      await this.renderer.renderThumbnails()
      this.renderer.render()
    })

    this.els.duplicatePageBtn?.addEventListener('click', async () => {
      await this.pdfService.duplicatePage(this.state.view.page)
      this.history.checkpoint('Duplicate page')
      await this.renderer.renderThumbnails()
      this.renderer.render()
    })

    const deletePageBtn = document.getElementById('delete-page-btn')
    deletePageBtn?.addEventListener('click', async () => {
      if (this.state.document.pages <= 1) {
        this.eventBus.emit(EVENTS.WARNING, { message: 'Cannot delete the last page' })
        return
      }

      const confirm = window.confirm(`Delete page ${this.state.view.page}?`)
      if (!confirm) return

      await this.pdfService.deletePage(this.state.view.page)
      this.history.checkpoint('Delete page')
      await this.renderer.renderThumbnails()
      this.renderer.render()
    })
  }

  initLayersPanel() {
    this.els.addLayerBtn?.addEventListener('click', () => {
      const layerNumber = this.state.layers.length + 1
      const newLayer = {
        id: this.generateId(),
        name: `Layer ${layerNumber}`,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        order: this.state.layers.length
      }

      this.state.layers.push(newLayer)
      this.state.currentLayer = this.state.layers.length - 1
      this.history.checkpoint('Add layer')
      this.renderLayersList()
    })

    this.renderLayersList()
  }

  renderLayersList() {
    const list = this.els.layersList
    if (!list) return

    list.innerHTML = ''

    this.state.layers.forEach((layer, index) => {
      const item = document.createElement('div')
      item.className = `layer-item p-2 rounded flex items-center justify-between gap-2 ${
        index === this.state.currentLayer ? 'active' : ''
      }`

      item.innerHTML = `
        <div class="flex items-center gap-2 flex-1">
          <input type="checkbox" ${layer.visible ? 'checked' : ''} class="layer-visible" data-index="${index}">
          <input type="checkbox" ${layer.locked ? 'checked' : ''} class="layer-locked" data-index="${index}" title="Lock layer">
          <input type="text" value="${layer.name}" class="layer-name bg-transparent outline-none text-sm flex-1" data-index="${index}">
        </div>
        <div class="flex items-center gap-1">
          <button class="layer-up px-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 rounded" data-index="${index}" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button class="layer-down px-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 rounded" data-index="${index}" ${index === this.state.layers.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="layer-delete px-1 text-xs hover:bg-red-100 dark:hover:bg-red-900 rounded text-red-600" data-index="${index}" ${this.state.layers.length <= 1 ? 'disabled' : ''}>×</button>
        </div>
      `

      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('layer-visible') && 
            !e.target.classList.contains('layer-locked') &&
            !e.target.classList.contains('layer-name') &&
            !e.target.tagName === 'BUTTON') {
          this.state.currentLayer = index
          this.renderLayersList()
        }
      })

      list.appendChild(item)
    })

    list.querySelectorAll('.layer-visible').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index)
        this.state.layers[index].visible = e.target.checked
        this.renderer.render()
      })
    })

    list.querySelectorAll('.layer-locked').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index)
        this.state.layers[index].locked = e.target.checked
      })
    })

    list.querySelectorAll('.layer-name').forEach(input => {
      input.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index)
        this.state.layers[index].name = e.target.value
      })
    })

    list.querySelectorAll('.layer-up').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index)
        if (index > 0) {
          [this.state.layers[index], this.state.layers[index - 1]] = 
          [this.state.layers[index - 1], this.state.layers[index]]
          this.state.layers.forEach((layer, i) => layer.order = i)
          if (this.state.currentLayer === index) {
            this.state.currentLayer = index - 1
          }
          this.renderLayersList()
          this.renderer.render()
        }
      })
    })

    list.querySelectorAll('.layer-down').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index)
        if (index < this.state.layers.length - 1) {
          [this.state.layers[index], this.state.layers[index + 1]] = 
          [this.state.layers[index + 1], this.state.layers[index]]
          this.state.layers.forEach((layer, i) => layer.order = i)
          if (this.state.currentLayer === index) {
            this.state.currentLayer = index + 1
          }
          this.renderLayersList()
          this.renderer.render()
        }
      })
    })

    list.querySelectorAll('.layer-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index)
        if (this.state.layers.length > 1) {
          const layerId = this.state.layers[index].id
          this.state.objects = this.state.objects.filter(obj => obj.layerId !== layerId)
          this.state.layers.splice(index, 1)
          if (this.state.currentLayer >= this.state.layers.length) {
            this.state.currentLayer = this.state.layers.length - 1
          }
          this.history.checkpoint('Delete layer')
          this.renderLayersList()
          this.renderer.render()
        }
      })
    })
  }

  initBookmarksPanel() {
    this.els.addBookmarkBtn?.addEventListener('click', () => {
      const bookmark = {
        id: this.generateId(),
        page: this.state.view.page,
        label: `Page ${this.state.view.page}`,
        created: Date.now()
      }

      this.state.bookmarks.push(bookmark)
      this.renderBookmarksList()
    })

    this.renderBookmarksList()
  }

  renderBookmarksList() {
    const list = this.els.bookmarksList
    if (!list) return

    list.innerHTML = ''

    if (this.state.bookmarks.length === 0) {
      list.innerHTML = '<div class="text-sm text-slate-400 text-center py-4">No bookmarks</div>'
      return
    }

    this.state.bookmarks.forEach((bookmark, index) => {
      const item = document.createElement('div')
      item.className = 'flex items-center justify-between gap-2 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800'

      item.innerHTML = `
        <input type="text" value="${bookmark.label}" class="bookmark-label bg-transparent outline-none text-sm flex-1" data-index="${index}">
        <div class="flex items-center gap-1">
          <button class="bookmark-go px-2 py-1 text-xs bg-blue-500 text-white rounded" data-index="${index}">Go</button>
          <button class="bookmark-delete px-2 py-1 text-xs bg-red-500 text-white rounded" data-index="${index}">×</button>
        </div>
      `

      list.appendChild(item)
    })

    list.querySelectorAll('.bookmark-label').forEach(input => {
      input.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index)
        this.state.bookmarks[index].label = e.target.value
      })
    })

    list.querySelectorAll('.bookmark-go').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index)
        const bookmark = this.state.bookmarks[index]
        this.state.view.page = bookmark.page
        this.renderer.resize()
        this.renderer.render()
      })
    })

    list.querySelectorAll('.bookmark-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index)
        this.state.bookmarks.splice(index, 1)
        this.renderBookmarksList()
      })
    })
  }

  initPropertiesPanel() {
    this.eventBus.on(EVENTS.SELECTION_CHANGED, (data) => {
      this.renderPropertiesPanel(data.selection)
    })
  }

  renderPropertiesPanel(selection) {
    const panel = this.els.propertiesPanel
    if (!panel) return

    if (selection.length === 0) {
      panel.innerHTML = `
        <div class="text-center p-8 text-slate-400 dark:text-slate-600">
          <svg class="w-16 h-16 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
          </svg>
          <p class="text-sm">Select an object<br>to edit properties</p>
        </div>
      `
      return
    }

    if (selection.length === 1) {
      this.renderSingleObjectProperties(selection[0])
    } else {
      this.renderMultipleObjectsProperties(selection)
    }
  }

  renderSingleObjectProperties(obj) {
    const panel = this.els.propertiesPanel

    switch (obj.type) {
      case 'text':
        panel.innerHTML = this.getTextProperties(obj)
        this.bindTextProperties(obj)
        break

      case 'rect':
      case 'oval':
      case 'line':
        panel.innerHTML = this.getShapeProperties(obj)
        this.bindShapeProperties(obj)
        break

      case 'image':
        panel.innerHTML = this.getImageProperties(obj)
        this.bindImageProperties(obj)
        break

      case 'path':
        panel.innerHTML = this.getPathProperties(obj)
        this.bindPathProperties(obj)
        break

      case 'highlight':
        panel.innerHTML = this.getHighlightProperties(obj)
        this.bindHighlightProperties(obj)
        break

      default:
        panel.innerHTML = this.getCommonProperties(obj)
        this.bindCommonProperties(obj)
    }
  }

  getTextProperties(obj) {
    return `
      <div class="space-y-4">
        <div class="property-section">
          <label class="property-label">Content</label>
          <textarea id="prop-text-content" class="property-input h-24 resize-none">${obj.text}</textarea>
        </div>

        <div class="property-section grid grid-cols-2 gap-3">
          <div>
            <label class="property-label">Font</label>
            <select id="prop-text-font" class="property-input">
              <option value="Helvetica" ${obj.font === 'Helvetica' ? 'selected' : ''}>Helvetica</option>
              <option value="Times-Roman" ${obj.font === 'Times-Roman' ? 'selected' : ''}>Times New Roman</option>
              <option value="Courier" ${obj.font === 'Courier' ? 'selected' : ''}>Courier</option>
            </select>
          </div>
          <div>
            <label class="property-label">Size</label>
            <input type="number" id="prop-text-size" value="${obj.size}" min="8" max="144" class="property-input">
          </div>
        </div>

        <div class="property-section">
          <label class="property-label">Color</label>
          <input type="color" id="prop-text-color" value="${obj.color}" class="property-input h-10">
        </div>

        <div class="property-section">
          <label class="property-label">Style</label>
          <div class="flex gap-2">
            <button id="prop-text-bold" class="flex-1 px-3 py-2 rounded ${obj.bold ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-700'}">
              <strong>B</strong>
            </button>
            <button id="prop-text-italic" class="flex-1 px-3 py-2 rounded ${obj.italic ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-700'}">
              <em>I</em>
            </button>
            <button id="prop-text-underline" class="flex-1 px-3 py-2 rounded ${obj.underline ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-700'}">
              <u>U</u>
            </button>
          </div>
        </div>

        <div class="property-section">
          <label class="property-label">Align</label>
          <div class="flex gap-2">
            <button id="prop-text-align-left" class="flex-1 px-3 py-2 rounded ${obj.align === 'left' ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-700'}">
              ≡
            </button>
            <button id="prop-text-align-center" class="flex-1 px-3 py-2 rounded ${obj.align === 'center' ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-700'}">
              ≡
            </button>
            <button id="prop-text-align-right" class="flex-1 px-3 py-2 rounded ${obj.align === 'right' ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-700'}">
              ≡
            </button>
          </div>
        </div>

        ${this.getCommonProperties(obj)}
      </div>
    `
  }

  bindTextProperties(obj) {
    document.getElementById('prop-text-content')?.addEventListener('input', (e) => {
      obj.text = e.target.value
      obj.modified = Date.now()
      this.renderer.render()
    })

    document.getElementById('prop-text-font')?.addEventListener('change', (e) => {
      obj.font = e.target.value
      obj.modified = Date.now()
      this.renderer.render()
    })

    document.getElementById('prop-text-size')?.addEventListener('input', (e) => {
      obj.size = parseInt(e.target.value)
      obj.modified = Date.now()
      this.renderer.render()
    })

    document.getElementById('prop-text-color')?.addEventListener('change', (e) => {
      obj.color = e.target.value
      obj.modified = Date.now()
      this.renderer.render()
    })

    const toggleStyle = (prop, btnId) => {
      document.getElementById(btnId)?.addEventListener('click', (e) => {
        obj[prop] = !obj[prop]
        obj.modified = Date.now()
        e.target.classList.toggle('bg-blue-500')
        e.target.classList.toggle('text-white')
        e.target.classList.toggle('bg-slate-100')
        e.target.classList.toggle('dark:bg-slate-700')
        this.renderer.render()
      })
    }

    toggleStyle('bold', 'prop-text-bold')
    toggleStyle('italic', 'prop-text-italic')
    toggleStyle('underline', 'prop-text-underline')

    this.bindCommonProperties(obj)
  }

  getShapeProperties(obj) {
    return `
      <div class="space-y-4">
        <div class="property-section grid grid-cols-2 gap-3">
          <div>
            <label class="property-label">Fill Color</label>
            <input type="color" id="prop-shape-fill" value="${obj.fill !== 'transparent' ? obj.fill : '#000000'}" class="property-input h-10">
            <label class="flex items-center mt-2">
              <input type="checkbox" id="prop-shape-fill-transparent" ${obj.fill === 'transparent' ? 'checked' : ''}>
              <span class="ml-2 text-xs">Transparent</span>
            </label>
          </div>
          <div>
            <label class="property-label">Stroke Color</label>
            <input type="color" id="prop-shape-stroke" value="${obj.stroke !== 'transparent' ? obj.stroke : '#000000'}" class="property-input h-10">
            <label class="flex items-center mt-2">
              <input type="checkbox" id="prop-shape-stroke-transparent" ${obj.stroke === 'transparent' ? 'checked' : ''}>
              <span class="ml-2 text-xs">Transparent</span>
            </label>
          </div>
        </div>

        <div class="property-section">
          <label class="property-label">Stroke Width</label>
          <input type="range" id="prop-shape-stroke-width" value="${obj.strokeWidth || 2}" min="0" max="20" class="w-full">
          <div class="text-xs text-center mt-1">${obj.strokeWidth || 2}px</div>
        </div>

        ${this.getCommonProperties(obj)}
      </div>
    `
  }

  bindShapeProperties(obj) {
    document.getElementById('prop-shape-fill')?.addEventListener('change', (e) => {
      obj.fill = e.target.value
      obj.modified = Date.now()
      this.renderer.render()
    })

    document.getElementById('prop-shape-fill-transparent')?.addEventListener('change', (e) => {
      obj.fill = e.target.checked ? 'transparent' : '#000000'
      obj.modified = Date.now()
      this.renderer.render()
    })

    document.getElementById('prop-shape-stroke')?.addEventListener('change', (e) => {
      obj.stroke = e.target.value
      obj.modified = Date.now()
      this.renderer.render()
    })

    document.getElementById('prop-shape-stroke-transparent')?.addEventListener('change', (e) => {
      obj.stroke = e.target.checked ? 'transparent' : '#000000'
      obj.modified = Date.now()
      this.renderer.render()
    })

    const strokeWidthInput = document.getElementById('prop-shape-stroke-width')
    strokeWidthInput?.addEventListener('input', (e) => {
      obj.strokeWidth = parseInt(e.target.value)
      obj.modified = Date.now()
      e.target.nextElementSibling.textContent = `${obj.strokeWidth}px`
      this.renderer.render()
    })

    this.bindCommonProperties(obj)
  }

  getImageProperties(obj) {
    return `
      <div class="space-y-4">
        <div class="property-section">
          <label class="property-label">Preview</label>
          <div class="border-2 border-slate-200 dark:border-slate-700 rounded p-2">
            <img src="${obj.data}" class="max-w-full h-auto">
          </div>
        </div>

        <div class="property-section grid grid-cols-2 gap-3">
          <div>
            <label class="property-label">Width</label>
            <input type="number" id="prop-image-width" value="${Math.round(obj.width)}" min="1" class="property-input">
          </div>
          <div>
            <label class="property-label">Height</label>
            <input type="number" id="prop-image-height" value="${Math.round(obj.height)}" min="1" class="property-input">
          </div>
        </div>

        <div class="property-section">
          <label class="flex items-center">
            <input type="checkbox" id="prop-image-aspect-ratio" checked>
            <span class="ml-2 text-sm">Lock aspect ratio</span>
          </label>
        </div>

        ${this.getCommonProperties(obj)}
      </div>
    `
  }

  bindImageProperties(obj) {
    const aspectRatio = obj.height / obj.width
    let lockAspectRatio = true

    const widthInput = document.getElementById('prop-image-width')
    const heightInput = document.getElementById('prop-image-height')
    const aspectCheckbox = document.getElementById('prop-image-aspect-ratio')

    aspectCheckbox?.addEventListener('change', (e) => {
      lockAspectRatio = e.target.checked
    })

    widthInput?.addEventListener('input', (e) => {
      obj.width = parseInt(e.target.value)
      if (lockAspectRatio && heightInput) {
        obj.height = obj.width * aspectRatio
        heightInput.value = Math.round(obj.height)
      }
      obj.modified = Date.now()
      this.renderer.render()
    })

    heightInput?.addEventListener('input', (e) => {
      obj.height = parseInt(e.target.value)
      if (lockAspectRatio && widthInput) {
        obj.width = obj.height / aspectRatio
        widthInput.value = Math.round(obj.width)
      }
      obj.modified = Date.now()
      this.renderer.render()
    })

    this.bindCommonProperties(obj)
  }

  getPathProperties(obj) {
    return `
      <div class="space-y-4">
        <div class="property-section">
          <label class="property-label">Color</label>
          <input type="color" id="prop-path-color" value="${obj.color}" class="property-input h-10">
        </div>

        <div class="property-section">
          <label class="property-label">Thickness</label>
          <input type="range" id="prop-path-size" value="${obj.size}" min="1" max="50" class="w-full">
          <div class="text-xs text-center mt-1">${obj.size}px</div>
        </div>

        <div class="property-section">
          <label class="property-label">Opacity</label>
          <input type="range" id="prop-path-opacity" value="${obj.opacity || 1}" min="0" max="1" step="0.1" class="w-full">
          <div class="text-xs text-center mt-1">${Math.round((obj.opacity || 1) * 100)}%</div>
        </div>

        ${this.getCommonProperties(obj)}
      </div>
    `
  }

  bindPathProperties(obj) {
    document.getElementById('prop-path-color')?.addEventListener('change', (e) => {
      obj.color = e.target.value
      obj.modified = Date.now()
      this.renderer.render()
    })

    const sizeInput = document.getElementById('prop-path-size')
    sizeInput?.addEventListener('input', (e) => {
      obj.size = parseInt(e.target.value)
      obj.modified = Date.now()
      e.target.nextElementSibling.textContent = `${obj.size}px`
      this.renderer.render()
    })

    const opacityInput = document.getElementById('prop-path-opacity')
    opacityInput?.addEventListener('input', (e) => {
      obj.opacity = parseFloat(e.target.value)
      obj.modified = Date.now()
      e.target.nextElementSibling.textContent = `${Math.round(obj.opacity * 100)}%`
      this.renderer.render()
    })

    this.bindCommonProperties(obj)
  }

  getHighlightProperties(obj) {
    return `
      <div class="space-y-4">
        <div class="property-section">
          <label class="property-label">Color</label>
          <input type="color" id="prop-highlight-color" value="${obj.color}" class="property-input h-10">
        </div>

        <div class="property-section">
          <label class="property-label">Opacity</label>
          <input type="range" id="prop-highlight-opacity" value="${obj.opacity}" min="0" max="1" step="0.1" class="w-full">
          <div class="text-xs text-center mt-1">${Math.round(obj.opacity * 100)}%</div>
        </div>

        ${this.getCommonProperties(obj)}
      </div>
    `
  }

  bindHighlightProperties(obj) {
    document.getElementById('prop-highlight-color')?.addEventListener('change', (e) => {
      obj.color = e.target.value
      obj.modified = Date.now()
      this.renderer.render()
    })

    const opacityInput = document.getElementById('prop-highlight-opacity')
    opacityInput?.addEventListener('input', (e) => {
      obj.opacity = parseFloat(e.target.value)
      obj.modified = Date.now()
      e.target.nextElementSibling.textContent = `${Math.round(obj.opacity * 100)}%`
      this.renderer.render()
    })

    this.bindCommonProperties(obj)
  }

  getCommonProperties(obj) {
    return `
      <div class="property-section pt-4 border-t border-slate-200 dark:border-slate-700">
        <label class="property-label">Position</label>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs">X</label>
            <input type="number" id="prop-common-x" value="${Math.round(obj.x || 0)}" class="property-input">
          </div>
          <div>
            <label class="text-xs">Y</label>
            <input type="number" id="prop-common-y" value="${Math.round(obj.y || 0)}" class="property-input">
          </div>
        </div>
      </div>

      <div class="property-section">
        <button id="prop-delete" class="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition">
          Delete Object
        </button>
      </div>
    `
  }

  bindCommonProperties(obj) {
    document.getElementById('prop-common-x')?.addEventListener('input', (e) => {
      obj.x = parseFloat(e.target.value)
      obj.modified = Date.now()
      this.renderer.render()
    })

    document.getElementById('prop-common-y')?.addEventListener('input', (e) => {
      obj.y = parseFloat(e.target.value)
      obj.modified = Date.now()
      this.renderer.render()
    })

    document.getElementById('prop-delete')?.addEventListener('click', () => {
      const index = this.state.objects.indexOf(obj)
      if (index >= 0) {
        this.state.objects.splice(index, 1)
        this.state.selection = []
        this.history.checkpoint('Delete object')
        this.eventBus.emit(EVENTS.SELECTION_CHANGED, { selection: [] })
        this.renderer.render()
      }
    })
  }

  renderMultipleObjectsProperties(selection) {
    const panel = this.els.propertiesPanel
    panel.innerHTML = `
      <div class="space-y-4">
        <div class="property-section">
          <label class="property-label">Multiple Selection</label>
          <p class="text-sm text-slate-600 dark:text-slate-400">${selection.length} objects selected</p>
        </div>

        <div class="property-section">
          <label class="property-label">Align</label>
          <div class="grid grid-cols-3 gap-2">
            <button id="align-left" class="px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded text-sm">Left</button>
            <button id="align-center" class="px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded text-sm">Center</button>
            <button id="align-right" class="px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded text-sm">Right</button>
            <button id="align-top" class="px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded text-sm">Top</button>
            <button id="align-middle" class="px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded text-sm">Middle</button>
            <button id="align-bottom" class="px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded text-sm">Bottom</button>
          </div>
        </div>

        <div class="property-section">
          <label class="property-label">Distribute</label>
          <div class="grid grid-cols-2 gap-2">
            <button id="distribute-horizontal" class="px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded text-sm">Horizontal</button>
            <button id="distribute-vertical" class="px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded text-sm">Vertical</button>
          </div>
        </div>

        <div class="property-section">
          <button id="delete-multiple" class="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition">
            Delete All Selected
          </button>
        </div>
      </div>
    `

    this.bindMultipleObjectsProperties(selection)
  }

  bindMultipleObjectsProperties(selection) {
    document.getElementById('align-left')?.addEventListener('click', () => {
      const minX = Math.min(...selection.map(o => o.x || 0))
      selection.forEach(o => o.x = minX)
      this.renderer.render()
    })

    document.getElementById('align-right')?.addEventListener('click', () => {
      const maxX = Math.max(...selection.map(o => (o.x || 0) + (o.width || 0)))
      selection.forEach(o => o.x = maxX - (o.width || 0))
      this.renderer.render()
    })

    document.getElementById('delete-multiple')?.addEventListener('click', () => {
      selection.forEach(obj => {
        const index = this.state.objects.indexOf(obj)
        if (index >= 0) {
          this.state.objects.splice(index, 1)
        }
      })
      this.state.selection = []
      this.history.checkpoint('Delete multiple objects')
      this.eventBus.emit(EVENTS.SELECTION_CHANGED, { selection: [] })
      this.renderer.render()
    })
  }

  updateAllPanels() {
    this.renderLayersList()
    this.renderBookmarksList()
  }

  generateId() {
    return '_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
  }
}