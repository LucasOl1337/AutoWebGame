"""Multi-scale matching adapted from Airtest's multiscale template matcher."""

from __future__ import annotations

import time

import cv2

from .confidence import cal_ccoeff_confidence, cal_rgb_confidence, img_mat_rgb_to_gray
from .template import check_source_larger_than_search, generate_result


def _resize_by_ratio(
    source: np.ndarray,
    search: np.ndarray,
    ratio: float,
    source_max: int,
) -> tuple[np.ndarray, np.ndarray, float]:
    source_ratio = min(source_max / max(source.shape[:2]), 1.0)
    scaled_source = cv2.resize(
        source, (int(source.shape[1] * source_ratio), int(source.shape[0] * source_ratio))
    )
    source_height, source_width = scaled_source.shape[:2]
    search_height, search_width = search.shape[:2]
    if search_height / source_height >= search_width / source_width:
        target_ratio = (source_height * ratio) / search_height
    else:
        target_ratio = (source_width * ratio) / search_width
    scaled_search = cv2.resize(
        search,
        (max(int(search_width * target_ratio), 1), max(int(search_height * target_ratio), 1)),
    )
    return scaled_source, scaled_search, source_ratio


def _restore_original_size(
    max_loc: tuple[int, int], width: int, height: int, source_ratio: float
) -> tuple[tuple[int, int], int, int]:
    restored_loc = (int(max_loc[0] / source_ratio), int(max_loc[1] / source_ratio))
    restored_width = int(width / source_ratio)
    restored_height = int(height / source_ratio)
    return restored_loc, restored_width, restored_height


def _confidence_from_crop(
    im_source: np.ndarray,
    im_search: np.ndarray,
    max_loc: tuple[int, int],
    width: int,
    height: int,
    rgb: bool,
) -> float:
    search_height, search_width = im_search.shape[:2]
    crop = im_source[max_loc[1] : max_loc[1] + height, max_loc[0] : max_loc[0] + width]
    resized_crop = cv2.resize(crop, (search_width, search_height))
    return cal_rgb_confidence(resized_crop, im_search) if rgb else cal_ccoeff_confidence(resized_crop, im_search)


def _target_rectangle(
    left_top_pos: tuple[int, int], width: int, height: int
) -> tuple[tuple[int, int], tuple[tuple[int, int], tuple[int, int], tuple[int, int], tuple[int, int]]]:
    x_min, y_min = left_top_pos
    middle_point = (int(x_min + width / 2), int(y_min + height / 2))
    rectangle = (
        left_top_pos,
        (x_min, y_min + height),
        (x_min + width, y_min + height),
        (x_min + width, y_min),
    )
    return middle_point, rectangle


def find_multiscale_template(
    im_source: np.ndarray,
    im_search: np.ndarray,
    threshold: float = 0.8,
    rgb: bool = True,
    scale_max: int = 800,
    scale_step: float = 0.01,
    ratio_min: float = 0.01,
    ratio_max: float = 0.99,
    time_out: float = 3.0,
) -> dict[str, object] | None:
    check_source_larger_than_search(im_source, im_search)
    source_gray = img_mat_rgb_to_gray(im_source)
    search_gray = img_mat_rgb_to_gray(im_search)

    best_value = 0.0
    best_info: tuple[tuple[int, int], int, int, float] | None = None
    ratio = ratio_min
    started_at = time.time()

    while ratio <= ratio_max:
        scaled_source, scaled_search, source_ratio = _resize_by_ratio(
            source_gray.copy(), search_gray.copy(), ratio, scale_max
        )
        if min(scaled_search.shape[:2]) > 10:
            scaled_source[0, 0] = scaled_search[0, 0] = 0
            scaled_source[0, 1] = scaled_search[0, 1] = 255
            result = cv2.matchTemplate(scaled_source, scaled_search, cv2.TM_CCOEFF_NORMED)
            _, max_value, _, max_loc = cv2.minMaxLoc(result)
            height, width = scaled_search.shape[:2]
            if max_value > best_value:
                best_value = float(max_value)
                best_info = (max_loc, width, height, source_ratio)
            if time.time() - started_at > time_out and max_value >= threshold:
                restored_loc, restored_width, restored_height = _restore_original_size(
                    max_loc, width, height, source_ratio
                )
                confidence = _confidence_from_crop(
                    im_source, im_search, restored_loc, restored_width, restored_height, rgb
                )
                if confidence >= threshold:
                    middle_point, rectangle = _target_rectangle(
                        restored_loc, restored_width, restored_height
                    )
                    return generate_result(middle_point, rectangle, confidence)
        ratio += scale_step

    if not best_info:
        return None

    max_loc, width, height, source_ratio = best_info
    restored_loc, restored_width, restored_height = _restore_original_size(
        max_loc, width, height, source_ratio
    )
    confidence = _confidence_from_crop(
        im_source, im_search, restored_loc, restored_width, restored_height, rgb
    )
    if confidence < threshold:
        return None
    middle_point, rectangle = _target_rectangle(restored_loc, restored_width, restored_height)
    return generate_result(middle_point, rectangle, confidence)
