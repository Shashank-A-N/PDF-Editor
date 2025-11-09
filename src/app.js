import { initTheme,setTheme,APP_CONFIG } from './config.js'
import { CONFIG,EVENTS,TOOLS } from './constants.js'
import { StateManager } from './core/state.js'
import { History } from './core/history.js'
import { Renderer } from './core/renderer.js'
import { EventBus } from './core/event-bus.js'
import { Storage } from './core/storage.js'
import { PdfService } from './core/pdf/pdf-service.js'
import { PdfExporter } from './core/pdf/pdf-exporter.js'
import { Toolbar } from './ui/toolbar.js'
import { Panels } from './ui/panels.js'
import { ContextMenu } from './ui/context-menu.js'
import { Notifications } from './ui/notifications.js'
import { KeyboardManager } from './ui/keyboard.js'
import { SignatureModal } from './ui/modals/signature-modal.js'
import { ExportModal } from './ui/modals/export-modal.js'
import { OcrModal } from './ui/modals/ocr-modal.js'
import { SettingsModal } from './ui/modals/settings-modal.js'
import { HelpModal } from './ui/modals/help-modal.js'
import { SelectTool } from './tools/select.js'
import { HandTool } from './tools/hand.js'
import { DrawTool } from './tools/draw.js'
import { TextTool } from './tools/text.js'
import { ShapeTool } from './tools/shape.js'
import { HighlightTool } from './tools/highlight.js'
import { ImageTool } from './tools/image.js'
import { SignatureTool } from './tools/signature.js'
import { FormTool } from './tools/form.js'
import { OcrTool } from './tools/ocr.js'
import { EraserTool } from './tools/eraser.js'

const els={
  upload:document.getElementById('upload-screen'),
  editor:document.getElementById('editor'),
  fileInput:document.getElementById('file-input'),
  newFileBtn:document.getElementById('new-file-btn'),
  openBtn:document.getElementById('open-btn'),
  saveBtn:document.getElementById('save-btn'),
  exportBtn:document.getElementById('export-btn'),
  undoBtn:document.getElementById('undo-btn'),
  redoBtn:document.getElementById('redo-btn'),
  cutBtn:document.getElementById('cut-btn'),
  copyBtn:document.getElementById('copy-btn'),
  pasteBtn:document.getElementById('paste-btn'),
  deleteBtn:document.getElementById('delete-btn'),
  themeToggle:document.getElementById('theme-toggle'),
  fullscreenBtn:document.getElementById('fullscreen-btn'),
  settingsBtn:document.getElementById('settings-btn'),
  zoomIn:document.getElementById('zoom-in'),
  zoomOut:document.getElementById('zoom-out'),
  zoomSelect:document.getElementById('zoom-select'),
  pageLabel:document.getElementById('page-label'),
  pageCount:document.getElementById('page-count'),
  fileLabel:document.getElementById('file-label'),
  filesizeLabel:document.getElementById('filesize-label'),
  cursorLabel:document.getElementById('cursor-label'),
  selectionLabel:document.getElementById('selection-label'),
  canvasWrapper:document.getElementById('canvas-wrapper'),
  pdfCanvas:document.getElementById('pdf-canvas'),
  objectsCanvas:document.getElementById('objects-canvas'),
  annotationCanvas:document.getElementById('annotation-canvas'),
  gridOverlay:document.getElementById('grid-overlay'),
  rulerH:document.getElementById('ruler-h'),
  rulerV:document.getElementById('ruler-v'),
  thumbnails:document.getElementById('thumbnails'),
  addPageBtn:document.getElementById('add-page-btn'),
  duplicatePageBtn:document.getElementById('duplicate-page-btn'),
  addLayerBtn:document.getElementById('add-layer-btn'),
  layersList:document.getElementById('layers-list'),
  addBookmarkBtn:document.getElementById('add-bookmark-btn'),
  bookmarksList:document.getElementById('bookmarks-list'),
  propertiesPanel:document.getElementById('properties-panel'),
  contextMenu:document.getElementById('context-menu'),
  hiddenImageInput:document.getElementById('hidden-image-input'),
  openHelp:document.getElementById('open-help'),
  openAbout:document.getElementById('open-about'),
  // ADD THESE THREE
  panelPages:document.getElementById('panel-pages'),
  panelLayers:document.getElementById('panel-layers'),
  panelBookmarks:document.getElementById('panel-bookmarks')
}

class ToolManager{
  constructor(state,renderer,els,eventBus){
    this.state=state;this.renderer=renderer;this.els=els;this.eventBus=eventBus
    this.map={}
    this.activeTool=null
  }
  register(name,tool){this.map[name]=tool}
  setTool(name){
    const t=this.map[name]||this.map[TOOLS.SELECT]
    if(this.activeTool&&this.activeTool.deactivate)this.activeTool.deactivate()
    this.activeTool=t
    if(this.activeTool&&this.activeTool.activate)this.activeTool.activate()
    this.state.currentTool=name
    this.eventBus.emit(EVENTS.TOOL_CHANGED,{tool:name})
  }
}

const eventBus=new EventBus()
const storage=new Storage()
const stateManager=new StateManager()
const state=stateManager.getState()
const history=new History(state,eventBus)
const renderer=new Renderer(state,els,eventBus)
const pdfService=new PdfService(state,eventBus)
const exporter=new PdfExporter(state,pdfService)
pdfService.exporter=exporter
renderer.bindPdfService(pdfService)

const toolManager=new ToolManager(state,renderer,els,eventBus)
toolManager.register(TOOLS.SELECT,new SelectTool(state,renderer,els,eventBus))
toolManager.register(TOOLS.HAND,new HandTool(state,renderer,els,eventBus))
toolManager.register(TOOLS.DRAW,new DrawTool(state,renderer,els,eventBus))
toolManager.register(TOOLS.TEXT,new TextTool(state,renderer,els,eventBus))
toolManager.register(TOOLS.RECT,new ShapeTool(state,renderer,els,eventBus,'rect'))
toolManager.register(TOOLS.OVAL,new ShapeTool(state,renderer,els,eventBus,'oval'))
toolManager.register(TOOLS.LINE,new ShapeTool(state,renderer,els,eventBus,'line'))
toolManager.register(TOOLS.HIGHLIGHT,new HighlightTool(state,renderer,els,eventBus))
toolManager.register(TOOLS.IMAGE,new ImageTool(state,renderer,els,eventBus))
toolManager.register(TOOLS.SIGNATURE,new SignatureTool(state,renderer,els,eventBus))
toolManager.register(TOOLS.FORM,new FormTool(state,renderer,els,eventBus))
toolManager.register(TOOLS.OCR,new OcrTool(state,renderer,els,eventBus))
toolManager.register(TOOLS.ERASER,new EraserTool(state,renderer,els,eventBus))

const toolbar=new Toolbar(state,els,eventBus,toolManager,renderer,pdfService)
const panels=new Panels(state,els,eventBus,renderer,pdfService,history)
const contextMenu=new ContextMenu(state,els,eventBus,history,renderer)
const notifications=new Notifications(eventBus)
const keyboard=new KeyboardManager(state,eventBus,toolManager,history)

function bindCanvasPointer(){
  const down=e=>toolManager.activeTool?.onPointerDown?.(e)
  const move=e=>{
    toolManager.activeTool?.onPointerMove?.(e)
    const p=renderer.clientToPdf(e); if(p&&els.cursorLabel) els.cursorLabel.textContent=`X: ${Math.round(p.x)}, Y: ${Math.round(p.y)}`
  }
  const up=e=>toolManager.activeTool?.onPointerUp?.(e)
  els.objectsCanvas.addEventListener('mousedown',down)
  els.objectsCanvas.addEventListener('mousemove',move)
  els.objectsCanvas.addEventListener('mouseup',up)
  els.objectsCanvas.addEventListener('mouseleave',up)
  els.objectsCanvas.addEventListener('touchstart',e=>{const t=e.touches[0];toolManager.activeTool?.onPointerDown?.(t)})
  els.objectsCanvas.addEventListener('touchmove',e=>{const t=e.touches[0];toolManager.activeTool?.onPointerMove?.(t)})
  els.objectsCanvas.addEventListener('touchend',e=>toolManager.activeTool?.onPointerUp?.(e))
}

async function handleOpenFile(file){
  if(!file)return
  await pdfService.openFile(file)
  els.upload.classList.add('hidden')
  els.editor.classList.remove('hidden')
  renderer.init()
  await renderer.render()
  await renderer.renderThumbnails()
  updateFileInfo()
}

function updateFileInfo(){
  if(els.fileLabel) els.fileLabel.textContent=state.document.name||''
  if(els.pageLabel) els.pageLabel.textContent=state.view.page
  if(els.pageCount) els.pageCount.textContent=state.document.pages
  if(els.filesizeLabel) els.filesizeLabel.textContent=formatBytes(state.document.bytes||0)
}

function formatBytes(b){if(!b)return'0 B';const u=['B','KB','MB','GB'];let i=0;let v=b;while(v>=1024&&i<u.length-1){v/=1024;i++}return `${v.toFixed(1)} ${u[i]}`}

function bindGlobalUI(){
  const bind=(el,ev,fn)=>el&&el.addEventListener(ev,fn)

  bind(els.fileInput,'change',async e=>{
    try{
      const f=e.target.files?.[0]
      if(!f) return
      await handleOpenFile(f)
    }catch(err){
      console.error(err)
      alert('Failed to open PDF. Check console.')
    }
  })

  const uploadLabel=document.querySelector('label[for="file-input"]')
  bind(uploadLabel,'click',()=>els.fileInput?.click())

  bind(els.newFileBtn,'click',async()=>{
    try{
      await pdfService.createBlankPdf()
      els.upload.classList.add('hidden')
      els.editor.classList.remove('hidden')
      renderer.init()
      await renderer.render()
      await renderer.renderThumbnails()
      updateFileInfo()
    }catch(err){
      console.error(err)
      alert('Failed to create blank PDF. Check console.')
    }
  })

  bind(els.openBtn,()=>els.fileInput?.click())
  bind(els.saveBtn,async()=>{await toolbar.handleSave()})
  bind(els.exportBtn,()=>{eventBus.emit('modal:export:open')})

  bind(els.themeToggle,()=>{
    const dark=document.documentElement.classList.toggle('dark')
    localStorage.setItem('theme',dark?'dark':'light')
  })

  bind(els.fullscreenBtn,()=>{
    if(!document.fullscreenElement) document.documentElement.requestFullscreen()
    else document.exitFullscreen()
  })

  bind(els.settingsBtn,()=>eventBus.emit('modal:settings:open'))

  window.addEventListener('resize',()=>{renderer.resize();renderer.render()})

  document.addEventListener('dragover',e=>e.preventDefault())
  document.addEventListener('drop',async e=>{
    e.preventDefault()
    const f=e.dataTransfer.files?.[0]
    if(f?.type==='application/pdf') await handleOpenFile(f)
  })

  els.objectsCanvas?.addEventListener('wheel',e=>{
    if(e.ctrlKey||e.metaKey){
      e.preventDefault()
      const sign=e.deltaY>0?-CONFIG.ZOOM_STEP:CONFIG.ZOOM_STEP
      setZoom(state.view.zoom+sign)
    }
  },{passive:false})
}

function setZoom(z){
  const clamped=Math.max(CONFIG.MIN_ZOOM,Math.min(CONFIG.MAX_ZOOM,z))
  state.view.zoom=clamped
  if(els.zoomSelect) els.zoomSelect.value=String(clamped)
  const zl=document.getElementById('zoom-label'); if(zl) zl.textContent=`${Math.round(clamped*100)}%`
  renderer.resize()
  renderer.render()
  eventBus.emit(EVENTS.ZOOM_CHANGED,{zoom:clamped})
}

function bindEvents(){
  eventBus.on('action:open',()=>els.fileInput.click())
  eventBus.on('action:save',async()=>{await toolbar.handleSave()})
  eventBus.on('action:zoom-in',()=>setZoom(state.view.zoom+CONFIG.ZOOM_STEP))
  eventBus.on('action:zoom-out',()=>setZoom(state.view.zoom-CONFIG.ZOOM_STEP))
  eventBus.on('action:fit-width',()=>renderer.fitWidth())
  eventBus.on('renderer:render',()=>renderer.render())
  eventBus.on('history:undo',()=>{history.undo();renderer.render()})
  eventBus.on('history:redo',()=>{history.redo();renderer.render()})
  eventBus.on('history:checkpoint',desc=>history.checkpoint(typeof desc==='string'?desc:''))
  eventBus.on(EVENTS.DOCUMENT_LOADED,async()=>{updateFileInfo();await renderer.renderThumbnails();renderer.render()})
  eventBus.on(EVENTS.PAGE_CHANGED,()=>{updateFileInfo()})
  eventBus.on('modal:export:open',()=>{const m=new ExportModal(state,eventBus,pdfService);m.show()})
  eventBus.on('modal:settings:open',()=>{const m=new SettingsModal(state,eventBus,storage);m.show()})
  eventBus.on('modal:help:open',()=>{const m=new HelpModal(eventBus);m.show()})
}

async function initStorage(){await storage.init()}

function initAutosave(){
  if(APP_CONFIG.autosave){
    setInterval(async()=>{const snap=stateManager.snapshot();await storage.saveAutosave(snap)},APP_CONFIG.autosaveInterval||CONFIG.AUTO_SAVE_INTERVAL)
  }
}

function initToolbarPanels(){
  const tb=new Toolbar(state,els,eventBus,toolManager,renderer,pdfService);tb.init()
  const pn=new Panels(state,els,eventBus,renderer,pdfService,history);pn.init()
  const cm=new ContextMenu(state,els,eventBus,history,renderer);cm.init()
  const nf=new Notifications(eventBus);nf.init()
  const kb=new KeyboardManager(state,eventBus,toolManager,history);kb.init()
}

function openEditorUI(){
  els.upload.classList.add('hidden')
  els.editor.classList.remove('hidden')
}

function setInitialTool(){
  toolManager.setTool(TOOLS.SELECT)
}

async function boot(){
  initTheme()
  await initStorage()
  toolbar.init()
  panels.init()
  contextMenu.init()
  notifications.init()
  keyboard.init()
  bindCanvasPointer()
  bindGlobalUI()           // <- ensure this is here
  bindEvents()
  initAutosave()
  setInitialTool()
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',boot)
}else{
  boot()
}