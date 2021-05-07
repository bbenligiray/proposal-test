require('dotenv').config()
const ethers = require('ethers');
const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:1248');
const wallet = ethers.Wallet.fromMnemonic(process.env.MNEMONIC).connect(provider);

function encodeFunctionSignature(functionFragment) {
  return ethers.utils.hexDataSlice(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(functionFragment)), 0, 4);
}

const votingApp1Address = '0xd192a7fa6a172e002d5bf6ea12a2c47d6a6d34c9';
const votingApp2Address = '0x307b6d0500588809a03f60a60055656731ce72a6';
const agentApp1Address = '0x7452c80849d1b1c4e09afea81e419251ea78d475';
const agentApp2Address = '0x8d706d288a8e29b01362b44c3c2220f997574e4a';

const encodedForwardSignature = encodeFunctionSignature('forward(bytes)');
const encodedExecuteSignature = encodeFunctionSignature('execute(address,uint256,bytes)')

const targetContractAddress = '0x0E7FdA608937489f410377745dAE331d14965bB0';
const targetFunctionSignature = 'transfer(address,uint256)'
const targetValue = '123';
const targetParamters = ['0x07b589f06bD0A5324c4E2376d66d2F4F25921DE1', '456'];
const metaData = "www.myproposaljustification.com";

async function main() {
  const encodedTargetFunctionSignature = encodeFunctionSignature(targetFunctionSignature);
  const encodedTargetParameters = ethers.utils.defaultAbiCoder.encode(targetFunctionSignature.substring(targetFunctionSignature.indexOf('(') + 1, targetFunctionSignature.indexOf(')')).split(','), targetParamters);
  const executeCallData = encodedExecuteSignature + ethers.utils.defaultAbiCoder.encode(["address", "uint256", "bytes"], [targetContractAddress, targetValue, encodedTargetFunctionSignature + encodedTargetParameters.substring(2)]).substring(2);

  const emvScriptSpecId = '0x00000001';
  const executeCallDataBytesLength = ethers.utils.hexZeroPad(ethers.BigNumber.from(executeCallData.substring(2).length / 2).toHexString(), 4);
  const forwardEvmScript = encodedForwardSignature + ethers.utils.defaultAbiCoder.encode(['bytes'], [emvScriptSpecId + agentApp2Address.substring(2) + executeCallDataBytesLength.substring(2) + executeCallData.substring(2)]).substring(2);

  const votingAppAbi = [
    //"function newVote(bytes _executionScript, string _metadata) external returns (uint256 voteId)",
    "function newVote(bytes _executionScript, string _metadata, bool _castVote, bool _executesIfDecided) external returns (uint256 voteId)"
  ];
  const votingApp2 = new ethers.Contract(votingApp2Address, votingAppAbi, wallet);
  await votingApp2.newVote(forwardEvmScript, `${targetFunctionSignature} ${metaData}`, true, true, { gasLimit: 1000000 });
}

main();