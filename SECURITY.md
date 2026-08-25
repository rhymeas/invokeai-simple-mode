# Security policy

## Supported version

Security fixes are provided for the latest 1.x release.

## Reporting

Please use GitHub's private security advisory feature for vulnerabilities. Do not include access tokens, private images, model credentials, or personal workspace files in a public issue.

## Local service boundary

Simple Mode and InvokeAI bind to `127.0.0.1` by default. The application is not designed to be exposed directly to the public internet. Users who change the bind address are responsible for authentication, TLS, firewall rules, and access control.
