# Handoff System Documentation

This document explains how to use the improved handoff system with roo-code for phased development of your application.

## Overview

The handoff system helps structure development across different roles and development phases. It tracks:

- Which files are expected for each role/module
- Which files have been created
- Progress through development phases
- Implementation of database features (stored procedures)
- Documentation and test coverage

## Prerequisites

Install required dependencies:

```bash
npm install minimist glob
```

## Configuration

### handoff.config.json

This file defines the expected files for each role and module. The structure is:

```json
{
  "role-name": {
    "default": ["file/patterns/*.js"],
    "specific-module": ["custom/patterns.js"]
  }
}
```

Special placeholders:
- `{module}` - Replaced with the module name (lowercase)
- `{Module}` - Replaced with the capitalized module name

### Development Phases

The system supports phased development through module naming conventions:

1. **Read-Only Operations** (Phase 1): `projects-read`, `tasks-read`
2. **Write Operations** (Phase 2): `projects-write`, `tasks-write`
3. **Advanced Features** (Phase 3): `time-allocation`, etc.

## Using the Handoff Script

### Basic Usage

```bash
node handoff.js --role <role> --module <module>
```

Example:
```bash
node handoff.js --role api-engineer --module projects-read
```

### Generate Next Prompt

Add `--prompt true` to generate a prompt template for the next role:

```bash
node handoff.js --role api-engineer --module projects-read --prompt true
```

### Custom Config Path

```bash
node handoff.js --role api-engineer --module projects-read --config custom-config.json
```

## Integration with roo-code

### Using Handoff Files with roo-code

1. Generate a handoff file and prompt:
   ```bash
   node handoff.js --role system-architect --module core --prompt true
   ```

2. Copy the generated prompt from the console

3. Provide the prompt to roo-code along with these instructions:
   ```
   Use the handoff file at docs/handoff/<module>.<role>.json as context. 
   
   Complete the tasks described in the prompt and create all required files.
   
   When you're done, list the files you've created or modified.
   ```

4. Verify the files created by roo-code match what's expected in handoff.config.json

5. Run the handoff script again to verify completion and generate the next prompt

### Database Feature Implementation

For modules that use stored procedures:

1. Reference the handoff file's `storedProcedures` section
2. Instruct roo-code to implement the proper calls to these procedures
3. Point roo-code to the SQL schema file for procedure signatures

## Best Practices

1. **Sequential Development**: Complete each phase before moving to the next
2. **Update Handoff Files**: Add notes and assumptions to provide context
3. **Version Control**: Commit handoff files to track progress
4. **Role Switching**: Follow the defined role sequence
5. **Test Verification**: Run tests before generating the next handoff

## Troubleshooting

- **Missing Files**: Check if the pattern in handoff.config.json matches your actual file structure
- **Glob Pattern Issues**: For complex patterns, verify they work with the glob library
- **Role Confusion**: Ensure each role has clear responsibilities in your prompts
- **Phase Management**: Keep phases clear by using proper module naming conventions

## Example Workflow

1. **System Architect**: Set up project structure
   ```bash
   node handoff.js --role system-architect --module core --prompt true
   ```

2. **DB Integrator**: Create models for projects
   ```bash
   node handoff.js --role db-integrator --module projects --prompt true
   ```

3. **API Engineer (Read)**: Implement read-only project endpoints
   ```bash
   node handoff.js --role api-engineer --module projects-read --prompt true
   ```

4. **API Engineer (Write)**: Add write operations for projects
   ```bash
   node handoff.js --role api-engineer --module projects-write --prompt true
   ```

5. Continue through each module and phase following the same pattern