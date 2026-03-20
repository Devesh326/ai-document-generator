import { getFolderStructure } from "../services/fileSelector.js";
import { analyzeRepo } from "../services/analyzer.js";
import {docQueue} from "../queues/docQueue.js";
import { Octokit } from "@octokit/core";



let repoTree: any = null;

const githubRepoGet = async (_req: any, res: any) => {
  const octokit = new Octokit({})
  try {
    const response = await octokit.request(
      "GET /repos/Devesh326/contest-list-scrapper/git/trees/main?recursive=1",
      {
        owner: "Devesh326",
        repo: "contest-list-scrapper",
        tree_sha: 'sha-1',
        truncated: true,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    repoTree = response.data;
    res.json(repoTree);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "GitHub API failed" });
  }
};
// const githubRepoTopLevelGet = async (_req: any, res: any) => {
const githubRepoTopLevelGet = async (octokit: any, owner: String, repoName: String, branchRef: String) => {
    try {
    const repo = repoName, branch = branchRef 
    
    if (!owner || !repo) {
      // return res.status(400).json({ error: 'owner and repo are required' });
      console.log('owner and repo are required');
      return;      
    }
    
    // Get branch SHA
    // const branchRef = await octokit.git.getRef({
    //   owner,
    //   repo,
    //   ref: `heads/${branch}`
    // });
    
    // const commitSha = branchRef.data.object.sha;
    
    // Get tree
    const treeResponse = await octokit.request(
      `GET /repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      {
        owner,
        repo: repoName,
        tree_sha: 'sha-1',
        refs: branchRef,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );
    
    // Fetch file helper
    // console.log("just before the fetch file helper function");
    
    const fetchFile = async (pkg: any): Promise<string | null> => {
        // console.log("inside the fetch file helper function");
        
      try {
        const data = await octokit.request(`GET /repos/${owner}/${repoName}/git/blobs/${pkg.sha}`, {
            owner,
            repo: repoName,
            path:'backend',
            sha: pkg.sha,
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        })
        
        console.log("Successfully fetched file:", pkg.path);
        if (data.data.content) {
            // console.log(Buffer.from(data.data.content as string, 'base64').toString('utf-8'));
            
            
          return Buffer.from(data.data.content as string, 'base64').toString('utf-8');
        }
      } catch (err) {
        console.error(`Failed to fetch ${pkg.path}:`, err);
      }
      return null;
    };
    
    // Analyze
    console.log("before analysis");
    
    const analysis = await analyzeRepo(
      treeResponse.data.tree as any,
      fetchFile
    );
    
    // res.json({
    //   success: true,
    //   analysis
    // });
    // console.log("========= ANALYSIS =========", analysis);
    let val = JSON.stringify(analysis);
    // console.log("========= ANALYSIS STRINGIFIED =========", val);

    return analysis;
    
  } catch (error: any) {
    console.error('Analysis error:', error);
    // res.status(500).json({ 
    //   error: 'Failed to analyze repository',
    //   message: error.message 
    // });
  }
}

const fetchFileContent = async (octokit: any, owner: String, repoName: String, filePath: String): Promise<string | null> => {
  try {
    const data = await octokit.request(`GET /repos/${owner}/${repoName}/contents/${filePath}`, {
      owner,
      repo: repoName,
      path: filePath,
      headers: {
            'X-GitHub-Api-Version': '2022-11-28'
        }
    })
    return Buffer.from(data.data.content as string, 'base64').toString('utf-8');
  }
  catch (err) {
    console.log("Error fetching details for the file:", filePath);
    return null;
  }
}


const repoPathGet = async (req: any, res: any) => {
      const octokit = new Octokit({})
    try {
        let data = await octokit.request(`GET /repos/Devesh326/contest-list-scrapper/contents/backend/package.json`, {
            owner: 'Devesh326',
            repo: 'contest-list-scrapper',
            path:'backend/package.json',
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
            })
        
            res.json(data);
        // if ('content' in data && data.content) {
        //   return Buffer.from(data.content, 'base64').toString('utf-8');
        // }
      } catch (err) {
        console.error(`Failed to fetch:`, err);
      }
}

const repoTreeGet = () => {
    return repoTree;
}

const repositoryGet = async (req: any, res: any) => {

    const folderStructure = getFolderStructure();
    res.json(folderStructure);
}

const githubWebhookHandler = async (req: any, res: any) => {
  const data = req.body;
  console.log("Successfully received the push event");
  
    // need to check if the event triggered is a push event and if the branch is main, then only we will trigger the analysis
    if (data.commits && data.commits.length > 0 ) { // && data.ref === 'refs/heads/main'
      const repository = data.repository;
      const repoId = repository.id;
      const installation_id = data.installation.id;
      const commits = data.commits;
      const owner = repository.owner.name
      const repoName = repository.name;
      const afterCommitSha = data.after;
      const ref = data.ref

      await docQueue.add("generate-readme",{
        ref,
        repoId,
        owner,
        repoName,
        installation_id,
        commits,
        repository,
        afterCommitSha
      });
      console.log("added document to the queue");
      // console.log(req.body);
      
    }
    // res.status(200).send("Webhook received");
}

// const pr = await octokit.request(`POST /repos/${owner}/${repoName}/pulls`, {
//   owner,
//   repo: repoName,
//   title: 'README.md file generate',
//   body: readme,
//   head: ref,
//   base: ref,
//   headers: {
//     'X-GitHub-Api-Version': '2022-11-28'
//   }
// })

const createPullReq = async (octokit: any, owner: string, repoName: string, readme: string, ref: string, versionId: number) : Promise<any> => { 
  try {
     const baseBranch = ref.replace('refs/heads/', '');
    const pr = await octokit.createPullRequest({
    owner,
    repo: repoName,
    title: `AI Generated README v${versionId}`,
    body: `Generated by AI Documentation Bot v${versionId}`,
    base: baseBranch,
    head: "ai-doc/readme-update-v2",
    update: true,
    changes: [
      {
        files: {
          "README.md": readme
        },
        commit: `docs: add AI generated README v${versionId}`
      }
    ]
  });
console.log("PR number:", pr?.data?.number);
console.log("PR link:", pr?.data?.html_url);  
    return pr?.data;
  }
  catch (err){
    console.error('Failed to create pull request:', err);
  }
  return null;
}

const extractImports = (content: string): string[] => {
  const imports: string[] = [];
  
  // Remove comments first (they might contain fake imports)
  const withoutComments = content
    .replace(/\/\*[\s\S]*?\*\//g, '')  // Remove /* */ comments
    .replace(/\/\/.*/g, '');            // Remove // comments
  
  // ES6 imports (all variations)
  const importPatterns = [
    // import x from 'path'
    /import\s+[\w{},*\s]+\s+from\s+['"]([^'"]+)['"]/g,
    // import 'path' (side-effect import)
    /import\s+['"]([^'"]+)['"]/g,
  ];
  
  // CommonJS require
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  
  // Dynamic import
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  
  let match;
  
  // Extract from all patterns
  [...importPatterns, requireRegex, dynamicImportRegex].forEach(regex => {
    while ((match = regex.exec(withoutComments)) !== null) {
      imports.push(match[1]);
    }
  });
  
  // Deduplicate
  return [...new Set(imports)];
};


//service layer:
const generateMermaidGraph = (graph: any[]): string => {
  if (graph.length === 0) return '';
  
  // Group by top-level folders
  const byFolder: Record<string, Set<string>> = {};
  
  graph.forEach(({ from, to }) => {
    // Only include internal dependencies (starting with ./)
    if (to.startsWith('@') || !to.includes('/')) return;
    
    const folder = from.split('/')[0] || 'root';
    if (!byFolder[folder]) byFolder[folder] = new Set();
    
    byFolder[folder].add(`${simplifyPath(from)} --> ${simplifyPath(to)}`);
  });
  
  let mermaid = '```mermaid\ngraph LR\n';
  
  Object.entries(byFolder).forEach(([folder, edges]) => {
    mermaid += `  subgraph ${folder}\n`;
    edges.forEach(edge => {
      mermaid += `    ${edge}\n`;
    });
    mermaid += '  end\n';
  });
  
  mermaid += '```';
  
  return mermaid;
};

function simplifyPath(path: string): string {
  return path
    .replace(/\.(js|ts|tsx|jsx)$/, '')  // Remove extension
    .replace(/\//g, '_')                // Replace / with _
    .replace(/[^a-zA-Z0-9_]/g, '');     // Remove special chars
}

const generateDependencyAnalysis = (graph: any[], files: any[]): string => {
  if (graph.length === 0) {
    return 'No internal dependencies detected.';
  }
  
  // 1. Group by file
  const fileImports: Record<string, string[]> = {};
  
  graph.forEach(({ from, to }) => {
    if (!fileImports[from]) fileImports[from] = [];
    fileImports[from].push(to);
  });
  
  // 2. Identify key files (high degree)
  const importCounts: Record<string, number> = {};
  
  graph.forEach(({ to }) => {
    if (!to.startsWith('.')) return; // Skip external
    importCounts[to] = (importCounts[to] || 0) + 1;
  });
  
  const mostImported = Object.entries(importCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([file, count]) => `  - ${file} (imported ${count} times)`);
  
  // 3. Categorize dependencies
  const external = new Set<string>();
  const internal = new Set<string>();
  
  graph.forEach(({ to }) => {
    if (to.startsWith('.')) {
      internal.add(to);
    } else {
      external.add(to);
    }
  });
  
  // 4. Build summary
  let summary = `## Dependency Analysis\n\n`;
  summary += `**Internal Dependencies:** ${internal.size} files\n`;
  summary += `**External Packages:** ${external.size} packages\n\n`;
  
  if (mostImported.length > 0) {
    summary += `**Most Referenced Files:**\n${mostImported.join('\n')}\n\n`;
  }
  
  summary += `**External Packages Used:**\n`;
  summary += Array.from(external)
    .filter(pkg => !pkg.includes('node_modules')) // Clean packages only
    .slice(0, 10)
    .map(pkg => `  - ${pkg}`)
    .join('\n');

    console.log(summary)
  
  return summary;
};

const getChangedFilesWithContent = async (octokit: any, commit: any, owner: any, repoName: any) => {

  const map = new Map();
    const data = await octokit.request(`GET /repos/${owner}/${repoName}/commits/${commit.id}`, {
    owner: owner,
    repo: repoName,
    ref: commit.id,
    headers: {
        'X-GitHub-Api-Version': '2022-11-28',
        'Accept': 'application/vnd.github+json'
    }
    })
    // console.log(`Changed files in commit ${commit.id}:`, data.data.files.map((f: any) => f.filename));
    // console.log(data)
    // console.log(data.data.files);
    const files = data.data.files;

    files.forEach( (file:any) => map.set(file.filename, file.patch))
    
    return map;

}


export { githubRepoGet, repoTreeGet, repositoryGet, 
  githubRepoTopLevelGet, repoPathGet, githubWebhookHandler,
  fetchFileContent, createPullReq, extractImports, 
  generateMermaidGraph, generateDependencyAnalysis, 
  getChangedFilesWithContent};