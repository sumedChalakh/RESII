import os
import re
import time
from typing import Optional, List, Dict, Any, Type, TypeVar
import httpx
from pydantic import BaseModel
from api.config import settings
from api.ai.providers.base import (
    BaseLLMProvider,
    ProviderError,
    ProviderUnavailableError,
    ProviderTimeoutError,
    InvalidResponseError,
    ModelNotFoundError,
    ProviderAuthenticationError,
    extract_json_from_text,
)
from api.ai.schemas import ProviderHealthResponse

T = TypeVar("T", bound=BaseModel)

class OpenRouterProvider(BaseLLMProvider):
    """
    Adapter for OpenRouter API (https://openrouter.ai/api/v1).
    Validates API key configuration, manages primary and backup credentials,
    and connects to DeepSeek and other OpenRouter-hosted models.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        backup_api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout_seconds: float = 30.0
    ):
        super().__init__(name="openrouter", timeout_seconds=timeout_seconds)
        self.api_key = api_key if api_key is not None else (getattr(settings, "OPENROUTER_API_KEY", None) or os.getenv("OPENROUTER_API_KEY"))
        self.backup_api_key = backup_api_key if backup_api_key is not None else (getattr(settings, "OPENROUTER_API_KEY_BACKUP", None) or os.getenv("OPENROUTER_API_KEY_BACKUP"))
        self.model = model or getattr(settings, "OPENROUTER_MODEL", "deepseek/deepseek-r1:free")
        raw_url = base_url or getattr(settings, "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
        self.base_url = raw_url.rstrip("/")

    def _get_headers(self, key_override: Optional[str] = None) -> Dict[str, str]:
        key = key_override or self.api_key
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "RESII-AI-Engine/1.0",
            "HTTP-Referer": "https://resii.com",
            "X-Title": "RESII Career Platform"
        }
        if key:
            headers["Authorization"] = f"Bearer {key.strip()}"
        return headers

    def health(self) -> ProviderHealthResponse:
        """
        Probes OpenRouter endpoint connectivity and authenticates credentials.
        Never marks provider healthy merely because a key is configured.
        """
        if not self.api_key or not self.api_key.strip():
            return ProviderHealthResponse(
                provider="openrouter",
                status="not_configured",
                message="OPENROUTER_API_KEY is not configured.",
                models=[]
            )

        start = time.time()
        try:
            with httpx.Client(timeout=5.0) as client:
                res = client.get(f"{self.base_url}/models", headers=self._get_headers())
                latency = round((time.time() - start) * 1000, 2)

                if res.status_code == 200:
                    data = res.json()
                    models = [m.get("id") for m in data.get("data", []) if "id" in m]
                    discovered = [m for m in models if "deepseek" in m.lower()][:10] or models[:10]
                    return ProviderHealthResponse(
                        provider="openrouter",
                        status="online",
                        latency_ms=latency,
                        message=f"Connected to OpenRouter ({len(models)} models discovered).",
                        models=discovered
                    )
                elif res.status_code in (401, 403):
                    return ProviderHealthResponse(
                        provider="openrouter",
                        status="offline",
                        latency_ms=latency,
                        message="OpenRouter authentication failed (invalid or expired API key).",
                        models=[]
                    )
                elif res.status_code == 429:
                    return ProviderHealthResponse(
                        provider="openrouter",
                        status="degraded",
                        latency_ms=latency,
                        message="OpenRouter rate limited (HTTP 429).",
                        models=[]
                    )
                else:
                    return ProviderHealthResponse(
                        provider="openrouter",
                        status="degraded",
                        latency_ms=latency,
                        message=f"OpenRouter returned HTTP {res.status_code}.",
                        models=[]
                    )
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            return ProviderHealthResponse(
                provider="openrouter",
                status="offline",
                message=f"OpenRouter endpoint unreachable at {self.base_url}.",
                models=[]
            )
        except Exception as e:
            return ProviderHealthResponse(
                provider="openrouter",
                status="offline",
                message=f"OpenRouter connection check failed: {type(e).__name__}",
                models=[]
            )

    def list_models(self) -> List[str]:
        health = self.health()
        return health.models or [self.model or "deepseek/deepseek-r1:free"]

    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        response_model: Optional[Type[T]] = None,
        max_tokens: int = 2048,
        temperature: float = 0.2
    ) -> Any:
        """
        Executes completion on OpenRouter. Full live verification is scheduled for Stage 2.
        """
        if not self.api_key:
            raise ProviderAuthenticationError("OPENROUTER_API_KEY is not configured.")

        target_model = self.model or "deepseek/deepseek-r1:free"
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": target_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        # Bounded attempt with primary and optional backup key
        keys_to_try = [self.api_key]
        if self.backup_api_key and self.backup_api_key.strip() != self.api_key.strip():
            keys_to_try.append(self.backup_api_key)

        last_error = None
        for key in keys_to_try:
            try:
                with httpx.Client(timeout=self.timeout_seconds) as client:
                    res = client.post(
                        f"{self.base_url}/chat/completions",
                        headers=self._get_headers(key_override=key),
                        json=payload
                    )

                    if res.status_code in (401, 403):
                        last_error = ProviderAuthenticationError(f"OpenRouter authentication failed (HTTP {res.status_code}).")
                        continue  # Try backup key if available
                    elif res.status_code == 404:
                        raise ModelNotFoundError(f"Requested model '{target_model}' not found on OpenRouter.")
                    elif res.status_code == 429:
                        last_error = ProviderUnavailableError(f"OpenRouter rate limit reached (HTTP 429).")
                        continue  # Try backup key
                    elif res.status_code >= 500:
                        raise ProviderUnavailableError(f"OpenRouter server error (HTTP {res.status_code}).")
                    elif res.status_code != 200:
                        raise ProviderError(f"OpenRouter request failed with status {res.status_code}.")

                    data = res.json()
                    choices = data.get("choices", [])
                    if not choices:
                        raise InvalidResponseError("OpenRouter returned empty choices in completion response.")

                    msg = choices[0].get("message", {})
                    raw_content = (msg.get("content") or "").strip()
                    if not raw_content and msg.get("reasoning"):
                        reasoning = msg.get("reasoning", "")
                        matches = re.findall(r'["“]([^"”]{20,})["”]', reasoning)
                        if matches:
                            raw_content = matches[-1].strip()
                        else:
                            clean_lines = [l.strip() for l in reasoning.splitlines() if l.strip() and not l.lower().startswith(("we need", "the user", "think", "1.", "2.", "3.", "analyze", "here's"))]
                            if clean_lines:
                                raw_content = clean_lines[-1]

                    if not raw_content or not raw_content.strip():
                        raise InvalidResponseError("OpenRouter returned empty content in message.")

                    # Strip DeepSeek-R1 <think>...</think> blocks if present
                    sanitized_content = re.sub(r"<think>.*?</think>", "", raw_content, flags=re.DOTALL).strip()

                    if response_model:
                        parsed_json = extract_json_from_text(sanitized_content)
                        return response_model.model_validate(parsed_json)

                    return sanitized_content

            except httpx.TimeoutException:
                raise ProviderTimeoutError(f"OpenRouter completion timed out after {self.timeout_seconds}s.")
            except (httpx.ConnectError, httpx.ConnectTimeout) as e:
                raise ProviderUnavailableError(f"Failed to connect to OpenRouter endpoint.")
            except (ProviderError, ModelNotFoundError, InvalidResponseError):
                raise
            except Exception as e:
                raise ProviderError(f"Unexpected error during OpenRouter completion: {type(e).__name__}")

        if last_error:
            raise last_error
        raise ProviderUnavailableError("All configured OpenRouter credentials failed.")
