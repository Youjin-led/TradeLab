const { applyDynamicParams } = require('./tradelab_run_once');

function liveParamConfig(env = process.env) {
  return {
    shortTermStopMin: Number(env.LIVE_STOP_MIN) || 1.2,
    shortTermStopMax: Number(env.LIVE_STOP_MAX) || 2.5,
    shortTermTakeMax: Number(env.LIVE_TAKE_MAX) || 4.5,
    shortTermRiskMax: Number(env.LIVE_RISK_MAX) || 1.0,
    volumeMultiplier: Number(env.LIVE_VOLUME_MULTIPLIER) || 1.2,
    adxThreshold: Number(env.LIVE_ADX_THRESHOLD) || 18
  };
}

function liveParamsForCandles(candles, baseParams, config = liveParamConfig()) {
  const params = applyDynamicParams(candles, { ...baseParams });
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  params.stopPct = clamp(params.stopPct, config.shortTermStopMin, config.shortTermStopMax);
  params.takePct = clamp(params.takePct, params.stopPct * 1.8, config.shortTermTakeMax);
  params.riskPct = Math.min(params.riskPct || 0.5, config.shortTermRiskMax);
  if (params.volumeFilter) params.volumeMultiplier = config.volumeMultiplier;
  params.adxThreshold = config.adxThreshold;
  params.partialTakePct = 0;
  return params;
}

module.exports = { liveParamConfig, liveParamsForCandles };

