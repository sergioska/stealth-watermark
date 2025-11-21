# Stealth Watermark 🔐

[![npm version](https://badge.fury.io/js/dwt-watermark.svg)](https://badge.fury.io/js/dwt-watermark)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?logo=node.js&logoColor=white)](https://nodejs.org/)

A robust library for digital image watermarking using **Discrete Wavelet Transform (DWT)** and **Quantization Index Modulation (QIM)**.

## ✨ Features

- **Robust Watermarking**: DWT + QIM algorithm for maximum resistance
- **Multi-Channel**: Support for individual RGB channels
- **Configurable Parameters**: Adjustable quantization and redundancy
- **High Performance**: Optimized for large images
- **Cross-Platform**: Works on Node.js, browser, and edge environments
- **TypeScript**: Complete type definitions included
- **Test Coverage**: Comprehensive test suite for guaranteed quality

## 🚀 Installation

```bash
npm install stealth-watermark
```

```bash
yarn add stealth-watermark
```

```bash
pnpm add stealth-watermark
```

## 📖 Quick Start

### Adding Watermark

```typescript
import { addWatermark, extractWatermark } from 'stealth-watermark';
import { readFileSync, writeFileSync } from 'fs';

// Read the original image
const originalImage = readFileSync('input.png');

// Add watermark
const { image: watermarkedImage } = await addWatermark(originalImage, "Secret message", {
  channel: 0,    // Red channel (0=R, 1=G, 2=B)
  q: 12,         // Quantization step (higher = more robust)
  seed: 1234,    // Seed for permutation (same for extraction)
  reps: 3        // Redundancy for robustness (recommended: 3)
});

// Save the watermarked image
writeFileSync('watermarked.png', watermarkedImage);
```

### Extracting Watermark

```typescript
// Extract the watermark
const extractedMessage = await extractWatermark(watermarkedImage, {
  channel: 0,    // Same channel used for insertion
  q: 12,         // Same quantization step
  seed: 1234,    // Same seed
  reps: 3        // Same redundancy
});

console.log('Extracted message:', extractedMessage);
// Output: Secret message
```

## 🔧 API Reference

### `addWatermark(imageBuffer, watermarkText, options)`

Inserts an invisible watermark into an image.

**Parameters:**
- `imageBuffer: Buffer` - Original image buffer
- `watermarkText: string` - Text to hide
- `options: WatermarkOptions` - Configuration options

**Options:**
```typescript
interface WatermarkOptions {
  channel?: 0 | 1 | 2;     // Color channel (default: 0)
  q?: number;               // Quantization step (default: 12)
  seed?: number;            // Permutation seed (default: 1234)
  reps?: number;            // Redundancy (default: 3)
}
```

**Returns:**
```typescript
Promise<WatermarkResult> {
  image: Buffer;  // Image with watermark
}
```

### `extractWatermark(imageBuffer, options)`

Extracts a watermark from an image.

**Parameters:**
- `imageBuffer: Buffer` - Image buffer with watermark
- `options: WatermarkOptions` - Same options used for insertion

**Returns:**
```typescript
Promise<string>  // Extracted text
```

## 🎯 Advanced Examples

### Multi-Channel Watermarking

```typescript
// Insert watermark in all channels
const channels = [0, 1, 2]; // R, G, B
const messages = ['Red', 'Green', 'Blue'];

for (let i = 0; i < channels.length; i++) {
  const { image } = await addWatermark(
    originalImage, 
    messages[i], 
    { channel: channels[i], q: 8, seed: 1234 + i }
  );
  originalImage = image; // Use output as input for next
}
```

### Robust Configuration

```typescript
// Configuration for maximum robustness
const robustOptions = {
  channel: 0,
  q: 16,        // Higher quantization
  seed: 9999,   // Custom seed
  reps: 5,      // Higher redundancy
};

const { image } = await addWatermark(originalImage, "Important message", robustOptions);
```

### Error Handling

```typescript
try {
  const message = await extractWatermark(imageBuffer, options);
  console.log('Extracted watermark:', message);
} catch (error) {
  if (error.message.includes('Invalid watermark length')) {
    console.error('Extraction parameters are incorrect');
  } else if (error.message.includes('Insufficient capacity')) {
    console.error('Image too small for watermark');
  } else {
    console.error('Extraction error:', error.message);
  }
}
```

## 🔬 How It Works

### 1. **Discrete Wavelet Transform (DWT)**
- Decomposes image into frequency bands
- Uses HL band (High-Low) for watermarking
- Maintains visual quality of the image

### 2. **Quantization Index Modulation (QIM)**
- Quantizes coefficients into distinct buckets
- Bit 0 → lower bucket (0.25q)
- Bit 1 → upper bucket (0.75q)

### 3. **Redundancy and Permutation**
- Repeats each bit multiple times (default: 3x)
- Uses seed-based permutation for security
- Majority voting for robustness

### 4. **Inverse DWT (IDWT)**
- Reconstructs image with watermark
- Maintains original structure
- Watermark invisible to human eye

## 📊 Performance

- **Speed**: ~100ms for 1024x1024 image
- **Capacity**: ~1KB for 512x512 image
- **Robustness**: Resists JPEG compression (90% quality)
- **Memory**: Optimized for large images

## 🧪 Testing

```bash
# Run all tests
npm test

# Test in watch mode
npm run test:watch

# Test with coverage
npm run test:coverage
```

## 🛠️ Development

### Local Setup

```bash
# Clone repository
git clone https://github.com/sergioska/stealth-watermark.git
cd stealth-watermark

# Install dependencies
npm install

# Build project
npm run build

# Run tests
npm test
```

### Available Scripts

- `npm run build` - Compile TypeScript
- `npm run test` - Run test suite
- `npm run lint` - Check code with ESLint
- `npm run format` - Format code with Prettier

## 🤝 Contributing

Contributions are welcome! To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is released under the MIT license. See [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- **DWT Algorithm**: Based on Haar wavelet transform
- **QIM Implementation**: Quantization Index Modulation for robustness
- **Image Processing**: Uses Jimp and pngjs libraries

## 📞 Support

- 🐛 **Issues**: [GitHub Issues](https://github.com/tuousername/dwt-watermark/issues)
- 📚 **Documentation**: [Wiki](https://github.com/tuousername/dwt-watermark/wiki)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/tuousername/dwt-watermark/discussions)

---

⭐ **If this project is useful to you, consider giving it a star on GitHub!**
