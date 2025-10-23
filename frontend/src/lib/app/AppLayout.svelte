<!--
  AppLayout.svelte - Top-level layout component

  Composes the application shell with:
  - Toolbar at top
  - Breadcrumb below toolbar
  - LevelsBar on left
  - Main content area (children slot)

  @component
-->
<script lang="ts">
  import Toolbar from './Toolbar.svelte'
  import LevelsBar, { type Level } from './LevelsBar.svelte'
  import Breadcrumb, { type BreadcrumbItem } from './Breadcrumb.svelte'
  import type { Snippet } from 'svelte'

  /**
   * Props
   */
  interface Props {
    // Toolbar props
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
    /** Callback: Undo action */
    onUndo: () => void
    /** Callback: Redo action */
    onRedo: () => void
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

    // LevelsBar props
    /** Project name */
    projectName: string
    /** Navigation levels */
    levels: Level[]
    /** Callback: Project name changed */
    onProjectNameChange?: (name: string) => void
    /** Callback: Level clicked */
    onLevelClick?: (index: number) => void

    // Breadcrumb props
    /** Breadcrumb items */
    breadcrumbs?: BreadcrumbItem[]

    // Content slot
    /** Main content area */
    children: Snippet
  }

  let {
    // Toolbar
    selectedThumbnailSize,
    showThumbnailMenu,
    isSoundMuted,
    stickyTopRow,
    openEllipsisMenu,
    onUndo,
    onRedo,
    onRegenerate,
    onToggleThumbnailMenu,
    onSelectThumbnailSize,
    onToggleSound,
    onToggleStickyTopRow,
    onToggleEllipsisMenu,
    // LevelsBar
    projectName,
    levels,
    onProjectNameChange,
    onLevelClick,
    // Breadcrumb
    breadcrumbs = [],
    // Content
    children
  }: Props = $props()
</script>

<div class="app-container">
  <!-- Top Toolbar -->
  <Toolbar
    {selectedThumbnailSize}
    {showThumbnailMenu}
    {isSoundMuted}
    {stickyTopRow}
    {openEllipsisMenu}
    {onUndo}
    {onRedo}
    {onRegenerate}
    {onToggleThumbnailMenu}
    {onSelectThumbnailSize}
    {onToggleSound}
    {onToggleStickyTopRow}
    {onToggleEllipsisMenu}
  />

  <!-- Breadcrumb Navigation (optional) -->
  {#if breadcrumbs.length > 0}
    <Breadcrumb {breadcrumbs} />
  {/if}

  <div class="main-layout">
    <!-- Left Sidebar -->
    <LevelsBar
      {projectName}
      {levels}
      {onProjectNameChange}
      {onLevelClick}
    />

    <!-- Main Content Area -->
    <main class="content">
      {@render children()}
    </main>
  </div>
</div>

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #000;
  }

  .main-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .content {
    flex: 1;
    overflow: hidden;
    background: #000;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    position: relative;
  }
</style>
