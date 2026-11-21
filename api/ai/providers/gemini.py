import os
import time
from typing import Optional, List, Dict, Any, Type, TypeVar
from pydantic import BaseModel
from api.ai.providers.base import (
    BaseLLMProvider,
    ProviderUnavailableError,
    ProviderTimeoutError,
    InvalidResponseError,
    extract_json_from_text,
)
from api.ai.schemas import ProviderHealthResponse

T = TypeVar("T", bound=BaseModel)

class GeminiProvider(BaseLLMProvider):
    """
    Adapter for Google Gemini API via official google-generativeai SDK.
    Supports gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash with JSON mode.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "gemini-1.5-flash",
        timeout_seconds: float = 30.0
    ):
        super().__init__(name="gemini", timeout_seconds=timeout_seconds)
        self.api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self.model = model
        self._genai = None

    def _init_sdk(self):
        if self._genai is None:
            try:
                import google.generativeai as genai
                if self.api_key:
                    genai.configure(api_key=self.api_key)
                self._genai = genai
            except ImportError:
                raise ProviderUnavailableError("google-generativeai package is not available.")

    def health(self) -> ProviderHealthResponse:
        if not self.api_key:
            return ProviderHealthResponse(
                provider="gemini",
                status="not_configured",
                message="GEMINI_API_KEY is not set.",
                models=[]
            )

        start = time.time()
        try:
            self._init_sdk()
            models = self.list_models()
            latency = round((time.time() - start) * 1000, 2)
            return ProviderHealthResponse(
                provider="gemini",
                status="online",
                latency_ms=latency,
                message=f"Connected to Gemini API ({len(models)} models discovered).",
                models=models
            )
        except Exception as e:
            return ProviderHealthResponse(
                provider="gemini",
                status="offline",
                message=f"Gemini API connection error: {e}",
                models=[]
            )

    def list_models(self) -> List[str]:
        if not self.api_key:
            return []
        try:
            self._init_sdk()
            result = []
            for m in self._genai.list_models():
                if "generateContent" in getattr(m, "supported_generation_methods", []):
                    result.append(m.name.replace("models/", ""))
            return result or ["gemini-1.5-flash", "gemini-1.5-pro"]
        except Exception:
            return ["gemini-1.5-flash", "gemini-1.5-pro"]

    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        response_model: Optional[Type[T]] = None,
        max_tokens: int = 2048,
        temperature: float = 0.2
    ) -> Any:
        if not self.api_key:
            raise ProviderUnavailableError("GEMINI_API_KEY is not configured.")

        self._init_sdk()
        try:
            gen_config = {
                "temperature": temperature,
                "max_output_tokens": max_tokens
            }
            if response_model is not None:
                gen_config["response_mime_type"] = "application/json"

            model_inst = self._genai.GenerativeModel(
                model_name=self.model,
                system_instruction=system_prompt if system_prompt else None,
                generation_config=gen_config
            )
            
            res = model_inst.generate_content(prompt)
            raw_text = res.text or ""
            
            if response_model is not None:
                parsed_json = extract_json_from_text(raw_text)
                return response_model.model_validate(parsed_json)
            return raw_text

        except Exception as e:
            raise InvalidResponseError(f"Gemini generation failed: {e}")
