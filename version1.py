"""
Email Finder Agent (High Accuracy Edition)
------------------------------------------
Given company website URLs, this agent:
  1. Handles site retries (https, http, www, redirects)
  2. Visits the homepage and discovers Contact/About/Team links
  3. Extracts emails using multi-layer extraction:
     - Standard Regex
     - Mailto link targets (<a href="mailto:...">)
     - Cloudflare data-cfemail decryption
     - Anti-spam text de-obfuscation (e.g. info [at] domain [dot] com)
     - JSON-LD Schema.org metadata parsing
  4. Filters out false-positives (image files, JS libs, placeholder domains)
  5. Supports bulk input (.xlsx, .csv, .txt) with multi-threading

Usage:
  python3 version1.py https://example.com
  python3 version1.py --file website_link_list.xlsx --out emails_found.csv --threads 10
"""

import argparse
import csv
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
import re
import sys
import time
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

try:
    import openpyxl
except ImportError:
    openpyxl = None

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    )
}

REQUEST_TIMEOUT = 12  # seconds
MAX_PAGES_PER_SITE = 6  # homepage + up to 5 candidate contact/about pages

# Keywords used to find likely "contact" / "about" links on the homepage
LINK_KEYWORDS = [
    "contact", "contact-us", "contactus", "about", "about-us", "aboutus",
    "reach us", "get in touch", "support", "team", "who-we-are", "location", "locations",
]

# Regex for extracting emails
EMAIL_REGEX = re.compile(
    r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+"
)

# Text de-obfuscation regexes (e.g. info [at] domain [dot] com)
OBFUSCATED_AT = re.compile(r"\s*(?:\[at\]|\(at\)|\[AT\]|\(AT\)|\s+at\s+|\s+AT\s+)\s*")
OBFUSCATED_DOT = re.compile(r"\s*(?:\[dot\]|\(dot\)|\[DOT\]|\(DOT\)|\s+dot\s+|\s+DOT\s+)\s*")

# Common false-positive patterns to filter out
BAD_EMAIL_SUBSTRINGS = (
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".js", ".css",
    "example.com", "sentry.io", "wixpress.com", "godaddy.com",
    "domain.com", "mysite.com", "placeholder", "schema.org",
    "@v1.", "@v2.", "@v3.", "@1.", "@2.", "@3.",
    "focus-within", "intl-segmenter", "lodash", "react-dom", "react@",
)


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

def decode_cloudflare_email(cf_hex: str) -> str | None:
    """Decrypt Cloudflare data-cfemail hex string to email address."""
    try:
        r = int(cf_hex[:2], 16)
        email = "".join(
            chr(int(cf_hex[i : i + 2], 16) ^ r) for i in range(2, len(cf_hex), 2)
        )
        if EMAIL_REGEX.match(email):
            return email
    except Exception:
        pass
    return None


URL_LIKE_REGEX = re.compile(
    r"^(https?://)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(/\S*)?$"
)

def is_valid_url(val: str) -> bool:
    """Check if string looks like a valid URL or domain."""
    if not val or not isinstance(val, str):
        return False
    val = val.strip()
    if ".." in val.split("/")[0]:
        return False
    return bool(URL_LIKE_REGEX.match(val))


def fetch(url: str) -> tuple[str | None, str]:
    """Fetch URL with retries (https/http/www fallback) and return (html, final_url)."""
    if not is_valid_url(url):
        return None, url

    urls_to_try = [url]
    
    # Add protocol variations
    if url.startswith("http://"):
        urls_to_try.append("https://" + url[7:])
    elif url.startswith("https://"):
        urls_to_try.append("http://" + url[8:])
    elif not url.startswith(("http://", "https://")):
        urls_to_try = ["https://" + url, "http://" + url]

    # Add www fallback
    try:
        parsed = urlparse(urls_to_try[0])
        netloc = parsed.netloc or parsed.path
        if netloc and not netloc.startswith("www."):
            urls_to_try.append(f"https://www.{netloc}")
    except Exception:
        pass

    for u in urls_to_try:
        try:
            resp = requests.get(u, headers=HEADERS, timeout=REQUEST_TIMEOUT, allow_redirects=True)
            if resp.status_code == 200 and "text" in resp.headers.get("Content-Type", "").lower():
                return resp.text, resp.url
        except Exception:
            continue

    return None, url


def find_candidate_links(base_url: str, html: str) -> list[str]:
    """Find links on the homepage that look like Contact/About/Team pages."""
    soup = BeautifulSoup(html, "lxml")
    found = []
    seen = set()
    base_netloc = urlparse(base_url).netloc.replace("www.", "")

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        text = a.get_text(strip=True).lower()
        href_lower = href.lower()

        if any(kw in href_lower or kw in text for kw in LINK_KEYWORDS):
            full_url = urljoin(base_url, href)
            curr_netloc = urlparse(full_url).netloc.replace("www.", "")
            
            # Keep on same domain family
            if curr_netloc == base_netloc or not curr_netloc:
                if full_url not in seen:
                    seen.add(full_url)
                    found.append(full_url)

    return found[: MAX_PAGES_PER_SITE - 1]


def extract_emails(html: str) -> set[str]:
    """Multi-layer email extraction (Regex, Mailto, Cloudflare, JSON-LD, De-obfuscation)."""
    found = set()
    if not html:
        return found

    soup = BeautifulSoup(html, "lxml")

    # 1. Cloudflare encrypted emails
    for tag in soup.find_all(attrs={"data-cfemail": True}):
        decoded = decode_cloudflare_email(tag["data-cfemail"])
        if decoded:
            found.add(decoded)

    # 2. Explicit Mailto href links
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.lower().startswith("mailto:"):
            raw_email = href.split(":")[1].split("?")[0].strip()
            if EMAIL_REGEX.match(raw_email):
                found.add(raw_email)

    # 3. Structured Data (JSON-LD / Schema.org)
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            data_str = json.dumps(data)
            for email in EMAIL_REGEX.findall(data_str):
                found.add(email)
        except Exception:
            pass

    # 4. Anti-Spam Text De-obfuscation (e.g. info [at] domain [dot] com)
    text_content = soup.get_text(separator=" ")
    deobfuscated = OBFUSCATED_AT.sub("@", text_content)
    deobfuscated = OBFUSCATED_DOT.sub(".", deobfuscated)
    for email in EMAIL_REGEX.findall(deobfuscated):
        found.add(email)

    # 5. Raw HTML Regex match
    for email in EMAIL_REGEX.findall(html):
        found.add(email)

    # Filter out junk emails
    clean = set()
    for email in found:
        email_lower = email.lower().strip(".,;")
        if any(bad in email_lower for bad in BAD_EMAIL_SUBSTRINGS):
            continue
        if len(email_lower) > 5 and "." in email_lower.split("@")[-1]:
            clean.add(email_lower)

    return clean


def process_site(url: str) -> dict:
    """Visit homepage + candidate contact pages for a website and extract emails."""
    result = {"company_url": url, "emails": set(), "pages_checked": []}

    homepage_html, final_url = fetch(url)
    if homepage_html is None:
        result["error"] = "Could not reach homepage"
        return result

    result["company_url"] = final_url
    result["emails"] |= extract_emails(homepage_html)
    result["pages_checked"].append(final_url)

    candidate_links = find_candidate_links(final_url, homepage_html)
    for link in candidate_links:
        html, actual_link = fetch(link)
        if html:
            result["emails"] |= extract_emails(html)
            result["pages_checked"].append(actual_link)
        time.sleep(0.3)

    return result


# ---------------------------------------------------------------------------
# CLI & File Processing
# ---------------------------------------------------------------------------

def load_urls_from_file(filepath: str) -> list[str]:
    """Extract website URLs from .xlsx, .csv, or .txt files."""
    urls = []
    ext = os.path.splitext(filepath)[1].lower()

    if ext == ".xlsx":
        if openpyxl is None:
            print("Error: openpyxl package required for Excel files. Run: pip3 install openpyxl")
            sys.exit(1)
        wb = openpyxl.load_workbook(filepath)
        sheet = wb.active
        for row in sheet.iter_rows(values_only=True):
            for cell in row:
                if cell and isinstance(cell, str):
                    val = cell.strip()
                    if is_valid_url(val) and val.lower() != "website" and val not in urls:
                        urls.append(val)
    elif ext == ".csv":
        with open(filepath, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            for row in reader:
                for cell in row:
                    val = cell.strip()
                    if val and is_valid_url(val) and val.lower() != "website" and val not in urls:
                        urls.append(val)
    else:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                val = line.strip()
                if val and is_valid_url(val):
                    urls.append(val)

    return urls


def main():
    parser = argparse.ArgumentParser(description="Find company emails in bulk with high accuracy.")
    parser.add_argument("urls", nargs="*", help="One or more website URLs")
    parser.add_argument("--file", help="File (.xlsx, .csv, or .txt) containing URLs")
    parser.add_argument("--out", default="emails_found.csv", help="Output CSV path")
    parser.add_argument("--threads", type=int, default=10, help="Number of parallel worker threads (default: 10)")
    parser.add_argument("--json", action="store_true", help="Output results as JSON lines (for programmatic use)")
    args = parser.parse_args()

    urls = list(args.urls)
    if args.file:
        urls += load_urls_from_file(args.file)

    if not urls:
        if args.json:
            print(json.dumps({"type": "error", "message": "No URLs provided"}), flush=True)
        else:
            print("No URLs provided. Pass them as arguments or use --file website_link_list.xlsx")
        sys.exit(1)

    if args.json:
        print(json.dumps({"type": "start", "total": len(urls)}), flush=True)
    else:
        print(f"Loaded {len(urls)} URLs. Processing with {args.threads} threads (High Accuracy Mode)...\n")

    all_results = []

    with ThreadPoolExecutor(max_workers=args.threads) as executor:
        future_to_url = {executor.submit(process_site, url): url for url in urls}
        for count, future in enumerate(as_completed(future_to_url), 1):
            res = future.result()
            all_results.append(res)
            if args.json:
                print(json.dumps({
                    "type": "result",
                    "index": count,
                    "total": len(urls),
                    "company_url": res["company_url"],
                    "emails": sorted(list(res["emails"])),
                    "pages_checked": res["pages_checked"],
                    "error": res.get("error", "")
                }), flush=True)
            else:
                if res.get("error"):
                    print(f"[{count}/{len(urls)}] {res['company_url']} -> Error: {res['error']}")
                else:
                    emails = ", ".join(sorted(res["emails"])) or "(none found)"
                    print(f"[{count}/{len(urls)}] {res['company_url']} -> {emails}")

    # Save to CSV
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["company_url", "emails", "pages_checked", "error"])
        for res in all_results:
            writer.writerow([
                res["company_url"],
                "; ".join(sorted(res["emails"])),
                "; ".join(res["pages_checked"]),
                res.get("error", ""),
            ])

    if args.json:
        print(json.dumps({"type": "done", "total": len(all_results), "output_file": args.out}), flush=True)
    else:
        print(f"\nDone! Processed {len(all_results)} sites. Results saved to {args.out}")


if __name__ == "__main__":
    main()