import time
from typing import Optional, List, Dict, Any, Type, TypeVar
import httpx
from pydantic import BaseModel
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

class FreeFlowProvider(BaseLLMProvider):
    """
    Adapter for local FreeFlow AI inference gateway (http://127.0.0.1:8000)
    or any OpenAI-compatible inference endpoint.
    Uses httpx for resilient, non-blocking HTTP communication.
    """

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:8000/v1",
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout_seconds: float = 30.0
    ):
        super().__init__(name="freeflow", timeout_seconds=timeout_seconds)
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key or "freeflow-local"
        self.model = model

    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "RESII-AI-Engine/1.0"
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def health(self) -> ProviderHealthResponse:
        start = time.time()
        try:
            with httpx.Client(timeout=3.0) as client:
                res = client.get(f"{self.base_url}/models", headers=self._get_headers())
                latency = round((time.time() - start) * 1000, 2)
                if res.status_code == 200:
                    data = res.json()
                    models = [m.get("id") for m in data.get("data", []) if "id" in m]
                    return ProviderHealthResponse(
                        provider="freeflow",
                        status="online",
                        latency_ms=latency,
                        message="Connected to FreeFlow AI gateway.",
                        models=models
                    )
                else:
                    return ProviderHealthResponse(
                        provider="freeflow",
                        status="degraded",
                        latency_ms=latency,
                        message=f"Gateway returned status {res.status_code}",
                        models=[]
                    )
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            return ProviderHealthResponse(
                provider="freeflow",
                status="offline",
                message=f"FreeFlow gateway unavailable at {self.base_url}: {e}",
                models=[]
            )
        except Exception as e:
            return ProviderHealthResponse(
                provider="freeflow",
                status="offline",
                message=str(e),
                models=[]
            )

    def list_models(self) -> List[str]:
        health = self.health()
        return health.models

    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        response_model: Optional[Type[T]] = None,
        max_tokens: int = 2048,
        temperature: float = 0.2
    ) -> Any:
        # Determine model
        target_model = self.model
        if not target_model:
            available = self.list_models()
            if available:
                target_model = available[0]
            else:
                target_model = "default"

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
        if response_model is not None:
            payload["response_format"] = {"type": "json_object"}

        # Retry logic: up to 2 attempts on transient network errors
        attempts = 2
        last_err = None

        for attempt in range(attempts):
            try:
                with httpx.Client(timeout=self.timeout_seconds) as client:
                    res = client.post(
                        f"{self.base_url}/chat/completions",
                        headers=self._get_headers(),
                        json=payload
                    )
                    if res.status_code == 404:
                        raise ModelNotFoundError(f"Model '{target_model}' not found at {self.base_url} (404): {res.text[:200]}")
                    elif res.status_code in (401, 403):
                        raise ProviderAuthenticationError(f"Unauthorized at {self.base_url} ({res.status_code}): {res.text[:200]}")
                    elif res.status_code != 200:
                        raise InvalidResponseError(f"FreeFlow AI error ({res.status_code}): {res.text[:300]}")
                    
                    data = res.json()
                    choices = data.get("choices", [])
                    if not choices:
                        raise InvalidResponseError("No completion choices returned by model.")
                    
                    raw_content = choices[0].get("message", {}).get("content", "")
                    
                    if response_model is not None:
                        parsed_json = extract_json_from_text(raw_content)
                        return response_model.model_validate(parsed_json)
                    return raw_content

            except (httpx.ConnectError, httpx.NetworkError) as e:
                last_err = ProviderUnavailableError(f"Cannot connect to FreeFlow gateway at {self.base_url}: {e}")
                last_err.__cause__ = e
                time.sleep(0.5)
            except httpx.TimeoutException as e:
                raise ProviderTimeoutError(f"Inference request timed out after {self.timeout_seconds}s: {e}") from e
            except Exception as e:
                if isinstance(e, ProviderError):
                    raise
                raise InvalidResponseError(f"Inference execution failed: {e}") from e

        if last_err:
            raise last_err
