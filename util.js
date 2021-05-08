const ethers = require('ethers');

module.exports = {
  encodeEventTopic: function (eventTopic) {
    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(eventTopic));
  },
  encodeFunctionSignature: function (functionFragment) {
    return ethers.utils.hexDataSlice(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes(functionFragment)),
      0,
      4
    );
  },
};
