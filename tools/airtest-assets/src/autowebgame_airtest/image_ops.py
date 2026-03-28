"""Image helpers adapted from Airtest's aircv module."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from .errors import FileNotExistError


def _normalize_channels(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    if image.ndim == 3 and image.shape[2] == 4:
        return cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
    return image


def imread(filename: str | Path, flatten: bool = False) -> np.ndarray:
    path = Path(filename)
    if not path.is_file():
        raise FileNotExistError(f"File not exist: {path}")

    buffer = np.fromfile(path, dtype=np.uint8)
    mode = cv2.IMREAD_GRAYSCALE if flatten else cv2.IMREAD_UNCHANGED
    image = cv2.imdecode(buffer, mode)
    if image is None:
        raise FileNotExistError(f"Unable to decode image: {path}")
    return image if flatten else _normalize_channels(image)


def cv2_to_pil(image: np.ndarray) -> Image.Image:
    if image.ndim == 2:
        return Image.fromarray(image)
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    return Image.fromarray(rgb)


def imwrite(filename: str | Path, image: np.ndarray, quality: int = 95) -> None:
    path = Path(filename)
    path.parent.mkdir(parents=True, exist_ok=True)
    cv2_to_pil(image).save(path, quality=quality, optimize=True)


def crop_image(image: np.ndarray, rect: tuple[int, int, int, int] | list[int]) -> np.ndarray:
    if len(rect) != 4:
        raise ValueError("rect must be [x_min, y_min, x_max, y_max]")
    x_min, y_min, x_max, y_max = [int(value) for value in rect]
    height, width = image.shape[:2]
    x_min = max(0, min(width - 1, x_min))
    y_min = max(0, min(height - 1, y_min))
    x_max = max(0, min(width, x_max))
    y_max = max(0, min(height, y_max))
    return image[y_min:y_max, x_min:x_max]


def draw_rectangle(
    image: np.ndarray,
    rectangle: tuple[tuple[int, int], tuple[int, int], tuple[int, int], tuple[int, int]],
    color: tuple[int, int, int] = (0, 255, 0),
    thickness: int = 2,
) -> np.ndarray:
    preview = image.copy()
    points = np.array(rectangle, dtype=np.int32)
    cv2.polylines(preview, [points], isClosed=True, color=color, thickness=thickness)
    return preview
