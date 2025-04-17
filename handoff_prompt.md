# Handoff Prompt: Debug Failing Project Tests

**Objective:** Resolve the final 2 failing tests for `GET /api/v1/projects/:id/people` in the `C:\Apps\Brian` project. The tests fail with `SequelizeDatabaseError: column "user_id" does not exist`.

**Background:**
*   The error occurs despite the `20250416132000-create-project-assignments.js` migration correctly defining the `user_id` column and the application code referencing it.
*   The root cause is suspected to be a mismatch between the database schema the tests *run against* and the schema created by the migrations during test setup.

**Debugging Steps Taken & Changes Made:**
1.  **Confirmed Failures:** Ran `npm test` initially, confirming the 2 specific test failures related to `GET /api/v1/projects/:id/people` and the `column "user_id" does not exist` error.
2.  **Migration Execution (execSync):**
    *   Added logging to `tests/globalSetup.js` around the `execSync` call for `sequelize-cli db:migrate`.
    *   Confirmed the CLI command *appeared* to run successfully and used the `test` environment from `config/config.json`.
    *   Noted that `DB_HOST`, `DB_USER`, etc., were `undefined` in the `globalSetup.js` Node process itself.
3.  **Setup File Analysis:**
    *   Checked `package.json` (confirmed `npm test` script).
    *   Checked `jest.config.js` (identified `tests/setup.js` runs via `setupFilesAfterEnv`).
    *   Examined `tests/setup.js`. Temporarily commented out model/app imports, suspecting early initialization; this didn't fix the error and was reverted. Confirmed no `sequelize.sync({ force: true })` calls were active.
4.  **Configuration Files:**
    *   Verified `config/config.json` defines the `test` environment correctly (`database: brian_test`) without relying on missing environment variables.
    *   Verified `src/models/index.js` correctly identifies `NODE_ENV=test` but *prioritizes* `DB_*` environment variables over `config.json` values if present.
5.  **Model/Association Definitions:**
    *   Reviewed migration `20250416132000-create-project-assignments.js` - Correctly defines `user_id`.
    *   Reviewed model `src/models/projectAssignment.js` - Correctly defines `user_id` attribute and reference. Explicitly added `field: 'user_id'` as a diagnostic step (didn't help).
    *   Reviewed associations in `src/models/project.js` and `src/models/person.js` - Both correctly use `user_id` as the foreign/other key.
6.  **Test Setup Code:**
    *   Found the `beforeAll` hook in `tests/integration/projects.read.test.js` was incorrectly creating `ProjectAssignment` using `employee_id`. Corrected this to use `user_id`. This did *not* fix the error.
7.  **Migration Timing/Context:**
    *   Moved `require('../src/models')` in `tests/globalSetup.js` to *after* the `execSync` migration call. Did *not* fix the error.
    *   Tried explicitly syncing `ProjectAssignment` model after migration. Did *not* fix the error. Reverted.
    *   Tried closing the DB connection before migration and re-requiring models after. Caused new errors. Reverted.
8.  **Programmatic Migrations (Umzug):**
    *   Installed `umzug`.
    *   Rewrote `tests/globalSetup.js` to use `umzug` (with the application's `db.sequelize` instance) to run migrations programmatically (`umzug.down({ to: 0 })` then `umzug.up()`). This ensures migrations and tests use the same Node process and Sequelize instance. This also did *not* fix the error.
9.  **Environment Variable Interference (.env):**
    *   Read `C:\Apps\Brian\.env`. Found it defines development DB settings (`DB_NAME=postgres`, `DB_USER=postgres`, etc.).

**Current Hypothesis & Problem:**
*   The persistent error, despite programmatic migrations running correctly against `brian_test`, strongly suggests the application code *during the test execution* is connecting to the wrong database.
*   `src/models/index.js` prioritizes `DB_*` environment variables.
*   The `dotenv` package is installed and likely loads the `C:\Apps\Brian\.env` file when `src/models/index.js` (or other app code) is required by the tests.
*   This causes the tests to run against the *development* database (`postgres`) defined in `.env`, which has *not* been migrated with the `user_id` column, while `umzug` correctly migrated the *test* database (`brian_test`).
*   The query `SELECT "user_id" FROM "project_assignments"...` fails because the tests are effectively querying the unmigrated development database schema.

**Remaining Tasks:**
1.  **Verify Hypothesis:** Confirm that the `.env` file loading is causing the tests to connect to the wrong database.
2.  **Implement Fix:** Prevent the `.env` file from interfering in the `test` environment. Options:
    *   Modify the `npm test` script in `package.json` to explicitly set *all* required `DB_*` variables using `cross-env` (e.g., `cross-env NODE_ENV=test DB_NAME=brian_test DB_USER=postgres DB_PASSWORD=is0Merate ... jest`). This will override any values loaded from `.env`.
    *   Modify application startup code (e.g., where `dotenv.config()` is called) to *not* load the `.env` file when `NODE_ENV` is `test`.
3.  **Test:** Run `npm test` again to confirm all tests pass.
4.  **Complete:** Use the `attempt_completion` tool with a summary of the final fix.