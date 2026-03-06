import { Octokit } from "@octokit/core";
import { getFolderStructure } from "../services/fileSelector.js";
import { analyzeRepo } from "../services/analyzer.js";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});


let repoTree: any = null;

const githubRepoGet = async (_req: any, res: any) => {
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

const githubRepoTopLevelGet = async (_req: any, res: any) => {
    try {
    const owner = 'Devesh326', repo = 'contest-list-scrapper', branch = 'main' 
    
    if (!owner || !repo) {
      return res.status(400).json({ error: 'owner and repo are required' });
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
    
    // Fetch file helper
    console.log("just before the fetch file helper function");
    
    const fetchFile = async (pkg: any): Promise<string | null> => {
        console.log("inside the fetch file helper function");
        
      try {
        const data = await octokit.request(`GET /repos/Devesh326/contest-list-scrapper/git/blobs/${pkg.sha}`, {
            owner: 'Devesh326',
            repo: 'contest-list-scrapper',
            path:'backend',
            sha: pkg.sha,
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        })
        
        console.log("Successfully fetched file:", pkg.path);
        if (data.data.content) {
            console.log(Buffer.from(data.data.content as string, 'base64').toString('utf-8'));
            
            
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
    
    res.json({
      success: true,
      analysis
    });
    
  } catch (error: any) {
    console.error('Analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze repository',
      message: error.message 
    });
  }
}

const repoPathGet = async (req, res) => {
    try {
        let data = await octokit.request(`GET /repos/Devesh326/contest-list-scrapper/git/blobs/26783bdfdfc8d12b0461cd150c1387d8b1d26023`, {
            owner: 'Devesh326',
            repo: 'contest-list-scrapper',
            path:'backend',
            // sha: '26783bdfdfc8d12b0461cd150c1387d8b1d26023',
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

const repositoryGet = async (req, res) => {

    const folderStructure = getFolderStructure();
    res.json(folderStructure);
}

const githubWebhookHandler = async (req: any, res: any) => {
    console.log("Received GitHub webhook:", req.body);
    res.status(200).send("Webhook received");
}

export { githubRepoGet, repoTreeGet, repositoryGet, githubRepoTopLevelGet, repoPathGet, githubWebhookHandler };