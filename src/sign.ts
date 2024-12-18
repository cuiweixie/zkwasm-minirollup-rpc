import { BN } from "bn.js";
import { CurveField, Point, PrivateKey, bnToHexLe } from "delphinus-curves/src/altjubjub";
import { poseidon } from "delphinus-curves/src/poseidon"
import { Field } from 'delphinus-curves/src/field';

function bigEndianHexToBN(hexString: string) {
  // Remove the '0x' prefix if it exists
  if (hexString.startsWith('0x')) {
    hexString = hexString.slice(2);
  }

  // Ensure the hex string has an even length
  if (hexString.length % 2 !== 0) {
    hexString = '0' + hexString;
  }

  // Create a BN instance from the big-endian hex string
  return new BN(hexString, 16);
}

function littleEndianHexToBN(hexString: string) {
  // Remove the '0x' prefix if it exists
  if (hexString.startsWith('0x')) {
    hexString = hexString.slice(2);
  }

  // Ensure the hex string has an even length
  if (hexString.length % 2 !== 0) {
    hexString = '0' + hexString;
  }

  // Reverse the hex string to convert it from little-endian to big-endian
  let reversedHex = '';
  for (let i = hexString.length - 2; i >= 0; i -= 2) {
    reversedHex += hexString.slice(i, i + 2);
  }

  // Create a BN instance from the big-endian hex string
  return new BN(reversedHex, 16);
}
/*
export class beHexBN {
  hexstr: string;
  constructor(hexstr: string) {
    this.hexstr = hexstr;
  };
  toBN() {
    return bigEndianHexToBN(this.hexstr);
  }

  // big endian
  toU64Array(n: number): BigUint64Array {
    let values:BigUint64Array = new BigUint64Array(n);
    let num = BigInt("0x" + this.toBN().toString(16));
    for (let i = 0; i < n; i++) {
        let a = num % (1n<<64n);
        a = a.toArray('le', 8);
        let aHex = a.map(byte => byte.toString(16).padStart(2, '0')).join('');
        values[n-i-1] = BigInt(`0x${aHex}`);
        num = num >> 64n;
    }
    return values
  }
}
*/


export class LeHexBN {
  hexstr: string;
  constructor(hexstr: string) {
    this.hexstr = hexstr;
  };
  toBN() {
    return littleEndianHexToBN(this.hexstr);
  }

  // little endian
  toU64Array(s: number = 4): BigUint64Array {
    let len = s;
    let values:BigUint64Array = new BigUint64Array(len);
    let num = BigInt("0x" + this.toBN().toString(16));
    for (let i = 0; i < len; i++) {
        values[i] = num % (1n<<64n);
        num = num >> 64n;
    }
    return values
  }
}

// This is subtl as the Point library is using BN while we prefer use BigInt
export function verifySign(msg: LeHexBN, pkx: LeHexBN, pky: LeHexBN, rx:LeHexBN, ry:LeHexBN, s:LeHexBN): boolean {
  let l = Point.base.mul(s.toBN());
  let pkey = new Point(pkx.toBN(), pky.toBN());
  let r = (new Point(rx.toBN(), ry.toBN())).add(pkey.mul(msg.toBN()))
  const negr  = new Point(r.x.neg(), r.y);
  return (l.add(negr).isZero());
}

// signning a [u64; 4] message with private key
export function sign(cmd: BigUint64Array, prikey: string) {
  let pkey = PrivateKey.fromString(prikey);
  let r = pkey.r();
  let R = Point.base.mul(r);
  let H;
  let fvalues = [];
  if (cmd.length == 4) {
    H = cmd[0] + (cmd[1] << 64n) + (cmd[2] << 128n) + (cmd[3] << 192n);
  } else {
    for (let i=0; i<cmd.length;) {
      let v = 0n;
      let j = 0;
      for (;j<3;j++) {
        if (i+j<cmd.length) {
          v = v + cmd[i+j] << (64n * BigInt(j));
        }
      }
      i = i + j;
      fvalues.push(new Field(new BN(v.toString(10), 10)));
    }
    H = poseidon(fvalues).v;
  }
  let hbn = new BN(H!.toString(10));
  let S = r.add(pkey.key.mul(new CurveField(hbn)));
  let pubkey = pkey.publicKey;
  const data = {
    msg: bnToHexLe(hbn),
    pkx: bnToHexLe(pubkey.key.x.v),
    pky: bnToHexLe(pubkey.key.y.v),
    sigx: bnToHexLe(R.x.v),
    sigy: bnToHexLe(R.y.v),
    sigr: bnToHexLe(S.v),
  };
  return data;
}

// prikey is a string that reprents a bignumber in decimal 
export function query(prikey: string) {
  let pkey = PrivateKey.fromString(prikey);
  let pubkey = pkey.publicKey;
  const data = {
    pkx: bnToHexLe(pubkey.key.x.v),
  };
  console.log(data);
  return data;
}
