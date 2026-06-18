import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { preprocessScreenshotImage } from './screenshot-preprocessor.js';

describe('screenshot image preprocessing', () => {
	it('outputs a readable PNG without resizing the screenshot', async () => {
		expect.assertions(5);
		const source = await sharp({
			create: {
				width: 2,
				height: 1,
				channels: 3,
				background: { r: 170, g: 245, b: 70 }
			}
		})
			.png()
			.toBuffer();

		const result = await preprocessScreenshotImage(new Uint8Array(source));
		const metadata = await sharp(result.bytes).metadata();

		expect(result.type).toBe('image/png');
		expect(result.width).toBe(2);
		expect(result.height).toBe(1);
		expect(metadata.width).toBe(2);
		expect(metadata.height).toBe(1);
	});
});
