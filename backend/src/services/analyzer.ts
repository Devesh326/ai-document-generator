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
    mobile: string[];
    shared: string[];
  };
  selectedFiles: string[];
  metadata: {
    totalFiles: number;
    techStack: {
      backend?: string;
      frontend?: string;
      mobile?: string;
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

// ============================================================================
// MONOREPO DETECTION - Enhanced with flexible matching
// ============================================================================

function detectMonorepo(tree: GitHubTreeItem[]): boolean {
  // Check for monorepo config files
  const monorepoFiles = [
    'pnpm-workspace.yaml', 
    'lerna.json', 
    'nx.json', 
    'turbo.json',
    'rush.json',
    'workspace.json'
  ];
  
  if (tree.some(t => monorepoFiles.includes(t.path))) {
    return true;
  }
  
  // ========================================
  // Multiple dependency files in DIFFERENT directories
  // ========================================
  
  const excludedDirs = ['examples', 'docs', 'test', 'tests', '.github', 'scripts', 'tools'];
  
  const getUniqueDirs = (filename: string): number => {
    const dirs = tree
      .filter(t => t.path.endsWith(filename))
      .map(t => t.path.split('/').slice(0, -1).join('/'))
      .filter(dir => dir !== '')
      .filter(dir => {
        const topLevel = dir.split('/')[0];
        return !excludedDirs.includes(topLevel);
      });
    
    return new Set(dirs).size;
  };
  
  if (getUniqueDirs('package.json') >= 2) return true;
  if (getUniqueDirs('requirements.txt') >= 2) return true;
  if (getUniqueDirs('go.mod') >= 2) return true;
  if (getUniqueDirs('Cargo.toml') >= 2) return true;
  
  // ========================================
  // Flexible folder matching (top-level)
  // ========================================
  
  const topLevelFolders = tree
    .filter(t => t.type === 'tree')
    .filter(t => !t.path.includes('/'))
    .map(t => t.path.toLowerCase());
  
  const hasBackend = topLevelFolders.some(folder =>
    /^(backend|server|api)/.test(folder) ||
    /-(backend|server|api)$/.test(folder) ||
    /^(backend|server|api|services)$/.test(folder)
  );
  
  const hasFrontend = topLevelFolders.some(folder =>
    /^(frontend|client|web|ui)/.test(folder) ||
    /-(frontend|client|web|ui)$/.test(folder) ||
    /^(webapp|website|portal|dashboard)/.test(folder)
  );
  
  const hasMobile = topLevelFolders.some(folder =>
    /^(mobile|android|ios)/.test(folder) ||
    /-(mobile)$/.test(folder)
  );
  
  // Check nested src structure
  const nestedFolders = tree
    .filter(t => t.type === 'tree')
    .filter(t => t.path.startsWith('src/') && t.path.split('/').length === 2)
    .map(t => t.path.split('/')[1].toLowerCase());
  
  const hasNestedBackend = nestedFolders.some(folder =>
    /^(backend|server|api)/.test(folder)
  );
  
  const hasNestedFrontend = nestedFolders.some(folder =>
    /^(frontend|client|web)/.test(folder)
  );
  
  const hasNestedMobile = nestedFolders.some(folder =>
    /^(mobile|android|ios)/.test(folder)
  );
  
  const backendExists = hasBackend || hasNestedBackend;
  const frontendExists = hasFrontend || hasNestedFrontend;
  const mobileExists = hasMobile || hasNestedMobile || tree.some(t =>
    t.path.endsWith('AndroidManifest.xml') ||
    t.path.endsWith('Info.plist') ||
    t.path.endsWith('pubspec.yaml')
  );
  
  if ((backendExists && frontendExists) || 
      (backendExists && mobileExists) || 
      (frontendExists && mobileExists)) {
    return true;
  }
  
  // ========================================
  // Workspace-style folders
  // ========================================
  
  const hasAppsFolder = tree.some(t => t.path.startsWith('apps/') && t.type === 'tree');
  const hasPackagesFolder = tree.some(t => t.path.startsWith('packages/') && t.type === 'tree');
  const hasServicesFolder = tree.some(t => t.path.startsWith('services/') && t.type === 'tree');
  const hasModulesFolder = tree.some(t => t.path.startsWith('modules/') && t.type === 'tree');
  
  return hasAppsFolder || hasPackagesFolder || hasServicesFolder || hasModulesFolder;
}

// ============================================================================
// STRUCTURE CATEGORIZATION - Enhanced for mobile, nested structures
// ============================================================================

function categorizeStructure(tree: GitHubTreeItem[], isMonorepo: boolean) {
  const structure = {
    backend: [] as string[],
    frontend: [] as string[],
    mobile: [] as string[],
    shared: [] as string[]
  };
  
  // Get top-level folders
  const topLevelFolders = tree
    .filter(t => t.type === 'tree')
    .filter(t => !t.path.includes('/'))
    .map(t => t.path);
  
  // Check for nested src structure (e.g., src/backend, src/frontend)
  const hasSrcFolder = topLevelFolders.includes('src');
  if (hasSrcFolder) {
    const srcSubfolders = tree
      .filter(t => t.type === 'tree')
      .filter(t => t.path.startsWith('src/') && !t.path.substring(4).includes('/'))
      .map(t => t.path);
    
    for (const folder of srcSubfolders) {
      const category = categorizeFolderComprehensive(folder, tree);
      if (category === 'backend') structure.backend.push(folder);
      else if (category === 'frontend') structure.frontend.push(folder);
      else if (category === 'mobile') structure.mobile.push(folder);
      else if (category === 'shared') structure.shared.push(folder);
    }
  }
  
  // Check apps/ and packages/ folders (Nx, Turborepo pattern)
  const workspaceFolders = ['apps', 'packages', 'services', 'modules'];
  for (const workspace of workspaceFolders) {
    if (!topLevelFolders.includes(workspace)) continue;
    
    const subfolders = tree
      .filter(t => t.type === 'tree')
      .filter(t => t.path.startsWith(`${workspace}/`) && !t.path.substring(workspace.length + 1).includes('/'))
      .map(t => t.path);
    
    for (const folder of subfolders) {
      const category = categorizeFolderComprehensive(folder, tree);
      if (category === 'backend') structure.backend.push(folder);
      else if (category === 'frontend') structure.frontend.push(folder);
      else if (category === 'mobile') structure.mobile.push(folder);
      else if (category === 'shared') structure.shared.push(folder);
    }
  }
  
  // Regular top-level folders
  for (const folder of topLevelFolders) {
    if (folder === 'src' || workspaceFolders.includes(folder)) continue;
    
    const category = categorizeFolderComprehensive(folder, tree);
    
    if (category === 'backend') {
      structure.backend.push(folder);
    } else if (category === 'frontend') {
      structure.frontend.push(folder);
    } else if (category === 'mobile') {
      structure.mobile.push(folder);
    } else if (category === 'shared') {
      structure.shared.push(folder);
    }
  }
  
  // Don't invent structure for flat projects - leave arrays empty
  
  return structure;
}

// ============================================================================
// COMPREHENSIVE FOLDER CATEGORIZATION - With flexible matching
// ============================================================================

function categorizeFolderComprehensive(
  folder: string,
  tree: GitHubTreeItem[]
): 'backend' | 'frontend' | 'mobile' | 'shared' | 'unknown' {
  
  const folderName = folder.split('/').pop()!.toLowerCase();
  
  // Backend patterns (flexible regex matching)
  if (/^(backend|server|api)/.test(folderName) || 
      /-(backend|server|api)$/.test(folderName) ||
      /^(backend|server|api|services)$/.test(folderName)) {
    return 'backend';
  }
  
  // DDD/Clean Architecture patterns
  if (/^(domain|application|infrastructure|cmd|internal|pkg)$/.test(folderName)) {
    return 'backend';
  }
  
  // Frontend patterns
  if (/^(frontend|client|web|ui)/.test(folderName) || 
      /-(frontend|client|web|ui)$/.test(folderName) ||
      /^(webapp|website|portal|dashboard)/.test(folderName)) {
    return 'frontend';
  }
  
  // Mobile patterns
  if (/^(mobile|android|ios|flutter|native)/.test(folderName) || 
      /-(mobile)$/.test(folderName) ||
      /react-native|rn/.test(folderName)) {
    return 'mobile';
  }
  
  // Shared patterns
  if (/^(shared|common|lib|libs|utils|helpers|types|models|constants|core)/.test(folderName)) {
    return 'shared';
  }
  
  // Analyze files inside folder
  const filesInFolder = tree.filter(t => 
    t.path.startsWith(folder + '/') && 
    t.type === 'blob'
  );
  
  // Backend indicators
  const hasBackendFiles = filesInFolder.some(f =>
    // Config files
    f.path.endsWith('requirements.txt') ||
    f.path.endsWith('go.mod') ||
    f.path.endsWith('pom.xml') ||
    f.path.endsWith('build.gradle') ||
    f.path.endsWith('Gemfile') ||
    f.path.endsWith('Cargo.toml') ||
    f.path.endsWith('composer.json') ||
    // Backend folders
    f.path.includes('/routes/') ||
    f.path.includes('/controllers/') ||
    f.path.includes('/models/') ||
    f.path.includes('/services/') ||
    f.path.includes('/repositories/') ||
    f.path.includes('/handlers/') ||
    f.path.includes('/middleware/') ||
    f.path.includes('/dto/') ||
    f.path.includes('/entities/') ||
    // Spring Boot
    f.path.includes('/src/main/java/') ||
    // Django
    f.path.endsWith('settings.py') ||
    f.path.endsWith('wsgi.py') ||
    // Laravel
    f.path.includes('/app/Http/') ||
    f.path.endsWith('artisan') ||
    // Rails
    f.path.endsWith('Rakefile') ||
    f.path.includes('/app/controllers/')
  );
  
  if (hasBackendFiles) return 'backend';
  
  // Frontend indicators
  const hasFrontendFiles = filesInFolder.some(f =>
    // HTML/Config
    f.path.endsWith('index.html') ||
    f.path.endsWith('vite.config.js') ||
    f.path.endsWith('vite.config.ts') ||
    f.path.endsWith('next.config.js') ||
    f.path.endsWith('nuxt.config.js') ||
    f.path.endsWith('angular.json') ||
    f.path.endsWith('svelte.config.js') ||
    f.path.endsWith('astro.config.mjs') ||
    f.path.endsWith('vue.config.js') ||
    // Frontend folders
    f.path.includes('/components/') ||
    f.path.includes('/pages/') ||
    f.path.includes('/views/') ||
    f.path.includes('/layouts/') ||
    f.path.includes('/public/') ||
    f.path.includes('/static/') ||
    // React/Vue specific
    f.path.endsWith('/src/App.tsx') ||
    f.path.endsWith('/src/App.jsx') ||
    f.path.endsWith('/src/App.vue') ||
    f.path.endsWith('/src/main.tsx') ||
    f.path.endsWith('/src/main.ts')
  );
  
  if (hasFrontendFiles) return 'frontend';
  
  // Mobile indicators
  const hasMobileFiles = filesInFolder.some(f =>
    // Android
    f.path.endsWith('AndroidManifest.xml') ||
    f.path.includes('/app/src/main/java/') ||
    f.path.endsWith('build.gradle') ||
    f.path.endsWith('settings.gradle') ||
    // iOS
    f.path.endsWith('Info.plist') ||
    f.path.endsWith('Podfile') ||
    f.path.includes('.xcodeproj/') ||
    f.path.includes('.xcworkspace/') ||
    // Flutter
    f.path.endsWith('pubspec.yaml') ||
    f.path.includes('/lib/main.dart') ||
    // React Native
    f.path.endsWith('app.json') ||
    f.path.endsWith('metro.config.js') ||
    f.path.includes('/android/app/') ||
    f.path.includes('/ios/')
  );
  
  if (hasMobileFiles) return 'mobile';
  
  return 'unknown';
}

// ============================================================================
// TECH STACK DETECTION - Comprehensive
// ============================================================================

async function detectTechStack(
  tree: GitHubTreeItem[],
  fetchFile: (pkg: any) => Promise<string | null>
) {
  const stack: any = {
    database: [],
    backendLanguage: [],
    backendFramework: [],
    frontendFramework: [],
    mobileFramework: [],
    orm: null,
    testing: [],
    buildTool: null
  };
  
  // =======================
  // Node.js / JavaScript / TypeScript
  // =======================
  const packageJsons = tree.filter(t => t.path.endsWith('package.json'));
  
  for (const pkg of packageJsons.slice(0, 5)) {
    const content = await fetchFile(pkg);
    if (content) {
      try {
        const parsed = JSON.parse(content);
        const deps = { ...parsed.dependencies, ...parsed.devDependencies };
        
        // Backend frameworks
        if (deps['express'] && !stack.backendFramework.includes('Express')) stack.backendFramework.push('Express');
        if (deps['fastify'] && !stack.backendFramework.includes('Fastify')) stack.backendFramework.push('Fastify');
        if (deps['@nestjs/core'] && !stack.backendFramework.includes('NestJS')) stack.backendFramework.push('NestJS');
        if (deps['koa'] && !stack.backendFramework.includes('Koa')) stack.backendFramework.push('Koa');
        if (deps['hapi'] && !stack.backendFramework.includes('Hapi')) stack.backendFramework.push('Hapi');
        
        // Frontend frameworks
        if (deps['react'] && !stack.frontendFramework.includes('React')) stack.frontendFramework.push('React');
        if (deps['next'] && !stack.frontendFramework.includes('Next.js')) stack.frontendFramework.push('Next.js');
        if (deps['vue'] && !stack.frontendFramework.includes('Vue.js')) stack.frontendFramework.push('Vue.js');
        if (deps['nuxt'] && !stack.frontendFramework.includes('Nuxt.js')) stack.frontendFramework.push('Nuxt.js');
        if (deps['@angular/core'] && !stack.frontendFramework.includes('Angular')) stack.frontendFramework.push('Angular');
        if (deps['svelte'] && !stack.frontendFramework.includes('Svelte')) stack.frontendFramework.push('Svelte');
        if (deps['astro'] && !stack.frontendFramework.includes('Astro')) stack.frontendFramework.push('Astro');
        
        // Mobile frameworks
        if (deps['react-native'] && !stack.mobileFramework.includes('React Native')) stack.mobileFramework.push('React Native');
        if (deps['expo'] && !stack.mobileFramework.includes('Expo')) stack.mobileFramework.push('Expo');
        if (deps['@capacitor/core'] && !stack.mobileFramework.includes('Capacitor')) stack.mobileFramework.push('Capacitor');
        if (deps['@ionic/angular'] && !stack.mobileFramework.includes('Ionic')) stack.mobileFramework.push('Ionic');
        
        // Databases
        if (deps['mongodb'] || deps['mongoose']) {
          if (!stack.database.includes('MongoDB')) stack.database.push('MongoDB');
        }
        if (deps['pg'] || deps['postgres']) {
          if (!stack.database.includes('PostgreSQL')) stack.database.push('PostgreSQL');
        }
        if (deps['mysql'] || deps['mysql2']) {
          if (!stack.database.includes('MySQL')) stack.database.push('MySQL');
        }
        if (deps['redis'] || deps['ioredis']) {
          if (!stack.database.includes('Redis')) stack.database.push('Redis');
        }
        if (deps['sqlite3'] || deps['better-sqlite3']) {
          if (!stack.database.includes('SQLite')) stack.database.push('SQLite');
        }
        
        // ORMs
        if (deps['prisma'] || deps['@prisma/client']) stack.orm = 'Prisma';
        else if (deps['sequelize']) stack.orm = 'Sequelize';
        else if (deps['typeorm']) stack.orm = 'TypeORM';
        else if (deps['drizzle-orm']) stack.orm = 'Drizzle';
        else if (deps['mongoose']) stack.orm = 'Mongoose';
        else if (deps['knex']) stack.orm = 'Knex.js';
        
        // Testing
        if (deps['jest'] && !stack.testing.includes('Jest')) stack.testing.push('Jest');
        if (deps['vitest'] && !stack.testing.includes('Vitest')) stack.testing.push('Vitest');
        if (deps['mocha'] && !stack.testing.includes('Mocha')) stack.testing.push('Mocha');
        if (deps['playwright'] && !stack.testing.includes('Playwright')) stack.testing.push('Playwright');
        if (deps['cypress'] && !stack.testing.includes('Cypress')) stack.testing.push('Cypress');
        
        // Language detection
        if (deps['typescript'] || tree.some(f => f.path.endsWith('tsconfig.json'))) {
          if (!stack.backendLanguage.includes('TypeScript')) stack.backendLanguage.push('TypeScript');
        } else {
          if (!stack.backendLanguage.includes('JavaScript')) stack.backendLanguage.push('JavaScript');
        }
        
      } catch {}
    }
  }
  
  // =======================
  // Python
  // =======================
  let pythonFile = tree.find(f => 
    f.path.endsWith('requirements.txt') || 
    f.path.endsWith('pyproject.toml') ||
    f.path.endsWith('Pipfile')
  );
  
  if (pythonFile) {
    if (!stack.backendLanguage.includes('Python')) stack.backendLanguage.push('Python');
    
    const content = await fetchFile(pythonFile);
    if (content) {
      // Frameworks
      if (/django/i.test(content) && !stack.backendFramework.includes('Django')) stack.backendFramework.push('Django');
      if (/flask/i.test(content) && !stack.backendFramework.includes('Flask')) stack.backendFramework.push('Flask');
      if (/fastapi/i.test(content) && !stack.backendFramework.includes('FastAPI')) stack.backendFramework.push('FastAPI');
      if (/tornado/i.test(content) && !stack.backendFramework.includes('Tornado')) stack.backendFramework.push('Tornado');
      if (/sanic/i.test(content) && !stack.backendFramework.includes('Sanic')) stack.backendFramework.push('Sanic');
      
      // Databases/ORMs
      if (/sqlalchemy/i.test(content)) {
        if (!stack.orm) stack.orm = 'SQLAlchemy';
        if (!stack.database.includes('SQL')) stack.database.push('SQL');
      }
      if (/psycopg/i.test(content) && !stack.database.includes('PostgreSQL')) stack.database.push('PostgreSQL');
      if (/pymongo/i.test(content) && !stack.database.includes('MongoDB')) stack.database.push('MongoDB');
      
      // Testing
      if (/pytest/i.test(content) && !stack.testing.includes('pytest')) stack.testing.push('pytest');
      if (/selenium/i.test(content) && !stack.testing.includes('Selenium')) stack.testing.push('Selenium');
    }
  }
  
  // =======================
  // Go
  // =======================
  let goModFile = tree.find(f => f.path.endsWith('go.mod'));
  if (goModFile) {
    if (!stack.backendLanguage.includes('Go')) stack.backendLanguage.push('Go');
    
    const content = await fetchFile(goModFile);
    if (content) {
      if (/gin-gonic\/gin/i.test(content) && !stack.backendFramework.includes('Gin')) stack.backendFramework.push('Gin');
      if (/gofiber\/fiber/i.test(content) && !stack.backendFramework.includes('Fiber')) stack.backendFramework.push('Fiber');
      if (/labstack\/echo/i.test(content) && !stack.backendFramework.includes('Echo')) stack.backendFramework.push('Echo');
      if (/gorilla\/mux/i.test(content) && !stack.backendFramework.includes('Gorilla Mux')) stack.backendFramework.push('Gorilla Mux');
      
      // Databases
      if (/gorm/i.test(content)) {
        if (!stack.orm) stack.orm = 'GORM';
      }
      if (/lib\/pq/i.test(content) && !stack.database.includes('PostgreSQL')) stack.database.push('PostgreSQL');
      if (/go-sql-driver\/mysql/i.test(content) && !stack.database.includes('MySQL')) stack.database.push('MySQL');
      if (/go-redis\/redis/i.test(content) && !stack.database.includes('Redis')) stack.database.push('Redis');
    }
  }
  
  // =======================
  // Java (Spring Boot, etc.)
  // =======================
  let javaFile = tree.find(f => f.path.endsWith('pom.xml') || f.path.endsWith('build.gradle'));
  if (javaFile) {
    if (!stack.backendLanguage.includes('Java')) stack.backendLanguage.push('Java');
    stack.buildTool = javaFile.path.endsWith('pom.xml') ? 'Maven' : 'Gradle';
    
    const content = await fetchFile(javaFile);
    if (content) {
      if (/spring-boot/i.test(content) && !stack.backendFramework.includes('Spring Boot')) stack.backendFramework.push('Spring Boot');
      if (/micronaut/i.test(content) && !stack.backendFramework.includes('Micronaut')) stack.backendFramework.push('Micronaut');
      if (/quarkus/i.test(content) && !stack.backendFramework.includes('Quarkus')) stack.backendFramework.push('Quarkus');
      
      // Databases
      if (/hibernate/i.test(content)) stack.orm = 'Hibernate';
      if (/postgresql/i.test(content) && !stack.database.includes('PostgreSQL')) stack.database.push('PostgreSQL');
      if (/mysql/i.test(content) && !stack.database.includes('MySQL')) stack.database.push('MySQL');
      if (/mongodb/i.test(content) && !stack.database.includes('MongoDB')) stack.database.push('MongoDB');
      
      // Testing
      if (/junit/i.test(content) && !stack.testing.includes('JUnit')) stack.testing.push('JUnit');
      if (/mockito/i.test(content) && !stack.testing.includes('Mockito')) stack.testing.push('Mockito');
    }
  }
  
  // =======================
  // Rust
  // =======================
  let cargoFile = tree.find(f => f.path.endsWith('Cargo.toml'));
  if (cargoFile) {
    if (!stack.backendLanguage.includes('Rust')) stack.backendLanguage.push('Rust');
    
    const content = await fetchFile(cargoFile);
    if (content) {
      if (/actix-web/i.test(content) && !stack.backendFramework.includes('Actix')) stack.backendFramework.push('Actix');
      if (/rocket/i.test(content) && !stack.backendFramework.includes('Rocket')) stack.backendFramework.push('Rocket');
      if (/axum/i.test(content) && !stack.backendFramework.includes('Axum')) stack.backendFramework.push('Axum');
      
      // Databases
      if (/diesel/i.test(content)) stack.orm = 'Diesel';
      if (/sqlx/i.test(content) && !stack.orm) stack.orm = 'SQLx';
    }
  }
  
  // =======================
  // Ruby (Rails)
  // =======================
  let gemfile = tree.find(f => f.path.endsWith('Gemfile'));
  if (gemfile) {
    if (!stack.backendLanguage.includes('Ruby')) stack.backendLanguage.push('Ruby');
    
    const content = await fetchFile(gemfile);
    if (content) {
      if (/rails/i.test(content) && !stack.backendFramework.includes('Ruby on Rails')) stack.backendFramework.push('Ruby on Rails');
      if (/sinatra/i.test(content) && !stack.backendFramework.includes('Sinatra')) stack.backendFramework.push('Sinatra');
      
      // Databases
      if (/pg/i.test(content) && !stack.database.includes('PostgreSQL')) stack.database.push('PostgreSQL');
      if (/mysql/i.test(content) && !stack.database.includes('MySQL')) stack.database.push('MySQL');
      
      // Testing
      if (/rspec/i.test(content) && !stack.testing.includes('RSpec')) stack.testing.push('RSpec');
    }
  }
  
  // =======================
  // PHP (Laravel)
  // =======================
  let composerFile = tree.find(f => f.path.endsWith('composer.json'));
  if (composerFile) {
    if (!stack.backendLanguage.includes('PHP')) stack.backendLanguage.push('PHP');
    
    const content = await fetchFile(composerFile);
    if (content) {
      if (/laravel\/framework/i.test(content) && !stack.backendFramework.includes('Laravel')) stack.backendFramework.push('Laravel');
      if (/symfony/i.test(content) && !stack.backendFramework.includes('Symfony')) stack.backendFramework.push('Symfony');
      
      // Databases
      if (/doctrine/i.test(content)) stack.orm = 'Doctrine';
      if (/eloquent/i.test(content)) stack.orm = 'Eloquent';
    }
  }
  
  // =======================
  // Flutter
  // =======================
  let pubspecFile = tree.find(f => f.path.endsWith('pubspec.yaml'));
  if (pubspecFile) {
    if (!stack.mobileFramework.includes('Flutter')) stack.mobileFramework.push('Flutter');
    if (!stack.backendLanguage.includes('Dart')) stack.backendLanguage.push('Dart');
  }
  
  // =======================
  // Android (Kotlin/Java)
  // =======================
  let androidManifest = tree.find(f => f.path.endsWith('AndroidManifest.xml'));
  if (androidManifest) {
    if (!stack.mobileFramework.includes('Android Native')) stack.mobileFramework.push('Android Native');
    
    // Check for Kotlin
    if (tree.some(f => f.path.endsWith('.kt'))) {
      if (!stack.backendLanguage.includes('Kotlin')) stack.backendLanguage.push('Kotlin');
    }
  }
  
  // =======================
  // iOS (Swift)
  // =======================
  let iosProject = tree.find(f => f.path.includes('.xcodeproj/') || f.path.endsWith('Podfile'));
  if (iosProject) {
    if (!stack.mobileFramework.includes('iOS Native')) stack.mobileFramework.push('iOS Native');
    
    // Check for Swift
    if (tree.some(f => f.path.endsWith('.swift'))) {
      if (!stack.backendLanguage.includes('Swift')) stack.backendLanguage.push('Swift');
    }
  }
  
  return stack;
}

// ============================================================================
// FILE SELECTION - Enhanced for all patterns
// ============================================================================

function selectFiles(
  tree: GitHubTreeItem[],
  structure: any,
  techStack: any
): string[] {
  const selected: string[] = [];
  const maxFiles = 60;
  
  // Root configs
  const rootConfigs = tree
    .filter(t => t.type === 'blob' && !t.path.includes('/'))
    .filter(t => 
      t.path === 'package.json' ||
      t.path === 'README.md' ||
      t.path === 'docker-compose.yml' ||
      t.path === 'docker-compose.yaml' ||
      t.path === 'Dockerfile' ||
      t.path === 'requirements.txt' ||
      t.path === 'go.mod' ||
      t.path === 'pom.xml' ||
      t.path === 'build.gradle' ||
      t.path === 'Cargo.toml' ||
      t.path === 'Gemfile' ||
      t.path === 'composer.json' ||
      t.path === 'pubspec.yaml'
    )
    .map(t => t.path);
  
  selected.push(...rootConfigs);
  
  // ========================================
  // BACKEND FILES
  // ========================================
  for (const backendFolder of structure.backend) {
    const prefix = backendFolder ? backendFolder + '/' : '';
    const backendFiles = tree.filter(t => 
      t.type === 'blob' && 
      t.path.startsWith(prefix)
    );
    
    // Config files
    const configs = backendFiles.filter(f =>
      f.path === `${prefix}package.json` ||
      f.path === `${prefix}Dockerfile` ||
      f.path === `${prefix}requirements.txt` ||
      f.path === `${prefix}go.mod` ||
      f.path === `${prefix}pom.xml` ||
      f.path === `${prefix}build.gradle` ||
      f.path === `${prefix}Cargo.toml` ||
      f.path === `${prefix}Gemfile` ||
      f.path === `${prefix}composer.json` ||
      f.path === `${prefix}.env.example`
    ).map(f => f.path);
    
    selected.push(...configs);
    
    // Entry points (support multiple languages)
    const entries = backendFiles.filter(f =>
      // Node.js/TypeScript
      f.path.match(new RegExp(`${prefix}(index|app|server|main)\\.(js|ts)$`)) ||
      // Python
      f.path.match(new RegExp(`${prefix}(main|app|wsgi|asgi|manage)\\.py$`)) ||
      // Go
      f.path.match(new RegExp(`${prefix}(main|cmd/.*)\\.go$`)) ||
      // Java
      f.path.match(new RegExp(`${prefix}.*Application\\.java$`)) ||
      // Rust
      f.path.match(new RegExp(`${prefix}src/main\\.rs$`)) ||
      // PHP
      f.path.match(new RegExp(`${prefix}(index|artisan)\\.php$`)) ||
      // Ruby
      f.path.match(new RegExp(`${prefix}(config\\.ru|application\\.rb)$`))
    ).slice(0, 3).map(f => f.path);
    
    selected.push(...entries);
    
    // Route/controller files (cap at 30)
    const routeFiles = backendFiles.filter(f =>
      /(routes|controllers|endpoints|handlers)\//i.test(f.path) &&
      /\.(js|ts|py|go|rs|java|rb|php)$/.test(f.path) &&
      !/\.(test|spec)\.(js|ts)$/.test(f.path)
    ).slice(0, 30).map(f => f.path);
    
    console.log(`📍 Found ${routeFiles.length} route files in ${backendFolder || 'root'}`);
    selected.push(...routeFiles);
    
    // Sample from other key folders
    const keyFolders = [
      'services', 'models', 'config', 'middleware', 'utils',
      'repositories', 'domain', 'entities', 'dto', 'schemas',
      'lib', 'pkg', 'internal'
    ];
    
    for (const folder of keyFolders) {
      const folderFiles = backendFiles.filter(f =>
        f.path.includes(`/${folder}/`) &&
        /\.(js|ts|py|go|rs|java|rb|php)$/.test(f.path) &&
        !/\.(test|spec)\.(js|ts)$/.test(f.path)
      ).slice(0, 2).map(f => f.path);
      
      selected.push(...folderFiles);
    }
  }
  
  // ========================================
  // FRONTEND FILES
  // ========================================
  for (const frontendFolder of structure.frontend) {
    const prefix = frontendFolder + '/';
    const frontendFiles = tree.filter(t => 
      t.type === 'blob' && 
      t.path.startsWith(prefix)
    );
    
    // Config files
    const configs = frontendFiles.filter(f =>
      f.path === `${prefix}package.json` ||
      f.path === `${prefix}vite.config.js` ||
      f.path === `${prefix}vite.config.ts` ||
      f.path === `${prefix}next.config.js` ||
      f.path === `${prefix}nuxt.config.js` ||
      f.path === `${prefix}tsconfig.json` ||
      f.path === `${prefix}angular.json` ||
      f.path === `${prefix}svelte.config.js` ||
      f.path === `${prefix}astro.config.mjs` ||
      f.path === `${prefix}vue.config.js` ||
      f.path === `${prefix}tailwind.config.js`
    ).map(f => f.path);
    
    selected.push(...configs);
    
    // Entry points
    const entry = frontendFiles.find(f =>
      f.path.endsWith('/src/App.tsx') ||
      f.path.endsWith('/src/App.jsx') ||
      f.path.endsWith('/src/App.vue') ||
      f.path.endsWith('/src/main.tsx') ||
      f.path.endsWith('/src/main.ts') ||
      f.path.endsWith('/src/index.tsx') ||
      f.path.endsWith('/pages/index.tsx') ||
      f.path.endsWith('/app/page.tsx')
    );
    
    if (entry) selected.push(entry.path);
  }
  
  // ========================================
  // MOBILE FILES
  // ========================================
  for (const mobileFolder of structure.mobile) {
    const prefix = mobileFolder + '/';
    const mobileFiles = tree.filter(t => 
      t.type === 'blob' && 
      t.path.startsWith(prefix)
    );
    
    // Flutter
    const flutterConfig = mobileFiles.find(f => f.path.endsWith('pubspec.yaml'));
    if (flutterConfig) {
      selected.push(flutterConfig.path);
      
      const mainDart = mobileFiles.find(f => f.path.endsWith('/lib/main.dart'));
      if (mainDart) selected.push(mainDart.path);
    }
    
    // React Native
    const rnConfig = mobileFiles.find(f => 
      f.path.endsWith('app.json') || 
      f.path.endsWith('metro.config.js')
    );
    if (rnConfig) selected.push(rnConfig.path);
    
    // Android
    const androidManifest = mobileFiles.find(f => 
      f.path.endsWith('AndroidManifest.xml')
    );
    if (androidManifest) selected.push(androidManifest.path);
    
    // iOS
    const infoPlist = mobileFiles.find(f => f.path.endsWith('Info.plist'));
    if (infoPlist) selected.push(infoPlist.path);
  }
  
  const unique = [...new Set(selected)];
  console.log(`📁 Total files selected: ${unique.length}`);
  console.log(`   - Route files: ${unique.filter(f => /(routes|controllers|handlers)\//.test(f)).length}`);
  console.log(`   - Config files: ${unique.filter(f => /\.(json|yaml|toml|xml)$/.test(f)).length}`);
  console.log(`   - Source files: ${unique.filter(f => /\.(js|ts|py|go|java|rb|php|dart|swift|kt)$/.test(f)).length}`);
  
  return unique.slice(0, maxFiles);
}

// ============================================================================
// SHOULD GENERATE README - Enhanced patterns
// ============================================================================

export function shouldGenerateReadme(changedFiles: string[]): {files: string[]; value: boolean} {
  
  // Skip if only these files changed
  const trivialPatterns = [
    /\.md$/,
    /\.txt$/,
    /LICENSE/,
    /\.github\//,
    /\.vscode\//,
    /\.idea\//,
    /\.gitignore/,
    /\.editorconfig/,
    /\.prettierrc/,
    /\.eslintrc/,
    /\.env\.example/,
  ];
  
  const meaningfulChanges = changedFiles.filter(file => 
    !trivialPatterns.some(pattern => pattern.test(file))
  );
  
  if (meaningfulChanges.length === 0) {
    console.log('⏭️  Skipping: No meaningful code changes');
    return {files: [], value: false};
  }
  
  // Significant patterns for all tech stacks
  const significantPatterns = [
    
    // ===== DEPENDENCY FILES =====
    /package\.json$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /requirements\.txt$/,
    /Pipfile$/,
    /Pipfile\.lock$/,
    /pyproject\.toml$/,
    /poetry\.lock$/,
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
    /pubspec\.yaml$/,
    /pubspec\.lock$/,
    
    // ===== ENTRY POINTS =====
    /(index|app|server|main)\.(js|ts)$/,
    /(main|app|wsgi|asgi|manage)\.py$/,
    /main\.go$/,
    /cmd\/.*\.go$/,
    /.*Application\.java$/,
    /src\/main\.rs$/,
    /(index|artisan)\.php$/,
    /(config\.ru|application\.rb)$/,
    
    // ===== BACKEND DIRECTORIES =====
    /(routes|controllers|handlers|endpoints|api|views)\/.+\.(js|ts|py|go|java|rb|php|rs)$/,
    /(services|repositories|models|entities|dto|schemas)\/.+\.(js|ts|py|go|java|rb|php|rs)$/,
    /(middleware|guards|interceptors|filters)\/.+\.(js|ts|py|go|java|rb|php|rs)$/,
    
    // ===== SOURCE DIRECTORIES =====
    /(src|cmd|internal|pkg|lib|app)\/.+\.(js|ts|py|go|java|rb|php|rs|dart|swift|kt)$/,
    
    // ===== INFRASTRUCTURE =====
    /Dockerfile$/,
    /docker-compose\.ya?ml$/,
    /\.github\/workflows\/.+\.ya?ml$/,
    /\.gitlab-ci\.ya?ml$/,
    /kubernetes\/.+\.ya?ml$/,
    /helm\/.+\.ya?ml$/,
    
    // ===== CONFIG FILES =====
    /config\/.+\.(js|ts|json|yaml|yml|toml|xml)$/,
    /\.env$/,
    
    // ===== DATABASE =====
    /(migrations|seeds|seeders)\/.+\.(js|ts|py|sql)$/,
    /prisma\/schema\.prisma$/,
    
    // ===== MOBILE =====
    /AndroidManifest\.xml$/,
    /Info\.plist$/,
    /app\.json$/,
    /lib\/main\.dart$/,
  ];
  
  const hasSignificantChanges = meaningfulChanges.filter(file =>
    significantPatterns.some(pattern => pattern.test(file))
  );
  
  if (hasSignificantChanges.length === 0) {
    console.log('⏭️  Skipping: Changes not significant enough for README update');
    return {files: [], value: false};
  }
  
  console.log(`✅ ${hasSignificantChanges.length} significant changes detected`);
  return {files: hasSignificantChanges, value: true};
}
