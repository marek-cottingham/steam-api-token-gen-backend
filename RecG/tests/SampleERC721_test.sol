// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.0 <0.9.0;
import "remix_tests.sol";
import "../contracts/RecG.sol";

contract TestRecG {

    RecG s;
    function beforeAll () public {
        s = new RecG("RecG", "RecG");
    }

    function testTokenNameAndSymbol () public {
        Assert.equal(s.name(), "RecG", "token name did not match");
        Assert.equal(s.symbol(), "RecG", "token symbol did not match");
    }
}