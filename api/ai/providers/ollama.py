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

class OllamaProvider(BaseLLMProvider):
    """
    Adapter for direct local Ollama inference (http://127.0.0.1:11434).
    Discovers models via /api/tags and generates structured JSON completions.
    """

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:11434",
        model: Optional[str] = None,
        timeout_seconds: float = 30.0
    ):
        super().__init__(name="ollama", timeout_seconds=timeout_seconds)
        self.base_url = base_url.rstrip("/")
        self.model = model

    def health(self) -> ProviderHealthResponse:
        start = time.time()
        try:
            with httpx.Client(timeout=3.0) as client:
                res = client.get(f"{self.base_url}/api/tags")
                latency = round((time.time() - start) * 1000, 2)
                if res.status_code == 200:
                    data = res.json()
                    models = [m.get("name") for m in data.get("models", []) if "name" in m]
                    return ProviderHealthResponse(
                        provider="ollama",
                        status="online",
                        latency_ms=latency,
                        message=f"Connected to Ollama ({len(models)} models available).",
                        models=models
                    )
                else:
                    return ProviderHealthResponse(
                        provider="ollama",
                        status="degraded",
                        latency_ms=latency,
                        message=f"Ollama returned status {res.status_code}",
                        models=[]
                    )
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            return ProviderHealthResponse(
                provider="ollama",
                status="offline",
                message=f"Ollama unavailable at {self.base_url}: {e}",
                models=[]
            )
        except Exception as e:
            return ProviderHealthResponse(
                provider="ollama",
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
        target_model = self.model
        if not target_model:
            available = self.list_models()
            if available:
                target_model = available[0]
            else:
                target_model = "llama3.2"

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": target_model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens
            }
        }
        if response_model is not None:
            payload["format"] = "json"

        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                res = client.post(f"{self.base_url}/api/chat", json=payload)
                if res.status_code == 404:
                    raise ModelNotFoundError(f"Ollama model '{target_model}' not found on server (404): {res.text[:200]}")
                elif res.status_code in (401, 403):
                    raise ProviderAuthenticationError(f"Ollama authorization failed ({res.status_code}): {res.text[:200]}")
                elif res.status_code != 200:
                    raise InvalidResponseError(f"Ollama error ({res.status_code}): {res.text[:300]}")
                
                data = res.json()
                raw_content = data.get("message", {}).get("content", "")
                
                if response_model is not None:
                    parsed_json = extract_json_from_text(raw_content)
                    return response_model.model_validate(parsed_json)
                return raw_content

        except (httpx.ConnectError, httpx.NetworkError) as e:
            raise ProviderUnavailableError(f"Cannot connect to Ollama at {self.base_url}: {e}") from e
        except httpx.TimeoutException as e:
            raise ProviderTimeoutError(f"Ollama inference timed out after {self.timeout_seconds}s: {e}") from e
        except Exception as e:
            if isinstance(e, ProviderError):
                raise
            raise InvalidResponseError(f"Ollama inference failed: {e}") from e
