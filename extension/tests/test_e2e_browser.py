import sys
from pathlib import Path

# Add extension/tests to path to import e2e-browser
tests_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(tests_dir))

# Import the real Chromium extension end-to-end test
import importlib.util

spec = importlib.util.spec_from_file_location("e2e_browser_module", tests_dir / "e2e-browser.test.py")
e2e_browser_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(e2e_browser_module)


def test_real_chromium_extension_e2e_wrapper():
    """
    Pytest wrapper for the comprehensive Real Chromium Browser Extension Test,
    verifying Service Worker startup, popup rendering, Shadow DOM encapsulation,
    and adapter compatibility across Greenhouse, Lever, Workday, LinkedIn, and Generic fixtures.
    """
    e2e_browser_module.test_real_chromium_extension_e2e()
