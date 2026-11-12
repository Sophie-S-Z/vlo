import { expect, test, vi } from 'vitest';
import { MAX_SHARE_IMAGE_BYTES, shareCopy } from '@/features/share/share';
import { prepareImage } from '@/features/images/resize';

/*
 * Phase 16, decision G6: each image of a link is at most 1,600 pixels on its long side and 2 MB in size,
 * so add_share_image takes it. An image that stays too large at 800 pixels shows its stand-in line.
 */

vi.mock('@/features/images/resize', () => ({ prepareImage: vi.fn() }));

/** A fake resize: a PNG of `side` pixels with `bytes(side)` bytes. */
function resizeTo(bytes: (side: number) => number) {
  vi.mocked(prepareImage).mockImplementation((_file, side = 2400) =>
    Promise.resolve({
      type: 'image/png',
      width: side,
      height: side / 2,
      data: new Blob([new Uint8Array(bytes(side))], { type: 'image/png' }),
    }),
  );
}

const png = (width: number, size: number) => ({
  type: 'image/png' as const,
  width,
  height: width / 2,
  data: new Uint8Array(size),
});

test('a small image stays as Vlo stored it', async () => {
  vi.mocked(prepareImage).mockReset();
  const image = png(1000, 1000);
  expect(await shareCopy(image)).toBe(image);
  expect(prepareImage).not.toHaveBeenCalled();
});

test('a small image with too many bytes gets smaller until it fits', async () => {
  resizeTo((side) => (side > 800 ? MAX_SHARE_IMAGE_BYTES + 1 : 500));
  const copy = await shareCopy(png(1500, 3_000_000));
  expect(copy).toMatchObject({ width: 800, height: 400 });
  expect(copy?.data.byteLength).toBe(500);
});

test('an image that stays too large gives no copy', async () => {
  resizeTo(() => MAX_SHARE_IMAGE_BYTES + 1);
  expect(await shareCopy(png(1500, 3_000_000))).toBeNull();
});
