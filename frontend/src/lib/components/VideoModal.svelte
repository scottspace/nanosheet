<!--
  VideoModal.svelte - Modal for displaying YouTube video

  @component
-->
<script lang="ts">
  /**
   * Props
   */
  interface Props {
    /** Show modal */
    show: boolean
    /** Callback: Close modal */
    onClose: () => void
  }

  let { show, onClose }: Props = $props()

  // Close on Escape key
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && show) {
      onClose()
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if show}
  <div class="modal-overlay" onclick={onClose}>
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <button class="close-button" onclick={onClose}>×</button>
      <iframe
        width="560"
        height="315"
        src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1"
        title="YouTube video player"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-content {
    position: relative;
    background: #1a1a1a;
    border-radius: 8px;
    padding: 2rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  }

  .close-button {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 32px;
    height: 32px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-button:hover {
    background: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 1);
  }

  iframe {
    display: block;
    border-radius: 4px;
  }
</style>
