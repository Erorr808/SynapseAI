# Security Policy

## Supported Versions

The following versions of SynapseAI currently receive security updates.

| Version | Supported |
|--------|-----------|
| main / latest | ✅ |
| older releases | ❌ |

Security fixes will generally be applied to the latest development branch unless otherwise stated.

---

## Reporting a Vulnerability

If you discover a security vulnerability in SynapseAI, please report it **privately and responsibly**.

Do **NOT** open a public GitHub issue for security vulnerabilities.

Instead, report vulnerabilities by contacting the maintainers:

Email: security@synapseai.dev  
GitHub: https://github.com/Erorr808

Include the following information:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Affected components or files
- Proof-of-concept (if available)
- Suggested mitigation (optional)

We will acknowledge receipt of your report within **72 hours**.

---

## Disclosure Policy

We follow a **responsible disclosure model**.

Process:

1. Vulnerability reported privately
2. Maintainers confirm and reproduce the issue
3. Patch is developed and tested
4. Security advisory is prepared
5. Patch is released
6. Vulnerability publicly disclosed

We aim to release fixes within **14 days** for critical issues when possible.

---

## Scope

Security vulnerabilities may include:

- Remote code execution
- Authentication bypass
- Message routing manipulation
- Identity spoofing
- Transport layer interception
- Data leakage
- Denial-of-service vulnerabilities
- Trust or verification bypass

Issues that **are not typically considered security vulnerabilities**:

- General bugs without security impact
- Performance issues
- Feature requests
- Code style improvements

---

## Security Best Practices for Contributors

When contributing to SynapseAI:

- Validate all external input
- Avoid unsafe deserialization
- Use secure cryptographic primitives
- Do not store secrets in the repository
- Follow principle of least privilege
- Ensure transports support encryption where applicable
- Avoid introducing hardcoded credentials

All contributors should review security implications before submitting pull requests.

---

## Security Updates

Security fixes will be announced through:

- GitHub Security Advisories
- Release notes
- Repository updates

Users are strongly encouraged to update to the latest version when a security release is published.

---

## Responsible Disclosure Acknowledgement

We appreciate researchers and developers who responsibly disclose vulnerabilities.

Contributors who report valid vulnerabilities may be credited in the security advisory unless they prefer to remain anonymous.

---

## Additional Notes

SynapseAI is an experimental distributed communication framework.  
Users deploying SynapseAI in production environments should perform independent security audits and risk assessments.