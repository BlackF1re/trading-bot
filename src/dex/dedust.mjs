import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { TonClient4 } = require("@ton/ton");
const { Address } = require("@ton/core");
const { Asset, Factory, MAINNET_FACTORY_ADDR, PoolType, ReadinessStatus } = require("@dedust/sdk");

export class DeDustDex {
  constructor({ usdtMaster, endpoint }) {
    this.name = "DEDUST";
    this.usdtMaster = usdtMaster;
    this.endpoint = endpoint;
    this.client = null;
    this.pool = null;
    this.assets = null;
  }

  async init() {
    this.client = new TonClient4({ endpoint: this.endpoint });
    const factory = this.client.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));
    const gram = Asset.native();
    const usdt = Asset.jetton(Address.parse(this.usdtMaster));
    const poolContract = await factory.getPool(PoolType.VOLATILE, [gram, usdt]);

    this.pool = this.client.open(poolContract);
    this.assets = { GRAM: gram, USDT: usdt };

    const status = await this.pool.getReadinessStatus();
    if (status !== ReadinessStatus.READY) {
      throw new Error(`DeDust native GRAM/USDT volatile pool is not READY (status=${status})`);
    }
  }

  async quote({ from, to, amountUnits }) {
    if (!this.pool) throw new Error("DeDustDex.init() must be called before quote()");
    if (!this.assets[from] || !this.assets[to]) throw new Error(`DeDust: unsupported pair ${from}/${to}`);
    if (from === to) throw new Error("DeDust: offer and ask assets must differ");
    if (amountUnits <= 0n) throw new Error("DeDust: amountUnits must be positive");

    const started = Date.now();
    const result = await this.pool.getEstimatedSwapOut({
      assetIn: this.assets[from],
      amountIn: amountUnits,
    });

    if (result?.amountOut === undefined || BigInt(result.amountOut) <= 0n) {
      throw new Error("DeDust estimate_swap_out returned no positive amountOut");
    }

    return {
      dex: this.name,
      from,
      to,
      amountInUnits: amountUnits,
      amountOutUnits: BigInt(result.amountOut),
      feeUnits: BigInt(result.tradeFee ?? 0n),
      feePercent: null,
      priceImpact: null,
      swapRate: null,
      minAskUnits: 0n,
      poolAddress: poolAddressString(this.pool),
      recommendedSlippageTolerance: null,
      latencyMs: Date.now() - started,
    };
  }
}

function poolAddressString(pool) {
  try {
    return pool.address?.toString?.() ?? "";
  } catch {
    return "";
  }
}
