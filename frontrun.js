/**
 * Perform a front-running attack on pancakeSwap
*/
//const fs = require('fs');
var Web3 = require('web3');
var abiDecoder = require('abi-decoder');
var colors = require("colors");
var Tx = require('ethereumjs-tx').Transaction;
var axios = require('axios');
var BigNumber = require('big-number');

const {NETWORK, PANCAKE_ROUTER_ADDRESS, PANCAKE_FACTORY_ADDRESS, PANCAKE_ROUTER_ABI, PANCAKE_FACTORY_ABI, PANCAKE_POOL_ABI, HTTP_PROVIDER_LINK, WEBSOCKET_PROVIDER_LINK, HTTP_PROVIDER_LINK_TEST} = require('./constants.js');
const {setBotAddress, getBotAddress, FRONT_BOT_ADDRESS, botABI} = require('./bot.js');
const {PRIVATE_KEY, TOKEN_ADDRESS, AMOUNT, LEVEL} = require('./env.js');

const INPUT_TOKEN_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const WBNB_TOKEN_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

const { Console } = require("console");
const fs = require("fs");
const myLogger = new Console({
  stdout: fs.createWriteStream("normalStdout.txt"),
  stderr: fs.createWriteStream("errStdErr.txt"),
});

var input_token_info;
var out_token_info;
var pool_info;
var gas_price_info;
var TxCount;

var web3;
var web3Ts;
var web3Ws;
var pancakeRouter;
var pancakeFactory;

// one gwei
const ONE_GWEI = 1e9;

var buyer_input_amount = 10 * (10**18); //10WBNB
var pairCount = 50000;

async function createWeb3(){
    try {
        web3 = new Web3(new Web3.providers.HttpProvider(HTTP_PROVIDER_LINK));
        web3Ts = new Web3(new Web3.providers.HttpProvider(HTTP_PROVIDER_LINK_TEST));
        web3Ws = new Web3(new Web3.providers.WebsocketProvider(WEBSOCKET_PROVIDER_LINK));
        pancakeRouter = new web3.eth.Contract(PANCAKE_ROUTER_ABI, PANCAKE_ROUTER_ADDRESS);
        pancakeFactory = new web3.eth.Contract(PANCAKE_FACTORY_ABI, PANCAKE_FACTORY_ADDRESS);
        abiDecoder.addABI(PANCAKE_ROUTER_ABI);

        return true;
    } catch (error) {
      console.log(error);
      return false;
    }
}

async function main() {

    if (await createWeb3() == false) {
        console.log('Web3 Create Error'.yellow);
        process.exit();
    }
    
    // const out_token_address = TOKEN_ADDRESS;
    const amount = AMOUNT;
    const level = LEVEL;
    
    ret = await searchPairs(); 
    if(ret == false) {
        console.log("start to search next pair")
        main();
        return;
    }

    await updatePoolInfo();
    
    // this calculation is based on buyer use "swapExactETHForTokens" method
    log_str = '***** assume I frontrun ' + amount + "WBNB" + '*****' + "buyer purchase " + buyer_input_amount/(10**18) + "WBNB";
    console.log(log_str.green);    
    // console.log(web3Ws);
    // web3Ws.onopen = function(evt) {
    //     // web3Ws.send(JSON.stringify({ method: "subscribe", topic: "transfers", address: user_wallet.address }));
    //     console.log('connected')
    // }

    let amountBigNumber = amount*(10**18);
    let meFrontrunOutputAmount = await pancakeRouter.methods.getAmountOut(amountBigNumber.toString(), pool_info.input_volumn.toString(), pool_info.output_volumn.toString()).call();
    // console.log("meFrontrunOutputAmount:" + meFrontrunOutputAmount);
    // new pool reserves after I frontrun 
    let poolNewInputReserve = findSum(pool_info.input_volumn.toString(), amountBigNumber.toString()); 
    let poolNewOutputReserve = longDivision(pool_info.klast.toString(), poolNewInputReserve.toString());
    // console.log(poolNewInputReserve + "." + pool_info.klast);

    // new pool reserves after buyer made the purchase of WBNB
    let newInputReserve = findSum(poolNewInputReserve.toString(), buyer_input_amount.toString());
    let newOutputReserve = longDivision(pool_info.klast.toString(), newInputReserve.toString());
    // console.log(newInputReserve + "." + newOutputReserve);

    // me backrun after buyer complete the purchase of WBNB
    let meBackrunOutputAmount = await pancakeRouter.methods.getAmountOut(meFrontrunOutputAmount.toString(), newOutputReserve.toString(), newInputReserve.toString()).call();
    // console.log(meBackrunOutputAmount);
    // calculate gas costs of the transactions
    let TxGasPrice = 50*ONE_GWEI;
    let TxGasCost = TxGasPrice * 500000 * 2;
    // console.log(TxGasCost);

    // calculate profits
    let profitCalc = parseInt(meBackrunOutputAmount) - parseInt(amountBigNumber) - parseInt(TxGasCost);
    // console.log(profitCalc);
    let profit_est = profitCalc / (10**18);
    console.log("Profit: " + profit_est);
    // process.exit();
    if (profit_est >= 0.005)
    {
        console.log("Pair recorded");
        myLogger.log("**************************** PAIR #" + pairCount + "  *******************************");
        myLogger.log("Pair Name: " + input_token_info.symbol + '-'+ out_token_info.symbol +" pair ");
        myLogger.log("Pair Contract Address: " + pool_info.address);
        myLogger.log("WBNB Reserve: " + pool_info.input_volumn/(10**18));
        myLogger.log("Daily Transactions Count: " + TxCount);
        myLogger.log(log_str);
        myLogger.log("My Estimated Profit: " + profit_est);
        main();
        return;
    }
    console.log("Profit does not meet critia, search for next pair");
    main();
    return;
}

function findDiff(str1,str2)
{
    let str = "";
    let n1 = str1.length, n2 = str2.length;
    str1 = str1.split("").reverse().join("")
    str2 = str2.split("").reverse().join("")
    let carry = 0;
    for (let i = 0; i < n2; i++)
    {
        let sub
            = ((str1[i].charCodeAt(0) -
            '0'.charCodeAt(0))
               - (str2[i].charCodeAt(0) -
               '0'.charCodeAt(0)) - carry);

        if (sub < 0) {
            sub = sub + 10;
            carry = 1;
        }
        else
            carry = 0;

        str += String.fromCharCode(sub +
        '0'.charCodeAt(0));
    }

    for (let i = n2; i < n1; i++) {
        let sub = ((str1[i].charCodeAt(0) -
        '0'.charCodeAt(0)) - carry);

        if (sub < 0) {
            sub = sub + 10;
            carry = 1;
        }
        else
            carry = 0;

        str += String.fromCharCode(sub +
        '0'.charCodeAt(0));
    }
    return str.split("").reverse().join("")
}

function findSum(first, second) {
	var sum = '';
	var carry = 0;
	var diff = second.length - first.length;
	for (i = first.length - 1; i >= 0; i--) {
		var temp =
			(Number(first.charAt(i)) % 10) +
			(Number(second.charAt(i + diff)) % 10) +
			carry;
		if (temp >= 10) {
			sum = (temp % 10) + sum;
			carry = Math.floor(temp / 10);
		} else {
			sum = temp + sum;
			carry = 0;
		}
	}
	if (carry) {
		sum = carry + sum;
	}
	return sum;
}

function longDivision(number,divisor)
{
    let ans="";
    let idx = 0;
      let temp=number[idx]-'0';
    while (temp < divisor)
    {
        temp = (temp * 10 +
        (number[idx + 1]).charCodeAt(0) -
               ('0').charCodeAt(0));
        idx += 1;
    }
    idx += 1;
     
    while(number.length>idx)
    {
        // Store result in answer i.e. temp / divisor
        ans += String.fromCharCode
        (Math.floor(temp / divisor) +
        ('0').charCodeAt(0));
       
        // Take next digit of number
        temp = ((temp % divisor) * 10 +
        (number[idx]).charCodeAt(0) -
              ('0').charCodeAt(0));
        idx += 1;
    }
     
    ans += String.fromCharCode
    (Math.floor(temp / divisor) +
    ('0').charCodeAt(0));
     
    //If divisor is greater than number
    if(ans.length==0)
        return "0";
    //else return ans
    return ans;
}

async function getCurrentGasPrices() {
    return {low: 20, medium: 20, high:50};
}

async function updatePoolInfo() {
    try{

        var reserves = await pool_info.contract.methods.getReserves().call();
        var kLast = await pool_info.contract.methods.kLast().call(); 

        if(pool_info.forward) {
            var eth_balance = reserves[0];
            var token_balance = reserves[1];
        } else {
            var eth_balance = reserves[1];
            var token_balance = reserves[0];
        }

        pool_info.input_volumn = eth_balance;
        pool_info.output_volumn = token_balance;
        pool_info.attack_volumn = eth_balance * (pool_info.attack_level/100); 
        pool_info.klast = kLast;

    }catch (error) {
      
        console.log('Failed To Update Pair Info'.yellow);

        return false;
    }
}

async function getPoolInfo(){

    // var log_str = '*****\t' + input_token_info.symbol + '-' + out_token_info.symbol + ' Pair Pool Info\t*****'
    // console.log(log_str.green);

    try{
        var allPairsLength = await pancakeFactory.methods.allPairsLength().call();
        console.log(allPairsLength);
        if (pairCount > allPairsLength)
        {
            console.log("Pair search finished");
            process.exit();
        }
        console.log(pairCount);
        var pool_address = await pancakeFactory.methods.allPairs(pairCount).call();
        pairCount++
        if(pool_address == '0x0000000000000000000000000000000000000000')
        {
            log_str = "Pool address is invalid";
            console.log(log_str.yellow);
            return false;
        }   

        var log_str = 'Address:\t' + pool_address;
        console.log(log_str.white);

        var pool_contract = new web3.eth.Contract(PANCAKE_POOL_ABI, pool_address);
        var reserves = await pool_contract.methods.getReserves().call();

        var token0_address = await pool_contract.methods.token0().call();
        var token1_address = await pool_contract.methods.token1().call();

        var kLast = await pool_contract.methods.kLast().call();

        if(token0_address == INPUT_TOKEN_ADDRESS)
        {
            var forward = true;
            var bnb_balance = reserves[0];
            var token_balance = reserves[1];
            var out_token_address = token1_address;
        } else if (token1_address == INPUT_TOKEN_ADDRESS)
        {
            var forward = false;
            var bnb_balance = reserves[1];
            var token_balance = reserves[0];
            var out_token_address = token0_address;
        } else {
            console.log("No WBNB in the pair");
            return false;
        }

        // set WBNB reserve critia
        // if ((bnb_balance / (10**18)) < 350 || (bnb_balance / (10**18)) > 1000)
        if ((bnb_balance / (10**18)) < 350)
        {
            console.log("WBNB reserve does not meet critia");
            return false;
        }

        let endblock = await web3.eth.getBlockNumber();
        let startblock = endblock - 28750;
        // console.log(endblock);
        
        const lp_token_info = 'https://api.bscscan.com/api?module=logs&action=getLogs&fromBlock='+startblock+'&toBlock='+endblock+'&address='+pool_address+'&topic0=0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822&apikey=XIBZM1NWU7ABRB142CJJD6A8NIT8EQBYPB';
        
        TxCount = await getLpTokenTxInfo(lp_token_info);
        if(TxCount == false)
        {
            return false;
        } else if(TxCount < 500)
        {
            console.log("Daily transactions does not meet minimum critia 500 per day")
            return false;
        } else {
            console.log("Day transactions count: " + TxCount);
        }

        // find out_token_info
        const OUT_TOKEN_ABI_REQ = 'https://api.bscscan.com/api?module=contract&action=getabi&address='+out_token_address+'&apikey=XIBZM1NWU7ABRB142CJJD6A8NIT8EQBYPB';
        out_token_info = await getTokenInfo(out_token_address, OUT_TOKEN_ABI_REQ);
        // if (out_token_info == null){
        //     return false;
        // }
        

        var log_str = (bnb_balance/(10**input_token_info.decimals)).toFixed(5) + '\t' + input_token_info.symbol;
        console.log(log_str.white);

        var log_str = (token_balance/(10**out_token_info.decimals)).toFixed(5) + '\t' + out_token_info.symbol;
        console.log(log_str.white);

        pool_info = {'address': pool_address, 'klast': kLast, 'contract': pool_contract, 'forward': forward, 'input_volumn': bnb_balance, 'output_volumn': token_balance}
        // console.log("Pool_info length" + Object.keys(pool_info).length); //return object length
        return true;

    }catch(error){
        console.log("Pool is not available");
        return false;
    }
}

async function getLpTokenTxInfo(lp_token_info) {
    try{
        let response = await axios.get(lp_token_info);
        if(response.data.status==0)
        {
            console.log('Unable to read Transaction logs OR No transactions log found');
            return false;
        }   
        console.log("Token Transaction logs got");
        var lp_token_Tx_info = response.data.result;
        console.log(lp_token_Tx_info);

        let transactionCount = Object.values(lp_token_Tx_info).length;
        console.log("Daily Transaction count: " + transactionCount); 
        return transactionCount;

    }catch(error){
        console.log('ERROR: Unable to read LP Token Transaction logs');
        return false;
    }
}

async function getBNBInfo(user_wallet){
    // var balance = await web3.eth.getBalance(user_wallet.address);
    var decimals = 18;
    var symbol = 'BNB';

    return {'address': WBNB_TOKEN_ADDRESS, 'symbol': symbol, 'decimals': decimals, 'abi': null, 'token_contract': null}
}

async function getTokenInfo(tokenAddr, token_abi_ask) {
    try{
        //get token abi
        var response = await axios.get(token_abi_ask);
        if(response.data.status==0)
        {
            console.log('Invalid Token Address !')   
            return null;
        }   
        console.log("token got");
        var token_abi = response.data.result;

        //get token info
        var token_contract = new web3.eth.Contract(JSON.parse(token_abi), tokenAddr);
        // console.log(token_contract);
        
        // var balance = await token_contract.methods.balanceOf(user_wallet.address).call();
        var decimals = await token_contract.methods.decimals().call();
        var symbol =  await token_contract.methods.symbol().call();

        return {'address': tokenAddr, 'symbol': symbol, 'decimals': decimals, 'abi': token_abi, 'token_contract': token_contract}
    }catch(error){
        console.log('Unable to read Token Info, may due to be a Proxy Smart contract');
        return false;
    }
}

async function searchPairs()
{
    input_token_info = await getBNBInfo();
    //out token balance 
    
    //check pool info and find out token info
    if(await getPoolInfo() == false){
        return false;
    }
    
    gas_price_info = await getCurrentGasPrices();

    log_str = '=================== Prepared to attack '+ input_token_info.symbol + '-'+ out_token_info.symbol +' pair ==================='
    console.log(log_str.red);

    return true;
}

main();

