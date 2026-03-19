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
  

  // Generate dependency analysis summary
  const depAnalysis = generateDependencyAnalysis(dependencyGraph, files);
  
  // Generate mermaid diagram (only if graph is reasonable size)
  const mermaidDiagram = dependencyGraph.length < 50 
    ? generateMermaidGraph(dependencyGraph)
    : '';
  // const mermaidDiagram = generateMermaidGraph(dependencyGraph);

  // need to perfect this as well, highly dependent on the code changes
  // const mermaidDiagram = '';

  const filesSummary = files.map((f: any) => `
### ${f.path}
\`\`\`
${f.content}${f.truncated ? '\n... (truncated)' : ''}
\`\`\`
`).join('\n');

  let prompt = '';
  
  if (type === 'initial' || !existingReadme) {
    // First time - generate from scratch
    prompt = `You are a technical documentation expert. Generate a comprehensive README.md for this repository.

    IMPORTANT: Output ONLY the README content in markdown format. Do NOT include any preamble, explanations, or meta-commentary like "Here is the README" or "Based on the code". Start directly with the markdown content (# Title).

REPOSITORY STRUCTURE:
${JSON.stringify(analysis.structure, null, 2)}

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
   - Brief folder explanation


8. **Contributing**
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

The following files were modified recently. They represent only a subset of the repository.

Do NOT recompute the entire architecture from these files.
Use them only to update sections that are clearly affected.
${filesSummary}

-----

CURRENT TECH STACK:
${JSON.stringify(analysis.metadata.techStack, null, 2)}
⚠️ Update Tech Stack section if dependencies changed.

------

${depAnalysis}

${mermaidDiagram ? `UPDATED ARCHITECTURE:\n${mermaidDiagram}\n` : ''}

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

UPDATE STRATEGY:

1. **Analyze the diffs** to understand what changed:
   - Lines with '+' are additions
   - Lines with '-' are deletions
   - Focus on user-facing changes (new features, API changes, breaking changes)

2. **Update ONLY affected sections:**
   - Features (if new capabilities added)
   
3. **Preserve everything else:**
   - All custom content (badges, images, examples, links)
   - User-written descriptions and explanations
   - Architecture diagrams (unless major structural changes)
   - Contributing guidelines, License, etc.

4. **Skip update if:**
   - Changes are only bug fixes or refactoring
   - Changes are internal implementation details
   - No user-facing impact

5. **Maintain style:**
   - Keep the same tone and formatting
   - Don't change the README structure
   - Don't add unnecessary sections

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