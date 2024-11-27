import BN from "bn.js";
import { ethers } from "ethers";
import { ZKWasmAppRpc } from "./rpc";

function bytesToHex(bytes: Array<number>): string  {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToDecimal(bytes: Array<number>): string  {
  return Array.from(bytes, byte => byte.toString().padStart(2, '0')).join('');
}

export function composeWithdrawParams(addressBN: BN, amount: bigint) {
    const addressBE = addressBN.toArray("be", 20); // 20 bytes = 160 bits and split into 4, 8, 8
    const firstLimb = BigInt('0x' + bytesToHex(addressBE.slice(0,4).reverse()));
    const sndLimb = BigInt('0x' + bytesToHex(addressBE.slice(4,12).reverse()));
    const thirdLimb = BigInt('0x' + bytesToHex(addressBE.slice(12, 20).reverse()));
    return [(firstLimb << 32n) + amount, sndLimb, thirdLimb];
}

export function decodeWithdraw(txdata: Uint8Array) {
  let r = [];
  if (txdata.length > 1) {
    for (let i = 0; i < txdata.length; i += 32) {
      let extra = txdata.slice(i, i+4);
      let address = txdata.slice(i+4, i+24);
      let amount = txdata.slice(i+24, i+32);
      let amountInWei = ethers.parseEther(bytesToDecimal(Array.from(amount)));
      r.push({
        op: extra[0],
        index: extra[1],
        address: ethers.getAddress(bytesToHex(Array.from(address))),
        amount: amountInWei,
      });
    }
    console.log(r);
  }
  return r;
}

export class PlayerConvention {
  processingKey: string;
  rpc: ZKWasmAppRpc;
  commandDeposit: bigint;
  commandWithdraw: bigint;
  constructor(key: string, rpc: ZKWasmAppRpc, commandDeposit: bigint, commandWithdraw: bigint) {
    this.processingKey = key,
    this.rpc = rpc;
    this.commandDeposit = commandDeposit;
    this.commandWithdraw = commandWithdraw;
  }

  createCommand(nonce: bigint, command: bigint, objindex: bigint) {
      return (nonce << 16n) + (objindex << 8n) + command;
  }

  async getConfig(): Promise<any> {
    let config = await this.rpc.query_config();
    return config;
  }

  async getState(): Promise<any> {
    // Get the state response
    let state = await this.rpc.queryState(this.processingKey);

    // Parse the response to ensure it is a plain JSON object
    const parsedState = JSON.parse(JSON.stringify(state));

    // Extract the data from the parsed response
    const data = JSON.parse(parsedState.data);

    return data;
  }

  async getNonce(): Promise<bigint> {
    const data = await this.getState();
    let nonce = BigInt(data.player.nonce);
    return nonce;
  }

  async deposit(pid_1:bigint, pid_2:bigint, amount:bigint) {
    let nonce = await this.getNonce();
    try {
      let finished = await this.rpc.sendTransaction(
        new BigUint64Array([this.createCommand(nonce, this.commandDeposit, 0n), pid_1, pid_2, amount]),
        this.processingKey
      );
      console.log("deposit processed at:", finished, pid_1, pid_2);
    } catch(e) {
      if(e instanceof Error) {
        console.log(e.message);
      }
      console.log("deposit error ", pid_1, pid_2);
    }
  }

  async withdrawRewards(address: string, amount: bigint) {
    let nonce = await this.getNonce();
    let addressBN = new BN(address, 16);
    let a = addressBN.toArray("be", 20); // 20 bytes = 160 bits and split into 4, 8, 8

    console.log("address is", address);
    console.log("address be is", a);

    /* bit layout
     * (32 bit amount | 32 bit highbit of address)
     * (64 bit mid bit of address (be))
     * (64 bit tail bit of address (be))
     */


    let firstLimb = BigInt('0x' + bytesToHex(a.slice(0,4).reverse()));
    let sndLimb = BigInt('0x' + bytesToHex(a.slice(4,12).reverse()));
    let thirdLimb = BigInt('0x' + bytesToHex(a.slice(12, 20).reverse()));


    console.log("first is", firstLimb);
    console.log("snd is", sndLimb);
    console.log("third is", thirdLimb);

    try {
      let processStamp = await this.rpc.sendTransaction(
        new BigUint64Array([
          this.createCommand(nonce, this.commandWithdraw, 0n),
          (firstLimb << 32n) + amount,
          sndLimb,
          thirdLimb
        ]), this.processingKey);
      console.log("withdraw rewards processed at:", processStamp);
    } catch(e) {
      if (e instanceof Error) {
        console.log(e.message);
      }
      console.log("collect reward error at address:", address);
    }
  }
}
