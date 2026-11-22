# RESII — PHASE 2: AI ARCHITECTURE AUDIT & READINESS REPORT

**Document ID:** `docs/PHASE_2_AI_ARCHITECTURE_AUDIT.md`  
**Date:** 2026-11-21  
**Project:** `E:\SUMED_DATA\Rezifi`  
**Repository:** `https://github.com/sumedChalakh/RESII`  
**Phase:** Phase 2 — Real AI Inference & Intelligent Resume Optimization  
**Mode:** Stage 0 Read-Only Architecture Audit  
**Author:** Principal Software Architect & AI Systems Reviewer  

---

## 1. EXECUTIVE SUMMARY

This audit provides a comprehensive, evidence-driven inspection of RESII's current AI architecture, provider interfaces, fallback mechanisms, ATS scoring, document pipelines, and frontend integrations.

The audit identifies that while RESII possesses robust data grounding safeguards (Candidate Evidence Ledger, Fact Checker, OCC versioning, and transparency badges), **its active inference relies predominantly on deterministic heuristics and mock adapters**. Crucially, genuine LLM inference through OpenRouter and Hugging Face has not yet been integrated into the runtime routing layer, and several "AI" endpoints (notably the tailoring suggestion generator) currently simulate LLM output by executing heuristic rules.

This document establishes the exact current baseline, itemizes missing components, identifies provider compatibility and security risks, and defines a disciplined, stage-by-stage implementation plan for Phase 2.

---

## 2. CURRENT AI ARCHITECTURE & CODEBASE INVENTORY

### 2.1 Provider Interface Hierarchy (`api/ai/providers/`)
* **`base.py` (`BaseLLMProvider`)**:
  * Abstract base class defining `health() -> ProviderHealthResponse`, `list_models() -> List[str]`, and `generate(...)`.
  * Exception taxonomy: `ProviderError`, `ProviderUnavailableError`, `ProviderTimeoutError`, `InvalidResponseError`, `ModelNotFoundError`, `ProviderAuthenticationError`.
  * Helper: `extract_json_from_text(...)` for stripping markdown code fences (````json ... ````) and recovering from trailing comma syntax quirks.
* **`freeflow.py` (`FreeFlowProvider`)**:
  * `httpx`-based client targeting an OpenAI-compatible gateway (`http://127.0.0.1:8000/v1`).
  * Implements bounded retry with exponential backoff (`max_retries=2`) and HTTP status mapping (401/403, 404, 5xx).
* **`ollama.py` (`OllamaProvider`)**:
  * Client targeting local Ollama instance (`http://127.0.0.1:11434/api`).
* **`gemini.py` (`GeminiProvider`)**:
  * Wrapper around the official `google-generativeai` SDK.
* **`mock.py` (`MockAIProvider`)**:
  * Deterministic offline mock engine providing synthetic grounded responses for `JobDescriptionAnalysis`, `ResumeMatchReport`, `FactVerificationResult`, and `CoverLetterResponse`.
  * Configurable error simulation (`simulate_error="unavailable" | "timeout" | "malformed"`).
* **`factory.py` (`get_provider`)**:
  * Instantiates providers based on `AIProviderConfig` or environment variables (`LLM_PROVIDER`, `AI_PROVIDER`).
  * Current recognized keys: `"freeflow"`, `"local"`, `"ollama"`, `"gemini"`, `"openai_compatible"`, `"openai"`, `"mock"`.
  * **Missing**: No handlers for `"openrouter"` or `"huggingface"`.

### 2.2 Intelligence & Grounding Pipelines (`api/ai/`)
* **`evidence.py` (`CandidateEvidenceLedger`)**:
  * Ingests parsed resume sections, user profile, and `CandidateFactsModel`.
  * Generates normalized `CandidateClaim` items with immutable IDs (`claim_...`), provenance tracking (`resume_source`, `user_confirmed`), and verification flags.
* **`job_analyzer.py` (`analyze_job_description`)**:
  * Uses `p.generate(...)` with `JobDescriptionAnalysis` Pydantic response model.
  * Injects `SYSTEM_PROMPT` containing prompt-injection guardrails.
  * Contains fallback function `extract_job_heuristics(...)` using regex tokenizers for titles, seniority, tech stacks, and work mode.
* **`matcher.py` (`match_resume_to_job`)**:
  * Matches candidate evidence against analyzed job requirements.
  * Enforces citation of genuine Candidate Claim IDs.
  * Contains fallback `evaluate_match_heuristically(...)` with weighted category scoring (`required_skills`: 40%, `technology_alignment`: 25%, `experience_depth`: 15%, `seniority_compatibility`: 10%, `preferred_skills`: 10%).
* **`tailor_engine.py` (`generate_tailoring_plan`)**:
  * **CRITICAL AUDIT FINDING**: `generate_tailoring_plan` does **not** call `p.generate(...)`. It invokes `generate_evidence_tailoring_heuristics(...)` and if a provider name is present, marks `inference_source = "llm"`. This is simulated LLM inference that must be upgraded to real LLM generation.
* **`fact_checker.py` (`verify_candidate_claim`)**:
  * Deterministic verification checking lexical overlap, skill presence, and graduation year contradictions.
* **`cover_letter.py` (`generate_cover_letter`)**:
  * Invokes `p.generate(...)` with `CoverLetterResponse` schema.
  * Contains `generate_grounded_cover_letter_heuristics(...)` fallback.

### 2.3 Legacy & Heuristic Scoring Components
* **`api/layout_engine.py` (`compute_ats_score`)**:
  * Purely deterministic regex scoring function based on action verbs and numeric metrics (`%`, `$`, digits). Base score 70, clamped between 50 and 98.
* **`api/llm_service.py` (`LLMProvider`)**:
  * Legacy heuristic class providing `score_ats_document(...)`, `extract_semantic_skills(...)`, and `generate_bullet_rewrite(...)`. Not integrated with the modern `api/ai/providers` pipeline.

### 2.4 API Surface (`api/tailor.py`)
* `GET /api/v3/tailor/providers/health` — Provider discovery & health checks.
* `GET /api/v3/tailor/providers/config` — Retrieves active user AI settings (credentials masked).
* `POST /api/v3/tailor/providers/config` — Updates AI settings with AES-256-GCM encrypted key storage.
* `POST /api/v3/tailor/providers/test` — Live test completion endpoint.
* `POST /api/v3/tailor/analyze-job` — Structured job description analysis.
* `POST /api/v3/tailor/match` — Evidence-grounded match report.
* `POST /api/v3/tailor/read-words` — Frontend contract endpoint for match rate and keyword coverage.
* `POST /api/v3/tailor/plan` — Generates resume tailoring plan.
* `POST /api/v3/tailor/events` — Records human accept/reject decisions.
* `GET /api/v3/tailor/reviews` — Lists tailoring reviews for candidate.
* `POST /api/v3/tailor/apply` — Clones and applies approved changes into a new resume version.
* `POST /api/v3/tailor/verify-claim` — Validates individual candidate claims.
* `POST /api/v3/tailor/cover-letter` — Generates evidence-grounded cover letters.
* `GET /api/v3/tailor/cover-letters` — Lists historical cover letters.

### 2.5 Frontend Integration
* **`web/src/pages/TailorPage.tsx`**:
  * Complete UI for job description input, match evaluation, bullet-by-bullet review, and cover letter generation.
  * Renders `renderInferenceTransparencyBadge` with color-coded status for `llm` (green), `heuristic` (amber), and `mock` (purple).
* **`web/src/pages/AccountPage.tsx`**:
  * Integration settings panel for configuring AI providers, models, base URLs, and API keys.
  * Currently offers: `mock`, `ollama`, `freeflow`, `gemini`, `openai`. OpenRouter and Hugging Face are not yet in the selector.

---

## 3. FEATURE CLASSIFICATION MATRIX

| Feature / Subsystem | Current Implementation Type | Status / Notes |
| :--- | :--- | :--- |
| **Provider Discovery & Health** | Genuine Network Probing / Mock | FreeFlow, Ollama, Gemini probed; Mock simulated; OpenRouter/HF absent. |
| **Job Description Analysis** | Genuine LLM with Heuristic Fallback | Calls `p.generate(...)`, but defaults to heuristic in local dev because FreeFlow gateway is offline. |
| **Resume-to-Job Matching** | Genuine LLM with Heuristic Fallback | Calls `p.generate(...)`, falls back to deterministic skill matcher. |
| **Read-Words Match Rate** | Hybrid LLM / Heuristic Fallback | Surfaces overall match score and keyword gap analysis. |
| **Resume Tailoring Suggestions** | **Simulated / Deterministic Heuristics** | `tailor_engine.py` only executes `generate_evidence_tailoring_heuristics` and labels output as `llm` if provider is selected. **Must be converted to genuine LLM**. |
| **Cover Letter Generation** | Genuine LLM with Heuristic Fallback | Calls `p.generate(...)` with `CoverLetterResponse`; falls back to template builder. |
| **Fact Verification** | Deterministic Heuristics | Rule-based date contradiction and lexical evidence matcher (`verify_candidate_claim`). |
| **ATS Score on Ingestion** | Deterministic Heuristics | `api/layout_engine.py:compute_ats_score` (regex metric/verb counter). |
| **Legacy LLM Service** | Deterministic Heuristics | `api/llm_service.py` regex tokenizers. |
| **Demo User Resumes** | Hardcoded Demo Output | Alex Rivera seed resumes in `api/db.py` (fixed ATS scores: 92, 94). |
| **Tailored Resume ATS Bump** | Hardcoded Calculation | `min(98, source_resume['ats_score'] + 6)` in `api/tailor.py:apply_tailoring`. |

---

## 4. ENVIRONMENT & CREDENTIAL AUDIT

### 4.1 Existing Credentials Discovered
Inspection of `E:\SUMED_DATA\Rezifi\.env` confirms that required provider credentials already exist locally:

* `OPENROUTER_API_KEY`: Configured (valid `sk-or-v1-...` format, 73 chars).
* `OPENROUTER_API_KEY_BACKUP`: Configured (valid `sk-or-v1-...` format, 73 chars).
* `OPENROUTER_MODEL`: Configured (`deepseek/deepseek-r1:free`).
* `OPENROUTER_BASE_URL`: Configured (`https://openrouter.ai/api/v1`).
* `HUGGINGFACE_API_KEY`: Configured (valid `hf_...` format, 37 chars).
* `HUGGINGFACE_API_KEY_BACKUP`: Configured (valid `hf_...` format, 37 chars).

### 4.2 Configuration Gaps
* `api/config.py`: The `Settings` model does not declare the `OPENROUTER_*` or `HUGGINGFACE_*` fields. As a result, the application cannot load these environment variables through standard settings injection.
* `.env.example`: Does not document the new OpenRouter or Hugging Face environment variables.
* `AIProviderSettingModel`: Database schema supports storing arbitrary provider names and encrypted keys, but needs validation for `"openrouter"` and `"huggingface"`.

---

## 5. MISSING COMPONENTS IDENTIFIED

1. **`OpenRouterProvider` (`api/ai/providers/openrouter.py`)**:
   * OpenAI-compatible HTTP client customized for OpenRouter API requirements (`HTTP-Referer`, `X-Title` headers).
   * Key failover support: automatic rotation from primary `OPENROUTER_API_KEY` to `OPENROUTER_API_KEY_BACKUP` on 401/403 or 429 quota exhaustion.
   * Model health probe: lightweight ping/generation check to verify model availability.
2. **`HuggingFaceProvider` (`api/ai/providers/huggingface.py`)**:
   * Inference provider adapter for Hugging Face Inference API / Serverless router endpoints.
   * Failover to backup key on authentication or rate-limit errors.
3. **Multi-Tier Provider Router (`api/ai/providers/router.py` or updated `factory.py`)**:
   * Transparent waterfall routing: OpenRouter Primary -> OpenRouter Backup -> Hugging Face -> Deterministic Heuristic Fallback.
   * Accurate tracking and attribution of `provider_used`, `model_used`, and `fallback_reason`.
4. **Real LLM Resume Tailoring Engine (`api/ai/tailor_engine.py`)**:
   * Upgrade `generate_tailoring_plan` to formulate structured LLM prompts containing the candidate's evidence ledger, target job description, and line-by-line resume items.
   * Parse model completion into `TailoringPlanResponse` using Pydantic validation.
   * Retain deterministic heuristics as transparent fallback when all providers fail.
5. **Phase 2 ATS Evaluation Schema Alignment**:
   * Add dedicated `Phase2ATSAnalysisResponse` schema conforming to the specification:
     `{ overall_score, skill_match_score, experience_match_score, keyword_match_score, education_match_score, matched_skills, missing_skills, matched_keywords, missing_keywords, strengths, gaps, recommendations, evidence }`.
6. **Frontend Provider Configuration Update**:
   * Add OpenRouter and Hugging Face options to `AccountPage.tsx` provider dropdown.

---

## 6. PROVIDER COMPATIBILITY & SYSTEM RISKS

1. **OpenRouter Free Tier (`deepseek/deepseek-r1:free`) Availability**:
   * **Risk**: Free-tier models on OpenRouter frequently experience queue congestion, temporary rate limiting (HTTP 429), or upstream provider downtime.
   * **Mitigation**:
     * Implement bounded exponential backoff (e.g. 1s, 2s, max 3 retries).
     * Automatically failover to `OPENROUTER_API_KEY_BACKUP` if quota is per-account.
     * If free tier is unavailable, support configurable fallback model (e.g. `deepseek/deepseek-chat` or Hugging Face).
     * If all network inference fails, fall back to the transparent deterministic heuristic engine without breaking user workflows.
2. **DeepSeek-R1 Reasoning Tokens in Output**:
   * **Risk**: DeepSeek-R1 outputs `<think>...</think>` internal reasoning blocks before emitting final content. If not handled, this can corrupt structured JSON parsing.
   * **Mitigation**: Update `extract_json_from_text` to strip `<think>.*?</think>` tags prior to JSON parsing.
3. **Hugging Face Model Compatibility**:
   * **Risk**: Hugging Face free Serverless Inference API supports specific task pipelines (e.g. `text-generation`, `feature-extraction`) and models may be cold/sleeping (503 Service Unavailable with `estimated_time`).
   * **Mitigation**: Provide proper header handling (`x-wait-for-model: true`), handle 503 warm-up delays, and only use HF where endpoints are confirmed active.
4. **Prompt Injection & Document Manipulation**:
   * **Risk**: Job descriptions or uploaded resumes could contain adversarial instructions attempting to override factuality or leak internal prompts.
   * **Mitigation**:
     * Strict delimiter boxing (`<<<JOB_DESCRIPTION_START>>> ... <<<JOB_DESCRIPTION_END>>>`).
     * System prompt instructions explicitly forbidding instructions from untrusted text blocks.
     * Post-generation fact-checking against the Candidate Evidence Ledger.

---

## 7. SECURITY CONSIDERATIONS

1. **Zero Secret Exposure**:
   * API keys must remain strictly server-side in backend environment variables or encrypted SQLite fields (`AIProviderSettingModel.api_key_encrypted`).
   * Never return raw API keys in API responses; mask all keys (e.g. `sk-or-v1-••••••••3ab4`).
   * Ensure `.env` remains in `.gitignore`.
2. **No Secret Logging**:
   * Sanitize all error logs, HTTP exception messages, and test outputs to prevent leaking `Authorization` headers or query parameters.
3. **Candidate Data Isolation**:
   * All tailoring reviews, cover letters, and AI settings must enforce `user_id` ownership checks.
   * Prevent IDOR access to other candidates' evidence ledgers or generated drafts.
4. **Non-Fabrication Invariant**:
   * Every LLM prompt must prohibit inventing unevidenced skills, dates, employers, or metrics.
   * Classify suggestions into `supported_rewrite`, `reorganization`, `keyword_alignment`, and `unsupported_suggestion`.
   * Never automatically mutate candidate primary resumes without human approval.

---

## 8. BASELINE TEST RESULTS

The baseline test suite was executed prior to any Phase 2 implementation:

### 8.1 Backend Pytest Suite
* **Command**: `python -m pytest api/tests/ -q`
* **Collected Tests**: 177 tests across 14 test modules.
* **Results**: **177 passed, 0 failed, 97 deprecation/library warnings** in 170.00s.
* **Coverage**: AI engine mocking, document parsing, MV3 extension APIs, pairing security hardening, database persistence, and RBAC/CSRF security.

### 8.2 Frontend Web Build
* **Command**: `npm --prefix web run build`
* **Results**: **Built in 2.95s**, 1519 modules transformed into `web/dist/`, zero TypeScript or bundle compilation errors.

---

## 9. PROPOSED IMPLEMENTATION PLAN (STAGES 1–8)

Following approval of this audit, Phase 2 will execute across the remaining stages:

* **Stage 1 — Secure Provider Configuration**:
  * Update `api/config.py` to declare `OPENROUTER_*` and `HUGGINGFACE_*` settings.
  * Update `.env.example` with empty placeholders.
  * Update `api/models.py` and `api/ai/schemas.py` to support `"openrouter"` and `"huggingface"`.
* **Stage 2 — Real OpenRouter Inference**:
  * Implement `api/ai/providers/openrouter.py` with OpenRouter API formatting, `<think>` block stripping, timeout handling, exponential backoff, key rotation, and health probes.
  * Verify genuine live inference roundtrip against `deepseek/deepseek-r1:free`.
* **Stage 3 — Real AI ATS Analysis**:
  * Implement structured ATS evaluation conforming to Phase 2 schema (`overall_score`, category breakdown, matched/missing skills, recommendations, evidence).
  * Enforce Pydantic validation and non-fabrication constraints.
* **Stage 4 — Intelligent Resume Tailoring**:
  * Upgrade `api/ai/tailor_engine.py` to invoke genuine LLM inference with candidate evidence grounding.
  * Classify suggestions into `supported_rewrite`, `keyword_alignment`, `reorganization`, and `unsupported_suggestion`.
* **Stage 5 — Real AI Cover Letter Generation**:
  * Connect `api/ai/cover_letter.py` to real OpenRouter inference.
  * Maintain candidate evidence constraints and support customizable tone/length.
* **Stage 6 — Provider Routing & Waterfall Fallback**:
  * Implement resilient fallback: OpenRouter Primary -> OpenRouter Backup -> Hugging Face -> Deterministic Heuristic Fallback.
  * Guarantee transparent attribution (`real_ai`, `mock`, `deterministic_fallback`).
* **Stage 7 — Frontend Integration**:
  * Add OpenRouter and Hugging Face options to `AccountPage.tsx`.
  * Ensure `TailorPage.tsx` displays live model attribution and detailed ATS match breakdown.
* **Stage 8 — Testing, Acceptance & Implementation Report**:
  * Create `api/tests/test_phase2_ai_inference.py` covering all failure modes, live inference, and regression safety.
  * Produce `docs/PHASE_2_AI_IMPLEMENTATION_REPORT.md`.

---

## 10. AUDIT CONCLUSION & READINESS VERIFICATION

RESII's architectural foundation is exceptionally solid. The data structures (`CandidateEvidenceLedger`), persistence models, OCC versioning, and UI transparency indicators are already designed to support genuine AI inference. The transition from deterministic simulation to real LLM intelligence requires adding the dedicated OpenRouter adapter, updating the tailoring engine to execute real completions, and connecting the multi-tier fallback router.

**Stage 0 Read-Only Audit is complete.** Production code remains untouched. Ready for user review and authorization to proceed to Stage 1 and Stage 2.
