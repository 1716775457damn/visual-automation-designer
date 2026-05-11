/**
 * Unit tests for Tauri commands - Image upload functionality
 * 
 * Validates: Requirements 1.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  validateImageFormat,
  getFileExtension,
  getFileName,
  SUPPORTED_IMAGE_FORMATS,
  SUPPORTED_IMAGE_MIME_TYPES,
  selectImageFile,
  selectMultipleImageFiles,
  addImage,
} from './commands';

describe('Image format validation', () => {
  describe('validateImageFormat', () => {
    it('should return true for supported PNG format', () => {
      expect(validateImageFormat('test.png')).toBe(true);
      expect(validateImageFormat('test.PNG')).toBe(true);
      expect(validateImageFormat('path/to/image.png')).toBe(true);
    });

    it('should return true for supported JPG/JPEG format', () => {
      expect(validateImageFormat('test.jpg')).toBe(true);
      expect(validateImageFormat('test.jpeg')).toBe(true);
      expect(validateImageFormat('test.JPG')).toBe(true);
      expect(validateImageFormat('test.JPEG')).toBe(true);
    });

    it('should return true for supported BMP format', () => {
      expect(validateImageFormat('test.bmp')).toBe(true);
      expect(validateImageFormat('test.BMP')).toBe(true);
    });

    it('should return false for unsupported formats', () => {
      expect(validateImageFormat('test.gif')).toBe(false);
      expect(validateImageFormat('test.webp')).toBe(false);
      expect(validateImageFormat('test.tiff')).toBe(false);
      expect(validateImageFormat('test.pdf')).toBe(false);
      expect(validateImageFormat('test.txt')).toBe(false);
      expect(validateImageFormat('test')).toBe(false);
    });

    it('should handle paths with dots in directory names', () => {
      expect(validateImageFormat('path/to.image/test.png')).toBe(true);
      expect(validateImageFormat('C:\\Users\\test.image\\file.jpg')).toBe(true);
    });
  });

  describe('getFileExtension', () => {
    it('should extract lowercase extension from file path', () => {
      expect(getFileExtension('test.png')).toBe('png');
      expect(getFileExtension('test.JPG')).toBe('jpg');
      expect(getFileExtension('path/to/test.BMP')).toBe('bmp');
    });

    it('should handle files without extension', () => {
      expect(getFileExtension('test')).toBe('');
      expect(getFileExtension('path/to/test')).toBe('');
    });

    it('should handle multiple dots in filename', () => {
      expect(getFileExtension('test.image.png')).toBe('png');
      expect(getFileExtension('test.image.backup.jpg')).toBe('jpg');
    });
    
    it('should handle edge cases', () => {
      expect(getFileExtension('.')).toBe('');
      expect(getFileExtension('..')).toBe('');
      expect(getFileExtension('.hidden')).toBe('');
      expect(getFileExtension('path/.hidden')).toBe('');
    });
  });

  describe('getFileName', () => {
    it('should extract filename without extension', () => {
      expect(getFileName('test.png')).toBe('test');
      expect(getFileName('image.jpg')).toBe('image');
      expect(getFileName('photo.bmp')).toBe('photo');
    });

    it('should handle paths with directories', () => {
      expect(getFileName('path/to/test.png')).toBe('test');
      expect(getFileName('C:\\Users\\test\\image.jpg')).toBe('image');
    });

    it('should handle files without extension', () => {
      expect(getFileName('test')).toBe('test');
      expect(getFileName('path/to/test')).toBe('test');
    });

    it('should handle multiple dots in filename', () => {
      expect(getFileName('test.image.png')).toBe('test.image');
      expect(getFileName('my.test.file.jpg')).toBe('my.test.file');
    });
  });

  describe('Supported formats constants', () => {
    it('should have correct supported formats', () => {
      expect(SUPPORTED_IMAGE_FORMATS).toContain('png');
      expect(SUPPORTED_IMAGE_FORMATS).toContain('jpg');
      expect(SUPPORTED_IMAGE_FORMATS).toContain('jpeg');
      expect(SUPPORTED_IMAGE_FORMATS).toContain('bmp');
      expect(SUPPORTED_IMAGE_FORMATS.length).toBe(4);
    });

    it('should have correct supported MIME types', () => {
      expect(SUPPORTED_IMAGE_MIME_TYPES).toContain('image/png');
      expect(SUPPORTED_IMAGE_MIME_TYPES).toContain('image/jpeg');
      expect(SUPPORTED_IMAGE_MIME_TYPES).toContain('image/bmp');
      expect(SUPPORTED_IMAGE_MIME_TYPES.length).toBe(3);
    });
  });
});

describe('Image upload flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('selectImageFile', () => {
    it('should have correct filter configuration for file dialog', async () => {
      const mockOpen = vi.mocked(open);
      mockOpen.mockResolvedValueOnce(null);

      await selectImageFile();

      expect(mockOpen).toHaveBeenCalledWith({
        multiple: false,
        filters: [
          {
            name: 'Images',
            extensions: ['png', 'jpg', 'jpeg', 'bmp'],
          },
        ],
      });
    });

    it('should return null when user cancels', async () => {
      const mockOpen = vi.mocked(open);
      mockOpen.mockResolvedValueOnce(null);

      const result = await selectImageFile();

      expect(result).toBeNull();
    });

    it('should return selected file path', async () => {
      const mockOpen = vi.mocked(open);
      mockOpen.mockResolvedValueOnce('/path/to/image.png');

      const result = await selectImageFile();

      expect(result).toBe('/path/to/image.png');
    });
  });

  describe('selectMultipleImageFiles', () => {
    it('should have correct configuration for multiple file selection', async () => {
      const mockOpen = vi.mocked(open);
      mockOpen.mockResolvedValueOnce(null);

      await selectMultipleImageFiles();

      expect(mockOpen).toHaveBeenCalledWith({
        multiple: true,
        filters: [
          {
            name: 'Images',
            extensions: ['png', 'jpg', 'jpeg', 'bmp'],
          },
        ],
      });
    });

    it('should return null when user cancels', async () => {
      const mockOpen = vi.mocked(open);
      mockOpen.mockResolvedValueOnce(null);

      const result = await selectMultipleImageFiles();

      expect(result).toBeNull();
    });

    it('should return array of selected file paths', async () => {
      const mockOpen = vi.mocked(open);
      mockOpen.mockResolvedValueOnce(['/path/to/image1.png', '/path/to/image2.jpg']);

      const result = await selectMultipleImageFiles();

      expect(result).toEqual(['/path/to/image1.png', '/path/to/image2.jpg']);
    });

    it('should convert single selection to array', async () => {
      const mockOpen = vi.mocked(open);
      // When multiple=true but user selects only one file, it might return string
      mockOpen.mockResolvedValueOnce('/path/to/single.png');

      const result = await selectMultipleImageFiles();

      expect(result).toEqual(['/path/to/single.png']);
    });
  });

  describe('addImage', () => {
    it('should call invoke with correct parameters', async () => {
      const mockInvoke = vi.mocked(invoke);
      const mockMetadata = {
        id: 'test-id',
        name: 'Test Image',
        filePath: 'test.png',
        width: 100,
        height: 100,
        format: 'png',
        createdAt: '2024-01-01T00:00:00Z',
        hash: 'abc123',
      };
      mockInvoke.mockResolvedValueOnce(mockMetadata);

      const result = await addImage('/path/to/image.png', 'Test Image');

      expect(mockInvoke).toHaveBeenCalledWith('add_image', {
        filePath: '/path/to/image.png',
        name: 'Test Image',
      });
      expect(result).toEqual(mockMetadata);
    });

    it('should throw error for unsupported format', async () => {
      await expect(addImage('/path/to/image.gif', 'Test')).rejects.toThrow(
        '不支持的图片格式'
      );
    });

    it('should validate format before calling backend', async () => {
      const mockInvoke = vi.mocked(invoke);
      mockInvoke.mockResolvedValueOnce({});

      // Valid format should not throw
      await addImage('/path/to/image.png', 'Test');

      // Unsupported format should throw before invoke is called
      await expect(addImage('/path/to/image.webp', 'Test')).rejects.toThrow();
      expect(mockInvoke).toHaveBeenCalledTimes(1); // Only called for valid format
    });
  });
});
