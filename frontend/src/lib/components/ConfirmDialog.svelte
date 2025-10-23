<script lang="ts">
  interface Props {
    show: boolean
    message: string
    onConfirm: () => void
    onCancel: () => void
  }

  let { show, message, onConfirm, onCancel }: Props = $props()
</script>

{#if show}
  <div class="confirm-overlay" onclick={onCancel}>
    <div class="confirm-dialog" onclick={(e) => e.stopPropagation()}>
      <div class="confirm-message">{message}</div>
      <div class="confirm-buttons">
        <button class="confirm-btn confirm-btn-cancel" onclick={onCancel}>
          Cancel
        </button>
        <button class="confirm-btn confirm-btn-delete" onclick={onConfirm}>
          Delete
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .confirm-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 20000;
    animation: fadeIn 0.2s ease;
  }

  .confirm-dialog {
    background: rgba(20, 20, 20, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    padding: 1.5rem;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    animation: slideUp 0.2s ease;
  }

  .confirm-message {
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.95rem;
    line-height: 1.5;
    margin-bottom: 1.5rem;
    white-space: pre-line;
  }

  .confirm-buttons {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  .confirm-btn {
    padding: 0.6rem 1.25rem;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
  }

  .confirm-btn-cancel {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
  }

  .confirm-btn-cancel:hover {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.95);
  }

  .confirm-btn-delete {
    background: rgba(239, 68, 68, 0.9);
    color: white;
  }

  .confirm-btn-delete:hover {
    background: rgba(239, 68, 68, 1);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
  }

  @keyframes slideUp {
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
