<script lang="ts">
  import VideoMedia from '../VideoMedia.svelte'
  import type { Card } from '../sheet/types'

  // Props
  export let card: Card | null = null
  export let rowId: string
  export let colId: string
  export let cardId: string = ''
  export let isFirstRow: boolean = false
  export let stickyTopRow: boolean = true
  export let thumbnailSize: { width: number; height: number }
  export let isDragging: boolean = false
  export let draggedCard: { timeId: string; laneId: string; cardId: string } | null = null
  export let isColumnDragging: boolean = false
  export let dragPreview: { targetTime: string; targetLane: string; insertBefore: boolean } | null = null
  export let showShotHeader: boolean = false
  export let shotTitle: string = ''

  // Event handlers (passed as props)
  export let onDragStart: (e: DragEvent, rowId: string, colId: string, cardId: string) => void
  export let onDragOver: (e: DragEvent, rowId: string, colId: string, element: HTMLElement) => void
  export let onDrop: (e: DragEvent, rowId: string, colId: string) => void
  export let onDragEnd: (e: DragEvent) => void
  export let onColumnDragStart: (e: DragEvent, colId: string) => void
  export let onColumnDragOver: (e: DragEvent, colId: string) => void
  export let onColumnDrop: (e: DragEvent, colId: string) => void
  export let onResetColumnDrag: () => void
  export let onCardDoubleClick: (cardId: string) => void
  export let onDeleteCard: (rowId: string, colId: string) => void
  export let onCardTitleInput: (cardId: string, value: string) => void
  export let onCardTitleChange: (cardId: string, value: string) => void
  export let onFileUpload: (e: Event, rowId: string, colId: string) => void
  export let onShotTitleChange: (colId: string, value: string) => void
  export let onCardContextMenu: (e: MouseEvent, cardId: string) => void

  // Computed values
  $: isCardDragging = isDragging && draggedCard?.cardId === cardId
  $: isColumnDragHandle = !stickyTopRow && isFirstRow
  $: shouldShowPlaceholderBefore = dragPreview &&
    dragPreview.targetTime === rowId &&
    dragPreview.targetLane === colId &&
    dragPreview.insertBefore &&
    !isColumnDragging
  $: shouldShowPlaceholderAfter = dragPreview &&
    dragPreview.targetTime === rowId &&
    dragPreview.targetLane === colId &&
    !dragPreview.insertBefore &&
    !isColumnDragging

  // Prevent accidental double-clicks after delete
  let ignoreDoubleClick = false
  let ignoreDoubleClickTimeout: number | null = null

  function handleDelete(e: Event) {
    e.stopPropagation()
    onDeleteCard(rowId, colId)

    // Ignore double-clicks for 500ms after delete to prevent accidental modal opens
    ignoreDoubleClick = true
    if (ignoreDoubleClickTimeout) {
      clearTimeout(ignoreDoubleClickTimeout)
    }
    ignoreDoubleClickTimeout = setTimeout(() => {
      ignoreDoubleClick = false
    }, 500) as unknown as number
  }

  function handleDoubleClick() {
    if (!ignoreDoubleClick) {
      onCardDoubleClick(cardId)
    }
  }

  function handleFileClick() {
    document.getElementById(`upload-${rowId}-${colId}`)?.click()
  }
</script>

<!-- Cell wrapper with data attributes for scrolling -->
<div class="cell-wrapper" data-row={rowId} data-col={colId}>
<!-- Show shot header if this is first row and sticky is disabled -->
{#if showShotHeader}
  <div class="shot-header-title">
    <input
      type="text"
      class="shot-title-input"
      value={shotTitle}
      placeholder="Shot title"
      onchange={(e) => onShotTitleChange(colId, e.currentTarget.value)}
    />
  </div>
{/if}

<!-- Drag placeholder before card -->
{#if shouldShowPlaceholderBefore}
  <div
    class="drag-placeholder"
    style="width: {thumbnailSize.width}px; height: {thumbnailSize.height}px"
    ondrop={(e) => {
      if (isColumnDragging) return;
      onDrop(e, rowId, colId);
    }}
    ondragover={(e) => e.preventDefault()}
  ></div>
{/if}

{#if card}
  <!-- Filled card -->
  <div
    class="shot-card {isCardDragging ? 'dragging' : ''} {isColumnDragHandle ? 'column-drag-handle' : ''}"
    style="background-color: {card.thumb_url ? 'rgba(0, 0, 0, 0.3)' : card.color}; width: {thumbnailSize.width}px; height: {thumbnailSize.height}px"
    draggable="true"
    ondragstart={(e) => isColumnDragHandle ? onColumnDragStart(e, colId) : onDragStart(e, rowId, colId, cardId)}
    ondragover={(e) => {
      // If dragging a column, prevent default but let it bubble to column container
      if (isColumnDragging) {
        e.preventDefault();
        return;
      }
      (isColumnDragHandle ? onColumnDragOver(e, colId) : onDragOver(e, rowId, colId, e.currentTarget));
    }}
    ondrop={(e) => {
      // If dragging a column, let it bubble to column container; otherwise handle card drop
      if (isColumnDragging) {
        return;
      }
      (isColumnDragHandle ? onColumnDrop(e, colId) : onDrop(e, rowId, colId));
    }}
    ondragend={(e) => isColumnDragHandle ? onResetColumnDrag() : onDragEnd(e)}
    ondblclick={handleDoubleClick}
    oncontextmenu={(e) => {
      e.preventDefault();
      onCardContextMenu(e, cardId);
    }}
  >
    {#if card.isLoading}
      <!-- Loading spinner -->
      <div class="upload-loading">
        <div class="loading-spinner"></div>
      </div>
    {:else if card.media_type === 'video' && card.media_url && card.thumb_url}
      <div ondragstart={(e) => e.preventDefault()}>
        <VideoMedia src={card.media_url} thumbnail={card.thumb_url} />
      </div>
    {:else if card.thumb_url}
      <img
        src={card.thumb_url}
        alt={card.title}
        class="card-thumbnail"
        loading="lazy"
        decoding="async"
        ondragstart={(e) => e.preventDefault()}
      />
    {/if}
    {#if !card.thumb_url && !card.media_url && !card.isLoading}
    <div class="card-title-container">
      <input
        type="text"
        class="shot-title-input card-title-input"
        value={card.title}
        oninput={(e) => onCardTitleInput(cardId, e.currentTarget.value)}
        onchange={(e) => onCardTitleChange(cardId, e.currentTarget.value)}
        onclick={(e) => e.stopPropagation()}
      />
    </div>
    {/if}
    <button
      class="btn-delete"
      onclick={handleDelete}
    >
      ×
    </button>
  </div>
{:else}
  <!-- Blank cell with upload/generate icons on hover -->
  <div
    class="blank-cell"
    style="width: {thumbnailSize.width}px; height: {thumbnailSize.height}px"
    ondragover={(e) => {
      // If dragging a column, prevent default but let it bubble
      if (isColumnDragging) {
        e.preventDefault();
        return;
      }
      onDragOver(e, rowId, colId, e.currentTarget);
    }}
    ondrop={(e) => {
      // If dragging a column, let it bubble to column container
      if (isColumnDragging) return;
      onDrop(e, rowId, colId);
    }}
  >
    <input
      type="file"
      id="upload-{rowId}-{colId}"
      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
      multiple
      style="display: none"
      onchange={(e) => onFileUpload(e, rowId, colId)}
    />
    <button
      class="cell-action-btn upload-btn"
      title="Upload media"
      onclick={handleFileClick}
    >
      <span class="material-symbols-outlined">upload</span>
    </button>
    <button
      class="cell-action-btn generate-btn"
      title="Generate (coming soon)"
      disabled
    >
      <span class="material-symbols-outlined">add</span>
    </button>
  </div>
{/if}

<!-- Drag placeholder after card -->
{#if shouldShowPlaceholderAfter}
  <div
    class="drag-placeholder"
    style="width: {thumbnailSize.width}px; height: {thumbnailSize.height}px"
    ondrop={(e) => {
      if (isColumnDragging) return;
      onDrop(e, rowId, colId);
    }}
    ondragover={(e) => e.preventDefault()}
  ></div>
{/if}
</div><!-- End cell-wrapper -->

<style>
  /* Cell wrapper - transparent container for data attributes */
  .cell-wrapper {
    display: contents; /* Don't affect layout, just provide DOM node for querySelector */
  }

  /* Delete button */
  .btn-delete {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 0;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.7);
    color: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.15);
    cursor: pointer;
    font-size: 1.3rem;
    font-weight: 300;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s ease, background 0.1s ease;
    z-index: 10;
  }

  .shot-card:hover .btn-delete {
    opacity: 1;
  }

  .btn-delete:hover {
    background: rgba(0, 0, 0, 0.85);
    border-color: rgba(255, 255, 255, 0.2);
  }

  /* Shot title input */
  .shot-title-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.95);
    font-size: clamp(0.75rem, 1.5vw, 1.1rem);
    font-weight: 400;
    outline: none;
    padding: 0.5rem 0.75rem;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color 0.15s ease;
  }

  .shot-title-input:hover {
    color: rgba(255, 255, 255, 1);
  }

  .shot-title-input:focus {
    color: rgba(255, 255, 255, 1);
  }

  .card-title-input {
    flex: none;
    width: 50%;
    min-width: 60px;
    max-width: 200px;
    height: auto;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 20px;
    color: rgba(255, 255, 255, 0.9);
    font-size: clamp(0.7rem, 1.4vw, 1rem);
    font-weight: 400;
    outline: none;
    padding: 0.35rem 0.65rem;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: all 0.15s ease;
  }

  .card-title-input:hover {
    background: rgba(0, 0, 0, 0.4);
    border-color: rgba(255, 255, 255, 0.25);
    color: rgba(255, 255, 255, 1);
  }

  .card-title-input:focus {
    background: rgba(0, 0, 0, 0.5);
    border-color: rgba(100, 100, 255, 0.6);
    color: rgba(255, 255, 255, 1);
  }

  .card-title-container {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    width: 100%;
    position: relative;
    z-index: 1;
    padding: 8px;
  }

  /* Shot Card (Image placeholder) */
  .shot-card {
    position: relative;
    border-radius: 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    cursor: grab;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
  }

  /* Prevent child elements from interfering with card drag */
  .shot-card > * {
    pointer-events: none;
  }

  /* Re-enable pointer events for interactive elements */
  .shot-card .btn-delete,
  .shot-card .card-title-input {
    pointer-events: auto;
  }

  .shot-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .shot-card:active {
    cursor: grabbing;
  }

  .shot-card.dragging {
    opacity: 0.4;
    transform: scale(0.95);
  }

  .drag-placeholder {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.15);
    flex-shrink: 0;
  }

  /* Blank cell styles */
  .blank-cell {
    position: relative;
    border-radius: 0;
    border: 1px dashed rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.02);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex-shrink: 0;
    transition: border-color 0.2s ease, background 0.2s ease;
    cursor: pointer;
  }

  .blank-cell:hover {
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.04);
  }

  .cell-action-btn {
    width: 48px;
    height: 48px;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: color 0.2s ease, transform 0.2s ease;
    opacity: 0;
  }

  .blank-cell:hover .cell-action-btn {
    opacity: 1;
  }

  .cell-action-btn:hover:not(:disabled) {
    color: rgba(255, 255, 255, 0.9);
    transform: scale(1.15);
  }

  .cell-action-btn:disabled {
    cursor: not-allowed;
  }

  .blank-cell:hover .cell-action-btn:disabled {
    opacity: 0.3;
  }

  .cell-action-btn .material-symbols-outlined {
    font-size: 28px;
  }

  /* Card thumbnail */
  .card-thumbnail {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
    z-index: 0;
    user-select: none;
  }

  /* Upload loading state */
  .upload-loading {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.3);
    z-index: 5;
  }

  .loading-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top: 2px solid white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Shot header title */
  .shot-header-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
</style>
