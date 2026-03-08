import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";

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
  type: 'initial' | 'update'
): Promise<string> {
  

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

CODE FILES:
${filesSummary}

Generate a professional README with:
1. Project Title & Description
2. Features
3. Tech Stack
4. Installation
5. Usage
6. Project Structure
7. Contributing
8. License

Format as clean markdown.`;

  } else {
    // Update - preserve custom content, update technical sections
    prompt = `You are a technical documentation expert.

    Update the README only where necessary.

IMPORTANT: Output ONLY the updated README content in markdown format. Do NOT include any preamble, explanations, or meta-commentary like "Here is the updated README". Start directly with the markdown content (# Title).

Rules:
- Preserve all custom sections, badges, images, and examples.
- Only update the following sections if they exist:
  - Features
  - Tech Stack
  - Installation
  - Usage
  - Project Structure
- If these sections are missing, append them at the end.
- Do not rewrite the entire README.
- Do not remove user-written content.
- Do not invent features not present in the code.
- If no meaningful changes needed, return the original README unchanged
- Keep the same tone and style as the original

EXISTING README:
${existingReadme}

RECENT CODE CHANGES:
${filesSummary}

UPDATED TECH STACK:
${JSON.stringify(analysis.metadata.techStack, null, 2)}


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