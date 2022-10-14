const _ = require("lodash");
const xstate = require("xstate");
const helper = require("./helper");
const { interpret } = require("xstate");
const workflows = {
  tl: require("../examples/traffic-light.json"),
  fm: require("../examples/facility-maintenance.json"),
  sc: require("../examples/supply-chain-v2.json"),
  im: require("../examples/incident-management.json")
};
const sequences = {
  fm: {
    normalCourse: require("./sequences/fm/normal-course.json")
  },
  sc: {
    normalCourse: require("./sequences/sc/normal-course-v2.json")
  },
  im: {
    normalCourse: require("./sequences/im/normal-course.json")
  }
};

async function main() {

  // Facility Management Scenario
  evaluateRandomTraces(workflows.fm, sequences.fm.normalCourse, 500, "fm");
  await evaluateWorkflowDefinitionCreation(workflows.fm, 50, "fm");
  await evaluateWorkflowInstantiation(workflows.fm, 50, "fm");
  await evaluateWorkflowExecution(workflows.fm, sequences.fm.normalCourse, 10, "fm");

  // Supply Chain Scenario
  evaluateRandomTraces(workflows.sc, sequences.sc.normalCourse, 500, "sc");
  await evaluateWorkflowDefinitionCreation(workflows.sc, 50, "sc", 2.5);
  await evaluateWorkflowInstantiation(workflows.sc, 50, "sc", 2.5);
  await evaluateWorkflowExecution(workflows.sc, sequences.sc.normalCourse, 10, "sc", 2.5);

  // Incident Management Scenario
  evaluateRandomTraces(workflows.im, sequences.im.normalCourse, 500, "im");
  await evaluateWorkflowDefinitionCreation(workflows.im, 50, "im", 2.5);
  await evaluateWorkflowInstantiation(workflows.im, 50, "im", 2.5);
  await evaluateWorkflowExecution(workflows.im, sequences.im.normalCourse, 10, "im", 2.5);
}

function evaluateRandomTraces(workflow, sequence, traces = 50, outDir) {
  console.log(`Evaluating random traces:`);
  console.log(`  Generating ${traces} random traces...`);
  const randomTraces = helper.generateRandomTraces(sequence, traces);
  const machine = xstate.createMachine(workflow);

  const output = [];
  for (let i = 0; i < traces; i++) {
    console.log(`  Checking trace ${i + 1} of ${traces} (${Math.round(((i + 1) / traces) * 100)}%)...`);
    const service = interpret(machine).start();

    const trace = randomTraces[i];
    let outputLine = `${i + 1};`;
    for (let j = 0; j < trace.length; j++) {
      const curr = trace[j];
      const newState = service.send(curr.event, curr.payload);
      outputLine += (JSON.stringify(newState.value) + ";");
      if (j === (trace.length - 1) && _.isEqual(newState.value, trace[trace.length - 1].next)) {
        outputLine += "COMPLETE;";
      }
    }
    service.stop();
    output.push(outputLine);
  }
  helper.writeOutputFile(outDir, `traces-n${traces}.csv`, output.join("\n"));
}

async function evaluateWorkflowDefinitionCreation(workflow, iterations = 5, outDir, factor = 1) {
  console.log(`Evaluating workflow definition deployment in ${iterations} iteration(s):`);
  let totalFinalityDuration = 0;
  let totalGasUsed = 0;
  let result;

  const output = [];
  output.push("Iteration;Non-Finality Latency;Finality Latency;Gas Cost");
  for (let i = 0; i < iterations; i++) {
    console.log(`  Performing workflow definition evaluation ${i + 1}/${iterations} (${Math.round(((i + 1) / iterations) * 100)}%)...`);
    try {
      result = await helper.createWorkflow((i % 2) + 1, workflow);
    } catch (e) {
      console.warn("    Failure:", e);
      console.warn("    Retry after 10 seconds...");
      i--;
      await helper.sleep(10000);
      continue;
    }
    const { immediateResult, finalityResult } = result;

    const gasUsed = helper.computeGasUsed(finalityResult.data, factor);
    const finalityDuration = helper.computeLatency(finalityResult.data);

    totalGasUsed += gasUsed;
    totalFinalityDuration += finalityDuration;

    output.push(`${i + 1};${immediateResult.duration};${finalityDuration};${gasUsed}`);
    if (i < (iterations - 1)) await helper.sleepForRandomBlockTime();
  }
  helper.writeOutputFile(outDir, `deployment-n${iterations}.csv`, output.join("\n"));
  console.log(`It took ${totalFinalityDuration} ms to perform ${iterations} workflow creation(s) which cost ${totalGasUsed} gas (Gwei).`);
}

async function evaluateWorkflowInstantiation(workflow, iterations = 5, outDir, factor = 1) {
  console.log(`Evaluating workflow instantiation in ${iterations} iteration(s):`);
  let totalFinalityDuration = 0;
  let totalGasUsed = 0;
  let result;

  console.log(`  Launching workflow definition...`);
  const { finalityResult: workflowDefinition } = await helper.createWorkflow(1, workflow);
  await helper.sleepForRandomBlockTime();

  const output = [];
  output.push("Iteration;Non-Finality Latency;Finality Latency;Gas Cost");
  for (let i = 0; i < iterations; i++) {
    console.log(`  Performing workflow instantiation evaluation ${i + 1}/${iterations} (${Math.round(((i + 1) / iterations) * 100)}%)...`);
    try {
      result = await helper.launchWorkflowInstance((i % 2) + 1, workflowDefinition.data.id);
    } catch (e) {
      console.warn("    Failure:", e);
      console.warn("    Retry after 10 seconds...");
      i--;
      await helper.sleep(10000);
      continue;
    }
    const { immediateResult, finalityResult } = result;

    const gasUsed = helper.computeGasUsed(finalityResult.data, factor);
    const finalityDuration = helper.computeLatency(finalityResult.data);

    totalGasUsed += gasUsed;
    totalFinalityDuration += finalityDuration;

    output.push(`${i + 1};${immediateResult.duration};${finalityDuration};${gasUsed}`);
    if (i < (iterations - 1)) await helper.sleepForRandomBlockTime();
  }
  helper.writeOutputFile(outDir, `instantiation-n${iterations}.csv`, output.join("\n"));
  console.log(`It took ${totalFinalityDuration} ms to perform ${iterations} workflow instantiation(s) which cost ${totalGasUsed} gas (Gwei).`);
}

async function evaluateWorkflowExecution(workflow, sequence, iterations = 5, outDir, factor = 1) {
  console.log(`Evaluating workflow execution in ${iterations} iteration(s):`);
  let totalFinalityDuration = 0;
  let totalGasUsed = 0;
  let result;

  console.log(`  Launching workflow definition...`);
  const { finalityResult: workflowDefinition } = await helper.createWorkflow(1, workflow);
  const workflowId = workflowDefinition.data.id;

  const output = [];
  output.push("Iteration;Step;Non-Finality Latency;Step;Finality Latency;Step;Gas Cost;Step");
  for (let i = 0; i < iterations; i++) {
    console.log(`  Performing workflow execution evaluation ${i + 1}/${iterations} (${Math.round(((i + 1) / iterations) * 100)}%)...`);
    console.log(`  Launching workflow instance...`);

    try {
      result = await helper.launchWorkflowInstance(1, workflowDefinition.data.id);
      await helper.sleepForRandomBlockTime();
    } catch (e) {
      console.warn("    Failure:", e);
      console.warn("    Retry after 10 seconds...");
      i--;
      await helper.sleep(10000);
      continue;
    }
    const instanceId = result.finalityResult.data.id;

    let sequenceGasUsed = 0;
    let sequenceFinalityDuration = 0;
    let sequenceImmediateDuration = 0;

    for (let j = 0; j < sequence.length; j++) {
      const curr = sequence[j];
      console.log(`    Step ${j + 1} of ${sequence.length}: ${curr.event}`);
      try {
        result = await helper.advanceWorkflowInstance(curr.stack, workflowId, instanceId, {
          event: curr.event,
          payload: curr.payload
        }, curr.next);
      } catch (e) {
        console.warn("    Failure:", e);
        console.warn("    Retry after 10 seconds...");
        j--;
        await helper.sleep(10000);
        continue;
      }
      const { immediateResult, finalityResult } = result;

      const gasUsed = helper.computeGasUsed(finalityResult.data, factor);
      const finalityDuration = helper.computeLatency(finalityResult.data);

      sequenceGasUsed += gasUsed;
      sequenceFinalityDuration += finalityDuration;
      sequenceImmediateDuration += immediateResult.duration;
      output.push(`;${j + 1};;${immediateResult.duration};;${finalityDuration};;${gasUsed}`);
      await helper.sleepForRandomBlockTime();
    }

    totalGasUsed += sequenceGasUsed;
    totalFinalityDuration += sequenceFinalityDuration;

    output.push(`${i + 1};;${sequenceImmediateDuration};;${sequenceFinalityDuration};;${sequenceGasUsed};`);
  }
  helper.writeOutputFile(outDir, `execution-n${iterations}.csv`, output.join("\n"));
  console.log(`It took ${totalFinalityDuration} ms to perform ${iterations} workflow execution(s) which cost ${totalGasUsed} gas (Gwei).`);
}

main();
