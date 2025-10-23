<script lang="ts">
  import { flip } from 'svelte/animate'
  import SheetCard from './SheetCard.svelte'
  import type { Card } from '../sheet/types'

  // Props
  export let colId: string
  export let colIndex: number
  export let displayRows: string[]
  export let stickyTopRow: boolean = true
  export let rows: string[]
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

  // Event handlers
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
</script>

<div class="column-wrapper">
  <!-- Column drop indicator before -->
  {#if columnDragPreview && columnDragPreview.targetColIndex === colIndex && columnDragPreview.insertBefore}
    <div
      class="column-drop-indicator"
      style="min-width: {thumbnailSize.width}px;"
      ondragover={(e) => { e.preventDefault(); onColumnDragOver(e, colId); }}
      ondrop={(e) => onColumnDrop(e, colId)}
    ></div>
  {/if}

  <div
    class="column {draggedColumn === colId ? 'column-dragging' : ''}"
    style="width: {thumbnailSize.width}px; gap: {thumbnailSize.width * 0.035}px"
    ondragover={(e) => onColumnDragOver(e, colId)}
    ondrop={(e) => onColumnDrop(e, colId)}
  >
    <!-- Get all cards in this lane (skip first time if sticky) -->
    {#each (stickyTopRow ? displayRows.slice(1) : displayRows) as rowId (rowId)}
      {@const key = cellKey(rowId, colId)}
      {@const cell = cellsMap.get(key)}
      {@const cardId = cell?.cardId}
      {@const card = cardId ? cardsMetadata.get(cardId) : null}
      {@const isFirstRow = rowId === rows[0]}

      <!-- Show shot header if this is first row and sticky is disabled -->
      {#if !stickyTopRow && isFirstRow && !colId.startsWith('phantom-')}
        <div class="shot-header-title">
          <input
            type="text"
            class="shot-title-input"
            value={shotTitles.get(colId) || `Shot ${colId.replace('c-', '').replace('media', '1').replace('alt', '2').replace('notes', '3')}`}
            placeholder="Shot title"
            onchange={(e) => onShotTitleChange(colId, e.currentTarget.value)}
          />
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
        </div>
      {/if}

      <!-- Use SheetCard component -->
      <SheetCard
        {card}
        {rowId}
        {colId}
        {cardId}
        {isFirstRow}
        {stickyTopRow}
        {thumbnailSize}
        {isDragging}
        {draggedCard}
        {isColumnDragging}
        {dragPreview}
        showShotHeader={false}
        shotTitle=""
        onDragStart={(e, r, c, cId) => !stickyTopRow && isFirstRow ? onColumnDragStart(e, colId) : onDragStart(e, r, c, cId)}
        onDragOver={(e, r, c, el) => {
          if (isColumnDragging) {
            e.preventDefault();
            return;
          }
          (!stickyTopRow && isFirstRow ? onColumnDragOver(e, colId) : onDragOver(e, r, c, el));
        }}
        onDrop={(e, r, c) => {
          if (isColumnDragging) return;
          (!stickyTopRow && isFirstRow ? onColumnDrop(e, colId) : onDrop(e, r, c));
        }}
        onDragEnd={(e) => !stickyTopRow && isFirstRow ? onResetColumnDrag() : onDragEnd(e)}
        onColumnDragStart={onColumnDragStart}
        onColumnDragOver={onColumnDragOver}
        onColumnDrop={onColumnDrop}
        onResetColumnDrag={onResetColumnDrag}
        onCardDoubleClick={onCardDoubleClick}
        onDeleteCard={onDeleteCard}
        onCardTitleInput={onCardTitleInput}
        onCardTitleChange={onCardTitleChange}
        onFileUpload={onFileUpload}
        onShotTitleChange={onShotTitleChange}
        onCardContextMenu={onCardContextMenu}
      />
    {/each}
  </div>

  <!-- Column drop indicator after -->
  {#if columnDragPreview && columnDragPreview.targetColIndex === colIndex && !columnDragPreview.insertBefore}
    <div
      class="column-drop-indicator"
      style="min-width: {thumbnailSize.width}px;"
      ondragover={(e) => { e.preventDefault(); onColumnDragOver(e, colId); }}
      ondrop={(e) => onColumnDrop(e, colId)}
    ></div>
  {/if}
</div>

<style>
  .column-wrapper {
    display: contents;
  }

  .column {
    display: flex;
    flex-direction: column;
    transition: opacity 0.2s ease, transform 0.2s ease;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .column.column-dragging {
    opacity: 0.5;
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
    font-size: 0.9rem;
    font-weight: 500;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    transition: background-color 0.2s ease;
  }

  .shot-title-input:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .shot-title-input:focus {
    outline: none;
    background: rgba(255, 255, 255, 0.08);
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
    transition: all 0.2s ease;
  }

  .icon-btn-header:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.95);
  }

  .icon-btn-header .material-symbols-outlined {
    font-size: 18px;
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
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.875rem;
    cursor: pointer;
    border-radius: 4px;
    transition: background-color 0.15s ease;
    text-align: left;
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
    color: rgba(255, 100, 100, 0.95);
  }

  .column-dropdown-menu .menu-item.delete-item:hover {
    background: rgba(255, 100, 100, 0.15);
  }

  .column-dropdown-menu .menu-item.delete-item .material-symbols-outlined {
    color: rgba(255, 100, 100, 0.9);
  }
</style>
