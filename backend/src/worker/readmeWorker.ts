// src/workers/readmeWorker.ts

import {docQueue} from '../queues/docQueue.js';
import prisma from '../models/prisma.js';
import { createPullReq, extractImports, fetchFileContent, generateDependencyAnalysis, generateMermaidGraph, getChangedFilesWithContent, githubRepoTopLevelGet } from '../controllers/githubController.js';
import { shouldGenerateReadme } from '../services/analyzer.js';
import { generateReadme } from '../services/aiGenerator.js';
import { App } from '@octokit/app';
import { createPullRequest } from "octokit-plugin-create-pull-request";
import { Octokit } from "@octokit/core";
import pLimit from "p-limit";
import  {Worker} from 'bullmq';

const limit = pLimit(5); // const limit = pLimit(5);


const MyOctokit = Octokit.plugin(createPullRequest);

import dotenv from "dotenv";
dotenv.config();

const app = new App({
  appId: process.env.GITHUB_APP_ID!,
  privateKey: process.env.GITHUB_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  Octokit: MyOctokit,
});

async function getOctokit(installationId: number): Promise<any> {
  const octokit = await app.getInstallationOctokit(installationId);
  return octokit
}


// docQueue.process(2, async (job) => {
const worker = new Worker("doc-processing", async (job) => {
//   const { owner, repo, repoId, commitSha, installationId } = job.data;

const {ref, repoId, owner, repoName, installation_id, commits, repository, afterCommitSha } = job.data;
let isFirstTime = false;
console.log("Processing job for repo_id:", repoId);
// console.log("commits:", commits);
  
//   console.log(`\n🔄 Processing ${owner}/${repo} @ ${commitSha.substring(0, 7)}`);
//   // 1. Get or create repo record
  let repoRecord = await prisma.repo.findUnique({
    where: { github_repo_id: repoId }
  });
  const octokit = await getOctokit(installation_id);
  
  if (!repoRecord) {
    isFirstTime = true;
    repoRecord = await prisma.repo.create({
      data: {
        github_repo_id: repoId,
        owner,
        repo_name: repoName,
        installation_id: installation_id
      }
    });
  } 
//   else {
//     // Update installation_id in case it has changed
//     if (repoRecord.installation_id !== installation_id) {
//       await prisma.repo.update({
//         where: { id: repoRecord.id },
//         data: { installation_id }
//       });
//     }
//   }
  
  
//   // 2. Determine if first time or update
  const generationType = isFirstTime ? 'initial' : 'update';
  let shouldGenerate : { files: string[], value: boolean };
  
  console.log(`📊 Type: ${generationType}`);
  
  // 3. Create generation record
  const generation = await prisma.readmeGeneration.create({
    data: {
      repo: { connect: { id: repoRecord.id } },
      commit_sha: afterCommitSha,
      status: 'processing',
      type: generationType
    }
  });
  
  console.log(" generation id:  ", generation.id);
  
    // 4. Get GitHub client
    // const octokit = await getOctokit(installationId);

    console.log('📊 Analyzing repository...');

        
        try {
        const analysis = await githubRepoTopLevelGet(octokit, owner, repoName, ref);
        // const analysis = await analyzeRepo(octokit, owner, repo);
        if (!analysis) {
            //debug logs
            console.error('Analysis failed: No analysis result returned');
            throw new Error('Analysis failed');
        }

        JSON.stringify(analysis);
        

        // console.log(`✅ Selected ${analysis.selectedFiles.length} files`);


        const filesWithContent = [];
        const routerSummary = [];
        // Reading if Readme file present or not
        let existingReadmeContent = null;
    let existingReadme = null;
    try {
            existingReadme = analysis.selectedFiles.find(file =>
            /readme\.md$/i.test(file));

            if(existingReadme != null){
            const content = await fetchFileContent(octokit, owner, repoName, existingReadme);
            existingReadmeContent = content;
            content && filesWithContent.push({
                path: existingReadme,
                content: content,
                truncated: false
            });
            // console.log("=====Content======",content);
            
        }
    }
    catch(err) {
        console.log("some error to fetch if any existing Readme is present");
        
    }


    // Logic to get all the changed files
    const changedFiles = []
    
    if(isFirstTime || !existingReadme) {

        // 6. Fetch file contents
        console.log('📥 Fetching file contents...');

      // Fetch file content related to routes, endpoints, handlers, api, controllers without truncation for better analysis and documentation
      for (const filePath of analysis.selectedFiles) {
        let content = await fetchFileContent(octokit, owner, repoName, filePath);
        // if(/(routes|endpoints|handlers|api)\//i.test(filePath)){
        if(filePath.includes('routes/') || filePath.includes('endpoints/') || filePath.includes('handlers/') || filePath.includes('api/') || filePath.includes('controller/')){
          if(content){
              routerSummary.push({
                  path: filePath,
                  content: content,
                  truncated: false
              });
          }
        }
      }


        const filePromises = analysis.selectedFiles.map(filePath =>
        limit(async () => {
            const content = await fetchFileContent(octokit, owner, repoName, filePath);

            if (!content) return null;

            return {
            path: filePath,
            content: content.substring(0, 2000),
            truncated: content.length > 2000
            };
        })
        );

        const results = await Promise.all(filePromises);

        filesWithContent.push(...results.filter(Boolean));
        
        console.log(`✅ Fetched ${filesWithContent.length} files`);
    }
   else {
    // if(!isFirstTime) {
    console.log('📊 Analyzing changed files...');
    let changedFiles: string[] = [];

    // let map = new Map();

    // for( const commit of commits) {
    //     const result = await getChangedFilesWithContent(octokit, commit, owner, repoName)

    //     for (const [key, value] of result) {
    //         map.set(key, value);
    //     }
    // }

    const map = new Map();

    const results = await Promise.all(
        commits.map((commit: any) =>
            getChangedFilesWithContent(octokit, commit, owner, repoName)
        )
    );

    for (const result of results) {
        for (const [key, value] of result) {
            map.set(key, value);
        }
    }


    commits.forEach((commit: { added: string[]; modified: string[]; removed: string[] }) => {
        changedFiles = changedFiles.concat(commit.added, commit.modified, commit.removed);
    });


    console.log(`Changed files: ${changedFiles.join(', ')}`);

     shouldGenerate = shouldGenerateReadme(changedFiles)
    if (!shouldGenerate.value) {
        console.log('No significant changes detected. Skipping README generation.');
        await prisma.readmeGeneration.update({
            where: { id: generation.id },
            data: {
                status: 'skipped',
                completed_at: new Date()
            }
        });
        return;
    }
    console.log('Significant changes detected. Proceeding with README generation.');
    
    for (const filePath of shouldGenerate.files) {
        filesWithContent.push({path: filePath, 
                            content: map.get(filePath).substring(0,2000),
                            truncated: map.get(filePath).length > 2000
        })

    }
    
  }



  console.log(" files with content:", filesWithContent.map( (f: any) => f.path).join(', '));

  // filesWithContent.map(f => {
  //   console.log(`===> ${f.path} : ${f.content}`)
  // })

  const normalizePath = (fromPath: string, importPath: string): string => {
  // Skip node_modules
  if (!importPath.startsWith('.')) {
    return importPath;
  }
  
  // Resolve relative path
  const fromDir = fromPath.split('/').slice(0, -1).join('/');
  const parts = [...fromDir.split('/'), ...importPath.split('/')];
  const resolved: string[] = [];
  
  for (const part of parts) {
    if (part === '..') {
      resolved.pop();
    } else if (part !== '.') {
      resolved.push(part);
    }
  }
  
  return resolved.join('/');
};

// filesWithContent.concat(routerSummary);
// JSON.stringify(filesWithContent)
  const graph : any[] = [];
for (const file of filesWithContent) {
  if (!file) continue;
  
  const deps = extractImports(file.content);
  
  deps.forEach(dep => {
    graph.push({
      from: file.path,
      to: normalizePath(file.path, dep)
    });
  });
}

// console.log("Dependency graph:", JSON.stringify(graph, null, 2));

// const mermaidDiagram = generateMermaidGraph(graph);
// console.log(mermaidDiagram);

//   const depAnalysis = generateDependencyAnalysis(graph, filesWithContent);
//   console.log(depAnalysis);


// /*

    // 7. Check if README already exists
    
//     // 8. Generate README
    console.log('🤖 Generating README...');
    const readme = await generateReadme(
      filesWithContent,
      analysis,
      existingReadmeContent,  // Pass existing README to preserve custom content
      graph,
      generationType,
      routerSummary
    );
    // const readme = "testing readme generation";
    
    console.log('✅ README generated');

    // console.log(" Generated README content:\n", readme);

    function normalize(content: string) {
  return content
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}


if (existingReadmeContent && normalize(existingReadmeContent) === normalize(readme)) {
  console.log("README unchanged — skipping PR");
  return;
}
    
    
//     // 9. Create PR
    console.log('🔀 Creating pull request...');
    const pr = await createPullReq(
        octokit,
      owner,
      repoName,
      readme,
      ref,
      generation.id, // for api versioning
    );
    
    console.log(`✅ Created PR #${pr.number}: ${pr.html_url}`);
    
    // 10. Update records
    await prisma.readmeGeneration.update({
      where: { id: generation.id },
      data: {
        status: 'completed',
        pr_number: pr.number,
        pr_url: pr.html_url,
        completed_at: new Date()
      }
    });
    
    await prisma.repo.update({
      where: { id: repoRecord.id },
      data: {
        readme_generated: true,
        last_readme_commit: pr.merge_commit_sha
      }
    });
    
    console.log('✅ Done!\n');


    // */
    
    }catch (error: any) {
    console.error('❌ Error:', error.message);
    
    await prisma.readmeGeneration.update({
      where: { id: generation.id },
      data: {
        status: 'failed',
        completed_at: new Date()
      }
    });
    
    throw error; // Bull will retry
  }
}, {
  connection: {
    // maxRetriesPerRequest: null,
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: 6379,
    username: "default",
    password: process.env.REDIS_PASSWORD,
    tls: {}
  },
  concurrency: 3,
  lockDuration: 360000,  
  drainDelay: 10000,  
});


worker.on('completed', (job) => {
  console.log(`✅ Job completed for repo_id: ${job.data.repoId}`);
}
);

worker.on('failed', (job, err) => {
  console.error(`❌ Job failed for repo_id: ${job?.data.repoId} - ${err.message}`);
});

console.log('👷 README worker started');