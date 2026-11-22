import os
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

class HuggingFaceProvider(BaseLLMProvider):
    """
    Adapter for Hugging Face Inference API.
    Validates API key configuration, manages primary and backup credentials,
    and supports serverless inference endpoints.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        backup_api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout_seconds: float = 30.0
    ):
        super().__init__(name="huggingface", timeout_seconds=timeout_seconds)
        self.api_key = api_key if api_key is not None else (getattr(settings, "HUGGINGFACE_API_KEY", None) or os.getenv("HUGGINGFACE_API_KEY"))
        self.backup_api_key = backup_api_key if backup_api_key is not None else (getattr(settings, "HUGGINGFACE_API_KEY_BACKUP", None) or os.getenv("HUGGINGFACE_API_KEY_BACKUP"))
        self.model = model or getattr(settings, "LLM_MODEL", None) or "meta-llama/Llama-3.2-3B-Instruct"
        raw_url = base_url or "https://api-inference.huggingface.co/models"
        self.base_url = raw_url.rstrip("/")

    def _get_headers(self, key_override: Optional[str] = None) -> Dict[str, str]:
        key = key_override or self.api_key
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "RESII-AI-Engine/1.0"
        }
        if key:
            headers["Authorization"] = f"Bearer {key.strip()}"
        return headers

    def health(self) -> ProviderHealthResponse:
        """
        Probes Hugging Face endpoint connectivity.
        Never marks provider healthy merely because an API key exists.
        """
        if not self.api_key or not self.api_key.strip():
            return ProviderHealthResponse(
                provider="huggingface",
                status="not_configured",
                message="HUGGINGFACE_API_KEY is not configured.",
                models=[]
            )

        start = time.time()
        try:
            with httpx.Client(timeout=5.0) as client:
                res = client.get(
                    f"https://huggingface.co/api/models/{self.model}",
                    headers=self._get_headers()
                )
                latency = round((time.time() - start) * 1000, 2)

                if res.status_code == 200:
                    return ProviderHealthResponse(
                        provider="huggingface",
                        status="online",
                        latency_ms=latency,
                        message=f"Connected to Hugging Face (target model: {self.model}).",
                        models=[self.model]
                    )
                elif res.status_code in (401, 403):
                    return ProviderHealthResponse(
                        provider="huggingface",
                        status="offline",
                        latency_ms=latency,
                        message="Hugging Face authentication failed (invalid or expired token).",
                        models=[]
                    )
                elif res.status_code == 404:
                    return ProviderHealthResponse(
                        provider="huggingface",
                        status="degraded",
                        latency_ms=latency,
                        message=f"Model '{self.model}' not found on Hugging Face.",
                        models=[]
                    )
                else:
                    return ProviderHealthResponse(
                        provider="huggingface",
                        status="degraded",
                        latency_ms=latency,
                        message=f"Hugging Face returned HTTP {res.status_code}.",
                        models=[]
                    )
        except (httpx.ConnectError, httpx.ConnectTimeout):
            return ProviderHealthResponse(
                provider="huggingface",
                status="offline",
                message="Hugging Face endpoint unreachable.",
                models=[]
            )
        except Exception as e:
            return ProviderHealthResponse(
                provider="huggingface",
                status="offline",
                message=f"Hugging Face health check failed: {type(e).__name__}",
                models=[]
            )

    def list_models(self) -> List[str]:
        return [self.model]

    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        response_model: Optional[Type[T]] = None,
        max_tokens: int = 2048,
        temperature: float = 0.2
    ) -> Any:
        if not self.api_key:
            raise ProviderAuthenticationError("HUGGINGFACE_API_KEY is not configured.")

        # Build payload based on endpoint type
        is_chat_endpoint = "/v1" in self.base_url or "chat/completions" in self.base_url

        if is_chat_endpoint:
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})
            payload = {
                "model": self.model,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature
            }
            target_url = f"{self.base_url}/chat/completions" if not self.base_url.endswith("/chat/completions") else self.base_url
        else:
            # Standard Hugging Face Serverless Inference endpoint
            formatted_prompt = f"System: {system_prompt}\n\nUser: {prompt}\n\nAssistant:" if system_prompt else prompt
            payload = {
                "inputs": formatted_prompt,
                "parameters": {
                    "max_new_tokens": max_tokens,
                    "temperature": max(0.01, temperature),
                    "return_full_text": False
                }
            }
            target_url = f"{self.base_url}/{self.model}" if not self.base_url.endswith(self.model) else self.base_url

        keys_to_try = [self.api_key]
        if self.backup_api_key and self.backup_api_key.strip() != self.api_key.strip():
            keys_to_try.append(self.backup_api_key)

        last_error = None
        for key in keys_to_try:
            try:
                with httpx.Client(timeout=self.timeout_seconds) as client:
                    res = client.post(
                        target_url,
                        headers=self._get_headers(key_override=key),
                        json=payload
                    )

                    if res.status_code in (401, 403):
                        last_error = ProviderAuthenticationError(f"Hugging Face authentication failed (HTTP {res.status_code}).")
                        continue
                    elif res.status_code == 404:
                        raise ModelNotFoundError(f"Requested model '{self.model}' not found on Hugging Face.")
                    elif res.status_code in (429, 503):
                        # 503 often means model loading on serverless inference
                        last_error = ProviderUnavailableError(f"Hugging Face service busy/loading (HTTP {res.status_code}).")
                        continue
                    elif res.status_code >= 500:
                        raise ProviderUnavailableError(f"Hugging Face server error (HTTP {res.status_code}).")
                    elif res.status_code != 200:
                        raise ProviderError(f"Hugging Face request failed with status {res.status_code}: {res.text[:200]}")

                    data = res.json()
                    raw_text = ""

                    if isinstance(data, list) and len(data) > 0:
                        raw_text = data[0].get("generated_text", "")
                    elif isinstance(data, dict):
                        if "choices" in data and len(data["choices"]) > 0:
                            raw_text = data["choices"][0].get("message", {}).get("content", "")
                        else:
                            raw_text = data.get("generated_text", "")

                    if not raw_text or not raw_text.strip():
                        raise InvalidResponseError("Hugging Face returned empty content.")

                    clean_text = raw_text.strip()
                    if response_model:
                        parsed_json = extract_json_from_text(clean_text)
                        return response_model.model_validate(parsed_json)

                    return clean_text

            except httpx.TimeoutException:
                raise ProviderTimeoutError(f"Hugging Face completion timed out after {self.timeout_seconds}s.")
            except (httpx.ConnectError, httpx.ConnectTimeout):
                raise ProviderUnavailableError(f"Failed to connect to Hugging Face endpoint.")
            except (ProviderError, ModelNotFoundError, InvalidResponseError):
                raise
            except Exception as e:
                raise ProviderError(f"Unexpected error during Hugging Face completion: {type(e).__name__}")

        if last_error:
            raise last_error
        raise ProviderUnavailableError("All configured Hugging Face credentials failed.")
