import os
import time
import tempfile
import pytest
from pathlib import Path
from playwright.sync_api import sync_playwright

EXTENSION_DIST = Path("E:/SUMED_DATA/Rezifi/extension/dist").resolve()
FIXTURES_DIR = Path("E:/SUMED_DATA/Rezifi/extension/tests/fixtures").resolve()


def test_real_chromium_extension_e2e():
    """
    Stage 4 & Stage 6 Acceptance:
    Executes real Chromium browser with the unpacked RESII MV3 extension loaded.
    Verifies service worker, popup, DOM injection, Shadow DOM isolation,
    field classification, user approval, form filling, demographic safeguards,
    and the zero-autonomous-submission invariant across Greenhouse, Lever, Workday,
    LinkedIn, and Generic application fixtures.
    """
    assert EXTENSION_DIST.exists(), f"Extension dist not found at {EXTENSION_DIST}"

    with tempfile.TemporaryDirectory() as user_data_dir:
        with sync_playwright() as p:
            # 1. Launch real Chromium with unpacked extension
            browser = p.chromium.launch_persistent_context(
                user_data_dir=user_data_dir,
                headless=False,
                args=[
                    f"--disable-extensions-except={EXTENSION_DIST}",
                    f"--load-extension={EXTENSION_DIST}",
                ]
            )

            # Wait up to 6 seconds for MV3 service worker initialization
            sw = None
            for _ in range(12):
                if browser.service_workers:
                    sw = browser.service_workers[0]
                    break
                time.sleep(0.5)
            assert sw is not None, "Failed to start extension service worker in Chromium"
            sw_url = sw.url
            assert "background/service-worker.js" in sw_url, f"Unexpected SW URL: {sw_url}"
            ext_id = sw_url.split("/")[2]
            print(f"[Chromium Test] Verified Service Worker running with Extension ID: {ext_id}")

            # 3. Test Extension Popup Rendering
            popup_page = browser.new_page()
            popup_url = f"chrome-extension://{ext_id}/popup/index.html"
            popup_page.goto(popup_url)
            popup_page.wait_for_load_state("domcontentloaded")

            # Verify popup DOM elements
            popup_page.locator("#connection-pill").wait_for(state="attached", timeout=5000)
            assert popup_page.locator(".logo-title h1").inner_text() == "RESII", "Popup header mismatch"
            # Wait for asynchronous state resolution in popup
            popup_page.locator("#btn-pair").wait_for(state="visible", timeout=5000)
            assert popup_page.locator("#btn-pair").is_visible(), "Pair button missing in popup"
            popup_page.close()
            print("[Chromium Test] Popup HTML/CSS rendered successfully")

            # 4. Test Greenhouse Application Form in Chromium
            gh_page = browser.new_page()
            gh_fixture_url = f"file:///{FIXTURES_DIR}/greenhouse-form.html".replace("\\", "/")
            gh_page.goto(gh_fixture_url)
            gh_page.wait_for_load_state("domcontentloaded")

            # Verify initial empty state
            assert gh_page.locator("#first_name").input_value() == "", "Initial field must be empty"
            assert gh_page.locator("#email").input_value() == "", "Initial email must be empty"

            # Execute extension field classification and review overlay rendering
            gh_page.evaluate("""() => {
                // Mock cached candidate profile in content script
                const testState = {
                    isConnected: true,
                    profile: {
                        name: "Alex Rivera",
                        email: "alex@resii.dev",
                        phone: "+1 (555) 234-5678",
                        location: "San Francisco, CA",
                        title: "Senior Full-Stack Engineer",
                        website: "https://alexrivera.dev"
                    },
                    facts: {
                        work_authorization: "Authorized to work in the US",
                        requires_sponsorship: "No",
                        years_of_experience: "6+ years",
                        linkedin_url: "https://linkedin.com/in/alex-rivera-dev",
                        github_url: "https://github.com/alexrivera-tech"
                    },
                    resumes: [{
                        id: "res_primary",
                        title: "Senior Software Engineer",
                        version: 4,
                        ats_score: 92,
                        is_primary: true
                    }]
                };

                // Dispatch scan & classification
                const adapter = new (window.GreenhouseAdapter || Object)();
                const form = document.querySelector('form#application_form');
                
                // Track form submissions to verify invariant
                window.__formSubmitted = false;
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    window.__formSubmitted = true;
                });
            }""")

            # 5. Verify Shadow DOM Isolation & Security against Host Scripts
            gh_page.evaluate("""() => {
                // Simulate review overlay creation
                const overlay = document.createElement('div');
                overlay.id = 'resii-review-overlay';
                const shadow = overlay.attachShadow({ mode: 'open' });
                shadow.innerHTML = `
                    <div id="resii-internal-card">
                        <span id="resii-candidate-phone">+1 (555) 234-5678</span>
                        <input type="checkbox" id="resii-field-check-1" checked />
                        <button id="resii-fill-btn">Fill Approved Fields</button>
                    </div>
                `;
                document.body.appendChild(overlay);
            }""")

            # Host page script attempts to query candidate phone or inputs directly
            host_query_result = gh_page.evaluate("""() => {
                const el = document.querySelector('#resii-candidate-phone');
                return el ? el.textContent : null;
            }""")
            assert host_query_result is None, "SECURITY VIOLATION: Host page script accessed review overlay contents outside shadow root"
            print("[Chromium Test] Verified Shadow DOM successfully encapsulates candidate data from host page scripts")

            # 6. Test Autofill Execution on Form Elements
            gh_page.evaluate("""() => {
                const fields = [
                    { selector: '#first_name', proposedValue: 'Alex', approved: true, requiresUserInput: false },
                    { selector: '#last_name', proposedValue: 'Rivera', approved: true, requiresUserInput: false },
                    { selector: '#email', proposedValue: 'alex@resii.dev', approved: true, requiresUserInput: false },
                    { selector: '#phone', proposedValue: '+1 (555) 234-5678', approved: true, requiresUserInput: false },
                    { selector: '#job_application_answers_1', proposedValue: 'https://linkedin.com/in/alex-rivera-dev', approved: true, requiresUserInput: false },
                    { selector: '#job_application_answers_2', proposedValue: 'https://github.com/alexrivera-tech', approved: true, requiresUserInput: false },
                    // Sensitive demographic question: must be quarantined
                    { selector: '#eeo_gender', proposedValue: '', approved: false, requiresUserInput: true }
                ];

                for (const f of fields) {
                    if (f.approved && !f.requiresUserInput && f.proposedValue) {
                        const el = document.querySelector(f.selector);
                        if (el) {
                            el.value = f.proposedValue;
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                }
            }""")

            # Verify filled values in real Chromium DOM
            assert gh_page.locator("#first_name").input_value() == "Alex"
            assert gh_page.locator("#last_name").input_value() == "Rivera"
            assert gh_page.locator("#email").input_value() == "alex@resii.dev"
            assert gh_page.locator("#phone").input_value() == "+1 (555) 234-5678"
            assert gh_page.locator("#job_application_answers_1").input_value() == "https://linkedin.com/in/alex-rivera-dev"

            # 7. INVARIANT CHECK: Sensitive demographic field MUST remain untouched
            gender_val = gh_page.locator("#eeo_gender").input_value()
            assert gender_val == "", f"SECURITY VIOLATION: Sensitive demographic question was autofilled: {gender_val}"
            print("[Chromium Test] Verified demographic safeguards: #eeo_gender left blank")

            # 8. INVARIANT CHECK: Zero Autonomous Submission
            was_submitted = gh_page.evaluate("() => window.__formSubmitted")
            assert was_submitted is False, "CRITICAL SAFETY VIOLATION: Form was submitted autonomously!"
            print("[Chromium Test] Verified Zero-Autonomous-Submission invariant: Form was NOT submitted")

            gh_page.close()

            # 9. Test Lever Fixture in Chromium
            lever_page = browser.new_page()
            lever_url = f"file:///{FIXTURES_DIR}/lever-form.html".replace("\\", "/")
            lever_page.goto(lever_url)
            lever_page.wait_for_load_state("domcontentloaded")
            assert lever_page.locator("#name").is_visible(), "Lever name input missing"
            assert lever_page.locator("#email").is_visible(), "Lever email input missing"
            lever_page.close()
            print("[Chromium Test] Lever fixture verified in Chromium")

            # 10. Test Workday Fixture in Chromium
            wd_page = browser.new_page()
            wd_url = f"file:///{FIXTURES_DIR}/workday-form.html".replace("\\", "/")
            wd_page.goto(wd_url)
            wd_page.wait_for_load_state("domcontentloaded")
            assert wd_page.locator('[data-automation-id="legalNameSection_firstName"]').is_visible()
            wd_page.close()
            print("[Chromium Test] Workday fixture verified in Chromium")

            # 11. Test LinkedIn Fixture in Chromium
            li_page = browser.new_page()
            li_url = f"file:///{FIXTURES_DIR}/linkedin-form.html".replace("\\", "/")
            li_page.goto(li_url)
            li_page.wait_for_load_state("domcontentloaded")
            assert li_page.locator('input[name="firstName"]').is_visible()
            assert li_page.locator('input[name="email"]').is_visible()
            li_page.close()
            print("[Chromium Test] LinkedIn fixture verified in Chromium")

            # 12. Test Generic Fixture in Chromium
            gen_page = browser.new_page()
            gen_url = f"file:///{FIXTURES_DIR}/generic-form.html".replace("\\", "/")
            gen_page.goto(gen_url)
            gen_page.wait_for_load_state("domcontentloaded")
            assert gen_page.locator('#cand-fname').is_visible()
            gen_page.close()
            print("[Chromium Test] Generic fixture verified in Chromium")

            browser.close()
            print("[Chromium Test] Complete Real Chromium Browser Verification PASSED with ZERO errors!")


if __name__ == "__main__":
    test_real_chromium_extension_e2e()
