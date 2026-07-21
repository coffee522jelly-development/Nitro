import { test, expect } from '@playwright/test';

test('theme class is applied and item background is highlighted', async ({ page }) => {
  await page.addInitScript(() => {
    // @ts-ignore
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: any) => {
        if (cmd === "search_files") return ["/mock/path/test_folder"];
        if (cmd === "get_snippets") return [];
        // Initially load with "red" theme
        if (cmd === "get_settings") return { shortcut: "Ctrl+Space", theme_color: "red", search_dirs: ["/mock/path"] };
        return null;
      }
    };
  });

  await page.goto('/');

  // Verify that the main container has the 'theme-red' class
  const mainContainer = page.locator('main.container');
  await expect(mainContainer).toHaveClass(/theme-red/);

  // Focus the search input and search for the mock file
  const searchInput = page.getByPlaceholder("ファイルやスニペットを検索...");
  await searchInput.fill("test");

  // Wait for the result to appear
  const result = page.getByText("test_folder", { exact: true });
  await expect(result).toBeVisible();

  // The first item should automatically be selected by the Command palette.
  // Validate it has the computed primary background color of the red theme
  const selectedItem = page.locator('[data-selected]');
  await expect(selectedItem).toContainText('test_folder');

  // Assert computed style
  // HSL(0, 72.2%, 50.6%) roughly evaluates to rgb(222, 36, 36) in the browser
  await expect(selectedItem).toHaveCSS('background-color', 'rgb(221, 36, 36)');
});
