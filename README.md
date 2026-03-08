Based on the code changes and the updated tech stack provided, here is the updated `README.md`.

The primary updates reflect the removal of PostgreSQL as a mandatory dependency (as indicated by the updated Tech Stack JSON, which lists Redis as the primary database/store) and slight adjustments to the tech stack listing.

```markdown
# RepoReadMe AI Generator

RepoReadMe AI Generator is an automated service designed to analyze GitHub repositories and generate comprehensive, professional `README.md` files using Google's Gemini AI. It streamlines the documentation process by automatically detecting tech stacks, repository structures, and key features.

## Features

*   **Automated Analysis:** Scans repository file trees to identify project structure and technology stacks (e.g., TypeScript, Express, Prisma).
*   **AI-Powered Writing:** Utilizes Google GenAI (Gemini) to generate context-aware documentation.
*   **Webhook Integration:** Automatically triggers documentation updates via GitHub webhooks.
*   **Queue Management:** Uses Redis and Bull to handle documentation generation tasks asynchronously, ensuring scalability.
*   **Incremental Updates:** Supports both initial `README.md` generation and updates to existing files while preserving custom content.

## Tech Stack

*   **Backend:** TypeScript, Express.js
*   **AI/LLM:** Google GenAI (Gemini 3.1 Flash)
*   **Database:** Redis
*   **ORM:** Prisma
*   **GitHub Integration:** Octokit

## Prerequisites

*   Node.js (v20+)
*   Redis server
*   Gemini API Key

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd backend
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Variables:**
    Create a `.env` file in the root directory and configure the following:
    ```env
    GEMINI_API_KEY="your_google_ai_api_key"
    REDIS_URL="redis://localhost:6379"
    GITHUB_APP_ID="your_github_app_id"
    ```

4.  **Database Setup:**
    ```bash
    npx prisma generate
    ```

5.  **Running the Application:**
    *   Start the API server:
        ```bash
        npm run dev
        ```
    *   Start the background worker for document generation:
        ```bash
        npm run worker
        ```
```