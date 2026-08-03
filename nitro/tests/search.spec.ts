import { test, expect } from '@playwright/test';

test('search palette handles empty and populated queries', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: any) => {
        if (cmd === "search_files") return [];
        if (cmd === "focus_window") return Promise.resolve();
        if (cmd === "app_get_open_windows") return Promise.resolve([]);
        if (cmd === "get_snippets") return [];
        if (cmd === "get_settings") return { shortcut: "Ctrl+Space", theme_color: "zinc", search_dirs: [] };
        if (cmd === "plugin:event|listen") return Promise.resolve(1234);
        if (cmd === "plugin:event|unlisten") return Promise.resolve();
        return null;
      }
    };
  });

  // Go to the Tauri app locally
  await page.goto('/');

  // Expect the input field to be visible
  const searchInput = page.getByPlaceholder("アプリを検索...");
  await expect(searchInput).toBeVisible();

  // Test snippet button opens dialog
  await page.getByText("Snippets").click();
  const snippetBtn = page.getByTitle("スニペット追加");
  await snippetBtn.click();

  // Expect Dialog to open
  const dialogTitle = page.getByText("新しいスニペット");
  await expect(dialogTitle).toBeVisible();

  // Close the dialog
  const cancelBtn = page.getByRole('button', { name: 'キャンセル' });
  await cancelBtn.click();
  await expect(dialogTitle).not.toBeVisible();

  // Test typing a query doesn't crash the app
  await page.getByText("Apps").click(); await page.getByPlaceholder("アプリを検索...").fill("demo");
  await expect(searchInput).toHaveValue("demo");
});

test('can create and search for a code snippet', async ({ page }) => {
  // Inject Tauri IPC mock before the page loads
  await page.addInitScript(() => {
    // Basic Tauri IPC mock for playwright tests
    const snippets: {title: string, content: string, tags: string[]}[] = [];

    // @ts-ignore
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: any) => {
        if (cmd === "search_files") {
          return [];
        }
                        if (cmd === "focus_window") {
          return Promise.resolve();
        }
        if (cmd === "app_get_open_windows") {
          return Promise.resolve([]);
        }
        if (cmd === "get_snippets") {
          return snippets;
        }
        if (cmd === "get_settings") return { shortcut: "Ctrl+Space", theme_color: "zinc", search_dirs: [] };
        if (cmd === "plugin:event|listen") return Promise.resolve(1234);
        if (cmd === "plugin:event|unlisten") return Promise.resolve();
        if (cmd === "save_snippet") {
          snippets.push({ title: args.title, content: args.content, tags: args.tags });
          return;
        }
        if (cmd === "get_settings") return { shortcut: "Ctrl+Space", theme_color: "zinc", search_dirs: [] };
        if (cmd === "plugin:event|listen") return Promise.resolve(1234);
        if (cmd === "plugin:event|unlisten") return Promise.resolve();
        return null;
      }
    };
  });

  await page.goto('/');

  const searchInput = page.getByPlaceholder("アプリを検索...");
  await expect(searchInput).toBeVisible();

  // Click the Snippet button
  await page.getByText("Snippets").click();
  await page.getByTitle("スニペット追加").click();

  // Fill the dialog
  await page.getByPlaceholder("タイトル").fill("Test Snippet Demo");
  await page.getByPlaceholder("スニペット内容").fill("Hello from Playwright");
  await page.getByPlaceholder("タグ (カンマ区切り)").fill("test, e2e, ts");

  // Save it
  await page.getByRole('button', { name: 'OK' }).click({ force: true });

  // Ensure dialog closed
  await expect(page.getByText("新しいスニペット")).toBeHidden();
  await page.waitForTimeout(500);

  // Now search for the newly created snippet (by tag)
  await page.getByText("Snippets").click();
  await page.getByPlaceholder("スニペットを検索...").fill("e2e");

  // We expect to see a search result item containing the text "Test Snippet Demo"
  const resultItem = page.getByText("Test Snippet Demo");
  await expect(resultItem).toBeVisible();

  // Test opening the snippet viewer
  await page.keyboard.press('Enter');
  const viewerTitle = page.getByRole('heading', { name: "Test Snippet Demo" });
  await expect(viewerTitle).toBeVisible();

  // Ensure the close button exists
  const viewerCloseBtn = page.getByRole('button', { name: '閉じる', exact: true });
  await expect(viewerCloseBtn).toBeVisible();

  // Test the new delete button
  const deleteBtn = page.getByRole('button', { name: '削除', exact: true });
  await expect(deleteBtn).toBeVisible();

  // Test the new copy button
  const copyBtn = page.getByRole('button', { name: 'コピー', exact: true });
  await expect(copyBtn).toBeVisible();
});

test('can create and search for a japanese code snippet', async ({ page }) => {
  await page.addInitScript(() => {
    const snippets: {title: string, content: string, tags: string[]}[] = [];
    // @ts-ignore
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: any) => {
        if (cmd === "search_files") return [];
                        if (cmd === "focus_window") {
          return Promise.resolve();
        }
        if (cmd === "app_get_open_windows") {
          return Promise.resolve([]);
        }
        if (cmd === "get_snippets") return snippets;
        if (cmd === "get_settings") return { shortcut: "Ctrl+Space", theme_color: "zinc", search_dirs: [] };
        if (cmd === "plugin:event|listen") return Promise.resolve(1234);
        if (cmd === "plugin:event|unlisten") return Promise.resolve();
        if (cmd === "save_snippet") {
          snippets.push({ title: args.title, content: args.content, tags: args.tags });
          return;
        }
        if (cmd === "get_settings") return { shortcut: "Ctrl+Space", theme_color: "zinc", search_dirs: [] };
        if (cmd === "plugin:event|listen") return Promise.resolve(1234);
        if (cmd === "plugin:event|unlisten") return Promise.resolve();
        return null;
      }
    };
  });

  await page.goto('/');

  // Open snippet dialog
  await page.getByText("Snippets").click();
  await page.getByTitle("スニペット追加").click();

  // Fill the dialog with Japanese text
  await page.getByPlaceholder("タイトル").fill("日本語のテスト");
  await page.getByPlaceholder("スニペット内容").fill("console.log('こんにちは');");
  await page.getByPlaceholder("タグ (カンマ区切り)").fill("日本語, test");

  // Save it
  await page.getByRole('button', { name: 'OK' }).click({ force: true });

  // Search using Japanese
  await page.getByText("Snippets").click();
  await page.getByPlaceholder("スニペットを検索...").fill("日本語");

  // Result should be visible
  const resultItem = page.getByText("日本語のテスト");
  await expect(resultItem).toBeVisible();

  // Open it and check the viewer
  await page.keyboard.press('Enter');
  const viewerTitle = page.getByRole('heading', { name: "日本語のテスト" });
  await expect(viewerTitle).toBeVisible();

  // Tag should be visible in viewer
  const tagBadge = page.getByText("日本語", { exact: true });
  await expect(tagBadge).toBeVisible();
});
