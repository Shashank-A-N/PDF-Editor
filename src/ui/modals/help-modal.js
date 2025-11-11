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
    // Add event listener for the new form
    this.attachFormHandler()
  }

  /**
   * Attaches the submit event listener to the support form.
   * This now sends the form data to your email via FormSubmit.co.
   */
  attachFormHandler() {
    const form = document.getElementById('help-support-form')
    const formContainer = form ? form.parentElement : null
    if (!form || !formContainer) return

    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const formData = new FormData(form)
      const data = Object.fromEntries(formData.entries())
      const submitButton = form.querySelector('button[type="submit"]')

      // Show a "sending" state to the user
      form.style.opacity = '0.5'
      form.style.pointerEvents = 'none'
      if (submitButton) {
        submitButton.textContent = 'Sending...'
        submitButton.disabled = true
      }

      fetch('https://formsubmit.co/shashankan077@gmail.com', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(data)
      })
      .then(response => {
        if (!response.ok) {
          // Handle HTTP errors
          throw new Error(`Network response was not ok: ${response.statusText}`)
        }
        return response.json()
      })
      .then(data => {
        console.log('FormSubmit Success:', data)
        // Show the success message
        formContainer.innerHTML = `
          <div class="p-4 text-center bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 rounded-lg">
            <strong class="font-semibold">Thank you!</strong>
            <p class="text-sm">Your message has been sent. We'll be in touch soon.</p>
          </div>
        `
      })
      .catch(error => {
        console.error('Form Submission Error:', error)
        // Show an error message to the user
        formContainer.innerHTML = `
          <div class="p-4 text-center bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded-lg">
            <strong class="font-semibold">Submission Failed</strong>
            <p class="text-sm">Sorry, we couldn't send your message. Please try again later.</p>
            <button onclick="window.location.reload()" class="mt-2 px-3 py-1 bg-blue-500 text-white rounded text-xs">Reload Help</button>
          </div>
        `
        // Note: You might want a more sophisticated way to reset the modal
        // than window.location.reload(), but this is a simple fix.
      })
    })
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
          <div class="space-y-6">
            
            <div>
              <h4 class="text-lg font-semibold mb-2">Read the Docs</h4>
              <p class="text-sm mb-3 text-slate-600 dark:text-slate-400">Browse the full documentation for in-depth guides and API references.</p>
              <a href="documentation.html" class="inline-block w-full sm:w-auto px-4 py-3 bg-blue-500 text-white rounded-lg text-center font-semibold hover:bg-blue-600 transition" target="_blank">
                View Documentation
              </a>
            </div>

            <div>
              <h4 class="text-lg font-semibold mb-2">Submit a Support Request</h4>
              <p class="text-sm mb-3 text-slate-600 dark:text-slate-400">Can't find your answer? Fill out the form below and we'll get back to you.</p>
              
              <form id="help-support-form" class="space-y-4">
                <div>
                  <label for="support-email" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Your Email</label>
                  <input type="email" id="support-email" name="email" required class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="you@example.com">
                </div>
                <div>
                  <label for="support-subject" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Subject</Labe>
                  <input type="text" id="support-subject" name="subject" required class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g., Issue with saving file">
                </div>
                <div>
                  <label for="support-message" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">How can we help?</label>
                  <textarea id="support-message" name="message" rows="4" required class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Describe your issue or question in detail..."></textarea>
                </div>
                <button type="submit" class="w-full px-4 py-3 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900">
                  Send Message
                </button>
              </form>
            </div>

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
