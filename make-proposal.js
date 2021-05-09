require('dotenv').config()
const ethers = require('ethers');
const { encodeFunctionSignature } = require('./util.js');
const provider = ethers.providers.getDefaultProvider("rinkeby");
const wallet = ethers.Wallet.fromMnemonic(process.env.MNEMONIC).connect(provider);

const votingAppAbi = [
  'function getVote(uint256 _voteId) public view returns (bool open, bool executed, uint64 startDate, uint64 snapshotBlock, uint64 supportRequired, uint64 minAcceptQuorum, uint256 yea, uint256 nay, uint256 votingPower, bytes script)',
  'function newVote(bytes _executionScript, string _metadata, bool _castVote, bool _executesIfDecided) external returns (uint256 voteId)',
  'event StartVote(uint256 indexed voteId, address indexed creator, string metadata)',
];
const encodedExecuteSignature = encodeFunctionSignature('execute(address,uint256,bytes)');

// The DAO uses an Agent app to make a transaction. The Voting app acts as a gateway
// for the agent app, meaning that the user needs to pass a vote to have the Agent app
// make a transaction.
// The DAO has two pairs of Agent-Voting apps. The two Voting apps have different quorum
// conditions, i.e. it is more difficult to pass votes from the primary Voting app
// (requires a higher % of votes), which means it's more difficult to have the primary
// Agent app make a transaction.
// While making a proposal or voting on one, the user needs to specify the Voting app
// (primary or secondary).
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
const targetContractAddress = '0x0E7FdA608937489f410377745dAE331d14965bB0';
const targetFunctionSignature = 'transfer(address,uint256)';
const targetValue = '123';
const targetParameters = ['0x07b589f06bD0A5324c4E2376d66d2F4F25921DE1', '456'];
const metadata = 'This is my proposal justification: www.myproposaljustification.com';
// THE USER PROVIDES THESE

async function makeProposal() {
  // Extract the parameter types from the target function signature
  const parameterTypes = targetFunctionSignature
    .substring(
      targetFunctionSignature.indexOf('(') + 1,
      targetFunctionSignature.indexOf(')')
    )
    .split(',');
  // Encode the parameters using the parameter types
  const encodedTargetParameters = ethers.utils.defaultAbiCoder.encode(
    parameterTypes,
    targetParameters
  );
  // Build the call data that the EVMScript will use
  const callData =
    encodedExecuteSignature +
    ethers.utils.defaultAbiCoder
      .encode(
        ['address', 'uint256', 'bytes'],
        [
          targetContractAddress,
          targetValue,
          encodeFunctionSignature(targetFunctionSignature) +
          encodedTargetParameters.substring(2),
        ]
      )
      .substring(2);
  // Calculate the length of the call data (in bytes) because that also goes in the EVMScript
  const callDataLengthInBytes = ethers.utils.hexZeroPad(
    ethers.BigNumber.from(callData.substring(2).length / 2).toHexString(),
    4
  );
  // See the EVMScript layout here
  // https://github.com/aragon/aragonOS/blob/f3ae59b00f73984e562df00129c925339cd069ff/contracts/evmscript/executors/CallsScript.sol#L26
  // Note that evmScripts can also be specified to execute multiple transactions. We may
  // want to support that later on.
  const evmScript =
    '0x00000001' +
    agentAppAddresses[proposalType].substring(2) +
    callDataLengthInBytes.substring(2) +
    callData.substring(2);

  const votingApp = new ethers.Contract(votingAppAddresses[proposalType], votingAppAbi, wallet);
  // Note that we're prepending `targetFunctionSignature` to the start of the metadata.
  // This is because we need the target fucntion signature to decode the EVMScript to
  // display the parameters at the client. See read-proposal.js for more details.
  // If we implement EVMScript that specifies multiple calls, we can simply prepend those
  // signatures as well (i.e., `${targetFunctionSignature1} ${targetFunctionSignature2} ${metadata}`, etc.)
  // So this convention is future-proof.
  const extendedMetadata = `${targetFunctionSignature} ${metadata}`;
  await votingApp.newVote(evmScript, extendedMetadata, true, true);
}

makeProposal();
