<script lang="ts">
  interface VideoMediaProps {
    src: string;
    thumbnail: string;
  }

  let { src, thumbnail }: VideoMediaProps = $props();

  let videoElement: HTMLVideoElement | null = null;
  let playMode = $state(false); // false = preview mode (big play button), true = play mode (YouTube controls)
  let paused = $state(true);
  let muted = $state(false); // Start unmuted
  let volume = $state(1.0); // 0.0 to 1.0
  let currentTime = $state(0);
  let duration = $state(0);
  let isHovering = $state(false);
  let isScrubbing = $state(false);
  let wasPlayingBeforeScrub = $state(false); // Track if video was playing before scrubbing
  let isHoveringVolume = $state(false); // Track volume control hover
  let originalThumbnail = thumbnail; // Store original thumbnail to restore after video ends

  // Enter play mode when big play button is clicked
  function enterPlayMode(e: MouseEvent) {
    e.stopPropagation();
    playMode = true;

    if (videoElement) {
      videoElement.play().then(() => {
        paused = false;
      }).catch(err => {
        console.error('[VIDEO] Play failed:', err);
      });
    }
  }

  // Exit play mode and return to preview
  function exitPlayMode(e?: MouseEvent) {
    if (e) e.stopPropagation();
    playMode = false;
    paused = true;
    if (videoElement) {
      videoElement.pause();
      videoElement.currentTime = 0;
      // Restore original thumbnail
      videoElement.poster = originalThumbnail;
      videoElement.load(); // Reload to show poster
    }
  }

  // Handle escape key to exit play mode
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && playMode) {
      exitPlayMode();
    }
  }

  // Toggle play/pause in play mode
  function togglePlayPause(e: MouseEvent) {
    e.stopPropagation();
    if (videoElement) {
      if (paused) {
        videoElement.play();
      } else {
        videoElement.pause();
      }
    }
  }

  // Handle click on video to pause/play
  function handleVideoClick(e: MouseEvent) {
    // Only handle if in play mode and not clicking on controls
    if (!playMode) return;

    // Don't toggle if clicking on controls
    if ((e.target as HTMLElement).closest('.video-controls')) {
      return;
    }

    e.stopPropagation();
    togglePlayPause(e);
  }

  // Toggle mute
  function toggleMute(e: MouseEvent) {
    e.stopPropagation();
    muted = !muted;
    if (videoElement) {
      videoElement.muted = muted;
    }
  }

  // Handle volume change
  function handleVolumeChange(e: Event) {
    e.stopPropagation();
    // bind:value automatically updates volume, we just need to sync the video element
    if (videoElement) {
      videoElement.volume = volume;
      if (volume > 0 && muted) {
        muted = false;
        videoElement.muted = false;
      }
    }
  }

  function handleVolumeMouseDown(e: MouseEvent) {
    e.stopPropagation(); // Prevent card dragging
    e.preventDefault(); // Prevent default drag behavior
  }

  // Handle timeline scrubbing
  function handleTimelineChange(e: Event) {
    e.stopPropagation();
    // bind:value automatically updates currentTime, we just need to sync the video element
    if (videoElement) {
      videoElement.currentTime = currentTime;
    }
  }

  function handleTimelineMouseDown(e: MouseEvent) {
    e.stopPropagation(); // Prevent card dragging
    e.preventDefault(); // Prevent default drag behavior
    isScrubbing = true;

    // Remember if video was playing and pause it
    wasPlayingBeforeScrub = !paused;
    if (videoElement && !paused) {
      videoElement.pause();
    }
  }

  function handleTimelineMouseUp(e: MouseEvent) {
    e.stopPropagation(); // Prevent card dragging
    isScrubbing = false;

    // Resume playing if it was playing before scrubbing
    if (videoElement && wasPlayingBeforeScrub) {
      videoElement.play();
      wasPlayingBeforeScrub = false;
    }
  }

  // Video event handlers
  function handlePlay() {
    paused = false;
  }

  function handlePause() {
    paused = true;
  }

  function handleTimeUpdate() {
    if (!isScrubbing && videoElement) {
      currentTime = videoElement.currentTime;
    }
  }

  function handleLoadedMetadata() {
    if (videoElement) {
      duration = videoElement.duration;
    }
  }

  function handleEnded() {
    // Video finished playing - exit play mode and restore thumbnail
    exitPlayMode();
  }

  // Format time as MM:SS
  function formatTime(seconds: number): string {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="video-container"
  onmouseenter={() => isHovering = true}
  onmouseleave={() => isHovering = false}
  onclick={handleVideoClick}
  role="button"
  tabindex="0"
>
  <video
    bind:this={videoElement}
    {src}
    poster={thumbnail}
    class="card-video"
    playsinline
    muted={muted}
    onplay={handlePlay}
    onpause={handlePause}
    ontimeupdate={handleTimeUpdate}
    onloadedmetadata={handleLoadedMetadata}
    onended={handleEnded}
  >
    <track kind="captions" />
  </video>

  <!-- Preview Mode: Large centered play button -->
  {#if !playMode}
    <button
      class="big-play-button"
      onclick={enterPlayMode}
      title="Play"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z"/>
      </svg>
    </button>
  {/if}

  <!-- Play Mode: Exit button (top-right, show on hover) -->
  {#if playMode && isHovering}
    <button class="exit-play-mode-button" onclick={exitPlayMode} title="Exit video (Esc)">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    </button>
  {/if}

  <!-- Play Mode: YouTube-style controls (show on hover) -->
  {#if playMode && isHovering}
    <div class="video-controls">
      <!-- Timeline scrubber -->
      <div class="timeline-container">
        <div class="timeline-track"></div>
        <div class="timeline-progress" style="width: {duration > 0 ? (currentTime / duration) * 100 : 0}%"></div>
        <input
          type="range"
          class="timeline"
          min="0"
          max={duration || 0}
          step="0.1"
          bind:value={currentTime}
          oninput={handleTimelineChange}
          onmousedown={handleTimelineMouseDown}
          onmouseup={handleTimelineMouseUp}
          ondragstart={(e) => e.preventDefault()}
        />
      </div>

      <!-- Control buttons -->
      <div class="controls-bar">
        <!-- Play/Pause button -->
        <button class="control-button" onclick={togglePlayPause} title={paused ? 'Play' : 'Pause'}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            {#if paused}
              <path d="M8 5v14l11-7z"/>
            {:else}
              <path d="M6 4h4v16H6zm8 0h4v16h-4z"/>
            {/if}
          </svg>
        </button>

        <!-- Volume control container -->
        <div
          class="volume-control-container"
          onmouseenter={() => isHoveringVolume = true}
          onmouseleave={() => isHoveringVolume = false}
        >
          <button class="control-button volume-button" onclick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="volume-icon" class:muted>
              {#if muted || volume === 0}
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
              {:else if volume < 0.5}
                <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
              {:else}
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              {/if}
            </svg>
          </button>

          <!-- Volume slider (shows on hover) -->
          <input
            type="range"
            class="volume-slider"
            class:visible={isHoveringVolume}
            min="0"
            max="1"
            step="0.01"
            bind:value={volume}
            oninput={handleVolumeChange}
            onmousedown={handleVolumeMouseDown}
            ondragstart={(e) => e.preventDefault()}
          />
        </div>

        <!-- Time display -->
        <div class="time-display">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .video-container {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  .card-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    background: #000;
    display: block;
  }

  /* Big play button (preview mode) */
  .big-play-button {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(10px);
    border: none;
    border-radius: 50%;
    width: 60px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.3s ease, background 0.2s ease, transform 0.2s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    z-index: 10;
  }

  .video-container:hover .big-play-button {
    opacity: 1;
  }

  .big-play-button:hover {
    background: rgba(0, 0, 0, 0.8);
    transform: translate(-50%, -50%) scale(1.05);
  }

  .big-play-button svg {
    width: 32px;
    height: 32px;
    color: white;
  }

  /* Exit play mode button (top-right) */
  .exit-play-mode-button {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(10px);
    border: none;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0.8;
    transition: opacity 0.2s ease, background 0.2s ease, transform 0.2s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    z-index: 20;
  }

  .exit-play-mode-button:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.8);
    transform: scale(1.05);
  }

  .exit-play-mode-button svg {
    width: 18px;
    height: 18px;
    color: white;
  }

  /* YouTube-style video controls */
  .video-controls {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, transparent 100%);
    padding: 6px 10px;
    z-index: 10;
  }

  .timeline-container {
    position: relative;
    height: 4px;
    margin-bottom: 6px;
    cursor: pointer;
    padding: 0;
    box-sizing: border-box;
  }

  .timeline-track {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    z-index: 1;
  }

  .timeline-progress {
    position: absolute;
    left: 0;
    top: 0;
    height: 4px;
    background: #ff0000;
    border-radius: 2px;
    pointer-events: none;
    z-index: 2;
  }

  .timeline {
    position: absolute;
    width: 100%;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
    z-index: 3;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    left: 0;
    top: 0;
  }

  .timeline::-webkit-slider-runnable-track {
    width: 100%;
    height: 4px;
    background: transparent;
    border: none;
    border-radius: 2px;
    padding: 0;
    margin: 0;
  }

  .timeline::-moz-range-track {
    width: 100%;
    height: 4px;
    background: transparent;
    border: none;
    border-radius: 2px;
    padding: 0;
    margin: 0;
  }

  .timeline::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    background: #ff0000;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
    transition: transform 0.1s ease;
    margin-top: -4px; /* Center vertically: (12px thumb - 4px track) / 2 */
  }

  .timeline:hover::-webkit-slider-thumb {
    transform: scale(1.2);
  }

  .timeline::-moz-range-thumb {
    width: 12px;
    height: 12px;
    background: #ff0000;
    border-radius: 50%;
    cursor: pointer;
    border: none;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
    transition: transform 0.1s ease;
  }

  .timeline:hover::-moz-range-thumb {
    transform: scale(1.2);
  }

  .controls-bar {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .control-button {
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    padding: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease;
  }

  .control-button:hover {
    transform: scale(1.1);
  }

  .control-button svg {
    width: 20px;
    height: 20px;
  }

  /* Volume control container */
  .volume-control-container {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .volume-button {
    position: relative;
  }

  .volume-slider {
    width: 0;
    opacity: 0;
    height: 3px;
    -webkit-appearance: none;
    appearance: none;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
    transition: width 0.2s ease, opacity 0.2s ease;
  }

  .volume-slider.visible {
    width: 50px;
    opacity: 1;
  }

  .volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 10px;
    height: 10px;
    background: #fff;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
    transition: transform 0.1s ease;
  }

  .volume-slider:hover::-webkit-slider-thumb {
    transform: scale(1.15);
  }

  .volume-slider::-moz-range-thumb {
    width: 10px;
    height: 10px;
    background: #fff;
    border-radius: 50%;
    cursor: pointer;
    border: none;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
    transition: transform 0.1s ease;
  }

  .volume-slider:hover::-moz-range-thumb {
    transform: scale(1.15);
  }

  .time-display {
    color: white;
    font-size: 11px;
    font-weight: 500;
    margin-left: auto;
    white-space: nowrap;
  }
</style>
