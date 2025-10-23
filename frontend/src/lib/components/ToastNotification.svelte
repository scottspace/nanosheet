<script lang="ts">
  interface Props {
    show: boolean
    message: string
    progress?: number // 0-100, or undefined for no progress bar
    current?: number // Current item number
    total?: number // Total items
  }

  let { show, message, progress, current, total }: Props = $props()
</script>

{#if show}
  <div class="toast-overlay">
    <div class="toast">
      <div class="toast-content">
        {message}
        {#if current !== undefined && total !== undefined}
          <span class="toast-counter">({current}/{total})</span>
        {/if}
      </div>
      {#if progress !== undefined}
        <div class="progress-bar-container">
          <div class="progress-bar" style="width: {progress}%"></div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .toast-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 30000;
    animation: fadeIn 0.2s ease;
    pointer-events: none;
  }

  .toast {
    background: rgba(30, 30, 30, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    padding: 1.5rem 2.5rem;
    color: rgba(255, 255, 255, 0.95);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
    font-size: 0.9375rem;
    font-weight: 500;
    letter-spacing: -0.01em;
    line-height: 1.5;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(12px);
    animation: slideUpToast 0.3s ease;
    min-width: 200px;
    text-align: center;
  }

  .toast-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .toast-counter {
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.875rem;
  }

  .progress-bar-container {
    margin-top: 0.75rem;
    height: 3px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, rgba(100, 150, 255, 0.8), rgba(120, 170, 255, 0.9));
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  @keyframes slideUpToast {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
