<script lang="ts">
  import { flip } from 'svelte/animate'
  import SheetColumn from './SheetColumn.svelte'
  import VideoMedia from '../VideoMedia.svelte'
  import type { Card } from '../sheet/types'

  // Props
  export let displayCols: string[]
  export let displayRows: string[]
  export let rows: string[]
  export let stickyTopRow: boolean
  export let cellsMap: Map<string, { cardId: string }>
  export let cardsMetadata: Map<string, Card>
  export let thumbnailSize: { width: number; height: number }
  export let shotTitles: Map<string, string>
  export let draggedColumn: string | null
  export let isColumnDragging: boolean
  export let columnDragPreview: { targetColIndex: number; insertBefore: boolean } | null
  export let isDragging: boolean
  export let draggedCard: { timeId: string; laneId: string; cardId: string } | null
  export let dragPreview: { targetTime: string; targetLane: string; insertBefore: boolean } | null
  export let openColumnMenu: string | null
  export let timeline: string[]

  // Refs
  export let frozenRowRef: HTMLDivElement | null = null
  export let columnsContainerRef: HTMLDivElement | null = null

  // Event handlers
  export let onSyncColumnsScroll: (e: Event) => void
  export let onColumnDragStart: (e: DragEvent, colId: string) => void
  export let onColumnDragOver: (e: DragEvent, colId: string) => void
  export let onColumnDrop: (e: DragEvent, colId: string) => void
  export let onResetColumnDrag: () => void
  export let onDragStart: (e: DragEvent, rowId: string, colId: string, cardId: string) => void
  export let onDragOver: (e: DragEvent, rowId: string, colId: string, element: HTMLElement) => void
  export let onDrop: (e: DragEvent, rowId: string, colId: string) => void
  export let onDragEnd: (e: DragEvent) => void
  export let onCardDoubleClick: (cardId: string) => void
  export let onDeleteCard: (rowId: string, colId: string) => void
  export let onCardTitleInput: (cardId: string, value: string) => void
  export let onCardTitleChange: (cardId: string, value: string) => void
  export let onFileUpload: (e: Event, rowId: string, colId: string) => void
  export let onShotTitleChange: (colId: string, value: string) => void
  export let onToggleColumnMenu: (colId: string, e: MouseEvent) => void
  export let onCloseColumnMenu: () => void
  export let onDuplicateColumn: (colId: string) => void
  export let onDeleteColumn: (colId: string) => void
  export let onColumnDownload: (colId: string) => void
  export let onCardContextMenu: (e: MouseEvent, cardId: string) => void

  // Helper function to generate cell keys
  function cellKey(rowId: string, colId: string): string {
    return `${rowId}:${colId}`
  }

  // Calculate gap based on thumbnail size
  $: gap = thumbnailSize.width * 0.05

  // Handle vertical scroll on frozen row - propagate to columns container
  function handleFrozenRowWheel(e: WheelEvent) {
    if (columnsContainerRef && Math.abs(e.deltaY) > 0) {
      // Prevent default scroll behavior
      e.preventDefault()
      // Propagate vertical scroll to columns container
      columnsContainerRef.scrollTop += e.deltaY
    }
  }
</script>

<div class="sheet-view">
  <!-- Frozen header row with shot titles -->
  {#if stickyTopRow}
  <div
    bind:this={frozenRowRef}
    class="frozen-row"
    style="gap: {gap}px"
    onscroll={onSyncColumnsScroll}
    onwheel={handleFrozenRowWheel}
  >
    {#each displayCols as colId, colIndex (colId)}
      <div class="column-wrapper" animate:flip={{ duration: 300 }}>
        <!-- Column drop indicator -->
        {#if columnDragPreview && columnDragPreview.targetColIndex === colIndex && columnDragPreview.insertBefore}
          <div
            class="column-drop-indicator"
            style="min-width: {thumbnailSize.width}px;"
            ondragover={(e) => { e.preventDefault(); onColumnDragOver(e, colId); }}
            ondrop={(e) => { console.log('[frozen drop indicator before ondrop]'); onColumnDrop(e, colId); }}
          ></div>
        {/if}
        <div
          class="shot-column {draggedColumn === colId ? 'column-dragging' : ''}"
          style="width: {thumbnailSize.width}px"
          ondragover={(e) => onColumnDragOver(e, colId)}
          ondrop={(e) => onColumnDrop(e, colId)}
        >
        <!-- Title and icons on same line -->
        <div class="shot-header-title">
          <input
            type="text"
            class="shot-title-input"
            value={colId.startsWith('phantom-') ? '' : (shotTitles.get(colId) || `Shot ${colId.replace('c-', '').replace('media', '1').replace('alt', '2').replace('notes', '3')}`)}
            placeholder={colId.startsWith('phantom-') ? 'New column' : 'Shot title'}
            onchange={(e) => onShotTitleChange(colId, e.currentTarget.value)}
            disabled={colId.startsWith('phantom-')}
          />
          {#if !colId.startsWith('phantom-')}
          <div class="shot-header-menu">
            <button class="icon-btn-header menu-btn" title="Column options" onclick={(e) => onToggleColumnMenu(colId, e)}>
              <span class="material-symbols-outlined">more_vert</span>
            </button>

            {#if openColumnMenu === colId}
              <div class="column-dropdown-menu" onclick={(e) => e.stopPropagation()}>
                <button class="menu-item" onclick={() => { onDuplicateColumn(colId); onCloseColumnMenu(); }}>
                  <span class="material-symbols-outlined">content_copy</span>
                  <span>Duplicate</span>
                </button>
                <button class="menu-item" onclick={onCloseColumnMenu}>
                  <span class="material-symbols-outlined">comment</span>
                  <span>Comment</span>
                </button>
                <button class="menu-item" onclick={() => { onColumnDownload(colId); onCloseColumnMenu(); }}>
                  <span class="material-symbols-outlined">file_download</span>
                  <span>Download</span>
                </button>
                <button class="menu-item delete-item" onclick={() => { onDeleteColumn(colId); onCloseColumnMenu(); }}>
                  <span class="material-symbols-outlined">delete</span>
                  <span>Delete</span>
                </button>
              </div>
            {/if}
          </div>
          {/if}
        </div>

        <!-- First card (frozen) -->
        {#if timeline.length > 0}
          {@const firstTimeId = timeline[0]}
          {@const key = cellKey(firstTimeId, colId)}
          {@const cell = cellsMap.get(key)}
          {@const cardId = cell?.cardId}
          {@const card = cardId ? cardsMetadata.get(cardId) : null}

          {#if card}
            <div
              class="shot-card column-drag-handle"
              style="background-color: {card.thumb_url ? 'rgba(0, 0, 0, 0.3)' : card.color}; width: {thumbnailSize.width}px; height: {thumbnailSize.height}px"
              draggable="true"
              ondragstart={(e) => onColumnDragStart(e, colId)}
              ondragover={(e) => onColumnDragOver(e, colId)}
              ondrop={(e) => onColumnDrop(e, colId)}
              ondragend={onResetColumnDrag}
              ondblclick={() => onCardDoubleClick(cardId)}
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
                  value={card.number ? `${card.title} ${card.number}` : card.title}
                  oninput={(e) => onCardTitleInput(cardId, e.currentTarget.value)}
                  onchange={(e) => onCardTitleChange(cardId, e.currentTarget.value)}
                  onclick={(e) => e.stopPropagation()}
                />
              </div>
              {/if}
              <button
                class="btn-delete"
                onclick={(e) => {
                  e.stopPropagation()
                  onDeleteCard(firstTimeId, colId)
                }}
              >
                ×
              </button>
            </div>
          {/if}
        {/if}
      </div>

        <!-- Column drop indicator after -->
        {#if columnDragPreview && columnDragPreview.targetColIndex === colIndex && !columnDragPreview.insertBefore}
          <div
            class="column-drop-indicator"
            style="min-width: {thumbnailSize.width}px;"
            ondragover={(e) => { e.preventDefault(); onColumnDragOver(e, colId); }}
            ondrop={(e) => { console.log('[drop indicator after ondrop]'); onColumnDrop(e, colId); }}
          ></div>
        {/if}
      </div>
    {/each}
  </div>
  {/if}

  <!-- Scrollable columns area -->
  <div
    bind:this={columnsContainerRef}
    class="columns-container"
    style="gap: {gap}px"
    onscroll={onSyncColumnsScroll}
  >
    {#each displayCols as colId, colIndex (colId)}
      <SheetColumn
        {colId}
        {colIndex}
        {displayRows}
        {stickyTopRow}
        {rows}
        {cellsMap}
        {cardsMetadata}
        thumbnailSize={thumbnailSize}
        {shotTitles}
        {draggedColumn}
        {isColumnDragging}
        {columnDragPreview}
        {isDragging}
        {draggedCard}
        {dragPreview}
        {openColumnMenu}
        onColumnDragStart={onColumnDragStart}
        onColumnDragOver={onColumnDragOver}
        onColumnDrop={onColumnDrop}
        onResetColumnDrag={onResetColumnDrag}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onCardDoubleClick={onCardDoubleClick}
        onDeleteCard={onDeleteCard}
        onCardTitleInput={onCardTitleInput}
        onCardTitleChange={onCardTitleChange}
        onFileUpload={onFileUpload}
        onShotTitleChange={onShotTitleChange}
        onToggleColumnMenu={onToggleColumnMenu}
        onCloseColumnMenu={onCloseColumnMenu}
        onDuplicateColumn={onDuplicateColumn}
        onDeleteColumn={onDeleteColumn}
        onColumnDownload={onColumnDownload}
        onCardContextMenu={onCardContextMenu}
      />
    {/each}
  </div>
</div>

<style>
  .sheet-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  /* Frozen Row - Shot Headers */
  .frozen-row {
    display: flex;
    padding-bottom: 1rem;
    border-bottom: 2px solid rgba(255, 255, 255, 0.15);
    margin-bottom: 1rem;
    overflow-x: auto;
    overflow-y: visible;
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE/Edge */
  }

  .frozen-row::-webkit-scrollbar {
    display: none; /* Chrome/Safari/Opera */
  }

  .shot-column {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transition: opacity 0.2s ease, transform 0.2s ease;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .shot-column.column-dragging {
    opacity: 0.5;
  }

  /* Ghost the frozen row card being dragged */
  .shot-column.column-dragging .shot-card {
    opacity: 0.7;
    transform: scale(0.98);
    transition: opacity 0.2s ease, transform 0.2s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .column-drop-indicator {
    min-width: var(--column-width, 320px);
    background: rgba(100, 150, 255, 0.08);
    border: 2px solid rgba(100, 150, 255, 0.4);
    border-radius: 8px;
    box-shadow: 0 0 0 1px rgba(100, 150, 255, 0.2), 0 4px 16px rgba(100, 150, 255, 0.2);
    align-self: stretch;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
  }

  .column-wrapper {
    display: contents;
  }

  .shot-header-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    gap: 0.5rem;
    width: 100%;
    max-width: 100%;
  }

  .shot-title-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.95);
    font-size: clamp(0.75rem, 1.5vw, 1.1rem);
    font-weight: 400;
    outline: none;
    padding: 0.25rem 0;
    border-radius: 0;
    transition: all 0.15s;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
    padding: 0.35rem 0.75rem;
    color: rgba(255, 255, 255, 0.95);
    font-size: clamp(0.625rem, 0.5vw + 0.5rem, 0.875rem);
    font-weight: 500;
    text-align: center;
    outline: none;
    transition: all 0.15s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
  }

  .shot-header-menu {
    position: relative;
    display: flex;
    flex-shrink: 0;
    align-items: center;
  }

  .icon-btn-header {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .icon-btn-header:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.95);
  }

  .icon-btn-header .material-symbols-outlined {
    font-size: 20px;
  }

  .column-dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: rgba(20, 20, 20, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    min-width: 160px;
    padding: 4px;
    z-index: 1000;
    backdrop-filter: blur(10px);
  }

  .column-dropdown-menu .menu-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    font-size: 14px;
  }

  .column-dropdown-menu .menu-item:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .column-dropdown-menu .menu-item .material-symbols-outlined {
    font-size: 18px;
    color: rgba(255, 255, 255, 0.7);
  }

  .column-dropdown-menu .menu-item span:last-child {
    flex: 1;
  }

  .column-dropdown-menu .menu-item.delete-item {
    color: rgba(255, 100, 100, 0.9);
  }

  .column-dropdown-menu .menu-item.delete-item:hover {
    background: rgba(255, 100, 100, 0.15);
    color: rgba(255, 120, 120, 1);
  }

  .column-dropdown-menu .menu-item.delete-item .material-symbols-outlined {
    color: rgba(255, 100, 100, 0.8);
  }

  /* Columns Container */
  .columns-container {
    display: flex;
    overflow-x: auto;
    overflow-y: auto;
    flex: 1;
    padding-bottom: 2rem;
    padding-right: 1rem;
    min-height: 0;
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
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-sizing: border-box;
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
    transform: scale(1.02);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  }

  .shot-card:active {
    cursor: grabbing;
  }

  .shot-card.dragging {
    opacity: 0.4;
    transform: scale(0.95);
  }

  .card-thumbnail {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 0;
    display: block;
  }

  .btn-delete {
    position: absolute;
    top: 0.25rem;
    right: 0.25rem;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.7);
    color: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    line-height: 1;
    opacity: 0;
    transition: all 0.2s ease;
    padding: 0;
    font-family: Arial, sans-serif;
  }

  .shot-card:hover .btn-delete {
    opacity: 1;
  }

  .btn-delete:hover {
    background: rgba(255, 50, 50, 0.9);
    transform: scale(1.1);
  }

  .upload-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .loading-spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: rgba(255, 255, 255, 0.8);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
