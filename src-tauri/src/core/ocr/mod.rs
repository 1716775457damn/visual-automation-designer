//! OCR (Optical Character Recognition) engine
//!
//! On Windows 10+, uses Windows.Media.Ocr API for text extraction.
//! On other platforms, returns a "not supported" error.
//!
//! Validates: Phase B — OCR Node

use serde::{Deserialize, Serialize};
use crate::error::{AppError, Result};

/// A single line of OCR-recognized text with position info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrLine {
    /// The recognized text
    pub text: String,
    /// Bounding box (x, y, width, height) in pixels
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// OCR recognition result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrResult {
    /// All recognized text concatenated
    pub text: String,
    /// Individual text lines with positions
    pub lines: Vec<OcrLine>,
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use image::RgbaImage;

    use windows::Graphics::Imaging::{
        BitmapPixelFormat, SoftwareBitmap,
    };
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::InMemoryRandomAccessStream;

    /// Internal helper: create a SoftwareBitmap from RGBA pixel data
    /// Uses a memory stream + BitmapEncoder round-trip, which avoids direct
    /// pointer manipulation of the SoftwareBitmap buffer.
    fn rgba_to_software_bitmap(rgba: &[u8], width: i32, height: i32) -> Result<SoftwareBitmap> {
        // Encode the RGBA data as PNG in memory
        let mut png_buffer = std::io::Cursor::new(Vec::new());
        image::write_buffer_with_format(
            &mut png_buffer,
            rgba,
            width as u32,
            height as u32,
            image::ColorType::Rgba8,
            image::ImageFormat::Png,
        )
        .map_err(|e| {
            AppError::ExecutionFailed(format!("Failed to encode OCR image as PNG: {}", e))
        })?;

        let png_bytes = png_buffer.into_inner();

        // Write PNG data to an in-memory stream
        let stream = InMemoryRandomAccessStream::new().map_err(|e| {
            AppError::ExecutionFailed(format!("Failed to create in-memory stream: {}", e))
        })?;

        // Write PNG bytes to the stream
        {
            use windows::Storage::Streams::DataWriter;
            let writer = DataWriter::CreateDataWriter(&stream).map_err(|e| {
                AppError::ExecutionFailed(format!("Failed to create DataWriter: {}", e))
            })?;

            writer.WriteBytes(&png_bytes).map_err(|e| {
                AppError::ExecutionFailed(format!("Failed to write PNG bytes: {}", e))
            })?;

            writer.StoreAsync().map_err(|e| {
                AppError::ExecutionFailed(format!("Failed to flush DataWriter: {}", e))
            })?.get().map_err(|e| {
                AppError::ExecutionFailed(format!("DataWriter flush failed: {}", e))
            })?;

            // Flush to ensure all data is written before seeking
            writer.FlushAsync().map_err(|e| {
                AppError::ExecutionFailed(format!("Failed to flush DataWriter: {}", e))
            })?.get().map_err(|e| {
                AppError::ExecutionFailed(format!("DataWriter flush failed: {}", e))
            })?;
        }

        // Seek the stream to beginning
        stream.Seek(0).map_err(|e| {
            AppError::ExecutionFailed(format!("Failed to seek stream: {}", e))
        })?;

        // Decode the PNG stream into a SoftwareBitmap
        use windows::Graphics::Imaging::BitmapDecoder;
        let decoder = BitmapDecoder::CreateAsync(&stream).map_err(|e| {
            AppError::ExecutionFailed(format!("Failed to create BitmapDecoder: {}", e))
        })?.get().map_err(|e| {
            AppError::ExecutionFailed(format!("BitmapDecoder async failed: {}", e))
        })?;

        let software_bitmap = decoder.GetSoftwareBitmapAsync().map_err(|e| {
            AppError::ExecutionFailed(format!("Failed to get SoftwareBitmap: {}", e))
        })?.get().map_err(|e| {
            AppError::ExecutionFailed(format!("GetSoftwareBitmap async failed: {}", e))
        })?;

        // Convert to Rgba8 if needed (decoder may return Bgra8)
        let target_format = BitmapPixelFormat::Rgba8;
        let converted = SoftwareBitmap::Convert(&software_bitmap, target_format)
            .map_err(|e| {
                AppError::ExecutionFailed(format!("Failed to convert SoftwareBitmap pixel format: {}", e))
            })?;

        Ok(converted)
    }

    /// Internal helper: extract lines from an OCR result
    fn extract_lines(ocr_result_text: &str) -> Vec<OcrLine> {
        // Since Windows.Media.Ocr.OcrResult.Lines is an IVectorView
        // that requires COM iteration, we use a simplified approach:
        // split the recognized text by newlines and create OcrLine entries
        // without positional data (the engine handles text recognition).
        ocr_result_text
            .lines()
            .map(|line| OcrLine {
                text: line.to_string(),
                x: 0,
                y: 0,
                width: 0,
                height: 0,
            })
            .collect()
    }

    /// Run OCR using Windows.Media.Ocr
    pub(super) fn recognize_text_impl(
        image: &RgbaImage,
        language: Option<&str>,
    ) -> Result<OcrResult> {
        let width = image.width() as i32;
        let height = image.height() as i32;
        let rgba = image.as_raw();

        // Create SoftwareBitmap from RGBA pixel data via memory stream
        let software_bitmap = rgba_to_software_bitmap(rgba, width, height)?;

        // Create OCR engine
        let engine = if let Some(lang) = language {
            // Convert &str to HSTRING for the Windows API
            let lang_hstring = windows::core::HSTRING::from(lang);
            let language_obj = windows::Globalization::Language::CreateLanguage(&lang_hstring)
                .map_err(|e| {
                    AppError::ExecutionFailed(format!(
                        "Failed to create language '{}': {}",
                        lang, e
                    ))
                })?;

            // Check if language is available
            let available = OcrEngine::IsLanguageSupported(&language_obj)
                .map_err(|e| {
                    AppError::ExecutionFailed(format!(
                        "Failed to check OCR language support: {}",
                        e
                    ))
                })?;

            if !available {
                return Err(AppError::ExecutionFailed(format!(
                    "OCR language '{}' is not available on this system",
                    lang
                )));
            }

            OcrEngine::TryCreateFromLanguage(&language_obj).map_err(|e| {
                AppError::ExecutionFailed(format!("Failed to create OCR engine for '{}': {}", lang, e))
            })?
        } else {
            // Use user profile languages
            OcrEngine::TryCreateFromUserProfileLanguages().map_err(|e| {
                AppError::ExecutionFailed(format!("Failed to create OCR engine: {}", e))
            })?
        };

        // Recognize
        let ocr_result = engine
            .RecognizeAsync(&software_bitmap)
            .map_err(|e| AppError::ExecutionFailed(format!("OCR recognition failed: {}", e)))?
            .get()
            .map_err(|e| AppError::ExecutionFailed(format!("OCR async failed: {}", e)))?;

        // Extract the recognized text using the OcrResult.Text property
        let recognized_text = ocr_result.Text().map_err(|e| {
            AppError::ExecutionFailed(format!("Failed to get OCR result text: {}", e))
        })?;

        let text = recognized_text.to_string();
        let lines = extract_lines(&text);

        Ok(OcrResult { text, lines })
    }
}

/// Run OCR on an image
pub fn recognize_text(
    image: &image::RgbaImage,
    language: Option<&str>,
) -> Result<OcrResult> {
    #[cfg(windows)]
    {
        windows_impl::recognize_text_impl(image, language)
    }

    #[cfg(not(windows))]
    {
        let _ = image; // suppress unused warning
        Err(AppError::ExecutionFailed(
            "OCR is only supported on Windows 10+ (Windows.Media.Ocr)".to_string(),
        ))
    }
}

/// Check if OCR is available on the current platform
pub fn is_ocr_available() -> bool {
    #[cfg(windows)]
    {
        true
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// Check if keyword exists in OCR result (case-insensitive partial match)
pub fn contains_keyword(text: &str, keyword: &str) -> bool {
    text.to_lowercase().contains(&keyword.to_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_contains_keyword_found() {
        assert!(contains_keyword("Hello World", "world"));
        assert!(contains_keyword("Hello World", "HELLO"));
        assert!(contains_keyword("你好世界", "世界"));
    }

    #[test]
    fn test_contains_keyword_not_found() {
        assert!(!contains_keyword("Hello World", "xyz"));
        assert!(!contains_keyword("你好世界", "再见"));
    }

    #[test]
    fn test_contains_keyword_case_insensitive() {
        assert!(contains_keyword("Hello World", "hello"));
        assert!(contains_keyword("Hello World", "WORLD"));
        assert!(contains_keyword("HELLO", "hello"));
    }

    #[test]
    fn test_contains_keyword_empty() {
        assert!(contains_keyword("anything", ""), "Empty keyword should always match");
        assert!(contains_keyword("", ""), "Empty string with empty keyword should match");
    }

    #[test]
    fn test_contains_keyword_partial_word() {
        assert!(contains_keyword("automation", "auto"));
        assert!(contains_keyword("automation", "tion"));
    }

    #[test]
    fn test_is_ocr_available() {
        // This function returns true on Windows, false elsewhere
        // Just verify it doesn't panic
        let _available = is_ocr_available();
    }
}
