import os
from typing import Optional, Dict
from api.ai.schemas import AIProviderConfig, ProviderHealthResponse
from api.ai.providers.base import BaseLLMProvider
from api.ai.providers.freeflow import FreeFlowProvider
from api.ai.providers.ollama import OllamaProvider
from api.ai.providers.gemini import GeminiProvider
from api.ai.providers.openrouter import OpenRouterProvider
from api.ai.providers.huggingface import HuggingFaceProvider
from api.ai.providers.mock import MockAIProvider

def get_provider(config: Optional[AIProviderConfig] = None) -> BaseLLMProvider:
    """
    Constructs and returns the configured LLM provider instance.
    Reads provider type from argument, environment variable LLM_PROVIDER or AI_PROVIDER,
    defaulting gracefully to local FreeFlow / Ollama / Mock.
    """
    prov_name = (
        (config.provider if config else None) or
        os.getenv("LLM_PROVIDER") or
        os.getenv("AI_PROVIDER") or
        "freeflow"
    ).lower()

    timeout = config.timeout_seconds if config else 30.0
    model = config.model if config else os.getenv("LLM_MODEL")

    if prov_name in ("freeflow", "local"):
        base_url = (config.base_url if config and config.base_url else None) or os.getenv("FREEFLOW_API_URL", "http://127.0.0.1:8000/v1")
        return FreeFlowProvider(
            base_url=base_url,
            api_key=config.api_key if config else os.getenv("OPENAI_API_KEY"),
            model=model,
            timeout_seconds=timeout
        )

    elif prov_name == "ollama":
        base_url = (config.base_url if config and config.base_url else None) or os.getenv("OLLAMA_API_URL", "http://127.0.0.1:11434")
        return OllamaProvider(
            base_url=base_url,
            model=model,
            timeout_seconds=timeout
        )

    elif prov_name == "gemini":
        api_key = (config.api_key if config and config.api_key else None) or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        return GeminiProvider(
            api_key=api_key,
            model=model or "gemini-1.5-flash",
            timeout_seconds=timeout
        )

    elif prov_name in ("openai_compatible", "openai"):
        base_url = (config.base_url if config and config.base_url else None) or os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
        api_key = (config.api_key if config and config.api_key else None) or os.getenv("OPENAI_API_KEY")
        return FreeFlowProvider(
            base_url=base_url,
            api_key=api_key,
            model=model or "gpt-4o-mini",
            timeout_seconds=timeout
        )

    elif prov_name == "openrouter":
        return OpenRouterProvider(
            api_key=config.api_key if config else None,
            backup_api_key=config.api_key_backup if config else None,
            model=model,
            base_url=config.base_url if config else None,
            timeout_seconds=timeout
        )

    elif prov_name in ("huggingface", "hf"):
        return HuggingFaceProvider(
            api_key=config.api_key if config else None,
            backup_api_key=config.api_key_backup if config else None,
            model=model,
            base_url=config.base_url if config else None,
            timeout_seconds=timeout
        )

    elif prov_name == "mock":
        from api.config import settings
        if settings.ENVIRONMENT == "production":
            from api.ai.providers.base import ProviderUnavailableError
            raise ProviderUnavailableError("Mock AI provider is strictly prohibited in production environments.")
        return MockAIProvider(timeout_seconds=timeout)

    # Invariant: Never silently substitute a mock provider for unrecognized configurations
    from api.ai.providers.base import ProviderUnavailableError
    raise ProviderUnavailableError(f"Requested AI provider '{prov_name}' is not supported or recognized.")


def check_all_providers() -> Dict[str, ProviderHealthResponse]:
    """Inspects connectivity across all configured provider endpoints."""
    results = {}
    
    # 1. FreeFlow
    ff = FreeFlowProvider()
    results["freeflow"] = ff.health()

    # 2. Ollama
    ol = OllamaProvider()
    results["ollama"] = ol.health()

    # 3. Gemini
    gem = GeminiProvider()
    results["gemini"] = gem.health()

    # 4. Mock (truthfully marked as test_only / disabled in production)
    from api.config import settings
    if settings.ENVIRONMENT == "production":
        results["mock"] = ProviderHealthResponse(
            provider="mock",
            status="offline",
            message="Mock AI provider is strictly disabled in production.",
            models=[]
        )
    else:
        results["mock"] = ProviderHealthResponse(
            provider="mock",
            status="online",
            message="Mock AI provider available exclusively for isolated test fixtures.",
            models=["mock-grounded-v1"]
        )

    # 5. OpenRouter
    openrouter = OpenRouterProvider()
    results["openrouter"] = openrouter.health()

    # 6. HuggingFace
    hf = HuggingFaceProvider()
    results["huggingface"] = hf.health()

    return results
