<script lang="ts">
  interface Props {
    show: boolean
    position: { x: number; y: number }
    onSetCover: () => void
    onDownload: () => void
    onClose: () => void
  }

  let { show, position, onSetCover, onDownload, onClose }: Props = $props()

  // Close on click outside
  function handleBackdropClick() {
    onClose()
  }
</script>

{#if show}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="menu-backdrop" onclick={handleBackdropClick}></div>
  <div
    class="card-menu"
    style="left: {position.x}px; top: {position.y}px"
  >
    <button class="menu-item" onclick={() => { onSetCover(); onClose(); }}>
      <span class="material-symbols-outlined">image</span>
      Set cover image
    </button>
    <button class="menu-item" onclick={() => { onDownload(); onClose(); }}>
      <span class="material-symbols-outlined">download</span>
      Download
    </button>
  </div>
{/if}

<style>
  .menu-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 19999;
  }

  .card-menu {
    position: fixed;
    background: rgba(30, 30, 30, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    padding: 0.5rem;
    min-width: 180px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(12px);
    z-index: 20000;
  }

  .menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.15s ease;
    text-align: left;
  }

  .menu-item:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 1);
  }

  .menu-item .material-symbols-outlined {
    font-size: 20px;
    color: rgba(255, 255, 255, 0.7);
  }

  .menu-item:hover .material-symbols-outlined {
    color: rgba(255, 255, 255, 0.9);
  }
</style>
