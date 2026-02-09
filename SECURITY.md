# Security Policy

## Supported Versions

The following versions of the SRH Calendar Enhancer are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 4.x     | :white_check_mark: |
| < 4.0   | :x:                |

## Reporting a Vulnerability

We take the security of this proxy seriously, as it handles personal calendar data (though it follows a Zero-Knowledge architecture).

If you discover a security vulnerability, please follow these steps:

1.  **Do NOT open a public issue.** This allows us to patch the vulnerability before it can be exploited.
2.  Email the maintainers directly at `github@zardaloo.eu.org`.
3.  Include a description of the vulnerability and, if possible, steps to reproduce it.

We will acknowledge your report within 48 hours and provide an estimated timeline for the fix.

## Zero-Knowledge Architecture

Contributors must adhere to the **No-Log Policy**:
- **Never** log full calendar URLs to the console or external services.
- **Never** persist the decrypted `targetUrl` beyond the scope of the request handler.
- **Always** use `env.SECRET_KEY` for encryption operations.

## Deployment Security

When deploying to production:
1. Ensure `SECRET_KEY` is set via `wrangler secret put SECRET_KEY`.
2. Do **not** rely on the verified fallback secret in `src/index.js`.
3. Verify `ALLOWED_HOST` is strictly set to `srh-community.campusweb.cloud`.
