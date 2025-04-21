# Project README

This document provides essential information about the project, including release details, CI/CD processes, and deployment procedures.

## Latest Release

The latest stable release candidate is tagged as `v0.3.0-login-stable`.

## CI/CD

Our Continuous Integration (CI) process is defined in `.github/workflows/ci.yml`. This workflow automates testing and validation for every push and pull request.

A key part of the CI pipeline is running End-to-End (E2E) tests using Cypress. These tests are executed after the backend services are started to ensure full application functionality. The command used within the `frontend` directory is:

```bash
npm run test:e2e
```

## Staging Migrations

Database migrations for the staging environment need to be run manually. This typically requires direct access to the staging infrastructure (e.g., via SSH or a Cloud Console) because network restrictions or configuration differences might prevent running them from a local machine.

Use the following command to apply migrations to the staging database:

```bash
npx sequelize-cli db:migrate --env production
```

**Note:** Ensure you have the necessary permissions and the correct environment configuration before running migrations.