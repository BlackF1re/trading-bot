import { StonApiClient } from "@ston-fi/api";
import { bigintOrZero, pick } from "../helpers.mjs";

// STON.fi's current API accepts "ton" for the native asset. Since June 15,
// 2026 the native token is displayed as Gram (GRAM); the chain/API identifiers
// remain TON for backward compatibility.
export const STON_NATIVE_ADDRESS = "ton";

export class StonDex {
  constructor({ usdtMaster, slippageTolerance }) {
    this.name = "STON";
    this.usdtMaster = usdtMaster;
    this.slippageTolerance = slippageTolerance;
    this.client = new StonApiClient();
  }

  assetAddress(symbol) {
    if (symbol === "GRAM") return STON_NATIVE_ADDRESS;
    if (symbol === "USDT") return this.usdtMaster;
    throw new Error(`STON: unsupported asset ${symbol}`);
  }

  async quote({ from, to, amountUnits }) {
    if (from === to) throw new Error("STON: offer and ask assets must differ");
    if (amountUnits <= 0n) throw new Error("STON: amountUnits must be positive");

    const started = Date.now();
    const result = await this.client.simulateSwap({
      offerAddress: this.assetAddress(from),
      offerUnits: amountUnits.toString(),
      askAddress: this.assetAddress(to),
      slippageTolerance: this.slippageTolerance,
    });

    const amountOutRaw = pick(result, "askUnits", "ask_units");
    if (amountOutRaw === undefined) {
      throw new Error("STON simulation returned no askUnits");
    }

    return {
      dex: this.name,
      from,
      to,
      amountInUnits: amountUnits,
      amountOutUnits: BigInt(amountOutRaw),
      feeUnits: bigintOrZero(pick(result, "feeUnits", "fee_units")),
      feePercent: pick(result, "feePercent", "fee_percent") ?? null,
      priceImpact: pick(result, "priceImpact", "price_impact") ?? null,
      swapRate: pick(result, "swapRate", "swap_rate") ?? null,
      minAskUnits: bigintOrZero(pick(result, "minAskUnits", "min_ask_units")),
      poolAddress: pick(result, "poolAddress", "pool_address") ?? "",
      recommendedSlippageTolerance:
        pick(result, "recommendedSlippageTolerance", "recommended_slippage_tolerance") ?? null,
      latencyMs: Date.now() - started,
    };
  }
}
