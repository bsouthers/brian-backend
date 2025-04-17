// Improved handoff.js script
// Run like: node handoff.js --role api-engineer --module projects-read

const fs = require('fs');
const path = require('path');
const glob = require('glob'); // Add this dependency: npm install glob
const args = require('minimist')(process.argv.slice(2));

// =========== PARSE ARGUMENTS ===========
const role = args.role;
const moduleName = args.module;
const generatePrompt = args.prompt || false;
const configPath = args.config || 'handoff.config.json';

// =========== VALIDATION ===========
if (!role || !moduleName) {
  console.error('Usage: node handoff.js --role <role> --module <module> [--prompt true] [--config path/to/config.json]');
  process.exit(1);
}

// =========== HELPER FUNCTIONS ===========
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function loadConfig() {
  try {
    if (!fs.existsSync(configPath)) {
      console.error(`Error: Configuration file not found at ${configPath}`);
      console.error('Create a config file or specify path with --config option');
      process.exit(1);
    }
    
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.error(`Error loading configuration: ${error.message}`);
    process.exit(1);
  }
}

function ensureDirectoryExists(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return true;
  } catch (error) {
    console.error(`Error creating directory ${dirPath}: ${error.message}`);
    return false;
  }
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    console.error(`Error checking if file exists at ${filePath}: ${error.message}`);
    return false;
  }
}

function findFilesMatchingPattern(pattern) {
  try {
    return glob.sync(pattern);
  } catch (error) {
    console.error(`Error finding files matching pattern ${pattern}: ${error.message}`);
    return [];
  }
}

// =========== ROLE WORKFLOW ===========
const nextRoleByCurrent = {
  'system-architect': 'db-integrator',
  'db-integrator': 'api-engineer',
  'api-engineer': 'frontend-engineer',
  'frontend-engineer': 'qa-engineer',
  'qa-engineer': 'devops-assistant'
};

// Default phase mapping - can be customized per project
const phaseMapping = {
  'projects-read': { nextModule: 'projects-write', phase: 1 },
  'projects-write': { nextModule: 'tasks-read', phase: 2 },
  'tasks-read': { nextModule: 'tasks-write', phase: 2 },
  'tasks-write': { nextModule: 'time-allocation', phase: 3 },
  'time-allocation': { nextModule: null, phase: 4 }
};

// =========== MAIN FUNCTIONS ===========
function generateHandoff(role, moduleName) {
  const config = loadConfig();
  
  if (!config[role]) {
    console.error(`Error: No configuration found for role "${role}"`);
    process.exit(1);
  }
  
  // Get expected files based on specific module or fallback to default
  const modulePatterns = config[role][moduleName] || config[role]['default'];
  
  if (!modulePatterns) {
    console.error(`Error: No file patterns found for role "${role}" and module "${moduleName}"`);
    process.exit(1);
  }
  
  // Process the patterns to replace {module} and {Module} placeholders
  const expectedFiles = modulePatterns.map(pattern => 
    pattern
      .replace(/{module}/g, moduleName.split('-')[0]) // Use the base module name without phase
      .replace(/{Module}/g, capitalize(moduleName.split('-')[0]))
  );
  
  // Track which files exist and which are missing
  const completed = [];
  const missing = [];
  const artifacts = [];
  const storedProcedures = [];
  
  // Check if files exist or match glob patterns
  expectedFiles.forEach(pattern => {
    const matchingFiles = findFilesMatchingPattern(pattern);
    
    if (matchingFiles.length > 0) {
      matchingFiles.forEach(file => {
        const artifact = {
          type: file.endsWith('.test.js') ? 'test' : 
                file.endsWith('.yaml') ? 'docs' : 
                file.endsWith('.sql') ? 'sql' : 'code',
          name: path.basename(file),
          path: file
        };
        
        completed.push(`Verified ${file}`);
        artifacts.push(artifact);
      });
    } else {
      missing.push(pattern);
    }
  });
  
  // For database-related modules, check if they use stored procedures
  if (moduleName.includes('time-allocation')) {
    // Check for stored procedures usage in the code
    const codeFiles = artifacts.filter(a => a.type === 'code').map(a => a.path);
    const procedureNames = [
      'update_task_time_allocation',
      'get_task_time_allocation_summary',
      'validate_task_allocations',
      'set_manual_time_allocation'
    ];
    
    codeFiles.forEach(file => {
      if (fileExists(file)) {
        const content = fs.readFileSync(file, 'utf8');
        procedureNames.forEach(proc => {
          if (content.includes(proc)) {
            storedProcedures.push({
              name: proc,
              file: file,
              implemented: true
            });
          }
        });
      }
    });
  }
  
  // Create handoff JSON object
  const handoff = {
    role,
    module: moduleName,
    completed,
    artifacts,
    missing,
    storedProcedures: storedProcedures.length > 0 ? storedProcedures : undefined,
    assumptions: [],
    notes: '',
    version: '1.0',
    timestamp: new Date().toISOString(),
    phase: getPhaseForModule(moduleName)
  };
  
  // Create directory if it doesn't exist
  const outputDir = path.join('docs', 'handoff');
  if (!ensureDirectoryExists(outputDir)) {
    console.error(`Failed to create output directory: ${outputDir}`);
    process.exit(1);
  }
  
  // Write handoff file
  const outputPath = path.join(outputDir, `${moduleName}.${role}.json`);
  try {
    fs.writeFileSync(outputPath, JSON.stringify(handoff, null, 2));
    console.log(`✅ Handoff file created: ${outputPath}`);
    
    if (missing.length) {
      console.warn('⚠️ Missing files:', missing);
    }
    
    if (generatePrompt) {
      generateNextRolePrompt(handoff);
    }
  } catch (error) {
    console.error(`Error writing handoff file: ${error.message}`);
    process.exit(1);
  }
}

function getPhaseForModule(moduleName) {
  // Extract phase information based on module name
  if (phaseMapping[moduleName]) {
    return phaseMapping[moduleName].phase;
  }
  
  // Default phases based on module prefix
  if (moduleName.startsWith('projects')) return 1;
  if (moduleName.startsWith('tasks')) return 2;
  if (moduleName.startsWith('jobs')) return 3;
  if (moduleName.includes('time-allocation')) return 4;
  
  return 1; // Default to phase 1
}

function generateNextRolePrompt(handoff) {
  // Determine the next role and module based on current configuration
  let nextRole = nextRoleByCurrent[handoff.role];
  let nextModule = handoff.module;
  
  // For api-engineer, check if we need to move to the next phase in the same module
  if (handoff.role === 'api-engineer' && phaseMapping[handoff.module]) {
    nextModule = phaseMapping[handoff.module].nextModule || handoff.module;
  }
  
  if (!nextRole) {
    console.log(`No next role defined for ${handoff.role}`);
    return;
  }
  
  const referencePath = `docs/handoff/${handoff.module}.${handoff.role}.json`;

  // For database-related modules, add specific instructions
  let dbInstructions = '';
  if (handoff.storedProcedures && handoff.storedProcedures.length > 0) {
    dbInstructions = `\n\nDATABASE IMPLEMENTATION:
The module utilizes the following stored procedures:
${handoff.storedProcedures.map(proc => `- ${proc.name} (implemented in ${proc.file})`).join('\n')}

Ensure your implementation correctly calls these procedures with the right parameters.`;
  }
  
  const prompt = `ROLE: ${nextRole}
MODULE: ${nextModule}

REFERENCE HANDOFF:
Use artifacts and context from:
→ ${referencePath}

GOAL:
[Describe the main goal of the ${nextRole} for this module (phase ${handoff.phase})]

TASKS:
1. [Describe specific tasks, such as implementing UI or running QA tests]
2. Use any of the following artifacts if needed:
   ${handoff.artifacts.map(a => `- ${a.path}`).join('\n   ')}${dbInstructions}

HANDOFF:
Once complete, run:
node handoff.js --role ${nextRole} --module ${nextModule} --prompt true`;

  console.log(`\n📦 Suggested prompt for next role:\n\n${prompt}\n`);
}

// Execute the handoff generation
generateHandoff(role, moduleName);