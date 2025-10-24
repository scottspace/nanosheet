<!--
  Toolbar.svelte - Top application toolbar

  Features:
  - App title ("Storyboard")
  - Undo/Redo buttons
  - Archive button
  - Thumbnail size dropdown menu
  - Sound mute/unmute toggle
  - Ellipsis menu (with sticky top row toggle)
  - Regenerate button (dev)
  - Profile badge

  @component
-->
<script lang="ts">
  import { THUMBNAIL_SIZES } from '../sheet/SheetState.svelte.ts'

  /**
   * Props
   */
  interface Props {
    /** Selected thumbnail size index (0-7) */
    selectedThumbnailSize: number
    /** Show thumbnail menu */
    showThumbnailMenu: boolean
    /** Sound muted state */
    isSoundMuted: boolean
    /** Sticky top row enabled */
    stickyTopRow: boolean
    /** Open ellipsis menu ID */
    openEllipsisMenu: string | null
    /** Current orientation */
    orientation: 'vertical' | 'horizontal'
    /** Callback: Undo action */
    onUndo: () => void
    /** Callback: Redo action */
    onRedo: () => void
    /** Callback: Set orientation */
    onSetOrientation: (orientation: 'vertical' | 'horizontal') => void
    /** Callback: Regenerate sheet (dev) */
    onRegenerate: () => void
    /** Callback: Toggle thumbnail menu */
    onToggleThumbnailMenu: () => void
    /** Callback: Select thumbnail size */
    onSelectThumbnailSize: (index: number) => void
    /** Callback: Toggle sound mute */
    onToggleSound: () => void
    /** Callback: Toggle sticky top row */
    onToggleStickyTopRow: () => void
    /** Callback: Toggle ellipsis menu */
    onToggleEllipsisMenu: (id: string) => void
    /** Callback: Show toast notification */
    onShowToast: (message: string) => void
  }

  let {
    selectedThumbnailSize,
    showThumbnailMenu,
    isSoundMuted,
    stickyTopRow,
    openEllipsisMenu,
    orientation,
    onUndo,
    onRedo,
    onSetOrientation,
    onRegenerate,
    onToggleThumbnailMenu,
    onSelectThumbnailSize,
    onToggleSound,
    onToggleStickyTopRow,
    onToggleEllipsisMenu,
    onShowToast
  }: Props = $props()
</script>

<div class="toolbar">
  <div class="toolbar-left">
    <span class="app-title">Storyboard</span>
  </div>

  <div class="toolbar-right">
    <button class="icon-btn" title="Undo" onclick={onUndo}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M8 4L4 8L8 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M4 8H14C15.1046 8 16 8.89543 16 10V12C16 13.1046 15.1046 14 14 14H10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <button class="icon-btn" title="Redo" onclick={onRedo}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M12 4L16 8L12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M16 8H6C4.89543 8 4 8.89543 4 10V12C4 13.1046 4.89543 14 6 14H10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <div class="toolbar-divider"></div>

    <button
      class="icon-btn"
      class:active={orientation === 'vertical'}
      title="Vertical orientation"
      onclick={() => onSetOrientation('vertical')}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="4" width="14" height="12" stroke="currentColor" stroke-width="1.5" rx="1"/>
        <line x1="10" y1="4" x2="10" y2="16" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
    <button
      class="icon-btn"
      class:active={orientation === 'horizontal'}
      title="Horizontal orientation"
      onclick={() => onSetOrientation('horizontal')}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="4" y="3" width="12" height="14" stroke="currentColor" stroke-width="1.5" rx="1"/>
        <line x1="4" y1="10" x2="16" y2="10" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>

    <div class="toolbar-divider"></div>

    <div class="thumbnail-dropdown">
      <button class="btn-size-display" onclick={(e) => { e.stopPropagation(); onToggleThumbnailMenu(); }}>
        {THUMBNAIL_SIZES[selectedThumbnailSize].label}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-left: 4px;">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      {#if showThumbnailMenu}
        <div class="thumbnail-menu">
          {#each THUMBNAIL_SIZES as size, index}
            <button
              class="thumbnail-menu-item"
              class:selected={selectedThumbnailSize === index}
              onclick={() => onSelectThumbnailSize(index)}
            >
              {size.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <button class="btn-toolbar" onclick={() => onShowToast('Archive feature not yet implemented')}>Archive</button>

    <button class="icon-btn" title="Sound" onclick={onToggleSound}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 4L6 8H3V12H6L10 16V4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M14 7C14.6 8 15 9.5 15 10C15 10.5 14.6 12 14 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <!-- Ellipsis menu -->
    <div class="ellipsis-menu-container">
      <button class="icon-btn" title="More options" onclick={() => onToggleEllipsisMenu('toolbar')}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="4" r="1.5" fill="currentColor"/>
          <circle cx="10" cy="10" r="1.5" fill="currentColor"/>
          <circle cx="10" cy="16" r="1.5" fill="currentColor"/>
        </svg>
      </button>

      {#if openEllipsisMenu === 'toolbar'}
        <div class="ellipsis-menu">
          <button
            class="ellipsis-menu-item"
            onclick={() => { onToggleStickyTopRow(); onToggleEllipsisMenu('toolbar'); }}
          >
            <span class="menu-checkbox">{stickyTopRow ? '✓' : ''}</span>
            Sticky top row
          </button>
        </div>
      {/if}
    </div>

    <button class="icon-btn" onclick={onRegenerate} title="Regenerate (Dev)">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C12.7614 3 15.1355 4.63 16.2686 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M17 4V7H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <div class="profile-badge">
      <div class="profile-info">
        <span class="plan-name">ULTRA</span>
        <div class="profile-pic">SP</div>
      </div>
    </div>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 52px;
    padding: 0 1rem;
    background: #0a0a0a;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toolbar-divider {
    width: 1px;
    height: 24px;
    background: rgba(255, 255, 255, 0.1);
    margin: 0 0.25rem;
  }

  .app-title {
    font-size: 0.95rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
    letter-spacing: -0.01em;
  }

  .icon-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    transition: all 0.15s;
  }

  .icon-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.9);
  }

  .icon-btn.active {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 1);
  }

  .btn-toolbar {
    padding: 0.5rem 1rem;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-toolbar:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.9);
  }

  .btn-size-display {
    padding: 0.35rem 0.5rem;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.7rem;
    font-family: 'Monaco', 'Menlo', monospace;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    white-space: nowrap;
  }

  .btn-size-display:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.9);
  }

  .thumbnail-dropdown {
    position: relative;
  }

  .thumbnail-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 140px;
    background: #1a1a1a;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    padding: 0.25rem;
    z-index: 1000;
  }

  .thumbnail-menu-item {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.75rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
    font-family: 'Monaco', 'Menlo', monospace;
  }

  .thumbnail-menu-item:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.95);
  }

  .thumbnail-menu-item.selected {
    background: rgba(100, 100, 255, 0.2);
    color: rgba(255, 255, 255, 0.95);
  }

  .profile-badge {
    display: flex;
    align-items: center;
    margin-left: 0.5rem;
  }

  .profile-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .profile-info:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .plan-name {
    font-size: 0.7rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    letter-spacing: 0.05em;
  }

  .profile-pic {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
  }

  /* Ellipsis menu */
  .ellipsis-menu-container {
    position: relative;
    display: flex;
  }

  .ellipsis-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 180px;
    background: #1a1a1a;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8);
    padding: 0.5rem;
    z-index: 10000;
  }

  .ellipsis-menu-item {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.875rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
    font-family: 'Monaco', 'Menlo', monospace;
  }

  .ellipsis-menu-item:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.95);
  }

  .menu-checkbox {
    display: inline-block;
    width: 1.2em;
    margin-right: 0.5em;
    text-align: center;
    color: rgba(255, 255, 255, 0.9);
  }
</style>
