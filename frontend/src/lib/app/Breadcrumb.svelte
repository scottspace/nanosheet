<!--
  Breadcrumb.svelte - Breadcrumb navigation component

  Features:
  - Breadcrumb navigation (e.g., "Film > Block 1 > Scene 3 > Shots")
  - Clickable segments
  - Responsive collapse for long paths
  - Clean, modern styling

  @component
-->
<script lang="ts">
  /**
   * Breadcrumb item definition
   */
  export interface BreadcrumbItem {
    /** Display label */
    label: string
    /** Click handler */
    onclick?: () => void
  }

  /**
   * Props
   */
  interface Props {
    /** Breadcrumb items */
    breadcrumbs: BreadcrumbItem[]
  }

  let { breadcrumbs }: Props = $props()

  /**
   * Handle breadcrumb click
   */
  function handleClick(item: BreadcrumbItem) {
    if (item.onclick) {
      item.onclick()
    }
  }
</script>

<nav class="breadcrumb">
  <div class="breadcrumb-container">
    {#each breadcrumbs as item, index}
      {#if index > 0}
        <span class="breadcrumb-separator">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M4 2L8 6L4 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      {/if}
      <button
        class="breadcrumb-item"
        class:clickable={item.onclick !== undefined}
        class:last={index === breadcrumbs.length - 1}
        onclick={() => handleClick(item)}
        disabled={!item.onclick}
      >
        {item.label}
      </button>
    {/each}
  </div>
</nav>

<style>
  .breadcrumb {
    background: #0a0a0a;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding: 0.5rem 1.5rem;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .breadcrumb-container {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-height: 32px;
  }

  .breadcrumb-item {
    display: flex;
    align-items: center;
    padding: 0.35rem 0.6rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.8rem;
    font-weight: 400;
    cursor: default;
    transition: all 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .breadcrumb-item.clickable {
    cursor: pointer;
  }

  .breadcrumb-item.clickable:hover {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.8);
  }

  .breadcrumb-item.last {
    color: rgba(255, 255, 255, 0.9);
    font-weight: 500;
  }

  .breadcrumb-separator {
    display: flex;
    align-items: center;
    color: rgba(255, 255, 255, 0.3);
    flex-shrink: 0;
  }

  /* Scrollbar styling for overflow */
  .breadcrumb::-webkit-scrollbar {
    height: 4px;
  }

  .breadcrumb::-webkit-scrollbar-track {
    background: transparent;
  }

  .breadcrumb::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
  }

  .breadcrumb::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.25);
  }
</style>
