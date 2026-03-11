// src/workers/readmeWorker.ts

import {docQueue} from '../queues/docQueue.js';
import prisma from '../models/prisma.js';
import { createPullReq, extractImports, fetchFileContent, generateDependencyAnalysis, generateMermaidGraph, githubRepoTopLevelGet } from '../controllers/githubController.js';
import { shouldGenerateReadme } from '../services/analyzer.js';
import { generateReadme } from '../services/aiGenerator.js';
import fs from 'fs';
import { App } from '@octokit/app';
import { createPullRequest } from "octokit-plugin-create-pull-request";
import { Octokit } from "@octokit/core";


const MyOctokit = Octokit.plugin(createPullRequest);

import dotenv from "dotenv";
dotenv.config();

const app = new App({
  appId: process.env.GITHUB_APP_ID!,
  privateKey: fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH!, 'utf8'),
  Octokit: MyOctokit,
});

async function getOctokit(installationId: number): Promise<any> {
  const octokit = await app.getInstallationOctokit(installationId);
  return octokit
}


// import { getOctokit } from '../services/github';
// import { analyzeRepo } from '../analyzer';
// import { generateReadme } from '../services/llm';
// import { createPullRequest } from '../services/github';

docQueue.process(async (job) => {
//   const { owner, repo, repoId, commitSha, installationId } = job.data;

const {ref, repoId, owner, repoName, installation_id, commits, repository, afterCommitSha } = job.data;
let isFirstTime = false;
console.log("Processing job for repo_id:", repoId);
console.log("commits:", commits);
  
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
    console.log("==========HERE==========");
    
    
    // 5. Analyze repo (same logic for both first time and update)
    // first time, complete analysis
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
        

        console.log(`✅ Selected ${analysis.selectedFiles.length} files`);


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

    // for (const filePath of analysis.selectedFiles) {
    //     // if path is routes, endpoints, handlers, or api, then we put entire content to it.
    //         let content = await fetchFileContent(octokit, owner, repoName, filePath);
    //         // if(/(routes|endpoints|handlers|api)\//i.test(filePath)){

    //         if(filePath.includes('routes/') || filePath.includes('endpoints/') || filePath.includes('handlers/') || filePath.includes('api/')){
    //             console.log(`=====Content for ${filePath} ======`,content);
    //             if(content){
    //                 routerSummary.push({
    //                     path: filePath,
    //                     content: content,
    //                     truncated: false
    //                 });
    //             }
    //         }
    // }
    
    if(isFirstTime || !existingReadme) {

        // 6. Fetch file contents
        console.log('📥 Fetching file contents...');

        
        for (const filePath of analysis.selectedFiles) {
            
            let content = await fetchFileContent(octokit, owner, repoName, filePath);
            if (content) {
                filesWithContent.push({
                path: filePath,
                // content: content.split('\n').slice(0,200).join('\n'),
                content: content.substring(0, 2000),
                truncated: content.length > 2000
                });
            }
        }
        
        console.log(`✅ Fetched ${filesWithContent.length} files`);
    }
   else {
    // if(!isFirstTime) {
    console.log('📊 Analyzing changed files...');
    let changedFiles: string[] = [];

    commits.forEach(async (commit : any) => {
        const data = await octokit.request(`GET /repos/${owner}/${repoName}/commits/${commit.id}`, {
        owner: owner,
        repo: repoName,
        ref: commit.id,
        headers: {
            'X-GitHub-Api-Version': '2022-11-28',
            'Accept': 'application/vnd.github+json'
        }
        })
        console.log(`Changed files in commit ${commit.id}:`, data.data.files.map((f: any) => f.filename));
        console.log(data)
        console.log(data.data.files);
        
    })


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
        const content = await fetchFileContent(octokit, owner, repoName, filePath);
        if (content) {
            filesWithContent.push({
                path: filePath,
                content: content.substring(0, 2000),
                truncated: content.length > 2000
            });
        }
    }
    
  }

  console.log(" files with content:", filesWithContent.map(f => f.path).join(', '));
  

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
  const deps = extractImports(file.content);
  
  deps.forEach(dep => {
    graph.push({
      from: file.path,
      to: normalizePath(file.path, dep)
    });
  });
}

console.log("Dependency graph:", JSON.stringify(graph, null, 2));

const mermaidDiagram = generateMermaidGraph(graph);
console.log(mermaidDiagram);

  const depAnalysis = generateDependencyAnalysis(graph, filesWithContent);
  console.log(depAnalysis);


/*

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


    */
    
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
});


docQueue.on('completed', (job) => {
  console.log(`✅ Job completed for repo_id: ${job.data.repoId}`);
}
);

docQueue.on('failed', (job, err) => {
  console.error(`❌ Job failed for repo_id: ${job.data.repoId} - ${err.message}`);
});

console.log('👷 README worker started');