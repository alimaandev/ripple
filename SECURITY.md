# Security Policy

Ripple takes security seriously. As a developer tool, vulnerabilities are
unlikely to be remotely exploitable, but any weakness in input handling,
path resolution, or published artifacts is still important to us.

## Reporting a vulnerability

**Do not open a public issue for a vulnerability.**

Report privately by emailing the maintainer directly:

- Contact: **alishermaan0319@gmail.com**
- Please include: the affected version, a minimal repro (files + commands),
- if possible a suggested fix.

If you believe the issue is urgent or you want an auditable trail, you can
also open a [private security advisory](https://github.com/alimaandev/ripple/security/advisories/new) on GitHub.

## What happens next

1. The maintainer acknowledges the report within 48 hours.
2. We work with you to triage severity and decide a fix timeline.
3. We keep the issue private until a fix is released and announced in the
   changelog, then credit the reporter if you wish.

## Scope

In-scope: the `@alimaandev/ripple` npm package, the source in this
repository, and its published artifacts.

Out of scope: dependencies (report those to their own projects), and
misconfiguration in your own `ripple.config` files.
