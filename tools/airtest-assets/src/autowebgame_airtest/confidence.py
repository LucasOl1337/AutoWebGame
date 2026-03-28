"""Confidence scoring adapted from Airtest's aircv.cal_confidence."""

from __future__ import annotations

import cv2
import numpy as np


def img_mat_rgb_to_gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return image
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def cal_ccoeff_confidence(im_source: np.ndarray, im_search: np.ndarray) -> float:
    source = cv2.copyMakeBorder(im_source, 10, 10, 10, 10, cv2.BORDER_REPLICATE)
    source[0, 0] = 0
    source[0, 1] = 255
    source_gray = img_mat_rgb_to_gray(source)
    search_gray = img_mat_rgb_to_gray(im_search)
    result = cv2.matchTemplate(source_gray, search_gray, cv2.TM_CCOEFF_NORMED)
    _, max_value, _, _ = cv2.minMaxLoc(result)
    return float(max_value)


def cal_rgb_confidence(im_source: np.ndarray, im_search: np.ndarray) -> float:
    source = np.clip(im_source, 10, 245)
    search = np.clip(im_search, 10, 245)
    source_hsv = cv2.cvtColor(source, cv2.COLOR_BGR2HSV)
    search_hsv = cv2.cvtColor(search, cv2.COLOR_BGR2HSV)
    source_hsv = cv2.copyMakeBorder(source_hsv, 10, 10, 10, 10, cv2.BORDER_REPLICATE)
    source_hsv[0, 0] = 0
    source_hsv[0, 1] = 255
    channel_scores = []
    for source_channel, search_channel in zip(cv2.split(source_hsv), cv2.split(search_hsv)):
        result = cv2.matchTemplate(source_channel, search_channel, cv2.TM_CCOEFF_NORMED)
        _, max_value, _, _ = cv2.minMaxLoc(result)
        channel_scores.append(float(max_value))
    return min(channel_scores)
