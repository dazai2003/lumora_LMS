"""
OCR Service: Extract text from images and PDFs using Tesseract and PyMuPDF.
Runs locally — lightweight enough for any machine.
"""
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def extract_text_from_image(file_path: str) -> Optional[str]:
    """Extract text from an image using Tesseract OCR."""
    try:
        import pytesseract
        import cv2

        # Set Tesseract path from environment
        tesseract_path = os.getenv("TESSERACT_PATH")
        if tesseract_path and os.path.exists(tesseract_path):
            pytesseract.pytesseract.tesseract_cmd = tesseract_path

        # Load and preprocess image for better OCR
        img = cv2.imread(file_path)
        if img is None:
            logger.error(f"Could not read image: {file_path}")
            return None

        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Apply adaptive threshold for better text detection
        processed = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )

        # Run OCR
        text = pytesseract.image_to_string(processed, lang="eng")
        cleaned = text.replace("\x00", "").strip()

        if cleaned:
            logger.info(f"OCR extracted {len(cleaned)} chars from image: {file_path}")
            return cleaned
        else:
            logger.info(f"OCR found no text in image: {file_path}")
            return None

    except ImportError as e:
        logger.error(f"OCR dependency not installed: {e}")
        return None
    except Exception as e:
        logger.error(f"OCR failed for {file_path}: {e}")
        return None


def extract_text_from_pdf(file_path: str) -> Optional[str]:
    """Extract text from a PDF using PyMuPDF (with OCR fallback for scanned pages)."""
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(file_path)
        all_text = []

        for page_num, page in enumerate(doc):
            # Try direct text extraction first (for digital/searchable PDFs)
            text = page.get_text("text")

            if text and text.strip():
                clean_page_txt = text.replace("\x00", "").strip()
                if clean_page_txt:
                    all_text.append(clean_page_txt)
            else:
                # Fallback: render page as image and OCR it
                logger.info(f"Page {page_num + 1}: No embedded text, attempting OCR...")
                try:
                    pix = page.get_pixmap(dpi=200)
                    img_path = file_path + f"_page_{page_num}.png"
                    pix.save(img_path)
                    ocr_text = extract_text_from_image(img_path)
                    if ocr_text:
                        clean_ocr = ocr_text.replace("\x00", "").strip()
                        if clean_ocr:
                            all_text.append(clean_ocr)
                    # Clean up temp image
                    if os.path.exists(img_path):
                        os.remove(img_path)
                except Exception as ocr_err:
                    logger.warning(f"OCR fallback failed for page {page_num + 1}: {ocr_err}")

        doc.close()

        combined = "\n\n".join(all_text)
        cleaned_combined = combined.replace("\x00", "").strip()
        if cleaned_combined:
            logger.info(f"PDF extraction: {len(cleaned_combined)} chars from {file_path}")
            return cleaned_combined

        return None

    except ImportError as e:
        logger.error(f"PDF dependency not installed: {e}")
        return None
    except Exception as e:
        logger.error(f"PDF extraction failed for {file_path}: {e}")
        return None
