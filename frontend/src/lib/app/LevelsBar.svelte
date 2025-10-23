<!--
  LevelsBar.svelte - Left sidebar for project navigation

  Features:
  - Project name input
  - Navigation levels (Film, Blocks, Scenes, Shots, Images)
  - Active level highlighting
  - Item counts per level

  @component
-->
<script lang="ts">
  /**
   * Level definition
   */
  export interface Level {
    /** Level name */
    name: string
    /** Item count */
    count: number
    /** Is this level active? */
    active: boolean
  }

  /**
   * Props
   */
  interface Props {
    /** Project name */
    projectName: string
    /** Navigation levels */
    levels: Level[]
    /** Callback: Project name changed */
    onProjectNameChange?: (name: string) => void
    /** Callback: Level clicked */
    onLevelClick?: (index: number) => void
  }

  let {
    projectName,
    levels,
    onProjectNameChange,
    onLevelClick
  }: Props = $props()

  /**
   * Handle project name input
   */
  function handleProjectNameInput(e: Event) {
    const target = e.target as HTMLInputElement
    if (onProjectNameChange) {
      onProjectNameChange(target.value)
    }
  }

  /**
   * Handle level click
   */
  function handleLevelClick(index: number) {
    if (onLevelClick) {
      onLevelClick(index)
    }
  }
</script>

<aside class="sidebar">
  <div class="project-name">
    <input
      type="text"
      value={projectName}
      class="project-name-input"
      title={projectName}
      oninput={handleProjectNameInput}
    />
  </div>

  <nav class="nav-sheets">
    {#each levels as level, index}
      <button
        class="nav-item"
        class:active={level.active}
        onclick={() => handleLevelClick(index)}
      >
        {level.name} ({level.count})
      </button>
    {/each}
  </nav>
</aside>

<style>
  .sidebar {
    width: 140px;
    background: #0a0a0a;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    padding: 0.75rem;
  }

  .project-name {
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .project-name-input {
    width: 100%;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.8rem;
    font-weight: 600;
    outline: none;
    padding: 0.3rem 0.4rem;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .project-name-input:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .project-name-input:focus {
    background: rgba(255, 255, 255, 0.06);
  }

  .nav-sheets {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .nav-item {
    padding: 0.5rem 0.5rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.75rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
  }

  .nav-item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.8);
  }

  .nav-item.active {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.95);
    font-weight: 500;
  }
</style>
