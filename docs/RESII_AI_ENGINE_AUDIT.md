# RESII — AI Engine & LLM Architecture Audit

**Target:** `api/llm_service.py`, `api/tailor.py`  
**Scope:** LLM Provider Connectivity, Prompt Engineering, Schema Validation, Retries, Cost Tracking, Hallucination Safeguards, and Local Ollama Integration  
**Status:** Audit Completed  
**Current AI Grade:** **Simulated / Mocked (D)**  

---

## 1. Executive Summary

The RESII specification requires a **provider-agnostic LLM service layer** capable of:
1. ATS document scoring and diagnostic machine-read findings.
2. Per-line tailoring suggestions aligned with target job keywords.
3. Metric-backed bullet rewrites.
4. Seamless switching between hosted models (OpenAI, Anthropic Claude, Google Gemini) and local models (Ollama on port `11434`).

**Audit Finding:**  
While `api/llm_service.py` is present, it contains **zero actual LLM client connections**. The class initializes environment variable strings, but never imports SDKs or issues HTTP requests. All ATS scoring, keyword extraction, and bullet rewrites are generated using deterministic regular expressions and Python string templates. Furthermore, the rewrite template injects fabricated statistics (`"reducing P99 latency by 32%"`), introducing a severe hallucination risk.

---

## 2. Technical Code Analysis & Gaps

### 2.1 Provider Connectivity Audit (`api/llm_service.py`)

- **Lines 11–17:**
  ```python
  def __init__(self, provider: Optional[str] = None):
      self.provider = provider or os.getenv("LLM_PROVIDER", "deterministic_local")
      self.api_key = (
          os.getenv("OPENAI_API_KEY") or
          os.getenv("ANTHROPIC_API_KEY") or
          os.getenv("GEMINI_API_KEY")
      )
  ```
- **The Gap:**
  - Neither `openai`, `anthropic`, `google-generativeai`, nor `ollama` are imported.
  - No HTTP calls (`httpx.post` or `requests.post`) are made to hosted model APIs or Ollama (`http://localhost:11434`).
  - No connection pooling, API key rotation, or client session caching is implemented.

---

### 2.2 Factual Safeguards & Hallucination Risks

- **Location:** `api/llm_service.py:69-73`, `api/tailor.py:101-115`
- **Observed Implementation:**
  ```python
  # api/llm_service.py:73
  def generate_bullet_rewrite(self, original_line: str, target_keyword: Optional[str] = None) -> str:
      clean = original_line.strip().rstrip(".")
      kw = target_keyword or "distributed system"
      return f"Architected high-throughput services incorporating {kw} best practices, reducing P99 latency by 32%."
  ```
- **Critical Risk:**
  - If a user inputs a resume bullet such as *"Assisted customer service tickets"* or *"Designed company marketing banners"*, the current logic returns:
    `"Architected high-throughput services incorporating distributed system best practices, reducing P99 latency by 32%."`
  - In `api/tailor.py:104`, every bullet point is mechanically appended with:
    `f"{orig_text.rstrip('.')} incorporating {highlight_word} best practices to optimize key organizational metrics."`
  - This creates **direct factual fabrication**. If a candidate submits this to an employer, it constitutes resume fraud.
- **Production Requirement:**
  - LLM prompts must include **Strict Factual Guardrails**:
    *"You may rewrite the sentence structure, emphasize relevant skills, and strengthen action verbs, but you MUST NEVER invent unverified numerical metrics, projects, technologies, or job titles not present in the candidate's verified background."*

---

### 2.3 Prompt Engineering & Versioning

- **Current State:**
  - There are **no prompt templates** in `api/llm_service.py` or `api/tailor.py`.
  - No system prompts, user prompts, few-shot examples, or role prompts exist.
- **Production Requirement:**
  - Separate prompt assets into versioned prompt templates:
    - `prompts/ats_scoring/v1.jinja2`
    - `prompts/line_tailoring/v2.jinja2`
    - `prompts/bullet_enhancement/v1.jinja2`
  - Include prompt version metadata in API response headers (`X-Prompt-Version: ats-scoring-v1.2`).

---

### 2.4 Schema Validation & Structured Outputs

- **Current State:**
  - `score_ats_document` returns a raw unvalidated Python dictionary:
    `{"ats_score": final_score, "provider": self.provider, "findings": findings, ...}`.
- **Production Requirement:**
  - Enforce strict Pydantic schemas using model structured output mode (e.g. OpenAI JSON Schema / Instructor / Gemini JSON response format):
    ```python
    class BulletSuggestion(BaseModel):
        line_id: str
        original_text: str
        tailored_text: str
        keyword_incorporated: str
        factual_fidelity_score: float = Field(ge=0.0, le=1.0)
        reasoning: str

    class TailoringPlanResponse(BaseModel):
        target_role: str
        match_rate_before: int
        match_rate_after: int
        suggestions: List[BulletSuggestion]
    ```

---

### 2.5 Retries, Circuit Breakers & Timeout Handling

- **Current State:**
  - Zero retry logic, zero timeout boundaries.
- **Production Requirement:**
  - Wrap all model invocations in Tenacity retry decorators:
    ```python
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.HTTPStatusError))
    )
    async def call_llm(...)
    ```
  - Implement a circuit breaker: if a provider fails 5 times consecutively, automatically fallback to local Ollama on port `11434`.

---

### 2.6 Token Usage, Cost Tracking & Latency Telemetry

- **Current State:**
  - Zero token accounting.
- **Production Requirement:**
  - Record:
    1. `prompt_tokens`
    2. `completion_tokens`
    3. `total_tokens`
    4. Calculated cost in USD based on provider pricing tables
    5. Latency duration in ms (reported in `Server-Timing: llm;dur=450`).
  - Store token logs in PostgreSQL `ai_generation_logs` for billing and quota enforcement.

---

## 3. Local Ollama Integration Architecture (Port 11434)

To support local, private, zero-cost AI execution, RESII must connect directly to the Ollama service running on `http://localhost:11434`.

```
               ┌──────────────────────────────────────┐
               │         RESII API (:8100)            │
               └──────────────────┬───────────────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
       [Cloud Provider Router]          [Local Ollama Router]
                  │                               │
       ┌──────────┴──────────┐                    ▼
       ▼          ▼          ▼            http://localhost:11434
     OpenAI     Gemini     Claude                 │
                                          ┌───────┴───────┐
                                          ▼               ▼
                                    llama3.2:3b     qwen2.5-coder:7b
                                    (Fast Scoring)  (Code/Tech Tailoring)
```

### Ollama Endpoint Specifications:
1. **Health Check:** `GET http://localhost:11434/api/tags` (Verifies Ollama is running and lists installed models).
2. **Chat Completion:** `POST http://localhost:11434/api/chat`
   ```json
   {
     "model": "llama3.2:latest",
     "messages": [
       {"role": "system", "content": "You are RESII's ATS optimization engine..."},
       {"role": "user", "content": "..."}
     ],
     "format": "json",
     "stream": false
   }
   ```
3. **Embeddings:** `POST http://localhost:11434/api/embeddings` (Generates 384d vector embeddings for job matching using `nomic-embed-text` or `all-minilm`).
