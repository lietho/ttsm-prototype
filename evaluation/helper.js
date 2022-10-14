const fs = require("fs");
const axios = require("axios");
const crypto = require("crypto");
const _ = require("lodash");


const blockTime = 12000;

const createDirectory = (dir) => fs.mkdirSync(dir, { recursive: true });
const writeOutputFile = (dir, fileName, content) => {
  const baseDir = "./evaluation/results";
  fs.mkdirSync(`${baseDir}/${dir}`, { recursive: true });
  fs.writeFileSync(`${baseDir}/${dir}/${fileName}`, content);
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const sleepForRandomBlockTime = () => sleep(crypto.randomInt(blockTime));
const getStackHostAddress = (stackNr) => `http://localhost:${3000 + (stackNr - 1)}/`;

const computeGasUsed = (data, factor = 1) => data.participantsAccepted
    .reduce((previousValue, currentValue) => previousValue + currentValue.commitmentReference.gasUsed, 0)
  * factor
  + data.commitmentReference.gasUsed;

const computeLatency = (data) => data.participantsAccepted
    .reduce((previousValue, currentValue) => Math.max(previousValue, currentValue.commitmentReference.finalityDuration), 0)
  + data.commitmentReference.finalityDuration;


/**
 * Shuffles array in place.
 * @see {@link https://stackoverflow.com/a/6274381/11454797}
 */
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

function generateRandomTraces(sequence = [], traces = 50) {
  const sequenceDeepClone = _.cloneDeep(sequence);
  sequenceDeepClone.forEach((curr) => curr.stack = 1);

  const result = [];
  while (result.length < traces) {
    const shuffledCopy = shuffle([...sequenceDeepClone]);
    const shuffledCopyAsString = JSON.stringify(shuffledCopy);
    const alreadyIncludes = result.findIndex((curr) => JSON.stringify(curr) === shuffledCopyAsString) >= 0;
    if (!alreadyIncludes) {
      result.push(shuffledCopy);
    }
  }
  return result;
}

async function createWorkflow(stackNr, workflow, waitForFinality = true) {
  const startTime = performance.now();
  let response = await axios.post(getStackHostAddress(stackNr) + `workflows`, {
    config: {
      optimizer: ["noop"],
      type: "STATE_CHARTS"
    },
    workflow
  });
  const endTime = performance.now();

  let result = {
    immediateResult: { data: response.data, duration: (endTime - startTime) },
    finalityResult: null
  };

  if (!waitForFinality) {
    return result;
  }

  while (response.data.commitmentReference == null || response.data.participantsAccepted?.length !== 2) {
    await sleep(5000);
    response = await getWorkflow(stackNr, response.data.id);
  }
  return { ...result, finalityResult: { data: response.data } };
}

async function getWorkflow(stackNr, workflowId) {
  return await axios.get(getStackHostAddress(stackNr) + `workflows/${workflowId}`);
}

async function launchWorkflowInstance(stackNr, workflowId, waitForFinality = true) {
  const startTime = performance.now();
  let response = await axios.post(getStackHostAddress(stackNr) + `workflows/${workflowId}/launch`);
  const endTime = performance.now();

  let result = {
    immediateResult: { data: response.data, duration: (endTime - startTime) },
    finalityResult: null
  };

  if (!waitForFinality) {
    return result;
  }

  while (response.data.commitmentReference == null || response.data.participantsAccepted?.length !== 2) {
    await sleep(5000);
    response = await getWorkflowInstance(stackNr, workflowId, response.data.id);
  }
  return { ...result, finalityResult: { data: response.data } };
}

async function getWorkflowInstance(stackNr, workflowId, instanceId) {
  return await axios.get(getStackHostAddress(stackNr) + `workflows/${workflowId}/instances/${instanceId}`);
}

async function advanceWorkflowInstance(stackNr, workflowId, instanceId, trigger, next, waitForFinality = true) {
  const startTime = performance.now();
  let response = await axios.post(getStackHostAddress(stackNr) + `workflows/${workflowId}/instances/${instanceId}/advance`, trigger);
  const endTime = performance.now();

  let result = {
    immediateResult: { data: response.data, duration: (endTime - startTime) },
    finalityResult: null
  };

  if (!waitForFinality) {
    return result;
  }

  while (
    response.data.commitmentReference == null ||
    response.data.participantsAccepted?.length !== 2 ||
    !response.data.acceptedByParticipants ||
    !response.data.acceptedByRuleServices ||
    !_.isEqual(next, response.data.currentState?.value)) {
    await sleep(5000);
    response = await getWorkflowInstance(stackNr, workflowId, response.data.id);
    console.log("      ",
      response.data.commitmentReference == null,
      response.data.participantsAccepted?.length !== 2,
      !response.data.acceptedByParticipants,
      !response.data.acceptedByRuleServices,
      !_.isEqual(next, response.data.currentState?.value),
      response.data.participantsAccepted?.length,
      next, "==", response.data.currentState?.value);
  }
  return { ...result, finalityResult: { data: response.data } };
}

module.exports = {
  blockTime,
  createDirectory,
  writeOutputFile,
  sleep,
  sleepForRandomBlockTime,
  computeGasUsed,
  computeLatency,
  shuffle,
  generateRandomTraces,
  createWorkflow,
  getWorkflow,
  launchWorkflowInstance,
  getWorkflowInstance,
  advanceWorkflowInstance
};
