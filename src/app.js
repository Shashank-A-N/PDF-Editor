// src/app.js

import { initTheme } from './config.js';

// Core
import { StateManager } from './core/state.js';
import { History } from './core/history.js';
import { Renderer } from './core/renderer.js';
import { EventBus } from './core/event-bus.js';
import { Storage } from './core/storage.js';

// PDF
import { PdfService } from './core/pdf/pdf-service.js';
import { PdfExporter } from './core/pdf/pdf-exporter.js';

// UI
import { Toolbar } from './ui/toolbar.js';
import { Panels } from './ui/panels.js';
import { ContextMenu } from './ui/context-menu.js';
import { Notifications } from './ui/notifications.js';
import { KeyboardManager } from './ui/keyboard.js';

// Modals
import { ExportModal } from './ui/modals/export-modal.js';
import { SettingsModal } from './ui/modals/settings-modal.js';
import { HelpModal } from './ui/modals/help-modal.js';
import { AboutModal } from './ui/modals/about-modal.js';
// Optional: keep available for other parts of UI (not used directly here)
// import { SignatureModal } from './ui/modals/signature-modal.js';
// import { OcrModal } from './ui/modals/ocr-modal.js';

// Properties
import { PropertiesManager } from './ui/properties/properties-manager.js';

// Tools
import { SelectTool } from './tools/select.js';
import { HandTool } from './tools/hand.js';
import { DrawTool } from './tools/draw.js';
import { TextTool } from './tools/text.js';
import { ShapeTool } from './tools/shape.js';
import { HighlightTool } from './tools/highlight.js';
import { ImageTool } from './tools/image.js';
import { SignatureTool } from './tools/signature.js';
import { FormTool } from './tools/form.js';
import { OcrTool } from './tools/ocr.js';
import { EraserTool } from './tools/eraser.js';

import { EVENTS } from './constants.js';

// Flags and caches
let isFileLoading = false;
const els = {};

// Instances
let eventBus;
let storage;
let stateManager;
let state;
let history;
let renderer;
let pdfService;
let exporter;
let toolManager;
let propertiesManager;
let toolbar;
let panels;
let contextMenu;
let notifications;
let keyboard;

// --------------------
// Tool Manager (kept minimal)
// --------------------
class ToolManager {
  constructor(state, renderer, els, eventBus) {
    this.state = state;
    this.renderer = renderer;
    this.els = els;
    this.eventBus = eventBus;
    this.map = {};
    this.activeTool = null;
    this.propertiesManager = null;
  }

  setPropertiesManager(pm) {
    this.propertiesManager = pm;
  }

  register(name, tool) {
    this.map[name] = tool;
  }

  setTool(name) {
    const tool = this.map[name] || this.map['select'];

    if (this.activeTool?.deactivate) {
      this.activeTool.deactivate();
    }

    this.activeTool = tool;
    this.activeTool?.activate?.();

    this.state.currentTool = name;
    this.updateToolUI(name);

    if (this.propertiesManager) {
      this.propertiesManager.showToolProperties?.(name);
    }

    this.eventBus.emit('tool:changed', { tool: name });
  }

  updateToolUI(toolName) {
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.classList.remove('tool-active');
      if (btn.dataset.tool === toolName) btn.classList.add('tool-active');
    });

    const canvas = this.els.annotationCanvas;
    if (!canvas) return;

    switch (toolName) {
      case 'hand':
        canvas.style.cursor = 'grab';
        break;
      case 'text':
        canvas.style.cursor = 'text';
        break;
      case 'draw':
      case 'rect':
      case 'oval':
      case 'line':
      case 'highlight':
        canvas.style.cursor = 'crosshair';
        break;
      case 'eraser':
        canvas.style.cursor = 'not-allowed';
        break;
      default:
        canvas.style.cursor = 'default';
    }
  }

  getCurrentTool() {
    return this.activeTool;
  }
}

// -------------
// Canvas events -> route to active tool only
// -------------
function bindCanvasPointer() {
  const canvas = els.annotationCanvas;
  if (!canvas) return;

  const getTool = () => toolManager.getCurrentTool();

  const handlePointerDown = (e) => getTool()?.onPointerDown?.(e);
  const handlePointerMove = (e) => {
    if (els.cursorLabel) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      els.cursorLabel.textContent = `X: ${Math.round(x)}, Y: ${Math.round(y)}`;
    }
    getTool()?.onPointerMove?.(e);
  };
  const handlePointerUp = (e) => getTool()?.onPointerUp?.(e);
  const handleDoubleClick = (e) => getTool()?.onDoubleClick?.(e);
  const handleMouseLeave = (e) => getTool()?.onPointerUp?.(e);

  // Mouse
  canvas.addEventListener('mousedown', handlePointerDown);
  canvas.addEventListener('mousemove', handlePointerMove);
  canvas.addEventListener('mouseup', handlePointerUp);
  canvas.addEventListener('dblclick', handleDoubleClick);
  canvas.addEventListener('mouseleave', handleMouseLeave);

  // Touch
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      e.preventDefault();
      handlePointerDown(e.touches[0]);
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      e.preventDefault();
      handlePointerMove(e.touches[0]);
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (e.changedTouches.length > 0) {
      handlePointerUp(e.changedTouches[0]);
    }
  }, { passive: false });
}

// -------------
// Helpers
// -------------
function updateFileInfo() {
  if (els.fileLabel) els.fileLabel.textContent = state.document.name || '';
  if (els.pageLabel) els.pageLabel.textContent = state.view.page;
  if (els.pageCount) els.pageCount.textContent = state.document.pages || 1;
  if (els.filesizeLabel) els.filesizeLabel.textContent = formatBytes(state.document.bytes || 0);
}

function formatBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}

function setZoom(z) {
  const clamped = Math.max(0.25, Math.min(5, z));
  state.view.zoom = clamped;

  if (els.zoomSelect) {
    els.zoomSelect.value = String(clamped);
  }

  const zl = document.getElementById('zoom-label');
  if (zl) zl.textContent = `${Math.round(clamped * 100)}%`;

  renderer?.resize?.();
  renderer?.renderAll?.();
  eventBus?.emit?.('zoom:changed', { zoom: clamped });
}

function toggleFullscreen() {
  if (
    !document.fullscreenElement &&
    !document.mozFullScreenElement &&
    !document.webkitFullscreenElement &&
    !document.msFullscreenElement
  ) {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.msRequestFullscreen) el.msRequestFullscreen();
    else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
    else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
}

// -------------
// UI binding
// -------------
async function handleOpenFile(file) {
  if (!file || isFileLoading) return;

  try {
    isFileLoading = true;
    await pdfService.openFile(file);
    els.upload?.classList.add('hidden');
    els.editor?.classList.remove('hidden');

    renderer?.init?.();
    await renderer?.renderAll?.();
    await renderer?.renderThumbnails?.();

    updateFileInfo();
  } catch (error) {
    console.error('Error opening file:', error);
    notifications?.show?.('Failed to open PDF file', 'error');
  } finally {
    isFileLoading = false;
  }
}

function bindToolButtons() {
  document.querySelectorAll('[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      if (tool) toolManager.setTool(tool);
    });
  });
}

function bindGlobalUI() {
  const bind = (el, ev, fn) => el && el.addEventListener(ev, fn);

  bind(els.fileInput, 'change', async e => {
    if (isFileLoading) return;
    const f = e.target.files?.[0];
    if (f) {
      await handleOpenFile(f);
      e.target.value = '';
    }
  });

  bind(els.fullscreenBtn, 'click', toggleFullscreen);

  bind(els.newFileBtn, 'click', async () => {
    if (isFileLoading) return;
    try {
      isFileLoading = true;
      await pdfService.createBlankPdf();
      els.upload?.classList.add('hidden');
      els.editor?.classList.remove('hidden');
      renderer?.init?.();
      await renderer?.renderAll?.();
      updateFileInfo();
    } finally {
      isFileLoading = false;
    }
  });

  bind(els.openBtn, 'click', () => {
    if (els.fileInput && !isFileLoading) {
      els.fileInput.value = '';
      els.fileInput.click();
    }
  });

  bind(els.saveBtn, 'click', async () => {
    await toolbar?.handleSave?.();
  });

  bind(els.exportBtn, 'click', () => {
    const modal = new ExportModal(state, eventBus, pdfService);
    modal.show();
  });

  bind(els.undoBtn, 'click', () => {
    history.undo();
    renderer?.renderAll?.();
  });

  bind(els.redoBtn, 'click', () => {
    history.redo();
    renderer?.renderAll?.();
  });

  bind(els.themeToggle, 'click', () => {
    const dark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  });

  bind(els.zoomIn, 'click', () => setZoom(state.view.zoom + 0.25));
  bind(els.zoomOut, 'click', () => setZoom(state.view.zoom - 0.25));
  bind(els.zoomSelect, 'change', (e) => {
    const v = parseFloat(e.target.value);
    if (!Number.isNaN(v)) setZoom(v);
  });

  bind(els.openHelp, 'click', () => {
    const modal = new HelpModal(eventBus);
    modal.show();
  });

  bind(els.openAbout, 'click', () => {
    const modal = new AboutModal(eventBus);
    modal.show();
  });

  bind(els.settingsBtn, 'click', () => {
    const modal = new SettingsModal(state, eventBus);
    modal.show();
  });

  // Image upload -> Tools and Properties UI can trigger this input
  bind(els.hiddenImageInput, 'change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const obj = {
          type: 'image',
          page: state.view.page,
          x: 50,
          y: 50,
          width: Math.min(img.width, 300),
          height: Math.min(img.height, 300),
          imageData: event.target.result,
          opacity: 100
        };
        state.objects.push(obj);
        history.checkpoint('Added image');
        renderer?.renderAll?.();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  // FAB + palette
  bind(els.fab, 'click', () => {
    els.toolPalette?.classList.toggle('active');
  });

  els.toolPalette?.querySelectorAll('[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      els.toolPalette.classList.remove('active');
    });
  });

  // Resize -> delegate to Renderer
  window.addEventListener('resize', () => {
    renderer?.resize?.();
    renderer?.renderAll?.();
  });
}

// -------------
// Query elements
// -------------
function queryEls() {
  const q = (id) => document.getElementById(id);

  els.upload = q('upload-screen');
  els.editor = q('editor');
  els.fileInput = q('file-input');
  els.newFileBtn = q('new-file-btn');
  els.openBtn = q('open-btn');
  els.saveBtn = q('save-btn');
  els.exportBtn = q('export-btn');
  els.undoBtn = q('undo-btn');
  els.redoBtn = q('redo-btn');
  els.cutBtn = q('cut-btn');
  els.copyBtn = q('copy-btn');
  els.pasteBtn = q('paste-btn');
  els.deleteBtn = q('delete-btn');
  els.themeToggle = q('theme-toggle');
  els.fullscreenBtn = q('fullscreen-btn');
  els.settingsBtn = q('settings-btn');
  els.zoomIn = q('zoom-in');
  els.zoomOut = q('zoom-out');
  els.zoomSelect = q('zoom-select');
  els.pageLabel = q('page-label');
  els.pageCount = q('page-count');
  els.fileLabel = q('file-label');
  els.filesizeLabel = q('filesize-label');
  els.cursorLabel = q('cursor-label');
  els.selectionLabel = q('selection-label');
  els.canvasWrapper = q('canvas-wrapper');
  els.canvasArea = q('canvas-area');
  els.pdfCanvas = q('pdf-canvas');
  els.objectsCanvas = q('objects-canvas');
  els.annotationCanvas = q('annotation-canvas');
  els.gridOverlay = q('grid-overlay');
  els.rulerH = q('ruler-h');
  els.rulerV = q('ruler-v');
  els.thumbnails = q('thumbnails');
  els.addPageBtn = q('add-page-btn');
  els.duplicatePageBtn = q('duplicate-page-btn');
  els.deletePageBtn = q('delete-page-btn');
  els.addLayerBtn = q('add-layer-btn');
  els.layersList = q('layers-list');
  els.addBookmarkBtn = q('add-bookmark-btn');
  els.bookmarksList = q('bookmarks-list');
  els.propertiesPanel = q('properties-panel');
  els.contextMenu = q('context-menu');
  els.hiddenImageInput = q('hidden-image-input');
  els.openHelp = q('open-help');
  els.openAbout = q('open-about');
  els.fab = q('fab');
  els.toolPalette = q('tool-palette');
}

// -------------
// Bootstrap
// -------------
async function boot() {
  try {
    // Theme and storage
    initTheme();
    storage = new Storage();
    await storage.init();

    // DOM ready
    queryEls();

    // Bus and base events
    eventBus = new EventBus();

    // Selection -> PropertiesManager
    eventBus.on(EVENTS.SELECTION_CHANGED, (data) => {
      const selection = data.selection || [];
      if (selection.length === 1) {
        eventBus.emit('object:selected', { object: selection[0] });
      } else {
        eventBus.emit('object:deselected');
      }
    });

    // Propagate object lifecycle to unified render
    eventBus.on(EVENTS.OBJECT_UPDATED, () => eventBus.emit('object:modified'));
    eventBus.on(EVENTS.OBJECT_DELETED, () => eventBus.emit('object:deleted'));
    eventBus.on(EVENTS.RENDER_REQUESTED, () => renderer.renderAll?.());

    // State
    stateManager = new StateManager();
    state = stateManager.getState();
    state.selection = [];
    state.clipboard = [];
    if (!state.objects) state.objects = [];
    if (!state.annotations) state.annotations = [];
    state.view = state.view || { page: 1, zoom: 1 };
    state.document = state.document || { pages: 1, name: '', bytes: 0 };

    // Load settings early so tools/UI can use them
    const savedSettingsJSON = localStorage.getItem('user-settings');
    const savedSettings = savedSettingsJSON ? JSON.parse(savedSettingsJSON) : {};
    state.settings = {
      // UI
      showGrid: false,
      snapToGrid: true,
      // Tool defaults
      strokeColor: '#000000',
      fillColor: 'transparent',
      lineWidth: 2,
      fontSize: 16,
      fontFamily: 'Arial',
      textColor: '#000000',
      highlightColor: '#FFEB3B',
      opacity: 30,
      bold: false,
      italic: false,
      underline: false,
      ...savedSettings
    };

    // Core services
    history = new History(state, eventBus);
    renderer = new Renderer(state, els, eventBus);
    pdfService = new PdfService(state, eventBus);
    exporter = new PdfExporter(state, pdfService);
    exporter.setRenderer?.(renderer) // <- add this line so overlays are included

    // Wire services
    pdfService.exporter = exporter;
    renderer.bindPdfService?.(pdfService);

    // Tooling
    toolManager = new ToolManager(state, renderer, els, eventBus);
    propertiesManager = new PropertiesManager(state, els, eventBus, renderer);
    toolManager.setPropertiesManager(propertiesManager);

    const tools = {
      'select': new SelectTool(state, renderer, els, eventBus),
      'hand': new HandTool(state, renderer, els, eventBus),
      'text': new TextTool(state, renderer, els, eventBus),
      'draw': new DrawTool(state, renderer, els, eventBus),
      'highlight': new HighlightTool(state, renderer, els, eventBus),
      'rect': new ShapeTool(state, renderer, els, eventBus, 'rect'),
      'oval': new ShapeTool(state, renderer, els, eventBus, 'oval'),
      'line': new ShapeTool(state, renderer, els, eventBus, 'line'),
      'image': new ImageTool(state, renderer, els, eventBus),
      'signature': new SignatureTool(state, renderer, els, eventBus),
      'form': new FormTool(state, renderer, els, eventBus),
      'ocr': new OcrTool(state, renderer, els, eventBus),
      'eraser': new EraserTool(state, renderer, els, eventBus)
    };
    Object.entries(tools).forEach(([name, tool]) => toolManager.register(name, tool));

    // UI components
    toolbar = new Toolbar(state, els, eventBus, toolManager, renderer, pdfService);
    panels = new Panels(state, els, eventBus, renderer, pdfService, history);
    contextMenu = new ContextMenu(state, els, eventBus, history, renderer);
    notifications = new Notifications(eventBus);
    keyboard = new KeyboardManager(state, eventBus, toolManager, history);

    toolbar.init?.();
    panels.init?.();
    contextMenu.init?.();
    notifications.init?.();
    keyboard.init?.();
    propertiesManager.init?.();

    // Bind interactions
    bindCanvasPointer();
    bindToolButtons();
    bindGlobalUI();

    // Re-render on changes
    eventBus.on('object:modified', () => renderer.renderAll?.());
    eventBus.on('object:deleted', () => renderer.renderAll?.());

    // Persist settings on change
    eventBus.on('property:changed', () => {
      try {
        localStorage.setItem('user-settings', JSON.stringify(state.settings));
      } catch (_) {}
    });

    // Route keys to active tool (KeyboardManager also handles global shortcuts)
    window.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) return;
      toolManager.getCurrentTool()?.onKeyDown?.(e);
    });
    window.addEventListener('keyup', (e) => {
      toolManager.getCurrentTool()?.onKeyUp?.(e);
    });

    // Default tool
    toolManager.setTool('select');

    // Expose for debugging
    window.PDFEditor = {
      state,
      eventBus,
      toolManager,
      renderer,
      pdfService,
      propertiesManager,
      renderAll: () => renderer.renderAll?.()
    };

    // Drag & drop open
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type === 'application/pdf') {
        await handleOpenFile(file);
      }
    });

    console.log('PDF Editor initialized');
  } catch (error) {
    console.error('Failed to initialize:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
