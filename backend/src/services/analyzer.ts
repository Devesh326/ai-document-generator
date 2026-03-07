interface GitHubTreeItem {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

interface AnalysisResult {
  isMonorepo: boolean;
  structure: {
    backend: string[];
    frontend: string[];
    shared: string[];
  };
  selectedFiles: string[];
  metadata: {
    totalFiles: number;
    techStack: {
      backend?: string;
      frontend?: string;
      database?: string[];
    };
  };
}

export async function analyzeRepo(
  tree: GitHubTreeItem[],
  fetchFile: (path: string) => Promise<string | null>
): Promise<AnalysisResult> {
  
  const isMonorepo = detectMonorepo(tree);
  const structure = categorizeStructure(tree, isMonorepo);
  const techStack = await detectTechStack(tree, fetchFile);
  const selectedFiles = selectFiles(tree, structure, techStack);
  
  return {
    isMonorepo,
    structure,
    selectedFiles,
    metadata: {
      totalFiles: tree.filter(t => t.type === 'blob').length,
      techStack
    }
  };
}

function detectMonorepo(tree: GitHubTreeItem[]): boolean {
  const monorepoFiles = ['pnpm-workspace.yaml', 'lerna.json', 'nx.json', 'turbo.json'];
  
  if (tree.some(t => monorepoFiles.includes(t.path))) {
    return true;
  }
  
  const hasBackend = tree.some(t => t.path === 'backend');
  const hasFrontend = tree.some(t => t.path === 'frontend');
  
  if (hasBackend && hasFrontend) {
    return true;
  }
  
  const hasAppsFolder = tree.some(t => t.path.startsWith('apps/'));
  const hasPackagesFolder = tree.some(t => t.path.startsWith('packages/'));
  
  return hasAppsFolder || hasPackagesFolder;
}

function categorizeStructure(tree: GitHubTreeItem[], isMonorepo: boolean) {
  const structure = {
    backend: [] as string[],
    frontend: [] as string[],
    shared: [] as string[]
  };
  
  // if (!isMonorepo) {
  //   structure.backend.push('');
  //   return structure;
  // }
  
  const topLevelFolders = tree
    .filter(t => t.type === 'tree')
    .filter(t => !t.path.includes('/'))
    .map(t => t.path);
  
  for (const folder of topLevelFolders) {
    const category = categorizeFolderSimple(folder, tree);
    
    if (category === 'backend') {
      structure.backend.push(folder);
    } else if (category === 'frontend') {
      structure.frontend.push(folder);
    } else if (category === 'shared') {
      structure.shared.push(folder);
    }
  }
  
  return structure;
}

function categorizeFolderSimple(
  folder: string,
  tree: GitHubTreeItem[]
): 'backend' | 'frontend' | 'shared' | 'unknown' {
  
  const backendNames = ['backend', 'server', 'api', 'services', 'service'];
  const frontendNames = ['frontend', 'client', 'web', 'ui', 'app', 'www'];
  const sharedNames = ['shared', 'common', 'lib', 'libs', 'packages', 'core'];
  
  if (backendNames.includes(folder.toLowerCase())) {
    return 'backend';
  }
  
  if (frontendNames.includes(folder.toLowerCase())) {
    return 'frontend';
  }
  
  if (sharedNames.includes(folder.toLowerCase())) {
    return 'shared';
  }
  
  const filesInFolder = tree.filter(t => 
    t.path.startsWith(folder + '/') && 
    t.type === 'blob'
  );
  
  const hasBackendFiles = filesInFolder.some(f =>
    f.path.endsWith('requirements.txt') ||
    f.path.endsWith('go.mod') ||
    f.path.includes('/routes/') ||
    f.path.includes('/controllers/')
  );
  
  if (hasBackendFiles) return 'backend';
  
  const hasFrontendFiles = filesInFolder.some(f =>
    f.path.endsWith('index.html') ||
    f.path.endsWith('vite.config.js') ||
    f.path.endsWith('next.config.js') ||
    f.path.includes('/src/App.')
  );
  
  if (hasFrontendFiles) return 'frontend';
  
  return 'unknown';
}

async function detectTechStack(
  tree: GitHubTreeItem[],
  fetchFile: (pkg: any) => Promise<string | null>
) {
  const stack: any = {
    database: [],
    backendLanguage: [],
    backendFramework: [],
    frontendFramework: [],
    orm: null,
    testing: []
  };
  
  const packageJsons = tree.filter(t => t.path.endsWith('package.json'));
  
  for (const pkg of packageJsons.slice(0, 3)) {
    // console.log(pkg);
    
    const content = await fetchFile(pkg);
    if (content) {
      try {
        const parsed = JSON.parse(content);
        const deps = { ...parsed.dependencies, ...parsed.devDependencies };
        
        // Detect backend framework
        if (deps['express'] && !stack.backendFramework.includes('Express')) stack.backendFramework.push('Express');
        else if (deps['fastify'] && !stack.backendFramework.includes('Fastify')) stack.backendFramework.push('Fastify');
        else if (deps['@nestjs/core'] && !stack.backendFramework.includes('NestJS')) stack.backendFramework.push('NestJS');
        
        // Detect frontend framework
        if (deps['react'] && !stack.frontendFramework.includes('React.js')) stack.frontendFramework.push('React.js');
        else if (deps['next'] && !stack.frontendFramework.includes('Next.js')) stack.frontendFramework.push('Next.js');
        else if (deps['vue'] && !stack.frontendFramework.includes('Vue.js')) stack.frontendFramework.push('Vue.js');
        
        // Detect databases
        if (deps['mongoose'] || deps['mongodb']) stack.database.push('MongoDB');
        if (deps['pg'] || deps['postgres']) stack.database.push('PostgreSQL');
        if (deps['redis'] || deps['ioredis']) stack.database.push('Redis');

        //Detect ORMs
        if (deps['prisma'] || deps['@prisma/client']) stack.orm = 'Prisma';
        else if (deps['sequelize']) stack.orm = 'Sequelize';
        else if (deps['typeorm']) stack.orm = 'TypeORM';
        else if (deps['drizzle-orm']) stack.orm = 'Drizzle';
        else if (deps['mongoose']) stack.orm = 'Mongoose';

        // Detect testing
      if (deps['jest']) stack.testing!.push('Jest');
      if (deps['vitest']) stack.testing!.push('Vitest');
      if (deps['mocha']) stack.testing!.push('Mocha');
      if (deps['playwright']) stack.testing!.push('Playwright');
      
      // Detect language
      if (deps['typescript'] || tree.some(f => f.path.endsWith('tsconfig.json'))) {
        if(!stack.backendLanguage.includes('TypeScript')) stack.backendLanguage.push('TypeScript');
      } else {
        if (!stack.backendLanguage.includes('JavaScript')) {
          stack.backendLanguage.push('JavaScript');
        }
      }
        
      } catch {}
    }
  }
  
//   if (tree.some(t => t.path.endsWith('requirements.txt'))) {
//     if (!stack.backendLanguage.includes('Python')) stack.backendLanguage.push('Python');
//   }
  
//   if (tree.some(t => t.path.endsWith('go.mod'))) {
//     if (!stack.backendLanguage.includes('Go')) stack.backendLanguage.push('Go');
//   }

  let requirementsFile = tree.find(f => f.path.endsWith('requirements.txt') || f.path.endsWith('pyproject.toml'));
  if (requirementsFile) {
    stack.backendLanguage!.push('Python');
    
    // Detect Python framework
    const reqFile = await fetchFile(requirementsFile);
    if (reqFile) {
      if (reqFile.includes('django')) stack.backendFramework.push('Django');
      else if (reqFile.includes('flask')) stack.backendFramework.push('Flask');
      else if (reqFile.includes('fastapi')) stack.backendFramework.push('FastAPI');
      else if (reqFile.includes('selenium')) stack.backendFramework.push('Selenium');
    }
  }
  
  requirementsFile = tree.find(f => f.path.endsWith('go.mod'));
  if (requirementsFile) {
    stack.backendLanguage!.push('Go');  
    
    const goMod = await fetchFile(requirementsFile);
    if (goMod) {
      if (goMod.includes('gin-gonic/gin')) stack.backendFramework.push('Gin');
      else if (goMod.includes('gofiber/fiber')) stack.backendFramework.push('Fiber');
      else if (goMod.includes('echo')) stack.backendFramework.push('Echo');
    }
  }
  
  requirementsFile = tree.find(f => f.path.endsWith('Cargo.toml'));
  if (requirementsFile) {
    stack.backendLanguage!.push('Rust');
  }
  
  requirementsFile = tree.find(f => f.path.endsWith('pom.xml') || f.path.endsWith('build.gradle'));
  if (requirementsFile) {
    stack.backendLanguage!.push('Java');
    stack.buildTool = requirementsFile.path === 'pom.xml' ? 'Maven' : 'Gradle';
  }
  
  return stack;
}

function selectFiles(
  tree: GitHubTreeItem[],
  structure: any,
  techStack: any
): string[] {
  const selected: string[] = [];
  const maxFiles = 50;
  
  const rootConfigs = tree
    .filter(t => t.type === 'blob' && !t.path.includes('/'))
    .filter(t => 
      t.path === 'package.json' ||
      t.path === 'README.md' ||
      t.path === 'docker-compose.yml'
    )
    .map(t => t.path);
  
  selected.push(...rootConfigs);
  
  for (const backendFolder of structure.backend) {
    const prefix = backendFolder ? backendFolder + '/' : '';
    const backendFiles = tree.filter(t => 
      t.type === 'blob' && 
      t.path.startsWith(prefix)
    );
    
    const configs = backendFiles.filter(f =>
      f.path === `${prefix}package.json` ||
      f.path === `${prefix}Dockerfile` ||
      f.path === `${prefix}requirements.txt` ||
      f.path === `${prefix}go.mod`
    ).map(f => f.path);
    
    selected.push(...configs);
    
    const entries = backendFiles.filter(f =>
      f.path.match(new RegExp(`${prefix}(index|app|server|main)\\.(js|ts|py|go)$`))
    ).slice(0, 2).map(f => f.path);
    
    selected.push(...entries);
    
    const keyFolders = ['routes', 'controllers', 'services', 'models', 'config'];
    
    for (const folder of keyFolders) {
      const folderFiles = backendFiles.filter(f =>
        f.path.includes(`/${folder}/`) &&
        (f.path.endsWith('.js') || f.path.endsWith('.ts') || f.path.endsWith('.py'))
      ).slice(0, 2).map(f => f.path);
      
      selected.push(...folderFiles);
    }
  }
  
  for (const frontendFolder of structure.frontend) {
    const prefix = frontendFolder + '/';
    const frontendFiles = tree.filter(t => 
      t.type === 'blob' && 
      t.path.startsWith(prefix)
    );
    
    const configs = frontendFiles.filter(f =>
      f.path === `${prefix}package.json` ||
      f.path === `${prefix}vite.config.js` ||
      f.path === `${prefix}vite.config.ts` ||
      f.path === `${prefix}next.config.js` ||
      f.path === `${prefix}tsconfig.json`
    ).map(f => f.path);
    
    selected.push(...configs);
    
    const entry = frontendFiles.find(f =>
      f.path.endsWith('/src/App.tsx') ||
      f.path.endsWith('/src/App.jsx') ||
      f.path.endsWith('/src/main.tsx')
    );
    
    if (entry) selected.push(entry.path);
  }
  
  const unique = [...new Set(selected)];
  return unique.slice(0, maxFiles);
}

export function shouldGenerateReadme(changedFiles: string[]): {files: string[]; value: boolean} {
  
  // Skip if only these files changed
  const trivialPatterns = [
    /\.md$/,           // Markdown files
    /\.txt$/,          // Text files
    /LICENSE/,         // License
    /\.github\//,      // GitHub configs
    /\.vscode\//,      // Editor configs
    /\.idea\//,        // IDE configs
    /\.gitignore/,     // Git ignore
  ];
  
  const meaningfulChanges = changedFiles.filter(file => 
    !trivialPatterns.some(pattern => pattern.test(file))
  );
  
  if (meaningfulChanges.length === 0) {
    console.log('⏭️  Skipping: No meaningful code changes');
    return {files: [], value: false};
  }
  
  // Generate if:
  // - package.json changed (tech stack)
  // - New files added in key folders (routes, services, models)
  // - Entry points modified (app.js, index.ts)
  // - Dockerfile or requirements.txt changed (deployment)
  // - go.mod changed (Go projects)
  // - New folders are added
  
  const significantPatterns = [

  // Dependency / package managers
  /package\.json$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /requirements\.txt$/,
  /Pipfile$/,
  /Pipfile\.lock$/,
  /go\.mod$/,
  /go\.sum$/,
  /pom\.xml$/,
  /build\.gradle$/,
  /settings\.gradle$/,
  /Gemfile$/,
  /Gemfile\.lock$/,
  /composer\.json$/,
  /composer\.lock$/,
  /Cargo\.toml$/,
  /Cargo\.lock$/,

  // Entry point files
  /(index|app|server|main)\.(js|ts|py|go|java|rb)$/,

  // Core backend directories
  /(routes|services|models|controllers|handlers|middleware)\/.+\.(js|ts|py|go|java|rb)$/,

  // Source directories
  /(src|cmd|internal|pkg|lib|app)\/.+\.(js|ts|py|go|java|rb)$/,

  // Infrastructure / container
  /Dockerfile$/,
  /docker-compose\.yml$/,
  /docker-compose\.yaml$/,
  /\.github\/workflows\/.+\.yml$/,

  // Config files
  /config\/.+\.(js|ts|json|yaml|yml)$/,

];
  
  const hasSignificantChanges = meaningfulChanges.filter(file =>
    significantPatterns.some(pattern => pattern.test(file))
  );
  
  if (hasSignificantChanges.length === 0) {
    console.log('⏭️  Skipping: Changes not significant enough');
    return {files: [], value: false};
  }
  
  return {files: hasSignificantChanges, value: true};
}
