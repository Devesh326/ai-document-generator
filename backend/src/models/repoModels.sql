CREATE TABLE repos (
  id SERIAL PRIMARY KEY,
  github_repo_id BIGINT UNIQUE,
  owner VARCHAR(255),
  repo_name VARCHAR(255),
  installation_id BIGINT,
  readme_generated BOOLEAN DEFAULT false,  -- Has README been generated before?
  last_readme_commit VARCHAR(40),          -- Last commit SHA we generated README for
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Track each README generation
CREATE TABLE readme_generations (
  id SERIAL PRIMARY KEY,
  repo_id INTEGER REFERENCES repos(id),
  commit_sha VARCHAR(40),
  status VARCHAR(50),  -- pending, processing, completed, failed
  pr_number INTEGER,   -- GitHub PR number
  pr_url TEXT,
  type VARCHAR(50),    -- 'initial' or 'update'
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);