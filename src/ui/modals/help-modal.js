import { BaseModal } from './base-modal.js'

export class HelpModal extends BaseModal {
  constructor(eventBus) {
    super(eventBus)
  }

  show() {
    const content = this.getContent()
    this.create(content, {
      title: 'Help & Documentation',
      size: 'xl'
    })

    this.open()
  }

  getContent() {
    return `
      <div class="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
        <section>
          <h3 class="text-xl font-bold mb-4">Getting Started</h3>
          <div class="space-y-3 text-sm">
            <p>PDF Editor Ultra is a comprehensive tool for editing PDF documents directly in your browser.</p>
            <ol class="list-decimal list-inside space-y-2 pl-4">
              <li>Click "Open PDF" or drag and drop a PDF file</li>
              <li>Use the toolbar to select editing tools</li>
              <li>Add text, shapes, images, and annotations</li>
              <li>Save your edited PDF when done</li>
            </ol>
          </div>
        </section>

        <section>
          <h3 class="text-xl font-bold mb-4">Tools Overview</h3>
          <div class="grid grid-cols-2 gap-4">
            ${this.getToolsHTML()}
          </div>
        </section>

        <section>
          <h3 class="text-xl font-bold mb-4">Keyboard Shortcuts</h3>
          <div class="grid grid-cols-2 gap-3 text-sm">
            ${this.getShortcutsHTML()}
          </div>
        </section>

        <section>
          <h3 class="text-xl font-bold mb-4">Tips & Tricks</h3>
          <ul class="space-y-2 text-sm list-disc list-inside">
            <li>Hold Shift while drawing shapes to maintain aspect ratio</li>
            <li>Use Ctrl+Click to select multiple objects</li>
            <li>Double-click text objects to edit them quickly</li>
            <li>Right-click on objects for more options</li>
            <li>Use the grid and snap features for precise alignment</li>
            <li>Layers help organize complex documents</li>
          </ul>
        </section>

        <section>
          <h3 class="text-xl font-bold mb-4">Troubleshooting</h3>
          <div class="space-y-3 text-sm">
            <div class="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
              <h4 class="font-semibold mb-2">PDF won't load?</h4>
              <p>Make sure the file is a valid PDF and not corrupted. Try with a different PDF file.</p>
            </div>
            <div class="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
              <h4 class="font-semibold mb-2">Performance issues?</h4>
              <p>Try reducing the render quality in settings or close other browser tabs.</p>
            </div>
            <div class="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
              <h4 class="font-semibold mb-2">Can't save changes?</h4>
              <p>Check your browser's download permissions and available disk space.</p>
            </div>
          </div>
        </section>

        <section>
          <h3 class="text-xl font-bold mb-4">Need More Help?</h3>
          <div class="flex gap-3">
            <a href="#" class="flex-1 px-4 py-3 bg-blue-500 text-white rounded-lg text-center font-semibold hover:bg-blue-600 transition">
              View Documentation
            </a>
            <a href="#" class="flex-1 px-4 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-center font-semibold hover:bg-slate-300 dark:hover:bg-slate-600 transition">
              Contact Support
            </a>
          </div>
        </section>
      </div>
    `
  }

  getToolsHTML() {
    const tools = [
      { icon: '✓', name: 'Select', desc: 'Select and move objects' },
      { icon: '✋', name: 'Hand', desc: 'Pan around the document' },
      { icon: 'T', name: 'Text', desc: 'Add text annotations' },
      { icon: '✎', name: 'Draw', desc: 'Free-form drawing' },
      { icon: 'H', name: 'Highlight', desc: 'Highlight areas' },
      { icon: '▭', name: 'Rectangle', desc: 'Draw rectangles' },
      { icon: '○', name: 'Oval', desc: 'Draw circles/ovals' },
      { icon: '/', name: 'Line', desc: 'Draw straight lines' },
      { icon: '🖼', name: 'Image', desc: 'Insert images' },
      { icon: '✍', name: 'Signature', desc: 'Add signatures' },
      { icon: '📋', name: 'Form', desc: 'Create form fields' },
      { icon: '👁', name: 'OCR', desc: 'Extract text from images' }
    ]

    return tools.map(t => `
      <div class="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
        <span class="text-2xl">${t.icon}</span>
        <div>
          <div class="font-semibold">${t.name}</div>
          <div class="text-xs text-slate-600 dark:text-slate-400">${t.desc}</div>
        </div>
      </div>
    `).join('')
  }

  getShortcutsHTML() {
    const shortcuts = [
      ['Save', 'Ctrl+S'],
      ['Undo', 'Ctrl+Z'],
      ['Redo', 'Ctrl+Y'],
      ['Copy', 'Ctrl+C'],
      ['Paste', 'Ctrl+V'],
      ['Delete', 'Del'],
      ['Select Tool', 'V'],
      ['Hand Tool', 'H'],
      ['Text Tool', 'T'],
      ['Draw Tool', 'P']
    ]

    return shortcuts.map(([action, key]) => `
      <div class="flex justify-between items-center py-2">
        <span>${action}</span>
        <kbd class="px-2 py-1">${key}</kbd>
      </div>
    `).join('')
  }
}