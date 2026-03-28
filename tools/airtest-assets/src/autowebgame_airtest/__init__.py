"""Curated Airtest image-matching extraction for AutoWebGame asset workflows."""

from .confidence import cal_ccoeff_confidence, cal_rgb_confidence
from .image_ops import crop_image, draw_rectangle, imread, imwrite
from .multiscale import find_multiscale_template
from .template import compare_similarity, find_all_template, find_template

__all__ = [
    "cal_ccoeff_confidence",
    "cal_rgb_confidence",
    "compare_similarity",
    "crop_image",
    "draw_rectangle",
    "find_all_template",
    "find_multiscale_template",
    "find_template",
    "imread",
    "imwrite",
]
