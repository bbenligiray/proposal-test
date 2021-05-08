const assert = require('assert');
const ethers = require('ethers');
const { encodeEventTopic, encodeFunctionSignature } = require('./util.js');
const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:1248');

const encodedForwardSignature = encodeFunctionSignature('forward(bytes)');
const encodedExecuteSignature = encodeFunctionSignature('execute(address,uint256,bytes)');
const encodedStartVoteTopic = encodeEventTopic('StartVote(uint256,address,string)');

const votingApp1Address = '0xd192a7fa6a172e002d5bf6ea12a2c47d6a6d34c9';
const votingApp2Address = '0x307b6d0500588809a03f60a60055656731ce72a6';
const agentApp1Address = '0x7452c80849d1b1c4e09afea81e419251ea78d475';
const agentApp2Address = '0x8d706d288a8e29b01362b44c3c2220f997574e4a';

const proposalIndex = '0';

async function readProposal() {
  // Encode the proposal number
  const encodedProposalNo = ethers.utils.hexZeroPad(
    ethers.utils.hexValue(ethers.BigNumber.from(proposalIndex)),
    32
  );
  // Find the respective log
  const votingLog = (
    await provider.getLogs({
      address: votingApp2Address,
      fromBlock: 0,
      toBlock: 'latest',
      topics: [encodedStartVoteTopic, encodedProposalNo],
    })
  )[0];

  const votingAppAbi = [
    'function getVote(uint256 _voteId) public view returns (bool open, bool executed, uint64 startDate, uint64 snapshotBlock, uint64 supportRequired, uint64 minAcceptQuorum, uint256 yea, uint256 nay, uint256 votingPower, bytes script)',
    'function newVote(bytes _executionScript, string _metadata, bool _castVote, bool _executesIfDecided) external returns (uint256 voteId)',
    'event StartVote(uint256 indexed voteId, address indexed creator, string metadata)',
  ];
  const votingApp2 = new ethers.Contract(votingApp2Address, votingAppAbi, provider);
  const parsedLog = votingApp2.interface.parseLog(votingLog);
  const vote = await votingApp2.getVote(proposalIndex);
  const forwardedEvmScript = vote.script;

  // We expect the proposal maker to add the function signature at the beginning of the metadata
  const metaDataSeperatorIndex = parsedLog.args.metadata.indexOf(" ");
  const targetFunctionSignature = parsedLog.args.metadata.substr(0, metaDataSeperatorIndex);
  const metaData = parsedLog.args.metadata.substr(metaDataSeperatorIndex + 1);
  console.log(`Proposal description: ${metaData}`);

  // Peel the forwarding layer
  assert(ethers.utils.hexDataSlice(forwardedEvmScript, 0, 4) == encodedForwardSignature);
  const evmScript = ethers.utils.defaultAbiCoder.decode(
    ["bytes"],
    ethers.utils.hexDataSlice(forwardedEvmScript, 4)
  )[0];

  // Validate EVMScript spec ID
  assert(ethers.utils.hexDataSlice(evmScript, 0, 4) == '0x00000001');
  const evmScriptPayload = ethers.utils.hexDataSlice(evmScript, 4);

  // Get the target contract address
  const readAgentAddress = ethers.utils.hexDataSlice(evmScriptPayload, 0, 20);
  assert(readAgentAddress == agentApp2Address);

  const callDataLength = ethers.utils.hexDataSlice(evmScriptPayload, 20, 24);
  const callData = ethers.utils.hexDataSlice(evmScriptPayload, 24);
  const observedCallDataLength = callData.substring(2).length / 2;
  // These not being equal means the proposal maker specified multiple calls in their EVMScript
  // We don't support that at the moment
  assert(callDataLength == observedCallDataLength);

  // Peel the execution layer
  assert(ethers.utils.hexDataSlice(callData, 0, 4) == encodedExecuteSignature);
  const executionParameters = ethers.utils.defaultAbiCoder.decode(
    ["address", "uint256", "bytes"],
    ethers.utils.hexDataSlice(callData, 4)
  );
  const targetContractAddress = executionParameters[0];
  console.log(`Target contract address: ${targetContractAddress}`);
  console.log(`Target function signature: ${targetFunctionSignature}`);
  const value = executionParameters[1];
  console.log(`Value: ${value}`);
  
  // Unpack the calldata
  const targetCallData = executionParameters[2];
  assert(ethers.utils.hexDataSlice(targetCallData, 0, 4) == encodeFunctionSignature(targetFunctionSignature));
  const parameterTypes = targetFunctionSignature
    .substring(
      targetFunctionSignature.indexOf('(') + 1,
      targetFunctionSignature.indexOf(')')
    )
    .split(',');
  const parameters = ethers.utils.defaultAbiCoder.decode(parameterTypes, ethers.utils.hexDataSlice(targetCallData, 4));
  console.log(`Parameters: ${parameters}`);
}

readProposal();
