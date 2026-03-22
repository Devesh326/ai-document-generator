import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";
import { generateDependencyAnalysis, generateMermaidGraph } from "../controllers/githubController.js";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not set in environment variables");
}

// The client gets the API key from the environment variable `GEMINI_API_KEY`.
const ai = new GoogleGenAI({});

async function test( req : any, res: any) {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: "Explain how AI works in a few words 30 to be exact, amaze me",
    config: {
      temperature: 0.7,
      maxOutputTokens: 30000,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.LOW,
      },
    }
  });
  console.log(response.text);
  res.send(response.text);
}


export async function generateReadme(
  files: any,
  analysis: any,
  existingReadme: string | null,
  dependencyGraph: any[],
  type: 'initial' | 'update',
  routerSummary?: any[]
): Promise<string> {

  const filesSummary = files.map((f: any) => `
### ${f.path}
\`\`\`
${f.content}${f.truncated ? '\n... (truncated)' : ''}
\`\`\`
`).join('\n');

  let prompt = '';

  const isFlat = 
    analysis.structure.backend.length === 0 &&
    analysis.structure.frontend.length === 0 &&
    analysis.structure.mobile.length === 0;
  
  if (type === 'initial' || !existingReadme) {

    
  // Generate dependency analysis summary
  const depAnalysis = generateDependencyAnalysis(dependencyGraph, files);
  
  // Generate mermaid diagram (only if graph is reasonable size)
  const mermaidDiagram = dependencyGraph.length < 50 
    ? generateMermaidGraph(dependencyGraph)
    : '';
    
    // First time - generate from scratch
    prompt = `You are a technical documentation expert. Generate a comprehensive README.md for this repository.

    IMPORTANT: Output ONLY the README content in markdown format. Do NOT include any preamble, explanations, or meta-commentary like "Here is the README" or "Based on the code". Start directly with the markdown content (# Title).

${existingReadme ? ` If Readme Exists, go through it, if its sufficient, DO NOT create a new README, FURTHER DO NOT DRASTICALLY DELETE ANY USER CREATED README. ` : ` `} 

    REPOSITORY STRUCTURE:
    ${isFlat ? `
⚠️ THIS IS A FLAT/ROOT-LEVEL PROJECT

All source files are in the repository root. There are NO backend/, frontend/, or mobile/ folders.

DO NOT invent folder structure that doesn't exist.
DO NOT create fake directories like "backend/", "frontend/", or "services/".

Describe the actual files in the root directory.
` : `
${JSON.stringify(analysis.structure, null, 2)}
`}

TECH STACK:
${JSON.stringify(analysis.metadata.techStack, null, 2)}

Use the following dependency analysis to understand the system architecture.
Do not restate it unless necessary.
${depAnalysis}
${mermaidDiagram ? `ARCHITECTURE DIAGRAM:\n${mermaidDiagram}\n` : ''}


CODE FILES:
${filesSummary}

Generate a professional README with these sections:

1. **Project Title & Description**
   - Clear, concise overview (2-3 sentences)
   
2. **Features**
Only list features that are clearly observable in the provided files.
If features cannot be inferred, describe the project purpose instead.

3. **Tech Stack**
   - List all detected technologies

4. **Architecture**

${mermaidDiagram ? '   - Include the provided mermaid diagram' : '   - Describe the folder structure'}

5. **Installation**
   - Prerequisites
   - Step-by-step setup
   - Environment variables

6. **API Documentation** ${routerSummary ? '(REQUIRED - endpoints detected)' : '(skip if no API)'}
   ${routerSummary ? `
   The following API endpoints were detected:
   ${routerSummary}
   
   Document these endpoints clearly:
   - Group by resource (Users, Posts, Auth, etc.)
   - Include HTTP method and path for each endpoint
   - Infer request/response structure from route handler code and controller logic
   - If authentication is required, mention it
   - Include the base URL pattern if one exists (e.g., /api/v1 or /api)
   - Add brief descriptions based on route names and handlers
   
   Format:
   - Use clear section headers for each resource
   - Show example requests for POST/PUT/PATCH endpoints
   - Show example responses with realistic field names
   - Keep examples concise but informative
   ` : ''}

7. **Project Structure**
${isFlat ? 
     `List the main files in the repository root:
   \`\`\`
   ├── app.py
   ├── scrape.py
   ├── requirements.txt
   └── README.md
   \`\`\`
   
   Add a 1-line description below the tree explaining what each file does.` :
     
     `Show the folder tree structure with brief inline comments.
   
   Format example:
   \`\`\`
   backend/
   ├── src/
   │   ├── controllers/    # Request handlers
   │   ├── models/         # Prisma schemas
   │   ├── services/       # Core logic
   │   └── routes/         # API routes
   └── package.json
   \`\`\`
   
   Rules:
   - Use markdown code block with triple backticks
   - Include inline comments with # (keep them SHORT - max 3-4 words)
   - Show only main directories (not every file)
   - Keep it clean and readable`
   }

8. **Contributions are Welcome!**
   - Basic guidelines

9. **License**
    - Suggest MIT

Format as clean markdown.`;

  } else {
    // Update - preserve custom content, update technical sections
    prompt = `You are a technical documentation expert.

    Update the README only where necessary.

    This is an incremental documentation update, not a full rewrite.

IMPORTANT: Output ONLY the updated README content in markdown format. Do NOT include any preamble, explanations, or meta-commentary like "Here is the updated README". Start directly with the markdown content (# Title).


EXISTING README:
${existingReadme}


RECENT CODE CHANGES (Git Diffs):

The following files were modified. Lines with '+' are additions, lines with '-' are deletions.

⚠️ CRITICAL: These diffs show ONLY the changed files, NOT the entire repository.
Do NOT recompute the entire architecture from these files.
Use them only to update sections that are clearly affected.

${filesSummary}

-----

CURRENT TECH STACK:
${JSON.stringify(analysis.metadata.techStack, null, 2)}
⚠️ Update Tech Stack section if dependencies changed.

------

${routerSummary ? `
UPDATED API ENDPOINTS:
${routerSummary}
IMPORTANT: If the API Documentation section exists in the README:
Update it as follows:
- Compare detected endpoints with documented endpoints
- Add any NEW endpoints that aren't documented
- Remove any DELETED endpoints that no longer exist
- Update endpoint descriptions if handler code changed
- Preserve any custom examples or notes the user added
- Keep the same formatting style as the existing API docs section

If API Documentation section doesn't exist but endpoints are detected:
- Add a new API Documentation section
- Use the same format as described in the initial generation
` : ''}


UPDATE INSTRUCTIONS:

**1. Architecture Section:**

${isFlat ? `
⚠️ This is a FLAT/ROOT-LEVEL project - all files are in the repository root.

- Keep the Architecture section simple
- DO NOT add folders like "backend/", "frontend/" if they don't exist
- If new files were added to root, mention them
- If files were deleted, remove them from the file list
` : `
The README already has a complete architecture diagram showing all files.

For the Mermaid diagram:
- Look at the diffs above
- If files were ADDED (+ lines):
  * Add them as new nodes in the diagram
  * Add their import connections (look at the import statements in the code)
- If files were DELETED (- lines):
  * Remove those nodes from the diagram
  * Remove their connections
- If files were MODIFIED (changed content, same filename):
  * Keep the node, update connections if imports changed

For the folder structure description:
- Update ONLY if new top-level folder appeared (workers/, cache/, etc.)
- Otherwise keep as is
`}

**2. Features Section:**
- Add features ONLY if explicitly shown in + lines
- Don't remove unless explicitly shown in - lines


3. **Preserve everything else:**
   - All custom content (badges, images, examples, links)
   - User-written descriptions and explanations
   - Architecture diagrams (unless clearly mentioned in diff files)
   - Contributing guidelines, License, etc.

4. **Skip update if:**
   - Changes are only bug fixes or refactoring
   - Changes are internal implementation details
   - No user-facing impact

5. **Maintain style:**
   - Keep the same tone and formatting
   - Don't change the README structure
   - Don't add unnecessary sections


   DECISION RULES:

- Bug fixes / refactoring / internal changes → Don't update
- New user-facing capability → Update Features
- New endpoint → Update API docs
- New major folder → Update Architecture structure
- New file in existing folder → Update Architecture diagram only

---

OUTPUT:


Return the updated README in markdown format.`;
  }

  let response=null;
  try {
    response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: prompt,
    config: {
      temperature: 0.7,
      maxOutputTokens: 30000,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.MEDIUM,
      },
    }
  });
  return response?.text ?? 'null';
}
catch (err){
  console.log("Error in generating response from gemini", err)
}
return 'null';
}

export {test};