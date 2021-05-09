const assert = require('assert');
const ethers = require('ethers');
const { encodeEventTopic, encodeFunctionSignature } = require('./util.js');
const provider = ethers.providers.getDefaultProvider("rinkeby");

const votingAppAbi = [
  'function getVote(uint256 _voteId) public view returns (bool open, bool executed, uint64 startDate, uint64 snapshotBlock, uint64 supportRequired, uint64 minAcceptQuorum, uint256 yea, uint256 nay, uint256 votingPower, bytes script)',
  'function newVote(bytes _executionScript, string _metadata, bool _castVote, bool _executesIfDecided) external returns (uint256 voteId)',
  'event StartVote(uint256 indexed voteId, address indexed creator, string metadata)',
];
const encodedForwardSignature = encodeFunctionSignature('forward(bytes)');
const encodedExecuteSignature = encodeFunctionSignature('execute(address,uint256,bytes)');
const encodedStartVoteTopic = encodeEventTopic('StartVote(uint256,address,string)');

const votingAppAddresses = {
  primary: '0xd192a7fa6a172e002d5bf6ea12a2c47d6a6d34c9',
  secondary: '0x307b6d0500588809a03f60a60055656731ce72a6',
};
const agentAppAddresses = {
  primary: '0x7452c80849d1b1c4e09afea81e419251ea78d475',
  secondary: '0x8d706d288a8e29b01362b44c3c2220f997574e4a',
};

// THE USER PROVIDES THESE
const proposalType = 'secondary';
const proposalIndex = '0';
// THE USER PROVIDES THESE

// Note that this function assumes the proposal was created according to the conventions
// described in make-proposal.js (only one call specified in the EVMScript, the target
// function signature is prepended to the metadata, followed by the user description).
// If it wasn't (i.e., `readProposal() throws`), the client should only say 'Nonstandard
// proposal' and display the raw metadata.
async function readProposal() {
  // Encode the proposal number
  const encodedProposalNo = ethers.utils.hexZeroPad(
    ethers.utils.hexValue(ethers.BigNumber.from(proposalIndex)),
    32
  );

  // Find the respective log. Note that we have to do this to get the proposal metadata,
  // which we will use to decode the EVMScript.
  // In the client, we should use a less specific filter to fetch the logs for multiple
  // recent proposals.
  const votingLog = (
    await provider.getLogs({
      address: votingAppAddresses[proposalType],
      fromBlock: 0,
      toBlock: 'latest',
      topics: [encodedStartVoteTopic, encodedProposalNo],
    })
  )[0];

  const votingApp = new ethers.Contract(votingAppAddresses[proposalType], votingAppAbi, provider);
  const parsedLog = votingApp.interface.parseLog(votingLog);
  // In addition to the vote creation event, we fetch the vote struct
  const vote = await votingApp.getVote(proposalIndex);
  const forwardedEvmScript = vote.script;

  // Recall that in make-proposal.js, the maker of the vote prepended the metadata with
  // the target function signature. We will recover that here. The rest of the metadata
  // will be displayed to the user.
  const metadataSeperatorIndex = parsedLog.args.metadata.indexOf(' ');
  const targetFunctionSignature = parsedLog.args.metadata.substr(0, metadataSeperatorIndex);
  const metadata = parsedLog.args.metadata.substr(metadataSeperatorIndex + 1);
  console.log(`Metadata: ${metadata}`);

  // Peel the forwarding layer. Note that all assertions in this example should also be
  // done at the client (and throw if they are not satisfied).
  assert(ethers.utils.hexDataSlice(forwardedEvmScript, 0, 4) == encodedForwardSignature);
  const evmScript = ethers.utils.defaultAbiCoder.decode(
    ['bytes'],
    ethers.utils.hexDataSlice(forwardedEvmScript, 4)
  )[0];

  // Validate EVMScript spec ID
  assert(ethers.utils.hexDataSlice(evmScript, 0, 4) == '0x00000001');
  const evmScriptPayload = ethers.utils.hexDataSlice(evmScript, 4);

  // Get the target contract address
  const readAgentAddress = ethers.utils.hexDataSlice(evmScriptPayload, 0, 20);
  assert(readAgentAddress == agentAppAddresses[proposalType]);

  const callDataLength = ethers.utils.hexDataSlice(evmScriptPayload, 20, 24);
  const callData = ethers.utils.hexDataSlice(evmScriptPayload, 24);
  const observedCallDataLength = callData.substring(2).length / 2;
  // These not being equal probably means that the maker of the vote specified
  // multiple calls in their EVMScript. We don't have to support that at the moment.
  assert(callDataLength == observedCallDataLength);

  // Peel the execution layer
  assert(ethers.utils.hexDataSlice(callData, 0, 4) == encodedExecuteSignature);
  const executionParameters = ethers.utils.defaultAbiCoder.decode(
    ['address', 'uint256', 'bytes'],
    ethers.utils.hexDataSlice(callData, 4)
  );
  const targetContractAddress = executionParameters[0];
  console.log(`Target contract address: ${targetContractAddress}`);
  // Recall that we got the signature from the log
  console.log(`Target function signature: ${targetFunctionSignature}`);
  const value = executionParameters[1];
  console.log(`Value: ${value}`);
  
  // Decode the calldata
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
