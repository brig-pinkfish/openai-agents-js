import { Agent, tool, run, AgentInputItem, extractAllTextOutput } from '@openai/agents';
import { z } from 'zod';
import readline from 'node:readline/promises';
import fs from 'node:fs/promises';
import { OpenAI } from 'openai';

console.log('=== TODO Orchestration Pattern v7: Tool Selector + Multi-Tool + Parallel ===');

// Create OpenAI client for tool selector
const openai = new OpenAI();

// ===== CONFIGURATION =====
const APPROVAL_ENABLED = process.env.APPROVAL_ENABLED === 'true' || false;
const MAX_ITERATIONS = 10;

// ===== TOOL DEFINITIONS =====
const writePoem = tool({
  name: 'write_poem',
  description: 'Creates beautiful poetry based on a given theme',
  parameters: z.object({
    theme: z.string().describe('The theme or topic for the poem')
  }),
  needsApproval: APPROVAL_ENABLED ? async () => true : undefined,
  async execute({ theme }) {
    return `A beautiful poem about ${theme}:

    In the realm of ${theme}, where dreams take flight,
    Beauty dances in the morning light.
    Each moment holds a story untold,
    A treasure more precious than gold.

    With every breath, we find our way,
    Through the magic of this ${theme} day.`;
  }
});

const writeBlogTitle = tool({
  name: 'write_blog_title', 
  description: 'Generates compelling blog post titles',
  parameters: z.object({
    theme: z.string().describe('The theme or topic for the blog post')
  }),
  needsApproval: APPROVAL_ENABLED ? async () => true : undefined,
  async execute({ theme }) {
    const titles = [
      `10 Amazing Ways ${theme} Can Transform Your Life`,
      `The Ultimate Guide to Mastering ${theme} in 2024`, 
      `Why ${theme} is the Secret to Success (And How to Get Started)`,
      `From Beginner to Expert: Your Complete ${theme} Journey`
    ];
    return titles[Math.floor(Math.random() * titles.length)];
  }
});

const writeAudioJingle = tool({
  name: 'write_audio_jingle',
  description: 'Creates short promotional jingles for audio advertising',
  parameters: z.object({
    word_count: z.number().describe('Target word count for the jingle'),
    theme: z.string().describe('The theme or product for the jingle')
  }),
  needsApproval: APPROVAL_ENABLED ? async () => true : undefined,
  async execute({ word_count, theme }) {
    const words = [
      'Amazing', 'Fresh', 'New', 'Best', 'Quality', 'Perfect', 'Great', 'Awesome',
      'Delicious', 'Premium', 'Ultimate', 'Incredible', 'Fantastic', 'Wonderful'
    ];
    
    let jingle = '';
    let currentWords = 0;
    
    while (currentWords < word_count - 2) {
      const word = words[Math.floor(Math.random() * words.length)];
      jingle += word + ' ';
      currentWords++;
    }
    
    jingle += `${theme} today!`;
    return jingle.trim();
  }
});

const writeLegoeConcept = tool({
  name: 'write_lego_concept',
  description: 'Designs detailed LEGO kit concepts',
  parameters: z.object({
    theme: z.string().describe('The theme for the LEGO set')
  }),
  needsApproval: APPROVAL_ENABLED ? async () => true : undefined,
  async execute({ theme }) {
    return `🧱 LEGO ${theme.toUpperCase()} ADVENTURE SET

    Set Details:
    - Pieces: 847
    - Ages: 8-14
    - Minifigures: 4 unique characters
    
    Features:
    - Interactive ${theme} environment with moving parts
    - Hidden compartments and secret mechanisms  
    - Compatible with other LEGO sets for expanded play
    - Includes exclusive ${theme}-themed accessories
    
    Build, play, and explore the world of ${theme}!`;
  }
});

const formatResponse = tool({
  name: 'format_response',
  description: 'Formats content into clean markdown',
  parameters: z.object({
    content: z.string().describe('The content to format')
  }),
  needsApproval: APPROVAL_ENABLED ? async () => true : undefined,
  async execute({ content }) {
    return `# Formatted Content

${content}

---
*Formatted with markdown styling*`;
  }
});

// Tool selector for intelligent tool discovery
const toolSelector = tool({
  name: 'toolSelector',
  description: 'Analyzes user requests to identify relevant tools and execution strategy',
  parameters: z.object({
    userRequest: z.string().describe('The user\'s request to analyze'),
    availableTools: z.array(z.object({
      name: z.string(),
      description: z.string()
    })).describe('Array of all available tools with their descriptions')
  }),
  async execute({ userRequest, availableTools }) {
    console.log('🔧 TOOLSELECTOR CALLED!');
    console.log(`   📝 Request: "${userRequest}"`);
    console.log(`   🛠️  Available: ${availableTools.map(t => t.name).join(', ')}`);
    
    // Create a prompt for the LLM to analyze the request and select tools
    const toolAnalysisPrompt = `
Analyze this user request and select the most relevant tools:

USER REQUEST: "${userRequest}"

AVAILABLE TOOLS:
${availableTools.map(tool => 
  `- ${tool.name}: ${tool.description}`
).join('\n')}

Determine:
1. Which tools are needed to fulfill the request
2. Whether they should run sequentially (one depends on another) or in parallel (independent)
3. Extract any parameter values mentioned in the user request

Return a JSON object with this structure:
{
  "selectedTools": ["tool1", "tool2"],
  "executionMode": "sequential" | "parallel",
  "extractedInputs": {
    "theme": "winter",
    "word_count": 30
  },
  "reasoning": "explanation of tool selection and execution strategy",
  "confidence": 0.95
}

Important:
- Sequential: When one tool's output feeds into another (e.g., create content then format it)
- Parallel: When tools are independent and can run simultaneously
- Only extract inputs that are clearly mentioned in the user request
`;

    // Use OpenAI to analyze and select tools
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing user requests and selecting the most appropriate tools. Always return valid JSON.'
        },
        {
          role: 'user',
          content: toolAnalysisPrompt
        }
      ],
      temperature: 0.1
    });

    try {
      const toolSelection = JSON.parse(response.choices[0].message.content || '{}');
      
      // Validate the tool selection has required structure
      if (!toolSelection.selectedTools || !Array.isArray(toolSelection.selectedTools)) {
        throw new Error('Invalid tool selection structure');
      }

      console.log('✅ TOOLSELECTOR RESULT:');
      console.log(`   🎯 Selected: ${toolSelection.selectedTools?.join(', ') || 'none'}`);
      console.log(`   ⚡ Mode: ${toolSelection.executionMode || 'unknown'}`);
      console.log(`   📊 Confidence: ${toolSelection.confidence || 0}`);
      
      return toolSelection;
    } catch (error) {
      console.error('Error parsing tool selection:', error);
      return {
        selectedTools: [],
        executionMode: 'sequential',
        extractedInputs: {},
        reasoning: 'Failed to parse tool selection',
        confidence: 0.0
      };
    }
  }
});

// ===== ALL AVAILABLE TOOLS =====
const ALL_TOOLS = [writePoem, writeBlogTitle, writeAudioJingle, writeLegoeConcept, formatResponse];
const TOOL_MAP = new Map(ALL_TOOLS.map(tool => [tool.name, tool]));

// ===== ORCHESTRATION AGENT (Now uses toolSelector) =====
const orchestrationAgent = new Agent({
  name: 'orchestration_agent',
  instructions: [
    'You are a workflow orchestration agent.',
    'If conversation has no toolSelector results yet, call toolSelector first.',
    'After toolSelector responds, create execution plan based on results.',
    'CRITICAL DECISIONS:',
    '1. If toolSelector extracted all required inputs (theme provided), set continue: true to execute tools.',
    '2. If inputs missing, set continue: false and missing_inputs array.',
    '3. If all tasks are completed (no pending tasks), set complete: true and continue: false to finish.',
    'WHEN CONTINUE=TRUE: Set pending tools and parallel_group/sequential_groups from toolSelector results.',
    'WHEN CONTINUE=FALSE: Set missing_inputs array and empty tools.',
    'WHEN COMPLETE=TRUE: All tasks done, set pending: [], continue: false, complete: true.',
    'Output ONLY JSON, no other text.',
    'Example READY: {"tasks": {"completed": [], "pending": ["write_poem"], "current_batch": []}, "tools": {"parallel_group": ["write_poem"], "inputs": {"write_poem": {"theme": "winter"}}}, "status": {"continue": true, "missing_inputs": [], "execution_mode": "parallel"}}',
    'Example MISSING: {"tasks": {"completed": [], "pending": [], "current_batch": []}, "tools": {"inputs": {}}, "status": {"continue": false, "missing_inputs": ["theme"], "execution_mode": "parallel"}}',
    'Example COMPLETE: {"tasks": {"completed": ["write_poem"], "pending": [], "current_batch": []}, "tools": {"inputs": {}}, "status": {"complete": true, "continue": false, "missing_inputs": [], "execution_mode": "parallel"}}'
  ].join(' '),
  tools: [toolSelector],
  toolUseBehavior: 'run_llm_again'
});

// ===== ACTION AGENT (Enhanced for parallel execution) =====
const actionAgent = new Agent({
  name: 'action_agent',
  instructions: [
    'You are an action agent that executes creative writing tools.',
    'For SEQUENTIAL mode: Execute exactly ONE tool per request.',
    'For PARALLEL mode: You will receive multiple tool assignments to execute simultaneously.',
    'Use the provided tools with the exact parameters given to you.',
    'Execute tools directly - do not ask for clarification.',
    'Return the creative content generated by the tools.'
  ].join(' '),
  tools: [], // Tools assigned dynamically by orchestrator
  toolUseBehavior: 'stop_on_first_tool',
  modelSettings: { toolChoice: 'required' },
});

// ===== TYPES (Enhanced for parallel execution) =====
interface TaskState {
  completed: string[];
  pending: string[];
  current_batch: string[];
}

interface ToolSelection {
  sequential_groups?: string[][];
  parallel_group?: string[];
  inputs: Record<string, Record<string, any>>;
  reasoning: string;
}

interface ExecutionStatus {
  complete: boolean;
  continue: boolean;
  missing_inputs: string[];
  execution_mode: 'sequential' | 'parallel';
}

interface OrchestrationResponse {
  tasks: TaskState;
  tools: ToolSelection;
  status: ExecutionStatus;
}

// ===== HELPER FUNCTIONS =====
function getToolDescriptions(): string {
  return `
Available Creative Tools:
• write_poem - Create beautiful poetry (needs: theme)
• write_blog_title - Generate compelling blog titles (needs: theme)  
• write_audio_jingle - Write catchy jingles (needs: word_count, theme)
• write_lego_concept - Design LEGO kit concepts (needs: theme)
• format_response - Format content in markdown (needs: content)

Multi-tool examples:
• "Write a poem about nature and format it" (SEQUENTIAL - format needs poem)
• "Create a blog title and jingle for my coffee shop" (PARALLEL - independent tasks)`;
}

function logSection(title: string, content?: string) {
  console.log(`\n>> ${title}`);
  if (content) {
    console.log(`   ${content}`);
  }
}

function logTaskState(tasks: TaskState) {
  logSection('📋 TODO LIST');
  
  console.log(`\n✅ COMPLETED:`);
  if (tasks.completed.length === 0) {
    console.log(`   • None yet`);
  } else {
    tasks.completed.forEach((task, i) => {
      console.log(`   ${i + 1}. ${task}`);
    });
  }

  console.log(`\n⏳ PENDING:`);
  if (tasks.pending.length === 0) {
    console.log(`   • None remaining`);
  } else {
    tasks.pending.forEach((task, i) => {
      console.log(`   ${i + 1}. ${task}`);
    });
  }

  console.log(`\n🎯 CURRENT BATCH:`);
  if (tasks.current_batch.length === 0) {
    console.log(`   • None`);
  } else {
    tasks.current_batch.forEach((task, i) => {
      console.log(`   ${i + 1}. ${task}`);
    });
  }
}

function logToolSelection(tools: ToolSelection, status: ExecutionStatus) {
  logSection('🔧 TOOL SELECTION');
  
  if (status.execution_mode === 'parallel' && tools.parallel_group) {
    console.log(`   🚀 PARALLEL: ${tools.parallel_group.join(', ')}`);
  } else if (tools.sequential_groups) {
    console.log(`   ⏭️  SEQUENTIAL: ${tools.sequential_groups.flat().join(' → ')}`);
  }
  
  console.log(`   Reasoning: ${tools.reasoning}`);
  
  if (status.missing_inputs.length > 0) {
    console.log(`   ⚠️  Missing inputs: ${status.missing_inputs.join(', ')}`);
  }
  
  if (Object.keys(tools.inputs).length > 0) {
    console.log(`   📝 Tool inputs:`);
    Object.entries(tools.inputs).forEach(([tool, params]) => {
      console.log(`      ${tool}: ${JSON.stringify(params)}`);
    });
  }
}

// ===== HUMAN APPROVAL SYSTEM =====
async function askApproval(toolName: string, args: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`
>> 🤝 HUMAN APPROVAL REQUIRED
   Tool: ${toolName}
   Arguments: ${args}
===================================================================`);

  const answer = await rl.question('Approve this tool execution? (y/n): ');
  rl.close();
  
  const approved = answer.toLowerCase().startsWith('y');
  console.log(`
>> 📝 DECISION: ${approved ? 'APPROVED' : 'REJECTED'}
===================================================================`);
  
  return approved;
}

async function handleApprovals(result: any): Promise<any> {
  return handleApprovalsWithAgent(result, actionAgent);
}

async function handleApprovalsWithAgent(result: any, agent: Agent): Promise<any> {
  let currentResult = result;
  
  while (currentResult.interruptions?.length > 0) {
    await fs.writeFile('state.json', JSON.stringify(currentResult.state, null, 2));
    
    const state = await currentResult.state.constructor.fromString(
      agent, 
      await fs.readFile('state.json', 'utf-8')
    );
    
    for (const interruption of currentResult.interruptions) {
      const approved = await askApproval(
        interruption.rawItem.name,
        interruption.rawItem.arguments
      );
      
      if (approved) {
        state.approve(interruption);
      } else {
        state.reject(interruption);
      }
    }
    
    console.log(`🤖 LLM CALL STARTING (Resume) ===================================`);
    currentResult = await run(agent, state);
    console.log(`✅ LLM CALL COMPLETED ========================================`);
  }
  
  return currentResult;
}

// ===== PARALLEL EXECUTION FUNCTIONS =====
async function executeToolsInParallel(toolNames: string[], toolInputs: Record<string, Record<string, any>>): Promise<Record<string, string>> {
  logSection('🚀 PARALLEL EXECUTION', `Running ${toolNames.length} tools simultaneously`);
  
  // Create separate action agents for parallel execution
  const parallelPromises = toolNames.map(async (toolName) => {
    const tool = TOOL_MAP.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    
    // Create a dedicated action agent for this tool
    const parallelActionAgent = new Agent({
      name: `action_agent_${toolName}`,
      instructions: actionAgent.instructions,
      tools: [tool],
      toolUseBehavior: 'stop_on_first_tool',
      modelSettings: { toolChoice: 'required' },
    });
    
    const inputs = toolInputs[toolName] || {};
    const inputsText = Object.entries(inputs)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    
    console.log(`   🔧 Starting ${toolName} with inputs: ${inputsText}`);
    
    let result = await run(parallelActionAgent, [
      { role: 'user', content: `Use ${toolName} with these inputs: ${inputsText}` }
    ]);
    
    // Handle approvals if needed
    if (APPROVAL_ENABLED) {
      result = await handleApprovalsWithAgent(result, parallelActionAgent);
    }
    
    return { toolName, result: result.finalOutput || 'No result' };
  });
  
  const results = await Promise.all(parallelPromises);
  
  // Convert to record format
  const resultMap: Record<string, string> = {};
  results.forEach(({ toolName, result }) => {
    resultMap[toolName] = result;
    console.log(`   ✅ ${toolName} completed`);
  });
  
  return resultMap;
}

async function executeToolSequentially(toolName: string, toolInputs: Record<string, Record<string, any>>): Promise<string> {
  logSection('⏭️ SEQUENTIAL EXECUTION', `Executing ${toolName}`);
  
  const tool = TOOL_MAP.get(toolName);
  if (!tool) {
    throw new Error(`Tool ${toolName} not found`);
  }
  
  actionAgent.tools = [tool];
  
  const inputs = toolInputs[toolName] || {};
  const inputsText = Object.entries(inputs)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
  
  let actionResult = await run(actionAgent, [
    { role: 'user', content: `Use ${toolName} with these inputs: ${inputsText}` }
  ]);
  
  // Handle approvals if needed
  if (APPROVAL_ENABLED) {
    actionResult = await handleApprovals(actionResult);
  }
  
  return actionResult.finalOutput || 'No result';
}

// ===== MAIN ORCHESTRATION LOGIC (Enhanced with toolSelector) =====
async function executeWorkflow(userRequest: string): Promise<string> {
  console.log('\n🎯 Starting v7 Orchestration: Tool Selector + Multi-Tool + Parallel\n');
  console.log(`👤 User: "${userRequest}"`);
  console.log(`🎛️  Mode: ${APPROVAL_ENABLED ? 'APPROVAL ENABLED' : 'AUTO EXECUTION'}\n`);

  // Show available tools if user asks what we can do
  if (userRequest.toLowerCase().includes('what') && (userRequest.toLowerCase().includes('can') || userRequest.toLowerCase().includes('do'))) {
    console.log(getToolDescriptions());
  }

  let conversation: AgentInputItem[] = [{ role: 'user', content: userRequest }];
  let iteration = 0;
  let generatedContent: Record<string, string> = {};
  let discoveredTools: string[] = [];
  
  while (iteration < MAX_ITERATIONS) {
    iteration++;
    logSection(`🔄 ITERATION ${iteration}`);
    
    // Add tool catalog to conversation so orchestrator can call toolSelector
    if (iteration === 1) {
      const toolCatalog = ALL_TOOLS.map(tool => ({
        name: tool.name,
        description: tool.description
      }));
      
      conversation = [
        { role: 'user', content: userRequest },
        { role: 'user', content: `Tool catalog: ${JSON.stringify(toolCatalog)}` }
      ];
    }
    
    // ===== ORCHESTRATION PHASE =====
    logSection('🧠 ORCHESTRATION AGENT', 'Analyzing request and planning...');
    
    const orchestrationResult = await run(orchestrationAgent, conversation);
    
    // Parse orchestration response
    let response: OrchestrationResponse;
    try {
      response = JSON.parse(orchestrationResult.finalOutput || '{}');
    } catch (e) {
      console.log(`   ERROR: Failed to parse orchestration response: ${e}`);
      response = {
        tasks: { completed: [], pending: ['Parse error occurred'], current_batch: [] },
        tools: { inputs: {}, reasoning: 'Parse error occurred' },
        status: { complete: false, continue: false, missing_inputs: [], execution_mode: 'sequential' }
      };
    }
    
    conversation = orchestrationResult.history;
    logTaskState(response.tasks);
    
    // Check if complete
    if (response.status.complete) {
      logSection('✅ WORKFLOW COMPLETE', 'All creative tasks finished!');
      break;
    }
    
    // Check for missing inputs
    if (response.status.missing_inputs.length > 0) {
      logSection('⚠️  MISSING INPUTS', `Need: ${response.status.missing_inputs.join(', ')}`);
      
      // Ask user for missing inputs
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      
      console.log(`\nPlease provide the missing information:`);
      for (const input of response.status.missing_inputs) {
        const value = await rl.question(`${input}: `);
        conversation.push({
          role: 'user',
          content: `Provided ${input}: ${value}. Now proceed with tool execution.`
        });
      }
      rl.close();
      continue;
    }
    
    // Check if we should continue
    if (!response.status.continue) {
      logSection('⏸️  WORKFLOW PAUSED', 'No tasks to execute');
      break;
    }
    
    // ===== ACTION AGENT EXECUTION =====
    logToolSelection(response.tools, response.status);
    
    // Execute tools based on mode
    if (response.status.execution_mode === 'parallel' && response.tools.parallel_group) {
      // PARALLEL EXECUTION
      const parallelResults = await executeToolsInParallel(
        response.tools.parallel_group,
        response.tools.inputs
      );
      
      // Store all parallel results
      Object.assign(generatedContent, parallelResults);
      
      // Log results
      Object.entries(parallelResults).forEach(([toolName, result]) => {
        console.log(`\n🎨 ${toolName.toUpperCase()} RESULT:\n${result}\n`);
      });
      
      // Add results to conversation
      const resultsText = Object.entries(parallelResults)
        .map(([tool, result]) => `${tool}: ${result}`)
        .join('\n\n');
      
      conversation.push({
        role: 'user',
        content: `Action agent successfully executed ${response.tools.parallel_group.join(', ')} in parallel. Results: ${resultsText}. Mark these tasks as completed.`
      });
      
    } else if (response.tools.sequential_groups) {
      // SEQUENTIAL EXECUTION
      for (const group of response.tools.sequential_groups) {
        for (const toolName of group) {
          // Before executing, check if this tool needs output from previous tool
          const toolInputs = { ...response.tools.inputs };
          
          // Replace placeholder content with actual previous tool output
          if (toolName === 'format_response' && toolInputs[toolName]?.content === '<from_previous_tool>') {
            // Find the most recent non-format tool result as content
            const contentSources = ['write_poem', 'write_blog_title', 'write_audio_jingle', 'write_lego_concept'];
            for (const source of contentSources) {
              if (generatedContent[source]) {
                toolInputs[toolName].content = generatedContent[source];
                break;
              }
            }
          }
          
          const result = await executeToolSequentially(toolName, toolInputs);
          
          generatedContent[toolName] = result;
          console.log(`\n🎨 ${toolName.toUpperCase()} RESULT:\n${result}\n`);
        }
      }
      
      // Add results to conversation  
      conversation.push({
        role: 'user',
        content: `Action agent successfully executed tools sequentially. Mark completed tasks and check if workflow is done.`
      });
    }
  }
  
  if (iteration >= MAX_ITERATIONS) {
    logSection('⚠️  ITERATION LIMIT', `Stopped after ${MAX_ITERATIONS} iterations`);
  }
  
  return Object.values(generatedContent).join('\n\n---\n\n');
}

// ===== CLI INTERFACE =====
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log(`
🎨 Welcome to v7: Tool Selector + Multi-Tool + Parallel Execution!

${getToolDescriptions()}

Try requests like:
• "Write a poem about winter and format it" (Sequential)
• "Create a blog title and jingle for my coffee shop" (Parallel)  
• "Design a LEGO set about space and write a blog title about it" (Parallel)
• "Write a poem about nature, then format it nicely" (Sequential)
`);

    const userRequest = await rl.question('What would you like me to help you create? ');

    if (!userRequest.trim()) {
      console.log('No request provided. Exiting.');
      return;
    }

    const result = await executeWorkflow(userRequest);
    
    console.log('\n===============================================================================');
    console.log('🎉 FINAL OUTPUT');
    console.log('===============================================================================');
    console.log(result);
    console.log('===============================================================================');

  } finally {
    rl.close();
    
    // Cleanup state file
    try {
      await fs.unlink('state.json');
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// ===== EXECUTION =====
if (typeof require !== 'undefined' && require.main === module) {
  main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}

export { executeWorkflow, orchestrationAgent, actionAgent }; 