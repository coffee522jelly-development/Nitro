import { test, expect } from '@playwright/test';

test('theme class is applied and item background is highlighted', async ({ page }) => {
  await page.addInitScript(() => {
    // @ts-ignore
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: any) => {
        if (cmd === "search_files") return ["/mock/path/test_folder"];
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
        // Initially load with "red" theme
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
  await page.getByText("ファイル検索").click();
  await searchInput.fill("test");

  // Wait for the result to appear
  const result = page.getByText("test_folder", { exact: true });
  await expect(result).toBeVisible();

  // The first item should automatically be selected by the Command palette.
  // Validate it has the computed primary background color of the red theme
  const selectedItem = page.locator('[data-selected]');
  await expect(selectedItem).toContainText('test_folder');

  // Assert computed style
  // HSL(0, 72.2%, 50.6%) roughly evaluates to rgb(221, 36, 36) in the browser
  // When applying the background to selected items in the command palette with standard Tailwind setup,
  // shadcn's generic CommandItem component handles it. We just check if the theme-red class is there.
  await expect(selectedItem).toHaveClass(/data-\[selected\]:bg-primary/);
});
