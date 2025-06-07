// Color ranges for skin detection in HSV
const SKIN_COLOR_RANGE = {
  lower: { h: 0, s: 20, v: 70 },
  upper: { h: 20, s: 255, v: 255 }
};

// Convert RGB to HSV
export const rgbToHsv = (r: number, g: number, b: number) => {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = max === 0 ? 0 : delta / max;
  let v = max;

  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }

    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  return { h, s: s * 100, v: v * 100 };
};

// Check if a color is within skin color range
export const isSkinColor = (h: number, s: number, v: number): boolean => {
  return (
    h >= SKIN_COLOR_RANGE.lower.h &&
    h <= SKIN_COLOR_RANGE.upper.h &&
    s >= SKIN_COLOR_RANGE.lower.s &&
    s <= SKIN_COLOR_RANGE.upper.s &&
    v >= SKIN_COLOR_RANGE.lower.v &&
    v <= SKIN_COLOR_RANGE.upper.v
  );
};

// Process image data to detect skin
export const detectSkin = (imageData: ImageData): Uint8ClampedArray => {
  const { data, width, height } = imageData;
  const skinMask = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const { h, s, v } = rgbToHsv(r, g, b);
    const isSkin = isSkinColor(h, s, v);

    // Set white for skin pixels, black for non-skin
    const value = isSkin ? 255 : 0;
    skinMask[i] = value;     // R
    skinMask[i + 1] = value; // G
    skinMask[i + 2] = value; // B
    skinMask[i + 3] = 255;   // A
  }

  return skinMask;
};

// Find the largest contour in the image
export const findLargestContour = (imageData: ImageData): { x: number, y: number, width: number, height: number } | null => {
  const { width, height } = imageData;
  const visited = new Set<number>();
  let largestContour: number[] = [];
  let maxArea = 0;

  // Helper function to get pixel index
  const getPixelIndex = (x: number, y: number) => (y * width + x) * 4;

  // Helper function to check if pixel is white (skin)
  const isWhitePixel = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const idx = getPixelIndex(x, y);
    return imageData.data[idx] === 255;
  };

  // Flood fill algorithm to find connected components
  const floodFill = (startX: number, startY: number) => {
    const stack: [number, number][] = [[startX, startY]];
    const contour: number[] = [];
    let area = 0;

    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      const idx = getPixelIndex(x, y);

      if (visited.has(idx)) continue;
      visited.add(idx);

      if (!isWhitePixel(x, y)) continue;

      contour.push(x, y);
      area++;

      // Check 8-connected neighbors
      const neighbors = [
        [x + 1, y], [x - 1, y],
        [x, y + 1], [x, y - 1],
        [x + 1, y + 1], [x - 1, y - 1],
        [x + 1, y - 1], [x - 1, y + 1]
      ];

      for (const [nx, ny] of neighbors) {
        if (!visited.has(getPixelIndex(nx, ny)) && isWhitePixel(nx, ny)) {
          stack.push([nx, ny]);
        }
      }
    }

    return { contour, area };
  };

  // Find all contours
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = getPixelIndex(x, y);
      if (!visited.has(idx) && isWhitePixel(x, y)) {
        const { contour, area } = floodFill(x, y);
        if (area > maxArea) {
          maxArea = area;
          largestContour = contour;
        }
      }
    }
  }

  if (largestContour.length === 0) return null;

  // Calculate bounding box
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let i = 0; i < largestContour.length; i += 2) {
    const x = largestContour[i];
    const y = largestContour[i + 1];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
};

// Calculate hand features for ASL recognition
export const calculateHandFeatures = (contour: number[]): number[] => {
  // TODO: Implement feature extraction for ASL recognition
  // This will include:
  // 1. Number of fingers extended
  // 2. Angles between fingers
  // 3. Relative positions of finger tips
  // 4. Palm orientation
  return [];
}; 