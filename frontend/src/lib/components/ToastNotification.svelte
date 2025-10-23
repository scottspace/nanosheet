<script lang="ts">
  interface Props {
    show: boolean
    message: string
  }

  let { show, message }: Props = $props()
</script>

{#if show}
  <div class="toast-overlay">
    <div class="toast">
      {message}
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
    font-size: 1rem;
    font-weight: 500;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(12px);
    animation: slideUpToast 0.3s ease;
    min-width: 200px;
    text-align: center;
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
