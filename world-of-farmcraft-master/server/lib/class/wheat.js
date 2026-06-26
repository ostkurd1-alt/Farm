import { getLevel, getQuality } from './crop-utils.js';

class Wheat {
  constructor(data) {
    this.type = 'wheat';
    this.drawX = 0;
    this.drawY = -28;
    this.maturated = data?.maturated;
    this.level = getLevel(data?.health, data?.maturity);
    this.quality = getQuality(data?.health);
  }
}

export default Wheat;
