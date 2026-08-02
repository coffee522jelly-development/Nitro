<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
    import { getCurrentWindow } from '@tauri-apps/api/window';
  import { writeText } from "@tauri-apps/plugin-clipboard-manager";
    import { onMount } from "svelte";
  import { Input } from "$lib/components/ui/input";
  import * as Command from "$lib/components/ui/command";
  import SettingsIcon from "lucide-svelte/icons/settings";
  import FileTextIcon from "lucide-svelte/icons/file-text";
  import FileIcon from "lucide-svelte/icons/file";
  import AppWindowIcon from "lucide-svelte/icons/app-window";
  import SearchIcon from "lucide-svelte/icons/search";
  import PlusIcon from "lucide-svelte/icons/plus";

  type Snippet = { title: string; content: string; tags?: string[] };
  type SearchResult =
    | { type: "file"; path: string; name: string }
    | { type: "snippet"; title: string; content: string; tags?: string[] }
    | { type: "window"; id: number; title: string; app_name: string };


  let query = $state("");
  let results: SearchResult[] = $state([]);
  let inputRef = $state<HTMLInputElement | null>(null);
  let searchMode = $state<"apps" | "files" | "snippets">("apps");


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

  async function loadSettings() {
    try {
      let settings: { shortcut: string, theme_color: string, font_family: string, search_dirs: string[] } = await invoke("get_settings");
      shortcutSetting = settings.shortcut;
      themeColorSetting = settings.theme_color;
      fontSetting = settings.font_family;
      searchDirsSetting = settings.search_dirs.join("\n");
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  async function saveSettings() {
    try {
      let dirs = searchDirsSetting.split("\n").map(d => d.trim()).filter(d => d.length > 0);
      await invoke("save_settings", { shortcut: shortcutSetting, themeColor: themeColorSetting, fontFamily: fontSetting, searchDirs: dirs });
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
      const queryLower = query.toLowerCase().trim();
      let newResults: SearchResult[] = [];

      if (searchMode === "apps") {
        let activeWindows: any[] = await invoke<any[]>("app_get_open_windows").catch(() => []);
        let matchedWindows = activeWindows;
        if (queryLower !== "") {
          matchedWindows = activeWindows.filter(w =>
            w.title.toLowerCase().includes(queryLower) ||
            w.app_name.toLowerCase().includes(queryLower)
          );
        }
        newResults = matchedWindows.map(w => ({ type: "window" as const, id: w.id, title: w.title, app_name: w.app_name }));
      } else if (searchMode === "files") {
        if (queryLower !== "") {
          let files: string[] = await invoke<string[]>("search_files", { query: queryLower }).catch(() => []);
          newResults = files.map(f => ({ type: "file" as const, path: f, name: f.split(/[\/\\]/).pop() || f }));
        }
      } else if (searchMode === "snippets") {
        let snippets: Snippet[] = await invoke<Snippet[]>("get_snippets").catch(() => []);
        let matchedSnippets = snippets;
        if (queryLower !== "") {
          matchedSnippets = snippets.filter(s => {
            let matchTitle = s.title.toLowerCase().includes(queryLower);
            let matchContent = s.content.toLowerCase().includes(queryLower);
            let matchTags = s.tags ? s.tags.some(tag => tag.toLowerCase().includes(queryLower)) : false;
            return matchTitle || matchContent || matchTags;
          });
        }
        newResults = matchedSnippets.map(s => ({ type: "snippet" as const, title: s.title, content: s.content, tags: s.tags }));
      }

      results = newResults;
    } catch (e) {
      console.error("Search failed:", e);
    }
  }

  // Effect to trigger search when query or searchMode changes
  $effect(() => {
    // We reference searchMode to trigger reactivity
    const _mode = searchMode;
    search();
  });

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
    } else if (event.key === "Enter") {
      // Force trigger the currently selected item in case shadcn-svelte's internal handling fails
      const selectedEl = document.querySelector('[data-selected]');
      if (selectedEl) {
        // Prevent default form submission or other enter behaviors
        event.preventDefault();
        (selectedEl as HTMLElement).click();
      }
    } else if (event.key === "Tab") {
      event.preventDefault();
      const modes = ["apps", "files", "snippets"] as const;
      const currentIndex = modes.indexOf(searchMode);
      searchMode = event.shiftKey
        ? modes[(currentIndex - 1 + modes.length) % modes.length]
        : modes[(currentIndex + 1) % modes.length];
    }
  }

  async function executeResult(result: SearchResult) {
    console.log("Executing result:", result);
    try {
      if (result.type === "file") {
        await invoke("open_target", { path: result.path });
      } else if (result.type === "window") {
        await invoke("focus_window", { id: result.id, appName: result.app_name });
        query = "";
        results = [];
        await getCurrentWindow().hide();
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

    let wheelTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleWheel = (e: WheelEvent) => {
      if (showSnippetDialog || viewingSnippet || showSettingsDialog) return;
      if (results.length === 0 || !inputRef) return;
      e.preventDefault();

      if (wheelTimeout) return;
      wheelTimeout = setTimeout(() => {
        wheelTimeout = null;
      }, 50); // debounce scroll

      if (e.deltaY > 0) {
        inputRef.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
      } else if (e.deltaY < 0) {
        inputRef.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
      }
    };
    window.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("wheel", handleWheel);

    };
  });
</script>

<svelte:window on:keydown={handleKeydown} />


<main class="container theme-{themeColorSetting} font-{fontSetting}">
  {#if viewingSnippet}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div class="w-full max-w-2xl bg-zinc-900 p-6 shadow-xl border border-zinc-800">
        <h2 class="mb-4 text-xl font-bold text-zinc-100">{viewingSnippet.title}</h2>
        <div class="space-y-4">
          <div>
            <textarea
              readonly
              class="flex min-h-[250px] w-full bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-300 focus-visible:outline-none focus-visible:ring-0 border-0 disabled:cursor-not-allowed disabled:opacity-50"
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
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div class="w-full max-w-md bg-zinc-900 p-6 shadow-xl border border-zinc-800">
        <h2 class="mb-4 text-xl font-bold text-zinc-100">設定</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-zinc-400 mb-1">起動ショートカット</label>
            <select bind:value={shortcutSetting} class="w-full bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-0 border-0">
              <option value="Ctrl+Space">Ctrl+Space</option>
              <option value="Alt+Space">Alt+Space</option>
              <option value="Super+Space">Super+Space</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-zinc-400 mb-1">フォント</label>
            <select bind:value={fontSetting} class="w-full bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-0 border-0">
              <optgroup label="基本フォント">
                <option value="sans">Sans-serif (標準)</option>
                <option value="serif">Serif (明朝体)</option>
                <option value="mono">Monospace (等幅)</option>
              </optgroup>
              <optgroup label="プログラミング向け (Monospace)">
                <option value="fira-code">Fira Code</option>
                <option value="jetbrains-mono">JetBrains Mono</option>
                <option value="hack">Hack</option>
                <option value="cascadia-code">Cascadia Code</option>
                <option value="source-code-pro">Source Code Pro</option>
                <option value="roboto-mono">Roboto Mono</option>
                <option value="ibm-plex-mono">IBM Plex Mono</option>
                <option value="inconsolata">Inconsolata</option>
                <option value="consolas">Consolas</option>
                <option value="ubuntu-mono">Ubuntu Mono</option>
                <option value="dank-mono">Dank Mono</option>
                <option value="victor-mono">Victor Mono</option>
                <option value="space-mono">Space Mono</option>
              </optgroup>
              <optgroup label="サンセリフ (Sans-serif)">
                <option value="inter">Inter</option>
                <option value="roboto">Roboto</option>
                <option value="open-sans">Open Sans</option>
                <option value="lato">Lato</option>
                <option value="montserrat">Montserrat</option>
                <option value="noto-sans">Noto Sans</option>
                <option value="ubuntu">Ubuntu</option>
              </optgroup>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-zinc-400 mb-1">テーマカラー</label>
            <select bind:value={themeColorSetting} class="w-full bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-0 border-0">
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
            <label class="block text-sm font-medium text-zinc-400 mb-1">検索対象ディレクトリ (1行に1つ)</label>
            <textarea bind:value={searchDirsSetting} class="w-full bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-0 min-h-[100px] border-0"></textarea>
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
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div class="w-full max-w-2xl bg-zinc-900 p-6 shadow-xl border border-zinc-800">
        <h2 class="mb-4 text-xl font-bold text-zinc-100">新しいスニペット</h2>
        <div class="space-y-4">
          <div>
            <!-- svelte-ignore a11y_autofocus -->
            <Input bind:value={newSnippetTitle} placeholder="タイトル" class="w-full font-mono text-sm border-0 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-0" autofocus onkeydown={(e) => { if (e.key === 'Escape') showSnippetDialog = false; }}/>
          </div>
          <div>
            <textarea
              bind:value={newSnippetContent}
              placeholder="スニペット内容"
              class="flex min-h-[250px] w-full bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-0 border-0 disabled:cursor-not-allowed disabled:opacity-50"
              onkeydown={(e) => { if (e.key === 'Escape') showSnippetDialog = false; else if (e.key === 'Enter' && e.ctrlKey) handleSaveSnippet(); }}
            ></textarea>
          </div>
          <div>
            <Input bind:value={newSnippetTags} placeholder="タグ (カンマ区切り)" class="w-full font-mono text-sm border-0 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-0" onkeydown={(e) => { if (e.key === 'Escape') showSnippetDialog = false; else if (e.key === 'Enter' && e.ctrlKey) handleSaveSnippet(); }}/>
            <p class="mt-2 text-xs text-zinc-500">保存するには Ctrl+Enter を押してください</p>
          </div>
          <div class="flex justify-end space-x-2 pt-2">
            <button class="rounded-md px-4 py-2 text-sm hover:bg-zinc-800 hover:text-zinc-100 text-zinc-300 transition-colors" onclick={() => showSnippetDialog = false}>キャンセル</button>
            <button class="rounded-md bg-zinc-100 px-4 py-2 text-sm text-zinc-900 hover:bg-zinc-200 transition-colors" onclick={handleSaveSnippet}>OK</button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <Command.Root shouldFilter={false} class="w-full h-full border-0 !bg-zinc-950 text-zinc-100 overflow-hidden flex flex-col">
    <div class="flex items-center border-b border-zinc-800/80 px-4 bg-zinc-950">
      <SearchIcon class="size-5 text-zinc-500 mr-2 shrink-0" />
      <div class="flex-1">
        <Command.Input
          bind:ref={inputRef}
          bind:value={query}
          placeholder="ファイルやスニペットを検索..."
          autofocus
          class="text-lg border-0 bg-transparent text-zinc-100 !ring-0 focus-visible:!ring-0 !outline-none focus-visible:!outline-none shadow-none h-16 px-1 font-medium placeholder:text-zinc-600 tracking-wide"
        />
      </div>
      <button
        class="ml-3 flex items-center justify-center rounded-full p-2.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-all duration-200"
        onclick={() => showSnippetDialog = true}
        title="スニペット追加"
      >
        <PlusIcon class="size-5" />
      </button>
      <button
        class="ml-1 flex items-center justify-center rounded-full p-2.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-all duration-200"
        onclick={() => showSettingsDialog = true}
        title="設定"
      >
        <SettingsIcon class="size-5" />
      </button>
    </div>

    <!-- Mode Selector -->
    <div class="flex items-center px-4 py-2 border-b border-zinc-800/80 space-x-2 bg-zinc-900/50">
      <button
        class="px-3 py-1 text-sm font-medium rounded-full transition-colors {searchMode === 'apps' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}"
        onclick={() => searchMode = 'apps'}
      >
        アプリ切替
      </button>
      <button
        class="px-3 py-1 text-sm font-medium rounded-full transition-colors {searchMode === 'files' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}"
        onclick={() => searchMode = 'files'}
      >
        ファイル検索
      </button>
      <button
        class="px-3 py-1 text-sm font-medium rounded-full transition-colors {searchMode === 'snippets' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}"
        onclick={() => searchMode = 'snippets'}
      >
        スニペット
      </button>
      <div class="flex-1"></div>
      <span class="text-xs text-zinc-500">Tabキーで切替</span>
    </div>

    {#if results.length > 0}
      <Command.List class="flex-1 h-full overflow-y-auto px-2 py-2 space-y-1">
        {#each results as result, i}
          <Command.Item
            value={result.type === "snippet" ? `snippet-${result.title}` : (result.type === "window" ? `window-${result.id}` : `file-${(result as any).path}`)}
            onSelect={() => { executeResult(result); }}

          >
            <div class="flex items-center w-full px-2 py-2">
            {#if result.type === "window"}
              <AppWindowIcon class="size-5 mr-3 shrink-0 group-data-[selected]/command-item:text-primary-foreground text-zinc-400 transition-colors" />
              <span class="file-name font-medium text-base tracking-wide group-data-[selected]/command-item:text-primary-foreground text-zinc-200 transition-colors">{(result as any).app_name}</span>
              <span class="file-path text-sm group-data-[selected]/command-item:text-primary-foreground/70 text-zinc-500 ml-auto overflow-hidden text-ellipsis whitespace-nowrap pl-4 transition-colors">{(result as any).title}</span>
            {:else if result.type === "snippet"}
              <FileTextIcon class="size-5 mr-3 shrink-0 group-data-[selected]/command-item:text-primary-foreground text-zinc-400 transition-colors" />
              <span class="file-name font-medium text-base tracking-wide group-data-[selected]/command-item:text-primary-foreground text-zinc-200 transition-colors">{result.title}</span>
              <span class="file-path text-sm group-data-[selected]/command-item:text-primary-foreground/70 text-zinc-500 ml-auto overflow-hidden text-ellipsis whitespace-nowrap pl-4 transition-colors">Snippet</span>
            {:else}
              <FileIcon class="size-5 mr-3 shrink-0 group-data-[selected]/command-item:text-primary-foreground text-zinc-400 transition-colors" />
              <span class="file-name font-medium text-base tracking-wide group-data-[selected]/command-item:text-primary-foreground text-zinc-200 transition-colors">{(result as any).name}</span>
              <span class="file-path text-sm group-data-[selected]/command-item:text-primary-foreground/70 text-zinc-500 ml-auto overflow-hidden text-ellipsis whitespace-nowrap pl-4 transition-colors">{(result as any).path}</span>
            {/if}
            </div>
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
        background-color: transparent;
    overflow: hidden; /* Hide scrollbars */
  }

  .container {
    width: 100vw;
    height: 100vh;
    padding: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  /* Scrollbar styling */
  :global(::-webkit-scrollbar) {
    width: 4px;
  }
  :global(::-webkit-scrollbar-track) {
    background: #09090b;
  }
  :global(::-webkit-scrollbar-thumb) {
    background: #27272a;
    border-radius: 4px;
  }
</style>
