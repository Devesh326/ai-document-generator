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

async function test( req, res) {
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
  type: 'initial' | 'update'
): Promise<string> {
  

  // Generate dependency analysis summary
  const depAnalysis = generateDependencyAnalysis(dependencyGraph, files);
  
  // Generate mermaid diagram (only if graph is reasonable size)
  // const mermaidDiagram = dependencyGraph.length < 50 
  //   ? generateMermaidGraph(dependencyGraph)
  //   : '';
  const mermaidDiagram = generateMermaidGraph(dependencyGraph);
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

6. **Usage**
   - How to run
   - Example commands

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

Rules:
- Preserve all custom sections, badges, images, and examples.
- Only update the following sections if they exist:
  - Features
  - Tech Stack
  - Architecture
  - Installation
  - Usage
  - Project Structure
- If these sections are missing, append them at the end.
- Do not rewrite the entire README.
- Do not remove user-written content.
- Do not invent features not present in the code.
- If no meaningful changes needed, return the original README unchanged
- Keep the same tone and style as the original


Architecture Update Rules:

- Treat the architecture in the existing README as the baseline.
- Only modify the architecture if the code changes clearly introduce or remove components.
- If the architecture cannot be confidently updated using the provided files, keep the existing architecture unchanged.
- Do NOT infer new architecture from incomplete file context.

EXISTING README:
${existingReadme}


RECENT CODE CHANGES (PARTIAL CONTEXT):

The following files were modified recently. They represent only a subset of the repository.

Do NOT recompute the entire architecture from these files.
Use them only to update sections that are clearly affected.
${filesSummary}

UPDATED TECH STACK:
${JSON.stringify(analysis.metadata.techStack, null, 2)}

Use the following dependency analysis to understand the system architecture.
Do not restate it unless necessary.

${depAnalysis}

${mermaidDiagram ? `UPDATED ARCHITECTURE:\n${mermaidDiagram}\n` : ''}



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
  return response?.text;
}
catch (err){
  console.log("Error in generating response from gemini", err)
}
return 'null';
}

export {test};