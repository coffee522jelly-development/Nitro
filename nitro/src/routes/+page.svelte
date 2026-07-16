<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { writeText } from "@tauri-apps/plugin-clipboard-manager";
  import { onMount } from "svelte";
  import { Input } from "$lib/components/ui/input";
  import * as Command from "$lib/components/ui/command";

  type Snippet = { title: string; content: string };
  type SearchResult =
    | { type: "file"; path: string; name: string }
    | { type: "snippet"; title: string; content: string };

  let query = $state("");
  let results: SearchResult[] = $state([]);
  let selectedIndex = $state(0);
  let inputRef = $state<HTMLInputElement | null>(null);

  // State for snippet creation
  let showSnippetDialog = $state(false);
  let newSnippetTitle = $state("");
  let newSnippetContent = $state("");

  async function search() {
    if (query.trim() === "") {
      results = [];
      selectedIndex = 0;
      return;
    }

    // Command to open snippet creation dialog
    if (query.startsWith("> snippet")) {
      showSnippetDialog = true;
      query = "";
      return;
    }

    try {
      let files: string[] = await invoke("search_files", { query });
      let snippets: Snippet[] = await invoke("get_snippets");

      const queryLower = query.toLowerCase();
      let matchedSnippets = snippets.filter(s => s.title.toLowerCase().includes(queryLower) || s.content.toLowerCase().includes(queryLower));

      results = [
        ...matchedSnippets.map(s => ({ type: "snippet" as const, title: s.title, content: s.content })),
        ...files.map(f => ({ type: "file" as const, path: f, name: f.split(/[/\\]/).pop() || f }))
      ];

      if (selectedIndex >= results.length) {
        selectedIndex = Math.max(0, results.length - 1);
      }
    } catch (e) {
      console.error("Search failed:", e);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (showSnippetDialog) return; // Let dialog handle its own keys
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
        executeResult(results[selectedIndex]);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      // Hide window by clearing focus/query, global shortcut toggles, but this is a nice fallback.
      query = "";
      results = [];
      getCurrentWindow().hide();
    }
  }

  async function executeResult(result: SearchResult) {
    try {
      if (result.type === "file") {
        await invoke("plugin:opener|open", { path: result.path });
      } else if (result.type === "snippet") {
        await writeText(result.content);
        query = "";
        results = [];
        await getCurrentWindow().hide();
      }
    } catch (e) {
      console.error("Execution failed:", e);
    }
  }

  async function handleSaveSnippet() {
    if (newSnippetTitle.trim() && newSnippetContent.trim()) {
      try {
        await invoke("save_snippet", { title: newSnippetTitle, content: newSnippetContent });
        showSnippetDialog = false;
        newSnippetTitle = "";
        newSnippetContent = "";
        // Refocus input
        setTimeout(() => inputRef?.focus(), 100);
      } catch (e) {
        console.error("Failed to save snippet:", e);
      }
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
  {#if showSnippetDialog}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="w-full max-w-md rounded-xl bg-popover p-6 shadow-2xl border border-border">
        <h2 class="mb-4 text-xl font-bold text-popover-foreground">New Snippet</h2>
        <div class="space-y-4">
          <div>
            <!-- svelte-ignore a11y_autofocus -->
            <Input bind:value={newSnippetTitle} placeholder="Snippet Title" class="w-full" autofocus onkeydown={(e) => { if (e.key === 'Escape') showSnippetDialog = false; }}/>
          </div>
          <div>
            <textarea
              bind:value={newSnippetContent}
              placeholder="Snippet Content"
              class="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              onkeydown={(e) => { if (e.key === 'Escape') showSnippetDialog = false; else if (e.key === 'Enter' && e.ctrlKey) handleSaveSnippet(); }}
            ></textarea>
            <p class="mt-2 text-xs text-muted-foreground">Press Ctrl+Enter to save</p>
          </div>
          <div class="flex justify-end space-x-2 pt-2">
            <button class="rounded-md px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground text-popover-foreground" onclick={() => showSnippetDialog = false}>Cancel</button>
            <button class="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90" onclick={handleSaveSnippet}>Save</button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <Command.Root class="w-full max-w-[600px] rounded-xl border border-border shadow-2xl bg-popover text-popover-foreground">
    <Command.Input
      bind:ref={inputRef}
      bind:value={query}
      placeholder="Search files or type '> snippet'..."
      autofocus
      class="text-xl"
    />

    {#if results.length > 0}
      <Command.List>
        {#each results as result, i}
          <Command.Item
            class={i === selectedIndex ? "bg-accent text-accent-foreground" : ""}
            onSelect={() => { executeResult(result); }}
          >
            {#if result.type === "snippet"}
              <span class="file-icon">📋</span>
              <span class="file-name font-medium">{result.title}</span>
              <span class="file-path text-sm text-muted-foreground ml-auto overflow-hidden text-ellipsis whitespace-nowrap px-2">Snippet</span>
            {:else}
              <span class="file-icon">📄</span>
              <span class="file-name font-medium">{result.name}</span>
              <span class="file-path text-sm text-muted-foreground ml-auto overflow-hidden text-ellipsis whitespace-nowrap">{result.path}</span>
            {/if}
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
