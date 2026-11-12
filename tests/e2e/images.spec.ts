import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { seriousIssues } from './support/axe';
import { skipOnboarding } from './support/onboarding';

/*
 * Images in the text (Phase 16, Tasks G1 and G2). A file dropped on the text goes in at the pointer, a
 * pasted image goes in at the caret, a drag moves an image and Undo puts it back. The image panel asks
 * for the alt text. Vlo stores each image at most 2,400 pixels on its long side. Each export reads the
 * stored image (Task G3).
 */

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function sceneWithThreeParagraphs(page: Page): Promise<Locator> {
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'New project' }).click();
  await page
    .getByRole('dialog', { name: 'New project' })
    .getByRole('button', { name: 'Create project' })
    .click();
  const scene = page.getByRole('textbox', { name: 'Scene 1' });
  await expect(scene).toBeFocused();
  await page.keyboard.type('The harbour at dawn.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Boats came in with the tide.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('The gulls slept.');
  // By its class, because the open image panel hides the rest of the page from the accessibility tree.
  return page.locator('.vlo-manuscript');
}

/** The tag of each block of the scene, such as ["P", "FIGURE", "P"]. */
function blocks(scene: Locator) {
  return scene.evaluate((root) => [...root.children].map((block) => block.tagName));
}

/** Makes a PNG of `width` by `height` pixels in the page and drops it at the point, or pastes it. */
async function giveImage(
  page: Page,
  how: { drop: { x: number; y: number } } | { paste: true },
  size = { width: 3000, height: 1500 },
) {
  await page.evaluate(
    async ({ how, size }) => {
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No canvas.');
      context.fillStyle = '#2f6f8f';
      context.fillRect(0, 0, size.width, size.height);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });
      if (!blob) throw new Error('No PNG.');
      const data = new DataTransfer();
      data.items.add(new File([blob], 'harbour.png', { type: 'image/png' }));
      if ('drop' in how) {
        const { x, y } = how.drop;
        const target = document.elementFromPoint(x, y) ?? document.body;
        target.dispatchEvent(
          new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            dataTransfer: data,
          }),
        );
      } else {
        const target = document.activeElement ?? document.body;
        target.dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
        );
      }
    },
    { how, size },
  );
}

/** The stored rows of the images table, without their bytes. */
function storedImages(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ type: string; width: number; height: number; size: number }[]>((resolve, reject) => {
        const open = indexedDB.open('vlo');
        open.onerror = () => {
          reject(new Error('No database.'));
        };
        open.onsuccess = () => {
          const read = open.result.transaction('images').objectStore('images').getAll();
          read.onsuccess = () => {
            resolve(
              (read.result as { type: string; width: number; height: number; size: number }[]).map(
                ({ type, width, height, size }) => ({ type, width, height, size }),
              ),
            );
            open.result.close();
          };
        };
      }),
  );
}

async function dropOnParagraph(page: Page, scene: Locator, index: number) {
  const box = await scene.locator('p').nth(index).boundingBox();
  if (!box) throw new Error('No paragraph.');
  await giveImage(page, { drop: { x: box.x + box.width - 4, y: box.y + box.height / 2 } });
}

test('a file dropped on the second paragraph goes after it, and the panel asks for the alt text', async ({
  page,
}) => {
  const scene = await sceneWithThreeParagraphs(page);
  await dropOnParagraph(page, scene, 1);
  await expect.poll(() => blocks(scene)).toEqual(['P', 'P', 'FIGURE', 'P']);

  const panel = page.getByRole('dialog', { name: 'Image' });
  await expect(panel).toBeVisible();
  expect(await seriousIssues(page)).toEqual([]);
  await panel.getByLabel('Alt text').fill('Fishing boats at the harbour wall');
  await panel.getByLabel('Caption (optional)').fill('Port Isaac, 1962');
  await panel.getByRole('button', { name: 'Medium' }).click();
  await panel.getByRole('button', { name: 'Done' }).click();
  await expect(panel).toBeHidden();

  const image = scene.getByRole('img', { name: 'Fishing boats at the harbour wall' });
  await expect(image).toBeVisible();
  await expect(scene.locator('figcaption')).toHaveText('Port Isaac, 1962');
  // Vlo keeps the shape and makes the long side 2,400 pixels. The opaque PNG becomes a JPEG.
  await expect
    .poll(() => storedImages(page))
    .toEqual([expect.objectContaining({ type: 'image/jpeg', width: 2400, height: 1200 })]);
  // The words and their count stay the same.
  await expect(page.getByText('13 words', { exact: true })).toBeVisible();

  // The image is still there after a reload.
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'Scene 1' }).getByRole('img', { name: /Fishing boats/ }),
  ).toBeVisible();
});

test('a drag moves an image above the first paragraph, and Undo puts it back', async ({ page }) => {
  const scene = await sceneWithThreeParagraphs(page);
  await dropOnParagraph(page, scene, 1);
  await page.getByRole('dialog', { name: 'Image' }).getByRole('button', { name: 'Done' }).click();
  await expect.poll(() => blocks(scene)).toEqual(['P', 'P', 'FIGURE', 'P']);

  const figure = scene.locator('figure');
  await expect(figure.locator('img')).toBeVisible();
  await figure.dragTo(scene.locator('p').first(), { targetPosition: { x: 2, y: 2 } });
  await expect.poll(() => blocks(scene)).toEqual(['FIGURE', 'P', 'P', 'P']);
  await expect(scene.locator('p').first()).toHaveText('The harbour at dawn.');

  await page.keyboard.press(`${mod}+z`);
  await expect.poll(() => blocks(scene)).toEqual(['P', 'P', 'FIGURE', 'P']);
  // A move keeps the one stored image.
  expect(await storedImages(page)).toHaveLength(1);
});

test('Alt with an arrow key moves the selected image one block', async ({ page }) => {
  const scene = await sceneWithThreeParagraphs(page);
  await dropOnParagraph(page, scene, 1);
  await page.getByRole('dialog', { name: 'Image' }).getByRole('button', { name: 'Done' }).click();
  await expect.poll(() => blocks(scene)).toEqual(['P', 'P', 'FIGURE', 'P']);
  await scene.locator('figure').click();
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(() => blocks(scene)).toEqual(['P', 'FIGURE', 'P', 'P']);
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(() => blocks(scene)).toEqual(['FIGURE', 'P', 'P', 'P']);
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(() => blocks(scene)).toEqual(['P', 'FIGURE', 'P', 'P']);
  // Enter on a selected image opens its panel.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Image' })).toBeVisible();
});

test('a pasted image goes in at the caret, and "Decorative" gives it no description', async ({ page }) => {
  const scene = await sceneWithThreeParagraphs(page);
  // The caret goes to the end of the first paragraph.
  await scene.locator('p').first().click();
  await page.keyboard.press('End');
  await giveImage(page, { paste: true }, { width: 400, height: 300 });
  await expect.poll(() => blocks(scene)).toEqual(['P', 'FIGURE', 'P', 'P']);
  const panel = page.getByRole('dialog', { name: 'Image' });
  await panel.getByLabel(/Decorative/).check();
  await expect(panel.getByLabel('Alt text')).toBeDisabled();
  await panel.getByRole('button', { name: 'Done' }).click();
  await expect(scene.locator('figure img')).toHaveAttribute('alt', '');
  await expect
    .poll(() => storedImages(page))
    .toEqual([expect.objectContaining({ type: 'image/jpeg', width: 400, height: 300 })]);
});

test('the / menu adds an image from a file, and Hide the text blurs it', async ({ page }) => {
  const scene = await sceneWithThreeParagraphs(page);
  await page.keyboard.press('Enter');
  await page.keyboard.type('/image');
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Image' });
  await expect(panel).toBeVisible();
  const png = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    canvas.getContext('2d')?.fillRect(0, 0, 64, 48);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    return [...new Uint8Array(await (blob ?? new Blob()).arrayBuffer())];
  });
  await panel
    .getByLabel('Choose an image file')
    .setInputFiles({ name: 'map.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await panel.getByLabel('Alt text').fill('A map of the bay');
  await panel.getByRole('button', { name: 'Done' }).click();
  // The empty paragraph gave its place to the image, and a new empty one follows it.
  await expect.poll(() => blocks(scene)).toEqual(['P', 'P', 'P', 'FIGURE', 'P']);
  await expect(scene.getByRole('img', { name: 'A map of the bay' })).toBeVisible();

  await page.keyboard.press(`${mod}+Shift+Period`);
  const filter = await scene.locator('.vlo-image-frame').evaluate((frame) => getComputedStyle(frame).filter);
  expect(filter).toMatch(/^blur\(/);
});

/** Runs the export in the open dialog and gives the downloaded file's name and bytes. */
async function exportFile(page: Page, format: RegExp): Promise<{ name: string; bytes: Buffer }> {
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await dialog.getByRole('radio', { name: format }).click();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  const file = await download;
  const bytes = await readFile(await file.path());
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return { name: file.suggestedFilename(), bytes };
}

test('Markdown and Word exports hold the stored image with its alt text', async ({ page }) => {
  const scene = await sceneWithThreeParagraphs(page);
  await dropOnParagraph(page, scene, 0);
  const panel = page.getByRole('dialog', { name: 'Image' });
  await panel.getByLabel('Alt text').fill('Fishing boats at the harbour wall');
  await panel.getByRole('button', { name: 'Done' }).click();
  await expect(scene.getByRole('img', { name: /Fishing boats/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toHaveText('Saved');

  const markdown = await exportFile(page, /Markdown/);
  expect(markdown.name).toBe('Scene 1.zip');
  const zip = await JSZip.loadAsync(markdown.bytes);
  const text = (await zip.file('Scene 1.md')?.async('string')) ?? '';
  expect(text).toContain('The harbour at dawn.\n\n![Fishing boats at the harbour wall](images/image-1.jpg)');
  const stored = await zip.file('images/image-1.jpg')?.async('uint8array');
  // The file is the JPEG that Vlo stored, not the PNG that was dropped.
  expect([...(stored ?? new Uint8Array()).subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);

  const word = await JSZip.loadAsync((await exportFile(page, /Word/)).bytes);
  expect(Object.keys(word.files).filter((name) => name.startsWith('word/media/'))).toHaveLength(1);
  expect((await word.file('word/document.xml')?.async('string')) ?? '').toContain(
    'descr="Fishing boats at the harbour wall"',
  );
});
