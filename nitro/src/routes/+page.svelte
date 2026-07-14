<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import { Input } from "$lib/components/ui/input";
  import * as Command from "$lib/components/ui/command";

  let query = $state("");
  let results: string[] = $state([]);
  let selectedIndex = $state(0);
  let inputRef = $state<HTMLInputElement | null>(null);

  async function search() {
    if (query.trim() === "") {
      results = [];
      selectedIndex = 0;
      return;
    }
    try {
      results = await invoke("search_files", { query });
      if (selectedIndex >= results.length) {
        selectedIndex = Math.max(0, results.length - 1);
      }
    } catch (e) {
      console.error("Search failed:", e);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectedIndex = Math.min(results.length - 1, Math.max(0, selectedIndex + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selectedIndex = Math.max(0, selectedIndex - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (results[selectedIndex]) {
        openFile(results[selectedIndex]);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      // Hide window by clearing focus/query, global shortcut toggles, but this is a nice fallback.
      query = "";
      results = [];
    }
  }

  async function openFile(path: string) {
    try {
      await invoke("plugin:opener|open", { path });
    } catch (e) {
      console.error("Failed to open file:", e);
    }
  }

  // Effect to trigger search when query changes
  $effect(() => {
    search();
  });

  onMount(() => {
    if (inputRef) {
      inputRef.focus();
    }

    // Auto-focus when window gains focus
    window.addEventListener("focus", () => {
      if (inputRef) {
        inputRef.focus();
      }
    });
  });
</script>

<svelte:window on:keydown={handleKeydown} />

<main class="container">
  <Command.Root class="w-full max-w-[600px] rounded-xl border border-border shadow-2xl bg-popover text-popover-foreground">
    <Command.Input
      bind:ref={inputRef}
      bind:value={query}
      placeholder="Search files..."
      autofocus
      class="text-xl"
    />

    {#if results.length > 0}
      <Command.List>
        {#each results as result, i}
          <Command.Item
            class={i === selectedIndex ? "bg-accent text-accent-foreground" : ""}
            onSelect={() => { openFile(result); }}
          >
            <span class="file-icon">📄</span>
            <span class="file-name font-medium">{result.split(/[/\\]/).pop()}</span>
            <span class="file-path text-sm text-muted-foreground ml-auto overflow-hidden text-ellipsis whitespace-nowrap">{result}</span>
          </Command.Item>
        {/each}
      </Command.List>
    {/if}
  </Command.Root>
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background-color: transparent;
    overflow: hidden; /* Hide scrollbars */
  }

  .container {
    width: 100vw;
    height: 100vh;
    padding: 20px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  /* Scrollbar styling */
  :global(.results::-webkit-scrollbar) {
    width: 8px;
  }
  :global(.results::-webkit-scrollbar-track) {
    background: #1e1e1e;
  }
  :global(.results::-webkit-scrollbar-thumb) {
    background: #444;
    border-radius: 4px;
  }

  .file-icon {
    margin-right: 12px;
    font-size: 16px;
  }
</style>
