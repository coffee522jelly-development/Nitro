<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { writeText } from "@tauri-apps/plugin-clipboard-manager";
  import { onMount } from "svelte";
  import { Input } from "$lib/components/ui/input";
  import * as Command from "$lib/components/ui/command";
  import SettingsIcon from "lucide-svelte/icons/settings";
  import CopyIcon from "lucide-svelte/icons/copy";
  import Trash2Icon from "lucide-svelte/icons/trash-2";

  type Snippet = { title: string; content: string; tags?: string[] };
  type SearchResult =
    | { type: "app"; id: number; app_name: string; title: string }
    | { type: "file"; path: string; name: string }
    | { type: "snippet"; title: string; content: string; tags?: string[] }
    | { type: "web"; query: string };

  let query = $state("");
  let results: SearchResult[] = $state([]);
  let inputRef = $state<HTMLInputElement | null>(null);
  let searchMode = $state<"apps" | "files" | "snippets" | "web">("apps");

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
  let fontSetting = $state("sans");
  let searchDirsSetting = $state("");
  let themeModeSetting = $state("system");
  let showInvisiblesSetting = $state(false);
  let searchDebounceSetting = $state(500);

  // Sync scroll for snippet invisibles
  let newSnippetTextarea: HTMLTextAreaElement | null = $state(null);
  let newSnippetInvisibles: HTMLDivElement | null = $state(null);
  let viewingSnippetTextarea: HTMLTextAreaElement | null = $state(null);
  let viewingSnippetInvisibles: HTMLDivElement | null = $state(null);

  function syncScroll(source: HTMLElement | null, target: HTMLElement | null) {
    if (source && target) {
      target.scrollTop = source.scrollTop;
      target.scrollLeft = source.scrollLeft;
    }
  }

  function renderInvisibles(text: string) {
    if (!text) return "";
    return text.replace(/ /g, '·').replace(/　/g, '□').replace(/\t/g, '→\t');
  }

  async function loadSettings() {
    try {
      let settings: { shortcut: string, theme_color: string, font_family: string, search_dirs: string[], theme_mode: string, show_invisibles: boolean, search_debounce_ms: number } = await invoke("get_settings");
      shortcutSetting = settings.shortcut;
      themeColorSetting = settings.theme_color;
      fontSetting = settings.font_family;
      searchDirsSetting = settings.search_dirs.join("\n");
      themeModeSetting = settings.theme_mode;
      showInvisiblesSetting = settings.show_invisibles;
      searchDebounceSetting = settings.search_debounce_ms;
      applyThemeMode();
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  function applyThemeMode() {
    let isDark = false;
    if (themeModeSetting === "dark") {
      isDark = true;
    } else if (themeModeSetting === "light") {
      isDark = false;
    } else {
      isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  $effect(() => {
    applyThemeMode();
  });

  async function saveSettings() {
    try {
      let dirs = searchDirsSetting.split("\n").map(d => d.trim()).filter(d => d.length > 0);
      await invoke("save_settings", { shortcut: shortcutSetting, themeColor: themeColorSetting, fontFamily: fontSetting, searchDirs: dirs, themeMode: themeModeSetting, showInvisibles: showInvisiblesSetting, searchDebounceMs: searchDebounceSetting });
      showSettingsDialog = false;
      // Refocus input
      setTimeout(() => inputRef?.focus(), 100);
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  }

  async function performSearch(currentQuery: string, currentMode: string) {
    try {
      if (currentMode === "apps") {
        let openWindows: { id: number, app_name: string, title: string }[] = await invoke("app_get_open_windows").catch(() => []);
        if (currentQuery.trim() !== "") {
          const queryLower = currentQuery.toLowerCase();
          openWindows = openWindows.filter(w =>
            w.app_name.toLowerCase().includes(queryLower) || w.title.toLowerCase().includes(queryLower)
          );
        }
        results = openWindows.map(w => ({ type: "app" as const, id: w.id, app_name: w.app_name, title: w.title }));
      } else if (currentMode === "files") {
        if (currentQuery.trim() === "") {
          results = [];
        } else {
          let files: string[] = await invoke<string[]>("search_files", { query: currentQuery }).catch(() => []);
          results = files.map(f => ({ type: "file" as const, path: f, name: f.split(/[/\\]/).pop() || f }));
        }
      } else if (currentMode === "snippets") {
        let snippets: Snippet[] = await invoke<Snippet[]>("get_snippets").catch(() => []);
        if (currentQuery.trim() === "") {
          results = snippets.map(s => ({ type: "snippet" as const, title: s.title, content: s.content, tags: s.tags }));
        } else {
          const queryLower = currentQuery.toLowerCase();
          let matchedSnippets = snippets.filter(s => {
            let matchTitle = s.title.toLowerCase().includes(queryLower);
            let matchContent = s.content.toLowerCase().includes(queryLower);
            let matchTags = s.tags ? s.tags.some(tag => tag.toLowerCase().includes(queryLower)) : false;
            return matchTitle || matchContent || matchTags;
          });
          results = matchedSnippets.map(s => ({ type: "snippet" as const, title: s.title, content: s.content, tags: s.tags }));
        }
      } else if (currentMode === "web") {
        if (currentQuery.trim() !== "") {
          results = [{ type: "web", query: currentQuery }];
        } else {
          results = [];
        }
      }
    } catch (e) {
      console.error("Search failed:", e);
    }
  }

  async function search() {
    // Command to open snippet creation dialog (legacy fallback)
    if (query.startsWith("> snippet")) {
      showSnippetDialog = true;
      query = "";
      return;
    }

    // Immediate updates for modes that don't need heavy backend searching
    // or if the query is empty
    if (searchMode !== "files" || query.trim() === "") {
      performSearch(query, searchMode);
    }
  }

  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  function handleKeydown(event: KeyboardEvent) {
    if (showSnippetDialog || viewingSnippet || showSettingsDialog) return; // Let dialogs handle their own keys
    if (event.key === "Escape") {
      event.preventDefault();
      // Hide window by clearing focus/query, global shortcut toggles, but this is a nice fallback.
      query = "";
      results = [];
      getCurrentWindow().hide();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // Ensure focus is on the input so the Command component can process arrow keys
      if (inputRef && document.activeElement !== inputRef) {
        inputRef.focus();
      }
    } else if (event.key === "Tab") {
      event.preventDefault();
      if (searchMode === "apps") searchMode = "files";
      else if (searchMode === "files") searchMode = "snippets";
      else if (searchMode === "snippets") searchMode = "web";
      else searchMode = "apps";
      inputRef?.focus();
    } else if (event.key === "Enter") {
      // Manual enter trigger for shadcn-svelte command
      const selectedEl = document.querySelector('[data-selected="true"]') as HTMLElement | null
        || document.querySelector('[data-selected]') as HTMLElement | null;
      if (selectedEl) {
        selectedEl.click();
      }
    }
  }

  function handleWheel(event: WheelEvent) {
    if (showSnippetDialog || viewingSnippet || showSettingsDialog) return;
    if (results.length > 0 && inputRef) {
      event.preventDefault();
      if (event.deltaY > 0) {
        inputRef.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      } else if (event.deltaY < 0) {
        inputRef.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      }
    }
  }

  async function openParentDir(path: string) {
    try {
      const parentDir = path.substring(0, path.lastIndexOf(path.includes('\\') ? '\\' : '/'));
      if (parentDir) {
        await invoke("open_target", { path: parentDir });
      }
    } catch (e) {
      console.error("Open parent dir failed:", e);
    }
  }

  let isExecuting = false;
  async function executeResult(result: SearchResult) {
    if (isExecuting) return;
    isExecuting = true;
    try {
      if (result.type === "app") {
        await invoke("focus_window", { id: result.id, appName: result.app_name });
      } else if (result.type === "file") {
        await invoke("open_target", { path: result.path });
      } else if (result.type === "snippet") {
        viewingSnippet = {
          title: result.title,
          content: result.content,
          tags: result.tags
        };
      } else if (result.type === "web") {
        const url = `https://www.google.com/search?q=${encodeURIComponent(result.query)}`;
        await invoke("open_target", { path: url });
        getCurrentWindow().hide();
      }
    } catch (e) {
      console.error("Execution failed:", e);
    } finally {
      setTimeout(() => { isExecuting = false; }, 300);
    }
  }

  async function copySnippet() {
    if (viewingSnippet) {
      try {
        await writeText(viewingSnippet.content);
      } catch (e) {
        console.error("Copy failed:", e);
      }
    }
  }

  async function handleDeleteSnippet() {
    if (viewingSnippet) {
      try {
        await invoke("delete_snippet", { title: viewingSnippet.title });
        viewingSnippet = null;
        search(); // refresh results
      } catch (e) {
        console.error("Delete failed:", e);
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
    if (searchMode === "files" && query.trim() !== "") {
      if (searchTimeout) clearTimeout(searchTimeout);
      const currentQuery = query;
      const currentMode = searchMode;
      searchTimeout = setTimeout(() => {
        performSearch(currentQuery, currentMode);
      }, searchDebounceSetting);
    } else {
      search();
    }
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

<svelte:window on:keydown={handleKeydown} on:wheel|nonpassive={handleWheel} />

<main class="container theme-{themeColorSetting} font-{fontSetting} !p-0 w-full h-full bg-zinc-950">
  {#if viewingSnippet}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div class="w-full max-w-4xl rounded-xl !bg-[#1e1e1e] p-6 shadow-2xl border !border-[#333]">
        <h2 class="mb-4 text-xl font-bold text-popover-foreground">{viewingSnippet.title}</h2>
        <div class="space-y-4">
          <div class="relative">
            {#if showInvisiblesSetting}
              <div
                bind:this={viewingSnippetInvisibles}
                class="absolute inset-0 pointer-events-none break-words whitespace-pre-wrap rounded-md border !border-transparent px-3 py-2 font-mono text-sm text-muted-foreground/30 overflow-hidden"
                style="z-index: 1; tab-size: 4; -moz-tab-size: 4;"
              >{renderInvisibles(viewingSnippet.content)}</div>
            {/if}
            <textarea
              bind:this={viewingSnippetTextarea}
              readonly
              class="relative z-10 flex min-h-[400px] w-full rounded-md border !border-[#333] {showInvisiblesSetting ? '!bg-transparent' : '!bg-black/50'} px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
              style="tab-size: 4; -moz-tab-size: 4;"
              onkeydown={(e) => { if (e.key === 'Escape') viewingSnippet = null;  }}
              onscroll={() => syncScroll(viewingSnippetTextarea, viewingSnippetInvisibles)}
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
          <div class="flex justify-between items-center pt-2">
            <button
              class="flex items-center space-x-1 rounded-md px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
              onclick={handleDeleteSnippet}
              title="削除"
            >
              <Trash2Icon class="size-4" />
              <span>削除</span>
            </button>
            <div class="flex space-x-2">
              <button class="rounded-md px-4 py-2 text-sm hover:bg-zinc-800 hover:text-zinc-100 text-zinc-300 transition-colors" onclick={() => viewingSnippet = null}>閉じる</button>
              <button class="flex items-center space-x-1 rounded-md bg-zinc-100 px-4 py-2 text-sm text-zinc-900 hover:bg-zinc-200 transition-colors" onclick={copySnippet}>
                <CopyIcon class="size-4" />
                <span>コピー</span>
              </button>
            </div>
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
              <option value="zinc">ジンク (Zinc)</option>
              <option value="slate">スレート (Slate)</option>
              <option value="neutral">ニュートラル (Neutral)</option>
              <option value="red">レッド (Red)</option>
              <option value="blue">ブルー (Blue)</option>
              <option value="green">グリーン (Green)</option>
              <option value="yellow">イエロー (Yellow)</option>
              <option value="orange">オレンジ (Orange)</option>
              <option value="purple">パープル (Purple)</option>
              <option value="pink">ピンク (Pink)</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-muted-foreground mb-1">テーマモード</label>
            <select bind:value={themeModeSetting} class="w-full rounded-md border !border-[#333] !bg-black/50 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-0">
              <option value="system">システム (System)</option>
              <option value="dark">ダーク (Dark)</option>
              <option value="light">ライト (Light)</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-muted-foreground mb-1">フォント</label>
            <select bind:value={fontSetting} class="w-full rounded-md border !border-[#333] !bg-black/50 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-0">
              <optgroup label="デフォルト">
                <option value="sans">Sans Serif</option>
                <option value="serif">Serif</option>
                <option value="mono">Monospace</option>
              </optgroup>
              <optgroup label="Sans Serif">
                <option value="inter">Inter</option>
                <option value="roboto">Roboto</option>
                <option value="open-sans">Open Sans</option>
                <option value="lato">Lato</option>
                <option value="montserrat">Montserrat</option>
                <option value="noto-sans">Noto Sans (日本語)</option>
                <option value="ubuntu">Ubuntu</option>
              </optgroup>
              <optgroup label="プログラミング/等幅">
                <option value="fira-code">Fira Code (リガチャ可)</option>
                <option value="jetbrains-mono">JetBrains Mono</option>
                <option value="hack">Hack</option>
                <option value="cascadia-code">Cascadia Code</option>
                <option value="source-code-pro">Source Code Pro</option>
              </optgroup>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-muted-foreground mb-1">
              <input type="checkbox" bind:checked={showInvisiblesSetting} class="mr-2" />
              空白・タブ文字を可視化する
            </label>
          </div>
          <div>
            <label class="block text-sm font-medium text-muted-foreground mb-1">ファイル検索遅延 (ミリ秒)</label>
            <input type="number" bind:value={searchDebounceSetting} min="0" step="100" class="w-full rounded-md border !border-[#333] !bg-black/50 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-0" />
            <p class="text-xs text-muted-foreground mt-1">入力ごとに検索がかかるのを防ぎ、動作を軽くします。</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-muted-foreground mb-1">検索対象ディレクトリ (1行に1つ)</label>
            <textarea bind:value={searchDirsSetting} class="w-full rounded-md border !border-[#333] !bg-black/50 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-0 min-h-[100px]"></textarea>
          </div>
          <div class="flex justify-end space-x-2 pt-2">
            <button class="rounded-md px-4 py-2 text-sm hover:bg-zinc-800 hover:text-zinc-100 text-zinc-300 transition-colors" onclick={() => showSettingsDialog = false}>キャンセル</button>
            <button class="rounded-md bg-zinc-100 px-4 py-2 text-sm text-zinc-900 hover:bg-zinc-200 transition-colors" onclick={saveSettings}>保存</button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if showSnippetDialog}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div class="w-full max-w-4xl rounded-xl bg-popover p-6 shadow-2xl border border-border">
        <h2 class="mb-4 text-xl font-bold text-popover-foreground">新しいスニペット</h2>
        <div class="space-y-4">
          <div>
            <!-- svelte-ignore a11y_autofocus -->
            <Input bind:value={newSnippetTitle} placeholder="タイトル" class="w-full font-mono text-sm" autofocus onkeydown={(e) => { if (e.key === 'Escape') showSnippetDialog = false; }}/>
          </div>
          <div class="relative">
            {#if showInvisiblesSetting}
              <div
                bind:this={newSnippetInvisibles}
                class="absolute inset-0 pointer-events-none break-words whitespace-pre-wrap rounded-md border !border-transparent px-3 py-2 font-mono text-sm text-muted-foreground/30 overflow-hidden"
                style="z-index: 1; tab-size: 4; -moz-tab-size: 4;"
              >{renderInvisibles(newSnippetContent)}</div>
            {/if}
            <textarea
              bind:this={newSnippetTextarea}
              bind:value={newSnippetContent}
              placeholder="スニペット内容"
              class="relative z-10 flex min-h-[400px] w-full rounded-md border border-input {showInvisiblesSetting ? 'bg-transparent' : 'bg-background'} px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
              style="tab-size: 4; -moz-tab-size: 4;"
              onkeydown={(e) => { if (e.key === 'Escape') showSnippetDialog = false; else if (e.key === 'Enter' && e.ctrlKey) handleSaveSnippet(); }}
              onscroll={() => syncScroll(newSnippetTextarea, newSnippetInvisibles)}
            ></textarea>
          </div>
          <div>
            <Input bind:value={newSnippetTags} placeholder="タグ (カンマ区切り)" class="w-full font-mono text-sm" onkeydown={(e) => { if (e.key === 'Escape') showSnippetDialog = false; else if (e.key === 'Enter' && e.ctrlKey) handleSaveSnippet(); }}/>
            <p class="mt-2 text-xs text-muted-foreground">保存するには Ctrl+Enter を押してください</p>
          </div>
          <div class="flex justify-end space-x-2 pt-2">
            <button class="rounded-md px-4 py-2 text-sm hover:bg-zinc-800 hover:text-zinc-100 text-zinc-300 transition-colors" onclick={() => showSnippetDialog = false}>キャンセル</button>
            <button class="rounded-md bg-zinc-100 px-4 py-2 text-sm text-zinc-900 hover:bg-zinc-200 transition-colors" onclick={handleSaveSnippet}>OK</button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <Command.Root shouldFilter={false} class="w-full h-full !rounded-none !border-none shadow-none !bg-[#1e1e1e] text-popover-foreground overflow-hidden flex flex-col">
    <div class="flex items-center border-b !border-[#333] px-3">
      <div class="flex space-x-1 mr-2 bg-black/30 p-1 rounded-md">
        <button class="px-3 py-1 text-sm rounded-md transition-colors {searchMode === 'apps' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}" onclick={() => { searchMode = "apps"; inputRef?.focus(); }}>Apps</button>
        <button class="px-3 py-1 text-sm rounded-md transition-colors {searchMode === 'files' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}" onclick={() => { searchMode = "files"; inputRef?.focus(); }}>Files</button>
        <button class="px-3 py-1 text-sm rounded-md transition-colors {searchMode === 'snippets' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}" onclick={() => { searchMode = "snippets"; inputRef?.focus(); }}>Snippets</button>
        <button class="px-3 py-1 text-sm rounded-md transition-colors {searchMode === 'web' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}" onclick={() => { searchMode = "web"; inputRef?.focus(); }}>Web</button>
      </div>
      <div class="flex-1">
        <Command.Input
          bind:ref={inputRef}
          bind:value={query}
          placeholder={searchMode === 'apps' ? "アプリを検索..." : searchMode === 'files' ? "ファイルを検索..." : searchMode === 'web' ? "Webで検索..." : "スニペットを検索..."}
          autofocus
          class="text-xl border-0 !ring-0 focus-visible:!ring-0 !outline-none focus-visible:!outline-none shadow-none h-14 px-2 bg-transparent"
        />
      </div>
      {#if searchMode === "snippets"}
        <button
          class="ml-2 rounded-md bg-secondary/50 px-3 py-1.5 text-sm font-medium hover:bg-secondary flex items-center shrink-0"
          onclick={() => showSnippetDialog = true}
          title="スニペット追加"
        >
          <span class="mr-1">➕</span> スニペット
        </button>
      {/if}
      <button
        class="ml-2 rounded-md bg-secondary/50 p-1.5 text-sm font-medium hover:bg-secondary flex items-center shrink-0 text-muted-foreground"
        onclick={() => showSettingsDialog = true}
        title="設定"
      >
        <SettingsIcon class="size-5" />
      </button>
    </div>

    {#if results.length > 0}
      <Command.List class="flex-1 h-full overflow-y-auto">
        {#each results as result, i}
          <Command.Item
            value={result.type === "snippet" ? `snippet-${result.title}` : result.type === "app" ? `app-${result.id}` : result.type === "web" ? `web-${result.query}` : `file-${result.path}`}
            onSelect={() => { executeResult(result); }}
            ondblclick={(e) => { e.preventDefault(); executeResult(result); }}
          >
            {#if result.type === "snippet"}
              <span class="file-icon group-data-[selected]/command-item:text-primary-foreground">📋</span>
              <span class="file-name font-medium group-data-[selected]/command-item:text-primary-foreground">{result.title}</span>
              <span class="file-path text-sm text-muted-foreground ml-auto overflow-hidden text-ellipsis whitespace-nowrap px-2 group-data-[selected]/command-item:text-primary-foreground/70">Snippet</span>
            {:else if result.type === "app"}
              <span class="file-icon group-data-[selected]/command-item:text-primary-foreground">🪟</span>
              <span class="file-name font-medium group-data-[selected]/command-item:text-primary-foreground">{result.title}</span>
              <span class="file-path text-sm text-muted-foreground ml-auto overflow-hidden text-ellipsis whitespace-nowrap px-2 group-data-[selected]/command-item:text-primary-foreground/70">{result.app_name}</span>
            {:else if result.type === "web"}
              <span class="file-icon group-data-[selected]/command-item:text-primary-foreground">🌐</span>
              <span class="file-name font-medium group-data-[selected]/command-item:text-primary-foreground">"{result.query}" をWebで検索</span>
            {:else}
              <span class="file-icon group-data-[selected]/command-item:text-primary-foreground">📄</span>
              <span class="file-name font-medium group-data-[selected]/command-item:text-primary-foreground">{result.name}</span>
              <span class="file-path text-sm text-muted-foreground ml-auto overflow-hidden text-ellipsis whitespace-nowrap group-data-[selected]/command-item:text-primary-foreground/70 flex-1 text-right">{result.path}</span>
              <button
                class="ml-2 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                onclick={(e) => { e.stopPropagation(); openParentDir(result.path); }}
                title="フォルダを開く"
              >
                📁
              </button>
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
