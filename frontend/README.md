# CSW Frontend - Login Slice

## Installation

Install dependencies using npm:

```bash
npm install
```

## Running the Development Server

Start the Vite development server:

```bash
npm run dev
```

The server typically runs on http://localhost:5173 by default.

## Configuration

The backend API URL needs to be configured via an environment variable.

1.  Create a `.env` file in the project root (`frontend/`). You can do this by copying the example file:
    ```bash
    cp .env.example .env
    ```
2.  Open the `.env` file and add or modify the `VITE_API_URL` variable to point to your backend API. For example:
    ```
    VITE_API_URL=http://localhost:3000/api/v1
    ```
    Replace `http://localhost:3000/api/v1` with the actual URL of your backend API.
3.  The `.env.example` file provides a template and shows an example of the required variable (`VITE_API_URL=http://localhost:3000/api/v1`).

**Note:** The application uses Vite, which automatically loads environment variables from `.env` files. Make sure to restart the development server if you create or modify the `.env` file while it's running.

## End-to-End Testing (Cypress)

Instructions for running the Cypress end-to-end tests.

### Prerequisites

1.  **Backend Server Running:** The backend application must be running before starting the E2E tests. Navigate to the backend project directory (`c:/Apps/Brian/backend`) and start the server, typically using:
    ```bash
    npm run dev
    ```
2.  **Database Seeding:** The database needs to be seeded with the necessary test data. Before running the tests for the first time or after resetting the database, navigate to the backend project directory (`c:/Apps/Brian/backend`) and run the seeding command:
    ```bash
    npx sequelize-cli db:seed:all
    ```

### Running the Tests

Once the prerequisites are met, you can run the Cypress tests using the following command in the frontend project directory (`c:/Apps/Brian/frontend`):

```bash
npm run test:e2e
