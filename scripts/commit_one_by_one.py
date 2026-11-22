import subprocess
import sys
import os

def run_cmd(cmd):
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return p.returncode, p.stdout.strip(), p.stderr.strip()

def get_commit_message(filepath):
    clean = filepath.replace("\\", "/")
    basename = os.path.basename(clean)

    if "EditTreePage.tsx" in clean:
        return "feat(editor): add contact header, live preview refresh and bullet line budget badges in EditTreePage"
    elif "TailorPage.tsx" in clean:
        return "feat(tailor): implement side-by-side tailoring studio with live diffs and autofill CTA"
    elif "JobsFeedPage.tsx" in clean:
        return "feat(jobs): add core skills match chips and direct tailor actions in JobsFeedPage"
    elif "DashboardPage.tsx" in clean:
        return "feat(dashboard): improve top matches actions and handle dashboard data loading smoothly"
    elif "api/resumes.py" in clean:
        return "feat(api): add OpenRouter ATS bullet rewrite and graceful primary resume resolution"
    elif "api/auth.py" in clean:
        return "fix(auth): improve session persistence and prevent dropouts on server restart"
    elif "api/jobs.py" in clean:
        return "feat(api): optimize personalized jobs feed with optional authentication"
    elif "api/ingestion.py" in clean:
        return "feat(ingestion): remove duplicate summary headers and improve line parsing"
    elif "extension/src/content/review-overlay.ts" in clean:
        return "feat(extension): add editable tailored bullets and autofill resume attachment"
    elif "extension/src/content/form-filler.ts" in clean:
        return "feat(extension): support synthetic file attachment via DataTransfer API"
    elif clean.startswith("docs/"):
        doc_name = basename.replace(".md", "").replace("_", " ").title()
        return f"docs: add {doc_name} architectural report"
    elif clean.startswith("api/tests/") or clean.startswith("tests/"):
        return f"test: add test suite for {basename}"
    elif clean.startswith("api/ai/"):
        return f"feat(ai): update AI pipeline components in {clean}"
    elif clean.startswith("extension/"):
        return f"feat(extension): update {basename} for ATS autofill workflows"
    elif clean.startswith("web/"):
        return f"feat(web): update UI component {basename}"
    elif clean.startswith("api/"):
        return f"feat(api): update backend service {basename}"
    else:
        return f"chore: update {basename}"

def main():
    print("[Commit Runner] Scanning status...")
    code, stdout, stderr = run_cmd("git status --porcelain")
    if code != 0:
        print("Git status failed:", stderr)
        sys.exit(1)

    lines = [l.strip() for l in stdout.splitlines() if l.strip()]
    if not lines:
        print("No changes to commit!")
        return

    print(f"[Commit Runner] Found {len(lines)} changes to commit individually.")

    # Sort files: API first, then docs, then extension, then web, then root
    def sort_key(line):
        path = line[3:].strip().strip('"')
        if path.startswith("docs/"):
            return 1
        elif path.startswith("api/"):
            return 2
        elif path.startswith("extension/"):
            return 3
        elif path.startswith("web/"):
            return 4
        else:
            return 5

    lines.sort(key=sort_key)

    success_count = 0
    fail_count = 0

    for i, line in enumerate(lines, 1):
        # Extract filepath
        status_code = line[:2]
        path = line[3:].strip().strip('"')
        if not path or path == "scripts/commit_one_by_one.py":
            continue

        # Add single file
        add_code, _, add_err = run_cmd(f'git add "{path}"')
        if add_code != 0:
            print(f"[{i}/{len(lines)}] Failed to add {path}: {add_err}")
            fail_count += 1
            continue

        msg = get_commit_message(path)
        commit_code, commit_out, commit_err = run_cmd(f'git commit -m "{msg}"')
        if commit_code == 0:
            short_hash = commit_out.splitlines()[0] if commit_out else "ok"
            print(f"[{i}/{len(lines)}] OK: {path} -> {msg} ({short_hash})")
            success_count += 1
        else:
            if "nothing to commit" in commit_out or "nothing to commit" in commit_err:
                print(f"[{i}/{len(lines)}] Skipped (already clean): {path}")
            else:
                print(f"[{i}/{len(lines)}] Commit error on {path}: {commit_err}")
                fail_count += 1

    print(f"\n[Commit Runner] Complete: {success_count} commits created, {fail_count} failed.")

    # Now attempt push
    print("[Commit Runner] Attempting push to origin/main...")
    push_code, push_out, push_err = run_cmd("git push origin main")
    if push_code == 0:
        print("[Commit Runner] Push succeeded!")
        print(push_out)
    else:
        print("[Commit Runner] Push output / status:")
        print(push_out)
        print(push_err)

if __name__ == "__main__":
    main()
