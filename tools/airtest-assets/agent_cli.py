from __future__ import annotations

import argparse
import importlib
import json
import sys
from pathlib import Path

TOOL_ROOT = Path(__file__).resolve().parent
REPO_ROOT = TOOL_ROOT.parents[1]
SRC_ROOT = TOOL_ROOT / "src"
DEFAULT_ASSET_ROOT = REPO_ROOT / "public" / "assets"

if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))


def emit(payload: dict[str, object], exit_code: int = 0) -> int:
    print(json.dumps(payload, indent=2, sort_keys=True))
    return exit_code


def resolve_path(value: str | None, default: Path | None = None) -> Path | None:
    if value is None:
        return default
    path = Path(value)
    if not path.is_absolute():
        path = REPO_ROOT / path
    return path.resolve()


def repo_relative(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT)).replace("\\", "/")
    except ValueError:
        return str(path)


def module_available(module_name: str) -> bool:
    try:
        importlib.import_module(module_name)
        return True
    except Exception:
        return False


def load_toolkit():
    from autowebgame_airtest import (
        compare_similarity,
        draw_rectangle,
        find_multiscale_template,
        find_template,
        imread,
        imwrite,
    )

    return {
        "compare_similarity": compare_similarity,
        "draw_rectangle": draw_rectangle,
        "find_multiscale_template": find_multiscale_template,
        "find_template": find_template,
        "imread": imread,
        "imwrite": imwrite,
    }


def doctor_command(_: argparse.Namespace) -> int:
    payload = {
        "ok": True,
        "command": "doctor",
        "python": sys.version.split()[0],
        "repoRoot": str(REPO_ROOT),
        "toolRoot": str(TOOL_ROOT),
        "defaultAssetRoot": str(DEFAULT_ASSET_ROOT),
        "modules": {
            "cv2": module_available("cv2"),
            "numpy": module_available("numpy"),
            "PIL": module_available("PIL"),
        },
    }
    return emit(payload)


def match_command(args: argparse.Namespace) -> int:
    toolkit = load_toolkit()
    source_path = resolve_path(args.source)
    search_path = resolve_path(args.search)
    output_path = resolve_path(args.output) if args.output else None

    source_image = toolkit["imread"](source_path)
    search_image = toolkit["imread"](search_path)

    if args.algorithm == "multiscale":
        hit = toolkit["find_multiscale_template"](
            source_image,
            search_image,
            threshold=args.threshold,
            rgb=args.rgb,
            scale_max=args.scale_max,
            scale_step=args.scale_step,
        )
    else:
        hit = toolkit["find_template"](
            source_image,
            search_image,
            threshold=args.threshold,
            rgb=args.rgb,
        )

    if output_path and hit:
        preview = toolkit["draw_rectangle"](source_image, tuple(tuple(point) for point in hit["rectangle"]))
        toolkit["imwrite"](output_path, preview)

    payload = {
        "ok": True,
        "command": "match",
        "algorithm": args.algorithm,
        "threshold": args.threshold,
        "source": {"path": str(source_path), "repoPath": repo_relative(source_path)},
        "search": {"path": str(search_path), "repoPath": repo_relative(search_path)},
        "output": str(output_path) if output_path else None,
        "matchFound": hit is not None,
        "hit": hit,
    }
    if args.require_hit and hit is None:
        return emit(payload, exit_code=2)
    return emit(payload)


def compare_command(args: argparse.Namespace) -> int:
    toolkit = load_toolkit()
    source_path = resolve_path(args.source)
    search_path = resolve_path(args.search)
    source_image = toolkit["imread"](source_path)
    search_image = toolkit["imread"](search_path)
    confidence, resized = toolkit["compare_similarity"](
        source_image,
        search_image,
        rgb=args.rgb,
        resize_mode=args.resize,
    )
    payload = {
        "ok": True,
        "command": "compare",
        "rgb": args.rgb,
        "source": {"path": str(source_path), "repoPath": repo_relative(source_path)},
        "search": {"path": str(search_path), "repoPath": repo_relative(search_path)},
        "confidence": confidence,
        "resized": resized,
        "resizeMode": args.resize,
    }
    return emit(payload)


def candidate_files(root: Path, patterns: list[str]) -> list[Path]:
    allowed = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
    matches: dict[Path, None] = {}
    for pattern in patterns:
        for path in root.rglob(pattern):
            if path.is_file() and path.suffix.lower() in allowed:
                matches[path.resolve()] = None
    return sorted(matches.keys())


def scan_dir_command(args: argparse.Namespace) -> int:
    toolkit = load_toolkit()
    root_path = resolve_path(args.root, DEFAULT_ASSET_ROOT)
    search_path = resolve_path(args.search)
    search_image = toolkit["imread"](search_path)
    hits: list[dict[str, object]] = []

    for candidate in candidate_files(root_path, args.pattern):
        if candidate == search_path:
            continue
        try:
            candidate_image = toolkit["imread"](candidate)
        except Exception:
            continue

        mode = "compare" if candidate_image.shape[:2] == search_image.shape[:2] else "template"
        hit = None
        try:
            if mode == "compare":
                confidence, resized = toolkit["compare_similarity"](
                    candidate_image,
                    search_image,
                    rgb=args.rgb,
                    resize_mode="search",
                )
                hit = {
                    "result": (candidate_image.shape[1] // 2, candidate_image.shape[0] // 2),
                    "rectangle": (
                        (0, 0),
                        (0, candidate_image.shape[0]),
                        (candidate_image.shape[1], candidate_image.shape[0]),
                        (candidate_image.shape[1], 0),
                    ),
                    "confidence": confidence,
                    "resized": resized,
                }
            elif args.algorithm == "multiscale":
                if candidate_image.shape[0] >= search_image.shape[0] and candidate_image.shape[1] >= search_image.shape[1]:
                    hit = toolkit["find_multiscale_template"](
                        candidate_image,
                        search_image,
                        threshold=args.threshold,
                        rgb=args.rgb,
                        scale_max=args.scale_max,
                        scale_step=args.scale_step,
                    )
            else:
                if candidate_image.shape[0] >= search_image.shape[0] and candidate_image.shape[1] >= search_image.shape[1]:
                    hit = toolkit["find_template"](
                        candidate_image,
                        search_image,
                        threshold=args.threshold,
                        rgb=args.rgb,
                    )
                else:
                    confidence, resized = toolkit["compare_similarity"](
                        candidate_image,
                        search_image,
                        rgb=args.rgb,
                        resize_mode="search",
                    )
                    hit = {
                        "result": (candidate_image.shape[1] // 2, candidate_image.shape[0] // 2),
                        "rectangle": (
                            (0, 0),
                            (0, candidate_image.shape[0]),
                            (candidate_image.shape[1], candidate_image.shape[0]),
                            (candidate_image.shape[1], 0),
                        ),
                        "confidence": confidence,
                        "resized": resized,
                    }
                    mode = "compare"
        except Exception:
            continue

        if not hit:
            continue

        confidence = float(hit["confidence"])
        if confidence < args.threshold:
            continue
        hits.append(
            {
                "path": str(candidate),
                "repoPath": repo_relative(candidate),
                "mode": mode,
                "confidence": confidence,
                "result": hit["result"],
                "rectangle": hit["rectangle"],
            }
        )

    hits.sort(key=lambda item: item["confidence"], reverse=True)
    payload = {
        "ok": True,
        "command": "scan-dir",
        "threshold": args.threshold,
        "root": {"path": str(root_path), "repoPath": repo_relative(root_path)},
        "search": {"path": str(search_path), "repoPath": repo_relative(search_path)},
        "limit": args.limit,
        "count": len(hits[: args.limit]),
        "hits": hits[: args.limit],
    }
    if args.require_hit and not hits:
        return emit(payload, exit_code=2)
    return emit(payload)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Airtest-style asset toolkit for AutoWebGame")
    subparsers = parser.add_subparsers(dest="command", required=True)

    doctor = subparsers.add_parser("doctor", help="Check runtime and dependencies")
    doctor.set_defaults(func=doctor_command)

    match = subparsers.add_parser("match", help="Find one image inside another")
    match.add_argument("--source", required=True, help="Source image that should contain the search image")
    match.add_argument("--search", required=True, help="Search image to locate")
    match.add_argument("--algorithm", choices=["template", "multiscale"], default="template")
    match.add_argument("--threshold", type=float, default=0.8)
    match.add_argument("--rgb", action="store_true")
    match.add_argument("--require-hit", action="store_true")
    match.add_argument("--output", help="Optional annotated preview output path")
    match.add_argument("--scale-max", type=int, default=800)
    match.add_argument("--scale-step", type=float, default=0.01)
    match.set_defaults(func=match_command)

    compare = subparsers.add_parser("compare", help="Compare two images directly")
    compare.add_argument("--source", required=True)
    compare.add_argument("--search", required=True)
    compare.add_argument("--rgb", action="store_true")
    compare.add_argument("--resize", choices=["none", "search", "source"], default="search")
    compare.set_defaults(func=compare_command)

    scan_dir = subparsers.add_parser("scan-dir", help="Scan a directory tree for matching assets")
    scan_dir.add_argument("--search", required=True)
    scan_dir.add_argument("--root", help="Directory to scan. Defaults to public/assets")
    scan_dir.add_argument("--pattern", action="append", default=["*.png", "*.jpg", "*.jpeg", "*.webp"])
    scan_dir.add_argument("--algorithm", choices=["template", "multiscale"], default="template")
    scan_dir.add_argument("--threshold", type=float, default=0.3)
    scan_dir.add_argument("--limit", type=int, default=10)
    scan_dir.add_argument("--rgb", action="store_true")
    scan_dir.add_argument("--require-hit", action="store_true")
    scan_dir.add_argument("--scale-max", type=int, default=800)
    scan_dir.add_argument("--scale-step", type=float, default=0.01)
    scan_dir.set_defaults(func=scan_dir_command)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args)
    except Exception as exc:
        payload = {
            "ok": False,
            "command": getattr(args, "command", None),
            "error": str(exc),
            "errorType": exc.__class__.__name__,
        }
        return emit(payload, exit_code=1)


if __name__ == "__main__":
    raise SystemExit(main())
