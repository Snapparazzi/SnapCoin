const SNPCToken = artifacts.require('./SNPCToken.sol');
export = function(deployer: any) {
  // Set unlimited synchronization timeout
  (<any>SNPCToken).constructor.synchronization_timeout = 0;
  deployer.deploy(SNPCToken, '735e6', '44.1e6', '36.75e6', '22.05e6', '73.5e6', '44.1e6');
};
