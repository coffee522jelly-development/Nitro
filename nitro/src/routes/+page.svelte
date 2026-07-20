<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { writeText } from "@tauri-apps/plugin-clipboard-manager";
  import { onMount } from "svelte";
  import { Input } from "$lib/components/ui/input";
  import * as Command from "$lib/components/ui/command";
  import SettingsIcon from "lucide-svelte/icons/settings";

  type Snippet = { title: string; content: string; tags?: string[] };
  type SearchResult =
    | { type: "file"; path: string; name: string }
    | { type: "snippet"; title: string; content: string; tags?: string[] };

  let query = $state("");
  let results: SearchResult[] = $state([]);
  let inputRef = $state<HTMLInputElement | null>(null);

  // State for snippet creation
  let showSnippetDialog = $state(false);
  let newSnippetTitle = $state("");
  let newSnippetContent = $state("");
  let newSnippetTags = $state(""); // Comma separated

  // State for snippet viewing
  let viewingSnippet = $state<Snippet | null>(null);

  // State for settings
  let showSettingsDialog = $state(false);
  let shortcutSetting = $state("Ctrl+Space");
  let themeColorSetting = $state("zinc");
  let searchDirsSetting = $state("");

  async function loadSettings() {
    try {
      let settings: { shortcut: string, theme_color: string, search_dirs: string[] } = await invoke("get_settings");
      shortcutSetting = settings.shortcut;
      themeColorSetting = settings.theme_color;
      searchDirsSetting = settings.search_dirs.join("\n");
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  async function saveSettings() {
    try {
      let dirs = searchDirsSetting.split("\n").map(d => d.trim()).filter(d => d.length > 0);
      await invoke("save_settings", { shortcut: shortcutSetting, themeColor: themeColorSetting, searchDirs: dirs });
      showSettingsDialog = false;
      // Refocus input
      setTimeout(() => inputRef?.focus(), 100);
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  }

  async function search() {
    // Command to open snippet creation dialog (legacy fallback)
    if (query.startsWith("> snippet")) {
      showSnippetDialog = true;
      query = "";
      return;
    }

    try {
      let snippets: Snippet[] = await invoke<Snippet[]>("get_snippets").catch(() => []);

      if (query.trim() === "") {
        // If empty query, just show all snippets
        results = snippets.map(s => ({ type: "snippet" as const, title: s.title, content: s.content, tags: s.tags }));
      } else {
        let files: string[] = await invoke<string[]>("search_files", { query }).catch(() => []);

        const queryLower = query.toLowerCase();
        let matchedSnippets = snippets.filter(s => {
          let matchTitle = s.title.toLowerCase().includes(queryLower);
          let matchContent = s.content.toLowerCase().includes(queryLower);
          let matchTags = s.tags ? s.tags.some(tag => tag.toLowerCase().includes(queryLower)) : false;
          return matchTitle || matchContent || matchTags;
        });

        results = [
          ...matchedSnippets.map(s => ({ type: "snippet" as const, title: s.title, content: s.content, tags: s.tags })),
          ...files.map(f => ({ type: "file" as const, path: f, name: f.split(/[/\\]/).pop() || f }))
        ];
      }
    } catch (e) {
      console.error("Search failed:", e);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (showSnippetDialog || viewingSnippet || showSettingsDialog) return; // Let dialogs handle their own keys
    if (event.key === "Escape") {
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
        viewingSnippet = {
          title: result.title,
          content: result.content,
          tags: result.tags
        };
      }
    } catch (e) {
      console.error("Execution failed:", e);
    }
  }

  async function copyAndCloseSnippet() {
    if (viewingSnippet) {
      try {
        await writeText(viewingSnippet.content);
        viewingSnippet = null;
        query = "";
        results = [];
        await getCurrentWindow().hide();
      } catch (e) {
        console.error("Copy failed:", e);
      }
    }
  }

  async function handleSaveSnippet() {
    if (newSnippetTitle.trim() && newSnippetContent.trim()) {
      let tags = newSnippetTags.split(",").map(t => t.trim()).filter(t => t.length > 0);
      try {
        await invoke("save_snippet", {
          title: newSnippetTitle,
          content: newSnippetContent,
          tags: tags.length > 0 ? tags : null
        });
        showSnippetDialog = false;
        newSnippetTitle = "";
        newSnippetContent = "";
        newSnippetTags = "";
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
    loadSettings();
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
  {#if viewingSnippet}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div class="w-full max-w-2xl rounded-xl !bg-[#1e1e1e] p-6 shadow-2xl border !border-[#333]">
        <h2 class="mb-4 text-xl font-bold text-popover-foreground">{viewingSnippet.title}</h2>
        <div class="space-y-4">
          <div>
            <textarea
              readonly
              class="flex min-h-[250px] w-full rounded-md border !border-[#333] !bg-black/50 px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
              onkeydown={(e) => { if (e.key === 'Escape') viewingSnippet = null; else if (e.key === 'Enter') copyAndCloseSnippet(); }}
            >{viewingSnippet.content}</textarea>
          </div>
          {#if viewingSnippet.tags && viewingSnippet.tags.length > 0}
            <div class="flex flex-wrap gap-2">
              {#each viewingSnippet.tags as tag}
                <span class="inline-flex items-center rounded-md bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
                  {tag}
                </span>
              {/each}
            </div>
          {/if}
          <div class="flex justify-end space-x-2 pt-2">
            <!-- svelte-ignore a11y_autofocus -->
            <button class="rounded-md px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground text-popover-foreground" autofocus onclick={() => viewingSnippet = null}>閉じる</button>
            <button class="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90" onclick={copyAndCloseSnippet}>コピーして閉じる</button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if showSettingsDialog}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div class="w-full max-w-md rounded-xl !bg-[#1e1e1e] p-6 shadow-2xl border !border-[#333]">
        <h2 class="mb-4 text-xl font-bold text-popover-foreground">設定</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-muted-foreground mb-1">起動ショートカット</label>
            <select bind:value={shortcutSetting} class="w-full rounded-md border !border-[#333] !bg-black/50 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-0">
              <option value="Ctrl+Space">Ctrl+Space</option>
              <option value="Alt+Space">Alt+Space</option>
              <option value="Super+Space">Super+Space</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-muted-foreground mb-1">テーマカラー</label>
            <select bind:value={themeColorSetting} class="w-full rounded-md border !border-[#333] !bg-black/50 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-0">
              <option value="zinc">Zinc</option>
              <option value="slate">Slate</option>
              <option value="neutral">Neutral</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-muted-foreground mb-1">検索対象ディレクトリ (1行に1つ)</label>
            <textarea bind:value={searchDirsSetting} class="w-full rounded-md border !border-[#333] !bg-black/50 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-0 min-h-[100px]"></textarea>
          </div>
          <div class="flex justify-end space-x-2 pt-2">
            <button class="rounded-md px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground text-popover-foreground" onclick={() => showSettingsDialog = false}>キャンセル</button>
            <button class="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90" onclick={saveSettings}>保存</button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if showSnippetDialog}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div class="w-full max-w-2xl rounded-xl bg-popover p-6 shadow-2xl border border-border">
        <h2 class="mb-4 text-xl font-bold text-popover-foreground">新しいスニペット</h2>
        <div class="space-y-4">
          <div>
            <!-- svelte-ignore a11y_autofocus -->
            <Input bind:value={newSnippetTitle} placeholder="タイトル" class="w-full font-mono text-sm" autofocus onkeydown={(e) => { if (e.key === 'Escape') showSnippetDialog = false; }}/>
          </div>
          <div>
            <textarea
              bind:value={newSnippetContent}
              placeholder="スニペット内容"
              class="flex min-h-[250px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              onkeydown={(e) => { if (e.key === 'Escape') showSnippetDialog = false; else if (e.key === 'Enter' && e.ctrlKey) handleSaveSnippet(); }}
            ></textarea>
          </div>
          <div>
            <Input bind:value={newSnippetTags} placeholder="タグ (カンマ区切り)" class="w-full font-mono text-sm" onkeydown={(e) => { if (e.key === 'Escape') showSnippetDialog = false; else if (e.key === 'Enter' && e.ctrlKey) handleSaveSnippet(); }}/>
            <p class="mt-2 text-xs text-muted-foreground">保存するには Ctrl+Enter を押してください</p>
          </div>
          <div class="flex justify-end space-x-2 pt-2">
            <button class="rounded-md px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground text-popover-foreground" onclick={() => showSnippetDialog = false}>キャンセル</button>
            <button class="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90" onclick={handleSaveSnippet}>保存</button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <Command.Root shouldFilter={false} class="w-full max-w-[600px] rounded-xl !border-[#333] shadow-2xl !bg-[#1e1e1e] text-popover-foreground overflow-hidden">
    <div class="flex items-center border-b !border-[#333] px-3">
      <div class="flex-1">
        <Command.Input
          bind:ref={inputRef}
          bind:value={query}
          placeholder="ファイルやスニペットを検索..."
          autofocus
          class="text-xl border-0 ring-0 focus:ring-0 shadow-none h-14 px-2"
        />
      </div>
      <button
        class="ml-2 rounded-md bg-secondary/50 px-3 py-1.5 text-sm font-medium hover:bg-secondary flex items-center shrink-0"
        onclick={() => showSnippetDialog = true}
        title="スニペット追加"
      >
        <span class="mr-1">➕</span> スニペット
      </button>
      <button
        class="ml-2 rounded-md bg-secondary/50 p-1.5 text-sm font-medium hover:bg-secondary flex items-center shrink-0 text-muted-foreground"
        onclick={() => showSettingsDialog = true}
        title="設定"
      >
        <SettingsIcon class="size-5" />
      </button>
    </div>

    {#if results.length > 0}
      <Command.List>
        {#each results as result, i}
          <Command.Item
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
