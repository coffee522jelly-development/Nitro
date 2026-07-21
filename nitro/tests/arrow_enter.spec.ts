import { test, expect } from '@playwright/test';

test('arrow keys and enter can open a file', async ({ page }) => {
  let openerCalled = false;
  let openedPath = "";

  await page.addInitScript(() => {
    // @ts-ignore
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: any) => {
        if (cmd === "search_files") return ["/mock/path/test_folder", "/mock/path/test_document.txt"];
        if (cmd === "get_snippets") return [];
        if (cmd === "get_settings") return { shortcut: "Ctrl+Space", theme_color: "zinc", search_dirs: ["/mock/path"] };
        if (cmd === "plugin:opener|open") {
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

  const searchInput = page.getByPlaceholder("ファイルやスニペットを検索...");
  await expect(searchInput).toBeVisible();

  // Type to trigger search
  await searchInput.fill("test");

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
