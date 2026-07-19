import { test, expect } from '@playwright/test';

test('search palette handles empty and populated queries', async ({ page }) => {
  // Go to the Tauri app locally
  await page.goto('/');

  // Expect the input field to be visible
  const searchInput = page.getByPlaceholder("ファイルやスニペットを検索...");
  await expect(searchInput).toBeVisible();

  // Test snippet button opens dialog
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
  await searchInput.fill("demo");
  await expect(searchInput).toHaveValue("demo");
});

test('can create and search for a code snippet', async ({ page }) => {
  // Inject Tauri IPC mock before the page loads
  await page.addInitScript(() => {
    // Basic Tauri IPC mock for playwright tests
    const snippets: {title: string, content: string, tags: string[]}[] = [];

    // @ts-ignore
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: any) => {
        if (cmd === "search_files") {
          return [];
        }
        if (cmd === "get_snippets") {
          return snippets;
        }
        if (cmd === "save_snippet") {
          snippets.push({ title: args.title, content: args.content, tags: args.tags });
          return;
        }
        throw new Error(`Unhandled mock command: ${cmd}`);
      }
    };
  });

  await page.goto('/');

  const searchInput = page.getByPlaceholder("ファイルやスニペットを検索...");
  await expect(searchInput).toBeVisible();

  // Click the Snippet button
  await page.getByTitle("スニペット追加").click();

  // Fill the dialog
  await page.getByPlaceholder("タイトル").fill("Test Snippet Demo");
  await page.getByPlaceholder("スニペット内容").fill("Hello from Playwright");
  await page.getByPlaceholder("タグ (カンマ区切り)").fill("test, e2e, ts");

  // Save it
  await page.getByRole('button', { name: '保存' }).click();

  // Ensure dialog closed
  await expect(page.getByText("新しいスニペット")).not.toBeVisible();

  // Now search for the newly created snippet (by tag)
  await searchInput.fill("e2e");

  // We expect to see a search result item containing the text "Test Snippet Demo"
  const resultItem = page.getByText("Test Snippet Demo");
  await expect(resultItem).toBeVisible();
});
