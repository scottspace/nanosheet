<!--
  EXAMPLE.svelte - Example usage of app shell components

  This file demonstrates how to use the AppLayout and its child components.
  Copy and adapt this code to integrate the app shell into your application.

  @example
-->
<script lang="ts">
  import { AppLayout } from '$lib/app'
  import type { Level, BreadcrumbItem } from '$lib/app'

  // ============================================================================
  // STATE (typically from SheetState or your state management)
  // ============================================================================

  let selectedThumbnailSize = $state(3)  // 256×144 (default)
  let showThumbnailMenu = $state(false)
  let isSoundMuted = $state(false)
  let stickyTopRow = $state(true)
  let openEllipsisMenu = $state<string | null>(null)
  let projectName = $state('Mystic Lake')

  // ============================================================================
  // LEVELS DATA (compute from your actual data)
  // ============================================================================

  const levels: Level[] = [
    { name: 'Film', count: 0, active: false },
    { name: 'Blocks', count: 0, active: false },
    { name: 'Scenes', count: 0, active: false },
    { name: 'Shots', count: 3, active: true },   // Active level
    { name: 'Images', count: 7, active: false }
  ]

  // ============================================================================
  // BREADCRUMBS (optional navigation path)
  // ============================================================================

  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Film', onclick: () => console.log('Navigate to Film') },
    { label: 'Block 1', onclick: () => console.log('Navigate to Block 1') },
    { label: 'Scene 3', onclick: () => console.log('Navigate to Scene 3') },
    { label: 'Shots' }  // Last item, no onclick = not clickable
  ]

  // ============================================================================
  // TOOLBAR CALLBACKS
  // ============================================================================

  function handleUndo() {
    console.log('[Example] Undo')
    // Your undo logic here
  }

  function handleRedo() {
    console.log('[Example] Redo')
    // Your redo logic here
  }

  function handleRegenerate() {
    console.log('[Example] Regenerate')
    // Your regenerate logic here
  }

  function toggleThumbnailMenu() {
    showThumbnailMenu = !showThumbnailMenu
    console.log('[Example] Thumbnail menu:', showThumbnailMenu ? 'open' : 'closed')
  }

  function selectThumbnailSize(index: number) {
    selectedThumbnailSize = index
    showThumbnailMenu = false
    console.log('[Example] Selected thumbnail size:', index)
    // Save to localStorage if desired
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('thumbnailSize', index.toString())
    }
  }

  function toggleSound() {
    isSoundMuted = !isSoundMuted
    console.log('[Example] Sound:', isSoundMuted ? 'muted' : 'unmuted')
    // Save to localStorage if desired
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('isSoundMuted', isSoundMuted.toString())
    }
  }

  function toggleStickyTopRow() {
    stickyTopRow = !stickyTopRow
    console.log('[Example] Sticky top row:', stickyTopRow ? 'enabled' : 'disabled')
    // Save to localStorage if desired
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('stickyTopRow', stickyTopRow.toString())
    }
  }

  function toggleEllipsisMenu(id: string) {
    const wasOpen = openEllipsisMenu === id
    openEllipsisMenu = wasOpen ? null : id
    console.log('[Example] Ellipsis menu:', openEllipsisMenu ? 'open' : 'closed')
  }

  // ============================================================================
  // LEVELSBAR CALLBACKS
  // ============================================================================

  function handleProjectNameChange(name: string) {
    projectName = name
    console.log('[Example] Project name changed to:', name)
    // Save to backend/localStorage if desired
  }

  function handleLevelClick(index: number) {
    console.log('[Example] Level clicked:', levels[index].name)
    // Navigate to the selected level
  }

  // ============================================================================
  // CLICK OUTSIDE HANDLER (close menus)
  // ============================================================================

  function handleClickOutside(e: MouseEvent) {
    // Close thumbnail menu if clicking outside
    if (showThumbnailMenu) {
      const target = e.target as HTMLElement
      if (!target.closest('.thumbnail-dropdown')) {
        showThumbnailMenu = false
      }
    }

    // Close ellipsis menu if clicking outside
    if (openEllipsisMenu) {
      const target = e.target as HTMLElement
      if (!target.closest('.ellipsis-menu-container')) {
        openEllipsisMenu = null
      }
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

<AppLayout
  {selectedThumbnailSize}
  {showThumbnailMenu}
  {isSoundMuted}
  {stickyTopRow}
  {openEllipsisMenu}
  onUndo={handleUndo}
  onRedo={handleRedo}
  onRegenerate={handleRegenerate}
  onToggleThumbnailMenu={toggleThumbnailMenu}
  onSelectThumbnailSize={selectThumbnailSize}
  onToggleSound={toggleSound}
  onToggleStickyTopRow={toggleStickyTopRow}
  onToggleEllipsisMenu={toggleEllipsisMenu}
  {projectName}
  {levels}
  {breadcrumbs}
  onProjectNameChange={handleProjectNameChange}
  onLevelClick={handleLevelClick}
>
  <!-- ========================================================================
       MAIN CONTENT AREA
       Place your actual content here (SheetGrid, etc.)
       ======================================================================== -->
  <div class="example-content">
    <h1>Your Main Content Here</h1>
    <p>This is where your SheetGrid or other components would go.</p>

    <div class="example-info">
      <h2>Current State:</h2>
      <ul>
        <li>Thumbnail Size: {selectedThumbnailSize} (index)</li>
        <li>Sound Muted: {isSoundMuted}</li>
        <li>Sticky Top Row: {stickyTopRow}</li>
        <li>Project Name: {projectName}</li>
        <li>Active Level: {levels.find(l => l.active)?.name}</li>
      </ul>
    </div>
  </div>
</AppLayout>

<style>
  .example-content {
    padding: 2rem;
    color: rgba(255, 255, 255, 0.9);
  }

  .example-content h1 {
    font-size: 2rem;
    font-weight: 600;
    margin-bottom: 1rem;
  }

  .example-content p {
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 2rem;
  }

  .example-info {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 1.5rem;
  }

  .example-info h2 {
    font-size: 1.2rem;
    font-weight: 500;
    margin-bottom: 1rem;
  }

  .example-info ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .example-info li {
    padding: 0.5rem 0;
    color: rgba(255, 255, 255, 0.7);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .example-info li:last-child {
    border-bottom: none;
  }
</style>
