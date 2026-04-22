#!/usr/bin/env python3
"""
sts-sign — generate a pre-signed AWS STS GetCallerIdentity request.

The output JSON file can be uploaded on the Value Stream login page to prove
the caller's AWS identity. The backend forwards the signed request to STS,
validates the signature by receiving a successful response, and issues a JWT
if the returned ARN matches the configured role.

Usage:
    ./sts-sign.py                          # use baked-in default profile
    ./sts-sign.py --profile my-profile     # override the profile
    ./sts-sign.py --region us-east-1       # override the STS region
    ./sts-sign.py --output request.json    # write to a specific path
    ./sts-sign.py --no-login               # do not auto-run `aws sso login`

Dependencies:
    - Python 3.8+
    - AWS CLI v2.9+ (for `aws configure export-credentials` and `aws sso login`)

If short-lived credentials are missing or expired, the script runs
`aws sso login --profile <profile>` automatically (opens your browser).
Use --no-login to disable that and fail with a hint instead.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import hmac
import json
import os
import subprocess
import sys

# ── Backend-templated values ──────────────────────────────────────
# The backend substitutes these when serving the script. Edit manually
# only if you pulled the raw script from the repo.
DEFAULT_PROFILE = "{{DEFAULT_PROFILE}}"
DEFAULT_REGION = "{{DEFAULT_REGION}}"

# Fallback placeholders for when the script is run before backend substitution
if DEFAULT_PROFILE.startswith("{{"):
    DEFAULT_PROFILE = ""
if DEFAULT_REGION.startswith("{{"):
    DEFAULT_REGION = "us-east-1"


def _run_aws(args: list[str], check: bool = True) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(args, capture_output=True, text=True, check=check)
    except FileNotFoundError:
        sys.exit("error: `aws` CLI is not installed or not on PATH")


def _looks_like_sso_expiry(stderr: str) -> bool:
    s = stderr.lower()
    return any(token in s for token in ("sso", "token", "expired", "refreshwithmfaunsupportederror", "credential", "not authorized"))


def _sso_login(profile: str | None) -> None:
    """Interactively run `aws sso login`, streaming output so the user can see the browser prompt."""
    cmd = ["aws", "sso", "login"]
    if profile:
        cmd.extend(["--profile", profile])
    print(f"running: {' '.join(cmd)}", file=sys.stderr)
    try:
        # Do not capture — let the CLI print its URL/code directly to the user's terminal
        result = subprocess.run(cmd)
    except FileNotFoundError:
        sys.exit("error: `aws` CLI is not installed or not on PATH")
    if result.returncode != 0:
        sys.exit(f"error: `aws sso login` failed with exit code {result.returncode}")


def _export_credentials(profile: str | None, auto_login: bool) -> dict:
    """Call `aws configure export-credentials` to retrieve creds for a profile.

    When auto_login is True and the first attempt fails with an SSO-style error,
    runs `aws sso login --profile <p>` and retries once.
    """
    cmd = ["aws", "configure", "export-credentials", "--format", "process"]
    if profile:
        cmd.extend(["--profile", profile])

    result = _run_aws(cmd, check=False)
    if result.returncode == 0:
        return json.loads(result.stdout)

    stderr = (result.stderr or "").strip()
    if auto_login and _looks_like_sso_expiry(stderr):
        print("aws credentials unavailable or expired — starting `aws sso login`", file=sys.stderr)
        _sso_login(profile)
        result = _run_aws(cmd, check=False)
        if result.returncode == 0:
            return json.loads(result.stdout)
        stderr = (result.stderr or "").strip()

    msg = stderr or f"aws CLI exited with code {result.returncode}"
    if _looks_like_sso_expiry(stderr) and not auto_login:
        msg += "\nhint: run `aws sso login" + (f" --profile {profile}" if profile else "") + "` or re-run this script without --no-login"
    sys.exit(f"error: could not load credentials: {msg}")


def _sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _derive_signing_key(secret: str, date_stamp: str, region: str, service: str) -> bytes:
    k_date = _sign(("AWS4" + secret).encode("utf-8"), date_stamp)
    k_region = _sign(k_date, region)
    k_service = _sign(k_region, service)
    return _sign(k_service, "aws4_request")


def build_signed_request(region: str, creds: dict) -> dict:
    """Build the SigV4-signed GetCallerIdentity request."""
    access_key = creds["AccessKeyId"]
    secret_key = creds["SecretAccessKey"]
    session_token = creds.get("SessionToken")

    service = "sts"
    host = f"sts.{region}.amazonaws.com"
    endpoint = f"https://{host}/"
    method = "POST"
    content_type = "application/x-www-form-urlencoded"
    body = "Action=GetCallerIdentity&Version=2011-06-15"
    body_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()

    now = _dt.datetime.now(_dt.timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")

    # Canonical headers (lowercase names, sorted)
    canonical_headers_list = [
        ("content-type", content_type),
        ("host", host),
        ("x-amz-date", amz_date),
    ]
    if session_token:
        canonical_headers_list.append(("x-amz-security-token", session_token))
    canonical_headers_list.sort(key=lambda kv: kv[0])

    canonical_headers = "".join(f"{k}:{v}\n" for k, v in canonical_headers_list)
    signed_headers = ";".join(k for k, _ in canonical_headers_list)

    canonical_request = "\n".join([
        method,
        "/",
        "",  # empty query string
        canonical_headers,
        signed_headers,
        body_hash,
    ])

    credential_scope = f"{date_stamp}/{region}/{service}/aws4_request"
    string_to_sign = "\n".join([
        "AWS4-HMAC-SHA256",
        amz_date,
        credential_scope,
        hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
    ])

    signing_key = _derive_signing_key(secret_key, date_stamp, region, service)
    signature = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    authorization = (
        f"AWS4-HMAC-SHA256 "
        f"Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, "
        f"Signature={signature}"
    )

    headers = {
        "Authorization": authorization,
        "Content-Type": content_type,
        "Host": host,
        "X-Amz-Date": amz_date,
    }
    if session_token:
        headers["X-Amz-Security-Token"] = session_token

    return {
        "url": endpoint,
        "method": method,
        "headers": headers,
        "body": body,
        "region": region,
        "generated_at": amz_date,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a pre-signed STS GetCallerIdentity request")
    parser.add_argument("--profile", default=None, help=f"AWS profile name (default: {DEFAULT_PROFILE or '$AWS_PROFILE or \"default\"'})")
    parser.add_argument("--region", default=None, help=f"AWS region for the STS endpoint (default: {DEFAULT_REGION})")
    parser.add_argument("--output", default="sts-request.json", help="Output file path (default: sts-request.json)")
    parser.add_argument("--stdout", action="store_true", help="Print to stdout instead of writing a file")
    parser.add_argument("--no-login", action="store_true", help="Do not run `aws sso login` automatically when credentials are missing or expired")
    args = parser.parse_args()

    profile = args.profile or DEFAULT_PROFILE or os.environ.get("AWS_PROFILE") or None
    region = args.region or DEFAULT_REGION

    creds = _export_credentials(profile, auto_login=not args.no_login)
    request = build_signed_request(region, creds)
    request["profile"] = profile or "default"

    payload = json.dumps(request, indent=2)

    if args.stdout:
        print(payload)
    else:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(payload)
        print(f"wrote signed request to {args.output} (profile={profile or 'default'}, region={region})")
        print("upload this file on the Value Stream login page.")


if __name__ == "__main__":
    main()
