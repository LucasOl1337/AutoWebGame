"""Template matching adapted from Airtest's aircv.template module."""

from __future__ import annotations

import cv2

from .confidence import cal_ccoeff_confidence, cal_rgb_confidence, img_mat_rgb_to_gray
from .errors import TemplateInputError
from .logging_utils import get_logger

LOGGER = get_logger(__name__)


def generate_result(
    middle_point: tuple[int, int],
    rectangle: tuple[tuple[int, int], tuple[int, int], tuple[int, int], tuple[int, int]],
    confidence: float,
) -> dict[str, object]:
    return {
        "result": middle_point,
        "rectangle": rectangle,
        "confidence": float(confidence),
    }


def check_source_larger_than_search(im_source: np.ndarray, im_search: np.ndarray) -> None:
    h_search, w_search = im_search.shape[:2]
    h_source, w_source = im_source.shape[:2]
    if h_search > h_source or w_search > w_source:
        raise TemplateInputError("in template match, im_search is bigger than im_source")


def _get_confidence_from_matrix(
    im_source: np.ndarray,
    im_search: np.ndarray,
    max_loc: tuple[int, int],
    max_val: float,
    width: int,
    height: int,
    rgb: bool,
) -> float:
    if rgb:
        crop = im_source[max_loc[1] : max_loc[1] + height, max_loc[0] : max_loc[0] + width]
        return cal_rgb_confidence(crop, im_search)
    return float(max_val)


def _get_template_result_matrix(im_source: np.ndarray, im_search: np.ndarray) -> np.ndarray:
    search_gray = img_mat_rgb_to_gray(im_search)
    source_gray = img_mat_rgb_to_gray(im_source)
    return cv2.matchTemplate(source_gray, search_gray, cv2.TM_CCOEFF_NORMED)


def _get_target_rectangle(
    left_top_pos: tuple[int, int], width: int, height: int
) -> tuple[tuple[int, int], tuple[tuple[int, int], tuple[int, int], tuple[int, int], tuple[int, int]]]:
    x_min, y_min = left_top_pos
    x_middle, y_middle = int(x_min + width / 2), int(y_min + height / 2)
    rectangle = (
        left_top_pos,
        (x_min, y_min + height),
        (x_min + width, y_min + height),
        (x_min + width, y_min),
    )
    return (x_middle, y_middle), rectangle


def full_frame_result(image: np.ndarray, confidence: float) -> dict[str, object]:
    height, width = image.shape[:2]
    rectangle = ((0, 0), (0, height), (width, height), (width, 0))
    return generate_result((width // 2, height // 2), rectangle, confidence)


def find_template(
    im_source: np.ndarray, im_search: np.ndarray, threshold: float = 0.8, rgb: bool = False
) -> dict[str, object] | None:
    check_source_larger_than_search(im_source, im_search)
    result_matrix = _get_template_result_matrix(im_source, im_search)
    _, max_value, _, max_loc = cv2.minMaxLoc(result_matrix)
    height, width = im_search.shape[:2]
    confidence = _get_confidence_from_matrix(
        im_source, im_search, max_loc, max_value, width, height, rgb
    )
    middle_point, rectangle = _get_target_rectangle(max_loc, width, height)
    best_match = generate_result(middle_point, rectangle, confidence)
    LOGGER.debug("threshold=%s result=%s", threshold, best_match)
    return best_match if confidence >= threshold else None


def find_all_template(
    im_source: np.ndarray,
    im_search: np.ndarray,
    threshold: float = 0.8,
    rgb: bool = False,
    max_count: int = 10,
) -> list[dict[str, object]] | None:
    check_source_larger_than_search(im_source, im_search)
    result_matrix = _get_template_result_matrix(im_source, im_search)
    results: list[dict[str, object]] = []
    height, width = im_search.shape[:2]

    while True:
        _, max_value, _, max_loc = cv2.minMaxLoc(result_matrix)
        confidence = _get_confidence_from_matrix(
            im_source, im_search, max_loc, max_value, width, height, rgb
        )
        if confidence < threshold or len(results) >= max_count:
            break

        middle_point, rectangle = _get_target_rectangle(max_loc, width, height)
        results.append(generate_result(middle_point, rectangle, confidence))
        cv2.rectangle(
            result_matrix,
            (int(max_loc[0] - width / 2), int(max_loc[1] - height / 2)),
            (int(max_loc[0] + width / 2), int(max_loc[1] + height / 2)),
            (0, 0, 0),
            -1,
        )

    return results or None


def compare_similarity(
    im_source: np.ndarray,
    im_search: np.ndarray,
    rgb: bool = False,
    resize_mode: str = "search",
) -> tuple[float, bool]:
    source = im_source
    search = im_search
    resized = False

    if source.shape[:2] != search.shape[:2]:
        resized = True
        if resize_mode == "none":
            raise TemplateInputError("compare requires equal image sizes when resize_mode=none")
        if resize_mode == "search":
            search = cv2.resize(search, (source.shape[1], source.shape[0]))
        elif resize_mode == "source":
            source = cv2.resize(source, (search.shape[1], search.shape[0]))
        else:
            raise TemplateInputError(f"unknown resize_mode: {resize_mode}")

    confidence = cal_rgb_confidence(source, search) if rgb else cal_ccoeff_confidence(source, search)
    return float(confidence), resized
