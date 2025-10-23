<script lang="ts">
  import { onMount } from 'svelte'
  import * as Y from 'yjs'
  import VideoMedia from '../VideoMedia.svelte'
  import type { SheetConnection } from '../ySheet'
  import { setCardField, setCard } from '../ySheet'

  // Props interface
  interface Props {
    show: boolean
    cardId: string | null
    mediaId: string | null
    title: string
    color: string
    prompt: string
    mediaUrl: string | null
    mediaType: string | null
    thumbUrl: string | null
    attachments: any[]
    sheet: SheetConnection | null
    apiUrl: string
    userId: string
    cardsMetadata: Map<string, any>
    undoStack: any[]
    onClose: () => void
    onSave: (updates: { title: string; color: string; prompt: string }) => void
    onUpdateUndoStack: (stack: any[]) => void
    onUpdateRedoStack: (stack: any[]) => void
    onUpdateAttachments: (attachments: any[]) => void
  }

  let {
    show = $bindable(),
    cardId = $bindable(),
    mediaId = $bindable(),
    title = $bindable(),
    color = $bindable(),
    prompt = $bindable(),
    mediaUrl = $bindable(),
    mediaType = $bindable(),
    thumbUrl = $bindable(),
    attachments = $bindable(),
    sheet,
    apiUrl,
    userId,
    cardsMetadata,
    undoStack = $bindable(),
    onClose,
    onSave,
    onUpdateUndoStack,
    onUpdateRedoStack,
    onUpdateAttachments
  }: Props = $props()

  // Local state
  let canvasRef: HTMLCanvasElement | null = null
  let isDrawing = $state(false)
  let currentColor = $state('white')
  let drawingStrokes: any[] = $state([])
  let promptTextRef: HTMLTextAreaElement | null = null
  let promptYText: Y.Text | null = null

  // Per-media drawing undo/redo stacks (keyed by mediaId)
  let drawingHistory: Map<string, any[][]> = new Map()
  let drawingRedoStack: Map<string, any[][]> = new Map()

  // Canvas drawing functions
  function initCanvas(canvas: HTMLCanvasElement) {
    canvasRef = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size to match its display size
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height

    // Redraw existing strokes
    redrawCanvas()
  }

  function startDrawing(e: MouseEvent) {
    if (!canvasRef) return
    isDrawing = true
    const rect = canvasRef.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Start new stroke
    const newStroke = {
      color: currentColor,
      points: [{ x, y }]
    }
    drawingStrokes = [...drawingStrokes, newStroke]

    // Sync to Yjs
    if (sheet && mediaId) {
      const mediaDrawings = sheet.doc.getMap(`drawings_${mediaId}`)
      mediaDrawings.set('strokes', JSON.stringify(drawingStrokes))
    }
  }

  function draw(e: MouseEvent) {
    if (!isDrawing || !canvasRef) return

    const rect = canvasRef.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Add point to current stroke
    const currentStroke = drawingStrokes[drawingStrokes.length - 1]
    if (currentStroke) {
      currentStroke.points.push({ x, y })
      drawingStrokes = [...drawingStrokes]

      // Draw the line segment
      const ctx = canvasRef.getContext('2d')
      if (ctx) {
        const prevPoint = currentStroke.points[currentStroke.points.length - 2]
        ctx.strokeStyle = currentColor
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(prevPoint.x, prevPoint.y)
        ctx.lineTo(x, y)
        ctx.stroke()
      }

      // Sync to Yjs
      if (sheet && mediaId) {
        const mediaDrawings = sheet.doc.getMap(`drawings_${mediaId}`)
        mediaDrawings.set('strokes', JSON.stringify(drawingStrokes))
      }
    }
  }

  function stopDrawing() {
    if (isDrawing && mediaId) {
      // Save current state to history when stroke is complete (per media)
      const history = drawingHistory.get(mediaId) || []
      history.push(JSON.parse(JSON.stringify(drawingStrokes)))
      drawingHistory.set(mediaId, history)

      // Clear redo stack on new stroke
      drawingRedoStack.set(mediaId, [])
    }
    isDrawing = false
  }

  function undoStroke() {
    if (!mediaId) return

    const history = drawingHistory.get(mediaId) || []
    if (history.length === 0) return

    // Pop the last state from history
    const previousState = history.pop()
    drawingHistory.set(mediaId, history)

    // Save current state to redo stack
    const redoStack = drawingRedoStack.get(mediaId) || []
    redoStack.push(JSON.parse(JSON.stringify(drawingStrokes)))
    drawingRedoStack.set(mediaId, redoStack)

    // Restore previous state
    if (previousState) {
      drawingStrokes = previousState
      redrawCanvas()

      // Sync to Yjs
      if (sheet) {
        const mediaDrawings = sheet.doc.getMap(`drawings_${mediaId}`)
        mediaDrawings.set('strokes', JSON.stringify(drawingStrokes))
      }
    }
  }

  function redoStroke() {
    if (!mediaId) return

    const redoStack = drawingRedoStack.get(mediaId) || []
    if (redoStack.length === 0) return

    // Pop from redo stack
    const nextState = redoStack.pop()
    drawingRedoStack.set(mediaId, redoStack)

    // Save current state to history
    const history = drawingHistory.get(mediaId) || []
    history.push(JSON.parse(JSON.stringify(drawingStrokes)))
    drawingHistory.set(mediaId, history)

    // Restore next state
    if (nextState) {
      drawingStrokes = nextState
      redrawCanvas()

      // Sync to Yjs
      if (sheet) {
        const mediaDrawings = sheet.doc.getMap(`drawings_${mediaId}`)
        mediaDrawings.set('strokes', JSON.stringify(drawingStrokes))
      }
    }
  }

  function clearCanvas() {
    drawingStrokes = []
    if (canvasRef) {
      const ctx = canvasRef.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.width, canvasRef.height)
      }
    }

    // Sync to Yjs
    if (sheet && mediaId) {
      const mediaDrawings = sheet.doc.getMap(`drawings_${mediaId}`)
      mediaDrawings.set('strokes', JSON.stringify([]))
    }
  }

  function redrawCanvas() {
    if (!canvasRef) return
    const ctx = canvasRef.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvasRef.width, canvasRef.height)

    // Draw all strokes
    drawingStrokes.forEach(stroke => {
      if (stroke.points.length < 2) return

      ctx.strokeStyle = stroke.color
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y)

      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
      }
      ctx.stroke()
    })
  }

  function setDrawColor(color: string) {
    currentColor = color
  }

  // Bind textarea to Yjs Text for collaborative editing
  function bindPromptToYjs() {
    if (!promptTextRef || !promptYText) return

    let isLocalChange = false

    // Handle local input events
    const handleInput = () => {
      if (!promptTextRef || !promptYText) return
      isLocalChange = true

      const currentText = promptYText.toString()
      const newText = promptTextRef.value

      // Calculate diff and apply to Yjs
      if (currentText !== newText) {
        promptYText.delete(0, currentText.length)
        promptYText.insert(0, newText)
      }

      isLocalChange = false
    }

    // Observe remote changes from other users
    const observer = () => {
      if (isLocalChange || !promptTextRef || !promptYText) return

      const newText = promptYText.toString()

      // Only update if there's an actual change
      if (promptTextRef.value === newText) return

      // Check if user is actively editing this field
      const isActivelyEditing = document.activeElement === promptTextRef

      if (isActivelyEditing) {
        // User is typing - preserve cursor position carefully
        const start = promptTextRef.selectionStart || 0
        const end = promptTextRef.selectionEnd || 0

        promptTextRef.value = newText
        prompt = newText

        // Restore cursor position
        requestAnimationFrame(() => {
          if (promptTextRef) {
            promptTextRef.setSelectionRange(start, end)
          }
        })
      } else {
        // User is not editing - just update the value
        promptTextRef.value = newText
        prompt = newText
      }
    }

    promptYText.observe(observer)
    promptTextRef.addEventListener('input', handleInput)

    // Cleanup on modal close
    const cleanup = () => {
      if (promptYText) {
        promptYText.unobserve(observer)
      }
      if (promptTextRef) {
        promptTextRef.removeEventListener('input', handleInput)
      }
    }

    // Store cleanup function for later use
    ;(promptTextRef as any)._yjsCleanup = cleanup
  }

  // Format JSON in the prompt field
  function formatPromptAsJSON() {
    if (!prompt) return

    try {
      // Try to parse and format as JSON
      const parsed = JSON.parse(prompt)
      const formatted = JSON.stringify(parsed, null, 2)

      if (promptYText) {
        promptYText.delete(0, promptYText.length)
        promptYText.insert(0, formatted)
      }
      prompt = formatted
      if (promptTextRef) {
        promptTextRef.value = formatted
      }
    } catch (e) {
      // If it's not valid JSON, just try to pretty-print it anyway
      console.warn('Prompt is not valid JSON, cannot format')
    }
  }

  // Handle modal title input with real-time sync (granular update)
  function handleModalTitleInput(value: string) {
    title = value
    if (sheet && cardId) {
      setCardField(sheet, cardId, 'title', value)
    }
  }

  // Handle attachment upload
  async function handleAttachmentUpload(e: Event) {
    const target = e.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file || !cardId) return

    try {
      // Create FormData for upload
      const formData = new FormData()
      formData.append('file', file)
      formData.append('cardId', cardId)

      // Upload to backend (which will store in GCS)
      const response = await fetch(`${apiUrl}/api/attachments/upload`, {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const attachment = await response.json()
        // Add to attachments list
        attachments = [...attachments, attachment]
        onUpdateAttachments(attachments)

        // Sync to Yjs (granular update)
        if (sheet) {
          setCardField(sheet, cardId, 'attachments', [...attachments, attachment])
        }
      } else {
        console.error('Failed to upload attachment:', await response.text())
      }
    } catch (error) {
      console.error('Error uploading attachment:', error)
    }

    // Reset input
    target.value = ''
  }

  // Delete attachment
  async function deleteAttachment(attachmentId: string) {
    if (!cardId) return

    try {
      const response = await fetch(`${apiUrl}/api/attachments/${attachmentId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        // Remove from local state
        attachments = attachments.filter(a => a.id !== attachmentId)
        onUpdateAttachments(attachments)

        // Sync to Yjs (granular update)
        if (sheet) {
          setCardField(sheet, cardId, 'attachments', attachments.filter(a => a.id !== attachmentId))
        }
      } else {
        console.error('Failed to delete attachment:', await response.text())
      }
    } catch (error) {
      console.error('Error deleting attachment:', error)
    }
  }

  // Close modal
  function closeModal() {
    // Cleanup Yjs binding
    if (promptTextRef && (promptTextRef as any)._yjsCleanup) {
      (promptTextRef as any)._yjsCleanup()
    }

    onClose()
  }

  // Save modal changes
  async function saveModal() {
    if (!cardId) return

    console.log('[saveModal] Saving changes for card:', cardId)
    console.log('[saveModal] Title:', title, 'Color:', color, 'Prompt:', prompt)

    // Store previous state for undo
    const previousCard = cardsMetadata.get(cardId)
    if (previousCard) {
      const newUndoStack = [...undoStack, {
        type: 'edit',
        userId: userId,
        previousState: {
          cardId: cardId,
          title: previousCard.title,
          color: previousCard.color,
          prompt: previousCard.prompt || ''
        }
      }]
      onUpdateUndoStack(newUndoStack)
      // Clear redo stack on new action
      onUpdateRedoStack([])
      console.log('[saveModal] Saved to undo stack:', newUndoStack.length, 'operations')
    }

    try {
      // Update card metadata via API
      const response = await fetch(`${apiUrl}/api/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title,
          color: color,
          prompt: prompt
        })
      })

      if (response.ok) {
        // Update Yjs so it syncs to all clients
        const updatedCard = await response.json()
        if (sheet) {
          setCard(sheet, cardId, updatedCard)
        }
        console.log('[saveModal] Card updated successfully')
      } else {
        console.error('[saveModal] Failed to update card:', response.statusText)
      }
    } catch (error) {
      console.error('[saveModal] Error updating card:', error)
    }

    closeModal()
  }

  // Load drawing strokes when modal opens or mediaId changes
  $effect(() => {
    if (show && sheet && mediaId) {
      // Set up Yjs Text for collaborative prompt editing
      if (cardId) {
        promptYText = sheet.doc.getText(`prompt_${cardId}`)

        // Initialize the Yjs Text with current prompt if empty
        if (promptYText.length === 0 && prompt) {
          promptYText.insert(0, prompt)
        } else {
          // Load from Yjs
          prompt = promptYText.toString()
        }
      }

      // Load existing drawings for this specific media
      const mediaDrawings = sheet.doc.getMap(`drawings_${mediaId}`)
      const strokesData = mediaDrawings.get('strokes')
      if (strokesData) {
        try {
          drawingStrokes = JSON.parse(strokesData as string)
        } catch (e) {
          drawingStrokes = []
        }
      } else {
        drawingStrokes = []
      }

      // Observe drawing changes from other users for this media
      const observer = () => {
        const updatedStrokes = mediaDrawings.get('strokes')
        if (updatedStrokes) {
          try {
            drawingStrokes = JSON.parse(updatedStrokes as string)
            redrawCanvas()
          } catch (e) {
            console.error('Error parsing drawing strokes:', e)
          }
        }
      }
      mediaDrawings.observe(observer)

      // Initialize canvas and prompt binding after modal is shown
      setTimeout(() => {
        if (canvasRef) {
          initCanvas(canvasRef)
        }
        if (promptTextRef && promptYText) {
          bindPromptToYjs()
        }
      }, 100)

      // Cleanup on unmount
      return () => {
        mediaDrawings.unobserve(observer)
      }
    }
  })
</script>

{#if show}
  <div class="modal-overlay" onclick={closeModal}>
    <div class="modal-content-large" onclick={(e) => e.stopPropagation()}>
      <!-- Left side: Large card preview with canvas -->
      <div class="modal-left">
        <!-- Editable title above card -->
        <input
          type="text"
          class="modal-card-title"
          value={title}
          oninput={(e) => handleModalTitleInput(e.currentTarget.value)}
          placeholder="Shot title..."
        />

        <div class="modal-card-preview" style="background-color: {color}">
          {#if mediaType === 'video' && mediaUrl && thumbUrl}
            <VideoMedia src={mediaUrl} thumbnail={thumbUrl} />
          {:else if mediaUrl}
            <img
              src={mediaUrl}
              alt={title}
              class="modal-media-image"
              loading="eager"
            />
          {/if}
          <canvas
            bind:this={canvasRef}
            class="sketch-canvas"
            width="800"
            height="450"
            onmousedown={startDrawing}
            onmousemove={draw}
            onmouseup={stopDrawing}
            onmouseleave={stopDrawing}
          ></canvas>
        </div>

        <!-- Sketch tools -->
        <div class="sketch-tools">
          <span class="tool-label">Draw:</span>
          <button
            class="color-circle"
            class:active={currentColor === 'white'}
            style="background: white;"
            title="White"
            onclick={() => setDrawColor('white')}
          ></button>
          <button
            class="color-circle"
            class:active={currentColor === 'black'}
            style="background: black;"
            title="Black"
            onclick={() => setDrawColor('black')}
          ></button>

          <div class="tool-divider"></div>

          <button class="tool-btn" title="Undo stroke" onclick={undoStroke}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M8 4L4 8L8 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M4 8H14C15.1046 8 16 8.89543 16 10V12C16 13.1046 15.1046 14 14 14H10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="tool-btn" title="Redo stroke" onclick={redoStroke}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12 4L16 8L12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M16 8H6C4.89543 8 4 8.89543 4 10V12C4 13.1046 4.89543 14 6 14H10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          <div class="tool-divider"></div>

          <button class="tool-btn" title="Clear all" onclick={clearCanvas}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 6H16M8 6V4C8 3.44772 8.44772 3 9 3H11C11.5523 3 12 3.44772 12 4V6M6 6V16C6 16.5523 6.44772 17 7 17H13C13.5523 17 14 16.5523 14 16V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Right side: Edit controls -->
      <div class="modal-right">
        <div class="modal-header">
          <button class="modal-close-btn" onclick={closeModal}>×</button>
        </div>

        <div class="modal-fields">
          <div class="modal-field">
            <label class="modal-label">Color</label>
            <div class="color-input-group">
              <input
                type="color"
                class="modal-color-picker"
                bind:value={color}
              />
              <input
                type="text"
                class="modal-input modal-color-text"
                bind:value={color}
                placeholder="#CCCCCC"
                pattern="^#[0-9A-Fa-f]{6}$"
              />
            </div>
          </div>

          <div class="modal-field">
            <div class="prompt-header">
              <label class="modal-label">Prompt</label>
              <button class="format-json-btn" title="Format as JSON" onclick={formatPromptAsJSON}>
                <span class="material-symbols-outlined">data_object</span>
              </button>
            </div>
            <textarea
              bind:this={promptTextRef}
              class="modal-textarea"
              value={prompt}
              placeholder="Add a rowing oar"
              rows="8"
            ></textarea>
          </div>

          <div class="modal-field">
            <label class="modal-label">Attachments</label>
            <div class="attachments-gallery">
              <!-- Upload button -->
              <label class="attachment-upload-btn" title="Upload image or video">
                <span class="material-symbols-outlined">add_photo_alternate</span>
                <input type="file" accept="image/*,video/mp4,video/quicktime,video/webm" style="display: none;" onchange={handleAttachmentUpload} />
              </label>

              <!-- Attachment thumbnails -->
              {#each attachments as attachment}
                <div class="attachment-thumbnail">
                  <img src={attachment.thumbnailUrl} alt={attachment.name} />
                  <button
                    class="attachment-delete-btn"
                    title="Delete attachment"
                    onclick={() => deleteAttachment(attachment.id)}
                  >
                    ×
                  </button>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button class="modal-btn modal-btn-cancel" onclick={closeModal}>
            Cancel
          </button>
          <button class="modal-btn modal-btn-save" onclick={saveModal}>
            Save
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.92);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.2s ease;
    padding: 2rem;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-content-large {
    display: flex;
    gap: 1.5rem;
    background: #000;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    max-width: 1400px;
    max-height: 90vh;
    width: 100%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
    animation: slideUp 0.2s ease;
    overflow: hidden;
  }

  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .modal-left {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    min-width: 0;
  }

  .modal-card-title {
    background: transparent;
    border: none;
    color: white;
    font-size: 1.5rem;
    font-weight: 300;
    padding: 0.5rem 0 1rem 0;
    outline: none;
    text-align: left;
    letter-spacing: -0.01em;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .modal-card-title::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }

  .modal-card-title:focus {
    color: rgba(255, 255, 255, 1);
  }

  .modal-card-preview {
    width: 100%;
    border-radius: 8px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    aspect-ratio: 16 / 9;
  }

  .modal-media-image {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
    z-index: 0;
  }

  .sketch-canvas {
    position: relative;
    width: 100%;
    height: 100%;
    object-fit: contain;
    cursor: crosshair;
    border-radius: 8px;
    z-index: 1;
  }

  .sketch-tools {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 1rem;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
  }

  .tool-label {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.7);
    font-weight: 500;
  }

  .tool-btn {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: transparent;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .tool-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.95);
  }

  .color-circle {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.2);
    cursor: pointer;
    padding: 0;
    transition: all 0.15s;
  }

  .color-circle:hover {
    border-color: rgba(255, 255, 255, 0.4);
    transform: scale(1.1);
  }

  .color-circle.active {
    border-color: rgba(100, 150, 255, 0.8);
    box-shadow: 0 0 0 3px rgba(100, 150, 255, 0.2);
  }

  .tool-divider {
    width: 1px;
    height: 24px;
    background: rgba(255, 255, 255, 0.15);
    margin: 0 0.5rem;
  }

  .modal-right {
    width: 400px;
    display: flex;
    flex-direction: column;
    background: #0a0a0a;
    padding: 1.5rem;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .modal-close-btn {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    font-size: 28px;
    line-height: 1;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
  }

  .modal-fields {
    flex: 1;
    overflow-y: auto;
  }

  .modal-field {
    margin-bottom: 1.5rem;
  }

  .modal-label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .prompt-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .format-json-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition: all 0.15s;
  }

  .format-json-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.25);
    color: rgba(255, 255, 255, 0.8);
  }

  .format-json-btn .material-symbols-outlined {
    font-size: 18px;
  }

  .modal-input {
    width: 100%;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.95);
    font-size: 0.95rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    outline: none;
    transition: all 0.2s;
    box-sizing: border-box;
  }

  .modal-input:focus {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(100, 150, 255, 0.5);
  }

  .modal-input::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }

  .color-input-group {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .modal-color-picker {
    width: 60px;
    height: 44px;
    padding: 4px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .modal-color-picker:hover {
    border-color: rgba(255, 255, 255, 0.25);
  }

  .modal-color-text {
    flex: 1;
    text-transform: uppercase;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .modal-textarea {
    width: 100%;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.95);
    font-size: 0.875rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.5;
    resize: vertical;
    outline: none;
    transition: all 0.2s;
    box-sizing: border-box;
  }

  .modal-textarea:focus {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(100, 150, 255, 0.5);
  }

  .modal-textarea::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }

  .attachments-gallery {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    min-height: 80px;
  }

  .attachment-upload-btn {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px dashed rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    color: rgba(255, 255, 255, 0.4);
  }

  .attachment-upload-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.3);
    color: rgba(255, 255, 255, 0.6);
  }

  .attachment-upload-btn .material-symbols-outlined {
    font-size: 24px;
  }

  .attachment-thumbnail {
    position: relative;
    width: 64px;
    height: 64px;
    border-radius: 6px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .attachment-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .attachment-delete-btn {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 20px;
    height: 20px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    border: none;
    border-radius: 50%;
    color: rgba(255, 255, 255, 0.9);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .attachment-thumbnail:hover .attachment-delete-btn {
    opacity: 1;
  }

  .attachment-delete-btn:hover {
    background: rgba(255, 50, 50, 0.9);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 2rem;
  }

  .modal-btn {
    padding: 0.65rem 1.5rem;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .modal-btn-cancel {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .modal-btn-cancel:hover {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.9);
  }

  .modal-btn-save {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
  }

  .modal-btn-save:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }
</style>
