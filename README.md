# AutoDoc: AI-Powered GitHub Repository Documentation

AutoDoc is an intelligent automation tool designed to streamline repository maintenance by automatically generating and updating `README.md` files for GitHub repositories. By leveraging advanced LLMs (via Google GenAI) and GitHub's API, it analyzes project structures, detects tech stacks, and creates professional, context-aware documentation.

## Features

- **Automated Analysis:** Scans repository trees to categorize project structure (backend, frontend, shared).
- **Intelligent Tech Detection:** Automatically identifies languages, frameworks, and databases used in the project.
- **Context-Aware Generation:** Generates comprehensive README content from scratch or intelligently updates existing documentation.
- **GitHub Integration:** Seamlessly interacts with GitHub repositories via Octokit to fetch file contents and structure.
- **Asynchronous Processing:** Utilizes a background worker queue (Bull + Redis) for scalable documentation generation.

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database/Caching:** Redis (for queue management)
- **ORM:** Prisma
- **AI/LLM:** Google GenAI (Gemini)
- **API Integration:** Octokit (GitHub API)

## Installation

### Prerequisites

- Node.js (v20+)
- Redis server running
- A PostgreSQL database (for Prisma)
- Gemini API Key

### Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the `backend` directory:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
   GEMINI_API_KEY="your_gemini_api_key_here"
   GITHUB_APP_ID="your_github_app_id"
   # Add other required environment variables
   ```

4. **Run Database Migrations:**
   ```bash
   npm run prisma:migrate:dev
   ```

5. **Start the Application:**
   ```bash
   # Start the API server
   npm run dev
   
   # Start the documentation worker
   npm run worker
   ```

## Usage

The application exposes endpoints to interact with GitHub repositories:

*   **Analyze Repository:** Trigger an analysis of a specific GitHub repository.
*   **Generate Documentation:** Send a request to the AI service to parse the file structure and generate a `README.md`.
*   **Webhook Handler:** The system includes a webhook listener (`POST /webhook`) to automatically trigger documentation updates upon repository events.

## Project Structure

```text
backend/
├── src/
│   ├── controllers/    # Request handlers for GitHub API and Webhooks
│   ├── models/         # Prisma schema and interface definitions
│   ├── queues/         # Bull queue configurations for background tasks
│   ├── routes/         # Express route definitions
│   ├── services/       # Core logic: AI generation, Repo analysis, File selection
│   └── worker/         # Background workers for processing generation tasks
├── prisma/             # Database schema and migrations
└── package.json
```

## Contributing

Contributions are welcome! Please follow these steps to contribute:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'Add some amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.