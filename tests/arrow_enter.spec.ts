import { test, expect } from '@playwright/test';

test('arrow keys and enter can open a file', async ({ page }) => {
  let openerCalled = false;
  let openedPath = "";

  await page.addInitScript(() => {
    // @ts-ignore
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: any) => {
        if (cmd === "search_files") return ["/mock/path/test_folder", "/mock/path/test_document.txt"];
                        if (cmd === "focus_window") {
          return Promise.resolve();
        }
        if (cmd === "app_get_open_windows") {
          return Promise.resolve([]);
        }
        if (cmd === "get_snippets") return [];
        if (cmd === "plugin:event|listen") {
          return Promise.resolve(Math.floor(Math.random() * 1000));
        }
        if (cmd === "plugin:event|unlisten") {
          return Promise.resolve();
        }
                if (cmd === "show_context_menu") {
          // Simulate native context menu opened
          (window as any).__CONTEXT_MENU_OPENED = true;
          // Simulate user clicking "Open" in the native context menu
          if ((window as any).__TAURI_INTERNALS__.plugins && (window as any).__TAURI_INTERNALS__.plugins.event && (window as any).__TAURI_INTERNALS__.plugins.event.emit) {
             // In full mock we might do this, but since we mock `listen` directly returning a mock id,
             // we need to actually execute the registered callback.
             // For testing, let's just assert that `show_context_menu` was called.
          }
          return null;
        }
        if (cmd === "get_clipboard_history") return ["test clipboard"];
        if (cmd === "get_settings") return { shortcut: "Ctrl+Space", theme_color: "zinc", font_family: "sans", search_dirs: ["/mock/path"], theme_mode: "system", show_invisibles: false, search_debounce_ms: 0 };
        if (cmd === "plugin:opener|open" || cmd === "plugin:opener|open_path" || cmd === "open_target") {
          // @ts-ignore
          window.__OPENER_CALLED = true;
          // @ts-ignore
          window.__OPENED_PATH = args.path;
          return;
        }
        return null;
      }
    };
  });

  await page.goto('/');

  const searchInput = page.getByPlaceholder("アプリを検索...");
  await expect(searchInput).toBeVisible();

  // Type to trigger search
  await page.keyboard.press("Tab");
  await page.getByPlaceholder("ファイルを検索...").fill("test");

  // Wait for results to appear
  const firstResult = page.getByText("test_folder", { exact: true });
  const secondResult = page.getByText("test_document.txt", { exact: true });
  await expect(firstResult).toBeVisible();
  await expect(secondResult).toBeVisible();

  // The Command component auto-selects the first item ("test_folder").
  // Pressing ArrowDown moves to the *second* item ("test_document.txt").
  await page.keyboard.press('ArrowDown');

  // Verify it has the data-selected attribute and it contains the second result's name
  await expect(page.locator('[data-selected]')).toContainText('test_document.txt');

  // Press Enter to open it
  await page.keyboard.press('Enter');

  // Verify the backend plugin:opener|open was called correctly
  await page.waitForFunction(() => (window as any).__OPENER_CALLED === true);
  const path = await page.evaluate(() => (window as any).__OPENED_PATH);

  expect(path).toBe("/mock/path/test_document.txt");
});
