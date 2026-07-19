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
