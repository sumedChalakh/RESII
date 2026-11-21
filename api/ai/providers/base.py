import json
import re
from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any, Type, TypeVar
from pydantic import BaseModel
from api.ai.schemas import ProviderHealthResponse

T = TypeVar("T", bound=BaseModel)

class ProviderError(Exception):
    """Base exception for all AI provider failures."""
    pass

class ProviderUnavailableError(ProviderError):
    """Raised when the provider endpoint cannot be reached or actively refuses connection."""
    pass

class ProviderTimeoutError(ProviderError):
    """Raised when an inference call exceeds the configured timeout threshold."""
    pass

class InvalidResponseError(ProviderError):
    """Raised when the model response fails schema validation or produces unparseable output."""
    pass

class ModelNotFoundError(ProviderError):
    """Raised when the requested model is not available on the provider."""
    pass

class ProviderAuthenticationError(ProviderError):
    """Raised when provider credentials (API key) are invalid or unauthorized (HTTP 401/403)."""
    pass


def extract_json_from_text(raw_text: str) -> Dict[str, Any]:
    """
    Safely cleans markdown code fences, comments, and extracts JSON from LLM output.
    Recovers from common model output quirks.
    """
    cleaned = raw_text.strip()
    
    # 1. Strip markdown fences like ```json ... ``` or ``` ... ```
    fence_pattern = r"^```(?:json)?\s*\n?(.*?)\n?```$"
    match = re.search(fence_pattern, cleaned, re.DOTALL | re.IGNORECASE)
    if match:
        cleaned = match.group(1).strip()
    
    # 2. Extract first {...} or [...] block if preamble exists
    if not (cleaned.startswith("{") or cleaned.startswith("[")):
        bracket_match = re.search(r"(\{.*\}|\[.*\])", cleaned, re.DOTALL)
        if bracket_match:
            cleaned = bracket_match.group(1).strip()
            
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as err:
        # Simple recovery for trailing commas: ,} -> } and ,] -> ]
        fixed = re.sub(r",\s*([\}\]])", r"\1", cleaned)
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            raise InvalidResponseError(f"Model output is not valid JSON: {err}. Raw output: {raw_text[:300]}")


class BaseLLMProvider(ABC):
    """
    Abstract interface for all AI inference providers in RESII.
    Guarantees consistent timeout handling, retries, and structured response parsing.
    """
    def __init__(self, name: str, timeout_seconds: float = 30.0):
        self.name = name
        self.timeout_seconds = timeout_seconds

    @abstractmethod
    def health(self) -> ProviderHealthResponse:
        """Probe provider connection and report status, latency, and available models."""
        pass

    @abstractmethod
    def list_models(self) -> List[str]:
        """Return list of models available on this provider."""
        pass

    @abstractmethod
    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        response_model: Optional[Type[T]] = None,
        max_tokens: int = 2048,
        temperature: float = 0.2
    ) -> Any:
        """
        Execute completion with strict response schema enforcement.
        If response_model is supplied, parses and validates into that Pydantic model.
        """
        pass
