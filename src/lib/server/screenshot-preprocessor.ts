import sharp from 'sharp';

const OUTPUT_MIME_TYPE = 'image/png';
const MAX_INPUT_PIXELS = 20_000_000;

export type PreprocessedScreenshot = {
	bytes: Uint8Array;
	type: typeof OUTPUT_MIME_TYPE;
	width: number;
	height: number;
};

export async function preprocessScreenshotImage(bytes: Uint8Array): Promise<PreprocessedScreenshot> {
	const { data, info } = await sharp(bytes, {
		animated: false,
		limitInputPixels: MAX_INPUT_PIXELS
	})
		.rotate()
		.removeAlpha()
		.toColorspace('srgb')
		.raw()
		.toBuffer({ resolveWithObject: true });

	if (!info.width || !info.height || info.channels < 3) {
		throw new Error('Unable to decode screenshot image.');
	}

	remapBrightGreenYellowText(data, info.channels);

	const output = await sharp(data, {
		raw: {
			width: info.width,
			height: info.height,
			channels: info.channels
		}
	})
		.grayscale()
		.linear(1.12, -8)
		.sharpen({ sigma: 0.75, m1: 0.7, m2: 0.3 })
		.png({ compressionLevel: 9, adaptiveFiltering: true })
		.toBuffer();

	return {
		bytes: new Uint8Array(output),
		type: OUTPUT_MIME_TYPE,
		width: info.width,
		height: info.height
	};
}

function remapBrightGreenYellowText(data: Uint8Array, channels: number) {
	for (let index = 0; index < data.length; index += channels) {
		const red = data[index];
		const green = data[index + 1];
		const blue = data[index + 2];
		const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

		if (luminance < 145) continue;
		if (green < 145 || red < 105 || blue > 205) continue;
		if (green - blue < 30 || red - blue < 10) continue;
		if (green < red - 70) continue;

		data[index] = 242;
		data[index + 1] = 242;
		data[index + 2] = 242;
	}
}
