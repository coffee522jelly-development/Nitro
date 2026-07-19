import { test, expect } from '@playwright/test';

test('search palette handles empty and populated queries', async ({ page }) => {
  // Go to the Tauri app locally
  await page.goto('/');

  // Expect the input field to be visible
  const searchInput = page.getByPlaceholder("Search files or snippets...");
  await expect(searchInput).toBeVisible();

  // Test snippet button opens dialog
  const snippetBtn = page.getByTitle("Add Snippet");
  await snippetBtn.click();

  // Expect Dialog to open
  const dialogTitle = page.getByText("New Snippet");
  await expect(dialogTitle).toBeVisible();

  // Close the dialog
  const cancelBtn = page.getByRole('button', { name: 'Cancel' });
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
    const snippets: {title: string, content: string}[] = [];

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
          snippets.push({ title: args.title, content: args.content });
          return;
        }
        throw new Error(`Unhandled mock command: ${cmd}`);
      }
    };
  });

  await page.goto('/');

  const searchInput = page.getByPlaceholder("Search files or snippets...");
  await expect(searchInput).toBeVisible();

  // Click the Snippet button
  await page.getByTitle("Add Snippet").click();

  // Fill the dialog
  await page.getByPlaceholder("Snippet Title").fill("Test Snippet Demo");
  await page.getByPlaceholder("Snippet Content").fill("Hello from Playwright");

  // Save it
  await page.getByRole('button', { name: 'Save' }).click();

  // Ensure dialog closed
  await expect(page.getByText("New Snippet")).not.toBeVisible();

  // Now search for the newly created snippet
  await searchInput.fill("Test Snippet");

  // We expect to see a search result item containing the text "Test Snippet Demo"
  const resultItem = page.getByText("Test Snippet Demo");
  await expect(resultItem).toBeVisible();
});
