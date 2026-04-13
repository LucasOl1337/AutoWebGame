"""
model_manager.py — Multi-provider model calls for BombaPVP auto-improvements.

Supported providers
-------------------
openai_codex   Codex CLI subprocess (OAuth auth, via codex.exe)
claude         Anthropic Claude API (ANTHROPIC_API_KEY env var)
openrouter     OpenRouter HTTP API (OPENROUTER_API_KEY env var)
ollama         Local Ollama (OLLAMA_HOST)
"""

import json
import os
import subprocess
import sys
import tomllib
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


# ---------------------------------------------------------------------------
# Defaults and presets
# ---------------------------------------------------------------------------
DEFAULT_CODEX_HOME = Path.home() / ".codex"
DEFAULT_CODEX_EXE = Path(os.environ.get(
    "CODEX_EXE",
    str(DEFAULT_CODEX_HOME / ".sandbox-bin" / "codex.exe"),
))
DEFAULT_OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
DEFAULT_CLAUDE_BASE = "https://api.anthropic.com"
DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6"
DEFAULT_CLAUDE_VERSION = "2023-06-01"
DEFAULT_OPENROUTER_BASE = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
DEFAULT_TURN_TIMEOUT = float(os.environ.get("MODEL_TURN_TIMEOUT_SEC", "45"))

PROVIDER_PRESETS = [
    ("openai_codex", "OpenAI via Codex auth"),
    ("claude", "Anthropic Claude (direct API)"),
    ("openrouter", "OpenRouter direct API"),
    ("ollama", "Ollama local"),
]

REASONING_PRESETS = [
    ("", "Inherit from config"),
    ("low", "Low"),
    ("medium", "Medium"),
    ("high", "High"),
]

CLAUDE_MODEL_PRESETS = [
    ("claude-sonnet-4-6", "Claude Sonnet 4.6 (fast, smart)"),
    ("claude-opus-4-6", "Claude Opus 4.6 (most capable)"),
    ("claude-haiku-4-5-20251001", "Claude Haiku 4.5 (fastest)"),
]

OPENAI_CODEX_MODEL_PRESETS = [
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.3-codex",
    "gpt-5.2-codex",
    "gpt-5.1-codex-mini",
]


def compact_line(value: str) -> str:
    return " ".join((value or "").strip().split())


# ---------------------------------------------------------------------------
# Codex defaults reader
# ---------------------------------------------------------------------------

def read_codex_defaults(codex_home: str = "") -> dict[str, str]:
    base = Path(codex_home) if codex_home else DEFAULT_CODEX_HOME
    config_path = base / "config.toml"
    if not config_path.exists():
        return {"model": "", "reasoning": ""}
    try:
        payload = tomllib.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, Exception):
        return {"model": "", "reasoning": ""}
    return {
        "model": str(payload.get("model", "") or ""),
        "reasoning": str(payload.get("model_reasoning_effort", "") or ""),
    }


def discover_codex_homes() -> list[tuple[str, str]]:
    home = Path.home()
    homes: list[tuple[str, str]] = [("", "Inherit ~/.codex default")]
    seen: set[str] = set()

    for candidate in [DEFAULT_CODEX_HOME, *sorted(home.glob(".codex*"))]:
        try:
            resolved = str(candidate.resolve())
        except OSError:
            continue
        if resolved in seen or not candidate.is_dir():
            continue
        if not ((candidate / "auth.json").exists() or (candidate / "config.toml").exists() or (candidate / ".sandbox-bin" / "codex.exe").exists()):
            continue
        homes.append((resolved, resolved))
        seen.add(resolved)
    return homes


def discover_ollama_models(host: str = DEFAULT_OLLAMA_HOST) -> list[tuple[str, str]]:
    try:
        with urlopen(f"{host}/api/tags", timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return []
    models = data.get("models", []) if isinstance(data, dict) else []
    return [(m.get("name", ""), m.get("name", "")) for m in models if isinstance(m, dict) and m.get("name")]


def build_openai_codex_model_options(codex_home: str = "") -> list[tuple[str, str]]:
    defaults = read_codex_defaults(codex_home)
    models: list[str] = []
    if defaults["model"]:
        models.append(defaults["model"])
    for model in OPENAI_CODEX_MODEL_PRESETS:
        if model not in models:
            models.append(model)
    return [("", "Inherit from local Codex config")] + [(model, model) for model in models]


# ---------------------------------------------------------------------------
# Model call: OpenAI via Codex CLI subprocess
# ---------------------------------------------------------------------------

TOOLS_DIR = Path(__file__).resolve().parent
_OUTPUT_SCHEMA = TOOLS_DIR / "live_agent_output_schema.json"


def _resolve_codex_exe(codex_home: str = "") -> Path | None:
    """Find codex.exe: explicit home → default home → PATH."""
    if codex_home:
        candidate = Path(codex_home) / ".sandbox-bin" / "codex.exe"
        if candidate.exists():
            return candidate
    if DEFAULT_CODEX_EXE.exists():
        return DEFAULT_CODEX_EXE
    # Fallback: check PATH
    try:
        found = subprocess.check_output(
            ["where", "codex"] if sys.platform == "win32" else ["which", "codex"],
            stderr=subprocess.DEVNULL, text=True,
        ).strip().splitlines()[0]
        p = Path(found)
        if p.exists():
            return p
    except Exception:
        pass
    return None


def _parse_codex_json_stream(stdout: str) -> str | None:
    """Extract the agent_message text from a `codex exec --json` event stream."""
    final_text = ""
    for raw_line in stdout.splitlines():
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        try:
            event = json.loads(raw_line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "item.completed":
            item = event.get("item") or {}
            if item.get("type") == "agent_message" and item.get("text"):
                final_text = str(item["text"])
    return final_text or None


def _run_codex_subprocess(
    cmd: list[str],
    *,
    codex_home: str = "",
    timeout: float = DEFAULT_TURN_TIMEOUT,
) -> tuple[str | None, str | None, str]:
    """
    Run a codex CLI command and return (text, thread_id, status).
    text      — agent_message text extracted from JSON event stream, or None
    thread_id — thread.started id (for session resumption), or None
    status    — "ok" on success, error string on failure
    """
    env = os.environ.copy()
    if codex_home:
        env["CODEX_HOME"] = codex_home
    env["PYTHONUNBUFFERED"] = "1"

    creationflags = 0
    startupinfo = None
    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            env=env,
            creationflags=creationflags,
            startupinfo=startupinfo,
        )
    except subprocess.TimeoutExpired:
        return None, None, "codex_timeout"
    except OSError as exc:
        return None, None, f"codex_os_error:{exc}"

    thread_id: str | None = None
    final_text: str = ""
    failure_reason: str = ""

    for raw_line in result.stdout.splitlines():
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        try:
            event = json.loads(raw_line)
        except json.JSONDecodeError:
            continue

        if event.get("type") == "thread.started":
            thread_id = event.get("thread_id")

        if event.get("type") in ("error", "turn.failed"):
            failure_reason = str(
                (event.get("error") or {}).get("message") or event.get("message") or ""
            ).strip()

        if event.get("type") == "item.completed":
            item = event.get("item") or {}
            if item.get("type") == "agent_message" and item.get("text"):
                final_text = str(item["text"])

    if final_text:
        return final_text, thread_id, "ok"

    if failure_reason:
        return None, thread_id, f"codex_error:{failure_reason}"

    raw = result.stdout.strip()
    if result.returncode == 0 and raw:
        return raw, thread_id, "ok"

    return None, thread_id, f"codex_exit_{result.returncode}"


def _call_codex_new(
    prompt: str,
    system_prompt: str,
    *,
    model: str = "",
    reasoning_effort: str = "",
    codex_home: str = "",
    timeout: float = DEFAULT_TURN_TIMEOUT,
) -> tuple[str | None, str | None, str]:
    """
    Start a new Codex session. Returns (text, session_id, status).
    session_id can be used with _call_codex_resume() for faster follow-up calls.
    """
    exe = _resolve_codex_exe(codex_home)
    if exe is None:
        return None, None, "codex_exe_not_found"

    cmd: list[str] = [str(exe)]
    if reasoning_effort:
        cmd.extend(["-c", f'model_reasoning_effort="{reasoning_effort}"'])

    # No --ephemeral: keep the session alive for resumption
    cmd.extend([
        "exec",
        "--json",
        "--skip-git-repo-check",
        "--sandbox", "read-only",
        "--cd", str(TOOLS_DIR),
    ])

    if model:
        cmd.extend(["--model", model])
    if _OUTPUT_SCHEMA.exists():
        cmd.extend(["--output-schema", str(_OUTPUT_SCHEMA)])

    full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
    cmd.append(full_prompt)

    return _run_codex_subprocess(cmd, codex_home=codex_home, timeout=timeout)


def _call_codex_resume(
    session_id: str,
    prompt: str,
    *,
    model: str = "",
    reasoning_effort: str = "",
    codex_home: str = "",
    timeout: float = DEFAULT_TURN_TIMEOUT,
) -> tuple[str | None, str]:
    """
    Resume an existing Codex session (faster than starting new).
    Returns (text, status).
    """
    exe = _resolve_codex_exe(codex_home)
    if exe is None:
        return None, "codex_exe_not_found"

    cmd: list[str] = [str(exe)]
    if reasoning_effort:
        cmd.extend(["-c", f'model_reasoning_effort="{reasoning_effort}"'])

    cmd.extend([
        "exec", "resume", session_id,
        "--json",
        "--skip-git-repo-check",
    ])
    if model:
        cmd.extend(["--model", model])
    cmd.append(prompt)

    text, _, status = _run_codex_subprocess(cmd, codex_home=codex_home, timeout=timeout)
    return text, status


def _call_codex(
    prompt: str,
    system_prompt: str,
    *,
    model: str = "",
    reasoning_effort: str = "",
    codex_home: str = "",
    timeout: float = DEFAULT_TURN_TIMEOUT,
    session_id: str = "",
) -> tuple[str | None, str]:
    """
    Unified Codex call. If session_id is given, resumes that session (faster).
    Otherwise starts a new session. Returns (text, status).
    """
    if session_id:
        return _call_codex_resume(
            session_id, prompt,
            model=model, reasoning_effort=reasoning_effort,
            codex_home=codex_home, timeout=timeout,
        )
    text, _, status = _call_codex_new(
        prompt, system_prompt,
        model=model, reasoning_effort=reasoning_effort,
        codex_home=codex_home, timeout=timeout,
    )
    return text, status


# ---------------------------------------------------------------------------
# Model call: Anthropic Claude API
# ---------------------------------------------------------------------------

def _call_claude(
    prompt: str,
    system_prompt: str,
    *,
    model: str = DEFAULT_CLAUDE_MODEL,
    max_tokens: int = 1024,
    timeout: float = DEFAULT_TURN_TIMEOUT,
) -> tuple[str | None, str]:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return None, "claude_missing_api_key:ANTHROPIC_API_KEY"

    messages = [{"role": "user", "content": prompt}]
    payload: dict[str, Any] = {
        "model": model or DEFAULT_CLAUDE_MODEL,
        "max_tokens": max_tokens,
        "messages": messages,
    }
    if system_prompt:
        payload["system"] = system_prompt

    raw = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    headers = {
        "x-api-key": api_key,
        "anthropic-version": DEFAULT_CLAUDE_VERSION,
        "content-type": "application/json",
    }
    request = Request(f"{DEFAULT_CLAUDE_BASE}/v1/messages", data=raw, headers=headers, method="POST")
    try:
        with urlopen(request, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return None, f"claude_http_{exc.code}:{body[:120]}"
    except (URLError, TimeoutError, OSError) as exc:
        return None, f"claude_network:{exc}"

    content = data.get("content", [])
    if not isinstance(content, list) or not content:
        return None, "claude_empty_content"
    text_parts = [block.get("text", "") for block in content if isinstance(block, dict) and block.get("type") == "text"]
    result = "".join(text_parts).strip()
    return (result or None), ("ok" if result else "claude_empty_text")


# ---------------------------------------------------------------------------
# Model call: OpenRouter
# ---------------------------------------------------------------------------

def _call_openrouter(
    prompt: str,
    system_prompt: str,
    *,
    model: str,
    api_key_env: str = "OPENROUTER_API_KEY",
    base_url: str = DEFAULT_OPENROUTER_BASE,
    app_name: str = "BombaPVP AutoImprovements",
    max_tokens: int = 1024,
    timeout: float = DEFAULT_TURN_TIMEOUT,
) -> tuple[str | None, str]:
    api_key = os.environ.get(api_key_env, "").strip()
    if not api_key:
        return None, f"openrouter_missing_key:{api_key_env}"
    if not model:
        return None, "openrouter_missing_model"

    messages: list[dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload = {"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0.2}
    raw = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "X-OpenRouter-Title": app_name,
    }
    request = Request(f"{base_url}/chat/completions", data=raw, headers=headers, method="POST")
    try:
        with urlopen(request, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return None, f"openrouter_http_{exc.code}:{body[:120]}"
    except (URLError, TimeoutError, OSError) as exc:
        return None, f"openrouter_network:{exc}"

    choices = data.get("choices", [])
    if not choices:
        return None, "openrouter_no_choices"
    msg = choices[0].get("message", {})
    content = msg.get("content", "")
    if isinstance(content, list):
        content = " ".join(str(c.get("text", "")) for c in content if isinstance(c, dict))
    result = str(content).strip()
    return (result or None), ("ok" if result else "openrouter_empty")


# ---------------------------------------------------------------------------
# Model call: Ollama
# ---------------------------------------------------------------------------

def _call_ollama(
    prompt: str,
    system_prompt: str,
    *,
    model: str,
    host: str = DEFAULT_OLLAMA_HOST,
    timeout: float = DEFAULT_TURN_TIMEOUT,
) -> tuple[str | None, str]:
    if not model:
        return None, "ollama_missing_model"

    payload = {"model": model, "prompt": prompt, "stream": False}
    if system_prompt:
        payload["system"] = system_prompt

    raw = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    request = Request(f"{host}/api/generate", data=raw, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        return None, f"ollama_http_{exc.code}"
    except (URLError, TimeoutError, OSError) as exc:
        return None, f"ollama_network:{exc}"

    result = str(data.get("response", "")).strip()
    return (result or None), ("ok" if result else "ollama_empty")


# ---------------------------------------------------------------------------
# Unified call_model interface
# ---------------------------------------------------------------------------

def call_model(
    prompt: str,
    system_prompt: str = "",
    *,
    provider: str = "claude",
    model: str = "",
    reasoning_effort: str = "",
    codex_home: str = "",
    ollama_host: str = DEFAULT_OLLAMA_HOST,
    openrouter_api_key_env: str = "OPENROUTER_API_KEY",
    openrouter_base_url: str = DEFAULT_OPENROUTER_BASE,
    max_tokens: int = 1024,
    timeout: float = DEFAULT_TURN_TIMEOUT,
) -> tuple[str | None, str]:
    """
    Call a model and return (text_result, status).
    status is "ok" on success, an error string on failure.
    """
    p = compact_line(provider).lower()

    if p == "openai_codex":
        return _call_codex(prompt, system_prompt, model=model, reasoning_effort=reasoning_effort,
                           codex_home=codex_home, timeout=timeout)

    if p == "claude":
        return _call_claude(prompt, system_prompt, model=model or DEFAULT_CLAUDE_MODEL,
                            max_tokens=max_tokens, timeout=timeout)

    if p == "openrouter":
        return _call_openrouter(prompt, system_prompt, model=model,
                                api_key_env=openrouter_api_key_env,
                                base_url=openrouter_base_url,
                                max_tokens=max_tokens, timeout=timeout)

    if p == "ollama":
        return _call_ollama(prompt, system_prompt, model=model, host=ollama_host, timeout=timeout)

    return None, f"unknown_provider:{provider}"


# ---------------------------------------------------------------------------
# Probe (validation)
# ---------------------------------------------------------------------------

def probe_model(
    provider: str,
    model: str = "",
    **kwargs: Any,
) -> dict[str, Any]:
    """Quick probe to validate a model config. Returns a validation dict."""
    text, status = call_model(
        "Reply with exactly: OK",
        "You are a test probe. Reply with exactly: OK",
        provider=provider,
        model=model,
        max_tokens=10,
        timeout=15.0,
        **kwargs,
    )
    is_ok = status == "ok" and text is not None
    return {
        "status": "ready" if is_ok else "error",
        "message": text[:80] if text else status,
        "provider": provider,
        "requestedModel": model,
    }
